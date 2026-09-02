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
 *   | | tower aura | landed cloud (here) |
 *   |---|---|---|
 *   | cadence | `STINK_AURA_CADENCE_TICKS` (1 s) | the same |
 *   | shapes | `STINK_AURA_DAMAGE` | the same |
 *   | units | `STINK_AURA_UNIT_FIFTHS` (0.2 atk/sec) | the same |
 *   | radius | `STINK_AURA_RADIUS` 120 | `STINK_BAG_RADIUS` 90 |
 *   | lifetime | the tower's | `STINK_CLOUD_LIFETIME_TICKS` |
 *
 * ⛔ THE ROW ABOVE USED TO SAY SOMETHING FALSE, AND THE OWNER CAUGHT IT. P6 justified reusing the
 * tower's numbers on the grounds that they were "numbers the owner already ruled on". They were
 * not: `STINK_AURA_DAMAGE` was authored in S141 as "2 % of max hp" with nothing behind it, and the
 * unit rate worked out at 2.4 atk/sec against the owner's stated **0.2**. S158 A1 corrected both.
 * The two are still deliberately identical — a landed bag is the same smell — but they are now
 * identical to the OWNER'S number instead of to each other's invented one.
 *
 * ⚠ The impact splash is UNCHANGED: the bag still hits for `STINK_BAG_DAMAGE` on arrival and the
 * cloud is only what it leaves behind. 0.2 atk/sec is a ruling about the AURA.
 *
 * ## Determinism
 *
 * Pure functions of `(world, cloud)`. No RNG, no wall clock. The cadence is tested against
 * `world.tick` and phase-spread by cloud id — never an accumulator, because an accumulated float
 * drifts between host and worker mirror, and drift in a damage cadence IS a desync. That is the rule
 * `stinkAuraTick` obeys next door, for the same reason.
 */

import {
  STINK_AURA_CADENCE_TICKS,
  STINK_AURA_DAMAGE,
  STINK_AURA_UNIT_FIFTHS,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_CLOUD_LIFETIME_TICKS,
} from '../../constants.ts';
import type { PlayerId, StinkCloudId, Vec2 } from '../../types.ts';
import { unitPoolFifths } from '../stats.ts';
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
  /**
   * ⭐ S158 A2 (owner R77) — REMAINING POOL, IN FIFTHS. A landed bag is DESTRUCTIBLE.
   *
   * Mutable, and the only mutable field on this record — everything else about a bag is fixed the
   * moment it lands. Named `ehp` for the reason `Creature.ehp` and `Defender.ehp` record: the ladder
   * is `hp × (1 + 0.2·DEF)`, so a reader who assumed hit points would be wrong by a factor of five.
   */
  ehp: number;
}

/** Factory. `pos` is copied — the caller's vector is usually a live entity's own position. */
export function makeStinkCloud(args: {
  id: StinkCloudId;
  pos: Vec2;
  ownerPlayerId: PlayerId;
  landedAtTick: number;
  radius: number;
  /** Omitted for a fresh bag; supplied only when rehydrating one that has already been hit. */
  ehp?: number;
}): StinkCloud {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    ownerPlayerId: args.ownerPlayerId,
    landedAtTick: args.landedAtTick,
    radius: args.radius,
    // S158 A2 — off the shared ladder, so a retune of the bag's stats moves this with it.
    ehp: args.ehp ?? unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF),
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
  // ⭐ S158 A1 — the owner's 0.2 atk/sec, on the aura's own one-second beat. P6 shipped this at the
  // tower's then-current rate ARGUING it was an owner number; it was not, and the owner's review
  // caught it. The two are still deliberately identical — a landed bag is the same smell.
  const phase = (c.id as unknown as number) % STINK_AURA_CADENCE_TICKS;
  if (world.tick % STINK_AURA_CADENCE_TICKS !== phase) return false;
  radialDamage(
    world, c.pos.x, c.pos.y, c.radius,
    STINK_AURA_DAMAGE, STINK_AURA_UNIT_FIFTHS,
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
