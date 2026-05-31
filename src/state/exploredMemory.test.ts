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
  makeGhostMemory,
  updateGhostMemory,
  resetGhostMemory,
} from './exploredMemory.ts';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  EXPLORED_GRID_COLS,
  EXPLORED_GRID_ROWS,
  R_PERSONAL,
  SparkType,
} from '../constants.ts';
import type { VisionSource } from './vision.ts';
import {
  asPlayerId,
  asPrimitiveId,
  type PlayerId,
  type PrimitiveId,
  type Vec2,
} from '../types.ts';

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

// ===========================================================================
// S60 P2 — last-seen ENEMY-STRUCTURE memory (the Council #1 hazard: the ghost
// drop/keep state machine). Pure tests against the four transitions.
// ===========================================================================

const ME: PlayerId = asPlayerId(0);
const ENEMY: PlayerId = asPlayerId(1);

interface TestPrim {
  readonly id: PrimitiveId;
  readonly type: SparkType;
  readonly placedBy: PlayerId;
  readonly pos: Vec2; // fresh per prim so mutation tests stay isolated
  readonly ownerColor: number;
}

const prim = (
  id: number,
  x: number,
  y: number,
  opts: { placedBy?: PlayerId; type?: SparkType; color?: number } = {},
): TestPrim => ({
  id: asPrimitiveId(id),
  type: opts.type ?? SparkType.Square,
  placedBy: opts.placedBy ?? ENEMY,
  pos: { x, y },
  ownerColor: opts.color ?? 0xff0000,
});

/** Build a world primitives map from a list of test primitives. */
const world = (...prims: TestPrim[]): Map<PrimitiveId, TestPrim> =>
  new Map(prims.map((p) => [p.id, p] as const));

/** A single personal-radius vision source centred at (x, y) — "I am looking here". */
const sees = (x: number, y: number): VisionSource[] => [src(x, y, R_PERSONAL)];
/** No vision sources — the whole board is fogged. */
const BLIND: readonly VisionSource[] = [];

describe('updateGhostMemory — SEEN-ON-LIVE (record/refresh)', () => {
  it('snapshots an enemy structure seen in live vision (id/type/pos/color/tick)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(
      mem,
      world(prim(7, 640, 360, { type: SparkType.Triangle, color: 0xabcdef })),
      sees(640, 360),
      ME,
      42,
    );
    expect(mem.size).toBe(1);
    expect(mem.get(asPrimitiveId(7))).toEqual({
      id: asPrimitiveId(7),
      type: SparkType.Triangle,
      pos: { x: 640, y: 360 },
      color: 0xabcdef,
      lastSeenTick: 42,
    });
  });

  it('never remembers OWN structures (the ghost tier is for scouting the enemy)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500, { placedBy: ME })), sees(500, 500), ME, 1);
    expect(mem.size).toBe(0);
  });

  it('does NOT record an enemy structure that is currently in fog (only live = truth)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), BLIND, ME, 1);
    expect(mem.size).toBe(0);
  });

  it('refreshes color + tick + pos on a re-sighting (Phase-2 Steal recolour / drift)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500, { color: 0x111111 })), sees(500, 500), ME, 1);
    updateGhostMemory(mem, world(prim(1, 520, 500, { color: 0x222222 })), sees(520, 500), ME, 9);
    const g = mem.get(asPrimitiveId(1))!;
    expect(g.color).toBe(0x222222);
    expect(g.lastSeenTick).toBe(9);
    expect(g.pos.x).toBe(520);
  });

  it('stores a COPY of pos — a remembered ghost never drifts when the live prim moves', () => {
    const mem = makeGhostMemory();
    const p = prim(1, 500, 500);
    updateGhostMemory(mem, world(p), sees(500, 500), ME, 1);
    (p.pos as { x: number }).x = 9999; // the bond solver nudges the live structure
    expect(mem.get(asPrimitiveId(1))!.pos.x).toBe(500); // the snapshot held
  });

  it('records the union of multiple enemies while excluding own at the same spot', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(
      mem,
      world(
        prim(1, 300, 300, { placedBy: ENEMY }),
        prim(2, 1600, 800, { placedBy: ENEMY }),
        prim(3, 300, 300, { placedBy: ME }),
      ),
      [src(300, 300, R_PERSONAL), src(1600, 800, R_PERSONAL)],
      ME,
      1,
    );
    expect(mem.size).toBe(2);
    expect(mem.has(asPrimitiveId(1))).toBe(true);
    expect(mem.has(asPrimitiveId(2))).toBe(true);
    expect(mem.has(asPrimitiveId(3))).toBe(false);
  });
});

describe('updateGhostMemory — disappearance reconciliation (drop vs keep)', () => {
  it('DESTROYED-LIVE: drops a ghost gone from the world while we can see its spot', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1); // seen
    expect(mem.size).toBe(1);
    updateGhostMemory(mem, world(), sees(500, 500), ME, 2); // gone + looking right at it
    expect(mem.size).toBe(0); // confirmed destroyed → forgotten
  });

  it('DESTROYED-IN-FOG: keeps the stale silhouette when the spot is fogged', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1); // seen
    updateGhostMemory(mem, world(), BLIND, ME, 2); // gone but we can't see the spot
    expect(mem.size).toBe(1); // we don't know yet — ghost stands
    expect(mem.get(asPrimitiveId(1))!.pos).toEqual({ x: 500, y: 500 });
  });

  it('RE-FOGGED: keeps an existing structure unchanged once it leaves live vision', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1); // seen
    updateGhostMemory(mem, world(prim(1, 500, 500)), BLIND, ME, 5); // still there, now hidden
    expect(mem.size).toBe(1);
    expect(mem.get(asPrimitiveId(1))!.lastSeenTick).toBe(1); // NOT refreshed (out of vision)
  });

  it('full arc: seen → destroyed-under-fog (kept) → re-scout the spot confirms gone (dropped)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1); // seen
    updateGhostMemory(mem, world(), BLIND, ME, 2); // razed while we looked away → keep
    expect(mem.size).toBe(1);
    updateGhostMemory(mem, world(), sees(500, 500), ME, 3); // come back: it's gone → drop
    expect(mem.size).toBe(0);
  });

  it('never drops a still-living structure no matter how long it sits in fog', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1);
    for (let t = 2; t < 50; t++) {
      updateGhostMemory(mem, world(prim(1, 500, 500)), BLIND, ME, t); // exists, fogged
    }
    expect(mem.size).toBe(1); // memory is permanent until proven gone
  });
});

describe('resetGhostMemory', () => {
  it('forgets everything (a new match does not inherit the old ghosts)', () => {
    const mem = makeGhostMemory();
    updateGhostMemory(mem, world(prim(1, 500, 500)), sees(500, 500), ME, 1);
    expect(mem.size).toBe(1);
    resetGhostMemory(mem);
    expect(mem.size).toBe(0);
  });
});
