/**
 * SPARK — S166 — the ring validator: R136's slack, and the collision it must NOT create.
 *
 * Two things are being pinned here and they pull in opposite directions, which is the whole reason
 * this file is long:
 *
 *   · **R136 (owner) — a FOREIGN shape touching a node must NOT kill the tower.** That is the
 *     S158 B2b failure class, and it was measured live at all 3 nodes for all 6 races before the
 *     ruling was asked for. The tier-3 tower is the cheapest build in the game, so it is the one
 *     most likely to have something auto-bonded onto it at 60 px.
 *   · **A SAME-TYPE shape must kill it**, because that is the only clause standing between a 3-ring
 *     predicate and igniting inside a pentagram. Chord a 5-ring of Triangles and the cycle 1-2-3 IS
 *     a closed 3-ring of Triangles.
 *
 * ⭐ THE CHORDED PENTAGON IS THE TEST THAT MATTERS. A recipe collision in this codebase does not
 * fail loudly — `goblinTower.ts` records the consequence: it builds the OTHER structure, or neither,
 * and the player just sees a tower that will not build. Fixture style mirrors `pentagram.test.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../../types.ts';
import { SparkType, PRIMITIVE_MAX_HP } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { isRingAt, findRingAnchors } from './ringShape.ts';
import { isPentagramComponent } from './pentagram.ts';

const COLOR = 0xff3b6b;

function makePrim(id: number, x: number, y: number, type: SparkType): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
    placerColor: COLOR,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: COLOR,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function addPrim(world: World, id: number, type: SparkType): PrimitiveId {
  world.primitives.set(asPrimitiveId(id), makePrim(id, id * 40, 0, type));
  return asPrimitiveId(id);
}

function addBond(world: World, id: number, aId: number, bId: number): void {
  const a = world.primitives.get(asPrimitiveId(aId))!;
  const b = world.primitives.get(asPrimitiveId(bId))!;
  const bond: Bond = {
    id: id as unknown as BondId,
    aId: asPrimitiveId(aId),
    bId: asPrimitiveId(bId),
    a,
    b,
    restLength: 50,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
}

/** A closed ring of `n` primitives of `type` at ids base..base+n-1. */
function addRing(world: World, base: number, n: number, type: SparkType, bondBase: number): void {
  for (let i = 0; i < n; i++) addPrim(world, base + i, type);
  for (let i = 0; i < n; i++) addBond(world, bondBase + i, base + i, base + ((i + 1) % n));
}

describe('isRingAt — R136: foreign shapes are slack, same-type shapes are not', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
  });

  it('accepts a clean 3-ring from EVERY node — the anchor is not special', () => {
    addRing(world, 10, 3, SparkType.Triangle, 100);
    for (const id of [10, 11, 12]) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3), `node ${id}`).toBe(true);
    }
  });

  it('works for all six race shapes, since each race rings its own', () => {
    // RACE_FEED_SHAPE's six values (R109). A validator that only worked for Triangle would ship
    // five broken towers and one that looked fine.
    const shapes = [
      SparkType.Triangle, SparkType.Square, SparkType.Line,
      SparkType.Circle, SparkType.Dot, SparkType.Spiral,
    ];
    shapes.forEach((type, i) => {
      const w = makeWorld(1);
      addRing(w, 10 + i * 10, 3, type, 100 + i * 10);
      expect(isRingAt(w, asPrimitiveId(10 + i * 10), type, 3), `shape ${String(type)}`).toBe(true);
    });
  });

  it('⭐ R136 — a FOREIGN shape bonded to a node does NOT kill the ring', () => {
    addRing(world, 10, 3, SparkType.Triangle, 100);
    // A Square auto-bonded onto node 10. Under pentagram's rule the component becomes 4 and the
    // tower is torn down 0.5 s later with no feedback. This is the exact scenario the owner ruled on.
    addPrim(world, 20, SparkType.Square);
    addBond(world, 200, 10, 20);
    expect(isRingAt(world, asPrimitiveId(10), SparkType.Triangle, 3)).toBe(true);
    // And the pentagram-style rule really would have refused it — the contrast is the point.
    expect(isPentagramComponent(world, asPrimitiveId(10))).toBe(false);
  });

  it('R136 — even THREE foreign shapes, one per node, leave it standing', () => {
    addRing(world, 10, 3, SparkType.Triangle, 100);
    [SparkType.Square, SparkType.Circle, SparkType.Dot].forEach((t, i) => {
      addPrim(world, 30 + i, t);
      addBond(world, 300 + i, 10 + i, 30 + i);
    });
    for (const id of [10, 11, 12]) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3), `node ${id}`).toBe(true);
    }
  });

  it('⛔ a SAME-TYPE stray DOES kill it — the deliberate residual, not an oversight', () => {
    addRing(world, 10, 3, SparkType.Triangle, 100);
    addPrim(world, 21, SparkType.Triangle);
    addBond(world, 201, 10, 21);
    // Node 10 now has three Triangle neighbours, so the ring is no longer identifiable. Accepting
    // this is what would ignite a tower inside a pentagram — see the chorded-pentagon test below.
    expect(isRingAt(world, asPrimitiveId(10), SparkType.Triangle, 3)).toBe(false);
    // ⚠ AND IT FAILS FROM EVERY NODE, not just the one that was touched: the walk re-applies the
    // exact-2 clause at each step, so which node a scan seeds from cannot change the answer.
    expect(isRingAt(world, asPrimitiveId(11), SparkType.Triangle, 3)).toBe(false);
    expect(isRingAt(world, asPrimitiveId(12), SparkType.Triangle, 3)).toBe(false);
  });

  it('rejects a broken ring (one bond cut) — the counterplay the design wants', () => {
    addRing(world, 10, 3, SparkType.Triangle, 100);
    const bond = world.bonds.get(100 as unknown as BondId)!;
    world.primitives.get(bond.aId)!.bonds.delete(bond.id);
    world.primitives.get(bond.bId)!.bonds.delete(bond.id);
    world.bonds.delete(bond.id);
    for (const id of [10, 11, 12]) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3), `node ${id}`).toBe(false);
    }
  });

  it('rejects n < 3 — a bonded PAIR is not a ring', () => {
    addPrim(world, 10, SparkType.Triangle);
    addPrim(world, 11, SparkType.Triangle);
    addBond(world, 100, 10, 11);
    expect(isRingAt(world, asPrimitiveId(10), SparkType.Triangle, 2)).toBe(false);
    expect(isRingAt(world, asPrimitiveId(10), SparkType.Triangle, 1)).toBe(false);
  });
});

describe('isRingAt — mutual exclusivity with the pentagram, as an INVARIANT', () => {
  it('a 5-ring of Triangles is NOT a 3-ring, from any node', () => {
    const world = makeWorld(1);
    addRing(world, 10, 5, SparkType.Triangle, 100);
    for (let id = 10; id <= 14; id++) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3), `node ${id}`).toBe(false);
    }
    // Anti-vacuity: the fixture really is a pentagram, so the negative above means something.
    expect(isPentagramComponent(world, asPrimitiveId(10))).toBe(true);
  });

  it('⛔ THE CHORDED PENTAGON — a 3-cycle exists in it, and BOTH predicates must refuse', () => {
    const world = makeWorld(1);
    addRing(world, 10, 5, SparkType.Triangle, 100);
    // Chord 10-12. The cycle 10-11-12 is now a closed 3-ring of Triangles by pure topology, and a
    // tolerant validator would hand the builder of a PENTAGRAM a free vampire tower.
    addBond(world, 105, 10, 12);
    for (let id = 10; id <= 14; id++) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3), `3-ring at ${id}`).toBe(false);
      expect(isPentagramComponent(world, asPrimitiveId(id)), `pentagram at ${id}`).toBe(false);
    }
  });

  it('no 3-ring is ever a pentagram — the other direction', () => {
    const world = makeWorld(1);
    addRing(world, 10, 3, SparkType.Triangle, 100);
    for (const id of [10, 11, 12]) {
      expect(isRingAt(world, asPrimitiveId(id), SparkType.Triangle, 3)).toBe(true);
      expect(isPentagramComponent(world, asPrimitiveId(id))).toBe(false);
    }
  });

  it('two 3-rings sharing a node are neither — a figure-eight is not two towers', () => {
    const world = makeWorld(1);
    // 10-11-12 and 10-13-14, both closed, sharing node 10.
    addRing(world, 10, 3, SparkType.Triangle, 100);
    addPrim(world, 13, SparkType.Triangle);
    addPrim(world, 14, SparkType.Triangle);
    addBond(world, 110, 10, 13);
    addBond(world, 111, 13, 14);
    addBond(world, 112, 14, 10);
    // Node 10 has four Triangle neighbours; the two rings are indistinguishable from its seat.
    expect(isRingAt(world, asPrimitiveId(10), SparkType.Triangle, 3)).toBe(false);
    // ⚠ And the far nodes fail too, because the walk reaches the ambiguous node.
    expect(isRingAt(world, asPrimitiveId(11), SparkType.Triangle, 3)).toBe(false);
    expect(isRingAt(world, asPrimitiveId(13), SparkType.Triangle, 3)).toBe(false);
  });
});

describe('findRingAnchors', () => {
  it('returns every member ascending, so the caller can take the LOWEST', () => {
    const world = makeWorld(1);
    addRing(world, 12, 3, SparkType.Circle, 100);
    const anchors = findRingAnchors(world, SparkType.Circle, 3);
    expect(anchors).toEqual([asPrimitiveId(12), asPrimitiveId(13), asPrimitiveId(14)]);
    // ⛔ WHY ASCENDING MATTERS: `igniteOneSpawnerRecipe` de-dups on (anchor, owner) with no recipeId
    // compare, so an anchor that shifted between frames would read as a second structure.
    expect(Math.min(...anchors.map(Number))).toBe(12);
  });

  it('finds two independent rings and ignores a foreign-typed one', () => {
    const world = makeWorld(1);
    addRing(world, 10, 3, SparkType.Circle, 100);
    addRing(world, 20, 3, SparkType.Circle, 110);
    addRing(world, 30, 3, SparkType.Square, 120); // a different race's tower
    expect(findRingAnchors(world, SparkType.Circle, 3).map(Number)).toEqual([10, 11, 12, 20, 21, 22]);
    expect(findRingAnchors(world, SparkType.Square, 3).map(Number)).toEqual([30, 31, 32]);
  });

  it('returns nothing on an empty board — anti-vacuity for the positives above', () => {
    expect(findRingAnchors(makeWorld(1), SparkType.Circle, 3)).toEqual([]);
  });
});
