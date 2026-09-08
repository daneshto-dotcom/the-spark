/**
 * SPARK — S100 P1 (TD Phase 1a) creature-spawner structure entity (pure type, leaf module).
 *
 * Mirrors the `hunters/hunter.ts` + `creatures/creature.ts` + `bomb.ts` leaf pattern:
 * `worldTypes.ts` imports `CreatureSpawner` from here so there is NO
 * worldTypes <-> spawnerLifecycle cycle (worldTypes -> leaf domain types only, and
 * this module never imports world.ts).
 *
 * A spawner is a SEPARATE host-authoritative record — it is the per-structure
 * identity that makes a built shape (e.g. a pentagram) "come alive": it emits a
 * `'chewer'` creature on a tick-deterministic cadence and is re-validated each poll
 * against its anchor primitive + recipe shape. It is replicated to clients via an
 * additive-optional `creatureSpawners[]` NetSnapshot field (creature/hunter
 * precedent); clients never simulate it (host-authoritative).
 *
 * Determinism: cadence + re-validation are pure fns of `world.tick` — NEVER
 * wall-clock (`nextSpawnTick`/`lastValidatedTick` are tick counters, advanced by
 * `+=` accumulation in the host poll, mirroring the bomb-dissipate tick poll, NOT
 * `game/spawner.ts`'s `dtSec` wall-clock cadence).
 *
 * Identity = the lowest `PrimitiveId` in the matched component at ignition
 * (`anchorPrimitiveId`). Primitives have stable ids and persist in `world.primitives`;
 * a structure (`structure.ts:componentOf` BFS) has no persistent object, and
 * `placerColor` (ownership) is mutable via rainbow-shuffle — so the anchor is a
 * stable handle, re-validated each poll (Layer 5 fills `recipeStillSatisfied`).
 */

import {
  DRONE_EMIT_INTERVAL_TICKS,
  RACE_TOWER_EMIT_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
  T9_RELEASE_DELAY_TICKS,
} from '../../constants.ts';
// S167 — the side-effect-free tier-9 leaf. This module is imported by the reducer AND by hostTick.
import { isT9TowerId } from '../t9BossIds.ts';
// S168 — same shape, and the same reason: a side-effect-free id leaf, safe for both callers.
import { isRaceTowerId } from '../raceTowerIds.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
import type { PlayerId, PrimitiveId, SpawnerId } from '../../types.ts';

export interface CreatureSpawner {
  readonly id: SpawnerId;
  readonly ownerPlayerId: PlayerId;
  /**
   * Stable identity = lowest PrimitiveId in the matched component at ignition.
   * Re-validated every poll: (a) world.primitives.has(anchorPrimitiveId), and
   * (b) the CURRENT component of that anchor still satisfies the recipe. Either
   * failing removes the spawner (income + swarm STOP instantly — the counterplay).
   */
  readonly anchorPrimitiveId: PrimitiveId;
  /** Which recipe minted this spawner (e.g. the pentagram). */
  readonly recipeId: GodlyId;
  /** Tick-deterministic cadence — NEVER wall-clock. Advanced by `+=` in the host poll. */
  nextSpawnTick: number;
  /** Re-validation throttle cache (the lastValidatedTick / REVALIDATE_INTERVAL gate). */
  lastValidatedTick: number;
  /** Count of chewers this spawner has minted (telemetry + cap accounting headroom). */
  spawnedCount: number;
  /** Tick the structure ignited — anchors the post-ignition grace window. */
  readonly ignitedAtTick: number;
}

/**
 * Factory for a freshly-registered spawner. `nextSpawnTick` is left to the caller
 * (the register reducer seeds it from `world.tick + SPAWN_INTERVAL_TICKS` so the
 * first chewer emits after one interval, not instantly); `lastValidatedTick` snaps
 * to `ignitedAtTick` so the first poll re-validates after one throttle window.
 * `spawnedCount` starts at 0.
 */
/**
 * ⭐ S158 B2 (owner playtest) — **THE EMIT CADENCE A GIVEN RECIPE ACTUALLY RUNS ON.**
 *
 * Owner: *"the lighning drone tower is not producing or spawning suicide drones."* It was producing.
 * It was producing on the CHEWER's clock, in THREE separate places, because `DRONE_EMIT_INTERVAL_TICKS`
 * was defined as `= SPAWN_INTERVAL_TICKS // reuse the chewer cadence` and two of the three sites
 * skipped the alias entirely and named the chewer constant outright:
 *
 *   1. the registration seed (`spawnerLifecycle`) — so the FIRST drone was one chewer-interval out;
 *   2. the BUILD-phase re-alignment (`hostTick`) — so a hub crossing the phase edge carried a
 *      deadline up to one chewer-interval INTO the fight it was built for;
 *   3. the emit itself, which alone used the drone alias.
 *
 * Against a 45 s fight that is the difference between a burst weapon and a tower that appears inert.
 * ONE definition now, because three readers of one number were allowed to disagree and did.
 *
 * A recipe with no cadence (the goblin tower is FED, never polled) gets the default — inert for it.
 */
export function spawnerIntervalTicks(recipeId: GodlyId): number {
  /*
   * ⭐ S167 — THE TIER-9 BOSS TOWER'S "CADENCE" IS ITS RELEASE DELAY, and it is the one recipe here
   * that fires exactly once. It stands for `T9_RELEASE_DELAY_TICKS` and then releases its boss and
   * razes itself (`hostTick`'s t9 arm), so this number is a one-shot fuse rather than a rate.
   *
   * ⛔ WITHOUT THIS ARM IT WOULD TAKE THE CHEWER'S 15 s DEFAULT BELOW — nearly double the owner's
   * ENTIRE 8-second budget for spawn + release + crumble — with tsc green and every test green.
   * That is the S158 B2 class verbatim: the drone tower ran on the chewer's clock in three separate
   * places because two of them skipped this function.
   */
  if (isT9TowerId(recipeId)) return T9_RELEASE_DELAY_TICKS;
  /*
   * ⭐ S168 — THE TIER-3 RACE TOWER EMITS AT ALL. Owner: *"the tier 3 tower does not produce or
   * spawn creatures! it should produce spawn at similar rate as the castle does"*.
   *
   * ⛔ ITS SECOND HALF IS SUPERSEDED BY S169 AND IS KEPT ONLY TO RECORD THE MISREADING. It read:
   * *"'Similar rate as the castle' is not an estimate — `RACE_UNIT_EMIT_INTERVAL_TICKS` IS the
   * castle's emitter constant (R120, one unit per ~30 s), so the two move together forever."*
   * Sharing the constant was MY inference, not his instruction; "similar rate" is a comparison, not
   * a binding. He played it and named 15 s. The lesson is the one this file already teaches about
   * numbers: an owner ADJECTIVE ("similar") is not an owner NUMBER, and welding two subsystems to
   * one constant on the strength of an adjective cost a whole session's playtest.
   *
   * ⛔ AND IT HAS TO BE HERE, NOT ONLY AT THE EMIT. This function feeds THREE readers — the
   * registration seed (`spawnerLifecycle`), the BUILD-phase re-alignment (`hostTick`) and the emit
   * itself. The docblock above records what happens when they disagree: the drone tower ran on the
   * CHEWER's clock in exactly this way, and "a burst weapon or a tower that appears inert" was the
   * difference. Omitting this arm would have given the race tower a 30 s emit on a 15 s deadline.
   */
  /*
   * ⭐⭐ S169 (owner playtest) — **ITS OWN 15 s CLOCK, NO LONGER THE CASTLE'S 30 s.**
   *
   * Owner: *"fifteen seconds is better because it's low level enemy"*, after playing the S168 build
   * and reporting *"the tier three towers, they're not really producing … very much noncoherent"*.
   * The full quote and why the supersession is deliberate live at `RACE_TOWER_EMIT_INTERVAL_TICKS`.
   *
   * ⚠ THE ARM ABOVE STAYS EXACTLY WHERE IT WAS — only the number it returns moved. The three-reader
   * hazard this whole function exists for (registration seed · BUILD re-alignment · the emit) is
   * unchanged and still routes through here, so the 30 s → 15 s change reaches all three at once.
   * `RACE_UNIT_EMIT_INTERVAL_TICKS` remains the CASTLE's constant (R120) and is untouched.
   */
  if (isRaceTowerId(recipeId)) return RACE_TOWER_EMIT_INTERVAL_TICKS;
  return recipeId === 'lightningHub' ? DRONE_EMIT_INTERVAL_TICKS : SPAWN_INTERVAL_TICKS;
}

export function makeSpawner(args: {
  id: SpawnerId;
  ownerPlayerId: PlayerId;
  anchorPrimitiveId: PrimitiveId;
  recipeId: GodlyId;
  ignitedAtTick: number;
  nextSpawnTick: number;
}): CreatureSpawner {
  return {
    id: args.id,
    ownerPlayerId: args.ownerPlayerId,
    anchorPrimitiveId: args.anchorPrimitiveId,
    recipeId: args.recipeId,
    nextSpawnTick: args.nextSpawnTick,
    lastValidatedTick: args.ignitedAtTick,
    spawnedCount: 0,
    ignitedAtTick: args.ignitedAtTick,
  };
}
