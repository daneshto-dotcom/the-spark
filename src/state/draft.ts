/**
 * SPARK — THE UPGRADE DRAFT: the pick vocabulary, the general track, and the buff maths.
 *
 * ⭐⭐ S187 (owner) — **A TIMED, PER-SEAT, ONE-OF-TWO PICK BEFORE WAVE 1 AND EVERY FIFTH WAVE.**
 *
 * > *"As the game starts, it gives you like five seconds to choose an upgrade, one of the two … on
 * > the left is like the regular one, the 10% HP to all spawned units, and on the right will be your
 * > racial one."* — owner, S187
 *
 * > *"They can take their time, they can take like as much as the whole build phase, but then in the
 * > end of the build phase it just takes the racial one automatically."*
 *
 * This module is **pure**: types, constants, the track table and the arithmetic. Everything that
 * touches `World` lives in `draftEvent.ts`, mirroring the `sudokuEvent.ts` split. The reason is a
 * concrete one — `game/player.ts` imports `DraftPick` from here, and a `World` import would close a
 * cycle.
 *
 * ## The shape of the thing, and what is his versus mine
 *
 * ⭐ HIS: the interval (every 5 waves, starting before wave 1), the two-option layout, the general
 * option being a percentage of HP, the axis ORDER (*"health and then defense and then attack and
 * penetration"*), the auto-pick on the BUILD deadline, and the COMING SOON right-hand tile for races
 * whose perk he has not yet designed.
 *
 * ⚠ MINE, and each says so where it is defined: the WRAP of the axis cycle past PEN, and the
 * fallback that auto-pick takes the general option when no racial is on offer.
 */

import {
  RACE_UNIT_ATK,
  RACE_UNIT_DEF,
  RACE_UNIT_HP,
  RACE_UNIT_PEN,
} from '../constants.ts';
import { applyDraftPercent, attackFifths, unitPoolFifths } from './stats.ts';

/**
 * ⭐ THE FOUR GENERAL OPTIONS, plus room for the racial ones.
 *
 * ⛔ **ADDING A VALUE HERE MEANS VISITING EVERY CONSUMER, NOT ONLY THE ONES `tsc` FORCES** (S182
 * lesson 7). The exhaustive switches fail the build; a consumer with a TOLERANT `default` will
 * silently do the wrong thing and stay green. When the six racial perks land, grep for
 * `DraftPick` and check every `default:` arm before assuming the compiler covered it.
 */
export type DraftPick = 'hp' | 'def' | 'atk' | 'pen';

/** Every value of `DraftPick`, for the exhaustiveness tests and the wire validator. */
export const DRAFT_PICKS: readonly DraftPick[] = ['hp', 'def', 'atk', 'pen'] as const;

/**
 * ⭐ HIS NUMBER: *"the 10% HP to all spawned units"*. One constant, so a retune after his first
 * playtest is a one-line change rather than an archaeology exercise.
 *
 * Read `applyDraftPercent` in `stats.ts` for why a percentage is expressible at all on a ladder
 * whose smallest unit is `1/1/1/1` — the floor-at-one rule is his, and it is what makes 10% of a
 * 6-fifth pool land as 7 instead of vanishing.
 */
export const DRAFT_BUFF_PCT = 10;

/**
 * ⭐ HIS INTERVAL: *"after the fight of every like five levels"*, with one before wave 1.
 *
 * ⚠ **THE PREDICATE IS `(wave - 1) % 5 === 0`, AND THE OFF-BY-ONE HERE IS REAL.** `world.waveNumber`
 * starts at **1** for the opening BUILD and increments on ENTRY INTO BUILD (`hostTick`), so the
 * BUILD that follows wave 5's FIGHT is wave **6** — not wave 5. Waves that draft are therefore
 * 1, 6, 11, 16, 21. `SPARK_RACES_SPEC.md` §9.7 records that §9.5 and §9.7 contradicted each other on
 * exactly this point in the original spec, which is why it is spelled out rather than inlined.
 */
export const DRAFT_WAVE_INTERVAL = 5;

/** True on the waves that open a draft: 1, 6, 11, 16, 21, … */
export function isDraftWave(waveNumber: number): boolean {
  return waveNumber >= 1 && (waveNumber - 1) % DRAFT_WAVE_INTERVAL === 0;
}

/** 0 for the pre-wave-1 draft, 1 at wave 6, 2 at wave 11, … Undefined behaviour off a draft wave. */
export function draftIndexForWave(waveNumber: number): number {
  return Math.floor((waveNumber - 1) / DRAFT_WAVE_INTERVAL);
}

/**
 * ⭐ HIS ORDER: *"It's like health and then defense and then attack and penetration."*
 *
 * ⚠ **THE WRAP IS MINE, NOT HIS.** He specified drafts at levels 0/5/10/15/20 — five points against
 * four axes — and did not say what the fifth one is. A CYCLE is the answer rather than a fifth table
 * row, because R101 makes the draft *"recurring with no ceiling"*: a table runs out and a cycle does
 * not. So wave 21 offers HP again. One line reverses it if he wants a fifth distinct thing.
 *
 * ⛔ This REPLACES R111's order (ATK → DEF → HP → PEN). His S187 wording is the later ruling and it
 * governs; R111 is superseded, not forgotten.
 */
export const GENERAL_TRACK: readonly DraftPick[] = ['hp', 'def', 'atk', 'pen'] as const;

/** The general option offered at a given wave. */
export function generalPickForWave(waveNumber: number): DraftPick {
  return GENERAL_TRACK[draftIndexForWave(waveNumber) % GENERAL_TRACK.length] as DraftPick;
}

/**
 * ⛔ **THE LADDER HAS ONLY TWO DERIVED NUMBERS, SO FOUR OPTIONS MOVE TWO VALUES.**
 *
 * `pool = HP × (5 + DEF)` and `damage = ATK × (5 + PEN)`. HP and DEF both feed the pool; ATK and PEN
 * both feed the damage. So an HP pick and a DEF pick have the *same* mechanical effect, as do ATK and
 * PEN. They stay four distinct options because they are four distinct things to the player — and
 * because R113 wants one icon per draft — but the sim only ever asks these two questions.
 *
 * ⚠ **REPORTED, NOT HIDDEN.** If he wants DEF to differ from HP, the ladder has to grow a third
 * derived quantity, which is a much larger change than this draft. Told to him rather than papered
 * over with two constants that happen to differ.
 */
export function isPoolPick(p: DraftPick): boolean {
  return p === 'hp' || p === 'def';
}

/** The complement of `isPoolPick` over the general axes. */
export function isDamagePick(p: DraftPick): boolean {
  return p === 'atk' || p === 'pen';
}

/** How many of a seat's picks raise the effective pool. */
export function poolPickCount(picks: readonly DraftPick[]): number {
  let n = 0;
  for (const p of picks) if (isPoolPick(p)) n++;
  return n;
}

/** How many of a seat's picks raise per-hit damage. */
export function damagePickCount(picks: readonly DraftPick[]): number {
  let n = 0;
  for (const p of picks) if (isDamagePick(p)) n++;
  return n;
}

/**
 * The buffed pool for a unit born to a seat holding `picks`.
 *
 * ⛔ **"FROM NOW ON" IS WHY THIS IS APPLIED AT BIRTH AND STORED**, never recomputed per read. The
 * owner's wording is *"10% HP to all spawned units from now on"* — a unit already on the board when
 * the draft resolves keeps the pool it was born with. Baking the value at birth is that rule, and it
 * is also what lets the number survive the wire: see `Creature.maxEhp`.
 */
export function draftedPoolFifths(hp: number, def: number, picks: readonly DraftPick[]): number {
  return applyDraftPercent(unitPoolFifths(hp, def), poolPickCount(picks), DRAFT_BUFF_PCT);
}

/** The buffed per-hit damage for an attacker belonging to a seat holding `picks`. */
export function draftedAttackFifths(atk: number, pen: number, picks: readonly DraftPick[]): number {
  return applyDraftPercent(attackFifths(atk, pen), damagePickCount(picks), DRAFT_BUFF_PCT);
}

/**
 * The race unit's pool at a given number of pool picks — the number the owner will actually watch.
 *
 * Exported because it is the worked example in the canon and in the tests: `6 → 7 → 8 → 9`. A helper
 * rather than a literal, so the canon assertion derives from the constants and cannot drift.
 */
export function raceUnitPoolAfterPicks(poolPicks: number): number {
  return applyDraftPercent(
    unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF),
    poolPicks,
    DRAFT_BUFF_PCT,
  );
}

/** The race unit's per-hit damage at a given number of damage picks. */
export function raceUnitAttackAfterPicks(damagePicks: number): number {
  return applyDraftPercent(
    attackFifths(RACE_UNIT_ATK, RACE_UNIT_PEN),
    damagePicks,
    DRAFT_BUFF_PCT,
  );
}
