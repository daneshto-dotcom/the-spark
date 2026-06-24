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
