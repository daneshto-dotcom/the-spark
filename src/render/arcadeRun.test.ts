/**
 * SPARK — S150 P3: the arcade timed-run state machine.
 *
 * Time is DRIVEN BY HAND everywhere below — every function under test takes `nowMs` as a parameter
 * precisely so these tests never touch a real clock. A test that slept would be both slow and
 * flaky, and the module was designed to make that unnecessary.
 *
 * `commitRun` is the one impure transition (it reaches `localStorage` through `recordRun`), so it
 * gets the same in-memory storage stub `arcadeScores.test.ts` uses.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  commitRun,
  cycleLetter,
  elapsedMs,
  finishRun,
  moveCursor,
  placeLine,
  startRun,
  typeLetter,
} from './arcadeRun.ts';
import { formatTime, loadScores, NAME_ALPHABET, NAME_LEN, TOP_N } from './arcadeScores.ts';

function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(installStorage);

describe('S150 P3 — the clock', () => {
  it('starts at zero and reads wall-clock elapsed while RUNNING', () => {
    const run = startRun(1_000);
    expect(run.phase).toBe('RUNNING');
    expect(elapsedMs(run, 1_000)).toBe(0);
    expect(elapsedMs(run, 4_500)).toBe(3_500);
  });

  it('never reads negative, even if handed a stale nowMs', () => {
    // Defensive rather than hypothetical: the render loop and the solve callback read the clock at
    // slightly different moments, and a negative time would format as a nonsense row.
    expect(elapsedMs(startRun(5_000), 4_000)).toBe(0);
  });

  it('FREEZES on solve and never moves again', () => {
    const solved = finishRun(startRun(1_000), 8_250);
    expect(solved.phase).toBe('ENTER_INITIALS');
    expect(solved.finishedMs).toBe(7_250);
    // The whole point of freezing: the initials screen can take as long as the player likes.
    expect(elapsedMs(solved, 999_999)).toBe(7_250);
  });

  it('finishRun is IDEMPOTENT — a double submit cannot restart or re-time the run', () => {
    const once = finishRun(startRun(1_000), 8_250);
    const twice = finishRun(once, 60_000);
    expect(twice).toBe(once);
    expect(twice.finishedMs).toBe(7_250);
  });

  it('the frozen time renders as the cabinet readout', () => {
    expect(formatTime(finishRun(startRun(0), 92_340).finishedMs!)).toBe('1:32.34');
  });
});

describe('S150 P3 — spelling your initials', () => {
  const solved = () => finishRun(startRun(0), 10_000);

  it('opens on AAA with the stick on the first character', () => {
    const r = solved();
    expect(r.initials.join('')).toBe('AAA');
    expect(r.cursor).toBe(0);
    expect(r.initials).toHaveLength(NAME_LEN);
  });

  it('cycles forward and backward, and WRAPS both ways', () => {
    let r = solved();
    r = cycleLetter(r, 1);
    expect(r.initials[0]).toBe('B');
    r = cycleLetter(r, -1);
    expect(r.initials[0]).toBe('A');
    // Backward off the front lands on the last glyph in the alphabet (the space).
    r = cycleLetter(r, -1);
    expect(r.initials[0]).toBe(NAME_ALPHABET[NAME_ALPHABET.length - 1]);
    // ...and forward from there wraps to the front.
    r = cycleLetter(r, 1);
    expect(r.initials[0]).toBe('A');
  });

  it('a full lap around the alphabet returns to the start', () => {
    let r = solved();
    for (let i = 0; i < NAME_ALPHABET.length; i++) r = cycleLetter(r, 1);
    expect(r.initials[0]).toBe('A');
  });

  it('the cursor CLAMPS at both ends rather than wrapping', () => {
    // Deliberately unlike the letter cycle: wrapping the cursor would send a player who overshoots
    // the last character back to the first one they already set.
    let r = solved();
    expect(moveCursor(r, -1).cursor).toBe(0);
    r = moveCursor(r, 1);
    r = moveCursor(r, 1);
    expect(r.cursor).toBe(NAME_LEN - 1);
    expect(moveCursor(r, 1).cursor).toBe(NAME_LEN - 1);
  });

  it('typing writes the character and advances', () => {
    let r = solved();
    r = typeLetter(r, 'd');
    r = typeLetter(r, 'a');
    r = typeLetter(r, 'n');
    expect(r.initials.join('')).toBe('DAN');
    expect(r.cursor).toBe(NAME_LEN - 1);
  });

  it('typing something off the alphabet is IGNORED, not mapped to a fallback', () => {
    const r = solved();
    expect(typeLetter(r, '!')).toBe(r);
    expect(typeLetter(r, 'ab')).toBe(r);
    expect(typeLetter(r, '')).toBe(r);
  });

  it('no input does anything in the wrong phase', () => {
    // The render loop routes keys by phase, but the machine refuses on its own too — a stray key
    // during RUNNING must not silently edit a name that is not being asked for yet.
    const running = startRun(0);
    expect(cycleLetter(running, 1)).toBe(running);
    expect(moveCursor(running, 1)).toBe(running);
    expect(typeLetter(running, 'A')).toBe(running);
  });
});

describe('S150 P3 — committing to the board', () => {
  const solvedAt = (ms: number) => finishRun(startRun(0), ms);

  it('writes the row, reports the place, and shows the board', () => {
    const r = commitRun(typeLetter(typeLetter(typeLetter(solvedAt(5_000), 'D'), 'A'), 'N'), 111);
    expect(r.phase).toBe('BOARD');
    expect(r.place).toBe(1);
    expect(r.onBoard).toBe(true);
    expect(r.scores.map((s) => s.name)).toEqual(['DAN']);
    // Actually persisted, not merely returned.
    expect(loadScores().map((s) => s.ms)).toEqual([5_000]);
  });

  it('a FASTER later run takes first place — the inverted sort, end to end', () => {
    commitRun(typeLetter(solvedAt(9_000), 'S'), 1);
    const fast = commitRun(typeLetter(solvedAt(4_000), 'F'), 2);
    expect(fast.place).toBe(1);
    expect(fast.scores.map((s) => s.ms)).toEqual([4_000, 9_000]);
  });

  it('REFUSES to commit an unfrozen run — a zero-time row would top the board forever', () => {
    const running = startRun(0);
    expect(commitRun(running, 1)).toBe(running);
    expect(loadScores()).toEqual([]);
  });

  it('committing twice from the BOARD phase does not add a second row', () => {
    const first = commitRun(solvedAt(5_000), 1);
    expect(commitRun(first, 2)).toBe(first);
    expect(loadScores()).toHaveLength(1);
  });

  it('a run that MISSES the table is still told where it came', () => {
    // Owner: "it tells him place place his score is". Fill the board with faster runs first.
    for (let i = 0; i < TOP_N; i++) commitRun(solvedAt(1_000 + i), i);
    const slow = commitRun(solvedAt(900_000), 999);
    expect(slow.onBoard).toBe(false);
    expect(slow.place).toBe(TOP_N + 1);
    expect(slow.scores).toHaveLength(TOP_N);
    expect(placeLine(slow)).toBe('26TH — NOT ON THE BOARD');
  });
});

describe('S150 P3 — the place readout', () => {
  const at = (place: number, onBoard: boolean) =>
    ({ ...startRun(0), place, onBoard }) as ReturnType<typeof startRun> & { place: number };

  it('calls first place a NEW RECORD', () => {
    expect(placeLine(at(1, true))).toBe('1ST — NEW RECORD');
  });

  it('gets English ordinals right, including the teens', () => {
    // 11/12/13 are the cases a naive `n % 10` switch renders as 11ST / 12ND / 13RD.
    expect(placeLine(at(2, true))).toBe('2ND PLACE');
    expect(placeLine(at(3, true))).toBe('3RD PLACE');
    expect(placeLine(at(4, true))).toBe('4TH PLACE');
    expect(placeLine(at(11, true))).toBe('11TH PLACE');
    expect(placeLine(at(12, true))).toBe('12TH PLACE');
    expect(placeLine(at(13, true))).toBe('13TH PLACE');
    expect(placeLine(at(21, true))).toBe('21ST PLACE');
    expect(placeLine(at(22, true))).toBe('22ND PLACE');
    expect(placeLine(at(23, true))).toBe('23RD PLACE');
  });

  it('says nothing at all before a run is committed', () => {
    expect(placeLine(startRun(0))).toBe('');
  });
});
