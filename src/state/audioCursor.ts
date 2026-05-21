/**
 * SPARK — audio drain-cursor reset publisher (state-layer).
 *
 * Audit Pass 2 fix 622a7c7f — restores the state→render layer boundary that
 * the Pass-1 fix 3c8630d7 inadvertently breached. Pre-Pass-2, save.ts and
 * main.ts called resetAudioDrainCursor() via a direct
 * `import { resetAudioDrainCursor } from '../render/audioManager.ts'` —
 * the only state→render import in the codebase, and a precedent for future
 * creep. This module replaces that import with a publish/subscribe seam:
 *   - state layer publishes "reset audio cursor" events via triggerReset()
 *   - render layer subscribes at audioManager.ts module-init via
 *     registerResetHandler(resetAudioDrainCursor)
 *
 * Single-handler is intentional — there is only ever one audio drain cursor
 * in the codebase. If a second render-layer subsystem ever needs the same
 * "world.tick discontinuity" event, this surface trivially generalizes to a
 * Set<() => void> (the API stays additive).
 *
 * Both functions are no-ops if invoked before module-init registration;
 * test paths that never load audioManager.ts (and therefore never register
 * a handler) treat triggerReset() as a silent no-op, preserving Pass-1's
 * "safe to call from test paths that never initialize audio" guarantee.
 *
 * Pure module-level state; no AudioContext interaction. Safe to import from
 * any layer without side effects until a handler is registered.
 */

let resetHandler: (() => void) | null = null;

/**
 * Register the render-layer reset handler. Idempotent: a second call
 * overwrites the prior handler (single-slot by design — single audio
 * subsystem in this project). audioManager.ts wires this at module init.
 */
export function registerResetHandler(fn: () => void): void {
  resetHandler = fn;
}

/**
 * Fire the registered reset handler. No-op when no handler has been
 * registered (test paths that bypass audioManager.ts entirely). Called by
 * save.ts:restore() on save-load tick-discontinuity and by main.ts:
 * teardownNet on the RETURN_TO_TITLE lifecycle path.
 */
export function triggerReset(): void {
  if (resetHandler !== null) resetHandler();
}

/**
 * Internal test hook: clear the registered handler. Allows tests to verify
 * the no-op-when-unregistered contract without leaking handler state across
 * suite boundaries. Not part of the production surface.
 */
export function _clearResetHandlerForTest(): void {
  resetHandler = null;
}
