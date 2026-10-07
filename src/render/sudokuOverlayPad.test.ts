/**
 * S196 #16 (owner R196-D2 6h) — THE ON-SCREEN NUMBER PAD, REACHED through the real `SudokuOverlay`:
 * a tap on a pad key, routed by the overlay's own container handler, fills the selected cell exactly as
 * the keyboard does; CLR empties it; a tap just outside a key does nothing; a resolved trial ignores it.
 * The pad and the grid never overlap (the pad is checked FIRST in the tap handler).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Assets, Container } from 'pixi.js';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';

vi.mock('./nonetJuice.ts', async (orig) => ({
  ...(await orig<typeof import('./nonetJuice.ts')>()),
  playNonetAppear: vi.fn(),
  playNonetJackpot: vi.fn(),
  playNonetLose: vi.fn(),
  playNonetOww: vi.fn(),
  playNonetTimeout: vi.fn(),
  playNonetWrong: vi.fn(),
  playNonetYey: vi.fn(),
}));

import { PAD_VALUES, padKeyAt, padKeyRects, SudokuOverlay } from './sudokuOverlay.ts';
import { generateSudoku } from '../state/sudoku.ts';
import { makeArcadeNonet } from './arcadeOverlay.ts';
import { makeWorld } from '../state/world.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';

installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

const fakeVideo = (): Record<string, unknown> => ({
  addEventListener: () => {}, load: () => {}, play: () => Promise.resolve(), pause: () => {},
});

let overlay: SudokuOverlay;
let submitted: number[][] = [];

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => fakeVideo() });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  vi.spyOn(Assets, 'load').mockReturnValue(new Promise(() => {}) as never);
  const stage = new Container();
  overlay = new SudokuOverlay({ stage } as never, (grid) => { submitted.push(grid); return false; });
});

const internals = (): { entries: number[]; givens: number[]; selected: number; container: Container } =>
  overlay as unknown as { entries: number[]; givens: number[]; selected: number; container: Container };

/** A tap at a canvas point, through the overlay's real container handler. */
function tap(x: number, y: number): void {
  internals().container.emit('pointertap', { getLocalPosition: () => ({ x, y }) } as never);
}

describe('S196 6h — pad geometry', () => {
  it('seven keys (1..6 + CLR), on screen, never overlapping each other or the 6×6 grid', () => {
    const keys = padKeyRects();
    expect(keys.map((k) => k.value)).toEqual([...PAD_VALUES]);
    expect(PAD_VALUES).toEqual([1, 2, 3, 4, 5, 6, 0]);
    for (const k of keys) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(k.y + k.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
      expect(k.y).toBeGreaterThan(320 + 540); // below the board (BY 320 + BOARD 540)
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i]!.x).toBeGreaterThan(keys[i - 1]!.x + keys[i - 1]!.w);
    // a pad tap can never be read as a grid cell, and the grid's centre is never a pad key
    expect(padKeyAt(960, 590)).toBeNull();
  });

  it('padKeyAt: each key centre answers its value; just outside answers null', () => {
    for (const k of padKeyRects()) {
      expect(padKeyAt(k.x + k.w / 2, k.y + k.h / 2)).toBe(k.value);
      expect(padKeyAt(k.x + k.w / 2, k.y - 1)).toBeNull();
      expect(padKeyAt(k.x + k.w / 2, k.y + k.h + 1)).toBeNull();
    }
  });
});

describe('S196 6h — REACH: a pad tap fills the cell through the real overlay', () => {
  it('select an empty cell, tap a digit key → the digit lands and the cursor advances; CLR empties it', () => {
    const ev = makeArcadeNonet(4242);
    overlay.render(makeWorld(0), ev);
    const o = internals();
    const cell = o.givens.findIndex((g) => g === 0);
    o.selected = cell;
    const key3 = padKeyRects().find((k) => k.value === 3)!;
    tap(key3.x + key3.w / 2, key3.y + key3.h / 2);
    expect(o.entries[cell]).toBe(3);
    expect(o.selected).not.toBe(cell); // advanced, like the keyboard
    o.selected = cell;
    const clr = padKeyRects().find((k) => k.value === 0)!;
    tap(clr.x + clr.w / 2, clr.y + clr.h / 2);
    expect(o.entries[cell]).toBe(0);
  });

  it('negative: a tap in the gap between two keys changes nothing; a given is never overwritten', () => {
    overlay.render(makeWorld(0), makeArcadeNonet(777));
    const o = internals();
    const cell = o.givens.findIndex((g) => g === 0);
    o.selected = cell;
    const before = o.entries.slice();
    const [a, b] = padKeyRects();
    tap((a!.x + a!.w + b!.x) / 2, a!.y + a!.h / 2); // the gap
    expect(o.entries).toEqual(before);
    const given = o.givens.findIndex((g) => g !== 0);
    o.selected = given;
    tap(a!.x + a!.w / 2, a!.y + a!.h / 2);
    expect(o.entries[given]).toBe(o.givens[given]);
  });

  it('filling the whole grid from the PAD submits it — the same path as the keyboard', () => {
    submitted = [];
    const ev = makeArcadeNonet(99);
    overlay.render(makeWorld(0), ev);
    const o = internals();
    const sol = generateSudoku(99).solution;
    for (let i = 0; i < 36; i++) {
      if (o.givens[i] !== 0) continue;
      o.selected = i;
      const k = padKeyRects().find((r) => r.value === sol[i])!;
      tap(k.x + k.w / 2, k.y + k.h / 2);
    }
    expect(submitted.length).toBe(1);
    expect(submitted[0]).toEqual([...sol]);
  });

  it('a resolved trial ignores the pad', () => {
    const ev = { ...makeArcadeNonet(5), resolvedTick: 10 };
    overlay.render(makeWorld(0), ev);
    const o = internals();
    const before = o.entries.slice();
    o.selected = o.givens.findIndex((g) => g === 0);
    const k = padKeyRects()[0]!;
    tap(k.x + k.w / 2, k.y + k.h / 2);
    expect(o.entries).toEqual(before);
  });
});
