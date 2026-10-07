/**
 * SPARK — S196 #16 Option B: **THE NONET CAMPAIGN — three bands × ten stages, as DATA.**
 *
 * Owner, S173: *"there should be STAGES … you have to beat like ten stages, and then you get to a
 * harder level of sudoku."* Owner ruling R196-D2 (S196) took every recommendation in
 * `.claude/plans/S195_NONET_HOME_OPTIONS.md` §(d):
 *   · bands of FIXED clue counts 16 / 13 / 10 — the three rungs the generator really has
 *     (`NONET_STAGE_LADDER.md`: floor ~10). This is NOT R182-H's adaptive difficulty: every player on
 *     stage 7 draws the same grid, and stage 7 has its own board (`nonet:s07`);
 *   · a FIXED seed per stage (stage 7 is the same grid for everyone — a real race);
 *   · fail = retry the stage; the clock is PER STAGE, counting all of its puzzles;
 *   · 1–3 stars by time, thresholds per stage in this table;
 *   · progress on the device (`campaignProgress.ts`).
 * Inside a band the clock tightens and puzzles-per-stage grows 1 → 3 — that is where the other 27
 * distinct steps honestly come from.
 *
 * ⚠ MINE — every NUMBER below except the band clue counts (owner-ruled) is mine: the per-puzzle time
 * budget (band 1: 240 s → 120 s, band 2: 300 → 150, band 3: 360 → 180, linear over the band), the
 * puzzles-per-stage split (stages 1–3: 1, 4–7: 2, 8–10: 3), and the stars (★★★ within half the clock,
 * ★★ within three quarters, ★ for any clear). Generated once by a script and written here as literals
 * so the table is what it says; `campaign.test.ts` pins the shape, not the tuning.
 *
 * ⛔ The seeds are MINE too, and changing one changes that stage's grid for everyone and invalidates
 * its board — they are FNV-1a + murmur3 of `spark-nonet-stage-v1:<id>` (the `dailySeed` hash).
 */
import { dailySeedHash } from './dailySeed.ts';

export interface CampaignStage {
  /** 1..30 */
  readonly id: number;
  /** 1..3 */
  readonly band: number;
  /** The clue target handed to the ARCADE generator call (never the match's). */
  readonly clues: number;
  /** Grids in a row to clear the stage. */
  readonly puzzles: number;
  /** The stage clock, seconds, over ALL its puzzles. Exceed it and the stage is failed. */
  readonly clockS: number;
  /** ★★★ at or under this many seconds. */
  readonly threeStarS: number;
  /** ★★ at or under this many seconds (★ for any clear within `clockS`). */
  readonly twoStarS: number;
  /** The stage's fixed seed. Puzzle k uses `stagePuzzleSeed(stage, k)`. */
  readonly seed: number;
}

export const CAMPAIGN_STAGES: readonly CampaignStage[] = [
  { id: 1, band: 1, clues: 16, puzzles: 1, clockS: 240, threeStarS: 120, twoStarS: 180, seed: 3991452654 },
  { id: 2, band: 1, clues: 16, puzzles: 1, clockS: 225, threeStarS: 115, twoStarS: 170, seed: 2190415857 },
  { id: 3, band: 1, clues: 16, puzzles: 1, clockS: 215, threeStarS: 110, twoStarS: 160, seed: 656432696 },
  { id: 4, band: 1, clues: 16, puzzles: 2, clockS: 400, threeStarS: 200, twoStarS: 300, seed: 1465943802 },
  { id: 5, band: 1, clues: 16, puzzles: 2, clockS: 375, threeStarS: 190, twoStarS: 280, seed: 1602857844 },
  { id: 6, band: 1, clues: 16, puzzles: 2, clockS: 345, threeStarS: 175, twoStarS: 260, seed: 98026685 },
  { id: 7, band: 1, clues: 16, puzzles: 2, clockS: 320, threeStarS: 160, twoStarS: 240, seed: 1365091550 },
  { id: 8, band: 1, clues: 16, puzzles: 3, clockS: 440, threeStarS: 220, twoStarS: 330, seed: 410402565 },
  { id: 9, band: 1, clues: 16, puzzles: 3, clockS: 400, threeStarS: 200, twoStarS: 300, seed: 2075877526 },
  { id: 10, band: 1, clues: 16, puzzles: 3, clockS: 360, threeStarS: 180, twoStarS: 270, seed: 435176422 },
  { id: 11, band: 2, clues: 13, puzzles: 1, clockS: 300, threeStarS: 150, twoStarS: 225, seed: 1862140776 },
  { id: 12, band: 2, clues: 13, puzzles: 1, clockS: 285, threeStarS: 145, twoStarS: 215, seed: 3333136432 },
  { id: 13, band: 2, clues: 13, puzzles: 1, clockS: 265, threeStarS: 135, twoStarS: 200, seed: 3209192641 },
  { id: 14, band: 2, clues: 13, puzzles: 2, clockS: 500, threeStarS: 250, twoStarS: 375, seed: 2316016548 },
  { id: 15, band: 2, clues: 13, puzzles: 2, clockS: 465, threeStarS: 235, twoStarS: 350, seed: 137426960 },
  { id: 16, band: 2, clues: 13, puzzles: 2, clockS: 435, threeStarS: 220, twoStarS: 325, seed: 691086129 },
  { id: 17, band: 2, clues: 13, puzzles: 2, clockS: 400, threeStarS: 200, twoStarS: 300, seed: 1942712659 },
  { id: 18, band: 2, clues: 13, puzzles: 3, clockS: 550, threeStarS: 275, twoStarS: 415, seed: 2709728198 },
  { id: 19, band: 2, clues: 13, puzzles: 3, clockS: 500, threeStarS: 250, twoStarS: 375, seed: 602150916 },
  { id: 20, band: 2, clues: 13, puzzles: 3, clockS: 450, threeStarS: 225, twoStarS: 340, seed: 934327595 },
  { id: 21, band: 3, clues: 10, puzzles: 1, clockS: 360, threeStarS: 180, twoStarS: 270, seed: 4197745918 },
  { id: 22, band: 3, clues: 10, puzzles: 1, clockS: 340, threeStarS: 170, twoStarS: 255, seed: 2758490635 },
  { id: 23, band: 3, clues: 10, puzzles: 1, clockS: 320, threeStarS: 160, twoStarS: 240, seed: 580707733 },
  { id: 24, band: 3, clues: 10, puzzles: 2, clockS: 600, threeStarS: 300, twoStarS: 450, seed: 1705268545 },
  { id: 25, band: 3, clues: 10, puzzles: 2, clockS: 560, threeStarS: 280, twoStarS: 420, seed: 1162250445 },
  { id: 26, band: 3, clues: 10, puzzles: 2, clockS: 520, threeStarS: 260, twoStarS: 390, seed: 1052213203 },
  { id: 27, band: 3, clues: 10, puzzles: 2, clockS: 480, threeStarS: 240, twoStarS: 360, seed: 1888207137 },
  { id: 28, band: 3, clues: 10, puzzles: 3, clockS: 660, threeStarS: 330, twoStarS: 495, seed: 2291815131 },
  { id: 29, band: 3, clues: 10, puzzles: 3, clockS: 600, threeStarS: 300, twoStarS: 450, seed: 3278226230 },
  { id: 30, band: 3, clues: 10, puzzles: 3, clockS: 540, threeStarS: 270, twoStarS: 405, seed: 2723781935 },
];

export const CAMPAIGN_STAGE_COUNT = CAMPAIGN_STAGES.length;
export const STAGES_PER_BAND = 10;
/** The seed salt the table's `seed` column was generated from (pinned in the test). */
export const STAGE_SEED_SALT = 'spark-nonet-stage-v1:';

/** PURE — the stage with this id, or null. */
export function stageById(id: number): CampaignStage | null {
  return CAMPAIGN_STAGES.find((s) => s.id === id) ?? null;
}

/** PURE — the seed of puzzle `k` (0-based) of a stage. Puzzle 0 IS the stage seed. */
export function stagePuzzleSeed(stage: CampaignStage, k: number): number {
  return k === 0 ? stage.seed : dailySeedHash(`${STAGE_SEED_SALT}${stage.id}:${k}`);
}

/** PURE — the stage's own average board: `nonet:s07`. Matches the worker's `STAGE_BOARD_RE`. */
export function stageBoardId(id: number): string {
  return `nonet:s${String(id).padStart(2, '0')}`;
}

/** PURE — stars for a clear in `ms` (0 = not a clear: over the clock). */
export function stars(stage: CampaignStage, ms: number): 0 | 1 | 2 | 3 {
  if (!(ms >= 0) || ms > stage.clockS * 1000) return 0;
  if (ms <= stage.threeStarS * 1000) return 3;
  if (ms <= stage.twoStarS * 1000) return 2;
  return 1;
}

/** PURE — has the stage clock run out? Strictly over: finishing on the last ms is a clear. */
export function stageTimedOut(stage: CampaignStage, elapsedMs: number): boolean {
  return elapsedMs > stage.clockS * 1000;
}

/** PURE — the stage after `id`, or null after the last one. */
export function nextStage(id: number): CampaignStage | null {
  return stageById(id + 1);
}
