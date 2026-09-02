/**
 * SPARK — W1-A (S160): THE RACE ROSTER. Six races, one per player colour.
 *
 * `SPARK_RACES_SPEC.md` §2 is LOCKED and owner-ruled (R93). These assertions exist so that the two
 * things most likely to go wrong quietly cannot:
 *
 *   1. **THE PALETTE TRIPWIRE.** `RACE_COLORS` duplicates `PLAYER_COLORS` as literals rather than
 *      importing and indexing it. That is deliberate — but duplication rots, so the equality is
 *      asserted here. A palette retune reddens THIS test and forces a decision about the races,
 *      instead of silently redefining six of them.
 *   2. **EXHAUSTIVENESS.** The spec's §10 trap 1 is `ALL_BLUEPRINT_IDS`: a hand-written array of ids
 *      drifted from its `Record` and a fully working tower never appeared in the build panel, with
 *      every test green. `ALL_RACES` is exactly that shape of hazard, so the array and the Records
 *      are cross-checked in both directions.
 */
import { describe, expect, it } from 'vitest';

import { PLAYER_COLORS, SparkType } from '../constants.ts';
import {
  ALL_RACES,
  RACE_COLORS,
  RACE_FEED_SHAPE,
  defaultRaceForSeat,
  isRaceId,
  type RaceId,
} from './races.ts';

describe('W1-A — the roster is six, and it matches the palette', () => {
  it('⭐ THE TRIPWIRE: RACE_COLORS is PLAYER_COLORS, in order', () => {
    // If this fails, someone retuned the palette. That is allowed — but it reassigns a race's
    // identity colour, so it is a decision, not a refactor. Update both and say why.
    expect(ALL_RACES.length).toBe(PLAYER_COLORS.length);
    ALL_RACES.forEach((race, i) => {
      expect(RACE_COLORS[race], `${race} is seat ${i}'s colour`).toBe(PLAYER_COLORS[i]);
    });
  });

  it('the six ids are exactly the six the owner ruled (R93), with no duplicates', () => {
    expect([...ALL_RACES].sort()).toEqual(
      ['demons', 'mummies', 'nagas', 'orcs', 'vampires', 'zombies'],
    );
    expect(new Set(ALL_RACES).size, 'a duplicate would silently steal a seat default').toBe(6);
  });

  it('ALL_RACES and the Records cover each other — the ALL_BLUEPRINT_IDS trap, foreclosed', () => {
    // Records are exhaustiveness-checked by tsc; the ARRAY is not. So assert the array is complete
    // against the Records at runtime, which is the half tsc cannot do.
    expect(Object.keys(RACE_COLORS).sort()).toEqual([...ALL_RACES].sort());
    expect(Object.keys(RACE_FEED_SHAPE).sort()).toEqual([...ALL_RACES].sort());
    for (const race of ALL_RACES) {
      expect(RACE_COLORS[race], `${race} has a colour`).toBeTypeOf('number');
      expect(RACE_FEED_SHAPE[race], `${race} has a feed shape`).toBeDefined();
    }
  });

  it('the feed shapes are the six DISTINCT primitives (R109) — one race, one shape', () => {
    const shapes = ALL_RACES.map((r) => RACE_FEED_SHAPE[r]);
    expect(new Set(shapes).size, 'two races sharing a feed shape would make the tower ambiguous').toBe(6);
    // ⚠ Orange→Dot is forced by ELIMINATION, not by hue: there is no orange primitive and Dot is the
    // only shape left. Pinned so nobody "corrects" it toward a nicer-looking mapping.
    expect(RACE_FEED_SHAPE.orcs).toBe(SparkType.Dot);
    expect(RACE_FEED_SHAPE.zombies).toBe(SparkType.Circle);
  });
});

describe('W1-A — defaultRaceForSeat is TOTAL', () => {
  it('seats 0..5 map to the palette order', () => {
    ALL_RACES.forEach((race, seat) => expect(defaultRaceForSeat(seat)).toBe(race));
  });

  it('⭐ and it never returns undefined, for ANY number — modulo, not a bounds check', () => {
    // The reason it is modulo: it must stay total if MAX_PLAYERS or the palette length ever moves.
    // A seat past the end, a negative seat and a fractional seat all have to land on a real race,
    // because the value feeds `RACE_COLORS[...]` and an undefined there paints `undefined`.
    for (const seat of [0, 5, 6, 11, 12, 99, 1000, -1, -6, -7, 2.7, -2.7]) {
      const race = defaultRaceForSeat(seat);
      expect(isRaceId(race), `seat ${seat} produced ${String(race)}`).toBe(true);
      expect(RACE_COLORS[race]).toBeTypeOf('number');
    }
  });

  it('wraps rather than clamping, in both directions', () => {
    expect(defaultRaceForSeat(6)).toBe(defaultRaceForSeat(0));
    expect(defaultRaceForSeat(-1)).toBe(defaultRaceForSeat(5));
    expect(defaultRaceForSeat(-6)).toBe(defaultRaceForSeat(0));
  });
});

describe('W1-A — isRaceId is FAIL-CLOSED', () => {
  it('accepts exactly the six', () => {
    for (const race of ALL_RACES) expect(isRaceId(race)).toBe(true);
  });

  it('⭐ rejects everything else, including the near-misses that cross the wire', () => {
    // This guard is the only thing between a bare string off the wire / off disk and
    // `RACE_COLORS[...]`. Case, whitespace and plausible-looking synonyms all have to fail.
    const rejects: unknown[] = [
      undefined, null, '', ' ', 0, 1, NaN, true, false, {}, [], () => {},
      'Vampires', 'VAMPIRES', ' vampires', 'vampires ', 'vampire',
      'ghosts', 'iceGiants', 'goblins', // R114 — out, not parked
      'toString', 'constructor', '__proto__', // prototype keys must not read as races
    ];
    for (const v of rejects) expect(isRaceId(v), `${String(v)} must be refused`).toBe(false);
  });

  it('narrows, so a validated value indexes the Record without a cast', () => {
    const off_the_wire: unknown = 'mummies';
    expect(isRaceId(off_the_wire)).toBe(true);
    if (isRaceId(off_the_wire)) {
      const race: RaceId = off_the_wire; // tsc: this line is the assertion
      expect(RACE_COLORS[race]).toBe(PLAYER_COLORS[2]);
    }
  });
});
