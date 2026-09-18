/**
 * SPARK — **THE ARCADE TIMED RUN — the state machine, pure.** S150 built it, S182 R182-G reshaped it.
 *
 * Owner, S149, on the run itself:
 * > *"we will make it a trial on time. see who can finish it as fast as possible and then he can
 * > register his score and name in an arcade-like winnerboard."*
 *
 * Owner, S182, on what happens after — and the ORDER is the specification:
 * > 1. finish → show this run's time · 2. type your name · 3. if that name exists the new time is
 * > averaged in and the run count increments · 4. **only then** is the board revealed · 5. a small
 * > cinematic of the calculation.
 *
 * ## ⛔ THE REVEAL GATE IS STRUCTURAL, NOT A UI DECISION
 *
 * > *"You can't see all the names before you put your name, and that way people won't cheat and try
 * > to change each other's score."*
 *
 * Identity is the typed name, so anyone who can read the table before choosing a name can type a
 * rival's initials and drag their average down deliberately. The gate is enforced by the TYPE here,
 * not by the renderer remembering to hide something: `rows` lives only on the `RECAP`/`BOARD` states,
 * and `startRun`/`finishRun` cannot produce them. A renderer has nothing to leak because no earlier
 * phase carries any rows at all.
 *
 * ⚠ It is not airtight and must not be sold as if it were — the GET endpoint is public, so devtools
 * reads the table without playing. What it removes is the path of least resistance at the cabinet.
 *
 * ## ⛔ THE CLOCK IS WALL-CLOCK, AND THAT IS ONLY SAFE BECAUSE THE ARCADE IS NOT THE SIM
 *
 * `performance.now()` would be a determinism hazard anywhere inside the hashed host tick. It is
 * legitimate HERE for the reason `arcadeOverlay` exists at all: an arcade run touches no simulation
 * state, crosses no wire and feeds nothing host-authoritative. `world.sudoku` stays `null` for the
 * entire run. A *sim* clock would actually be WRONG, because the sim does not advance on the title
 * screen. The caller passes `nowMs` in, which keeps every function below pure.
 */

import { NAME_ALPHABET, NAME_LEN, normaliseName, type RankingRow } from './arcadeScores.ts';
import {
  BOARD_NONET,
  getLeaderboard,
  type RankingUpdate,
} from './arcadeLeaderboard.ts';

/**
 * Which screen the run is on.
 *
 * `RUNNING` → the puzzle is up and the clock is live.
 * `ENTER_INITIALS` → solved; the clock is frozen, this run's time is shown, the player spells a name.
 * `RECAP` → ⭐ R182-G: the calculation, as a beat. This run, the old average, the new one, the count.
 * `BOARD` → the ranking, with this player's row highlighted.
 */
export type ArcadeRunPhase = 'RUNNING' | 'ENTER_INITIALS' | 'RECAP' | 'BOARD';

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
  /**
   * ⛔ THE RANKING, AND `null` UNTIL A SUBMISSION HAS HAPPENED. This field IS the reveal gate: it is
   * populated only by `applyUpdate`, which only ever runs after `submitRun`.
   */
  readonly update: RankingUpdate | null;
  /** Wall-clock stamp the RECAP began, so the cinematic can ease. `null` until then. */
  readonly recapStartedMs: number | null;
  /** True while a submission is in flight — the screen says so rather than appearing frozen. */
  readonly submitting: boolean;
}

/** A fresh run, clock started. */
export function startRun(nowMs: number): ArcadeRun {
  return {
    phase: 'RUNNING',
    startedAtMs: nowMs,
    finishedMs: null,
    initials: Array.from({ length: NAME_LEN }, () => 'A'),
    cursor: 0,
    update: null,
    recapStartedMs: null,
    submitting: false,
  };
}

/**
 * What the clock reads.
 *
 * ⚠ CLAMPED AT ZERO AND MONOTONIC ONCE FROZEN. `performance.now()` is monotonic within a document,
 * but the run survives a tab sleeping and the frozen value must never be re-derived — so once
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
 * IDEMPOTENT ON PURPOSE. The solve callback is driven by the overlay's submit handler, and a
 * double-submit (or a re-render racing the transition) must not restart the clock or award a second
 * run — which under an average would be worse than a duplicate row: it would permanently skew a mean.
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

/** The name this run will be filed under — normalised exactly as the store will file it. */
export function runName(run: ArcadeRun): string {
  return normaliseName(run.initials.join(''));
}

/** PURE — mark a submission as in flight, so the screen can say so instead of looking hung. */
export function beginSubmit(run: ArcadeRun): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS' || run.finishedMs === null || run.submitting) return run;
  return { ...run, submitting: true };
}

/**
 * PURE — the submission came back: enter RECAP with the calculation to show.
 *
 * ⛔ GUARDED ON `ENTER_INITIALS`, and the guard is the async-safety argument. A leaderboard reply is
 * an async event in a game whose screens advance synchronously: by the time it resolves the player
 * may have pressed ESC to the menu or started a whole new run with a fresh clock. Writing a stale
 * ranking and a stale place into either would show the previous run's result over the new one. A late
 * reply for a run that has moved on is dropped. The CALLER must additionally check it still holds the
 * same run object — only it knows what `arcadeRun` points at now.
 */
export function applyUpdate(run: ArcadeRun, update: RankingUpdate, nowMs: number): ArcadeRun {
  if (run.phase !== 'ENTER_INITIALS') return run;
  return { ...run, phase: 'RECAP', update, recapStartedMs: nowMs, submitting: false };
}

/** Leave the cinematic for the ranking itself. Only reachable once an update exists. */
export function revealBoard(run: ArcadeRun): ArcadeRun {
  if (run.phase !== 'RECAP' || run.update === null) return run;
  return { ...run, phase: 'BOARD' };
}

/**
 * ⭐ THE ASYNC SEAM — submit a finished run and hand back the run in RECAP.
 *
 * ONE entry point, so `main.ts` gains a call rather than a protocol. Returns the run untouched when
 * there is nothing to do (wrong phase, no frozen time). Never throws: the client's contract is that
 * every network failure degrades to the offline tier, so a `RankingUpdate` always arrives.
 */
export async function submitRun(
  run: ArcadeRun,
  nowMs: number,
  boardId: string = BOARD_NONET,
): Promise<ArcadeRun> {
  if (run.phase !== 'ENTER_INITIALS' || run.finishedMs === null) return run;
  const update = await getLeaderboard().submit(boardId, runName(run), run.finishedMs);
  return applyUpdate(run, update, nowMs);
}

/** How long the average eases from its old value to its new one. Mine — long enough to read. */
export const RECAP_EASE_MS = 1400;

/**
 * PURE — the average to PRINT during the cinematic, eased from the old value toward the new.
 *
 * Owner: *"a cool little cinematic of the whole calculation: 'we finished this in a minute zero
 * three, so far your best average is a minute eighteen, that brings it down to...'"* — the sentence
 * is a movement between two numbers, so the screen moves between them rather than cutting.
 *
 * ⚠ A FIRST RUN HAS NOTHING TO EASE FROM and jumps straight to the value: easing from zero would
 * animate a brand-new player's average *upward* from 0:00, which reads as losing something.
 */
export function recapAverageMs(run: ArcadeRun, nowMs: number): number {
  const u = run.update;
  if (u === null) return 0;
  if (u.previousAverageMs === null) return u.averageMs;
  if (run.recapStartedMs === null) return u.averageMs;
  const t = Math.min(1, Math.max(0, (nowMs - run.recapStartedMs) / RECAP_EASE_MS));
  // easeOutCubic — fast off the mark, settling onto the final number rather than arriving abruptly.
  const e = 1 - Math.pow(1 - t, 3);
  return u.previousAverageMs + (u.averageMs - u.previousAverageMs) * e;
}

/** Has the cinematic finished moving? The "ENTER to see the ranking" prompt waits for this. */
export function recapSettled(run: ArcadeRun, nowMs: number): boolean {
  if (run.update === null) return false;
  if (run.update.previousAverageMs === null || run.recapStartedMs === null) return true;
  return nowMs - run.recapStartedMs >= RECAP_EASE_MS;
}

/**
 * What the cabinet says about where you came.
 *
 * Owner, S149: *"it tells him place place his score is"*. Under R182-G every submission earns a row,
 * so there is no "not on the board" case any more — a player is ranked from their very first game.
 * The owner ruled out a minimum run count explicitly.
 */
export function placeLine(run: ArcadeRun): string {
  const u = run.update;
  if (u === null) return '';
  const n = u.place;
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'TH' : n % 10 === 1 ? 'ST' : n % 10 === 2 ? 'ND' : n % 10 === 3 ? 'RD' : 'TH';
  return n === 1 ? '1ST — TOP OF THE RANKING' : `${n}${suffix} PLACE`;
}

/** The rows to draw, or an empty list. ⛔ The ONLY way a renderer can reach them. */
export function visibleRows(run: ArcadeRun): readonly RankingRow[] {
  return run.update?.rows ?? [];
}
