/**
 * SPARK — S100 P1 (TD Phase 1a) creature-spawner lifecycle reducers.
 *
 * Mirrors the creature/bomb/hunter lifecycle shape: pure case-body helpers consumed
 * by world.ts dispatch. Two HOST-INTERNAL actions (NEITHER is a client INTENT — the
 * spawner is host-authored + replicated via snapshot, so it stays out of
 * CLIENT_INTENT_TYPES; it rides KNOWN_GAME_ACTION_TYPES_RECORD only):
 *   REGISTER_SPAWNER — Layer 5 (godly ignition) dispatches this when a player completes
 *                      a spawner-structure (e.g. a closed pentagram). Mints a SpawnerId,
 *                      seeds the cadence (first chewer emits after one SPAWN_INTERVAL).
 *   REMOVE_SPAWNER   — the host re-validation poll (main.ts, Layer 4) dispatches this
 *                      when the anchor primitive is gone OR the recipe no longer holds —
 *                      income + swarm STOP instantly (the counterplay).
 *
 * Determinism: tick-based; cadence + re-validation are pure fns of `world.tick`; no RNG,
 * no wall-clock. Host-authoritative — clients receive the result in the next NetSnapshot
 * (additive-optional `creatureSpawners[]`) and never simulate.
 *
 * NOTE (Layer boundary): `recipeStillSatisfied` here is a Layer-5 STUB — it returns true
 * iff the anchor primitive still exists, so the file compiles and re-validation works
 * minimally (a deleted anchor still tears the spawner down). Layer 5 replaces the body
 * with the real pentagram-component predicate (the CURRENT component of the anchor must
 * still match the recipe shape — extra attached primitive fails, missing triangle fails).
 */

import { SPAWN_INTERVAL_TICKS } from '../../constants.ts';
import { asSpawnerId, type PlayerId, type PrimitiveId, type SpawnerId } from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
import { isPentagramComponent } from '../godlyRecipes/pentagram.ts';
import type { World } from '../worldTypes.ts';
import { makeSpawner, type CreatureSpawner } from './spawner.ts';

/** Action shapes — exported so world.ts can compose GameAction. */
export interface RegisterSpawnerAction {
  readonly type: 'REGISTER_SPAWNER';
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
}
export interface RemoveSpawnerAction {
  readonly type: 'REMOVE_SPAWNER';
  readonly spawnerId: SpawnerId;
}

/**
 * Host-only: register a new spawner over a freshly-completed structure. The owner +
 * anchor + recipe come from the ignition caller (Layer 5); this reducer mints the id
 * and seeds the cadence so the first chewer emits after one full SPAWN_INTERVAL (not
 * instantly — `nextSpawnTick = world.tick + SPAWN_INTERVAL_TICKS`).
 *
 * Per-`(playerId, anchorPrimitiveId)` de-dup is the matcher gate's job (Layer 5,
 * against the live `creatureSpawners` map); as defense-in-depth this reducer also
 * no-ops if a spawner already anchors the same primitive (you can't double-register
 * one anchor; you CAN rebuild after the prior spawner was removed).
 */
export function applyRegisterSpawner(world: World, action: RegisterSpawnerAction): World {
  for (const sp of world.creatureSpawners.values()) {
    if (sp.anchorPrimitiveId === action.anchorPrimitiveId) return world;
  }
  const id = asSpawnerId(world.nextSpawnerId++);
  world.creatureSpawners.set(
    id,
    makeSpawner({
      id,
      ownerPlayerId: action.ownerPlayerId,
      anchorPrimitiveId: action.anchorPrimitiveId,
      recipeId: action.recipeId,
      ignitedAtTick: world.tick,
      nextSpawnTick: world.tick + SPAWN_INTERVAL_TICKS,
    }),
  );
  return world;
}

/**
 * Host-only: remove a spawner (its income bonus + chewer cadence stop instantly the
 * next tick). Dispatched by the re-validation poll when the structure is broken, and
 * by teardown. No-op on a missing id (stale fan-out snapshot — defense-in-depth,
 * mirroring applyHunterTick's missing-id guard).
 *
 * Live chewers already minted by this spawner are NOT removed here — they keep
 * chewing until they despawn through their own lifecycle / a potato blast (Phase-1
 * kill path). Only the EMITTER and its passive income stop.
 */
export function applyRemoveSpawner(world: World, action: RemoveSpawnerAction): World {
  world.creatureSpawners.delete(action.spawnerId);
  return world;
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — re-validation predicate. Runs the spawner's
 * recipe shape-check against the CURRENT connected component of its anchor
 * primitive: the spawner survives ONLY while that component still EXACTLY matches
 * the recipe. Removing a triangle (component shrinks / a ring node drops degree)
 * OR attaching an extra shape (component grows past 5 / a non-triangle appears)
 * both make this return false → the host poll dispatches REMOVE_SPAWNER → income +
 * swarm stop instantly. This IS the counterplay.
 *
 * Dispatches on `spawner.recipeId` so future spawner recipes (different shapes)
 * slot in here. `pentagram` is the only registered spawner recipe in Phase 1b;
 * `isPentagramComponent` already returns false when the anchor primitive is gone,
 * so the missing-anchor case is covered without a separate `.has` guard (the host
 * poll also short-circuits on `!world.primitives.has(anchor)` first as
 * defense-in-depth).
 */
export function recipeStillSatisfied(world: World, spawner: CreatureSpawner): boolean {
  switch (spawner.recipeId) {
    case 'pentagram':
      return isPentagramComponent(world, spawner.anchorPrimitiveId);
    default:
      // A spawner minted by a recipe with no re-validation rule (none today) is
      // kept alive only while its anchor primitive exists — the minimal contract.
      return world.primitives.has(spawner.anchorPrimitiveId);
  }
}

/**
 * Teardown — clear all spawner state. Wired into all FOUR teardown sites
 * (world.ts WIN_TRIGGER, gameState.ts softReset, gameMode.ts title-return,
 * godlyActions.ts applyGodlyAbort), mirroring teardownHunters/teardownSeagulls so a
 * spawner never persists onto the win screen or into the next match (a lingering
 * spawner would keep minting chewers + accruing income next game). `nextSpawnerId`
 * reset to 0 so a fresh match mints ids from scratch.
 */
export function teardownSpawners(world: World): void {
  world.creatureSpawners.clear();
  world.nextSpawnerId = 0;
}
