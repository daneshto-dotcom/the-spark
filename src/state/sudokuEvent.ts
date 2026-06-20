/**
 * SPARK — NONET event lifecycle (S93 P1): the 9-square Sudoku lock.
 *
 * HOST-AUTHORITATIVE end to end. The host detects the trigger (detectNonet), starts the
 * trial (startSudoku — mints the event from a seed), validates solves (submitSudokuSolve,
 * first-valid-wins), applies the score swing (resolveSudoku — winner ×2, everyone else ÷2),
 * and drives the no-solver timeout + resume (tickSudoku). Every score mutation AND the
 * detector run host-only, so clients never do the float math — they receive the event (seed
 * only) + the mutated scores via NetSnapshot and render. That is what keeps the feature
 * desync-free (PDR §4). This module is the pure state half; rendering/input/netcode wire in
 * separately (main.ts, net/*, render/sudoku/*).
 */

import { SparkType } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { generateSudoku, isSolved } from './sudoku.ts';
import type { World } from './worldTypes.ts';

/** A NONET fires when a connected component is EXACTLY this many primitives, ALL Squares. */
export const NONET_SQUARE_COUNT = 9;
/** Score multipliers applied on resolve (PDR D3-locked). */
export const NONET_WINNER_MULT = 2;
export const NONET_LOSER_MULT = 0.5;
/** Resume the duel this many ticks after the trial is decided — the win/timeout flash window. 60 Hz. */
export const NONET_RESOLVE_DISPLAY_TICKS = 180; // ~3 s
/** No-solver timeout: resolve with NO score change (anti-softlock, RISK 3). 60 Hz. */
export const NONET_TIMEOUT_TICKS = 7200; // ~120 s

/**
 * Does the component containing `seedId` form a NONET — EXACTLY 9 connected primitives, every
 * one a Square (the "nine squares connected, no other connectors" trigger)? Returns the owner
 * (a structure is single-owner — cross-colour bonds are impossible) or null. HOST-ONLY (clients
 * never trigger). Pure read of world state.
 */
export function detectNonet(world: World, seedId: PrimitiveId): PlayerId | null {
  const seed = world.primitives.get(seedId);
  if (seed === undefined || seed.type !== SparkType.Square) return null;
  const comp = componentOf(seed, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== NONET_SQUARE_COUNT) return null;
  for (const id of comp.primitiveIds) {
    const p = world.primitives.get(id);
    if (p === undefined || p.type !== SparkType.Square) return null;
  }
  return seed.placedBy;
}

/**
 * Begin the trial (HOST-ONLY). `seed` is the host-minted entropy that is broadcast to clients;
 * both sides call generateSudoku(seed) for a byte-identical puzzle. Sets the once-per-match guard.
 */
export function startSudoku(world: World, triggeredBy: PlayerId, seed: number): void {
  world.sudoku = {
    seed,
    puzzle: generateSudoku(seed),
    startTick: world.tick,
    triggeredBy,
    solvedBy: null,
    resolvedTick: null,
  };
  world.sudokuFiredThisMatch = true;
}

/**
 * Deterministic host-minted trial seed. Broadcast to clients (they NEVER recompute it — they
 * regenerate the puzzle from the seed), so its only requirement is host-reproducibility. Mixes
 * the world rng seed + tick + the triggering primitive id for per-trigger variety.
 */
export function mintNonetSeed(world: World, primId: PrimitiveId): number {
  return Math.imul((world.rngSeed ^ world.tick ^ primId) >>> 0, 2654435761) >>> 0;
}

/**
 * Host-side solve submission (first valid wins). Validates `grid` against the puzzle's unique
 * solution; if correct AND the trial is still live, resolves it for `playerId`. Returns whether
 * this submission WON. A wrong or late grid is a silent no-op (the race continues).
 */
export function submitSudokuSolve(
  world: World,
  playerId: PlayerId,
  grid: readonly number[],
): boolean {
  const ev = world.sudoku;
  if (ev === null || ev.resolvedTick !== null) return false; // no trial / already decided
  if (!isSolved(grid, ev.puzzle.solution)) return false; // wrong or incomplete
  resolveSudoku(world, playerId);
  return true;
}

/**
 * Apply the outcome (HOST-ONLY). winner ×2, every OTHER player ÷2, then scoreProgress =
 * max(scoreByPlayer) — the same leader-max rule tickScoring / addScore use. `winnerId === null`
 * = timeout: NO score change, just mark the trial decided. Idempotent (no-op once decided). Does
 * NOT clear world.sudoku — tickSudoku resumes the duel after the display window so the result
 * stays visible. All float math here is host-only → clients receive the new scores via snapshot.
 */
export function resolveSudoku(world: World, winnerId: PlayerId | null): void {
  const ev = world.sudoku;
  if (ev === null || ev.resolvedTick !== null) return;
  if (winnerId !== null) {
    ev.solvedBy = winnerId;
    for (const [pid, score] of world.scoreByPlayer) {
      world.scoreByPlayer.set(
        pid,
        pid === winnerId ? score * NONET_WINNER_MULT : score * NONET_LOSER_MULT,
      );
    }
    let max = 0;
    let any = false;
    for (const v of world.scoreByPlayer.values()) {
      if (!any || v > max) {
        max = v;
        any = true;
      }
    }
    world.scoreProgress = any ? max : 0;
  }
  ev.resolvedTick = world.tick;
}

/**
 * Per-tick driver (HOST-ONLY, called from the main loop while a trial is active). Fires the
 * no-solver timeout, then resumes the duel (clears world.sudoku) once the post-resolve display
 * window elapses.
 */
export function tickSudoku(world: World): void {
  const ev = world.sudoku;
  if (ev === null) return;
  if (ev.resolvedTick === null) {
    if (world.tick - ev.startTick >= NONET_TIMEOUT_TICKS) resolveSudoku(world, null);
  } else if (world.tick - ev.resolvedTick >= NONET_RESOLVE_DISPLAY_TICKS) {
    world.sudoku = null; // resume the duel
  }
}
