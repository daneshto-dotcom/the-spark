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

import { asSpawnerId, type PlayerId, type PrimitiveId, type SpawnerId } from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
// ⭐ S189 C2 — the SURVIVAL test for the pentagram / lightning hub / goblin tower arms below. The
// three `is…Component` IGNITION predicates these arms used to call are no longer imported here.
import { ownSetAtRegistration, towerStandsAt } from '../towerMembers.ts';
/*
 * S166 — the two lookups the race-tower cases need.
 *
 * ⚠ `raceTowerIds.ts` / `t9BossIds.ts` are side-effect-free by contract — which is what makes them
 * importable here. `world.ts` reaches this file, so pulling in a registering module would repeat
 * the S144 trap the `goblinKinds` import two lines up exists to avoid. (S189 C2 item 2: the ring
 * validator `isRingAt` is no longer imported — the race arms ask `towerStandsAt` now.)
 */
import { raceForTowerId } from '../raceTowerIds.ts';
// S167 — the tier-9 leaf, side-effect-free by the same contract as the line above.
import { raceForT9TowerId } from '../t9BossIds.ts';
import type { World } from '../worldTypes.ts';
import { makeSpawner, spawnerIntervalTicks, type CreatureSpawner } from './spawner.ts';
import { recordTowerBuilt } from '../matchStats.ts'; // ⭐ S191

/** Action shapes — exported so world.ts can compose GameAction. */
export interface RegisterSpawnerAction {
  readonly type: 'REGISTER_SPAWNER';
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  /**
   * S191 (R191-A) — the tower's own shapes, when the caller knows them better than the exact shape at
   * the anchor can say: ONLY the tower FIX re-registering a welded stamp (`structureRepair.ts`), which
   * exact ignition can never see. Omitted ⇒ read off the exact shape (`ownSetAtRegistration`).
   */
  readonly ownPrimitiveIds?: readonly PrimitiveId[];
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
      // ⭐ S158 B2 — the recipe's OWN cadence, not the chewer's. A lightning hub seeded here at the
      // chewer's 15 s spent the first quarter of its fight silent before it emitted anything.
      nextSpawnTick: world.tick + spawnerIntervalTicks(action.recipeId),
      // ⭐ S189 C2 / S191 — the shapes it is BUILT of (its own connectors are the bonds between them).
      ownPrimitiveIds:
        action.ownPrimitiveIds ?? ownSetAtRegistration(world, action.recipeId, action.anchorPrimitiveId),
    }),
  );
  recordTowerBuilt(world, action.ownerPlayerId); // ⭐ S191 — the stat board's TOWERS
  /*
   * ⭐ S193 (owner T4, audit round 1) — a goblin tower re-registering at an anchor it fell from takes its
   * toggles back, IF it is the same seat's. The entry is consumed either way, and stale ones (anchor
   * gone) are pruned, so a tower destroyed and rebuilt elsewhere starts OFF (⚠ MINE).
   */
  const remembered = world.goblinAutoFeedMemory.get(action.anchorPrimitiveId);
  if (remembered !== undefined) {
    world.goblinAutoFeedMemory.delete(action.anchorPrimitiveId);
    if (action.recipeId === 'goblinTower' && remembered.owner === action.ownerPlayerId) {
      const sp = world.creatureSpawners.get(id)!;
      sp.autoFeedMask = remembered.mask;
      sp.autoFeedCursor = remembered.cursor;
    }
  }
  pruneAutoFeedMemory(world);
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
  const sp = world.creatureSpawners.get(action.spawnerId);
  /*
   * ⭐⭐ S193 (owner T4, audit round 1) — A ONE-CONNECTOR BITE MUST NOT WIPE THE TOGGLES. *"whenever
   * there's free space … it builds"* is a standing order; the revalidation poll removes the spawner the
   * moment one own connector falls, and FIX re-ignites it at the same anchor. So a toggled goblin tower
   * that falls with its anchor still standing leaves its toggles behind, keyed by that anchor.
   */
  if (
    sp !== undefined &&
    sp.recipeId === 'goblinTower' &&
    ((sp.autoFeedMask ?? 0) !== 0 || (sp.autoFeedCursor ?? 0) !== 0) &&
    world.primitives.has(sp.anchorPrimitiveId)
  ) {
    world.goblinAutoFeedMemory.set(sp.anchorPrimitiveId, {
      owner: sp.ownerPlayerId,
      mask: sp.autoFeedMask ?? 0,
      cursor: sp.autoFeedCursor ?? 0,
    });
  }
  world.creatureSpawners.delete(action.spawnerId);
  pruneAutoFeedMemory(world);
  return world;
}

/** ⭐ S193 T4 — drop every remembered toggle whose anchor is gone: that tower was destroyed, not bitten. */
function pruneAutoFeedMemory(world: World): void {
  if (world.goblinAutoFeedMemory.size === 0) return;
  for (const anchor of [...world.goblinAutoFeedMemory.keys()]) {
    if (!world.primitives.has(anchor)) world.goblinAutoFeedMemory.delete(anchor);
  }
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — re-validation predicate. Runs the spawner's
 * recipe shape-check against the CURRENT connected component of its anchor
 * primitive: the spawner survives ONLY while that component still EXACTLY matches
 * the recipe. Removing a triangle (component shrinks / a ring node drops degree)
 * makes this return false → the host poll dispatches REMOVE_SPAWNER → income +
 * swarm stop instantly. This IS the counterplay.
 *
 * ⚠ S189 C2 — "OR attaching an extra shape" USED TO BE THE OTHER HALF OF THIS SENTENCE, and it
 * was the owner's S189 bug report. A weld no longer un-makes a star or the pentagram: those arms
 * ask `towerStandsAt` whether the recipe is still CONTAINED — and since S189 C2 item 2 so do the
 * twelve race rings, which until then kept R136's exact same-type-2 rule for survival as well.
 *
 * Dispatches on `spawner.recipeId` so future spawner recipes (different shapes)
 * slot in here. `pentagram` is the only registered spawner recipe in Phase 1b;
 * `towerStandsAt` already returns false when the anchor primitive is gone,
 * so the missing-anchor case is covered without a separate `.has` guard (the host
 * poll also short-circuits on `!world.primitives.has(anchor)` first as
 * defense-in-depth).
 */
export function recipeStillSatisfied(world: World, spawner: CreatureSpawner): boolean {
  switch (spawner.recipeId) {
    /*
     * ⭐⭐ S189 C2 — THE THREE ARMS BELOW ARE SURVIVAL TESTS, AND SURVIVAL IS "THE RECIPE IS STILL
     * CONTAINED". The `is…Component` predicates they used to call are IGNITION tests and stay exact
     * there. As survival tests they were the owner's S189 report — *"it still has a pentagram, but
     * you can connect to it"*: the pentagram's whole-component test died to ANY weld, and the two
     * stars' exact hub degree died to a weld on the hub. See `state/towerMembers.ts`.
     */
    case 'pentagram':
      return towerStandsAt(world, 'pentagram', spawner.anchorPrimitiveId);
    // S113 Batch C — a lightningHub survives only while its Dot hub still anchors a 1-Dot(deg5)
    // + 5-Circle star (a chewer/drone eating a Circle leaf drops the size/degree -> teardown).
    case 'lightningHub':
      return towerStandsAt(world, 'lightningHub', spawner.anchorPrimitiveId);
    // ⭐ S151 P3 — a goblin tower survives only while its Circle hub still anchors a
    // 1-Circle(deg 4) + 4-Circle star. Without this case it would fall to `default:` below, which
    // checks ONLY that the anchor exists — so a tower whose four leaves were eaten would keep
    // producing goblins off one lone Circle, forever, with no error anywhere.
    //
    // ⚠ IMPORTED FROM `state/goblinKinds.ts`, NOT from the recipe module. `world.ts` reaches this
    // file, and every recipe module calls `registerRecipe` at its tail — see the leaf's header for
    // the S144 trap and the ?worker=1 boot failure it caused in this very priority.
    case 'goblinTower':
      return towerStandsAt(world, 'goblinTower', spawner.anchorPrimitiveId);
    /*
     * ⭐ S166 — THE SIX TIER-3 RACE TOWERS. Without these cases all six would fall to `default:`
     * below, which checks ONLY that the anchor exists — so a tower whose other two nodes had been
     * eaten would keep producing off one lone shape, FOREVER, with no error anywhere. That is the
     * identical trap the `goblinTower` case above was written to avoid, and six recipes is six
     * chances to hit it.
     *
     * ⛔ SIX EXPLICIT `case` LABELS, NOT `raceForTowerId` INSIDE `default:`. Putting the lookup in
     * the default arm would work and would also make the omission of a SEVENTH race invisible — the
     * whole reason this switch has explicit arms is that a missing one must be visible at the switch.
     *
     * ⚠ `isRingAt`, NOT a component check. R136: total degree is unconstrained, so a friendly shape
     * auto-bonded onto a node must NOT tear the tower down. A `componentOf` rule here would
     * re-introduce the S158 B2b defect on the cheapest structure in the game.
     *
     * ⭐ S189 C2 item 2 — AND NOW NOT `isRingAt` EITHER, for survival. R136's exact-2 same-type clause
     * exists to keep IGNITION collision-free and still does there (`findRingAnchors`). As a survival
     * test it meant a shape of the ring's OWN type welded on dissolved the tower — which is the
     * owner's own bat-tower example (R185-B). Survival is `towerStandsAt`: the ring's own 3-cycle.
     */
    case 't3TowerVampires':
    case 't3TowerNagas':
    case 't3TowerMummies':
    case 't3TowerZombies':
    case 't3TowerOrcs':
    case 't3TowerDemons': {
      const race = raceForTowerId(spawner.recipeId);
      if (race === null) return false; // unreachable: the case labels ARE the six ids
      // ⭐⭐ S189 C2 item 2 — CONTAINS, not R136's exact same-type 2: a weld of the ring's OWN type
      // (the owner's own "weld two bat towers") no longer un-makes it. Ignition stays exact.
      return towerStandsAt(world, spawner.recipeId, spawner.anchorPrimitiveId);
    }
    /*
     * ⭐ S167 — THE SIX TIER-9 BOSS TOWERS. Six explicit labels for the same reason the tier-3 block
     * above has six: a missing arm must be VISIBLE AT THE SWITCH, and `raceForT9TowerId` inside
     * `default:` would work while making the omission of a seventh race invisible.
     *
     * ⚠ AND THE WINDOW THIS GUARDS IS SHORT BUT REAL. A tier-9 tower only lives from ignition until
     * it releases its boss, and it razes its own ring on release — so most of the time there is no
     * spawner here to re-validate. It still needs the arm: a player who breaks their own nine-ring
     * BEFORE the release must lose the tower, and without a case that would fall to `default:`,
     * which checks only that the anchor exists — leaving a boss to be released from one lone shape.
     *
     * ⛔ `isRingAt` AT n=9, NOT A COMPONENT CHECK, for R136's reason: total degree is unconstrained,
     * so a friendly shape auto-bonded onto a node must not tear the tower down. At nine nodes that
     * exposed surface is three times the tier-3 tower's, which makes the relaxed rule matter MORE
     * here, not less.
     */
    case 't9TowerVampires':
    case 't9TowerNagas':
    case 't9TowerMummies':
    case 't9TowerZombies':
    case 't9TowerOrcs':
    case 't9TowerDemons': {
      const race = raceForT9TowerId(spawner.recipeId);
      if (race === null) return false; // unreachable: the case labels ARE the six ids
      // ⭐⭐ S189 C2 item 2 — CONTAINS, as the tier-3 arm above. Ignition stays exact.
      return towerStandsAt(world, spawner.recipeId, spawner.anchorPrimitiveId);
    }
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
  world.goblinAutoFeedMemory.clear(); // ⭐ S193 T4 — no remembered toggle survives into the next match
  world.nextSpawnerId = 0;
}
