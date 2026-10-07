/**
 * SPARK — S196 #16: **THE NONET HOME'S DOORS, AS PURE DECISIONS.** Everything the home and `main.ts`
 * have to decide lives here as a function of its inputs, so it is tested without Pixi and without a
 * browser: which arcade row opens what, what each door launches, and where a solve goes.
 *
 * ⭐ ONE PLACE TO EXTEND. Option B's CAMPAIGN (3 bands × 10 stages) will be a fourth `NonetDoor` and a
 * fourth arm in `planLaunch` — it is deliberately NOT here yet: it waits on the owner's answers to the
 * ten questions in `.claude/plans/S195_NONET_HOME_OPTIONS.md` §(d).
 */
import { BOARD_NONET } from '../render/arcadeScores.ts';
import type { ArcadeRun, ArcadeRunMode } from '../render/arcadeRun.ts';
import { dailyBoardId, dailySeed, utcDayKey } from './dailySeed.ts';

/** The doors on the NONET home that START a puzzle. (RANKING and BACK open no puzzle.) */
export type NonetDoor = 'PLAY' | 'DAILY' | 'ZEN';

/** What a door launches. `boardId === null` ⇔ `mode === 'ZEN'`. */
export interface NonetLaunch {
  readonly mode: ArcadeRunMode;
  readonly seed: number;
  readonly boardId: string | null;
  /** The UTC day of a daily grid (also set on a daily REPLAY), else null. */
  readonly dayKey: string | null;
  /** True when DAILY was pressed after today's ranked daily was already solved on this device. */
  readonly dailyReplay: boolean;
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
export function planLaunch(door: NonetDoor, perfNowMs: number, wallNowMs: number, dailySolvedKey: string | null): NonetLaunch {
  const clockSeed = Math.floor(perfNowMs) >>> 0;
  switch (door) {
    case 'PLAY':
      return { mode: 'PLAY', seed: clockSeed, boardId: BOARD_NONET, dayKey: null, dailyReplay: false };
    case 'ZEN':
      return { mode: 'ZEN', seed: clockSeed, boardId: null, dayKey: null, dailyReplay: false };
    case 'DAILY': {
      const key = utcDayKey(wallNowMs);
      const seed = dailySeed(key);
      if (dailySolvedKey === key) return { mode: 'ZEN', seed, boardId: null, dayKey: key, dailyReplay: true };
      return { mode: 'DAILY', seed, boardId: dailyBoardId(key), dayKey: key, dailyReplay: false };
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
