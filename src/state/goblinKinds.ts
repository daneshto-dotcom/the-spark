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

import { SparkType } from '../constants.ts';
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
