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
 * ## ⚠ WHAT THIS DELIBERATELY DOES NOT CHECK
 *
 * **Structure DEF is UNCAPPED and must stay that way** — owner R76: *"No cap - def climbs with the
 * structure complexity"*. This file asserts CREATURE stats only. `stats.ts` records the same
 * boundary at `STAT_POINT_MAX` and gives the reason a clamp helper was never written: a clamp
 * sitting beside an uncapped stat is an invitation to apply it to the wrong one.
 */

import { describe, expect, it } from 'vitest';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { STAT_POINT_MAX, STAT_POINT_MIN, attackFifths, unitPoolFifths } from './stats.ts';
import type { CreatureType } from './creatures/creature.ts';

const ALL: ReadonlyArray<[CreatureType, (typeof CREATURE_CONFIGS)[CreatureType]]> =
  Object.entries(CREATURE_CONFIGS) as ReadonlyArray<
    [CreatureType, (typeof CREATURE_CONFIGS)[CreatureType]]
  >;

describe('S167 — the owner’s stat ladder holds for EVERY shipped creature', () => {
  it('is not vacuous — the roster is actually populated', () => {
    // A guard that iterates an empty list passes forever. This is the first thing to check.
    expect(ALL.length).toBeGreaterThanOrEqual(22);
  });

  it('⛔ HP is a POINT in 1..12 — the range the owner ruled', () => {
    for (const [type, c] of ALL) {
      expect(c.hp, `${type} hp`).toBeGreaterThanOrEqual(STAT_POINT_MIN);
      expect(c.hp, `${type} hp`).toBeLessThanOrEqual(STAT_POINT_MAX);
      expect(Number.isInteger(c.hp), `${type} hp must be an integer point`).toBe(true);
    }
  });

  it('⛔ ATK is a POINT in 1..12 — a 0-ATK attacker could never kill anything', () => {
    for (const [type, c] of ALL) {
      expect(c.atk, `${type} atk`).toBeGreaterThanOrEqual(STAT_POINT_MIN);
      expect(c.atk, `${type} atk`).toBeLessThanOrEqual(STAT_POINT_MAX);
      expect(Number.isInteger(c.atk), `${type} atk must be an integer point`).toBe(true);
    }
  });

  it('DEF and PEN are LADDER INDICES in 0..12 — 0 is the identity, not a violation', () => {
    /*
     * `multiplierFifths(0) === 5` is ×1.0. Nine shipped units sit at 0 on one or both, so applying
     * the HP/ATK floor here would fail the suite on correct data. Only the ceiling is shared.
     */
    for (const [type, c] of ALL) {
      expect(c.def, `${type} def`).toBeGreaterThanOrEqual(0);
      expect(c.def, `${type} def`).toBeLessThanOrEqual(STAT_POINT_MAX);
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
   * basic soldier, given a whole FIGHT phase, can remove any one unit in the game.** New numbers:
   * 10.8 s for the toughest (the Pharaoh at 130 fifths). Old numbers: 45.8 s — over the phase, so it
   * FAILS. That is a real game rule, not a tuned threshold: a unit no lone soldier can ever kill is
   * not a hard unit, it is a wall.
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
