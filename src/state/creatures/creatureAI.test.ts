/**
 * SPARK — creature AI module unit tests (S27 P0). Pure-function tests for
 * target selection + range gate + bond geometry helpers. No DOM, no dispatch —
 * just world state construction and direct helper calls.
 *
 * Coverage map (PRIME-AUDIT Δ2 + Δ3 exercised):
 *   - distSq + bondMidpoint helpers (pure geometry)
 *   - isEnemyBond: own-only, mixed-color, missing-prim degenerate
 *   - findNearestBondTarget:
 *       priority-1 ENEMY (Δ2 exercise: at least one enemy bond)
 *       priority-2 OWN fallback (Δ2 exercise: solo mode / no enemies)
 *       null when bonds map empty
 *       deterministic tie-break (Δ3 multi-creature replay-safety)
 *   - isWithinAttackRange: in range, out of range, missing bond
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
import {
  bondMidpoint,
  distSq,
  findNearestBondTarget,
  findNearestEnemyCreature,
  findNearestEnemyCreatureFrom,
  isEnemyBond,
  isWithinAttackRange,
} from './creatureAI.ts';
import {
  asCreatureId,
  makeCreature,
  makeVoltkinCreature,
  type Creature,
  VOLTKIN_ATTACK_RANGE,
} from './creature.ts';
import { CHEWER_CONFIG } from './voltkin-config.ts';
import { asSpawnerId } from '../../types.ts';

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

function setupWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.players.set(P1, makeIdlePlayer(P1, COLOR_P1));
  return w;
}

function addBond(world: World, id: number, primA: Primitive, primB: Primitive): BondId {
  world.primitives.set(primA.id, primA);
  world.primitives.set(primB.id, primB);
  const bond = makeBond(id, primA, primB);
  world.bonds.set(bond.id, bond);
  primA.bonds.add(bond.id);
  primB.bonds.add(bond.id);
  return bond.id;
}

function spawnAt(world: World, ownerPlayerId: typeof P0, x: number, y: number): Creature {
  const c = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
  });
  world.creatures.set(c.id, c);
  return c;
}

describe('distSq + bondMidpoint (pure geometry)', () => {
  it('distSq returns Euclidean squared distance', () => {
    expect(distSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    expect(distSq({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
    expect(distSq({ x: 0, y: 0 }, { x: -5, y: 12 })).toBe(169);
  });

  it('bondMidpoint averages endpoint positions', () => {
    const primA = makePrim(1, COLOR_P0, 0, 0);
    const primB = makePrim(2, COLOR_P0, 100, 200);
    const bond = makeBond(1, primA, primB);
    expect(bondMidpoint(bond)).toEqual({ x: 50, y: 100 });
  });
});

describe('isEnemyBond', () => {
  it('returns true when either endpoint placerColor differs from owner color', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P0, 0, 0);
    const primB = makePrim(2, COLOR_P1, 100, 0); // ENEMY (P1's color)
    addBond(w, 1, primA, primB);
    const creature = spawnAt(w, P0, 50, 0);
    const bond = w.bonds.get(asBondId(1))!;
    expect(isEnemyBond(w, creature, bond)).toBe(true);
  });

  it('returns false when both endpoints share owner color (own bond)', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P0, 0, 0);
    const primB = makePrim(2, COLOR_P0, 100, 0);
    addBond(w, 1, primA, primB);
    const creature = spawnAt(w, P0, 50, 0);
    const bond = w.bonds.get(asBondId(1))!;
    expect(isEnemyBond(w, creature, bond)).toBe(false);
  });

  it('returns false when an endpoint primitive is missing (degenerate)', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P0, 0, 0);
    const primB = makePrim(2, COLOR_P1, 100, 0);
    addBond(w, 1, primA, primB);
    w.primitives.delete(primA.id); // zombie bond
    const creature = spawnAt(w, P0, 50, 0);
    const bond = w.bonds.get(asBondId(1))!;
    expect(isEnemyBond(w, creature, bond)).toBe(false);
  });
});

describe('findNearestBondTarget — priority + fallback (PRIME-AUDIT Δ2)', () => {
  it('returns nearest ENEMY bond when one exists (priority 1)', () => {
    const w = setupWorld();
    // Far own bond (would win on distance if priority didn't beat it).
    const a0 = makePrim(10, COLOR_P0, 50, 50);
    const a1 = makePrim(11, COLOR_P0, 70, 50);
    addBond(w, 1, a0, a1);
    // Distant enemy bond.
    const b0 = makePrim(20, COLOR_P1, 500, 500);
    const b1 = makePrim(21, COLOR_P1, 520, 500);
    addBond(w, 2, b0, b1);
    const creature = spawnAt(w, P0, 0, 0); // closer to own (bondId 1) than enemy (bondId 2)

    const target = findNearestBondTarget(w, creature);
    // Enemy priority wins regardless of distance, per blueprint Q9 ordering.
    expect(target).toBe(asBondId(2));
  });

  it('falls back to nearest OWN bond when no enemy bonds exist (priority 2, solo Q12 LOCKED)', () => {
    const w = setupWorld();
    const a0 = makePrim(10, COLOR_P0, 50, 50);
    const a1 = makePrim(11, COLOR_P0, 70, 50);
    addBond(w, 1, a0, a1);
    const a2 = makePrim(12, COLOR_P0, 500, 500);
    const a3 = makePrim(13, COLOR_P0, 520, 500);
    addBond(w, 2, a2, a3);
    const creature = spawnAt(w, P0, 0, 0);

    const target = findNearestBondTarget(w, creature);
    // Among own bonds, the nearest one wins. bondId 1 is at ~(60, 50), bondId 2 at ~(510, 500).
    expect(target).toBe(asBondId(1));
  });

  it('returns null when world.bonds is empty', () => {
    const w = setupWorld();
    const creature = spawnAt(w, P0, 0, 0);
    expect(findNearestBondTarget(w, creature)).toBe(null);
  });

  it('deterministic tie-break: lowest BondId wins among equidistant bonds (Δ3 replay safety)', () => {
    const w = setupWorld();
    // Two enemy bonds at IDENTICAL midpoints — pure tie.
    const a0 = makePrim(20, COLOR_P1, 100, 0);
    const a1 = makePrim(21, COLOR_P1, 120, 0); // mid = (110, 0)
    addBond(w, 5, a0, a1);
    const b0 = makePrim(30, COLOR_P1, 100, 0);
    const b1 = makePrim(31, COLOR_P1, 120, 0); // mid = (110, 0)  same!
    addBond(w, 3, b0, b1); // lower bondId

    const creature = spawnAt(w, P0, 0, 0);
    // Distance equal; bondId 3 < bondId 5 should win.
    expect(findNearestBondTarget(w, creature)).toBe(asBondId(3));
  });
});

describe('isWithinAttackRange', () => {
  it('returns true when bond midpoint within VOLTKIN_ATTACK_RANGE of creature', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P1, 0, 0);
    const primB = makePrim(2, COLOR_P1, 20, 0); // mid = (10, 0)
    addBond(w, 1, primA, primB);
    const creature = spawnAt(w, P0, VOLTKIN_ATTACK_RANGE - 50, 0); // ~130 px away from midpoint
    expect(isWithinAttackRange(w, creature, asBondId(1))).toBe(true);
  });

  it('returns false when bond midpoint exceeds VOLTKIN_ATTACK_RANGE', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P1, 0, 0);
    const primB = makePrim(2, COLOR_P1, 20, 0); // mid = (10, 0)
    addBond(w, 1, primA, primB);
    const creature = spawnAt(w, P0, VOLTKIN_ATTACK_RANGE + 100, 0); // far outside range
    expect(isWithinAttackRange(w, creature, asBondId(1))).toBe(false);
  });

  it('returns false when the bondId is missing from world.bonds (race-condition guard)', () => {
    const w = setupWorld();
    const creature = spawnAt(w, P0, 0, 0);
    expect(isWithinAttackRange(w, creature, asBondId(999))).toBe(false);
  });

  it('S102 #3 — uses PER-TYPE range: a chewer engages at melee (~35), a Voltkin at 180', () => {
    const w = setupWorld();
    const primA = makePrim(1, COLOR_P1, 0, 0);
    const primB = makePrim(2, COLOR_P1, 20, 0); // mid = (10, 0)
    addBond(w, 1, primA, primB);
    // A chewer 100px from the bond midpoint: would be in range at Voltkin's 180, but NOT
    // at the chewer's 35 — it must keep approaching the connector (the "move close" fix).
    const chewer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(5), ownerPlayerId: P0,
      pos: { x: 110, y: 0 }, targetPos: { x: 10, y: 0 },
      spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    w.creatures.set(chewer.id, chewer);
    expect(isWithinAttackRange(w, chewer, asBondId(1))).toBe(false); // 100 > chewer 35
    chewer.pos = { x: 40, y: 0 }; // now 30px from the midpoint (10,0) — within melee
    expect(isWithinAttackRange(w, chewer, asBondId(1))).toBe(true);
    // A Voltkin at the same far 100px IS in range (180) — proves the range is per-type.
    const voltkin = spawnAt(w, P0, 110, 0);
    expect(isWithinAttackRange(w, voltkin, asBondId(1))).toBe(true);
  });
});

describe('findNearestEnemyCreatureFrom / findNearestEnemyCreature (S103 #8)', () => {
  // Place an enemy chewer (owned by `owner`) at (x,y) with the given id.
  function addChewer(world: World, id: number, owner: typeof P0, x: number, y: number): void {
    const c = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(id), ownerPlayerId: owner,
      pos: { x, y }, targetPos: { x, y },
      spawnedAtTick: 0, sourceSpawnerId: asSpawnerId(1),
    });
    world.creatures.set(c.id, c);
  }

  it('returns the nearest ENEMY creature (skips same-owner) within range', () => {
    const w = setupWorld();
    addChewer(w, 1, P1, 300, 0); // far enemy
    addChewer(w, 2, P1, 40, 0); // near enemy
    addChewer(w, 3, P0, 10, 0); // OWN — must be skipped even though nearest
    const got = findNearestEnemyCreatureFrom(w, { x: 0, y: 0 }, P0);
    expect(got).toBe(asCreatureId(2));
  });

  it('respects the squared range gate (returns null when all enemies are out of range)', () => {
    const w = setupWorld();
    addChewer(w, 1, P1, 200, 0); // 200px away
    expect(findNearestEnemyCreatureFrom(w, { x: 0, y: 0 }, P0, 100 * 100)).toBe(null);
    expect(findNearestEnemyCreatureFrom(w, { x: 0, y: 0 }, P0, 250 * 250)).toBe(asCreatureId(1));
  });

  it('deterministic tie-break: lowest CreatureId wins among equidistant enemies', () => {
    const w = setupWorld();
    addChewer(w, 7, P1, 50, 0);
    addChewer(w, 4, P1, 50, 0); // identical pos — pure tie; lower id (4) must win
    addChewer(w, 9, P1, 50, 0);
    expect(findNearestEnemyCreatureFrom(w, { x: 0, y: 0 }, P0)).toBe(asCreatureId(4));
  });

  it('excludeId skips the caller itself', () => {
    const w = setupWorld();
    addChewer(w, 1, P1, 30, 0);
    expect(findNearestEnemyCreatureFrom(w, { x: 0, y: 0 }, P0, Infinity, asCreatureId(1)))
      .toBe(null); // only candidate is excluded
  });

  it('returns null when there are no enemy creatures (Voltkin path stays byte-identical, MF4)', () => {
    const w = setupWorld();
    addChewer(w, 1, P0, 10, 0); // own creature only
    const voltkin = spawnAt(w, P0, 0, 0);
    expect(findNearestEnemyCreature(w, voltkin)).toBe(null);
  });

  it('wrapper: a Voltkin zaps an enemy chewer ONLY when within its attackRange (opportunistic, MF3)', () => {
    const w = setupWorld();
    const voltkin = spawnAt(w, P0, 0, 0); // attackRange 180
    addChewer(w, 1, P1, VOLTKIN_ATTACK_RANGE + 40, 0); // out of range → opportunistic = null
    expect(findNearestEnemyCreature(w, voltkin)).toBe(null);
    // chewer wanders within range → now it's a valid opportunistic target
    w.creatures.get(asCreatureId(1))!.pos = { x: VOLTKIN_ATTACK_RANGE - 30, y: 0 };
    expect(findNearestEnemyCreature(w, voltkin)).toBe(asCreatureId(1));
  });
});
