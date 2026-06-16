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
import { DEFENSIVE_SEVER_CHARGE_COST, PLAYER_COLORS, SparkType } from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import { applySeverBond } from './severBond.ts';
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
  type: SparkType = SparkType.Dot,
): Primitive {
  return {
    id: asPrimitiveId(id),
    type,
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
  p1Charges?: number;
  p2Charges?: number;
  primAColor?: number;
  primBColor?: number;
  primType?: SparkType;
}): { world: World; primA: Primitive; primB: Primitive; bond: Bond } {
  const world = makeWorld(0);
  world.gameMode = opts.gameMode ?? 'solo';
  // S42 — currentPlayer opt removed (active-player gate deleted).
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
  const primA = makePrim(1, opts.primAColor ?? RED, 100, 100, 8, opts.primType);
  const primB = makePrim(2, opts.primBColor ?? RED, 132, 100, 8, opts.primType);
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
    const { world, primA, primB } = setupWorld({ gameMode: '1v1' });
    const action: GameAction = { type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause: 'physics' };
    // 0 charges, but physics bypasses.
    expect(canSeverBond(world, action, primA, primB)).toBe(true);
  });

  // S42 — "player cause + 1v1 wrong-turn = rejected" test DELETED (active-
  // player gate removed from canSeverBond; real-time gameplay per blueprint).

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

describe('S90 P2 (G1b DEFENSE) — Diamond/Lattice resist enemy sabotage', () => {
  // A hostile defensive bond: attacker P1 (RED) vs a Tri→Tri (Diamond) / Sq→Sq (Lattice) bond
  // owned by CYAN. The combo is read from the prim TYPES, so build the prims with the right type.
  function hostileDefensive(combo: 'Diamond' | 'Lattice', charges: number) {
    const primType = combo === 'Diamond' ? SparkType.Triangle : SparkType.Square;
    return setupWorld({ p1Charges: charges, primAColor: CYAN, primBColor: CYAN, primType });
  }
  // `as const` keeps `type` the 'SEVER_BOND' literal so the result narrows to the SEVER_BOND
  // action variant (a plain `: GameAction` return type would NOT narrow — function returns aren't
  // control-flow-narrowed the way the existing `const action: GameAction = {…}` locals are).
  const sever = (cause: 'player' | 'physics' | 'creature' | 'bomb' = 'player') =>
    ({ type: 'SEVER_BOND', bondId: asBondId(1), playerId: P1, cause }) as const;

  it('computeBaseCharge: a hostile Diamond (Tri→Tri) costs DEFENSIVE_SEVER_CHARGE_COST, not 1', () => {
    const { world, primA, primB } = hostileDefensive('Diamond', 5);
    expect(computeBaseCharge(world, sever(), primA, primB)).toBe(DEFENSIVE_SEVER_CHARGE_COST);
  });

  it('computeBaseCharge: a hostile Lattice (Sq→Sq) costs DEFENSIVE_SEVER_CHARGE_COST', () => {
    const { world, primA, primB } = hostileDefensive('Lattice', 5);
    expect(computeBaseCharge(world, sever(), primA, primB)).toBe(DEFENSIVE_SEVER_CHARGE_COST);
  });

  it('canSeverBond: an opponent SHORT of the full premium cannot sever a Diamond (silent-reject)', () => {
    const { world, primA, primB } = hostileDefensive('Diamond', DEFENSIVE_SEVER_CHARGE_COST - 1);
    expect(canSeverBond(world, sever(), primA, primB)).toBe(false);
  });

  it('canSeverBond: an opponent with the FULL budget CAN sever a Diamond (a premium, not invincibility)', () => {
    const { world, primA, primB } = hostileDefensive('Diamond', DEFENSIVE_SEVER_CHARGE_COST);
    expect(canSeverBond(world, sever(), primA, primB)).toBe(true);
  });

  it('AUDIT-1 (R14): physics/creature/bomb sever of a Diamond bypasses the premium (anti-sabotage ≠ hazard-immunity)', () => {
    for (const cause of ['physics', 'creature', 'bomb'] as const) {
      const { world, primA, primB } = hostileDefensive('Diamond', 0);
      expect(canSeverBond(world, sever(cause), primA, primB)).toBe(true);   // allowed at 0 charges
      expect(computeBaseCharge(world, sever(cause), primA, primB)).toBe(0); // and costs nothing
    }
  });

  it('a player may still self-sever their OWN Diamond for free (rearrange your own structure)', () => {
    // both prims RED = the actor's own color → self-sever (zero-cost), even for a Diamond.
    const s = setupWorld({ p1Charges: 0, primType: SparkType.Triangle });
    expect(computeBaseCharge(s.world, sever(), s.primA, s.primB)).toBe(0);
    expect(canSeverBond(s.world, sever(), s.primA, s.primB)).toBe(true);
  });

  it('a non-defensive hostile bond is unaffected — still costs 1 (regression)', () => {
    const { world, primA, primB } = setupWorld({ p1Charges: 5, primAColor: CYAN }); // Dot→Dot placeholder
    expect(computeBaseCharge(world, sever(), primA, primB)).toBe(1);
  });

  it('AUDIT-4 (orchestrator): a full-budget attacker breaks a Diamond and is left at 0 (gate + decrement agree)', () => {
    const { world } = hostileDefensive('Diamond', DEFENSIVE_SEVER_CHARGE_COST);
    applySeverBond(world, sever());
    expect(world.bonds.has(asBondId(1))).toBe(false); // broken at full cost
    expect(world.players.get(P1)!.disruptionCharges).toBe(0); // spent the whole budget
  });

  it('AUDIT-4 (orchestrator): an attacker one charge short does NOT break the Diamond and is NOT charged', () => {
    const { world } = hostileDefensive('Diamond', DEFENSIVE_SEVER_CHARGE_COST - 1);
    applySeverBond(world, sever());
    expect(world.bonds.has(asBondId(1))).toBe(true); // held
    expect(world.players.get(P1)!.disruptionCharges).toBe(DEFENSIVE_SEVER_CHARGE_COST - 1); // untouched
  });

  it('AUDIT-1 (orchestrator): a physics-overstretch sever actually REMOVES a Diamond (no indestructible structures)', () => {
    const { world } = hostileDefensive('Diamond', 0);
    applySeverBond(world, sever('physics'));
    expect(world.bonds.has(asBondId(1))).toBe(false);
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
