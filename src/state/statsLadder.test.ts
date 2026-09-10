/**
 * SPARK — S167 — **THE STAT LADDER, ENFORCED.** Owner: *"scaling will be for hp = 1, 2, 3 … 12"*.
 *
 * ## ⛔ WHY THIS FILE IS NEW WHEN `stats.ts` HAS CITED IT BY NAME FOR SIXTEEN SESSIONS
 *
 * `stats.ts`'s `STAT_POINT_MAX` docblock says, and has said since S151:
 *
 *   > *"`statsLadder.test.ts` asserts every SHIPPED unit sits inside the range; the range is
 *   > enforced by test, not by silent truncation."*
 *
 * **The file did not exist.** Not renamed, not skipped, not quarantined — never written. The comment
 * had been describing a guard nobody had made, and every session that read it (including this one)
 * came away believing the owner's ruled range was enforced.
 *
 * ⭐ AND IT COST SOMETHING, WHICH IS WHY THIS DOCBLOCK IS LONG. S167 shipped six tier-9 bosses at
 * **HP 40–60** — five times the ruled ceiling, on a board where nothing had ever exceeded voltkin's
 * 8. Measured afterwards, every boss one-shot every unit in the game and the Pharaoh could not be
 * killed inside a FIGHT phase at all. `tsc` was green, 4000 unit tests were green, the e2e lane was
 * green, and the only thing that should have objected was a sentence in a comment.
 *
 * **A comment claiming a guard is not a guard.**
 *
 * ## What the ladder actually is, and why HP/ATK and DEF/PEN are checked differently
 *
 * They are not the same kind of number, and treating them alike is the easy mistake here:
 *
 *   · **HP and ATK are POINTS on a flat ladder**, and the owner's range starts at 1. A 0-HP unit is
 *     dead on arrival and a 0-ATK attacker cannot ever kill anything, so `STAT_POINT_MIN = 1` is a
 *     real floor rather than a formality.
 *   · **DEF and PEN are indices into a MULTIPLIER ladder** (`multiplierFifths(n) = 5 + n`), where
 *     **0 is the legitimate identity** — ×1.0, "no armour" / "no penetration". Nine shipped units sit
 *     at 0 on one or both. Applying `STAT_POINT_MIN` to them would fail the suite on correct data.
 *
 * ⚠ THE CEILING IS SHARED, THE FLOOR IS NOT. That asymmetry is the whole content of this file.
 *
 * ## ⭐⭐ S172 — THE SIX BOSSES NOW HAVE THEIR OWN LANE, AND THE PARTITION IS THE POINT
 *
 * An owner ruling doubled every tier-9 boss's HP **and** DEF: *"boss health is not good enough. Vlad
 * died within, like, three seconds ... bosses should be a lot stronger. So let's double their health
 * and defense, whatever it is right now. Double it for all the bosses. Keep their damage as is."*
 * HP 10–12 → **20–24**, DEF 4–8 → **8–16**. ATK and PEN are UNTOUCHED on all six.
 *
 * ⛔ THE REPAIR WAS **NOT** TO RAISE THE SHARED CEILING TO 24. A single global `hp <= 24` would let a
 * goblin silently become a boss — the S167 accident above, restated one register quieter, and this
 * file would go on passing through it. So the roster is PARTITIONED: the non-boss units are still
 * held to the owner's 1..12, and the six bosses are held to their own two-sided band, pinned once in
 * the `BOSS_*` constants below and re-used by BOTH halves of this file so they cannot drift apart.
 * For a boss the HP check is now STRICTER than it was, not looser — it gained a floor of 20.
 *
 * ⚠ Because DEF is a MULTIPLIER, doubling both roughly TRIPLES the effective pool: Vlad 90 → 260
 * fifths, the Pharaoh 143 → 462. The one CONSEQUENCE assertion at the bottom of this file is what
 * still holds that in check, and its margin is now thin. Its docblock says by how much.
 *
 * ## ⚠ WHAT THIS DELIBERATELY DOES NOT CHECK
 *
 * **Structure DEF is UNCAPPED and must stay that way** — owner R76: *"No cap - def climbs with the
 * structure complexity"*. This file asserts CREATURE stats only. `stats.ts` records the same
 * boundary at `STAT_POINT_MAX` and gives the reason a clamp helper was never written: a clamp
 * sitting beside an uncapped stat is an invitation to apply it to the wrong one.
 */

import { describe, expect, it } from 'vitest';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { T9_BOSS_STATS } from '../constants.ts';
import { STAT_POINT_MAX, STAT_POINT_MIN, attackFifths, unitPoolFifths } from './stats.ts';
import type { CreatureType } from './creatures/creature.ts';

const ALL: ReadonlyArray<[CreatureType, (typeof CREATURE_CONFIGS)[CreatureType]]> =
  Object.entries(CREATURE_CONFIGS) as ReadonlyArray<
    [CreatureType, (typeof CREATURE_CONFIGS)[CreatureType]]
  >;

/* ────────────────────────────────────────────────────────────────────────────────────────────── *
 *  THE BOSS BAND — one definition, used by both describe blocks below
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐⭐ R141 SET THIS BAND AND S172 DOUBLED HALF OF IT. Both are kept, because overwriting a quoted
 * owner ruling with a newer one destroys the evidence of which half actually moved.
 *
 * R141, verbatim: *"i agree however with your boss recommendation of stats but slightly different
 * stats being HP 10–12, DEF 4–8, ATK 6-10 but you forgot PEN which will be 8-10. with varried
 * speed"*.
 *
 * S172, verbatim, SUPERSEDING ITS HP AND DEF ONLY: *"boss health is not good enough. Vlad died
 * within, like, three seconds ... bosses should be a lot stronger. So let's double their health and
 * defense, whatever it is right now. Double it for all the bosses. Keep their damage as is."*
 *
 * ⚠ *"Keep their damage as is"* is load-bearing, so ATK and PEN below are still R141's raw numbers
 * with no factor applied. The HP and DEF bounds are written as `R141 × 2` rather than as the literal
 * 20/24/8/16 so that the ruling that produced them is readable at the constant, per the rule that a
 * number which is not the owner's says so where it lives.
 */
const R141_HP_MIN = 10;
const R141_HP_MAX = 12;
const R141_DEF_MIN = 4;
const R141_DEF_MAX = 8;

const BOSS_HP_MIN = R141_HP_MIN * 2; // 20 — S172 "double their health"
const BOSS_HP_MAX = R141_HP_MAX * 2; // 24
const BOSS_DEF_MIN = R141_DEF_MIN * 2; // 8 — S172 "and defense"
const BOSS_DEF_MAX = R141_DEF_MAX * 2; // 16
const BOSS_ATK_MIN = 6; // R141, UNTOUCHED by S172 — "keep their damage as is"
const BOSS_ATK_MAX = 10; // R141, UNTOUCHED
const BOSS_PEN_MIN = 8; // R141, UNTOUCHED
const BOSS_PEN_MAX = 10; // R141, UNTOUCHED

/**
 * The six boss CREATURE TYPES, DERIVED from `T9_BOSS_STATS` rather than typed out, so that a seventh
 * boss cannot join the roster without joining this set in the same edit.
 *
 * ⭐ AND THE FAILURE DIRECTION IS THE SAFE ONE BY CONSTRUCTION: anything this set does not recognise
 * falls into the strict 1..12 lane, where a boss-sized stat FAILS LOUDLY. A misspelling here cannot
 * quietly grant an exemption; it can only refuse one.
 */
const BOSS_TYPES: ReadonlySet<string> = new Set(
  Object.keys(T9_BOSS_STATS).map((race) => `t9Boss${race[0].toUpperCase()}${race.slice(1)}`),
);

const isBoss = (type: CreatureType): boolean => BOSS_TYPES.has(type);

describe('S167 — the owner’s stat ladder holds for EVERY shipped creature', () => {
  it('is not vacuous — the roster is actually populated', () => {
    // A guard that iterates an empty list passes forever. This is the first thing to check.
    expect(ALL.length).toBeGreaterThanOrEqual(22);
  });

  it('⛔ the boss/non-boss PARTITION is real — six bosses resolve, the rest stay in the strict lane', () => {
    /*
     * S172 — a two-lane guard whose lanes nobody checks is the same defect this file exists for: it
     * would pass forever if `BOSS_TYPES` silently resolved to nothing, or to everything.
     */
    expect(BOSS_TYPES.size, 'T9_BOSS_STATS still holds six races').toBe(6);
    const bosses = ALL.filter(([type]) => isBoss(type));
    expect(bosses, 'every boss type resolves to a shipped CREATURE_CONFIGS entry').toHaveLength(6);
    expect(
      ALL.length - bosses.length,
      'the strict 1..12 lane is still the bulk of the roster, not a rump',
    ).toBeGreaterThanOrEqual(16);
  });

  it('⛔ HP is a POINT — 1..12 for the roster, 20..24 for the six bosses (S172 doubled theirs)', () => {
    /*
     * ⭐ S172 — TWO LANES, NOT ONE RAISED CEILING. The owner doubled boss HP (10–12 → 20–24) and
     * nothing else on the board moved, so widening the shared bound to 24 would have retired the
     * guard for all 22 non-boss units to accommodate six. For a boss this is now STRICTER than the
     * check it replaces: it gained a FLOOR of 20, which is what actually pins "a lot stronger".
     */
    for (const [type, c] of ALL) {
      const lo = isBoss(type) ? BOSS_HP_MIN : STAT_POINT_MIN;
      const hi = isBoss(type) ? BOSS_HP_MAX : STAT_POINT_MAX;
      expect(c.hp, `${type} hp`).toBeGreaterThanOrEqual(lo);
      expect(c.hp, `${type} hp`).toBeLessThanOrEqual(hi);
      expect(Number.isInteger(c.hp), `${type} hp must be an integer point`).toBe(true);
    }
  });

  // ⚠ ONE LANE, DELIBERATELY. S172 doubled HP and DEF only — *"keep their damage as is"* — so every
  // boss ATK is still R141's 6..10 and sits inside the shared ladder. Do not give this a boss lane.
  it('⛔ ATK is a POINT in 1..12 — a 0-ATK attacker could never kill anything', () => {
    for (const [type, c] of ALL) {
      expect(c.atk, `${type} atk`).toBeGreaterThanOrEqual(STAT_POINT_MIN);
      expect(c.atk, `${type} atk`).toBeLessThanOrEqual(STAT_POINT_MAX);
      expect(Number.isInteger(c.atk), `${type} atk must be an integer point`).toBe(true);
    }
  });

  it('DEF and PEN are LADDER INDICES in 0..12 — 0 is the identity; boss DEF is 8..16 (S172)', () => {
    /*
     * `multiplierFifths(0) === 5` is ×1.0. Nine shipped units sit at 0 on one or both, so applying
     * the HP/ATK floor here would fail the suite on correct data. Only the ceiling is shared.
     *
     * ⭐ S172 — DEF SPLITS INTO TWO LANES for the same reason HP does above: the owner's doubling
     * took boss DEF to 8..16, off the top of the shared ceiling. PEN does NOT split — that ruling
     * ended *"keep their damage as is"*, so PEN stays 0..12 for every unit on the board, bosses
     * included, and a boss PEN above 12 should still fail here.
     */
    for (const [type, c] of ALL) {
      expect(c.def, `${type} def`).toBeGreaterThanOrEqual(isBoss(type) ? BOSS_DEF_MIN : 0);
      expect(c.def, `${type} def`).toBeLessThanOrEqual(
        isBoss(type) ? BOSS_DEF_MAX : STAT_POINT_MAX,
      );
      expect(c.pen, `${type} pen`).toBeGreaterThanOrEqual(0);
      expect(c.pen, `${type} pen`).toBeLessThanOrEqual(STAT_POINT_MAX);
      expect(Number.isInteger(c.def), `${type} def must be an integer point`).toBe(true);
      expect(Number.isInteger(c.pen), `${type} pen must be an integer point`).toBe(true);
    }
  });

  it('every derived combat quantity stays an exact INTEGER in fifths', () => {
    /*
     * The determinism requirement, checked at the roster rather than in the abstract: `damageEntity`
     * THROWS on a non-integer amount, so a fractional pool or hit would be a live crash rather than a
     * rounding wobble — and the host and the ?worker=1 mirror must agree bit-for-bit.
     */
    for (const [type, c] of ALL) {
      expect(Number.isInteger(unitPoolFifths(c.hp, c.def)), `${type} pool`).toBe(true);
      expect(Number.isInteger(attackFifths(c.atk, c.pen)), `${type} damage`).toBe(true);
    }
  });
});

describe('S167 — and the ladder is MEANINGFUL: nothing on the board is unkillable', () => {
  /*
   * ⭐ THIS SECTION WAS REWRITTEN AFTER A NEGATIVE CONTROL FOUND MY FIRST VERSION OF IT VACUOUS, and
   * recording that is worth more than the test itself.
   *
   * I wrote two "consequence" assertions and claimed they were what the plain range check could not
   * catch. Then I ran them against the REJECTED HP 40–60 numbers, which is the only way to know a
   * guard discriminates. Result:
   *
   *   · HP in 1..12          — FAILED on all six. The range check was doing ALL the work.
   *   · squad-of-five kills  — PASSED. Five goblins do 60 fifths/s; even a 550-fifth Pharaoh dies in
   *                            9.2 s, so the bar was nowhere near the defect.
   *   · 5x overkill          — PASSED, and ⛔ IT WAS SELF-DEFEATING BY CONSTRUCTION: it measured
   *                            against `max(pool)` OF THE SAME SET, so inflating a boss RAISED THE
   *                            BAR THAT WOULD HAVE JUDGED IT. Under the old numbers the toughest pool
   *                            was 550 and the ceiling it computed was 2750 — a test that cannot fail
   *                            for the reason it exists. Deleted rather than tuned.
   *
   * What survives is ONE invariant that demonstrably discriminates, measured both ways: **a single
   * basic soldier, given a whole FIGHT phase, can remove any one unit in the game.** Against the
   * REJECTED S167 numbers the toughest unit needed 45.8 s — over the phase, so it FAILS. That is a
   * real game rule, not a tuned threshold: a unit no lone soldier can ever kill is not a hard unit,
   * it is a wall.
   *
   * ⚠⚠ S172 — **THIS IS THE ASSERTION THE OWNER'S DOUBLING WALKED UP TO, AND THE MARGIN IS NOW
   * THIN.** Doubling HP and DEF together roughly TRIPLES the pool, because DEF is a multiplier. The
   * toughest unit is still the Pharaoh, now 22 HP × (5 + 16) = **462 fifths**, which one goblin's
   * 12 fifths/s removes in **38.5 s** — inside the 45 s phase, but by 6.5 s where it used to clear
   * by 33.1 s. Nothing here was widened to let that through: the bar is still one goblin and still
   * 45 s, and the rejected numbers still fail it. ⭐ The next boss buff of any size breaks this
   * test, and when it does the test is RIGHT — that is precisely the point at which a boss stops
   * being hard and becomes a wall, and the owner should see the failure rather than a green suite.
   *
   * ⛔ AND THE SENTENCE THIS REPLACED WAS ALREADY WRONG BEFORE S172 TOUCHED IT, which is recorded
   * rather than quietly overwritten because this file's whole subject is comments that lie. It read
   * *"10.8 s for the toughest (the Pharaoh at 130 fifths)"* — 130 fifths is 10 HP / 8 DEF, but the
   * Pharaoh had since drifted to 11 HP, i.e. 143 fifths and 11.9 s. The prose had been one HP point
   * stale for as long as it took to notice, and no assertion could catch it: the number lived only
   * in a comment.
   */
  const FIGHT_SECONDS = 45; // the shipped FIGHT phase a fight has to resolve inside
  const SWINGS_PER_SECOND = 1; // the shipped 60-tick attack cadence

  it('⛔ ONE basic goblin, given a whole FIGHT phase, can kill ANY unit in the game', () => {
    const soldierDps = attackFifths(2, 1) * SWINGS_PER_SECOND; // one goblinMelee: 12 fifths/s
    for (const [type, c] of ALL) {
      const seconds = unitPoolFifths(c.hp, c.def) / soldierDps;
      expect(seconds, `${type} needs ${seconds.toFixed(1)}s of one goblin — a wall, not a hard unit`)
        .toBeLessThan(FIGHT_SECONDS);
    }
  });
});


/*
 * ⭐⭐ S168 — THE BOSS BAND IS THE OWNER'S, AND IT IS PINNED SEPARATELY FROM THE 1..12 LADDER.
 *
 * R141, verbatim: *"i agree however with your boss recommendation of stats but slightly different
 * stats being HP 10–12, DEF 4–8, ATK 6-10 but you forgot PEN which will be 8-10. with varried
 * speed"*.
 *
 * ⚠ THE GENERAL LADDER ABOVE CANNOT CATCH A DRIFT HERE. 1..12 admits HP 3 and PEN 0 — which is
 * exactly what these six had before he ruled. A band this specific needs its own guard or the next
 * balance pass silently walks out of it, which is the S167 failure mode restated: `stats.ts` cited a
 * guard by name for sixteen sessions and the file did not exist.
 *
 * ⭐⭐ S172 — **R141's HP AND DEF NUMBERS ARE SUPERSEDED HERE; ITS ATK AND PEN ARE NOT.** The owner
 * ruled: *"boss health is not good enough. Vlad died within, like, three seconds ... bosses should
 * be a lot stronger. So let's double their health and defense, whatever it is right now. Double it
 * for all the bosses. Keep their damage as is."* So HP 10–12 → 20–24 and DEF 4–8 → 8–16, while ATK
 * 6–10 and PEN 8–10 stand exactly as R141 wrote them. R141 is quoted above UNEDITED and the two
 * bands are both carried in the `BOSS_*` constants at the top of this file, so which half of a
 * ruling moved — and which did not — stays legible instead of being overwritten by the newer one.
 */
describe('S168/S172 — the six tier-9 bosses sit inside the band the owner ruled (R141, HP+DEF doubled by S172)', () => {
  const BOSSES = Object.entries(T9_BOSS_STATS);

  it('is not vacuous — there are six bosses to check', () => {
    expect(BOSSES).toHaveLength(6);
  });

  it('⛔ HP is 20..24 — R141’s 10..12, DOUBLED by the S172 ruling', () => {
    for (const [race, s] of BOSSES) {
      expect(s.hp, `${race} hp`).toBeGreaterThanOrEqual(BOSS_HP_MIN);
      expect(s.hp, `${race} hp`).toBeLessThanOrEqual(BOSS_HP_MAX);
    }
  });

  it('⛔ DEF is 8..16 — R141’s 4..8, DOUBLED by the S172 ruling', () => {
    for (const [race, s] of BOSSES) {
      expect(s.def, `${race} def`).toBeGreaterThanOrEqual(BOSS_DEF_MIN);
      expect(s.def, `${race} def`).toBeLessThanOrEqual(BOSS_DEF_MAX);
    }
  });

  it('⛔ ATK is 6..10 — R141, UNTOUCHED by S172: "keep their damage as is"', () => {
    for (const [race, s] of BOSSES) {
      expect(s.atk, `${race} atk`).toBeGreaterThanOrEqual(BOSS_ATK_MIN);
      expect(s.atk, `${race} atk`).toBeLessThanOrEqual(BOSS_ATK_MAX);
    }
  });

  it('⛔ PEN is 8..10 — the axis he pointed out I had forgotten; also untouched by S172', () => {
    for (const [race, s] of BOSSES) {
      expect(s.pen, `${race} pen`).toBeGreaterThanOrEqual(BOSS_PEN_MIN);
      expect(s.pen, `${race} pen`).toBeLessThanOrEqual(BOSS_PEN_MAX);
    }
  });

  it('⭐ "with varried speed" — six DISTINCT multipliers, none above 1.0', () => {
    const speeds = BOSSES.map(([, s]) => s.speedMul);
    expect(new Set(speeds).size, 'every boss moves at its own pace').toBe(6);
    for (const [race, s] of BOSSES) {
      expect(s.speedMul, `${race} must not outrun its escort`).toBeLessThanOrEqual(1.0);
      expect(s.speedMul, `${race} must actually move`).toBeGreaterThan(0);
    }
  });

  /*
   * The consequence of his PEN floor, asserted rather than only described in a comment. It is not a
   * complaint — a boss deleting chaff on contact is a fair reading of "boss" — but it IS a decision,
   * so it is on the books where a future session will trip over it before undoing it by accident.
   */
  it('⚠ his PEN floor means every boss one-shots a basic goblin — on the books, deliberately', () => {
    const goblinPool = unitPoolFifths(1, 2); // goblinMelee: 1 HP, 2 DEF ⇒ 7 fifths
    for (const [race, s] of BOSSES) {
      expect(attackFifths(s.atk, s.pen), `${race} vs a goblin`).toBeGreaterThanOrEqual(goblinPool);
    }
  });
});
