/**
 * Tests for fog-of-war MEMORY grid (S59 P1) — the pure "remembered areas" data
 * model. Mirrors vision.test.ts: direct construction, pure assertions, symbolic
 * constants. The GPU rasterization (fogRenderer) is verified via e2e/preview;
 * this proves the testable core (mark / query / reset / boundaries / permanence).
 */

import { describe, it, expect } from 'vitest';
import {
  makeExploredGrid,
  markVisible,
  isExplored,
  resetExploredGrid,
} from './exploredMemory.ts';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  EXPLORED_GRID_COLS,
  EXPLORED_GRID_ROWS,
  R_PERSONAL,
} from '../constants.ts';
import type { VisionSource } from './vision.ts';

const src = (x: number, y: number, radius: number): VisionSource => ({ x, y, radius });

describe('makeExploredGrid', () => {
  it('starts fully unexplored at the configured resolution', () => {
    const g = makeExploredGrid();
    expect(g.cols).toBe(EXPLORED_GRID_COLS);
    expect(g.rows).toBe(EXPLORED_GRID_ROWS);
    expect(g.cells).toHaveLength(EXPLORED_GRID_COLS * EXPLORED_GRID_ROWS);
    expect(g.cells.every((c) => c === 0)).toBe(true);
  });
});

describe('markVisible / isExplored', () => {
  it('marks the area under a vision source as explored', () => {
    const g = makeExploredGrid();
    const changed = markVisible(g, [src(960, 540, R_PERSONAL)]);
    expect(changed).toBe(true);
    expect(isExplored(g, 960, 540)).toBe(true); // centre
    expect(isExplored(g, 960 + R_PERSONAL - 10, 540)).toBe(true); // inside radius
  });

  it('marks cells the circle OVERLAPS even when the cell centre is outside the radius', () => {
    const g = makeExploredGrid();
    // Source at the (0,0) corner, radius 50. Cell (1,0) spans x∈[40,80], y∈[0,40];
    // its centre (60,20) is ~63px away (outside r=50), but its near edge (40,0) is
    // 40px away (inside) → the circle clips the cell. A centre-only test would MISS
    // it; circle-rect overlap must mark it (no shrunken-memory boundary gap).
    markVisible(g, [src(0, 0, 50)]);
    expect(isExplored(g, 50, 5)).toBe(true); // a point in that overlapped boundary cell
  });

  it('leaves distant cells unexplored (un-scouted terrain stays hidden)', () => {
    const g = makeExploredGrid();
    markVisible(g, [src(200, 200, R_PERSONAL)]);
    expect(isExplored(g, 1700, 900)).toBe(false);
  });

  it('is PERMANENT: a cell stays explored after the source leaves', () => {
    const g = makeExploredGrid();
    markVisible(g, [src(960, 540, R_PERSONAL)]); // scout the centre
    markVisible(g, [src(200, 200, R_PERSONAL)]); // move far away
    expect(isExplored(g, 960, 540)).toBe(true); // still remembered
  });

  it('returns false when no NEW cell is revealed (lets the renderer skip re-upload)', () => {
    const g = makeExploredGrid();
    expect(markVisible(g, [src(960, 540, R_PERSONAL)])).toBe(true);
    expect(markVisible(g, [src(960, 540, R_PERSONAL)])).toBe(false); // same spot → nothing new
  });

  it('accumulates the union of multiple sources, leaving the gap unseen', () => {
    const g = makeExploredGrid();
    markVisible(g, [src(300, 300, R_PERSONAL), src(1600, 800, R_PERSONAL)]);
    expect(isExplored(g, 300, 300)).toBe(true);
    expect(isExplored(g, 1600, 800)).toBe(true);
    expect(isExplored(g, 960, 540)).toBe(false); // gap between the two reveals
  });

  it('clamps out-of-bounds queries and corner-hugging sources without throwing', () => {
    const g = makeExploredGrid();
    expect(isExplored(g, -50, -50)).toBe(false);
    expect(isExplored(g, CANVAS_WIDTH + 100, CANVAS_HEIGHT + 100)).toBe(false);
    expect(() => markVisible(g, [src(0, 0, R_PERSONAL)])).not.toThrow();
    expect(isExplored(g, 5, 5)).toBe(true); // corner cell got marked
  });
});

describe('resetExploredGrid', () => {
  it('clears all exploration (a new match does not inherit the old map)', () => {
    const g = makeExploredGrid();
    markVisible(g, [src(960, 540, R_PERSONAL)]);
    expect(isExplored(g, 960, 540)).toBe(true);
    resetExploredGrid(g);
    expect(isExplored(g, 960, 540)).toBe(false);
    expect(g.cells.every((c) => c === 0)).toBe(true);
  });
});
