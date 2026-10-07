/**
 * S196 #16 — the NONET home's doors, and the three guards that matter most:
 *   · ⛔ ZEN NEVER SUBMITS — no path from a ZEN run reaches the leaderboard;
 *   · PLAY is today's timed run, unchanged (seed, board, phase machine);
 *   · DAILY files to its own day's board, fixed at launch.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BOARD_NONET } from '../render/arcadeScores.ts';
import { setLeaderboardForTests, type LeaderboardClient, type RankingUpdate } from '../render/arcadeLeaderboard.ts';
import { beginSubmit, finishRun, startRun, submitRun, typeLetter, type ArcadeRun } from '../render/arcadeRun.ts';
import { dailyBoardId, dailySeed, utcDayKey } from './dailySeed.ts';
import { planLaunch, routeArcadeSelect, solveOutcome } from './nonetModes.ts';

const NOW = Date.UTC(2026, 9, 7, 12); // 7 Oct 2026 noon UTC
const TODAY = '20261007';

/** A leaderboard that records every submission. */
function spyBoard(): { client: LeaderboardClient; calls: Array<{ boardId: string; name: string; ms: number }> } {
  const calls: Array<{ boardId: string; name: string; ms: number }> = [];
  const client: LeaderboardClient = {
    kind: 'local',
    submit(boardId, name, ms) {
      calls.push({ boardId, name, ms });
      const u: RankingUpdate = { rows: [{ name, runs: 1, averageMs: ms }], place: 1, runs: 1, lastMs: ms, previousAverageMs: null, averageMs: ms, shared: false, flushed: 0 };
      return Promise.resolve(u);
    },
  };
  return { client, calls };
}

afterEach(() => setLeaderboardForTests(null));

describe('S196 — planLaunch: what each door starts', () => {
  it('PLAY = the pre-S196 launch: seed floor(perf) >>> 0, the `nonet` board', () => {
    const p = planLaunch('PLAY', 123456.789, NOW, null);
    expect(p).toEqual({ mode: 'PLAY', seed: 123456, boardId: BOARD_NONET, dayKey: null, dailyReplay: false });
    // `>>> 0` exactly as main.ts always wrote it — a large perf value wraps the same way.
    expect(planLaunch('PLAY', 2 ** 32 + 5.5, NOW, null).seed).toBe((Math.floor(2 ** 32 + 5.5)) >>> 0);
  });

  it('DAILY = today\'s seed and today\'s own board, ignoring the perf clock', () => {
    const a = planLaunch('DAILY', 1, NOW, null);
    const b = planLaunch('DAILY', 999_999, NOW + 3_600_000, null); // another player, an hour later, same UTC day
    expect(a).toEqual({ mode: 'DAILY', seed: dailySeed(TODAY), boardId: dailyBoardId(TODAY), dayKey: TODAY, dailyReplay: false });
    expect(b.seed).toBe(a.seed);
    expect(b.boardId).toBe(a.boardId);
  });

  it('DAILY after today\'s ranked daily was solved here = the same grid, as ZEN (untimed, no board)', () => {
    const p = planLaunch('DAILY', 1, NOW, TODAY);
    expect(p).toEqual({ mode: 'ZEN', seed: dailySeed(TODAY), boardId: null, dayKey: TODAY, dailyReplay: true });
  });

  it('negative: YESTERDAY\'s solve does not block today\'s ranked daily', () => {
    expect(planLaunch('DAILY', 1, NOW, '20261006').mode).toBe('DAILY');
  });

  it('ZEN = a fresh grid and NO board', () => {
    expect(planLaunch('ZEN', 77.9, NOW, null)).toEqual({ mode: 'ZEN', seed: 77, boardId: null, dayKey: null, dailyReplay: false });
  });

  it('every plan: boardId is null exactly when mode is ZEN', () => {
    for (const door of ['PLAY', 'DAILY', 'ZEN'] as const) {
      for (const solved of [null, TODAY]) {
        const p = planLaunch(door, 5, NOW, solved);
        expect(p.boardId === null).toBe(p.mode === 'ZEN');
      }
    }
  });
});

describe('S196 — ⛔ ZEN NEVER SUBMITS', () => {
  const zen = (): ArcadeRun => startRun(0, 'ZEN');

  it('a ZEN run has no board, whatever boardId the caller passes', () => {
    expect(zen().boardId).toBeNull();
    expect(startRun(0, 'ZEN', 'nonet').boardId).toBeNull();
  });

  it('solving a ZEN run never reaches the initials screen (finishRun keeps it RUNNING, untimed)', () => {
    const r = finishRun(zen(), 63_000);
    expect(r.phase).toBe('RUNNING');
    expect(r.finishedMs).toBeNull();
    expect(solveOutcome(zen())).toBe('HOME');
  });

  it('beginSubmit and submitRun refuse it — and the leaderboard is NEVER called', async () => {
    const spy = spyBoard();
    setLeaderboardForTests(spy.client);
    // Even a ZEN run forced into ENTER_INITIALS by hand (the guards must not depend on finishRun).
    const forced: ArcadeRun = { ...zen(), phase: 'ENTER_INITIALS', finishedMs: 63_000 };
    expect(beginSubmit(forced)).toBe(forced);
    expect(await submitRun(forced, () => 1)).toBe(forced);
    expect(await submitRun(forced, () => 1, BOARD_NONET)).toBe(forced); // an explicit board does not override ZEN
    expect(spy.calls).toEqual([]);
  });
});

describe('S196 — PLAY is unchanged; DAILY files to its launch-day board', () => {
  it('startRun(now) is the pre-S196 run: PLAY on `nonet`', () => {
    const r = startRun(0);
    expect(r.mode).toBe('PLAY');
    expect(r.boardId).toBe(BOARD_NONET);
    expect(solveOutcome(r)).toBe('INITIALS');
    expect(finishRun(r, 63_000).phase).toBe('ENTER_INITIALS');
  });

  it('a PLAY submission goes to `nonet` (the leaderboard is reached — the positive control for ZEN)', async () => {
    const spy = spyBoard();
    setLeaderboardForTests(spy.client);
    const r = await submitRun(typeLetter(finishRun(startRun(0), 63_000), 'D'), () => 1);
    expect(r.phase).toBe('RECAP');
    expect(spy.calls).toEqual([{ boardId: 'nonet', name: 'DAA', ms: 63_000 }]);
  });

  it('a DAILY started before midnight and solved after still files to the day it was launched', async () => {
    const spy = spyBoard();
    setLeaderboardForTests(spy.client);
    const launchedAt = Date.UTC(2026, 9, 7, 23, 59, 30);
    const plan = planLaunch('DAILY', 0, launchedAt, null);
    const run = startRun(0, plan.mode, plan.boardId!);
    // ...the player finishes 90 s later, on 8 Oct.
    expect(utcDayKey(launchedAt + 90_000)).toBe('20261008');
    await submitRun(finishRun(run, 90_000), () => 1);
    expect(spy.calls.map((c) => c.boardId)).toEqual(['nonet:d20261007']);
  });
});

describe('S196 — routeArcadeSelect: the arcade row opens the home', () => {
  it('nonet → openNonetHome, back → back, anything else → nothing', () => {
    const log: string[] = [];
    const a = { back: () => log.push('back'), openNonetHome: () => log.push('home') };
    routeArcadeSelect('nonet', a);
    routeArcadeSelect('back', a);
    routeArcadeSelect('pitch-masters', a); // page games are navigated by the overlay itself
    routeArcadeSelect('', a);
    expect(log).toEqual(['home', 'back']);
  });
});
