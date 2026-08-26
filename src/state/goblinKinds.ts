/**
 * SPARK — S151 P3 — the shape → goblin map, in a module with NO SIDE EFFECTS.
 *
 * ## ⛔ WHY THIS IS ITS OWN FILE, AND IT IS NOT ORGANISATIONAL TIDINESS
 *
 * This map started life inside `godlyRecipes/goblinTower.ts`, next to the recipe that uses it. That
 * broke the game, and the codebase had already written down exactly how:
 *
 * > *"Every recipe module calls `registerRecipe` at its tail, so a value import fires that
 * > registration — and because `world.ts` imports the blueprint reducer … the registry would end up
 * > populated for EVERY module in the codebase that touches `world.ts`. That is essentially all of
 * > it."* — `state/blueprints.ts`, S144 P1
 *
 * `FEED_TOWER`'s reducer needs the map, `world.ts` imports the reducer, so importing the map from
 * the recipe module made `world.ts` transitively register every recipe at import time. The measured
 * consequence in S144 was that it silently rewired `recipeStillSatisfied`, whose documented fallback
 * is *"no recipe registered → just check the anchor exists"*; in S151 P3 it showed up as the
 * `?worker=1` bots match never leaving TITLE, with 198 polls throwing during boot.
 *
 * ⚠ THE FAILURE IS NOT LOCAL TO THE FILE THAT CAUSES IT. Nothing about `goblinTowerFeed.ts` looks
 * wrong, nothing about `goblinTower.ts` looks wrong, and the only symptom is a completely unrelated
 * end-to-end test timing out. Keeping the data a recipe SHARES in a leaf module — importable from
 * anywhere, side-effect-free — is the structural fix rather than a rule someone has to remember.
 *
 * Pixi-free, DOM-free, World-free, and it registers nothing.
 */

import { GOBLIN_TOWER_HUB_DEGREE, GOBLIN_TOWER_SIZE, SparkType } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import type { PlayerId, PrimitiveId, SpawnerId } from '../types.ts';
import type { World } from './worldTypes.ts';
import type { CreatureType } from './creatures/creature.ts';

/**
 * ⭐ THE SHAPE → GOBLIN MAP (owner R70, roadmap Q1), and the reason the goblin tower is ONE tower.
 *
 * Owner: *"Dot -> suicide, Line -> archer, Triangle -> swordsman, Square -> shield goblin,
 * Circle -> hound, Spiral -> bat rider."*
 *
 * Every other producing structure decides its output at BUILD time; this one decides at FEED time,
 * so a single tower covers the whole goblin roster and the player picks per unit.
 *
 * `Record<SparkType, CreatureType>` rather than a partial map, so a new primitive type cannot be
 * added without deciding what the tower makes from it — the same forcing-function discipline as the
 * role and targeting tables in `state/stats.ts`.
 */
export const GOBLIN_FEED_MAP: Readonly<Record<SparkType, CreatureType>> = {
  [SparkType.Dot]: 'goblinSuicide',
  [SparkType.Line]: 'goblinArcher',
  [SparkType.Triangle]: 'goblinMelee',
  [SparkType.Square]: 'goblinShield',
  [SparkType.Circle]: 'goblinHound',
  [SparkType.Spiral]: 'goblinBat',
};

/**
 * Is the component anchored at `circleId` a 1-Circle(deg 4) + 4-Circle star — i.e. a live goblin
 * tower?
 *
 * ⚠ THIS LIVES IN THE LEAF, NOT IN THE RECIPE MODULE, FOR THE SAME REASON THE MAP DOES.
 * `spawnerLifecycle.recipeStillSatisfied` must call it every poll, and `world.ts` reaches
 * `spawnerLifecycle` — so importing it from `godlyRecipes/goblinTower.ts` would fire that module's
 * `registerRecipe` for essentially the whole codebase (the S144 trap; see this file's header).
 *
 * ⛔ AND WITHOUT THIS BEING CALLED, THE TOWER IS IMMORTAL. `recipeStillSatisfied`'s `default:` arm
 * only checks that the anchor primitive still exists, so a tower whose four leaves were eaten would
 * keep producing goblins off a single lone Circle — with no error anywhere.
 */
export function isGoblinTowerComponent(world: World, circleId: PrimitiveId): boolean {
  const hub = world.primitives.get(circleId);
  if (hub === undefined) return false;
  if (hub.type !== SparkType.Circle) return false;
  if (hub.bonds.size !== GOBLIN_TOWER_HUB_DEGREE) return false;
  const comp = componentOf(hub, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== GOBLIN_TOWER_SIZE) return false;
  for (const id of comp.primitiveIds) {
    if (id === circleId) continue;
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    if (p.type !== SparkType.Circle) return false; // every non-hub member must be a Circle
  }
  return true;
}


/**
 * S153 P3 (owner R79) — this seat's LIVE goblin tower in the component containing `primitiveId`,
 * or null.
 *
 * ⭐ ONE PREDICATE, TWO CALLERS, AND THAT IS THE POINT. The input layer has to decide whether a
 * click may open the popover at all, and the panel has to decide whether to draw a FEED row. Those
 * two answers MUST agree: a click that opens a popover the model then refuses swallows the click
 * and reads as a dead zone, and a panel offering FEED on something the input layer will not let you
 * click is worse. `structurePanel` grew its own private copy of this walk (`goblinTowerAmong`);
 * this replaces it rather than adding a third.
 *
 * ⚠ NO PHASE CHECK LIVES HERE, deliberately. R19's phase gate belongs to FIX and SCRAP and is
 * composed by `canBuildNow` at their own call sites — `structureRepair.ts` is emphatic that they
 * "must never grow their own matchPhase line", and the same discipline says this must not grow the
 * inverse. Callers compose WHEN; this answers only WHAT.
 *
 * Lives in the leaf for the reason the whole file exists: `world.ts` reaches the input and panel
 * layers, and importing a recipe module from either would fire every `registerRecipe` in the tree.
 */
export function seatGoblinTowerAt(
  world: World,
  seat: PlayerId,
  primitiveId: PrimitiveId,
): SpawnerId | null {
  const seed = world.primitives.get(primitiveId);
  if (seed === undefined) return null;
  const comp = componentOf(seed, world.primitives, world.bonds);
  for (const sp of world.creatureSpawners.values()) {
    if (sp.recipeId !== 'goblinTower') continue;
    if (sp.ownerPlayerId !== seat) continue;
    if (!comp.primitiveIds.has(sp.anchorPrimitiveId)) continue;
    // Re-validated, not trusted: the host's revalidation poll can lag a leaf being eaten, and a
    // tower that no longer satisfies its recipe must not still offer to spawn from it.
    if (!isGoblinTowerComponent(world, sp.anchorPrimitiveId)) continue;
    return sp.id;
  }
  return null;
}
