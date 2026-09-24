/**
 * SPARK — the double-Escape "leave the match" gesture (S153 A2, S155 P2), as a handler FACTORY so the
 * real handler can be driven by a test in the same order `main.ts` registers it — after `Controls`.
 * `main.ts` owns the wiring and the long rationale (the docblock above its `addEventListener`).
 *
 * ⛔⛔ S189 (C4, disconnect-hunt finding A1) — **AN ESCAPE THAT CANCELLED SOMETHING IS NOT THE FIRST
 * PRESS OF A LEAVE.** `Controls` registers its keydown listener first and uses Escape as the CANCEL
 * key: it drops a held tower and puts the Power-of-Ra aim away. The leave handler ran next on the same
 * event and counted that press — its only guard, `castlePanel.armedBlueprint() !== null`, read the
 * state AFTER `Controls` had already disarmed it, so it was always false (and nothing checked the Ra
 * aim at all). Cancel, then press Escape again inside `TITLE_EXIT_CONFIRM_MS` — a second cancel, or
 * a repeat because a lagging wave-5 frame did not show the first — and the match was abandoned: this
 * tab went to the title, the OTHER player got CONNECTION LOST 15 s later.
 *
 * Now `Controls` marks a cancel as consumed (`preventDefault`), and this handler treats a consumed
 * Escape as "not a leave press" — and resets the chord, so the NEXT press starts a fresh pair.
 */
import { TITLE_EXIT_CONFIRM_MS } from '../constants.ts';

export interface DoubleEscapeKey {
  readonly key: string;
  /** True when an earlier listener consumed this press (a cancel). */
  readonly defaultPrevented?: boolean;
}

export interface DoubleEscapeDeps {
  isPlaying(): boolean;
  /** Typing a name / NONET / a cinematic is running. */
  chordBlocked(): boolean;
  codexOpen(): boolean;
  /** A held tower — defence in depth; `Controls` normally consumes this press first. */
  towerArmed(): boolean;
  confirmOpen(): boolean;
  closeConfirm(): void;
  leave(): void;
  now(): number;
}

export function makeDoubleEscapeLeave(deps: DoubleEscapeDeps): (e: DoubleEscapeKey) => void {
  let lastEscapeAtMs: number | null = null;
  return (e) => {
    if (e.key !== 'Escape') return;
    if (!deps.isPlaying()) return;
    // ⭐ S189 A1 — consumed as a cancel by an earlier listener: not a leave press, and the chord resets.
    if (e.defaultPrevented === true) {
      lastEscapeAtMs = null;
      return;
    }
    if (deps.chordBlocked()) return;
    if (deps.codexOpen()) return;
    if (deps.towerArmed()) return; // the disarm press owns this Escape
    // ⭐ S155 P2 — Escape CANCELS the leave modal rather than leaving (see main.ts).
    if (deps.confirmOpen()) {
      deps.closeConfirm();
      lastEscapeAtMs = null; // and it does NOT count as the first press of a new double-tap
      return;
    }
    const nowMs = deps.now();
    if (lastEscapeAtMs !== null && nowMs - lastEscapeAtMs < TITLE_EXIT_CONFIRM_MS) {
      lastEscapeAtMs = null;
      deps.leave();
      return;
    }
    lastEscapeAtMs = nowMs;
  };
}
