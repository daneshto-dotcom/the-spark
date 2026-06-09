/**
 * SPARK — S77 P3 seagull + poop lifecycle unit tests.
 *
 * Locks the host-authoritative + deterministic contract: spawn (gated SEAGULL_MAX_ACTIVE),
 * LINEAR flight + off-screen despawn, FIXED-interval poop drops, the poop→structure FOUL (whole
 * connected component) that HALTS that structure's income (computeComplexity → 0) until CLEANED,
 * the poop→free-spark "poopy" half-speed debuff, and teardown. Determinism is by construction
 * (no RNG in the lifecycle; fixed-interval drops; component BFS returns sorted ids).
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_WIDTH,
  PLAYER_COLORS,
  POOP_SLOW_TICKS,
  SEAGULL_MAX_ACTIVE,
  SEAGULL_SPEED,
  SparkType,
} from '../../constants.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { asBondId, asPlayerId, asPoopId, asPrimitiveId, asSparkId } from '../../types.ts';
import { makeWorld, type World } from '../world.ts';
import { computeComplexity } from '../scoring.ts';
import { restore, snapshot } from '../save.ts';
import { makePoop } from './seagull.ts';
import {
  applyCleanPoop,
  applyPoopTick,
  applySeagullTick,
  applySpawnSeagull,
  teardownSeagulls,
} from './seagullLifecycle.ts';

const P1 = asPlayerId(0);
const RED = PLAYER_COLORS[0];

function baseWorld(): World {
  const world = makeWorld(0);
  world.players.clear();
  world.players.set(P1, makeIdlePlayer(P1, RED));
  world.gameState = 'PLAYING';
  return world;
}

function addPrim(world: World, id: number, x: number, y: number): Primitive {
  const p: Primitive = {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor: RED,
    placedBy: P1,
    createdTick: id,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: RED,
    lastOwnershipChange: 0,
    radius: 8,
  };
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

describe('S77 P3 — seagull spawn + flight', () => {
  it('spawns at the given edge pos + vx; gated by SEAGULL_MAX_ACTIVE', () => {
    const w = baseWorld();
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: -24, y: 80 }, vx: SEAGULL_SPEED });
    expect(w.seagulls.size).toBe(1);
    const g = [...w.seagulls.values()][0];
    expect(g.vx).toBe(SEAGULL_SPEED);
    expect(g.pos.y).toBe(80);
    // a second spawn is a clean no-op at MAX_ACTIVE=1
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: -24, y: 90 }, vx: SEAGULL_SPEED });
    expect(w.seagulls.size).toBe(SEAGULL_MAX_ACTIVE);
  });

  it('advances LINEARLY by vx each tick, and despawns once past the far edge', () => {
    const w = baseWorld();
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: -24, y: 80 }, vx: SEAGULL_SPEED });
    const id = [...w.seagulls.keys()][0];
    const x0 = w.seagulls.get(id)!.pos.x;
    applySeagullTick(w, { type: 'SEAGULL_TICK', seagullId: id });
    expect(w.seagulls.get(id)!.pos.x).toBeCloseTo(x0 + SEAGULL_SPEED);
    // jump it well past the right edge → next tick despawns it
    w.seagulls.get(id)!.pos.x = CANVAS_WIDTH + 1000;
    applySeagullTick(w, { type: 'SEAGULL_TICK', seagullId: id });
    expect(w.seagulls.size).toBe(0);
  });

  it('drops poop on the FIXED interval while flying (no RNG)', () => {
    const w = baseWorld();
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: 200, y: 80 }, vx: SEAGULL_SPEED });
    const id = [...w.seagulls.keys()][0];
    for (let i = 1; i <= 80 && w.seagulls.size > 0; i++) {
      w.tick = i;
      applySeagullTick(w, { type: 'SEAGULL_TICK', seagullId: id });
    }
    expect(w.poops.size).toBeGreaterThan(0);
  });
});

describe('S77 P3 — poop on a structure HALTS that structure income', () => {
  it('fouls the whole connected component → income 0 → cleaning restores it', () => {
    const w = baseWorld();
    const a = addPrim(w, 1, 500, 400);
    const b = addPrim(w, 2, 540, 400);
    const c = addPrim(w, 3, 580, 400);
    connect(w, 10, a, b);
    connect(w, 11, b, c);
    const before = computeComplexity(w, P1);
    expect(before).toBeGreaterThan(0);

    // A poop falling onto prim `a`.
    w.poops.set(asPoopId(0), makePoop({ id: asPoopId(0), pos: { x: 500, y: 378 }, spawnedAtTick: 0 }));
    w.nextPoopId = 1;
    for (let i = 0; i < 20 && w.poops.get(asPoopId(0))?.state === 'FALLING'; i++) {
      applyPoopTick(w, { type: 'POOP_TICK', poopId: asPoopId(0) });
    }
    expect(w.poops.get(asPoopId(0))!.state).toBe('SPLAT_STRUCTURE');
    // The ENTIRE connected structure (a,b,c) is fouled → it earns nothing.
    expect(w.fouledPrimitives.size).toBe(3);
    expect(computeComplexity(w, P1)).toBe(0);

    // Cleaning the splat unfouls the whole structure → income restored.
    applyCleanPoop(w, { type: 'CLEAN_POOP', poopId: asPoopId(0) });
    expect(w.fouledPrimitives.size).toBe(0);
    expect(w.poops.size).toBe(0);
    expect(computeComplexity(w, P1)).toBe(before);
  });
});

describe('S77 P3 — poop on a free spark = "poopy" half-speed debuff', () => {
  it('sets poopyUntilTick = tick + POOP_SLOW_TICKS and consumes the poop', () => {
    const w = baseWorld();
    w.tick = 100;
    const spark = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 960, y: 540 },
      velocity: { x: 60, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    w.freeSparks.set(spark.id, spark);
    w.poops.set(asPoopId(0), makePoop({ id: asPoopId(0), pos: { x: 960, y: 536 }, spawnedAtTick: 0 }));

    applyPoopTick(w, { type: 'POOP_TICK', poopId: asPoopId(0) });

    expect(spark.poopyUntilTick).toBe(100 + POOP_SLOW_TICKS);
    expect(w.poops.size).toBe(0); // poop consumed on a spark hit
    // The implicit velocity was halved (impulse), so the spark still MOVES (not frozen).
    const vx = spark.pos.x - spark.prevPos.x;
    expect(vx).not.toBe(0);
  });
});

describe('S77 P3 — teardown', () => {
  it('clears seagulls/poops/fouledPrimitives and resets the id counters', () => {
    const w = baseWorld();
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: -24, y: 80 }, vx: SEAGULL_SPEED });
    w.poops.set(asPoopId(0), makePoop({ id: asPoopId(0), pos: { x: 0, y: 0 }, spawnedAtTick: 0 }));
    w.fouledPrimitives.add(asPrimitiveId(1));
    w.nextSeagullId = 5;
    w.nextPoopId = 9;

    teardownSeagulls(w);

    expect(w.seagulls.size).toBe(0);
    expect(w.poops.size).toBe(0);
    expect(w.fouledPrimitives.size).toBe(0);
    expect(w.nextSeagullId).toBe(0);
    expect(w.nextPoopId).toBe(0);
  });
});

describe('S77 P3 — save/net round-trip (DIFFERENTIAL guard for the new wire fields)', () => {
  it('round-trips seagulls, a structure-splat poop, fouledPrimitives, and the poopy-spark flag', () => {
    const w = baseWorld();
    w.tick = 200;
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: 100, y: 80 }, vx: SEAGULL_SPEED });
    const a = addPrim(w, 1, 500, 400);
    const splat = makePoop({ id: asPoopId(0), pos: { x: 500, y: 400 }, spawnedAtTick: 0 });
    splat.state = 'SPLAT_STRUCTURE';
    splat.landedAtTick = 190;
    splat.fouledPrimId = a.id;
    w.poops.set(splat.id, splat);
    w.nextPoopId = 1;
    w.fouledPrimitives.add(a.id);
    const spark = makeFreeSpark({
      id: asSparkId(0),
      type: SparkType.Dot,
      pos: { x: 960, y: 540 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    spark.poopyUntilTick = 200 + POOP_SLOW_TICKS;
    w.freeSparks.set(spark.id, spark);

    const snap = JSON.parse(JSON.stringify(snapshot(w)));
    const w2 = makeWorld(0);
    restore(snap, w2);

    expect(w2.seagulls.size).toBe(1);
    expect([...w2.seagulls.values()][0].vx).toBe(SEAGULL_SPEED);
    expect(w2.poops.size).toBe(1);
    const rp = [...w2.poops.values()][0];
    expect(rp.state).toBe('SPLAT_STRUCTURE');
    expect(rp.fouledPrimId).toBe(a.id);
    expect(w2.fouledPrimitives.has(a.id)).toBe(true);
    expect(w2.freeSparks.get(asSparkId(0))!.poopyUntilTick).toBe(200 + POOP_SLOW_TICKS);
  });
});
