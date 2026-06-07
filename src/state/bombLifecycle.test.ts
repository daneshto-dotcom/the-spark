/**
 * SPARK — S71 P1 bomb lifecycle unit tests.
 *
 * Locks the Council-pinned (Fork B, R1+R2+R3 CONVERGED) deterministic, all-
 * topology, blast-capped LEAF-FIRST severance + the spawn/dissipate lifecycle.
 * Determinism is the load-bearing property (host-authoritative + replay-safe), so
 * the selection tests assert EXACT remaining-bond sets, not just counts.
 */

import { describe, expect, it } from 'vitest';
import {
  BOMB_RADIUS,
  BOMB_TTL_TICKS,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asBombId, asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import {
  applyDissipateBomb,
  applySpawnBomb,
  applyTriggerBomb,
} from './bombLifecycle.ts';

const P1 = asPlayerId(0);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function makePrim(id: number, placerColor: number, x = 100, y = 100): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P1,
    createdTick: id, // distinct ticks so §VIII.4 size-ties resolve deterministically
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

/** Build a solo world with a single RED player (no starting structure). */
function baseWorld(): World {
  const world = makeWorld(0);
  world.players.clear();
  world.players.set(P1, makeIdlePlayer(P1, RED));
  return world;
}

function addPrim(world: World, id: number, color: number): Primitive {
  const p = makePrim(id, color, 100 + id * 30, 100);
  world.primitives.set(p.id, p);
  return p;
}

/** Create a bond with an explicit id + wire both endpoints' adjacency sets. */
function connect(world: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    createdTick: 0,
  };
  world.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** Star: hub (prim 0) + `leaves` leaf prims (1..leaves); bondIds 1..leaves. */
function buildStar(world: World, leaves: number, color = RED): void {
  const hub = addPrim(world, 0, color);
  for (let i = 1; i <= leaves; i++) {
    const leaf = addPrim(world, i, color);
    connect(world, i, hub, leaf);
  }
}

function remainingBondIds(world: World): number[] {
  return [...world.bonds.keys()].map((b) => b as number).sort((x, y) => x - y);
}

describe('bombLifecycle — spawn + dissipate', () => {
  it('applySpawnBomb mints a bomb at pos with the correct TTL + advancing id', () => {
    const world = baseWorld();
    world.tick = 100;
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 960, y: 540 } });
    expect(world.bombs.size).toBe(1);
    expect(world.nextBombId).toBe(1);
    const bomb = world.bombs.get(asBombId(0))!;
    expect(bomb.pos).toEqual({ x: 960, y: 540 });
    expect(bomb.radius).toBe(BOMB_RADIUS);
    expect(bomb.spawnedAtTick).toBe(100);
    expect(bomb.dissipateAtTick).toBe(100 + BOMB_TTL_TICKS);
  });

  it('applyDissipateBomb removes the bomb harmlessly (no effects, no severs)', () => {
    const world = baseWorld();
    buildStar(world, 4);
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
    const id = asBombId(0);
    applyDissipateBomb(world, { type: 'DISSIPATE_BOMB', bombId: id });
    expect(world.bombs.has(id)).toBe(false);
    expect(world.bonds.size).toBe(4); // structure untouched
    expect(world.effects).toHaveLength(0); // dissipation is silent
  });
});

describe('bombLifecycle — applyTriggerBomb detonation', () => {
  it('emits BOMB_EXPLODE + removes the bomb even with 0 bonds (fizzle)', () => {
    const world = baseWorld();
    addPrim(world, 0, RED); // a lone primitive, no bonds
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 7, y: 9 } });
    applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
    expect(world.bombs.size).toBe(0);
    expect(world.effects).toHaveLength(1);
    expect(world.effects[0]).toMatchObject({ kind: 'BOMB_EXPLODE', pos: { x: 7, y: 9 } });
  });

  it('a missing bomb is a no-op (returns the same world, no effect)', () => {
    const world = baseWorld();
    buildStar(world, 4);
    const before = remainingBondIds(world);
    const result = applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(99), playerId: P1 });
    expect(result).toBe(world);
    expect(remainingBondIds(world)).toEqual(before);
    expect(world.effects).toHaveLength(0);
  });

  it('severs ~25% of the picker bonds, leaf-first by lowest BondId (8-leaf star → 2)', () => {
    const world = baseWorld();
    buildStar(world, 8); // 8 leaf bonds (ids 1..8), 9 prims
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
    applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
    // target = max(1, round(0.25*8)) = 2; cheapest = all leaves (cost 1) → lowest 2 ids.
    expect(remainingBondIds(world)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(world.primitives.size).toBe(7); // hub + 6 surviving leaves (2 leaves deleted)
  });

  it('cost-ASC beats BondId-ASC: a cheap leaf is chosen over the lowest-id interior bond', () => {
    // Path P0-P1-P2-P3-P4 with hand-chosen bond ids:
    //   id1=(P1,P2) interior cost 2   id2=(P0,P1) leaf cost 1
    //   id3=(P3,P4) leaf cost 1       id4=(P2,P3) interior cost 2
    const world = baseWorld();
    const p0 = addPrim(world, 0, RED);
    const p1 = addPrim(world, 1, RED);
    const p2 = addPrim(world, 2, RED);
    const p3 = addPrim(world, 3, RED);
    const p4 = addPrim(world, 4, RED);
    connect(world, 1, p1, p2); // interior, LOWEST id
    connect(world, 2, p0, p1); // leaf
    connect(world, 3, p3, p4); // leaf
    connect(world, 4, p2, p3); // interior
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
    applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
    // N=4 → target=1. Cheapest cost-1 leaves are id2,id3 → lowest id = id2. The
    // interior id1 (lowest id overall) is NOT chosen because its cost (2) is higher.
    expect(world.bonds.has(asBondId(2))).toBe(false); // leaf id2 severed
    expect(world.bonds.has(asBondId(1))).toBe(true); // interior id1 spared despite lowest id
    expect(remainingBondIds(world)).toEqual([1, 3, 4]);
    expect(world.primitives.has(asPrimitiveId(0))).toBe(false); // P0 (the severed leaf) deleted
  });

  it('handles a pure cycle (no leaves): opens the ring with zero primitive loss', () => {
    // Triangle P0-P1-P2-P0 (3 cycle bonds). Every cut alone leaves the graph
    // connected → cost 0 → "open the ring, no wipe" (Council/Gemini no-leaf case).
    const world = baseWorld();
    const p0 = addPrim(world, 0, RED);
    const p1 = addPrim(world, 1, RED);
    const p2 = addPrim(world, 2, RED);
    connect(world, 1, p0, p1);
    connect(world, 2, p1, p2);
    connect(world, 3, p2, p0);
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
    applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
    // N=3 → target=1; lowest-id cost-0 cycle bond = id1.
    expect(world.bonds.has(asBondId(1))).toBe(false);
    expect(world.primitives.size).toBe(3); // ring opened, NO primitive deleted
  });

  it('only damages the PICKER own-color bonds — enemy structure untouched', () => {
    const world = baseWorld();
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), CYAN));
    // RED star (ids 1..4) + an isolated CYAN bond (id 10).
    buildStar(world, 4, RED);
    const c0 = addPrim(world, 100, CYAN);
    const c1 = addPrim(world, 101, CYAN);
    connect(world, 10, c0, c1);
    applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
    applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
    expect(world.bonds.has(asBondId(10))).toBe(true); // CYAN bond untouched
    expect(world.primitives.has(asPrimitiveId(100))).toBe(true);
    expect(world.primitives.has(asPrimitiveId(101))).toBe(true);
  });

  it('is deterministic: two identical worlds yield identical remaining bonds', () => {
    const run = (): number[] => {
      const world = baseWorld();
      buildStar(world, 8);
      applySpawnBomb(world, { type: 'SPAWN_BOMB', pos: { x: 0, y: 0 } });
      applyTriggerBomb(world, { type: 'TRIGGER_BOMB', bombId: asBombId(0), playerId: P1 });
      return remainingBondIds(world);
    };
    expect(run()).toEqual(run());
  });
});
