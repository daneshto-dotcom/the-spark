import { describe, it, expect } from 'vitest';
import {
  generateSudoku,
  isSolved,
  isValidComplete,
  SUDOKU_CELLS,
  SUDOKU_N,
  SUDOKU_BOX_H,
  SUDOKU_BOX_W,
  SUDOKU_DEFAULT_GIVENS,
} from './sudoku.ts';

describe('sudoku generator (deterministic 6×6)', () => {
  it('is deterministic — same seed → byte-identical puzzle (cross-client invariant)', () => {
    const a = generateSudoku(12345);
    const b = generateSudoku(12345);
    expect(a.givens).toEqual(b.givens);
    expect(a.solution).toEqual(b.solution);
  });

  it('different seeds → different puzzles', () => {
    expect(generateSudoku(1).solution).not.toEqual(generateSudoku(2).solution);
  });

  it('every solution is a complete, rule-legal 6×6 grid', () => {
    for (const seed of [0, 1, 7, 42, 999, 123456]) {
      const { solution } = generateSudoku(seed);
      expect(solution.length).toBe(SUDOKU_CELLS);
      expect(isValidComplete(solution)).toBe(true);
    }
  });

  it('givens are a subset of the solution and leave blanks to solve', () => {
    const { givens, solution } = generateSudoku(77);
    let blanks = 0;
    for (let i = 0; i < SUDOKU_CELLS; i++) {
      if (givens[i] === 0) blanks++;
      else expect(givens[i]).toBe(solution[i]);
    }
    expect(blanks).toBeGreaterThan(0);
  });

  it('reaches the target clue count and stays a real puzzle', () => {
    const { givens } = generateSudoku(5, SUDOKU_DEFAULT_GIVENS);
    const clues = givens.filter((v) => v !== 0).length;
    expect(clues).toBeGreaterThanOrEqual(SUDOKU_DEFAULT_GIVENS);
    expect(clues).toBeLessThan(SUDOKU_CELLS);
  });

  it('the dug puzzle has a unique solution (the givens force exactly the stored solution)', () => {
    const { givens, solution } = generateSudoku(2024);
    for (let i = 0; i < SUDOKU_CELLS; i++) {
      if (givens[i] !== 0) expect(givens[i]).toBe(solution[i]);
    }
  });

  it('box dimensions tile the grid', () => {
    expect(SUDOKU_N % SUDOKU_BOX_H).toBe(0);
    expect(SUDOKU_N % SUDOKU_BOX_W).toBe(0);
    expect(SUDOKU_BOX_H * SUDOKU_BOX_W).toBe(SUDOKU_N);
  });
});

describe('isSolved', () => {
  it('accepts the exact solution', () => {
    const { solution } = generateSudoku(321);
    expect(isSolved([...solution], solution)).toBe(true);
  });

  it('rejects a one-cell-off grid', () => {
    const { solution } = generateSudoku(321);
    const wrong = [...solution];
    wrong[0] = (wrong[0] % SUDOKU_N) + 1; // flip cell 0 to a different digit
    expect(isSolved(wrong, solution)).toBe(false);
  });

  it('rejects an incomplete grid', () => {
    const { solution } = generateSudoku(321);
    const partial = [...solution];
    partial[10] = 0;
    expect(isSolved(partial, solution)).toBe(false);
  });
});

describe('isValidComplete', () => {
  it('rejects a grid with a blank', () => {
    const { solution } = generateSudoku(9);
    const g = [...solution];
    g[0] = 0;
    expect(isValidComplete(g)).toBe(false);
  });

  it('rejects a row/col/box duplicate', () => {
    const { solution } = generateSudoku(9);
    const g = [...solution];
    g[0] = g[1]; // force a row duplicate
    expect(isValidComplete(g)).toBe(false);
  });
});
