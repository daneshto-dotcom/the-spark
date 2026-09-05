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

import { recomputeScoreProgress } from './gameMode.ts';
import { componentOf } from '../game/structure.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { generateSudoku, isSolved } from './sudoku.ts';
import type { World } from './worldTypes.ts';

/**
 * A NONET fires when a connected component is EXACTLY this many primitives, all the SAME SparkType.
 *
 * ⭐ S164 P4 (owner R132) — **RAISED 9 → 12 SO THE TIER-9 BOSS TOWER CAN HAVE NINE.** The races
 * art-direction brief builds a boss tower from *"nine of the race's own shape"*, which is exactly
 * what this swept for — so as specced, the FIRST boss tower of every match would also have summoned
 * the sudoku trial, and because the trial is once-per-match it would have collided for the first
 * boss and not for later ones. An inconsistency players would read as a bug.
 *
 * Four resolutions went to the owner. The ruling separates the two triggers by COUNT rather than by
 * precedence: **9 = boss tower, 12 = NONET.** Nothing needs to know about the other, no ordering
 * rule exists to get wrong, and both stay reachable.
 *
 * ⚠ THE NAME IS NOW A MISNOMER AND IT STAYS. "Nonet" means a set of nine, and this is twelve. The
 * word is the feature's identity across the audio theme (`nonet-theme.ogg`), the arcade mode
 * (`makeArcadeNonet`), the save format and the UI — renaming it would touch all of that to fix a
 * label nobody sees. Recorded so the next reader knows it is deliberate rather than stale.
 *
 * ⚠ AND IT COUNTS PRIMITIVES, NOT CONNECTORS. The owner's phrasing was *"12 same-shape-connectors"*,
 * and the footer band is indexed by connector count — but `detectNonet` has always measured
 * `comp.primitiveIds.size`, so this is twelve SHAPES in one component. One word flips it if the
 * intent was twelve bonds.
 */
export const NONET_SHAPE_COUNT = 12;
/** Score multipliers applied on resolve. S106 — loser 0.5 → 0.4 (owner: "things that make you
 *  lose points ... so players can actually compete"): losing a NONET now costs you 60% of your
 *  banked score, not half — a real gut-punch so a runaway leader can be reeled in. Winner stays ×2. */
export const NONET_WINNER_MULT = 2;
export const NONET_LOSER_MULT = 0.4;
/** Resume the duel this many ticks after the trial is decided — the win/timeout flash window. 60 Hz. */
export const NONET_RESOLVE_DISPLAY_TICKS = 180; // ~3 s
/** No-solver timeout: resolve with NO score change (anti-softlock, RISK 3). 60 Hz. */
export const NONET_TIMEOUT_TICKS = 10800; // ~180 s (S94 — +60 s per user request)

/**
 * Sweep all connected components for a NONET — a component of EXACTLY `NONET_SHAPE_COUNT` primitives
 * that are ALL the SAME SparkType (12 squares, OR 12 circles, OR 12 spirals, …). Returns that
 * component's owner
 * (single-owner — cross-colour bonds are impossible) or null. HOST-ONLY. Pure read of world state.
 * A SWEEP (not a seeded check) so it fires whether the structure is BUILT up to 9 same-type OR
 * ERASED down to 9 of one type (S94 — the user's "build big, erase to 9 of a type" tactic). The
 * host calls this each tick until it fires; the once-per-match guard then skips it (see main.ts).
 */
export function detectNonet(world: World): PlayerId | null {
  const seen = new Set<PrimitiveId>();
  for (const start of world.primitives.values()) {
    if (seen.has(start.id)) continue;
    const comp = componentOf(start, world.primitives, world.bonds);
    for (const id of comp.primitiveIds) seen.add(id);
    if (comp.primitiveIds.size !== NONET_SHAPE_COUNT) continue;
    let sameType = true;
    for (const id of comp.primitiveIds) {
      const p = world.primitives.get(id);
      if (p === undefined || p.type !== start.type) {
        sameType = false;
        break;
      }
    }
    if (sameType) return start.placedBy;
  }
  return null;
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
 * the world rng seed + the firing tick for per-trial variety.
 */
export function mintNonetSeed(world: World): number {
  return Math.imul((world.rngSeed ^ world.tick) >>> 0, 2654435761) >>> 0;
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
    recomputeScoreProgress(world);
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
