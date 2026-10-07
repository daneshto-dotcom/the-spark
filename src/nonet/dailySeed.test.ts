/**
 * S196 #16 — THE DAILY NONET: one grid per UTC day, the same for everyone.
 * The seed is a PURE function of the UTC date; the clock is read by the caller at the menu.
 */
import { describe, expect, it } from 'vitest';
import { generateSudoku } from '../state/sudoku.ts';
import {
  DAILY_BOARD_PREFIX,
  DAILY_SEED_SALT,
  DAY_MS,
  dailyBoardId,
  dailySeed,
  dayKeyOfBoard,
  isDayKey,
  utcDayKey,
} from './dailySeed.ts';

describe('S196 — utcDayKey reads the UTC date, never the device time zone', () => {
  it('the exact UTC boundaries: 23:59:59.999 is still yesterday, 00:00:00.000 is today', () => {
    const midnight = Date.UTC(2026, 9, 7); // 7 Oct 2026 00:00 UTC
    expect(utcDayKey(midnight - 1)).toBe('20261006');
    expect(utcDayKey(midnight)).toBe('20261007');
    expect(utcDayKey(midnight + DAY_MS - 1)).toBe('20261007');
    expect(utcDayKey(midnight + DAY_MS)).toBe('20261008');
  });

  it('month, year and leap-day boundaries', () => {
    expect(utcDayKey(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe('20261231');
    expect(utcDayKey(Date.UTC(2027, 0, 1))).toBe('20270101');
    expect(utcDayKey(Date.UTC(2028, 1, 29, 12))).toBe('20280229');
    expect(utcDayKey(Date.UTC(2028, 2, 1))).toBe('20280301');
  });

  it('two players on opposite sides of the world at the same instant get the same key (and so the same seed)', () => {
    // The instant is all that is passed in — Tokyo and Los Angeles hold the same epoch ms.
    const instant = Date.UTC(2026, 9, 7, 23, 30); // 08:30 next day in Tokyo, 16:30 same day in LA
    const tokyo = utcDayKey(instant);
    const losAngeles = utcDayKey(instant);
    expect(tokyo).toBe(losAngeles);
    expect(dailySeed(tokyo)).toBe(dailySeed(losAngeles));
  });

  it('a fractional ms is floored, not rounded across midnight', () => {
    expect(utcDayKey(Date.UTC(2026, 9, 7) - 0.4)).toBe('20261006');
  });
});

describe('S196 — dailySeed: same day ⇒ same seed for everyone; different days ⇒ different grids', () => {
  it('is deterministic and unsigned 32-bit', () => {
    const a = dailySeed('20261007');
    expect(a).toBe(dailySeed('20261007'));
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
  });

  it('⛔ PINNED: changing the salt or the hash changes every past and future daily grid', () => {
    expect(DAILY_SEED_SALT).toBe('spark-nonet-daily-v1:');
    // Literal pins — derived once from this implementation. A refactor that "tidies" the hash goes red here.
    expect([dailySeed('20261007'), dailySeed('20261008'), dailySeed('20270101')]).toEqual(PINNED_SEEDS);
  });

  it('a year of consecutive days: all distinct seeds AND all distinct puzzles', () => {
    const seeds = new Set<number>();
    const grids = new Set<string>();
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 366; d++) {
      const key = utcDayKey(start + d * DAY_MS);
      const s = dailySeed(key);
      seeds.add(s);
      grids.add(generateSudoku(s).givens.join(''));
    }
    expect(seeds.size).toBe(366);
    expect(grids.size).toBe(366);
  });

  it('negative: a day key is not just the day number — 20261007 and 20261008 are far apart', () => {
    const a = dailySeed('20261007');
    const b = dailySeed('20261008');
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe('S196 — the daily board id', () => {
  it('nonet:dYYYYMMDD, and it matches the worker BOARD_RE shape', () => {
    expect(dailyBoardId('20261007')).toBe('nonet:d20261007');
    expect(DAILY_BOARD_PREFIX).toBe('nonet:d');
    expect(/^[a-z0-9]+(?::[a-z0-9]+)?$/.test(dailyBoardId('20261007'))).toBe(true);
  });

  it('round-trips through dayKeyOfBoard; anything else is null', () => {
    expect(dayKeyOfBoard(dailyBoardId('20261007'))).toBe('20261007');
    expect(dayKeyOfBoard('nonet')).toBeNull();
    expect(dayKeyOfBoard('nonet:s07')).toBeNull();
    expect(dayKeyOfBoard('nonet:d2026107')).toBeNull();
    expect(dayKeyOfBoard('nonet:d20261131')).toBeNull(); // 31 Nov does not exist
  });

  it('isDayKey rejects impossible dates and non-digits', () => {
    expect(isDayKey('20261007')).toBe(true);
    expect(isDayKey('20280229')).toBe(true);
    expect(isDayKey('20270229')).toBe(false);
    expect(isDayKey('20261300')).toBe(false);
    expect(isDayKey('2026-10-07')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });
});

const PINNED_SEEDS: number[] = [493881763, 2511003335, 3589986017];
