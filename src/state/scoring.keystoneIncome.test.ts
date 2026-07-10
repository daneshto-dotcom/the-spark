/**
 * SPARK — S121 P2 (B3) INCOME KEYSTONE tests.
 *
 * An un-fouled FILAMENT (Dot↔Line) confers +KEYSTONE_INCOME_COMPLEXITY standing-complexity (income) to
 * each of up to KEYSTONE_INCOME_MAX_NEIGHBORS un-fouled MAGIC bonds branched off its endpoint prims.
 * Asserts: a magic neighbor earns the bonus; a non-Filament hub (Anchor) earns none; the per-Filament cap
 * fires (Council Q1 anti-starburst); foul parity on both the hub and the neighbor; and determinism.
 * computeComplexity is the pure surface; expected values are derived FROM the constants so the tests
 * survive a knob retune.
 */

import { describe, expect, it } from 'vitest';
import {
  FILAMENT_INCOME_COMPLEXITY,
  KEYSTONE_INCOME_COMPLEXITY,
  KEYSTONE_INCOME_MAX_NEIGHBORS,
  PLAYER_COLORS,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SparkType,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { computeComplexity } from './scoring.ts';

const RED = PLAYER_COLORS[0];
const P0 = asPlayerId(0);
const PRIM_WEIGHT = SCORE_ANCHOR;
const MAGIC_BONUS = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND;

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  return w;
}

function addPrim(w: World, id: number, type: SparkType, x: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type,
    placerColor: RED,
    placedBy: P0,
    createdTick: id,
    pos: { x, y: 400 },
    prevPos: { x, y: 400 },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
  w.primitives.set(p.id, p);
  return p;
}

function connect(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 40,
    stiffnessTier: 'MID',
    createdTick: 0,
    stiffnessMultiplier: undefined,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

describe('S121 P2 — Income Keystone (computeComplexity)', () => {
  it('a Filament confers the income bonus to a branched MAGIC neighbor', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100);
    const line = addPrim(w, 2, SparkType.Line, 140);
    const line2 = addPrim(w, 3, SparkType.Line, 180);
    connect(w, 10, dot, line); // Filament (income hub)
    connect(w, 11, line, line2); // Cable (magic neighbor, shares the Line)
    // 3 prims + 2 magic bonds + 1 filament trickle + 1 blessed magic neighbor.
    const expected =
      3 * PRIM_WEIGHT + 2 * MAGIC_BONUS + FILAMENT_INCOME_COMPLEXITY + 1 * KEYSTONE_INCOME_COMPLEXITY;
    expect(computeComplexity(w, P0)).toBeCloseTo(expected, 10);
  });

  it('a non-Filament hub (Anchor) confers NO income keystone', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100);
    const square = addPrim(w, 2, SparkType.Square, 140);
    const circle = addPrim(w, 3, SparkType.Circle, 180);
    connect(w, 10, dot, square); // Anchor (rigidity hub — NOT an income hub)
    connect(w, 11, square, circle); // Capsule (magic neighbor)
    // 3 prims + 2 magic bonds, NO filament, NO keystone income.
    const expected = 3 * PRIM_WEIGHT + 2 * MAGIC_BONUS;
    expect(computeComplexity(w, P0)).toBeCloseTo(expected, 10);
  });

  it('caps the bonus at KEYSTONE_INCOME_MAX_NEIGHBORS magic neighbors per Filament (anti-starburst)', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100);
    const line = addPrim(w, 2, SparkType.Line, 140);
    // Four magic neighbors off the Filament (3 off the Line, 1 off the Dot) — one over the cap of 3.
    const l3 = addPrim(w, 3, SparkType.Line, 180);
    const ci = addPrim(w, 4, SparkType.Circle, 220);
    const tri = addPrim(w, 5, SparkType.Triangle, 260);
    const sp = addPrim(w, 6, SparkType.Spiral, 60);
    connect(w, 10, dot, line); // Filament
    connect(w, 11, line, l3); // Cable (magic)
    connect(w, 12, line, ci); // Spindle (Line↔Circle, magic)
    connect(w, 13, line, tri); // Bracket (Line↔Triangle, magic)
    connect(w, 14, dot, sp); // Vortex (Dot↔Spiral, magic)
    const capped = KEYSTONE_INCOME_MAX_NEIGHBORS * KEYSTONE_INCOME_COMPLEXITY;
    const base = 6 * PRIM_WEIGHT + 5 * MAGIC_BONUS + FILAMENT_INCOME_COMPLEXITY;
    expect(computeComplexity(w, P0)).toBeCloseTo(base + capped, 10);
    // Prove the cap actually fired: 4 magic neighbors exist but only 3 are paid.
    expect(computeComplexity(w, P0)).toBeLessThan(base + 4 * KEYSTONE_INCOME_COMPLEXITY);
  });

  it('a FOULED Filament confers nothing (whole structure earns zero from it)', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100);
    const line = addPrim(w, 2, SparkType.Line, 140);
    const line2 = addPrim(w, 3, SparkType.Line, 180);
    connect(w, 10, dot, line); // Filament
    connect(w, 11, line, line2); // Cable (magic)
    w.fouledPrimitives.add(asPrimitiveId(1)); // foul the Filament's Dot endpoint
    // Filament(10) skipped (fouled) → no filament trickle, no keystone. Un-fouled: Line(2),Line(3)=2 prims;
    // Cable(11) still un-fouled → 1 magic bond.
    const expected = 2 * PRIM_WEIGHT + 1 * MAGIC_BONUS;
    expect(computeComplexity(w, P0)).toBeCloseTo(expected, 10);
  });

  it('a FOULED magic neighbor is not blessed (foul-skip parity)', () => {
    const w = baseWorld();
    const dot = addPrim(w, 1, SparkType.Dot, 100);
    const line = addPrim(w, 2, SparkType.Line, 140);
    const line2 = addPrim(w, 3, SparkType.Line, 180);
    connect(w, 10, dot, line); // Filament (un-fouled)
    connect(w, 11, line, line2); // Cable (magic) — will be fouled at its far end
    w.fouledPrimitives.add(asPrimitiveId(3)); // foul the Cable's far Line endpoint
    // Filament un-fouled → filament trickle stays; Cable(11) fouled → NOT a magic bond, NOT blessed.
    // Un-fouled prims: Dot(1),Line(2)=2; magic bonds: only Filament(10)=1; keystone: 0.
    const expected = 2 * PRIM_WEIGHT + 1 * MAGIC_BONUS + FILAMENT_INCOME_COMPLEXITY;
    expect(computeComplexity(w, P0)).toBeCloseTo(expected, 10);
  });

  it('is deterministic + order-independent (bond insertion order cannot change the bonus)', () => {
    const build = (filamentFirst: boolean): number => {
      const w = baseWorld();
      const dot = addPrim(w, 1, SparkType.Dot, 100);
      const line = addPrim(w, 2, SparkType.Line, 140);
      const line2 = addPrim(w, 3, SparkType.Line, 180);
      if (filamentFirst) {
        connect(w, 10, dot, line);
        connect(w, 11, line, line2);
      } else {
        connect(w, 11, line, line2);
        connect(w, 10, dot, line);
      }
      return computeComplexity(w, P0);
    };
    expect(build(true)).toBe(build(false));
  });
});
