/**
 * S196 #16 Option B — the campaign table, its pure functions, and the device progress store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSudoku } from '../state/sudoku.ts';
import {
  CAMPAIGN_STAGES,
  CAMPAIGN_STAGE_COUNT,
  STAGE_SEED_SALT,
  STAGES_PER_BAND,
  nextStage,
  stageBoardId,
  stageById,
  stagePuzzleSeed,
  stageTimedOut,
  stars,
} from './campaign.ts';
import { dailySeedHash } from './dailySeed.ts';
import {
  CAMPAIGN_PROGRESS_KEY,
  FRESH_PROGRESS,
  campaignComplete,
  currentStage,
  loadProgress,
  parseProgress,
  recordClear,
  saveProgress,
  totalStars,
} from './campaignProgress.ts';
import { STAGE_BOARD_RE } from '../../server/leaderboard/worker.js';

describe('S196 B — the table (R196-D2: 3 bands × 10, clues 16 / 13 / 10)', () => {
  it('thirty stages, ids 1..30 in order, ten per band', () => {
    expect(CAMPAIGN_STAGE_COUNT).toBe(30);
    expect(CAMPAIGN_STAGES.map((s) => s.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const s of CAMPAIGN_STAGES) expect(s.band).toBe(Math.ceil(s.id / STAGES_PER_BAND));
  });

  it('⛔ OWNER-RULED: band clue counts are exactly 16, 13, 10', () => {
    for (const s of CAMPAIGN_STAGES) expect(s.clues).toBe([16, 13, 10][s.band - 1]);
  });

  it('inside a band puzzles grow 1 → 3 and the per-puzzle budget strictly tightens', () => {
    for (let b = 1; b <= 3; b++) {
      const band = CAMPAIGN_STAGES.filter((s) => s.band === b);
      expect(band[0]!.puzzles).toBe(1);
      expect(band[9]!.puzzles).toBe(3);
      for (let i = 1; i < band.length; i++) {
        expect(band[i]!.puzzles).toBeGreaterThanOrEqual(band[i - 1]!.puzzles);
        expect(band[i]!.clockS / band[i]!.puzzles).toBeLessThan(band[i - 1]!.clockS / band[i - 1]!.puzzles);
      }
    }
  });

  it('star thresholds are ordered: 3★ < 2★ < clock', () => {
    for (const s of CAMPAIGN_STAGES) {
      expect(s.threeStarS).toBeGreaterThan(0);
      expect(s.threeStarS).toBeLessThan(s.twoStarS);
      expect(s.twoStarS).toBeLessThan(s.clockS);
    }
  });

  it('⛔ the seed column IS the documented hash — a hand-edited seed goes red', () => {
    for (const s of CAMPAIGN_STAGES) expect(s.seed).toBe(dailySeedHash(`${STAGE_SEED_SALT}${s.id}`));
  });

  it('every puzzle of every stage is distinct (no repeated grid in the whole campaign)', () => {
    const grids = new Set<string>();
    let n = 0;
    for (const s of CAMPAIGN_STAGES) {
      for (let k = 0; k < s.puzzles; k++) {
        grids.add(generateSudoku(stagePuzzleSeed(s, k), s.clues).givens.join(''));
        n++;
      }
    }
    expect(grids.size).toBe(n);
  });

  it('a band-3 stage really is harder: fewer givens than a band-1 stage', () => {
    const g = (id: number): number => generateSudoku(stageById(id)!.seed, stageById(id)!.clues).givens.filter((v) => v !== 0).length;
    expect(g(1)).toBe(16);
    expect(g(11)).toBe(13);
    expect(g(21)).toBeLessThanOrEqual(12); // target 10 realises 10–12 (NONET_STAGE_LADDER.md)
  });
});

describe('S196 B — stage boards, stars, the clock, next', () => {
  it('nonet:s07 — and the worker accepts every stage board id this module mints', () => {
    expect(stageBoardId(7)).toBe('nonet:s07');
    expect(stageBoardId(30)).toBe('nonet:s30');
    for (const s of CAMPAIGN_STAGES) expect(STAGE_BOARD_RE.test(stageBoardId(s.id)), stageBoardId(s.id)).toBe(true);
  });

  it('stars at the exact thresholds (inclusive), and 0 past the clock', () => {
    const s = stageById(1)!; // clock 240, 3★ 120, 2★ 180
    expect(stars(s, 120_000)).toBe(3);
    expect(stars(s, 120_001)).toBe(2);
    expect(stars(s, 180_000)).toBe(2);
    expect(stars(s, 180_001)).toBe(1);
    expect(stars(s, 240_000)).toBe(1);
    expect(stars(s, 240_001)).toBe(0);
    expect(stars(s, Number.NaN)).toBe(0);
  });

  it('timed out strictly past the clock', () => {
    const s = stageById(1)!;
    expect(stageTimedOut(s, 240_000)).toBe(false);
    expect(stageTimedOut(s, 240_001)).toBe(true);
  });

  it('next stage, and none after 30', () => {
    expect(nextStage(7)?.id).toBe(8);
    expect(nextStage(30)).toBeNull();
    expect(stageById(0)).toBeNull();
  });
});

describe('S196 B — progress on this device', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fresh: stage 1 unlocked, no stars', () => {
    expect(currentStage(FRESH_PROGRESS)).toBe(1);
    expect(totalStars(FRESH_PROGRESS)).toBe(0);
  });

  it('a clear unlocks the next stage and keeps the BEST stars', () => {
    let p = recordClear(FRESH_PROGRESS, 1, 2);
    expect(p.unlocked).toBe(2);
    p = recordClear(p, 1, 1);
    expect(p.stars[0]).toBe(2); // a worse replay never lowers it
    p = recordClear(p, 1, 3);
    expect(p.stars[0]).toBe(3);
    expect(totalStars(p)).toBe(3);
  });

  it('negative: a locked stage, a zero-star "clear" and an out-of-range id change nothing', () => {
    expect(recordClear(FRESH_PROGRESS, 5, 3)).toBe(FRESH_PROGRESS);
    expect(recordClear(FRESH_PROGRESS, 1, 0)).toBe(FRESH_PROGRESS);
    expect(recordClear(FRESH_PROGRESS, 31, 3)).toBe(FRESH_PROGRESS);
  });

  it('clearing 30 stays on 30 and completes the campaign', () => {
    let p = FRESH_PROGRESS;
    for (let id = 1; id <= 30; id++) p = recordClear(p, id, 1);
    expect(currentStage(p)).toBe(30);
    expect(campaignComplete(p)).toBe(true);
  });

  it('parseProgress is total: junk collapses to sane values', () => {
    expect(parseProgress(null)).toEqual(FRESH_PROGRESS);
    expect(parseProgress({ unlocked: 99, stars: [9, -1, 'x', 2] }).unlocked).toBe(30);
    expect(parseProgress({ unlocked: 99, stars: [9, -1, 'x', 2] }).stars.slice(0, 4)).toEqual([3, 0, 0, 2]);
    expect(parseProgress({ unlocked: 0 }).unlocked).toBe(1);
  });

  it('save → load round-trips under spark.nonet.progress.v1; a throwing store reads fresh', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    const p = recordClear(FRESH_PROGRESS, 1, 3);
    saveProgress(p);
    expect(mem.has(CAMPAIGN_PROGRESS_KEY)).toBe(true);
    expect(loadProgress()).toEqual(p);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadProgress()).toEqual(FRESH_PROGRESS);
    expect(() => saveProgress(p)).not.toThrow();
  });
});
