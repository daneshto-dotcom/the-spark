/**
 * SPARK — S166 — the tier-3 race tower's LOOKUP TABLES, in a side-effect-free leaf.
 *
 * ⛔ THIS FILE EXISTS FOR ONE REASON AND IT IS THE S144 P1 BUG. `godlyRecipes/raceTower.ts` calls
 * `registerRecipe` at its tail, so ANY value import of it fires six registrations as a side effect.
 * `blueprints.ts` says so in its own docblock — *"Do not [import each recipe's own exported
 * constant]. Every recipe module calls `registerRecipe` at its tail, so a value import fires that
 * registration"* — and `goblinTower.ts` already solved the identical problem the identical way,
 * parking `GOBLIN_FEED_MAP` in `goblinKinds.ts` so `world.ts` could reach it *"WITHOUT transitively
 * registering every recipe"*.
 *
 * So the DATA lives here and the RECIPES live there. `raceTower.ts` re-exports these for the callers
 * that already depend on it, which keeps one import path for consumers that do not care.
 *
 * ⚠ NOTHING IN THIS FILE MAY IMPORT A RECIPE MODULE, and that is the whole contract. Pixi-free,
 * World-free, registry-free — data and two lookups over it.
 */

import { ALL_RACES, type RaceId } from './races.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

/**
 * R119 — three shapes, three bonds. **A ring, so the shape count and the bond count agree**, which
 * is unusual here but not unique (the pentagram is 5 and 5). Lives in this leaf rather than beside
 * the recipe so `blueprints.ts` can read it without firing `registerRecipe`.
 */
export const RACE_TOWER_SIZE = 3;

/**
 * ⭐ RACE → the tower's serialized `GodlyId`.
 *
 * ⛔ SERIALIZED LITERALS. `Spawner.recipeId` rides the wire and is restored by `save.ts`, so these
 * strings are a wire format: renaming one is a protocol bump for zero gameplay gain, which is the
 * exact argument `SPARK_RACES_SPEC.md` uses to refuse renaming the global goblin tower.
 */
export const RACE_TOWER_IDS: Readonly<Record<RaceId, GodlyId>> = {
  vampires: 't3TowerVampires',
  nagas: 't3TowerNagas',
  mummies: 't3TowerMummies',
  zombies: 't3TowerZombies',
  orcs: 't3TowerOrcs',
  demons: 't3TowerDemons',
};

/**
 * ⭐ RACE → the player-facing panel label.
 *
 * Named for the UNIT, not the race, because that is the decision the player is making at the panel:
 * R119's own phrasing is *"it will build the zombie hound tower"*. `blueprintCost` already shows the
 * shape count, so the label does not repeat it.
 */
export const RACE_TOWER_LABELS: Readonly<Record<RaceId, string>> = {
  vampires: 'BAT TOWER',
  nagas: 'PIRANHA TOWER',
  mummies: 'SCARAB TOWER',
  zombies: 'HOUND TOWER',
  orcs: 'WARBAND TOWER',
  demons: 'SOULEATER TOWER',
};

/**
 * ⭐ RACE → the creature its tower emits (R134's SECOND population).
 *
 * ⛔ NOT the castle's `raceUnit`. R134 splits them deliberately: *"I do like the designs you have
 * just made so we will use those as the castle spawn. and the ones we have mentioned and defined in
 * the earlier sesison we will use for the tier 3 building."* Emitting `raceUnit` here to make testing
 * easier would collapse the two populations the owner had just separated.
 */
export const RACE_TOWER_UNIT: Readonly<Record<RaceId, CreatureType>> = {
  vampires: 't3Bat',
  nagas: 't3Piranha',
  mummies: 't3Scarab',
  zombies: 't3Hound',
  orcs: 't3Warband',
  demons: 't3Souleater',
};

/**
 * ⭐ RACE → the feed BUTTON caption, mirroring `GOBLIN_SHORT_NAME`.
 *
 * ⚠ SHORT ENOUGH FOR A 34px BUTTON. The goblin row's captions set the precedent and the budget;
 * 'SOULEATER' does not fit, so the demon caption is 'SOUL'.
 */
export const T3_SHORT_NAME: Readonly<Record<RaceId, string>> = {
  vampires: 'BAT',
  nagas: 'PIRANHA',
  mummies: 'SCARAB',
  zombies: 'HOUND',
  orcs: 'RAIDER',
  demons: 'SOUL',
};

/**
 * ⭐ RACE → the art slug its atlases are filed under.
 *
 * ⛔ THIS EXISTS BECAUSE THE FILENAMES ARE `t3-<race>-<CREATURE>`, NOT `t3-<race>`. The art on disk
 * is `t3-zombies-hound-atlas.png`, `t3-nagas-piranha-atlas.png` and so on, so a path built from the
 * race alone 404s — and a failed `Assets.load` in this renderer stack is SILENT by design (it falls
 * back to a procedural puppet), which is exactly the class of bug that ships looking fine.
 *
 * ⚠ It restates the creature names from `RACE_TOWER_UNIT` in lower case rather than deriving them,
 * because the two are independently authored: one is a serialized wire literal, the other is a
 * filename chosen by the art pipeline. `raceTower.test.ts` asserts every built path exists on disk.
 */
export const T3_ART_SLUG: Readonly<Record<RaceId, string>> = {
  vampires: 'bat',
  nagas: 'piranha',
  mummies: 'scarab',
  zombies: 'hound',
  orcs: 'warband',
  demons: 'souleater',
};

/** The unit atlas base for `race`, WITHOUT the `-atlas.png` / `-anim.json` suffix. */
export function t3UnitAtlasBase(race: RaceId): string {
  return `/art/race-tier3-units/t3-${race}-${T3_ART_SLUG[race]}`;
}

/** The tower's own four-state atlas base (intact / spawning / damaged / destroyed). */
export function t3TowerAtlasBase(race: RaceId): string {
  return `/art/race-tier3-towers/t3tower-${race}`;
}

/**
 * The tower's DESTRUCTION CINEMATIC atlas base — a separate sheet from the four stills above.
 *
 * ⚠ SEPARATE BECAUSE `framesPerState` IS A PER-SPEC VALUE, so one atlas spec cannot hold both the
 * still conditions (1 frame) and an animated collapse (12). `destroy-atlas-specs.json` in the
 * tier-3 source folder is the worked example and gives the same reason.
 *
 * ⭐ S167 — ADDED WHEN THE CRUMBLE WAS FINALLY WIRED. These six sheets shipped in S165 and had no
 * accessor at all, which is a sharper version of the same defect `t3TowerAtlasBase` had: not merely
 * uncalled, but unreachable — there was no function that could name them.
 */
export function t3DestroyAtlasBase(race: RaceId): string {
  return `/art/race-tier3-towers/t3destroy-${race}`;
}

/** Reverse lookup: the race a tower id belongs to, or `null` for any other recipe. */
export function raceForTowerId(id: GodlyId): RaceId | null {
  for (const race of ALL_RACES) {
    if (RACE_TOWER_IDS[race] === id) return race;
  }
  return null;
}

/** Is `id` one of the six race towers? The cheap guard for the feed and emit paths. */
export function isRaceTowerId(id: GodlyId): boolean {
  return raceForTowerId(id) !== null;
}
