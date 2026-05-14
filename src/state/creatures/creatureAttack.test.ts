/**
 * SPARK — creature attack reducer tests (S27 P0). Pure reducer tests for
 * applyCreatureAttack, exercising the central severance path (Council R1 Q1
 * UNANIMOUS B: re-dispatch SEVER_BOND{cause:'creature'}) + ARC_FLASH emit +
 * defense-in-depth guards.
 *
 * Coverage:
 *   - Severs the target bond (canSeverBond 'creature' bypass; no charge cost)
 *   - Emits BOND_SEVERED with cause='creature' (audio routing — Q4 silent S27)
 *   - Emits ARC_FLASH visual with start/end at creature.pos / bond midpoint
 *   - Emits SEVER_ERASE per loser primitive (cascade reuse — same path)
 *   - No-op when creature is missing (race: peer-drop mid-attack)
 *   - No-op when creature is in wrong state (defense vs orchestration bug)
 *   - No-op when target bond is missing (race: bond severed by physics
 *     overstretch or another creature between target-select + attack-fire)
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../../constants.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  type BondId,
} from '../../types.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { asCreatureId, makeVoltkinCreature, type Creature } from './creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const COLOR_P0 = PLAYER_COLORS[0];
const COLOR_P1 = PLAYER_COLORS[1];

function makePrim(id: number, placerColor: number, x: number, y: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P0,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
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

function setupWorld(): {
  world: World;
  creature: Creature;
  bondId: BondId;
  primA: Primitive;
  primB: Primitive;
} {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.players.set(P1, makeIdlePlayer(P1, COLOR_P1));

  // Enemy bond at known midpoint (10, 0).
  const primA = makePrim(1, COLOR_P1, 0, 0);
  const primB = makePrim(2, COLOR_P1, 20, 0);
  w.primitives.set(primA.id, primA);
  w.primitives.set(primB.id, primB);
  const bond = makeBond(1, primA, primB);
  w.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);

  // Creature at known location with state preset to ATTACKING (main.ts orchestration
  // invariant; applyCreatureAttack's defense-in-depth re-checks the state).
  const creature = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId: P0,
    pos: { x: 50, y: 30 },
    targetPos: { x: 10, y: 0 },
    spawnedAtTick: 0,
  });
  creature.state = 'ATTACKING';
  creature.targetBondId = bond.id;
  w.creatures.set(creature.id, creature);

  return { world: w, creature, bondId: bond.id, primA, primB };
}

describe('applyCreatureAttack — happy path', () => {
  it('severs the target bond via SEVER_BOND{cause:creature} (canSeverBond bypass)', () => {
    const { world, creature, bondId } = setupWorld();
    expect(world.bonds.has(bondId)).toBe(true);
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId)).toBe(false);
  });

  it("emits BOND_SEVERED audio event with cause='creature' (Council Q4 silent routing)", () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    const bondSevered = world.effects.find((e) => e.kind === 'BOND_SEVERED');
    expect(bondSevered).toBeDefined();
    if (bondSevered && bondSevered.kind === 'BOND_SEVERED') {
      expect(bondSevered.cause).toBe('creature');
    }
  });

  it('emits ARC_FLASH visual with start=creature.pos and end=bond midpoint', () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    const arc = world.effects.find((e) => e.kind === 'ARC_FLASH');
    expect(arc).toBeDefined();
    if (arc && arc.kind === 'ARC_FLASH') {
      expect(arc.start).toEqual({ x: 50, y: 30 }); // creature pre-mutation
      expect(arc.end).toEqual({ x: 10, y: 0 }); // bond midpoint (primA+primB)/2
    }
  });

  it('emits SEVER_ERASE effects via the canonical SEVER_BOND code path (cascade reuse)', () => {
    const { world, creature, bondId } = setupWorld();
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    // Two-prim chain: severing the lone bond drops the SMALLER side (single-prim
    // limb) per §VIII.4 sever rule. severSplit returns split.del.size = 1 → one
    // SEVER_ERASE effect (the loser prim).
    const severs = world.effects.filter((e) => e.kind === 'SEVER_ERASE');
    expect(severs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('applyCreatureAttack — defense-in-depth guards', () => {
  it('no-op when creature is missing from world.creatures (race: peer-drop)', () => {
    const { world, bondId } = setupWorld();
    world.creatures.clear();
    const effectsBefore = world.effects.length;
    expect(() =>
      applyCreatureAttack(world, {
        type: 'CREATURE_ATTACK',
        creatureId: asCreatureId(999),
        bondId,
      }),
    ).not.toThrow();
    expect(world.bonds.has(bondId)).toBe(true); // bond survives
    expect(world.effects.length).toBe(effectsBefore); // no effects emitted
  });

  it('no-op when creature is in wrong state (e.g. main.ts orchestration drift)', () => {
    const { world, creature, bondId } = setupWorld();
    creature.state = 'SEEKING'; // not ATTACKING
    const effectsBefore = world.effects.length;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.bonds.has(bondId)).toBe(true);
    expect(world.effects.length).toBe(effectsBefore);
  });

  it('no-op when target bond is missing (race: severed by physics or another actor)', () => {
    const { world, creature, bondId } = setupWorld();
    world.bonds.delete(bondId); // simulate concurrent severance
    const effectsBefore = world.effects.length;
    applyCreatureAttack(world, { type: 'CREATURE_ATTACK', creatureId: creature.id, bondId });
    expect(world.effects.length).toBe(effectsBefore); // no ARC_FLASH on empty target
  });
});
