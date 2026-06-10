/**
 * SPARK — S77 P3 seagull + poop lifecycle reducers.
 *
 * Mirrors hunters/hunterLifecycle.ts: pure case-body helpers consumed by world.ts dispatch.
 * All actions are HOST-INTERNAL (none are client INTENTs — the seagull is host-authored +
 * snapshot-replicated). Cleaning is host-DETECTED (avatar proximity), not a client intent.
 *
 *   SPAWN_SEAGULL — minted by the spawner cadence (main.ts dispatch from the out-array,
 *                   gated SEAGULL_MAX_ACTIVE). Carries the edge pos + horizontal vx.
 *   SEAGULL_TICK  — advance one frame (LINEAR sim: pos.x += vx); drop a poop on the FIXED
 *                   POOP_DROP_INTERVAL_TICKS (no RNG); despawn when off-screen. Fanned out
 *                   per gull in main.ts (host-only).
 *   POOP_TICK     — fall; on contact FOUL the hit primitive's whole connected structure
 *                   (component) → world.fouledPrimitives (tickScoring zeroes that structure's
 *                   income) OR slow a free spark ("poopy", half-speed 15s); floor → ground
 *                   splat (TTL). Fanned out per poop in main.ts.
 *   CLEAN_POOP    — remove a structure-splat + UNFOUL its whole component (the structure
 *                   OWNER's avatar within POOP_CLEAN_RADIUS — host-detected in main.ts via
 *                   canAvatarCleanSplat; S81 P1: enemies can no longer wipe your splat for
 *                   you. The reducer itself stays owner-agnostic; dispatchable for tests).
 *
 * Determinism: LINEAR flight + FIXED-interval drops (no RNG); collision uses squared-distance
 * + LOWEST-id hit selection (S80 — allocation-free equivalent of the original sorted-id
 * first-hit; identical pick, locked by a differential test); component foul/clean BFS
 * returns sorted ids.
 * Host-authoritative — clients receive seagulls[]/poops[] in the next NetSnapshot + never simulate.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  POOP_CLEAN_RADIUS,
  POOP_DROP_INTERVAL_TICKS,
  POOP_FALL_SPEED,
  POOP_GROUND_TTL_TICKS,
  POOP_HIT_RADIUS,
  POOP_MAX_LIVE,
  POOP_SLOW_MULTIPLIER,
  POOP_SLOW_TICKS,
  SEAGULL_DEPART_MARGIN,
  SEAGULL_MAX_ACTIVE,
  SEAGULL_RADIUS,
} from '../../constants.ts';
import type { Player } from '../../game/player.ts';
import type { Spark } from '../../game/spark.ts';
import { asPoopId, asSeagullId, type PoopId, type PrimitiveId, type SeagullId, type Vec2 } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { makePoop, makeSeagull, type Poop } from './seagull.ts';

/** Squared poop hit radius — precomputed so the per-tick collision gate stays sqrt-free. */
const POOP_HIT_RADIUS_SQ = POOP_HIT_RADIUS * POOP_HIT_RADIUS;
/** A poop at/under this y has hit the floor → harmless ground splat. */
const POOP_FLOOR_Y = CANVAS_HEIGHT;

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnSeagullAction {
  readonly type: 'SPAWN_SEAGULL';
  readonly pos: Vec2;
  readonly vx: number;
}
export interface SeagullTickAction {
  readonly type: 'SEAGULL_TICK';
  readonly seagullId: SeagullId;
}
export interface PoopTickAction {
  readonly type: 'POOP_TICK';
  readonly poopId: PoopId;
}
export interface CleanPoopAction {
  readonly type: 'CLEAN_POOP';
  readonly poopId: PoopId;
}

/**
 * BFS the connected structure (component) of `start` over bonds. Returns SORTED prim ids
 * (deterministic). A poop fouls — and a clean unfouls — the WHOLE component, so "the whole
 * structure stops generating income" (the user's S77 ask), scoped to the hit structure only.
 */
function collectComponent(world: World, start: PrimitiveId): PrimitiveId[] {
  const seen = new Set<PrimitiveId>();
  const stack: PrimitiveId[] = [start];
  while (stack.length > 0) {
    const pid = stack.pop() as PrimitiveId;
    if (seen.has(pid)) continue;
    const prim = world.primitives.get(pid);
    if (prim === undefined) continue;
    seen.add(pid);
    for (const bondId of prim.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      const other = bond.aId === pid ? bond.bId : bond.aId;
      if (!seen.has(other)) stack.push(other);
    }
  }
  return [...seen].sort((a, b) => (a as number) - (b as number));
}

/** Host-only: mint a seagull at the edge pos with horizontal vx (gated SEAGULL_MAX_ACTIVE). */
export function applySpawnSeagull(world: World, action: SpawnSeagullAction): World {
  if (world.seagulls.size >= SEAGULL_MAX_ACTIVE) return world; // defense; dispatch site also gates
  const id = asSeagullId(world.nextSeagullId++);
  world.seagulls.set(
    id,
    makeSeagull({ id, pos: action.pos, vx: action.vx, spawnedAtTick: world.tick }),
  );
  return world;
}

/**
 * Advance one seagull: LINEAR horizontal flight, FIXED-interval poop drops, off-screen despawn.
 * No RNG, no wall-clock — pure fn of (state, tick) → replay-safe.
 */
export function applySeagullTick(world: World, action: SeagullTickAction): World {
  const gull = world.seagulls.get(action.seagullId);
  if (gull === undefined) return world;

  gull.prevPos.x = gull.pos.x;
  gull.prevPos.y = gull.pos.y;
  gull.pos.x += gull.vx;

  // Despawn once it has flown past the far edge (+ margin) — it just leaves; no fade.
  const offRight = gull.vx > 0 && gull.pos.x > CANVAS_WIDTH + SEAGULL_DEPART_MARGIN;
  const offLeft = gull.vx < 0 && gull.pos.x < -SEAGULL_DEPART_MARGIN;
  if (offRight || offLeft) {
    world.seagulls.delete(action.seagullId);
    return world;
  }

  // Drop a poop on the FIXED interval (no RNG), capped to keep the snapshot small.
  if (
    world.tick - gull.lastPoopTick >= POOP_DROP_INTERVAL_TICKS &&
    world.poops.size < POOP_MAX_LIVE
  ) {
    gull.lastPoopTick = world.tick;
    const pid = asPoopId(world.nextPoopId++);
    world.poops.set(
      pid,
      makePoop({
        id: pid,
        pos: { x: gull.pos.x, y: gull.pos.y + SEAGULL_RADIUS * 0.5 },
        spawnedAtTick: world.tick,
      }),
    );
  }
  return world;
}

/**
 * Advance one poop. FALLING → descend + collide (structure foul OR free-spark slow OR floor).
 * SPLAT_GROUND → dissipate at its TTL. SPLAT_STRUCTURE → persist (cleaned by CLEAN_POOP, or by
 * the main.ts orphan sweep if its anchor prim was destroyed). Squared-dist + LOWEST-id hit.
 */
export function applyPoopTick(world: World, action: PoopTickAction): World {
  const poop = world.poops.get(action.poopId);
  if (poop === undefined) return world;

  if (poop.state !== 'FALLING') {
    if (poop.state === 'SPLAT_GROUND' && world.tick - poop.landedAtTick >= POOP_GROUND_TTL_TICKS) {
      world.poops.delete(action.poopId);
    }
    return world;
  }

  poop.prevPos.x = poop.pos.x;
  poop.prevPos.y = poop.pos.y;
  poop.pos.y += POOP_FALL_SPEED;

  // 1) vs PRIMITIVES (structures) — LOWEST-id hit → foul the whole component.
  // S80 — was `[...keys].sort()` + first-hit break: an array copy + O(P log P) sort per
  // FALLING poop per tick on the host hot path. Tracking the minimum id among hits selects
  // the IDENTICAL primitive (lowest id within radius) with zero allocation — replay-safe
  // equivalence, locked by the differential test in seagull.test.ts.
  let hitPrim: PrimitiveId | null = null;
  for (const [pid, prim] of world.primitives) {
    if (hitPrim !== null && (pid as number) >= (hitPrim as number)) continue;
    const dx = prim.pos.x - poop.pos.x;
    const dy = prim.pos.y - poop.pos.y;
    if (dx * dx + dy * dy <= POOP_HIT_RADIUS_SQ) hitPrim = pid;
  }
  if (hitPrim !== null) {
    for (const pid of collectComponent(world, hitPrim)) world.fouledPrimitives.add(pid);
    const prim = world.primitives.get(hitPrim);
    poop.state = 'SPLAT_STRUCTURE';
    poop.fouledPrimId = hitPrim;
    poop.landedAtTick = world.tick;
    if (prim !== undefined) {
      poop.pos.x = prim.pos.x; // snap the splat onto the structure
      poop.pos.y = prim.pos.y;
    }
    return world;
  }

  // 2) vs FREE SPARKS — LOWEST-id hit → "poopy" half-speed for 15s (consumes the poop).
  // S80 — same zero-allocation lowest-id selection as the primitive pass above.
  let hitSpark: Spark | null = null;
  for (const [sid, spark] of world.freeSparks) {
    if (spark.state.kind !== 'Free') continue;
    if (hitSpark !== null && (sid as number) >= (hitSpark.id as number)) continue;
    const dx = spark.pos.x - poop.pos.x;
    const dy = spark.pos.y - poop.pos.y;
    if (dx * dx + dy * dy <= POOP_HIT_RADIUS_SQ) hitSpark = spark;
  }
  if (hitSpark !== null) {
    hitSpark.poopyUntilTick = world.tick + POOP_SLOW_TICKS;
    // One-time impulse halve of the implicit Verlet velocity (pos-prevPos) — NOT a per-substep
    // scale (which would exponentially decay the spark to a stop). The carry-follow scale
    // handles the dragged case; the tint shows poopiness until poopyUntilTick.
    hitSpark.prevPos.x = hitSpark.pos.x - (hitSpark.pos.x - hitSpark.prevPos.x) * POOP_SLOW_MULTIPLIER;
    hitSpark.prevPos.y = hitSpark.pos.y - (hitSpark.pos.y - hitSpark.prevPos.y) * POOP_SLOW_MULTIPLIER;
    world.poops.delete(action.poopId);
    return world;
  }

  // 3) floor → harmless ground splat.
  if (poop.pos.y >= POOP_FLOOR_Y) {
    poop.state = 'SPLAT_GROUND';
    poop.landedAtTick = world.tick;
    poop.pos.y = POOP_FLOOR_Y;
  }
  return world;
}

/**
 * S79 P3 (HIGH-1) — re-derive the foul set from FIRST PRINCIPLES: fouled = the union of the
 * CURRENT connected components of every live structure-splat's anchor prim. Called after any
 * topology mutation: destroys that delete prims or split components (sever cascade — which
 * the bomb also routes through — and the potato AoE), and S80: placements that bond into or
 * merge with a fouled component (PLACE_PRIMITIVE / PLACE_FROM_FREE in world.ts — the new prim
 * joins the foul immediately instead of retroactively at the next unrelated destroy event).
 * Fixes BOTH S78 audit defects in one pass:
 *   (a) stale-id leak — a destroyed prim is unreachable from any anchor, so it drops out
 *       (pre-fix it sat in the Set forever, and a reused... id space is monotonic, but the
 *       Set grew unbounded across a long match);
 *   (b) un-cleanable income-0 — severing a fouled structure OFF its splat-anchor left the
 *       splat-less fragment fouled with nothing to wipe; now only the fragment still carrying
 *       the splat stays fouled (no splat on you = clean, income resumes).
 * Deterministic: pure fn of (poops, primitives, bonds); BFS via the same collectComponent.
 * Cheap: early-out when nothing is fouled (the overwhelmingly common case).
 */
export function reconcileFouledPrimitives(world: World): void {
  if (world.fouledPrimitives.size === 0) return;
  world.fouledPrimitives.clear();
  for (const poop of world.poops.values()) {
    if (poop.state !== 'SPLAT_STRUCTURE' || poop.fouledPrimId === undefined) continue;
    for (const pid of collectComponent(world, poop.fouledPrimId)) {
      world.fouledPrimitives.add(pid);
    }
  }
}

/**
 * S81 P1 — the main.ts avatar-proximity sweep's full CLEAN_POOP eligibility predicate, pure +
 * exported for unit tests. A player may wipe a structure-splat ONLY when ALL hold:
 *   (a) the poop is a SPLAT_STRUCTURE with a LIVE anchor prim (a gone-anchor orphan is the
 *       sweep's unconditional-clean branch, NOT this predicate);
 *   (b) the player is not benched (S80 — a frozen hidden avatar must not passively wipe);
 *   (c) the player OWNS the fouled structure (anchor ownerColor === player.color — user round-3
 *       playtest: "a spark should not be able to wipe off his enemies structure only his own".
 *       ownerColor is the identity that survives the rainbow shuffle, which remaps player.color
 *       and every owned prim's ownerColor in lockstep, and a future Steal flips it to the thief);
 *   (d) the avatar is within POOP_CLEAN_RADIUS of the splat (squared — no sqrt).
 * Components are single-owner by the S46 P3 cross-colour bond-segregation invariant, so the
 * anchor prim's owner IS the structure's owner.
 */
export function canAvatarCleanSplat(world: World, player: Player, poop: Poop): boolean {
  if (poop.state !== 'SPLAT_STRUCTURE' || poop.fouledPrimId === undefined) return false;
  const anchor = world.primitives.get(poop.fouledPrimId);
  if (anchor === undefined) return false;
  if (player.benchedUntilTick !== undefined && world.tick < player.benchedUntilTick) return false;
  if (anchor.ownerColor !== player.color) return false;
  const dx = player.avatarPos.x - poop.pos.x;
  const dy = player.avatarPos.y - poop.pos.y;
  return dx * dx + dy * dy <= POOP_CLEAN_RADIUS * POOP_CLEAN_RADIUS;
}

/**
 * Clean a structure-splat: UNFOUL its whole CURRENT component + remove every structure-splat
 * sitting on that component (so cleaning any splat clears the whole structure — Council E3).
 * A non-structure poop just deletes. Dispatched by the main.ts avatar-proximity sweep + tests.
 *
 * S79 P3 — the SPLAT_STRUCTURE branch now also requires the anchor prim to still EXIST.
 * Pre-fix, the main.ts orphan sweep (anchor destroyed) dispatched CLEAN_POOP but the BFS over
 * a deleted anchor returned an EMPTY component, so the loop below deleted nothing — including
 * the orphan poop itself — and the sweep re-dispatched every tick forever while the splat
 * floated immortally at the dead prim's last position. A gone-anchor splat now takes the
 * plain-delete branch.
 */
export function applyCleanPoop(world: World, action: CleanPoopAction): World {
  const poop = world.poops.get(action.poopId);
  if (poop === undefined) return world;
  if (
    poop.state === 'SPLAT_STRUCTURE' &&
    poop.fouledPrimId !== undefined &&
    world.primitives.has(poop.fouledPrimId)
  ) {
    const component = collectComponent(world, poop.fouledPrimId);
    const inComponent = new Set<PrimitiveId>(component);
    for (const pid of component) world.fouledPrimitives.delete(pid);
    for (const [poopId, p] of [...world.poops]) {
      if (
        p.state === 'SPLAT_STRUCTURE' &&
        p.fouledPrimId !== undefined &&
        inComponent.has(p.fouledPrimId)
      ) {
        world.poops.delete(poopId);
      }
    }
  } else {
    world.poops.delete(action.poopId);
  }
  return world;
}

/**
 * Teardown — clear all seagull/poop/foul state. Called on PLAYING→WIN (WIN_TRIGGER),
 * RETURN_TO_TITLE, and START_GAME so no gull/poop/foul ever persists across the win screen
 * or into the next match (else a fouled prim would halt income into a fresh game).
 */
export function teardownSeagulls(world: World): void {
  world.seagulls.clear();
  world.poops.clear();
  world.fouledPrimitives.clear();
  world.nextSeagullId = 0;
  world.nextPoopId = 0;
}
