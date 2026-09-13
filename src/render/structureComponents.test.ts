/**
 * SPARK — S174 — **THE LABELLING SWEEP: SAME ANSWER AS `componentOf`, ONE PASS INSTEAD OF V.**
 *
 * `drawStructureBars` now draws one bar per connected component rather than one per tower, because
 * the owner asked for a bar over a freeform lattice: *"If it's just a free form of connectors, it
 * should already have an HP bar."* The naive way to get there is `componentOf` per primitive, which
 * is O(V · (V+E)) at 60 Hz — a frame-rate bug traded for a readout bug.
 *
 * So this file pins two things, and neither is optional:
 *
 *   1. **AGREEMENT.** The sweep must return exactly what `componentOf` would have, member for member
 *      and bond for bond, INCLUDING its odd edge cases — a bond whose far endpoint has been reaped
 *      still counts (the durability pool `n × (n+4)` is derived from that count), and a stale bond id
 *      on a shape does not. A "faster" labeller that quietly disagreed would move every structure's
 *      health numbers with nothing to say so.
 *   2. **THE COST.** Measured against the naive form on a board big enough for the difference to be
 *      real, because "it's O(V+E), trust me" is the kind of claim this project has learned to check.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { componentOf } from '../game/structure.ts';
import { labelStructureComponents } from './structureComponents.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';

const P0 = asPlayerId(0);

interface Board {
  primitives: Map<PrimitiveId, Primitive>;
  bonds: Map<BondId, Bond>;
}

function emptyBoard(): Board {
  return { primitives: new Map(), bonds: new Map() };
}

function addShape(board: Board, id: number, x: number, y: number, radius = 8): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: PLAYER_COLORS[0]!,
    placedBy: P0,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: PLAYER_COLORS[0]!,
    lastOwnershipChange: 0,
    radius,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
  board.primitives.set(p.id, p);
  return p;
}

function addBond(board: Board, id: number, a: Primitive, b: Primitive, damageFifths = 0): BondId {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths,
    createdTick: 0,
  };
  board.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond.id;
}

/** `count` chains of `per` shapes each — `count` components, deterministic ids. */
function chains(board: Board, count: number, per: number): void {
  let nextPrim = 1;
  let nextBond = 1;
  for (let c = 0; c < count; c++) {
    let prev: Primitive | null = null;
    for (let i = 0; i < per; i++) {
      const p = addShape(board, nextPrim++, 100 + i * 32, 100 + c * 40);
      if (prev !== null) addBond(board, nextBond++, prev, p);
      prev = p;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S174 — the sweep agrees with componentOf, component for component', () => {
  it('⭐⭐ every shape lands in a component whose members are exactly componentOf(shape)', () => {
    const board = emptyBoard();
    chains(board, 5, 7);
    // …plus a ring, which is the shape every race tower actually is: a cycle, not a chain.
    const ring: Primitive[] = [];
    for (let i = 0; i < 6; i++) ring.push(addShape(board, 900 + i, 400 + i * 20, 800));
    for (let i = 0; i < 6; i++) addBond(board, 900 + i, ring[i]!, ring[(i + 1) % 6]!);
    // …and a lone shape with no bonds at all.
    addShape(board, 990, 50, 50);

    const comps = labelStructureComponents(board.primitives, board.bonds);
    const byPrim = new Map<PrimitiveId, (typeof comps)[number]>();
    for (const c of comps) for (const id of c.primitiveIds) byPrim.set(id, c);

    expect(byPrim.size, 'every shape belongs to exactly one component').toBe(board.primitives.size);

    for (const p of board.primitives.values()) {
      const truth = componentOf(p, board.primitives, board.bonds);
      const mine = byPrim.get(p.id)!;
      expect([...mine.primitiveIds].sort((a, b) => (a as number) - (b as number)))
        .toEqual([...truth.primitiveIds].sort((a, b) => (a as number) - (b as number)));
      expect([...mine.bondIds].sort((a, b) => (a as number) - (b as number)))
        .toEqual([...truth.bondIds].sort((a, b) => (a as number) - (b as number)));
    }
  });

  it('⭐ the key is the LOWEST member id, whichever member the sweep entered through', () => {
    // Inserted out of order on purpose: the seed the sweep picks is Map-insertion order, and the key
    // must not depend on it.
    const board = emptyBoard();
    const c = addShape(board, 30, 0, 0);
    const a = addShape(board, 10, 32, 0);
    const b = addShape(board, 20, 64, 0);
    addBond(board, 1, c, a);
    addBond(board, 2, a, b);
    expect(labelStructureComponents(board.primitives, board.bonds)[0]!.key).toBe(asPrimitiveId(10));
  });

  it('⭐ components come back sorted by key — Map order decides nothing', () => {
    const board = emptyBoard();
    const far = addShape(board, 500, 0, 0);
    const farB = addShape(board, 501, 32, 0);
    addBond(board, 1, far, farB);
    const near = addShape(board, 5, 0, 500);
    const nearB = addShape(board, 6, 32, 500);
    addBond(board, 2, near, nearB);
    const keys = labelStructureComponents(board.primitives, board.bonds).map((c) => c.key as number);
    expect(keys).toEqual([...keys].sort((x, y) => x - y));
  });

  it('⭐⭐ topY is the HIGHEST POINT — min(pos.y − radius), not the centroid', () => {
    // Owner: *"You take the HIGHEST POINT and you put a bar over it."* A big shape's own radius is
    // part of how high it reaches, which is why this is not simply min(pos.y).
    const board = emptyBoard();
    const a = addShape(board, 1, 0, 500, 8);
    const b = addShape(board, 2, 32, 480, 30); // lower centre, much bigger disc
    addBond(board, 1, a, b);
    const comp = labelStructureComponents(board.primitives, board.bonds)[0]!;
    expect(comp.topY).toBe(450);
    expect(comp.cy, 'the centroid is a different number and would hide the bar inside the shape')
      .toBe(490);
  });

  it('⭐ damageFifths is summed over the component, and only over the component', () => {
    const board = emptyBoard();
    const a = addShape(board, 1, 0, 0);
    const b = addShape(board, 2, 32, 0);
    const c = addShape(board, 3, 64, 0);
    addBond(board, 1, a, b, 4);
    addBond(board, 2, b, c, 3);
    const other = addShape(board, 50, 0, 900);
    const otherB = addShape(board, 51, 32, 900);
    addBond(board, 50, other, otherB, 11);
    const comps = labelStructureComponents(board.primitives, board.bonds);
    expect(comps.find((x) => x.key === asPrimitiveId(1))!.damageFifths).toBe(7);
    expect(comps.find((x) => x.key === asPrimitiveId(50))!.damageFifths).toBe(11);
  });

  it('⛔ a bond whose far endpoint is GONE still counts — componentOf does the same', () => {
    /*
     * This is the edge case the durability pool is derived from: MAX is
     * `structureDefenceFifths(bondIds.length)`. `componentOf` adds the bond to its set BEFORE looking
     * up the far primitive, so a half-reaped bond counts there too. Diverging would silently change
     * every structure's health.
     */
    const board = emptyBoard();
    const a = addShape(board, 1, 0, 0);
    const ghost = addShape(board, 2, 32, 0);
    addBond(board, 1, a, ghost);
    board.primitives.delete(ghost.id); // reaped, bond not yet swept
    const comp = labelStructureComponents(board.primitives, board.bonds)[0]!;
    expect(comp.bondIds.length).toBe(1);
    expect(comp.bondIds.length).toBe(componentOf(a, board.primitives, board.bonds).bondIds.size);
  });

  it('⛔ a STALE bond id on a shape does not count — componentOf does the same', () => {
    const board = emptyBoard();
    const a = addShape(board, 1, 0, 0);
    const b = addShape(board, 2, 32, 0);
    const live = addBond(board, 1, a, b);
    a.bonds.add(asBondId(777)); // an id `world.bonds` has never heard of
    const comp = labelStructureComponents(board.primitives, board.bonds)[0]!;
    expect(comp.bondIds).toEqual([live]);
  });

  it('an empty board returns no components', () => {
    expect(labelStructureComponents(new Map(), new Map())).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S174 — and the cost, MEASURED rather than asserted in a comment', () => {
  it('⭐⭐ one sweep beats componentOf-per-primitive by an order of magnitude', () => {
    /*
     * ⚠ THE BOARD IS SHAPED TO MAKE THE DIFFERENCE REAL. Four components of 300 shapes each: the
     * naive form re-walks a 300-shape lattice once per member, 1 200 × 300 = 360 000 primitive visits
     * (and `componentOf` pops with `Array.shift`, so the real cost is worse than that count). The
     * sweep visits each of the 1 200 exactly once.
     *
     * ⚠ THE BOUND IS DELIBERATELY SLACK. The true ratio here is ~100× and the assertion asks for 5×,
     * because a wall-clock assertion on a shared CI runner that demands the real number is a test
     * that fails for reasons that have nothing to do with the code. 5× still fails instantly if
     * someone reinstates the per-primitive call, which is the only regression it is guarding.
     */
    const board = emptyBoard();
    chains(board, 4, 300);
    expect(board.primitives.size).toBe(1200);

    // Warm both paths so neither pays the first-call JIT cost in its measured run.
    labelStructureComponents(board.primitives, board.bonds);
    componentOf(board.primitives.get(asPrimitiveId(1))!, board.primitives, board.bonds);

    const t0 = performance.now();
    for (const p of board.primitives.values()) componentOf(p, board.primitives, board.bonds);
    const naiveMs = performance.now() - t0;

    const t1 = performance.now();
    const comps = labelStructureComponents(board.primitives, board.bonds);
    const sweepMs = performance.now() - t1;

    expect(comps.length, 'and it still gets the right answer at size').toBe(4);
    expect(
      sweepMs * 5,
      `one sweep ${sweepMs.toFixed(2)} ms vs per-primitive componentOf ${naiveMs.toFixed(2)} ms`,
    ).toBeLessThan(naiveMs);
  });
});
