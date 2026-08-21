/**
 * SPARK — S150 P3: **THE ARCADE TIMED RUN — the state machine, pure.**
 *
 * Owner, S149:
 * > *"we will make it a trial on time. see who can finish it as fast as possible and then he can
 * > register his score and name in an arcade-like winnerboard. only like top 25 are shown and it
 * > tells him place place his score is. like in a real arcade from the 80s"*
 *
 * `arcadeScores.ts` shipped the BOARD in S149 — ranking, the inverted sort, storage, `M:SS.cc`. It
 * shipped with **zero consumers**, tree-shaken out of the bundle entirely, because the three screens
 * that would have used it were never built. This file is the missing half: the run itself — a clock,
 * an initials entry, and the transitions between them.
 *
 * ## Why a separate state machine rather than fields on the overlay
 *
 * Every rule here is a pure function of `(run, input)`, so the whole of "what happens when you
 * solve", "what happens when you cycle past Z", "what does the clock read" is testable headlessly
 * (the S130 lesson this repo keeps re-learning). The Pixi layer in `arcadeRunOverlay.ts` renders
 * this and decides nothing.
 *
 * ## ⛔ THE CLOCK IS WALL-CLOCK, AND THAT IS ONLY SAFE BECAUSE THE ARCADE IS NOT THE SIM
 *
 * `performance.now()` would be a determinism hazard anywhere inside the hashed host tick. It is
 * legitimate HERE for exactly the reason `arcadeOverlay` exists at all: an arcade run touches no
 * simulation state, crosses no wire, and feeds nothing host-authoritative. `world.sudoku` stays
 * `null` for the entire run; the puzzle is held as render state and solved against
 * `puzzle.solution` locally. So the clock is a UI readout, not a game input — and a *sim* clock
 * would actually be WRONG here, because the sim does not advance on the title screen at all.
 *
 * The caller passes `nowMs` in rather than this module reading the clock, which keeps every function
 * below pure and lets the tests drive time by hand.
 *
 * ## The 1980s cabinet conventions that shape the input model
 *
 * A cabinet had a stick and a button, not a keyboard: you CYCLE a letter and COMMIT it. That is why
 * `cycleLetter` wraps in both directions and why the cursor is a position rather than a text caret —
 * there is no such thing as an invalid intermediate state, so there is nothing to validate on
 * submit. Typing is also accepted, because refusing a keyboard on a machine that has one is
 * cosplay rather than homage.
 */

import { NAME_ALPHABET, NAME_LEN, recordRun, type ArcadeScore } from './arcadeScores.ts';

/**
 * Which screen the run is on.
 *
 * `RUNNING` → the puzzle is up and the clock is live.
 * `ENTER_INITIALS` → solved; the clock is frozen and the player is spelling their name.
 * `BOARD` → the table, with this run's row highlighted.
 */
export type ArcadeRunPhase = 'RUNNING' | 'ENTER_INITIALS' | 'BOARD';

export interface ArcadeRun {
  readonly phase: ArcadeRunPhase;
  /** Wall-clock stamp when the puzzle launched. */
  readonly startedAtMs: number;
  /** Frozen elapsed time, set once on solve. `null` while RUNNING. */
  readonly finishedMs: number | null;
  /** Exactly `NAME_LEN` characters, each drawn from `NAME_ALPHABET`. */
  readonly initials: readonly string[];
  /** Which of the three characters the stick is on, `0..NAME_LEN-1`. */
  readonly cursor: number;
  /** Populated on commit: the board as it now stands, plus where this run landed. */
  readonly scores: readonly ArcadeScore[];
  readonly place: number | null;
  readonly onBoard: boolean;
  /**
   * The wall-clock stamp this run was committed with, retained so the board can identify THIS row.
   *
   * ⚠ NOT decoration. Two runs can legitimately share a time AND a set of initials — the same player
   * repeating a memorised board is the likeliest case of all — and `(name, ms)` alone would then
   * highlight whichever one sorted first. `at` is the tie-breaker the comparator already uses, so
   * carrying it makes the row identifiable by exactly the triple that makes it unique.
   */
  readonly committedAtMs: number | null;
}

/** A fresh run, clock started. */
export function startRun(nowMs: number): ArcadeRun {
  return {
    phase: 'RUNNING',
    startedAtMs: nowMs,
    finishedMs: null,
    initials: Array.from({ length: NAME_LEN }, () => 'A'),
    cursor: 0,
    scores: [],
    place: null,
    onBoard: false,
    committedAtMs: null,
  };
}

/**
 * What the clock reads.
 *
 * ⚠ CLAMPED AT ZERO AND MONOTONIC ONCE FROZEN. `performance.now()` is monotonic within a document,
 * but the run survives a tab going to sleep and the frozen value must never be re-derived — so once
 * `finishedMs` is set it is returned verbatim, and the live branch cannot go negative even if a
 * caller passes a stale `nowMs`.
 */
export function elapsedMs(run: ArcadeRun, nowMs: number): number {
  if (run.finishedMs !== null) return run.finishedMs;
  return Math.max(0, nowMs - run.startedAtMs);
}

/**
 * Solved — freeze the clock and go to the initials screen.
 *
 * IDEMPOTENT ON PURPOSE. The solve callback in `main.ts` is driven by the overlay's submit handler,
 * and a double-submit (or a re-render racing the transition) must not restart the clock or, worse,
 * award a second row. Anything already finished is returned untouched.
 */
export function finishRun(run: ArcadeRun, nowMs: number): ArcadeRun {
  if (run.phase !== 'RUNNING') return run;
  return { ...run, phase: 'ENTER_INITIALS', finishedMs: Math.max(0, nowMs - run.startedAtMs) };
}

/** Move the stick left/right across the three characters. Clamps; does not wrap. */
export function moveCursor(run: ArcadeRun, delta: number): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS') return run;
  const cursor = Math.min(NAME_LEN - 1, Math.max(0, run.cursor + delta));
  return { ...run, cursor };
}

/**
 * Cycle the character under the stick. WRAPS in both directions — the cabinet behaviour, and the
 * reason there is no invalid state to reject on submit.
 */
export function cycleLetter(run: ArcadeRun, delta: number): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS') return run;
  const alphabet = NAME_ALPHABET;
  const at = alphabet.indexOf(run.initials[run.cursor]);
  const from = at < 0 ? 0 : at;
  // `% len` after `+ len` so a negative delta wraps rather than producing a negative index.
  const next = (((from + delta) % alphabet.length) + alphabet.length) % alphabet.length;
  const initials = [...run.initials];
  initials[run.cursor] = alphabet[next];
  return { ...run, initials };
}

/**
 * Type a character directly, then advance the stick.
 *
 * Anything outside the alphabet is IGNORED rather than mapped to a fallback: a player who hits a
 * bracket key meant nothing by it, and silently writing 'A' would look like a stuck key.
 */
export function typeLetter(run: ArcadeRun, raw: string): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS') return run;
  const ch = raw.toUpperCase();
  if (ch.length !== 1 || !NAME_ALPHABET.includes(ch)) return run;
  const initials = [...run.initials];
  initials[run.cursor] = ch;
  return { ...run, initials, cursor: Math.min(NAME_LEN - 1, run.cursor + 1) };
}

/**
 * Commit the run to the board and show it.
 *
 * ⚠ THE ONLY IMPURE FUNCTION IN THIS FILE — `recordRun` touches `localStorage`. Kept as one clearly
 * named seam rather than sprinkled through the transitions, so every other rule stays testable
 * without a storage stub.
 *
 * Refuses unless the clock is actually frozen: committing a `finishedMs` of `null` would write a
 * row with an elapsed time of zero, which would sit at the top of the board forever.
 */
export function commitRun(run: ArcadeRun, atMs: number): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS' || run.finishedMs === null) return run;
  const { scores, place, onBoard } = recordRun(run.initials.join(''), run.finishedMs, atMs);
  return { ...run, phase: 'BOARD', scores, place, onBoard, committedAtMs: atMs };
}

/**
 * What the cabinet says about where you came.
 *
 * Owner: *"it tells him place place his score is"* — including when you MISSED the table, which is
 * the case a board-only screen silently drops.
 */
export function placeLine(run: ArcadeRun): string {
  if (run.place === null) return '';
  const n = run.place;
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'TH' : n % 10 === 1 ? 'ST' : n % 10 === 2 ? 'ND' : n % 10 === 3 ? 'RD' : 'TH';
  if (!run.onBoard) return `${n}${suffix} — NOT ON THE BOARD`;
  return n === 1 ? '1ST — NEW RECORD' : `${n}${suffix} PLACE`;
}
