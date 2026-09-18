/**
 * SPARK — S182 R182-G: the arcade RANKING store.
 *
 * Owner: *"The leaderboard will hold the AVERAGE time it takes a user to complete... So people are
 * competing over a long span."*
 *
 * ⛔ TWO PROPERTIES MATTER MORE THAN THE REST, AND BOTH FAIL SILENTLY.
 *
 * **The sort direction.** This is a time trial, so the best average is the SMALLEST. Inverted, the
 * table still looks completely correct — sorted, capped at 25, ranked 1..25 — while celebrating the
 * slowest players. Nothing but an explicit direction test catches that.
 *
 * **Losslessness.** The mean is derived from a stored sum and count. Folding into a stored average
 * instead would round at every step, and the error compounds with every game a player ever plays —
 * so the bug would not appear in testing and would appear, unfixably, after a season of play.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  averageMsOf,
  BOARD_NONET,
  compareRows,
  entryOf,
  foldRun,
  formatTime,
  loadPending,
  loadRanking,
  NAME_LEN,
  normaliseName,
  parseRankingEntries,
  parseRankingRows,
  PENDING_CAP,
  placeOfName,
  rankRows,
  savePending,
  saveRanking,
  TOP_N,
  type RankingEntry,
} from './arcadeScores.ts';

const entry = (name: string, runs: number, totalMs: number): RankingEntry => ({ name, runs, totalMs });

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

describe('R182-G — folding a run into an average', () => {
  it('a brand new name starts at one run', () => {
    const after = foldRun([], 'DAN', 60_000);
    expect(after).toEqual([entry('DAN', 1, 60_000)]);
    expect(averageMsOf(after[0])).toBe(60_000);
  });

  it('⭐ an existing name accumulates — runs + 1, total + ms', () => {
    // The owner's example: ten games averaging 1:20, then a new one lands and the mean moves.
    let e: RankingEntry[] = [entry('DAN', 10, 800_000)]; // 10 runs, avg 1:20.00
    expect(averageMsOf(e[0])).toBe(80_000);
    e = foldRun(e, 'DAN', 63_000); // a 1:03 run
    expect(e[0].runs).toBe(11);
    expect(averageMsOf(e[0])).toBeCloseTo(78_454.5, 0); // it comes down
  });

  it('⛔ IS LOSSLESS — folding N runs equals averaging them in one go', () => {
    // The whole reason sum+count is stored rather than a rolling mean. A stored average rounds at
    // every step and the error compounds over a player's entire history, unfixably.
    const times = [61_234, 92_811, 45_009, 73_500, 88_121, 59_999, 101_777];
    let e: RankingEntry[] = [];
    for (const t of times) e = foldRun(e, 'DAN', t);
    const exact = times.reduce((a, b) => a + b, 0) / times.length;
    expect(averageMsOf(e[0])).toBe(exact); // EXACT, not close
    expect(e[0].runs).toBe(times.length);
  });

  it('order of folding does not change the result', () => {
    const a = [5000, 90_000, 61_000].reduce<RankingEntry[]>((acc, t) => foldRun(acc, 'DAN', t), []);
    const b = [61_000, 5000, 90_000].reduce<RankingEntry[]>((acc, t) => foldRun(acc, 'DAN', t), []);
    expect(averageMsOf(a[0])).toBe(averageMsOf(b[0]));
  });

  it('two players stay separate; the same name MERGES — the accepted identity trade', () => {
    // Owner: "hold people at their same name, if not then who cares, come back to it later."
    let e = foldRun([], 'DAN', 60_000);
    e = foldRun(e, 'SAM', 90_000);
    e = foldRun(e, 'DAN', 80_000);
    expect(e).toHaveLength(2);
    expect(entryOf(e, 'DAN')).toEqual(entry('DAN', 2, 140_000));
    expect(entryOf(e, 'SAM')?.runs).toBe(1);
  });

  it('a name is normalised on the way in, so DAN and dan are one player', () => {
    let e = foldRun([], 'dan', 60_000);
    e = foldRun(e, 'DAN', 80_000);
    expect(e).toHaveLength(1);
    expect(e[0].runs).toBe(2);
  });

  it('a non-finite or negative time folds as zero rather than poisoning the mean', () => {
    // A NaN total would make the row un-sortable and pin it at the top of the table forever.
    const e = foldRun([entry('DAN', 1, 60_000)], 'DAN', Number.NaN);
    expect(Number.isFinite(averageMsOf(e[0]))).toBe(true);
  });
});

describe('R182-G — the ranking order', () => {
  it('⛔ LOWER AVERAGE WINS — the inverted sort this file exists to protect', () => {
    const rows = rankRows([entry('SLO', 1, 200_000), entry('FST', 1, 40_000), entry('MID', 1, 90_000)]);
    expect(rows.map((r) => r.name)).toEqual(['FST', 'MID', 'SLO']);
    expect(rows[0].averageMs).toBeLessThan(rows[1].averageMs);
  });

  it('at an identical average, MORE RUNS ranks higher', () => {
    const rows = rankRows([entry('NEW', 1, 60_000), entry('OLD', 40, 2_400_000)]);
    expect(rows.map((r) => r.name)).toEqual(['OLD', 'NEW']);
  });

  it('and the final tie-break is the name, so the order is TOTAL', () => {
    // Two clients must not disagree about who is 4th; an unstable order is a desync of the UI.
    const rows = rankRows([entry('BBB', 2, 120_000), entry('AAA', 2, 120_000)]);
    expect(rows.map((r) => r.name)).toEqual(['AAA', 'BBB']);
    expect(compareRows(rows[0], rows[1])).toBeLessThan(0);
  });

  it('caps at TOP_N', () => {
    const many = Array.from({ length: TOP_N + 12 }, (_, i) =>
      entry(String(i).padStart(3, '0'), 1, 30_000 + i),
    );
    expect(rankRows(many)).toHaveLength(TOP_N);
  });

  it('placeOfName is 1-based, and reports "just past the end" for an absent name', () => {
    const rows = rankRows([entry('AAA', 1, 40_000), entry('BBB', 1, 60_000)]);
    expect(placeOfName(rows, 'AAA')).toBe(1);
    expect(placeOfName(rows, 'BBB')).toBe(2);
    expect(placeOfName(rows, 'ZZZ')).toBe(3);
  });

  it('a zero-run entry cannot produce NaN and sit at the top forever', () => {
    const rows = rankRows([entry('BAD', 0, 0), entry('OKA', 1, 50_000)]);
    expect(rows.every((r) => Number.isFinite(r.averageMs))).toBe(true);
  });
});

describe('R182-G — storage is total, and the new key does not reinterpret the old one', () => {
  it('round-trips a ranking', () => {
    saveRanking([entry('DAN', 3, 180_000)]);
    expect(loadRanking()).toEqual([entry('DAN', 3, 180_000)]);
  });

  it('⛔ IGNORES the old per-run key rather than inventing run counts from it', () => {
    // A local table of 25 best times is NOT a player with 25 runs — the information an average needs
    // (how many runs, including the slow ones) was never recorded. Reading it would fabricate a
    // history, so the new key simply does not look at it.
    globalThis.localStorage.setItem(
      'spark.arcade.nonet.scores.v1',
      JSON.stringify([{ name: 'OLD', ms: 12_345, at: 7 }]),
    );
    expect(loadRanking(BOARD_NONET)).toEqual([]);
  });

  it('a corrupted key degrades to empty rather than throwing on the title screen', () => {
    globalThis.localStorage.setItem('spark.arcade.nonet.ranking.v1', '{not json');
    expect(loadRanking()).toEqual([]);
  });

  it('drops malformed rows: zero runs, negative totals, wrong shapes', () => {
    expect(
      parseRankingEntries([
        { name: 'OKA', runs: 2, totalMs: 100 },
        { name: 'ZER', runs: 0, totalMs: 100 },
        { name: 'NEG', runs: 1, totalMs: -5 },
        { name: 'FRC', runs: 1.5, totalMs: 100 },
        { nope: true },
        null,
      ]).map((e) => e.name),
    ).toEqual(['OKA']);
  });

  it('a server row (name, runs, averageMs) reconstructs an exact total', () => {
    const [e] = parseRankingRows([{ name: 'DAN', runs: 4, averageMs: 75_000 }]);
    expect(e).toEqual(entry('DAN', 4, 300_000));
  });

  it('a board id other than the default gets its own key', () => {
    saveRanking([entry('AAA', 1, 1000)], BOARD_NONET);
    saveRanking([entry('BBB', 1, 2000)], 'nonet:s07');
    expect(loadRanking(BOARD_NONET).map((e) => e.name)).toEqual(['AAA']);
    expect(loadRanking('nonet:s07').map((e) => e.name)).toEqual(['BBB']);
  });
});

describe('R182-G — the offline queue', () => {
  it('round-trips pending runs', () => {
    savePending([{ name: 'DAN', ms: 60_000 }]);
    expect(loadPending()).toEqual([{ name: 'DAN', ms: 60_000 }]);
  });

  it('⚠ is BOUNDED — an unbounded queue would eventually throw on the write that records a run', () => {
    savePending(Array.from({ length: PENDING_CAP + 50 }, (_, i) => ({ name: 'DAN', ms: 20_000 + i })));
    expect(loadPending()).toHaveLength(PENDING_CAP);
  });

  it('drops malformed queue entries', () => {
    globalThis.localStorage.setItem(
      'spark.arcade.nonet.pending.v1',
      JSON.stringify([{ name: 'OKA', ms: 30_000 }, { name: 'BAD', ms: -1 }, { ms: 5 }]),
    );
    expect(loadPending().map((p) => p.name)).toEqual(['OKA']);
  });
});

describe('name and time formatting — unchanged by the rebuild', () => {
  it('clamps to exactly three characters', () => {
    expect(normaliseName('danny')).toHaveLength(NAME_LEN);
    expect(normaliseName('d')).toBe('DAA');
  });

  it('⛔ an all-space name becomes the arcade default, not a blank row', () => {
    // The alphabet ends with a space so "AB " is reachable, which makes three spaces *mappable*.
    expect(normaliseName('   ')).toBe('AAA');
    expect(normaliseName('AB ')).toBe('AB ');
  });

  it('formats M:SS.cc and never goes negative on screen', () => {
    expect(formatTime(63_450)).toBe('1:03.45');
    expect(formatTime(-10)).toBe('0:00.00');
  });
});
