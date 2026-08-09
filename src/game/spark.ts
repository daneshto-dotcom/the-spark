/**
 * SPARK — free spark entity.
 * Discriminated union per locked-decisions § 10:
 *   Free    → in spawner zone, mouse-pickable
 *   Carried → held by a player (carry-1)
 *   Bonded  → committed to a structure (becomes a Primitive)
 *
 * Session 1 only constructs Free sparks; Sessions 2-3 narrow on `kind`.
 */

import { SparkType, SPARK_VISUAL_SIZE } from '../constants.ts';
import type { SparkId, PlayerId, PrimitiveId, Vec2 } from '../types.ts';
import { v2copy } from '../types.ts';

export type SparkState =
  | { readonly kind: 'Free' }
  | { readonly kind: 'Carried'; readonly carrierId: PlayerId }
  | { readonly kind: 'Bonded'; readonly primitiveId: PrimitiveId };

/**
 * A free-floating spark in the spawner zone (or transitioning out of it).
 * `pos` and `prevPos` are mutated each substep by Verlet integration.
 * `radius` is the soft-collision radius (NOT the visual size).
 */
export interface Spark {
  readonly id: SparkId;
  readonly type: SparkType;
  pos: Vec2;
  prevPos: Vec2;
  readonly radius: number;
  /**
   * Tick the spark entered the Free pool. Drives both the count-cap eviction order
   * (oldest-first) and the S109 P1 10s TTL reap. MUTABLE: applyDropSpark re-stamps it
   * to world.tick so a spark dropped after a long carry gets a fresh 10s window instead
   * of being reaped on the very next tick.
   */
  createdTick: number;
  state: SparkState;
  /**
   * S77 P3 — "poopy" debuff: tick until which a seagull-pooped spark moves at half speed
   * ("cruiser speed"). undefined / past = not poopy (self-heals at expiry). Drives the
   * carry-follow slow (the meaningful case — free sparks settle) + the brown render tint.
   * Additive-optional on the wire so clients render the tint.
   */
  poopyUntilTick?: number;
  /**
   * V6-1.2 — GATHERER ESCROW. A spark under escrow is still `Free` (so the player grabs a banked one
   * through the EXISTING pickup path — no parallel mechanic, B6-compliant), but it is exempt from
   * the three forces that would otherwise destroy the haul loop:
   *   'hauled' — a gatherer is carrying it; its pos is slaved to the gatherer each tick.
   *   'banked' — deposited at its owner's keep, waiting for the player to build with it.
   * ⚠ THE EXEMPTIONS ARE LOAD-BEARING, not polish. Without them: `reapExpiredFreeSparks` deletes the
   * shape mid-carry at the 10 s TTL, `enforceFreeSparkCap` can evict it as "oldest", and
   * `enforceSpawnerBounds` rim-snaps it straight back into the spawn disc the moment the gatherer
   * carries it past the boundary. Additive-optional on the wire; undefined = an ordinary free spark.
   */
  escrow?: 'hauled' | 'banked';
}

const SPARK_BASE_RADIUS = 9;

export function makeFreeSpark(args: {
  id: SparkId;
  type: SparkType;
  pos: Vec2;
  velocity: Vec2;
  dt: number;
  createdTick: number;
}): Spark {
  // Verlet bootstrap: prevPos encodes initial velocity via (pos - velocity * dt).
  const prevPos = {
    x: args.pos.x - args.velocity.x * args.dt,
    y: args.pos.y - args.velocity.y * args.dt,
  };
  return {
    id: args.id,
    type: args.type,
    pos: v2copy(args.pos),
    prevPos,
    radius: Math.max(SPARK_BASE_RADIUS, SPARK_VISUAL_SIZE[args.type] * 0.45),
    createdTick: args.createdTick,
    state: { kind: 'Free' },
  };
}

