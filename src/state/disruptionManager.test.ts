/**
 * SPARK — disruptionManager unit tests (S19 P2).
 *
 * Pure-helper tests for the SEVER_BOND extraction. End-to-end semantics
 * (cycle-no-consume, charge cap, 1v1 input gate, save roundtrip, physics
 * bypass, etc.) are still covered by the 16+ existing tests in
 * src/state/world.test.ts and src/game/sever.test.ts which exercise the
 * orchestrator. These tests target the helpers in isolation.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  type BondId,
  type PrimitiveId,
} from '../types.ts';
import { makeWorld, type GameAction, type World } from './world.ts';

const P1 = asPlayerId(0);
const P2 = asPlayerId(1);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function makePrim(
  id: number,
  placerColor: number,
  x = 100,
  y = 100,
  radius = 8,
): Primitive {
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

function setupWorld(opts: {
  gameMode?: 'solo' | '1v1';
  currentPlayer?: number;
  p1Charges?: number;
  p2Charges?: number;
  primAColor?: number;
  primBColor?: number;
}): { world: World; primA: Primitive; primB: Primitive; bond: Bond } {
  const world = makeWorld(0);
  world.gameMode = opts.gameMode ?? 'solo';
  world.currentPlayerId = asPlayerId(opts.currentPlayer ?? 0);
  // Replace default players with fixtures whose disruptionCharges are exact.
  world.players.clear();
  const p1 = makeIdlePlayer(P1, RED);
  p1.disruptionCharges = opts.p1Charges ?? 0;
  world.players.set(P1, p1);
  if (opts.gameMode === '1v1') {
    const p2 = makeIdlePlayer(P2, CYAN);
    p2.disruptionCharges = opts.p2Charges ?? 0;
    world.players.set(P2, p2);
  }
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

describe('disruptionManager — canSeverBond', () => {
  it('physics cause is always allowed (overstretch bypasses all gates)', () => {
    const { world, primA, primB } = setupWorld({ gameMode: '1v1', currentPlayer: 1 });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'physics' };
    // Wrong-turn + 0 charges, but physics bypasses.
    expect(canSeverBond(world, action, primA, primB)).toBe(true);
  });

  it("player cause + 1v1 wrong-turn = rejected (input gate)", () => {
    const { world, primA, primB } = setupWorld({ gameMode: '1v1', currentPlayer: 1, p1Charges: 5 });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(canSeverBond(world, action, primA, primB)).toBe(false);
  });

  it('player cause + hostile + 0 charges = rejected (silent §VIII.2)', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 0, primAColor: CYAN });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(canSeverBond(world, action, primA, primB)).toBe(false);
  });

  it('player cause + hostile + 1 charge = allowed', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 1, primAColor: CYAN });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(canSeverBond(world, action, primA, primB)).toBe(true);
  });

  it('player cause + self-sever (both endpoints share actor color) = allowed without charges', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 0 });
    // Both prims are RED, actor is RED → self-sever, zero-cost path.
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(canSeverBond(world, action, primA, primB)).toBe(true);
  });
});

describe('disruptionManager — computeBaseCharge', () => {
  it('physics cause = 0', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 5, primAColor: CYAN });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'physics' };
    expect(computeBaseCharge(world, action, primA, primB)).toBe(0);
  });

  it('player cause + self-sever = 0 (Phase-1 §VIII.4 zero-cost preserved)', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 5 });
    // Both prims RED, actor RED.
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(computeBaseCharge(world, action, primA, primB)).toBe(0);
  });

  it('player cause + hostile = 1', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 5, primAColor: CYAN });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(computeBaseCharge(world, action, primA, primB)).toBe(1);
  });

  it('player cause + mixed-ownership (only one endpoint differs) = 1 (Gemini #3 either-differs)', () => {
    // primA RED, primB CYAN. Actor RED. Hostile because primB differs.
    const { world, primA, primB } = setupWorld({ p1Charges: 5, primBColor: CYAN });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'player' };
    expect(computeBaseCharge(world, action, primA, primB)).toBe(1);
  });
});

describe('disruptionManager — computeSeverEraseEffects', () => {
  it('returns one SEVER_ERASE per primId in split.del, with live prim data', () => {
    const { world } = setupWorld({});
    const extra = makePrim(3, RED, 200, 50, 11);
    world.primitives.set(extra.id, extra);

    const split = {
      keep: new Set<PrimitiveId>(),
      del: new Set<PrimitiveId>([asPrimitiveId(1), asPrimitiveId(3)]),
      delBonds: new Set<BondId>(),
    };
    const effects = computeSeverEraseEffects(world, split, 42);
    expect(effects).toHaveLength(2);
    for (const e of effects) {
      expect(e.kind).toBe('SEVER_ERASE');
      expect(e.tick).toBe(42);
    }
    // Verify each effect carries the correct prim's pos + radius.
    const byPos = new Map(effects.map((e) => {
      if (e.kind !== 'SEVER_ERASE') throw new Error('unexpected');
      return [e.pos.x, e];
    }));
    const e1 = byPos.get(100);
    const e3 = byPos.get(200);
    expect(e1).toBeDefined();
    expect(e3).toBeDefined();
    if (e1?.kind === 'SEVER_ERASE') expect(e1.radius).toBe(8);
    if (e3?.kind === 'SEVER_ERASE') expect(e3.radius).toBe(11);
  });

  it('skips primIds no longer in world.primitives (defensive)', () => {
    const { world } = setupWorld({});
    const split = {
      keep: new Set<PrimitiveId>(),
      del: new Set<PrimitiveId>([asPrimitiveId(1), asPrimitiveId(999)]),  // 999 doesn't exist
      delBonds: new Set<BondId>(),
    };
    const effects = computeSeverEraseEffects(world, split, 0);
    expect(effects).toHaveLength(1);  // only prim 1
  });
});

describe('disruptionManager — applySeverTopology', () => {
  it('removes the severed bond from both endpoint bond sets + world.bonds', () => {
    const { world, primA, primB, bond } = setupWorld({});
    const split = {
      keep: new Set<PrimitiveId>([primA.id]),
      del: new Set<PrimitiveId>(),
      delBonds: new Set<BondId>(),
    };
    applySeverTopology(world, bond, split);
    expect(world.bonds.has(bond.id)).toBe(false);
    expect(primA.bonds.has(bond.id)).toBe(false);
    expect(primB.bonds.has(bond.id)).toBe(false);
    // Primitives themselves should remain (split.del empty = cycle case).
    expect(world.primitives.has(primA.id)).toBe(true);
    expect(world.primitives.has(primB.id)).toBe(true);
  });

  it('cascade-deletes primitives + bonds in split (chain sever)', () => {
    const { world, primA, primB, bond } = setupWorld({});
    // Add a third primitive + second bond so we have something to cascade.
    const primC = makePrim(3, RED, 164, 100);
    world.primitives.set(primC.id, primC);
    const bondBC = makeBond(2, primB, primC);
    world.bonds.set(bondBC.id, bondBC);
    primB.bonds.add(bondBC.id);
    primC.bonds.add(bondBC.id);

    // Severing the A-B bond deletes the "smaller side" (just primA, or
    // similar). The helper itself doesn't compute the split — caller does.
    // Here we hand it a pre-computed split saying: also delete primA + bond
    // A-B (already implied) + nothing else.
    const split = {
      keep: new Set<PrimitiveId>([primB.id, primC.id]),
      del: new Set<PrimitiveId>([primA.id]),
      delBonds: new Set<BondId>(),
    };
    applySeverTopology(world, bond, split);

    expect(world.bonds.has(bond.id)).toBe(false);
    expect(world.primitives.has(primA.id)).toBe(false);
    expect(world.primitives.has(primB.id)).toBe(true);
    expect(world.primitives.has(primC.id)).toBe(true);
    expect(world.bonds.has(bondBC.id)).toBe(true);  // not in delBonds
    expect(primB.bonds.has(bond.id)).toBe(false);
    expect(primB.bonds.has(bondBC.id)).toBe(true);  // still connected to C
  });

  it('cascade-deletes bonds in split.delBonds even when not the severed one', () => {
    const { world, primA, primB, bond } = setupWorld({});
    const primC = makePrim(3, RED, 164, 100);
    world.primitives.set(primC.id, primC);
    const bondBC = makeBond(2, primB, primC);
    world.bonds.set(bondBC.id, bondBC);
    primB.bonds.add(bondBC.id);
    primC.bonds.add(bondBC.id);

    const split = {
      keep: new Set<PrimitiveId>([primA.id]),
      del: new Set<PrimitiveId>([primB.id, primC.id]),
      delBonds: new Set<BondId>([bondBC.id]),
    };
    applySeverTopology(world, bond, split);

    expect(world.bonds.has(bond.id)).toBe(false);
    expect(world.bonds.has(bondBC.id)).toBe(false);
    expect(world.primitives.has(primA.id)).toBe(true);
    expect(world.primitives.has(primB.id)).toBe(false);
    expect(world.primitives.has(primC.id)).toBe(false);
    expect(primA.bonds.has(bond.id)).toBe(false);
  });
});
