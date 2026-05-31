/**
 * SPARK — applySeverBond orchestrator unit tests (S61 P1 §XV extraction lock).
 *
 * The SEVER_BOND orchestrator was extracted verbatim from world.ts dispatch()
 * into severBond.ts. The ONE deliberate change was replacing the
 * `requirePlayer(...).disruptionCharges -= n` line with an inline guarded
 * lookup (Council Option B — no world.ts↔severBond.ts runtime cycle). These
 * tests LOCK the charge-consume behavior end-to-end through applySeverBond so
 * the equivalence claim (computeBaseCharge guarantees the actor exists whenever
 * chargeToConsume > 0) can never silently regress. End-to-end sever topology is
 * additionally covered by world.test.ts + sever.test.ts + disruptionManager.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applySeverBond } from './severBond.ts';

const P1 = asPlayerId(0);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function makePrim(id: number, placerColor: number, x = 100, y = 100, radius = 8): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P1,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius,
  };
}

function makeBond(id: number, a: Primitive, b: Primitive): Bond {
  return {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
}

/** Solo world with P1 (RED) + one bond between two configurable-color prims. */
function setupWorld(opts: {
  p1Charges?: number;
  primAColor?: number;
  primBColor?: number;
}): { world: World; primA: Primitive; primB: Primitive; bond: Bond } {
  const world = makeWorld(0);
  world.players.clear();
  const p1 = makeIdlePlayer(P1, RED);
  p1.disruptionCharges = opts.p1Charges ?? 0;
  world.players.set(P1, p1);
  const primA = makePrim(1, opts.primAColor ?? RED, 100, 100);
  const primB = makePrim(2, opts.primBColor ?? RED, 132, 100);
  const bond = makeBond(1, primA, primB);
  world.primitives.set(primA.id, primA);
  world.primitives.set(primB.id, primB);
  world.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);
  return { world, primA, primB, bond };
}

function lastEffect(world: World) {
  return world.effects[world.effects.length - 1];
}

describe('severBond — applySeverBond (S61 P1 charge-consume lock)', () => {
  it('hostile player sever consumes exactly 1 charge and removes the bond', () => {
    const { world } = setupWorld({ p1Charges: 3, primAColor: CYAN }); // primA CYAN vs actor RED → hostile
    applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' });
    expect(world.players.get(P1)?.disruptionCharges).toBe(2);
    expect(world.bonds.has(asBondId(1))).toBe(false);
    expect(lastEffect(world)?.kind).toBe('BOND_SEVERED');
  });

  it('self-sever (own structure) consumes 0 charges but still removes the bond', () => {
    const { world } = setupWorld({ p1Charges: 3 }); // both RED → self-sever zero-cost path
    applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' });
    expect(world.players.get(P1)?.disruptionCharges).toBe(3);
    expect(world.bonds.has(asBondId(1))).toBe(false);
  });

  it('physics-cause sever bypasses the charge gate (0 consumed)', () => {
    const { world } = setupWorld({ p1Charges: 3, primAColor: CYAN });
    applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'physics' });
    expect(world.players.get(P1)?.disruptionCharges).toBe(3);
    expect(world.bonds.has(asBondId(1))).toBe(false);
  });

  it('hostile sever with 0 charges is silently rejected: bond intact, no effects', () => {
    const { world } = setupWorld({ p1Charges: 0, primAColor: CYAN });
    applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' });
    expect(world.players.get(P1)?.disruptionCharges).toBe(0);
    expect(world.bonds.has(asBondId(1))).toBe(true);
    expect(world.effects).toHaveLength(0);
  });

  it('missing bond returns the SAME world reference unchanged (no throw)', () => {
    const { world } = setupWorld({ p1Charges: 3, primAColor: CYAN });
    const result = applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(999), playerId: P1, cause: 'player' });
    expect(result).toBe(world);
    expect(world.bonds.has(asBondId(1))).toBe(true);
    expect(world.players.get(P1)?.disruptionCharges).toBe(3);
  });

  it('BOND_SEVERED is emitted LAST (end-of-operation marker) with the actor cause + sever pos', () => {
    const { world, primA } = setupWorld({ p1Charges: 3, primAColor: CYAN });
    applySeverBond(world, { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' });
    const last = lastEffect(world);
    expect(last?.kind).toBe('BOND_SEVERED');
    if (last?.kind === 'BOND_SEVERED') {
      expect(last.cause).toBe('player');
      expect(last.pos).toEqual({ x: primA.pos.x, y: primA.pos.y });
    }
  });
});
