/**
 * SPARK — S158 P6 (CF-S157-b): **the landed stink bag, as a thing that exists.**
 *
 * ## The gap this closes
 *
 * Owner: a thrown bag should *land and stink over time*. Until now `stinkThrowBag` applied one
 * instantaneous radial splash and the bag ceased to exist in the tick it arrived — so the tower's
 * only lasting presence was the aura around ITSELF, and everything it threw was a flash. S157 shipped
 * a 12-frame atlas for the landed bag (`public/godly/stink-bag/anim/`) and **nothing in `src/` ever
 * referenced it.** This is the entity that gives that art something to be.
 *
 * ## What a cloud is, and what it deliberately is not
 *
 * It is the tower's own aura, moved to where the bag fell and given an end. Same beat, same numbers:
 *
 *   | | tower aura (S157 B9) | landed cloud (here) |
 *   |---|---|---|
 *   | cadence | `DOT_CADENCE_TICKS` | `DOT_CADENCE_TICKS` |
 *   | shapes | `STINK_AURA_DAMAGE` | `STINK_AURA_DAMAGE` |
 *   | units | `attackFifths(STINK_BAG_ATK, STINK_BAG_PEN)` | the same |
 *   | radius | `STINK_AURA_RADIUS` 120 | `STINK_BAG_RADIUS` 90 |
 *   | lifetime | the tower's | `STINK_CLOUD_LIFETIME_TICKS` |
 *
 * ⚠ ONE new constant, and no new balance economy. Every damage number here is one the owner already
 * ruled on for this same weapon; a cloud is simply that smell, somewhere else, for a while. The
 * impact splash is also UNCHANGED — the bag still hits for `STINK_BAG_DAMAGE` on arrival and the
 * cloud is what it leaves behind — so nothing about the shipped tower balance moves.
 *
 * ## Determinism
 *
 * Pure functions of `(world, cloud)`. No RNG, no wall clock. The cadence is tested against
 * `world.tick` and phase-spread by cloud id — never an accumulator, because an accumulated float
 * drifts between host and worker mirror, and drift in a damage cadence IS a desync. That is the rule
 * `stinkAuraTick` obeys next door, for the same reason.
 */

import {
  DOT_CADENCE_TICKS,
  STINK_AURA_DAMAGE,
  STINK_BAG_ATK,
  STINK_BAG_PEN,
  STINK_CLOUD_LIFETIME_TICKS,
} from '../../constants.ts';
import type { PlayerId, StinkCloudId, Vec2 } from '../../types.ts';
import { attackFifths } from '../stats.ts';
import type { World } from '../worldTypes.ts';
import type { RadialDamageFn } from './stinkTower.ts';

/**
 * A landed bag, stinking.
 *
 * ⚠ `radius` IS STORED rather than read from the constant at damage time. A cloud already on the
 * ground was thrown under the rules in force when it landed; re-reading a tuned constant would
 * retroactively resize live clouds mid-match, and would resize them differently on a host and a
 * client running builds from either side of that tuning. Same reasoning as `Creature.despawnAtTick`.
 */
export interface StinkCloud {
  readonly id: StinkCloudId;
  readonly pos: Vec2;
  /** Spared by its own cloud — the contract every area hazard in this game holds. */
  readonly ownerPlayerId: PlayerId;
  /** Tick the bag landed. Drives both the expiry and the renderer's atlas frame. */
  readonly landedAtTick: number;
  readonly radius: number;
}

/** Factory. `pos` is copied — the caller's vector is usually a live entity's own position. */
export function makeStinkCloud(args: {
  id: StinkCloudId;
  pos: Vec2;
  ownerPlayerId: PlayerId;
  landedAtTick: number;
  radius: number;
}): StinkCloud {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    ownerPlayerId: args.ownerPlayerId,
    landedAtTick: args.landedAtTick,
    radius: args.radius,
  };
}

/** PURE — the tick this cloud stops existing. Exported so the renderer can fade it out in step. */
export function stinkCloudExpiryTick(c: StinkCloud): number {
  return c.landedAtTick + STINK_CLOUD_LIFETIME_TICKS;
}

/** PURE — 0 at landing, 1 at expiry. The renderer's atlas cursor and alpha ramp read this. */
export function stinkCloudProgress(c: StinkCloud, tick: number): number {
  const t = (tick - c.landedAtTick) / STINK_CLOUD_LIFETIME_TICKS;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * One cloud's damage beat. Returns whether it applied damage this tick — the tests want to assert
 * the cadence itself, and a bare `void` would make that testable only through a victim's hp.
 *
 * ⚠ PHASE-SPREAD BY ID, like `stinkAuraTick`: several clouds landing in the same second must not all
 * pulse on one tick, which spikes the frame and reads as a stutter rather than a smell.
 */
export function stinkCloudTick(world: World, c: StinkCloud, radialDamage: RadialDamageFn): boolean {
  const phase = (c.id as unknown as number) % DOT_CADENCE_TICKS;
  if (world.tick % DOT_CADENCE_TICKS !== phase) return false;
  radialDamage(
    world, c.pos.x, c.pos.y, c.radius,
    STINK_AURA_DAMAGE, attackFifths(STINK_BAG_ATK, STINK_BAG_PEN),
    'aura', c.ownerPlayerId,
  );
  return true;
}

/**
 * Sweep expired clouds. Collected first, deleted second — the iteration discipline this codebase
 * holds wherever it mutates a map it is walking, and the reason is not style: deleting mid-iteration
 * is where replay divergence hides.
 */
export function sweepExpiredStinkClouds(world: World): void {
  if (world.stinkClouds.size === 0) return;
  const dead: StinkCloudId[] = [];
  for (const c of world.stinkClouds.values()) {
    if (world.tick >= stinkCloudExpiryTick(c)) dead.push(c.id);
  }
  for (const id of dead) world.stinkClouds.delete(id);
}
