/**
 * SPARK — S149 P6: the arcade high-score table.
 *
 * Owner: *"see who can finish it as fast as possible … only like top 25 are shown and it tells him
 * place place his score is. like in a real arcade from the 80s"*
 *
 * ⛔ THE ASSERTION THAT MATTERS MOST IS THE SORT DIRECTION. This is a TIME trial, so the best score
 * is the SMALLEST number — the inverse of the usual high-score board. A board sorted the wrong way
 * would still look completely correct (sorted, capped at 25, ranked 1..25) while silently
 * celebrating the slowest players. Nothing but an explicit direction test catches that.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  formatTime,
  insertScore,
  loadScores,
  NAME_LEN,
  normaliseName,
  placeOf,
  qualifies,
  recordRun,
  saveScores,
  TOP_N,
  type ArcadeScore,
} from './arcadeScores.ts';

const row = (name: string, ms: number, at = 0): ArcadeScore => ({ name, ms, at });

/** A minimal in-memory localStorage so the storage paths are exercised headlessly. */
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

beforeEach(installStorage);

describe('S149 P6 — ⛔ FASTER IS BETTER (the inverted sort)', () => {
  it('orders the board by ASCENDING time', () => {
    const board = insertScore(insertScore(insertScore([], row('AAA', 9000)), row('BBB', 3000)), row('CCC', 6000));
    expect(board.map((r) => r.name)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('a FASTER run takes a BETTER place — the direction test', () => {
    const scores = [row('AAA', 5000)];
    expect(placeOf(scores, row('NEW', 4000))).toBe(1); // faster ⇒ first
    expect(placeOf(scores, row('NEW', 6000))).toBe(2); // slower ⇒ second
  });

  it('a tie keeps the INCUMBENT ahead — you must genuinely beat a record', () => {
    const scores = [row('OLD', 5000, 100)];
    expect(placeOf(scores, row('NEW', 5000, 200))).toBe(2);
  });
});

describe('S149 P6 — the board is capped, and it TELLS you where you landed', () => {
  const full = Array.from({ length: TOP_N }, (_, i) => row('AAA', 1000 + i, i));

  it(`shows at most ${TOP_N} rows`, () => {
    expect(insertScore(full, row('NEW', 1)).length).toBe(TOP_N);
  });

  it('a qualifying run pushes the slowest row off the bottom', () => {
    const after = insertScore(full, row('NEW', 1));
    expect(after[0].name).toBe('NEW');
    expect(after.length).toBe(TOP_N);
    // The old last row (the slowest) is the one that fell off.
    expect(after.some((r) => r.ms === 1000 + TOP_N - 1)).toBe(false);
  });

  it('⭐ still reports a place for a run that MISSED the board', () => {
    // The owner asked to be told the place, not merely shown the table. A cabinet told you
    // "41ST" even when you did not make it, and that is the information being pinned here.
    const missed = row('SLO', 999999);
    expect(qualifies(full, missed)).toBe(false);
    expect(placeOf(full, missed)).toBe(TOP_N + 1);
  });

  it('an empty board puts any run first', () => {
    expect(placeOf([], row('AAA', 12345))).toBe(1);
    expect(qualifies([], row('AAA', 12345))).toBe(true);
  });
});

describe('S149 P6 — three-letter initials, the cabinet convention', () => {
  it('always yields exactly three characters', () => {
    for (const raw of ['', 'A', 'AB', 'ABC', 'ABCDEF', '   ', '!!!']) {
      expect(normaliseName(raw)).toHaveLength(NAME_LEN);
    }
  });

  it('upper-cases and drops characters the picker cannot produce', () => {
    expect(normaliseName('abc')).toBe('ABC');
    expect(normaliseName('a!b')).toBe('ABA'); // '!' dropped, then padded
  });

  it('an unusable name becomes the arcade default rather than an empty row', () => {
    expect(normaliseName('!!!')).toBe('AAA');
  });
});

describe('S149 P6 — the M:SS.cc readout', () => {
  it('formats minutes, seconds and centiseconds', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(1234)).toBe('0:01.23');
    expect(formatTime(61_000)).toBe('1:01.00');
    expect(formatTime(600_000)).toBe('10:00.00');
  });

  it('never renders a negative clock', () => {
    expect(formatTime(-5000)).toBe('0:00.00');
  });
});

describe('S149 P6 — storage is TOTAL: a corrupt board must not break the title screen', () => {
  it('round-trips a saved board', () => {
    saveScores([row('AAA', 1000, 1), row('BBB', 2000, 2)]);
    expect(loadScores().map((r) => r.name)).toEqual(['AAA', 'BBB']);
  });

  it('unparseable JSON degrades to an empty board', () => {
    globalThis.localStorage.setItem('spark.arcade.nonet.scores.v1', '{not json');
    expect(loadScores()).toEqual([]);
  });

  it('a non-array payload degrades to an empty board', () => {
    globalThis.localStorage.setItem('spark.arcade.nonet.scores.v1', '{"a":1}');
    expect(loadScores()).toEqual([]);
  });

  it('malformed ROWS are dropped while good ones survive', () => {
    globalThis.localStorage.setItem(
      'spark.arcade.nonet.scores.v1',
      JSON.stringify([{ name: 'AAA', ms: 500, at: 1 }, { name: 'BAD' }, null, 7, { name: 'BBB', ms: -1, at: 2 }]),
    );
    expect(loadScores().map((r) => r.name)).toEqual(['AAA']); // negative ms rejected too
  });
});

describe('S149 P6 — recordRun ties it together', () => {
  it('persists a qualifying run and reports its place', () => {
    const r1 = recordRun('AAA', 5000, 1);
    expect(r1.place).toBe(1);
    expect(r1.onBoard).toBe(true);

    const r2 = recordRun('BBB', 3000, 2);
    expect(r2.place).toBe(1); // faster ⇒ takes first
    expect(loadScores().map((r) => r.name)).toEqual(['BBB', 'AAA']);
  });

  it('does NOT persist a run that missed the board, but still reports the place', () => {
    for (let i = 0; i < TOP_N; i++) recordRun('AAA', 1000 + i, i);
    const before = loadScores();
    const missed = recordRun('SLO', 999999, 999);
    expect(missed.onBoard).toBe(false);
    expect(missed.place).toBe(TOP_N + 1);
    // ⚠ ANTI-VACUITY: the board must be UNCHANGED, not merely "still 25 long".
    expect(loadScores()).toEqual(before);
  });
});

describe("S150 P3 — the owner's numbers are PINNED, and the blank-name hole is shut", () => {
  it('TOP_N is 25 and NAME_LEN is 3 — the literals, not the symbols', () => {
    // ⛔ WHY THIS EXISTS. Every cap assertion in this file uses the imported `TOP_N`, so setting
    // TOP_N to 10 kept all 18 of them green. The owner asked for "only like top 25" and for
    // three-letter initials; both were therefore completely unprotected. A test that reads a
    // constant through the same symbol the code does cannot pin that constant's VALUE.
    expect(TOP_N).toBe(25);
    expect(NAME_LEN).toBe(3);
  });

  it('an all-space name becomes AAA rather than a blank row', () => {
    // NAME_ALPHABET ends with a space on purpose ("AB " must be reachable), so spaces pass the
    // filter and three of them used to survive as a visually EMPTY row — the exact outcome
    // normaliseName's docblock says is a bug. The old coverage asserted only the length, and three
    // spaces have length three.
    expect(normaliseName('   ')).toBe('AAA');
    expect(normaliseName('')).toBe('AAA');
    expect(normaliseName('!!!')).toBe('AAA');
    // ⚠ A SINGLE space is NOT the same case, and asserting 'AAA' here was my own error before the
    // test was run: ' ' pads to ' AA', which is a perfectly legible space-led row and NOT the blank
    // this fix exists to prevent. The invariant is "at least one visible character", not "no spaces".
    expect(normaliseName(' ')).toBe(' AA');
  });

  it('a space is still legal ALONGSIDE a real character', () => {
    // The fix must not become "reject spaces" — that would break the reachability the alphabet's
    // trailing space exists for.
    expect(normaliseName('AB ')).toBe('AB ');
    expect(normaliseName('A')).toBe('AAA');
    expect(normaliseName(' B')).toBe(' BA');
  });

  it('every name that reaches the board renders at least one visible character', () => {
    // The property the two tests above are instances of, asserted over the whole input space that
    // can produce a row: whatever goes in, the row is never blank.
    for (const raw of ['', ' ', '  ', '   ', '    ', '!!!', '!@#', 'a', 'ab', 'abc', 'abcdef', ' a ', '  c']) {
      const name = normaliseName(raw);
      expect(name).toHaveLength(NAME_LEN);
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});
