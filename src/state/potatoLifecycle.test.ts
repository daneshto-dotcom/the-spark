/**
 * SPARK — S72 P3 potato-bomb lifecycle unit tests.
 *
 * Locks: spawn (from-SPAWN fuse), the carry-1 mutual exclusion (both directions),
 * place/drop (ARMED, fuse UNCHANGED — Fork E), and the Council Fork-F DETERMINISTIC
 * radial AoE (squared-dist + SORTED PrimitiveId + owner-agnostic + position-based +
 * no chain reaction). Determinism is load-bearing (host-authoritative + replay-safe),
 * so the AoE tests assert EXACT surviving sets.
 */

import { describe, expect, it } from 'vitest';
import {
  POTATO_CARRIER_BENCH_TICKS,
  POTATO_FUSE_TICKS,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeIdlePlayer, pickup } from '../game/player.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asBondId, asPlayerId, asPotatoId, asPrimitiveId, asSparkId } from '../types.ts';
import { makeWorld, type World } from './world.ts';
import { applyPickupSpark } from './sparkLifecycle.ts';
import {
  applyDropPotato,
  applyPickupPotato,
  applyPlacePotato,
  applyPotatoDetonate,
  applySpawnPotato,
  teardownPotatoes,
} from './potatoLifecycle.ts';

const P1 = asPlayerId(0);
const RED = PLAYER_COLORS[0];
const CYAN = PLAYER_COLORS[1];

function makePrim(id: number, placerColor: number, x: number, y: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: P1,
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
  };
}

function baseWorld(): World {
  const world = makeWorld(0);
  world.players.clear();
  world.players.set(P1, makeIdlePlayer(P1, RED));
  return world;
}

function addPrimAt(world: World, id: number, color: number, x: number, y: number): Primitive {
  const p = makePrim(id, color, x, y);
  world.primitives.set(p.id, p);
  return p;
}

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

function freeSpark(id: number, x: number, y: number) {
  return makeFreeSpark({ id: asSparkId(id), type: SparkType.Dot, pos: { x, y }, velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0 });
}

describe('potatoLifecycle — spawn', () => {
  it('mints a FREE potato at pos with a from-SPAWN fuse + advancing id', () => {
    const w = baseWorld();
    w.tick = 100;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 960, y: 540 } });
    expect(w.potatoes.size).toBe(1);
    expect(w.nextPotatoId).toBe(1);
    const po = w.potatoes.get(asPotatoId(0))!;
    expect(po.state).toBe('FREE');
    expect(po.carrierId).toBe(null);
    expect(po.pos).toEqual({ x: 960, y: 540 });
    expect(po.spawnedAtTick).toBe(100);
    expect(po.detonateAtTick).toBe(100 + POTATO_FUSE_TICKS); // FORK E from-SPAWN
  });
});

describe('potatoLifecycle — carry-1 mutual exclusion', () => {
  it('PICKUP_POTATO: FREE -> CARRIED + sets the player carry slot', () => {
    const w = baseWorld();
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    const po = w.potatoes.get(asPotatoId(0))!;
    expect(po.state).toBe('CARRIED');
    expect(po.carrierId).toBe(P1);
    expect(w.players.get(P1)!.carriedPotatoId).toBe(asPotatoId(0));
  });

  it('a second grab of an already-CARRIED potato no-ops (first-grab-wins race)', () => {
    const w = baseWorld();
    w.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), CYAN));
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: asPlayerId(1) });
    expect(w.potatoes.get(asPotatoId(0))!.carrierId).toBe(P1); // first grab held
    expect(w.players.get(asPlayerId(1))!.carriedPotatoId).toBeUndefined();
  });

  it('PICKUP_POTATO is rejected while Carrying a spark', () => {
    const w = baseWorld();
    const spark = freeSpark(0, 500, 500);
    spark.state = { kind: 'Carried', carrierId: P1 };
    w.freeSparks.set(spark.id, spark);
    w.players.set(P1, pickup(makeIdlePlayer(P1, RED), spark.id));
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    expect(w.potatoes.get(asPotatoId(0))!.state).toBe('FREE');
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
  });

  it('PICKUP_SPARK is rejected while carrying a potato (the other direction)', () => {
    const w = baseWorld();
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    const spark = freeSpark(0, 600, 600);
    w.freeSparks.set(spark.id, spark);
    applyPickupSpark(w, { type: 'PICKUP_SPARK', sparkId: spark.id, playerId: P1, pos: { x: 600, y: 600 } });
    expect(w.freeSparks.get(spark.id)!.state.kind).toBe('Free'); // spark not grabbed
    expect(w.players.get(P1)!.kind).toBe('Idle');
    expect(w.players.get(P1)!.carriedPotatoId).toBe(asPotatoId(0)); // still holding the potato
  });
});

describe('potatoLifecycle — place + drop (Fork E from-SPAWN fuse unchanged)', () => {
  it('PLACE_POTATO arms the potato at the cursor + frees the carry slot, fuse UNCHANGED', () => {
    const w = baseWorld();
    w.tick = 50;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    const fuse = w.potatoes.get(asPotatoId(0))!.detonateAtTick;
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    w.tick = 80;
    applyPlacePotato(w, { type: 'PLACE_POTATO', playerId: P1, pos: { x: 700, y: 300 } });
    const po = w.potatoes.get(asPotatoId(0))!;
    expect(po.state).toBe('ARMED');
    expect(po.carrierId).toBe(null);
    expect(po.pos).toEqual({ x: 700, y: 300 });
    expect(po.detonateAtTick).toBe(fuse); // from-SPAWN: place does NOT reset the fuse
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
  });

  it('DROP_POTATO leaves it ARMED at its current pos + frees the carry slot', () => {
    const w = baseWorld();
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyDropPotato(w, { type: 'DROP_POTATO', playerId: P1 });
    expect(w.potatoes.get(asPotatoId(0))!.state).toBe('ARMED');
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
  });
});

describe('potatoLifecycle — S75 re-pickup + carrier bench', () => {
  const P2 = asPlayerId(1);

  it('re-grabs an ARMED (placed) potato: ARMED -> CARRIED, fuse UNCHANGED (hot-potato)', () => {
    const w = baseWorld();
    w.tick = 10;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    const fuse = w.potatoes.get(asPotatoId(0))!.detonateAtTick;
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPlacePotato(w, { type: 'PLACE_POTATO', playerId: P1, pos: { x: 700, y: 300 } });
    expect(w.potatoes.get(asPotatoId(0))!.state).toBe('ARMED');
    // A second player re-grabs the placed potato.
    w.players.set(P2, makeIdlePlayer(P2, CYAN));
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P2 });
    const po = w.potatoes.get(asPotatoId(0))!;
    expect(po.state).toBe('CARRIED');
    expect(po.carrierId).toBe(P2);
    expect(w.players.get(P2)!.carriedPotatoId).toBe(asPotatoId(0));
    expect(po.detonateAtTick).toBe(fuse); // fuse never resets across pickups
  });

  it('a CARRIED potato still cannot be grabbed by another player (no stealing from a hand)', () => {
    const w = baseWorld();
    w.players.set(P2, makeIdlePlayer(P2, CYAN));
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P2 });
    expect(w.potatoes.get(asPotatoId(0))!.carrierId).toBe(P1); // P1 keeps it
    expect(w.players.get(P2)!.carriedPotatoId).toBeUndefined();
  });

  it('benches the carrier for POTATO_CARRIER_BENCH_TICKS when it detonates in-hand', () => {
    const w = baseWorld();
    w.tick = 200;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.players.get(P1)!.benchedUntilTick).toBe(200 + POTATO_CARRIER_BENCH_TICKS);
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
  });

  it('does NOT bench when an ARMED (placed) potato detonates — only holding is punished', () => {
    const w = baseWorld();
    w.tick = 50;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPlacePotato(w, { type: 'PLACE_POTATO', playerId: P1, pos: { x: 700, y: 300 } });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.players.get(P1)!.benchedUntilTick).toBeUndefined(); // placed = no bench
  });

  it('bench-stacking: a 15s potato bench never shortens a longer existing bench (Math.max)', () => {
    const w = baseWorld();
    w.tick = 100;
    // An existing longer bench (e.g. a 30s hunter catch already applied this match).
    w.players.get(P1)!.benchedUntilTick = 100 + 30 * 60;
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.players.get(P1)!.benchedUntilTick).toBe(100 + 30 * 60); // longer bench preserved
  });
});

describe('potatoLifecycle — DETERMINISTIC radial AoE', () => {
  it('deletes prims + incident bonds within R, spares those outside (squared-dist)', () => {
    const w = baseWorld();
    const p0 = addPrimAt(w, 0, RED, 100, 100); // in
    const p1 = addPrimAt(w, 1, RED, 150, 100); // in
    const pFar = addPrimAt(w, 2, RED, 600, 100); // out
    connect(w, 1, p0, p1); // both-in bond → deleted
    connect(w, 2, p1, pFar); // straddling bond → deleted (p1 is a victim)
    // Spawn a potato at the blast centre + detonate it directly (detonation uses
    // potato.pos in ANY state — no need to route through carry/place for this test).
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 120, y: 100 } });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.primitives.has(asPrimitiveId(0))).toBe(false); // p0 deleted
    expect(w.primitives.has(asPrimitiveId(1))).toBe(false); // p1 deleted
    expect(w.primitives.has(asPrimitiveId(2))).toBe(true); // pFar survives
    expect(w.bonds.size).toBe(0); // both incident bonds gone
    // pFar lost its bond from its set (survivor cleanup).
    expect(w.primitives.get(asPrimitiveId(2))!.bonds.size).toBe(0);
    expect(w.effects.some((e) => e.kind === 'BOMB_EXPLODE')).toBe(true);
  });

  it('is owner-AGNOSTIC: deletes enemy-color prims in range too', () => {
    const w = baseWorld();
    addPrimAt(w, 0, CYAN, 100, 100); // enemy color, in range
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 100, y: 100 } });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.primitives.has(asPrimitiveId(0))).toBe(false);
  });

  it('is POSITION-based: fires on an empty coord (no prims) — visual only, no crash', () => {
    const w = baseWorld();
    addPrimAt(w, 0, RED, 1500, 900); // far from the blast
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 100, y: 100 } });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.primitives.size).toBe(1); // nothing deleted
    expect(w.potatoes.size).toBe(0); // potato consumed
    expect(w.effects.some((e) => e.kind === 'BOMB_EXPLODE')).toBe(true);
  });

  it('has NO chain reaction: deletes prims/bonds only, NOT another potato in range', () => {
    const w = baseWorld();
    addPrimAt(w, 0, RED, 100, 100);
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 100, y: 100 } }); // id 0 — detonates
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 105, y: 100 } }); // id 1 — in range, must survive
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.primitives.has(asPrimitiveId(0))).toBe(false); // prim deleted
    expect(w.potatoes.has(asPotatoId(1))).toBe(true); // other potato NOT chained
  });

  it('is deterministic: two identical worlds yield identical surviving prim sets', () => {
    const run = (): number[] => {
      const w = baseWorld();
      for (let i = 0; i < 8; i++) addPrimAt(w, i, RED, 100 + i * 25, 100); // a row crossing the blast edge
      applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 150, y: 100 } });
      applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
      return [...w.primitives.keys()].map((p) => p as number).sort((a, b) => a - b);
    };
    expect(run()).toEqual(run());
  });

  it('clears the carrier slot when a CARRIED potato detonates in-hand', () => {
    const w = baseWorld();
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
    expect(w.potatoes.size).toBe(0);
  });
});

describe('potatoLifecycle — teardownPotatoes', () => {
  it('clears potatoes + counter + every carriedPotatoId', () => {
    const w = baseWorld();
    applySpawnPotato(w, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: P1 });
    teardownPotatoes(w);
    expect(w.potatoes.size).toBe(0);
    expect(w.nextPotatoId).toBe(0);
    expect(w.players.get(P1)!.carriedPotatoId).toBeUndefined();
  });
});
