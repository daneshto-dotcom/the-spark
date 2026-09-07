/**
 * SPARK — S167 — the TIER-9 BOSS TOWER's LOOKUP TABLES, in a side-effect-free leaf.
 *
 * ⛔ THIS FILE EXISTS FOR THE SAME REASON `raceTowerIds.ts` DOES, AND IT IS THE S144 P1 BUG.
 * `godlyRecipes/t9BossTower.ts` calls `registerRecipe` at its tail, so ANY value import of it fires
 * six registrations as a side effect. `blueprints.ts` says so in its own docblock, `goblinKinds.ts`
 * solved it first for `GOBLIN_FEED_MAP`, and `raceTowerIds.ts` solved it again for the tier-3 ring.
 * This is the third instance of one pattern, which is why it is a pattern and not a workaround.
 *
 * ⚠ NOTHING IN THIS FILE MAY IMPORT A RECIPE MODULE. Pixi-free, World-free, registry-free — data
 * and the lookups over it. `spawnerLifecycle.ts` and `world.ts` both reach this file.
 *
 * ## ⭐ THE WIRE LITERALS ARE KEYED BY RACE, NEVER BY BOSS NAME
 *
 * `Spawner.recipeId` and `Creature.type` are SERIALIZED — they ride the wire and are restored by
 * `save.ts` — so renaming one later is a PROTOCOL_VERSION bump for zero gameplay gain. That is the
 * exact argument `SPARK_RACES_SPEC.md` uses to refuse renaming the global goblin tower, and
 * `RACE_TOWER_IDS` already follows it.
 *
 * ⛔ AND HERE IT IS LOAD-BEARING RATHER THAN TIDY, because one of the six names is UNDECIDED. The
 * owner named the zombie boss **Whopper** (after the Resident Evil 2 brute) and
 * `RACE_ZONES_AND_BOSS_TOWERS.md` §B flags that "Whopper" is a live Burger King trademark — a
 * decision he has not yet made. A `t9BossWhopper` literal would weld that unresolved word into the
 * wire format and make changing it cost a protocol bump.
 *
 * Keyed by race, every boss NAME lives in `T9_BOSS_NAMES` below — a display table that can be
 * changed for FREE, with no bump, no migration and no stale-peer hazard. The art paths are keyed by
 * race for the same reason, so not even a FILENAME carries the word.
 */

import { ALL_RACES, type RaceId } from './races.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { GodlyId } from './godlyRecipes/types.ts';

/**
 * ⭐ NINE of the race's own feed shape, closed in a ring — owner, verbatim: *"we will build a tier 9
 * tower for each of them !! it will take 9 of the same shape to buuild - the race shape"*.
 *
 * ⚠ NINE IS ALSO THE NUMBER THE SUDOKU TRIAL USED TO WANT, and it does not any more. Owner R132
 * (S164) moved `NONET_SHAPE_COUNT` to **12** precisely to free 9 for this tower, so the two
 * mechanics no longer compete. `sudokuEvent.ts` reads `export const NONET_SHAPE_COUNT = 12;` and
 * `detectNonet` skips any component whose size is not EXACTLY that — so a 9-ring cannot fire it.
 */
export const T9_TOWER_SIZE = 9;

/**
 * ⭐ RACE → the tower's serialized `GodlyId`. See the file docblock for why these are race-keyed.
 */
export const T9_TOWER_IDS: Readonly<Record<RaceId, GodlyId>> = {
  vampires: 't9TowerVampires',
  nagas: 't9TowerNagas',
  mummies: 't9TowerMummies',
  zombies: 't9TowerZombies',
  orcs: 't9TowerOrcs',
  demons: 't9TowerDemons',
};

/**
 * ⭐ RACE → the boss's serialized `CreatureType`.
 *
 * ⛔ SIX LITERALS AND NOT ONE, on the same grounds that forced six for the tier-3 units rather than
 * the single `raceUnit` the castle emits: `serializeCreature` writes `hp` only when a creature is
 * DAMAGED, so an undamaged one carries no stats on the wire and the receiving peer reconstructs
 * them from its OWN `CREATURE_CONFIGS`, keyed by TYPE. Six bosses with six different stat lines are
 * therefore only expressible as six TYPES — one literal plus a race lookup would desync the moment
 * two peers disagreed about the Kraken's HP.
 */
export const T9_BOSS_TYPE: Readonly<Record<RaceId, CreatureType>> = {
  vampires: 't9BossVampires',
  nagas: 't9BossNagas',
  mummies: 't9BossMummies',
  zombies: 't9BossZombies',
  orcs: 't9BossOrcs',
  demons: 't9BossDemons',
};

/**
 * ⭐ RACE → the boss's player-facing NAME. Owner-named, all six (S166).
 *
 * ⚠ THIS IS THE ONLY PLACE ANY OF THESE WORDS APPEARS. Not in a `GodlyId`, not in a `CreatureType`,
 * not in an art path — see the file docblock. Changing one is a one-word edit here and costs
 * nothing anywhere else, which is what keeps the pending "Whopper" trademark call cheap.
 *
 * ⛔ 'WHOPPER' IS THE ONE STILL AWAITING THE OWNER. The creature concept — a hugely bloated,
 * swollen undead brute — is generic and safe; only the WORD carries trademark exposure.
 * `RACE_ZONES_AND_BOSS_TOWERS.md` §B offers BLOAT / GLUTTON / THE SWOLLEN / TUMOR. His call.
 */
export const T9_BOSS_NAMES: Readonly<Record<RaceId, string>> = {
  vampires: 'VLAD',
  nagas: 'KRAKEN',
  mummies: 'PHARAOH',
  zombies: 'WHOPPER',
  orcs: 'WARLORD',
  demons: 'ARCHDEMON',
};

/**
 * ⭐ RACE → the panel label, DERIVED from the boss name rather than restated.
 *
 * ⚠ DERIVED, WHERE THE TIER-3 EQUIVALENT IS A TABLE, and the divergence is deliberate. Every
 * tier-3 label was settled art before the code existed, so a table cost nothing; a tier-9 boss name
 * is still moving, and two hand-written copies of a moving name is how one of them goes stale.
 * `RACE_TOWER_LABELS`' own reasoning still holds — the label names the thing the player is choosing
 * at the panel, which for this tower is the BOSS.
 */
export function t9TowerLabel(race: RaceId): string {
  return `${T9_BOSS_NAMES[race]} TOWER`;
}

/**
 * ⭐ RACE → the feed BUTTON caption. The tier-9 tower is NOT fed (it is one-shot), so this exists
 * only for the codex and the structure panel, where the budget is the same 34 px the goblin row set.
 * 'ARCHDEMON' does not fit; the demon caption is 'DEMON'.
 */
export const T9_SHORT_NAME: Readonly<Record<RaceId, string>> = {
  vampires: 'VLAD',
  nagas: 'KRAKEN',
  mummies: 'PHARAOH',
  zombies: 'WHOPPER',
  orcs: 'WARLORD',
  demons: 'DEMON',
};

/**
 * The boss's own atlas base, WITHOUT the `-atlas.png` / `-anim.json` suffix.
 *
 * ⚠ KEYED BY RACE, WHERE THE TIER-3 UNITS ARE KEYED BY CREATURE NAME (`t3-zombies-hound`). That
 * asymmetry is the point: `T3_ART_SLUG` exists because the tier-3 art was FILED under creature names
 * before the code existed, and a path built from the race alone 404s. Nothing is filed yet here, so
 * the naming is mine to choose — and choosing the race keeps the pending "Whopper" call from
 * reaching a filename.
 *
 * ⛔ A FAILED `Assets.load` IN THIS STACK IS SILENT (it falls back to a procedural puppet), which is
 * exactly the class of bug that ships looking fine. `t9BossTower.test.ts` asserts every path this
 * function builds exists on disk.
 */
export function t9BossAtlasBase(race: RaceId): string {
  return `/art/race-tier9-bosses/t9boss-${race}`;
}

/** The tower's own three-state atlas base (intact / damaged / destroyed). */
export function t9TowerAtlasBase(race: RaceId): string {
  return `/art/race-tier9-towers/t9tower-${race}`;
}

/**
 * The tower's CRUMBLE cinematic atlas base — a separate atlas from the three stills above.
 *
 * ⚠ SEPARATE BECAUSE `framesPerState` IS A PER-SPEC VALUE, so one atlas spec cannot hold both the
 * still conditions (1 frame) and an animated collapse (12). `destroy-atlas-specs.json` in the
 * tier-3 folder is the worked example and gives the same reason.
 */
export function t9DestroyAtlasBase(race: RaceId): string {
  return `/art/race-tier9-towers/t9destroy-${race}`;
}

/** Reverse lookup: the race a tier-9 tower id belongs to, or `null` for any other recipe. */
export function raceForT9TowerId(id: GodlyId): RaceId | null {
  for (const race of ALL_RACES) {
    if (T9_TOWER_IDS[race] === id) return race;
  }
  return null;
}

/** Is `id` one of the six tier-9 boss towers? The cheap guard for the emit and teardown paths. */
export function isT9TowerId(id: GodlyId): boolean {
  return raceForT9TowerId(id) !== null;
}

/** Reverse lookup: the race a boss creature belongs to, or `null` for any other creature type. */
export function raceForT9BossType(type: CreatureType): RaceId | null {
  for (const race of ALL_RACES) {
    if (T9_BOSS_TYPE[race] === type) return race;
  }
  return null;
}

/** Is `type` one of the six bosses? The cheap guard for the renderer and the phase-survival path. */
export function isT9BossType(type: CreatureType): boolean {
  return raceForT9BossType(type) !== null;
}
