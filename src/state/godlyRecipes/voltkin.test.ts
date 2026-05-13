/**
 * SPARK — Voltkin predicate tests (S23 P1 rewrite).
 *
 * Verifies the typed-chain predicate: a linear bonded path of exactly 8 prims
 * matching Square x4 -> Triangle x4. No filler prims allowed between consecutive
 * chain entries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { asPlayerId, type BondId, type PrimitiveId } from '../../types.ts';
import { SparkType } from '../../constants.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Bond } from '../../physics/bonds.ts';
import { voltkinPredicate, findVoltkinChain } from './voltkin.ts';

function makePrim(
  id: number,
  placerColor: number,
  x: number,
  y: number,
  type: SparkType = SparkType.Dot,
): Primitive {
  return {
    id: id as unknown as PrimitiveId,
    type,
    placerColor,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function makeBond(id: number, aId: number, bId: number): Bond {
  const pos = { x: 0, y: 0 };
  const prevPos = { x: 0, y: 0 };
  return {
    id: id as unknown as BondId,
    aId: aId as unknown as PrimitiveId,
    bId: bId as unknown as PrimitiveId,
    a: { pos, prevPos },
    b: { pos, prevPos },
    restLength: 50,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
}

function addPrim(world: World, prim: Primitive): void {
  world.primitives.set(prim.id, prim);
  // mirror onto adjacency so findVoltkinChain can walk
  for (const bondId of prim.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    a?.bonds.add(bond.id);
    b?.bonds.add(bond.id);
  }
}

function addBond(world: World, bond: Bond): void {
  world.bonds.set(bond.id, bond);
  world.primitives.get(bond.aId)?.bonds.add(bond.id);
  world.primitives.get(bond.bId)?.bonds.add(bond.id);
}

describe('voltkin predicate (typed chain)', () => {
  let world: World;
  let p0Color: number;

  beforeEach(() => {
    world = makeWorld(1);
    const p2 = makeIdlePlayer(asPlayerId(1), 0x00ff00);
    world.players.set(p2.id, p2);
    p0Color = world.players.get(asPlayerId(0))!.color;
  });

  it('returns null on an empty world', () => {
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
    expect(findVoltkinChain(world)).toBeNull();
  });

  it('returns null when only 4 squares are chained (no triangles)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 0; i < 3; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when only 4 triangles are chained (no squares)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 3; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('matches a linear SQ-SQ-SQ-SQ-TR-TR-TR-TR chain', () => {
    // 8 prims in a horizontal line. 0-3 squares, 4-7 triangles.
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
    // centroid of evenly-spaced 0..350 line on y=0 is (175, 0)
    expect(match!.targetPos.x).toBeCloseTo(175, 1);
    expect(match!.targetPos.y).toBeCloseTo(0, 1);
  });

  it('matches a TR-TR-TR-TR-SQ-SQ-SQ-SQ chain (bond graph is bidirectional — same structure as SQ4-TR4 viewed from the other end)', () => {
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
  });

  it('returns null when squares and triangles are interleaved (SQ-TR-SQ-TR-SQ-TR-SQ-TR)', () => {
    for (let i = 0; i < 8; i++) {
      const type = i % 2 === 0 ? SparkType.Square : SparkType.Triangle;
      addPrim(world, makePrim(i, p0Color, i * 50, 0, type));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when a non-typed prim (Circle) bridges squares and triangles', () => {
    // SQ-SQ-SQ-SQ-CIRCLE-TR-TR-TR-TR (9 prims, circle breaks the chain)
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    addPrim(world, makePrim(4, p0Color, 200, 0, SparkType.Circle));
    for (let i = 5; i < 9; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 8; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    expect(voltkinPredicate(world, { x: 0, y: 0 })).toBeNull();
  });

  it('matches a valid 8-chain embedded in a branched topology', () => {
    // Linear chain 0..7 (SQ4 then TR4), plus extra branch off prim 2 (square)
    // to a Circle (prim 100) — DFS must backtrack from the circle branch and
    // still find the valid chain through prim 3.
    for (let i = 0; i < 4; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Square));
    }
    for (let i = 4; i < 8; i++) {
      addPrim(world, makePrim(i, p0Color, i * 50, 0, SparkType.Triangle));
    }
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    // branch off prim 2: extra circle dangling
    addPrim(world, makePrim(100, p0Color, 100, 80, SparkType.Circle));
    addBond(world, makeBond(100, 2, 100));

    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.targetComponentPrimitiveIds.length).toBe(8);
    // chain should NOT include the branch (prim 100)
    expect(match!.targetComponentPrimitiveIds).not.toContain(100 as unknown as PrimitiveId);
  });

  it('triggerer is the dominant placerColor across the chain', () => {
    // 5 prims placerColor=p0, 3 prims placerColor=0x00ff00 (player 1's color).
    // p0 dominates → triggerer = player 0.
    const p1Color = 0x00ff00;
    addPrim(world, makePrim(0, p0Color, 0, 0, SparkType.Square));
    addPrim(world, makePrim(1, p0Color, 50, 0, SparkType.Square));
    addPrim(world, makePrim(2, p0Color, 100, 0, SparkType.Square));
    addPrim(world, makePrim(3, p1Color, 150, 0, SparkType.Square));
    addPrim(world, makePrim(4, p0Color, 200, 0, SparkType.Triangle));
    addPrim(world, makePrim(5, p0Color, 250, 0, SparkType.Triangle));
    addPrim(world, makePrim(6, p1Color, 300, 0, SparkType.Triangle));
    addPrim(world, makePrim(7, p1Color, 350, 0, SparkType.Triangle));
    for (let i = 0; i < 7; i++) {
      addBond(world, makeBond(i, i, i + 1));
    }
    const match = voltkinPredicate(world, { x: 0, y: 0 });
    expect(match).not.toBeNull();
    expect(match!.triggererPlayerId).toBe(asPlayerId(0));
  });
});
