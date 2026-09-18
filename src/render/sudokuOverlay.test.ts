/**
 * SPARK — S182: NONET consistency. The navigation rules, as pure functions.
 *
 * Owner, S182: *"We need to fix the whole Sudoku thing too because we have a nice Sudoku, it looked
 * good, but it's not consistent."*
 *
 * ⛔ THE BUG THESE TESTS PIN WAS INVISIBLE TO EVERY EXISTING ASSERTION, AND THAT IS THE POINT. The
 * arrow keys "worked": they moved an index, within bounds, deterministically. What they did not do
 * was guarantee the index landed somewhere a digit could be typed — and digit entry is gated on
 * exactly that. So the cursor could sit on a given clue while every keystroke was silently swallowed,
 * and the game read as frozen. Nothing was thrown, nothing was logged, nothing was red.
 *
 * The lesson generalises past the arrow keys: an input handler's contract is not "it changed some
 * state", it is "the state it produced is one the NEXT handler can act on".
 */

import { describe, expect, it } from 'vitest';

import { formatCountdown, moveSelection, nextEditableCell } from './sudokuOverlay.ts';
import { SUDOKU_CELLS, SUDOKU_N } from '../state/sudoku.ts';

/** No givens at all — every cell editable. Isolates the movement geometry from the skipping rule. */
const OPEN = new Array<number>(SUDOKU_CELLS).fill(0);
const at = (r: number, c: number): number => r * SUDOKU_N + c;

describe('S182 SI-A — a move lands on an EDITABLE cell or it does not happen', () => {
  it('⛔ steps over a given rather than parking on it', () => {
    // (0,1) is a clue. Moving right from (0,0) must not stop there — stopping is what made every
    // subsequent keystroke a no-op with no feedback of any kind.
    const givens = [...OPEN];
    givens[at(0, 1)] = 5;
    expect(moveSelection(at(0, 0), givens, 0, 1)).toBe(at(0, 2));
  });

  it('steps over a RUN of givens', () => {
    const givens = [...OPEN];
    givens[at(0, 1)] = 5;
    givens[at(0, 2)] = 3;
    givens[at(0, 3)] = 1;
    expect(moveSelection(at(0, 0), givens, 0, 1)).toBe(at(0, 4));
  });

  it('⛔ REFUSES the move when nothing editable lies that way, rather than moving somewhere useless', () => {
    const givens = [...OPEN];
    for (let c = 1; c < SUDOKU_N; c++) givens[at(0, c)] = 1; // rest of the row is all clues
    expect(moveSelection(at(0, 0), givens, 0, 1)).toBe(at(0, 0)); // unchanged
  });

  it('⛔ a horizontal move CANNOT change rows — the old `+1` walked onto the next row', () => {
    // From the last column, `Math.min(CELLS - 1, selected + 1)` used to teleport the cursor to
    // column 0 of the row below. No grid UI anywhere does that.
    expect(moveSelection(at(2, SUDOKU_N - 1), OPEN, 0, 1)).toBe(at(2, SUDOKU_N - 1));
    expect(moveSelection(at(2, 0), OPEN, 0, -1)).toBe(at(2, 0));
  });

  it('a vertical move cannot change columns, and clamps at the top and bottom edges', () => {
    expect(moveSelection(at(0, 3), OPEN, -1, 0)).toBe(at(0, 3));
    expect(moveSelection(at(SUDOKU_N - 1, 3), OPEN, 1, 0)).toBe(at(SUDOKU_N - 1, 3));
    expect(moveSelection(at(2, 3), OPEN, 1, 0)).toBe(at(3, 3));
  });

  it('with no selection yet, the first move selects the first editable cell', () => {
    const givens = [...OPEN];
    givens[0] = 4;
    givens[1] = 2;
    expect(moveSelection(-1, givens, 0, 1)).toBe(2);
  });
});

describe('S182 SI-D — auto-advance goes FORWARD from the hand, not back to index 0', () => {
  it('⛔ advances to the next hole after the current cell', () => {
    // The old `findIndex` searched from 0 every time, so filling the bottom-right cell threw the
    // cursor to the top-left — the other half of "it's not consistent".
    const entries = [...OPEN];
    entries[0] = 1; // an earlier hole is already FILLED and must not be revisited
    expect(nextEditableCell(entries, OPEN, 10)).toBe(11);
  });

  it('wraps exactly once, so the last hole in the grid still finds the first', () => {
    const entries = new Array<number>(SUDOKU_CELLS).fill(1);
    entries[3] = 0;
    expect(nextEditableCell(entries, OPEN, SUDOKU_CELLS - 1)).toBe(3);
  });

  it('skips givens as well as filled cells', () => {
    const givens = [...OPEN];
    givens[6] = 4;
    const entries = [...givens];
    expect(nextEditableCell(entries, givens, 5)).toBe(7);
  });

  it('returns -1 on a full grid — the caller then leaves the cursor alone and submits', () => {
    const full = new Array<number>(SUDOKU_CELLS).fill(1);
    expect(nextEditableCell(full, OPEN, 0)).toBe(-1);
  });
});

describe('S182 SI-C — the countdown readout', () => {
  it('⭐ CEILS, so it never reads 0:00 while the trial is still winnable', () => {
    expect(formatCountdown(1)).toBe('0:01');   // one tick left is still a second on the clock
    expect(formatCountdown(60)).toBe('0:01');
    expect(formatCountdown(61)).toBe('0:02');
  });

  it('reads 0:00 only when the time is genuinely gone', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00'); // clamped; a client tick briefly ahead of the host
  });

  it('formats minutes with a zero-padded seconds field', () => {
    expect(formatCountdown(10_800)).toBe('3:00'); // the full NONET_TIMEOUT_TICKS window
    expect(formatCountdown(10_800 - 60 * 61)).toBe('1:59');
  });
});
