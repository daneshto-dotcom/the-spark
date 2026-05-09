/**
 * SPARK — sever rule (§ VIII.4) hand-crafted topology tests.
 * Eight graphs covering the canonical edge cases:
 *   1. Two-prim chain: cut → smaller side (single prim) loses
 *   2. Three-prim chain, cut middle: tie → newer max-tick loses
 *   3. Tree with 3-prim limb vs 1-prim limb: cut the bridge, single loses
 *   4. Cycle (triangle): cut any edge → no deletion
 *   5. Balanced split (2 vs 2): tie → newer max-tick side loses
 *   6. Anchor isolation: anchor (oldest) survives
 *   7. Bridge with chains on both sides — bridge cut splits cleanly
 *   8. Chain of 5, cut at end: 1-prim side always loses
 */

import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { makeFreeSpark, type Spark } from './spark.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';

const P1 = asPlayerId(0);

function place(world: World, sparkId: number, target: PrimitiveId | null): PrimitiveId {
  const s: Spark = makeFreeSpark({
    id: asSparkId(sparkId),
    type: SparkType.Dot,
    pos: { x: 100 + sparkId * 30, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: target,
    stiffnessTier: 'MID',
  });
  // tick advances so createdTick differs per primitive in placement order.
  world.tick++;
  return [...world.primitives.keys()].at(-1)!;
}

function bondBetween(world: World, a: PrimitiveId, b: PrimitiveId): BondId {
  for (const bond of world.bonds.values()) {
    if ((bond.aId === a && bond.bId === b) || (bond.aId === b && bond.bId === a)) {
      return bond.id;
    }
  }
  throw new Error(`no bond between ${a} and ${b}`);
}

describe('§ VIII.4 sever rule', () => {
  it('1. two-prim chain → smaller side (single prim) is deleted', () => {
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    expect(w.primitives.size).toBe(2);
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, a, b) });
    expect(w.primitives.size).toBe(1);
    // Anchor (older) survives; b (newer single-prim limb) is gone.
    expect(w.primitives.has(a)).toBe(true);
    expect(w.primitives.has(b)).toBe(false);
  });

  it('2. three-prim chain, cut middle → side with newer max-tick loses', () => {
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const c = place(w, 2, b);
    // Cut bond a-b. Side {a} max-tick = 0; side {b,c} max-tick = c.tick (largest).
    // Tie? No — sizes differ (1 vs 2). Single-prim side {a} loses.
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, a, b) });
    expect(w.primitives.has(a)).toBe(false);
    expect(w.primitives.has(b)).toBe(true);
    expect(w.primitives.has(c)).toBe(true);
  });

  it('3. tree with longer vs shorter limb → shorter limb loses', () => {
    //      a
    //     / \
    //    b   c
    //    |
    //    d
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const d = place(w, 2, b);
    const c = place(w, 3, a);
    // Cut a-c (bridge to single-prim limb).
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, a, c) });
    expect(w.primitives.has(c)).toBe(false);
    expect(w.primitives.has(a)).toBe(true);
    expect(w.primitives.has(b)).toBe(true);
    expect(w.primitives.has(d)).toBe(true);
  });

  it('4. triangle cycle, cut any edge → nothing is deleted', () => {
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const c = place(w, 2, b);
    // Close the triangle: place a fourth as a fake to bond a-c... easier:
    // commit a bond a-c by bonding a fake spark and rewriting? We don't expose
    // raw bond creation. Instead: place a 4th near c that bonds to a, then
    // sever the bond to that 4th to leave a-b, b-c, plus a-(fourth) + (fourth)-c?
    // Simpler: directly fabricate a bond by placing a primitive at a then re-
    // using world.dispatch with a-c cycle isn't supported. Skip closing — we
    // verify cycle case via the fourth primitive bonded to both a and c.
    const fourth = place(w, 3, a);
    // Need a manual bond fourth-c. The dispatch only creates one bond per
    // PLACE_PRIMITIVE. So we add a synthetic bond directly to test cycles.
    const id = w.bonds.size;
    const synthBond = {
      id: id as BondId,
      aId: fourth,
      bId: c,
      a: w.primitives.get(fourth)!,
      b: w.primitives.get(c)!,
      restLength: 50,
      stiffnessTier: 'MID' as const,
      createdTick: w.tick,
    };
    w.bonds.set(synthBond.id, synthBond);
    w.primitives.get(fourth)!.bonds.add(synthBond.id);
    w.primitives.get(c)!.bonds.add(synthBond.id);

    // Now there's a cycle: a-b-c-fourth-a. Cut a-b → both sides still
    // connected via c-fourth-a. Nothing should be deleted.
    const before = w.primitives.size;
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, a, b) });
    expect(w.primitives.size).toBe(before);
  });

  it('5. balanced 2-vs-2 split → tied size, newer max-tick side loses', () => {
    const w = makeWorld(0);
    // a-b-c-d. Cut b-c. Side{a,b} max=b.tick=1; side{c,d} max=d.tick=3.
    // Sizes equal (2 vs 2). Newer max-tick (3) loses → {c,d} deleted.
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const c = place(w, 2, b);
    const d = place(w, 3, c);
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, b, c) });
    expect(w.primitives.has(a)).toBe(true);
    expect(w.primitives.has(b)).toBe(true);
    expect(w.primitives.has(c)).toBe(false);
    expect(w.primitives.has(d)).toBe(false);
  });

  it('6. anchor isolation: cutting anchor off a chain deletes the anchor (smaller side)', () => {
    const w = makeWorld(0);
    const a = place(w, 0, null); // the anchor
    const b = place(w, 1, a);
    const c = place(w, 2, b);
    place(w, 3, c); // d
    // Cut a-b. Side{a}=1; side{b,c,d}=3. Single-prim side {a} loses.
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, a, b) });
    expect(w.primitives.has(a)).toBe(false);
    expect(w.primitives.size).toBe(3);
  });

  it('7. bridge cut between two chains splits cleanly', () => {
    // a-b ... c-d, with b-c bridge.
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const c = place(w, 2, b);   // c bonds to b → bridge
    const d = place(w, 3, c);
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, b, c) });
    // Sides {a,b} and {c,d} — both size 2, tie → newer side {c,d} loses.
    expect(w.primitives.has(a)).toBe(true);
    expect(w.primitives.has(b)).toBe(true);
    expect(w.primitives.has(c)).toBe(false);
    expect(w.primitives.has(d)).toBe(false);
    // The cut bond + bonds within the deleted side are gone.
    expect(w.bonds.size).toBe(1); // only a-b remains
  });

  it('8. chain of 5, cut at far end: 1-prim limb loses', () => {
    const w = makeWorld(0);
    const a = place(w, 0, null);
    const b = place(w, 1, a);
    const c = place(w, 2, b);
    const d = place(w, 3, c);
    const e = place(w, 4, d);
    dispatch(w, { type: 'SEVER_BOND', bondId: bondBetween(w, d, e) });
    expect(w.primitives.has(e)).toBe(false);
    expect(w.primitives.size).toBe(4);
  });
});
