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
  readonly createdTick: number;
  state: SparkState;
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

