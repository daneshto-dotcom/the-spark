/**
 * SPARK — S182 R182-G: the arcade run state machine.
 *
 * The owner's pipeline IS the specification, and its ORDER is load-bearing:
 * > 1. finish → show this run's time · 2. type your name · 3. the time is averaged in and the run
 * > count increments · 4. **only then** is the board revealed · 5. a small cinematic of the
 * > calculation.
 *
 * ⛔ STEP 4 IS AN ANTI-GRIEFING RULE, NOT A UI PREFERENCE. Identity is the typed name, so anyone who
 * can read the table before choosing a name can type a rival's initials and drag their average down
 * on purpose. The gate is enforced by the TYPE — `rows` live only on `update`, and only
 * `applyUpdate` can set it — so a renderer cannot leak what it was never handed.
 */

import { describe, expect, it } from 'vitest';

import {
  applyUpdate,
  beginSubmit,
  cycleLetter,
  elapsedMs,
  finishRun,
  moveCursor,
  placeLine,
  RECAP_EASE_MS,
  recapAverageMs,
  recapSettled,
  revealBoard,
  runName,
  startRun,
  typeLetter,
  visibleRows,
  type ArcadeRun,
} from './arcadeRun.ts';
import type { RankingUpdate } from './arcadeLeaderboard.ts';

const UPDATE: RankingUpdate = {
  rows: [
    { name: 'AAA', runs: 9, averageMs: 50_000 },
    { name: 'DAN', runs: 7, averageMs: 75_000 },
  ],
  place: 2,
  runs: 7,
  lastMs: 63_000,
  previousAverageMs: 78_000,
  averageMs: 75_000,
  shared: true,
  flushed: 0,
};

const solved = (): ArcadeRun => finishRun(startRun(0), 63_000);

describe('R182-G — ⛔ THE REVEAL GATE IS STRUCTURAL', () => {
  it('a fresh run carries NO rows and NO update', () => {
    const run = startRun(0);
    expect(run.update).toBeNull();
    expect(visibleRows(run)).toEqual([]);
  });

  it('⭐ the NAME-ENTRY screen carries no rows — the exact moment griefing would be chosen', () => {
    const run = solved();
    expect(run.phase).toBe('ENTER_INITIALS');
    expect(visibleRows(run)).toEqual([]);
    expect(placeLine(run)).toBe(''); // not even a place to infer the table from
  });

  it('rows appear ONLY once an update has been applied', () => {
    const run = applyUpdate(solved(), UPDATE, 100_000);
    expect(run.phase).toBe('RECAP');
    expect(visibleRows(run)).toHaveLength(2);
  });

  it('⛔ and there is NO transition from ENTER_INITIALS straight to BOARD', () => {
    // `revealBoard` is the only door to the ranking and it refuses anything but RECAP, so a future
    // edit cannot skip the submission by reordering a switch statement.
    const run = solved();
    expect(revealBoard(run)).toBe(run);
    expect(revealBoard(startRun(0)).phase).toBe('RUNNING');
  });
});

describe('R182-G — the phase machine', () => {
  it('RUNNING → ENTER_INITIALS freezes the clock', () => {
    const run = solved();
    expect(run.finishedMs).toBe(63_000);
    expect(elapsedMs(run, 999_999)).toBe(63_000); // frozen, not re-derived
  });

  it('⛔ finishRun is IDEMPOTENT — a double solve must not award a second run', () => {
    // Worse than a duplicate row under an average: folding the same run twice skews a mean forever.
    const once = solved();
    expect(finishRun(once, 999_000)).toBe(once);
  });

  it('beginSubmit latches, so a second ENTER cannot double-submit', () => {
    const run = beginSubmit(solved());
    expect(run.submitting).toBe(true);
    expect(beginSubmit(run)).toBe(run); // no-op the second time
  });

  it('beginSubmit refuses a run with no frozen time', () => {
    expect(beginSubmit(startRun(0)).submitting).toBe(false);
  });

  it('⛔ a LATE reply for a run that has moved on is dropped', () => {
    // The async hazard: this resolves frames later, and ENTER on the BOARD screen starts a whole new
    // run with a live clock. Writing a stale ranking over it would show the last run's result.
    const running = startRun(0);
    expect(applyUpdate(running, UPDATE, 100_000)).toBe(running);
    const board = revealBoard(applyUpdate(solved(), UPDATE, 100_000));
    expect(applyUpdate(board, UPDATE, 200_000)).toBe(board);
  });

  it('RECAP → BOARD', () => {
    expect(revealBoard(applyUpdate(solved(), UPDATE, 100_000)).phase).toBe('BOARD');
  });
});

describe('R182-G — the cinematic', () => {
  it('⭐ eases from the old average to the new one', () => {
    const run = applyUpdate(solved(), UPDATE, 100_000);
    expect(recapAverageMs(run, 100_000)).toBe(78_000); // starts at the OLD value
    expect(recapAverageMs(run, 100_000 + RECAP_EASE_MS)).toBe(75_000); // lands on the new one
    const mid = recapAverageMs(run, 100_000 + RECAP_EASE_MS / 2);
    expect(mid).toBeLessThan(78_000);
    expect(mid).toBeGreaterThan(75_000);
  });

  it('clamps past the end rather than overshooting', () => {
    const run = applyUpdate(solved(), UPDATE, 100_000);
    expect(recapAverageMs(run, 900_000)).toBe(75_000);
  });

  it('⛔ a FIRST run does not ease up from zero', () => {
    // Easing from 0 would animate a brand-new player's average UPWARD, which reads as losing.
    const run = applyUpdate(solved(), { ...UPDATE, previousAverageMs: null, runs: 1, averageMs: 63_000 }, 100_000);
    expect(recapAverageMs(run, 100_000)).toBe(63_000);
    expect(recapSettled(run, 100_000)).toBe(true); // nothing to wait for
  });

  it('settles only after the ease completes', () => {
    const run = applyUpdate(solved(), UPDATE, 100_000);
    expect(recapSettled(run, 100_000)).toBe(false);
    expect(recapSettled(run, 100_000 + RECAP_EASE_MS)).toBe(true);
  });
});

describe('R182-G — names and places', () => {
  it('runName normalises exactly as the store will file it', () => {
    let run = solved();
    run = typeLetter(typeLetter(typeLetter(run, 'd'), 'a'), 'n');
    expect(runName(run)).toBe('DAN');
  });

  it('cycleLetter wraps in both directions; moveCursor clamps', () => {
    let run = solved();
    expect(cycleLetter(run, -1).initials[0]).toBe(' '); // the alphabet ends with a space
    expect(cycleLetter(cycleLetter(run, -1), 1).initials[0]).toBe('A');
    run = moveCursor(run, -5);
    expect(run.cursor).toBe(0);
    expect(moveCursor(run, 99).cursor).toBe(2);
  });

  it('typeLetter ignores anything off the alphabet rather than writing a fallback', () => {
    const run = solved();
    expect(typeLetter(run, '[')).toBe(run);
  });

  it('⭐ every submission is ranked — there is no "not on the board" any more', () => {
    // The owner ruled out a minimum run count: a player is ranked from their very first game.
    const first = applyUpdate(solved(), { ...UPDATE, place: 1 }, 100_000);
    expect(placeLine(first)).toBe('1ST — TOP OF THE RANKING');
    const later = applyUpdate(solved(), { ...UPDATE, place: 12 }, 100_000);
    expect(placeLine(later)).toBe('12TH PLACE');
    expect(placeLine(applyUpdate(solved(), { ...UPDATE, place: 3 }, 100_000))).toBe('3RD PLACE');
  });
});
