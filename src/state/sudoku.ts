/**
 * SPARK — NONET minigame: deterministic 6×6 Sudoku generator + validator (S93 P1).
 *
 * The NONET event (see state/sudokuEvent.ts) freezes the duel and shows the SAME puzzle
 * to every player. Cross-client identity is guaranteed the same way the rest of SPARK
 * guarantees determinism (rng.ts § 10.5 LOCKED): the HOST mints ONE integer seed and
 * broadcasts it; every client calls generateSudoku(seed) and — because the generator's
 * ONLY entropy is mulberry32(seed) — reconstructs a BYTE-IDENTICAL puzzle (givens +
 * solution). No grid is ever sent over the wire, only the seed.
 *
 * 6×6 variant: digits 1..6 (mapped to the six SparkType colours in the renderer), boxes
 * are 2 rows tall × 3 cols wide (3 box-rows × 2 box-cols = 6 boxes of 6 cells). Cells are
 * a flat length-36 array, index = row*6 + col, row-major, 0 = empty.
 */

import { mulberry32, type Rng } from './rng.ts';
import type { PlayerId } from '../types.ts';

export const SUDOKU_N = 6; // grid side
export const SUDOKU_CELLS = 36; // N*N
export const SUDOKU_BOX_H = 2; // box height (rows)
export const SUDOKU_BOX_W = 3; // box width (cols)
/** Default clue count for the 6×6 trial — ~16 of 36 reads as a real puzzle, ~30–90s solve. */
export const SUDOKU_DEFAULT_GIVENS = 16;

export interface SudokuPuzzle {
  readonly seed: number;
  /** length-36, row-major; 0 = empty, 1..6 = a given clue. */
  readonly givens: readonly number[];
  /** length-36, row-major; the unique 1..6 solution. */
  readonly solution: readonly number[];
}

/**
 * An active NONET trial on the World. Defined here (a leaf module) so worldTypes.ts can
 * reference it without a cycle. Only `seed` + `solvedBy` + `resolvedTick` + `triggeredBy`
 * cross the wire (NetSnapshot); `puzzle` is regenerated from `seed` on every peer.
 */
export interface SudokuEvent {
  /** Host-minted entropy broadcast to clients — the ONLY randomness, → identical puzzle everywhere. */
  readonly seed: number;
  /** Regenerated from `seed` on host AND each client (never serialized). */
  readonly puzzle: SudokuPuzzle;
  /** world.tick the trial began (drives the no-solver timeout). */
  readonly startTick: number;
  /** Owner of the 9-square nonet that summoned the trial. */
  readonly triggeredBy: PlayerId;
  /** First player to solve; null while unsolved or after a no-solver timeout. */
  solvedBy: PlayerId | null;
  /** Tick the trial was decided (win OR timeout); null while live. Drives the resume window. */
  resolvedTick: number | null;
}

const idx = (r: number, c: number): number => r * SUDOKU_N + c;

/** In-place Fisher–Yates using the seeded rng (deterministic given the rng stream). */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Can digit d be placed at (r,c) without violating its row / col / box? */
function canPlace(grid: number[], r: number, c: number, d: number): boolean {
  for (let k = 0; k < SUDOKU_N; k++) {
    if (grid[idx(r, k)] === d) return false; // row
    if (grid[idx(k, c)] === d) return false; // col
  }
  const br = Math.floor(r / SUDOKU_BOX_H) * SUDOKU_BOX_H;
  const bc = Math.floor(c / SUDOKU_BOX_W) * SUDOKU_BOX_W;
  for (let dr = 0; dr < SUDOKU_BOX_H; dr++) {
    for (let dc = 0; dc < SUDOKU_BOX_W; dc++) {
      if (grid[idx(br + dr, bc + dc)] === d) return false; // box
    }
  }
  return true;
}

/** Fill an empty grid to a complete valid solution; seeded digit order → deterministic. */
function fillSolution(grid: number[], rng: Rng, pos = 0): boolean {
  if (pos === SUDOKU_CELLS) return true;
  const r = Math.floor(pos / SUDOKU_N);
  const c = pos % SUDOKU_N;
  for (const d of shuffle([1, 2, 3, 4, 5, 6], rng)) {
    if (canPlace(grid, r, c, d)) {
      grid[idx(r, c)] = d;
      if (fillSolution(grid, rng, pos + 1)) return true;
      grid[idx(r, c)] = 0;
    }
  }
  return false;
}

/**
 * Count solutions of a (partial) grid up to `limit`, early-exiting once the limit is hit.
 * Used by the digger to keep the dug puzzle UNIQUELY solvable. Mutates `grid` during the
 * search but restores every cell it touches, so callers pass a throwaway copy anyway.
 */
function countSolutions(grid: number[], limit: number, pos = 0): number {
  let p = pos;
  while (p < SUDOKU_CELLS && grid[p] !== 0) p++;
  if (p === SUDOKU_CELLS) return 1;
  const r = Math.floor(p / SUDOKU_N);
  const c = p % SUDOKU_N;
  let count = 0;
  for (let d = 1; d <= SUDOKU_N; d++) {
    if (canPlace(grid, r, c, d)) {
      grid[p] = d;
      count += countSolutions(grid, limit, p + 1);
      grid[p] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

/**
 * Generate a uniquely-solvable 6×6 puzzle from `seed`. PURE fn of (seed) via mulberry32,
 * so it is identical on every client. `targetGivens` is the desired clue count; the digger
 * removes cells in seeded-random order, keeping a removal ONLY while a unique solution
 * survives — so the realised clue count may sit slightly above target if removing further
 * would make the puzzle ambiguous (never below, never the full grid).
 */
export function generateSudoku(seed: number, targetGivens = SUDOKU_DEFAULT_GIVENS): SudokuPuzzle {
  const rng = mulberry32(seed);
  const solution = new Array<number>(SUDOKU_CELLS).fill(0);
  fillSolution(solution, rng); // always succeeds on an empty 6×6

  const givens = solution.slice();
  let clues = SUDOKU_CELLS;
  for (const cell of shuffle([...Array(SUDOKU_CELLS).keys()], rng)) {
    if (clues <= targetGivens) break;
    const saved = givens[cell];
    givens[cell] = 0;
    if (countSolutions(givens.slice(), 2) === 1) {
      clues--; // still unique → keep it dug
    } else {
      givens[cell] = saved; // removal made it ambiguous → restore the clue
    }
  }
  return { seed, givens, solution };
}

/** Is `entries` (length-36, 0=blank) a complete solve? Equality to the puzzle's unique solution. */
export function isSolved(entries: readonly number[], solution: readonly number[]): boolean {
  if (entries.length !== solution.length) return false;
  for (let i = 0; i < solution.length; i++) {
    if (entries[i] !== solution[i]) return false;
  }
  return true;
}

/**
 * Validate that `grid` is a COMPLETE, rule-legal 6×6 Sudoku (every row, col and box holds
 * 1..6 exactly once, no blanks). Used host-side to validate a submitted solve independently
 * of the stored solution (defence in depth alongside isSolved).
 */
export function isValidComplete(grid: readonly number[]): boolean {
  if (grid.length !== SUDOKU_CELLS) return false;
  const fullSet = (vals: number[]): boolean => {
    const s = new Set(vals);
    return s.size === SUDOKU_N && !s.has(0);
  };
  for (let r = 0; r < SUDOKU_N; r++) {
    const row: number[] = [];
    const col: number[] = [];
    for (let c = 0; c < SUDOKU_N; c++) {
      row.push(grid[idx(r, c)]);
      col.push(grid[idx(c, r)]);
    }
    if (!fullSet(row) || !fullSet(col)) return false;
  }
  for (let br = 0; br < SUDOKU_N; br += SUDOKU_BOX_H) {
    for (let bc = 0; bc < SUDOKU_N; bc += SUDOKU_BOX_W) {
      const box: number[] = [];
      for (let dr = 0; dr < SUDOKU_BOX_H; dr++) {
        for (let dc = 0; dc < SUDOKU_BOX_W; dc++) box.push(grid[idx(br + dr, bc + dc)]);
      }
      if (!fullSet(box)) return false;
    }
  }
  return true;
}
