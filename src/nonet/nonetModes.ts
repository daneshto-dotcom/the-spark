/**
 * SPARK — S196 #16: **THE NONET HOME'S DOORS, AS PURE DECISIONS.** Everything the home and `main.ts`
 * have to decide lives here as a function of its inputs, so it is tested without Pixi and without a
 * browser: which arcade row opens what, what each door launches, and where a solve goes.
 *
 * ⭐ ONE PLACE TO EXTEND. Option B's CAMPAIGN (3 bands × 10 stages, owner ruling R196-D2) is the fourth
 * `NonetDoor` and the fourth arm in `planLaunch`; its data and pure rules live in `campaign.ts`.
 */
import { BOARD_NONET } from '../render/arcadeScores.ts';
import type { ArcadeRun, ArcadeRunMode } from '../render/arcadeRun.ts';
import { dailyBoardId, dailySeed, utcDayKey } from './dailySeed.ts';
import { stageBoardId, stageById, stagePuzzleSeed } from './campaign.ts';

/** The doors on the NONET home that START a puzzle. (RANKING and BACK open no puzzle.) */
export type NonetDoor = 'PLAY' | 'DAILY' | 'ZEN' | 'CAMPAIGN';

/** What a door launches. `boardId === null` ⇔ `mode === 'ZEN'`. */
export interface NonetLaunch {
  readonly mode: ArcadeRunMode;
  readonly seed: number;
  readonly boardId: string | null;
  /** The UTC day of a daily grid (also set on a daily REPLAY), else null. */
  readonly dayKey: string | null;
  /** True when DAILY was pressed after today's ranked daily was already solved on this device. */
  readonly dailyReplay: boolean;
  /** ⭐ Option B — the campaign stage id, else null. */
  readonly stage: number | null;
  /** ⭐ Option B — the clue target for the ARCADE generator call (a stage's band), else null = default. */
  readonly clues: number | null;
}

/**
 * PURE — what pressing `door` launches.
 *
 * - `perfNowMs` seeds PLAY and ZEN exactly as the arcade always has (`Math.floor(performance.now()) >>> 0`,
 *   `main.ts` before S196) — so PLAY is today's timed run, byte for byte.
 * - `wallNowMs` (epoch ms, `Date.now()` at the menu — UI, not the sim) picks the DAILY grid.
 * - `dailySolvedKey` is the last UTC day whose ranked daily this device solved (`dailyProgress.ts`).
 *
 * ⚠ MINE — ONE RANKED DAILY PER DEVICE PER DAY. A daily is ONE grid, and its board is an average
 * (R182-G); replaying a grid you have just solved posts a memorised time and drags your mean down.
 * So a second DAILY the same day plays the same grid UNTIMED and UNRANKED (as ZEN). Reported as an
 * owner question; the alternative (every replay ranked) is a one-line change here.
 */
export function planLaunch(
  door: NonetDoor,
  perfNowMs: number,
  wallNowMs: number,
  dailySolvedKey: string | null,
  campaignStage = 1,
): NonetLaunch {
  const clockSeed = Math.floor(perfNowMs) >>> 0;
  const none = { stage: null, clues: null } as const;
  switch (door) {
    case 'PLAY':
      return { mode: 'PLAY', seed: clockSeed, boardId: BOARD_NONET, dayKey: null, dailyReplay: false, ...none };
    case 'ZEN':
      return { mode: 'ZEN', seed: clockSeed, boardId: null, dayKey: null, dailyReplay: false, ...none };
    case 'DAILY': {
      const key = utcDayKey(wallNowMs);
      const seed = dailySeed(key);
      if (dailySolvedKey === key) return { mode: 'ZEN', seed, boardId: null, dayKey: key, dailyReplay: true, ...none };
      return { mode: 'DAILY', seed, boardId: dailyBoardId(key), dayKey: key, dailyReplay: false, ...none };
    }
    case 'CAMPAIGN': {
      // R196-D2 6c — a FIXED seed per stage: stage 7 is the same grid for everyone. An out-of-range id
      // (a hand-edited progress value) falls back to stage 1 rather than throwing.
      const stage = stageById(campaignStage) ?? stageById(1)!;
      return {
        mode: 'CAMPAIGN',
        seed: stagePuzzleSeed(stage, 0),
        boardId: stageBoardId(stage.id),
        dayKey: null,
        dailyReplay: false,
        stage: stage.id,
        clues: stage.clues,
      };
    }
  }
}

/** What `main.ts` does with an arcade-menu selection. */
export interface ArcadeSelectActions {
  /** BACK — close the arcade menu. */
  back(): void;
  /** ⭐ S196 — the NONET row opens the NONET home. It no longer mints a puzzle. */
  openNonetHome(): void;
}

/**
 * PURE ROUTER — the arcade menu's `onSelect`, extracted so the click → action path is testable through
 * the real `ArcadeOverlay` hit-test (`nonetHome.reach.test.ts`). Page games (PITCH MASTERS) never get
 * here: `ArcadeOverlay` navigates them itself. Unknown ids do nothing.
 */
export function routeArcadeSelect(id: string, a: ArcadeSelectActions): void {
  if (id === 'back') a.back();
  else if (id === 'nonet') a.openNonetHome();
}

/**
 * PURE — where a solved arcade NONET goes.
 * `INITIALS` — a timed run (PLAY / DAILY) freezes its clock and asks for a name (R182-G order).
 * `HOME` — ZEN, or a solve with no run in flight: back to the NONET home, nothing recorded.
 */
export function solveOutcome(run: ArcadeRun | null): 'INITIALS' | 'HOME' {
  if (run === null || run.mode === 'ZEN') return 'HOME';
  return 'INITIALS';
}
