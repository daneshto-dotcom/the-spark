/**
 * SPARK — S77 P3 seagull + poop lifecycle unit tests.
 *
 * Locks the host-authoritative + deterministic contract: spawn (gated SEAGULL_MAX_ACTIVE),
 * LINEAR flight + off-screen despawn, hash-derived RANDOM-interval poop drops (S81 P3 — pure
 * fn of (id, lastPoopTick), bounded [MIN, MAX], no RNG stream), the poop→structure FOUL (whole
 * connected component) that HALTS that structure's income (computeComplexity → 0) until CLEANED
 * by the OWNER (S81 P1), the poop→free-spark "poopy" half-speed debuff, and teardown.
 * Determinism is by construction (no RNG stream in the lifecycle; component BFS sorted ids).
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_WIDTH,
  PLAYER_COLORS,
  POOP_CLEAN_RADIUS,
  POOP_DROP_MAX_TICKS,
  POOP_DROP_MIN_TICKS,
  POOP_SLOW_TICKS,
  SEAGULL_MAX_ACTIVE,
  SEAGULL_SPEED,
  SparkType,
} from '../../constants.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { asBondId, asPlayerId, asPoopId, asPrimitiveId, asSeagullId, asSparkId } from '../../types.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { computeComplexity } from '../scoring.ts';
import { restore, snapshot } from '../save.ts';
import { severSplit } from '../../game/structure.ts';
import { applySeverTopology } from '../disruptionManager.ts';
import { makePotato } from '../potato.ts';
import { applyPotatoDetonate } from '../potatoLifecycle.ts';
import { asPotatoId } from '../../types.ts';
import { makePoop } from './seagull.ts';
import {
  applyCleanPoop,
  applyPoopTick,
  applySeagullTick,
  applySpawnSeagull,
  canAvatarCleanSplat,
  poopDropIntervalTicks,
  reconcileFouledPrimitives,
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

  it('S81 P3 — drops poop at hash-derived RANDOM intervals: bounded, varied, deterministic', () => {
    const w = baseWorld();
    applySpawnSeagull(w, { type: 'SPAWN_SEAGULL', pos: { x: 200, y: 80 }, vx: SEAGULL_SPEED });
    const id = [...w.seagulls.keys()][0];
    const dropTicks: number[] = [];
    let lastCount = w.poops.size;
    for (let i = 1; i <= 400 && w.seagulls.size > 0; i++) {
      w.tick = i;
      applySeagullTick(w, { type: 'SEAGULL_TICK', seagullId: id });
      if (w.poops.size > lastCount) {
        dropTicks.push(i);
        lastCount = w.poops.size;
      }
    }
    expect(dropTicks.length).toBeGreaterThan(4); // a 400-tick flight lays several poops
    const intervals = dropTicks.slice(1).map((t, k) => t - dropTicks[k]);
    for (const gap of intervals) {
      expect(gap).toBeGreaterThanOrEqual(POOP_DROP_MIN_TICKS);
      expect(gap).toBeLessThanOrEqual(POOP_DROP_MAX_TICKS);
    }
    // RANDOM, not a metronome: the sampled gaps are not all identical.
    expect(new Set(intervals).size).toBeGreaterThan(1);
  });

  it('S81 P3 — poopDropIntervalTicks is pure, bounded, and varies across drops + gulls', () => {
    const gullA = asSeagullId(0);
    const gullB = asSeagullId(1);
    const seen = new Set<number>();
    for (let t = 0; t <= 600; t++) {
      const gap = poopDropIntervalTicks(gullA, t);
      expect(gap).toBeGreaterThanOrEqual(POOP_DROP_MIN_TICKS);
      expect(gap).toBeLessThanOrEqual(POOP_DROP_MAX_TICKS);
      expect(poopDropIntervalTicks(gullA, t)).toBe(gap); // pure: same inputs, same gap
      seen.add(gap);
    }
    expect(seen.size).toBeGreaterThan(5); // spreads across the band, not a constant
    // 'different every time it passes' — another gull at the same tick gets its own pattern
    // (id is hashed in): at least one tick in a window must differ between gulls.
    let differs = false;
    for (let t = 0; t <= 60 && !differs; t++) {
      differs = poopDropIntervalTicks(gullA, t) !== poopDropIntervalTicks(gullB, t);
    }
    expect(differs).toBe(true);
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

describe('S79 P3 (HIGH-1) — fouledPrimitives stays consistent across destroy paths', () => {
  /** Chain a—b—c (spaced > POTATO_BLAST_RADIUS so an AoE can clip exactly one prim),
   *  fully fouled by a splat anchored on `a`. */
  function fouledChain(w: World) {
    const a = addPrim(w, 1, 100, 400);
    const b = addPrim(w, 2, 220, 400);
    const c = addPrim(w, 3, 340, 400);
    const ab = connect(w, 10, a, b);
    const bc = connect(w, 11, b, c);
    const splat = makePoop({ id: asPoopId(0), pos: { x: 100, y: 400 }, spawnedAtTick: 0 });
    splat.state = 'SPLAT_STRUCTURE';
    splat.landedAtTick = 0;
    splat.fouledPrimId = a.id;
    w.poops.set(splat.id, splat);
    w.nextPoopId = 1;
    for (const p of [a, b, c]) w.fouledPrimitives.add(p.id);
    return { a, b, c, ab, bc, splat };
  }

  it('reconcile re-derives the set from live splat anchors (stale ids drop out)', () => {
    const w = baseWorld();
    const { a, b, c } = fouledChain(w);
    w.fouledPrimitives.add(asPrimitiveId(999)); // stale id (prim long destroyed)
    reconcileFouledPrimitives(w);
    expect(w.fouledPrimitives.has(asPrimitiveId(999))).toBe(false);
    expect([a.id, b.id, c.id].every((id) => w.fouledPrimitives.has(id))).toBe(true);
  });

  it('potato AoE on a fouled prim removes it from the foul set (pre-fix: leaked forever)', () => {
    const w = baseWorld();
    const { a, b, c } = fouledChain(w);
    // Potato directly on `c`: blast 110 reaches only c (b is 120 away).
    w.potatoes.set(asPotatoId(0), makePotato({ id: asPotatoId(0), pos: { x: 340, y: 400 }, spawnedAtTick: 0 }));
    applyPotatoDetonate(w, { type: 'POTATO_DETONATE', potatoId: asPotatoId(0) });
    expect(w.primitives.has(c.id)).toBe(false);
    expect(w.fouledPrimitives.has(c.id)).toBe(false); // the S78-audit leak
    // The surviving splat-anchored fragment stays fouled (splat still on `a`).
    expect(w.fouledPrimitives.has(a.id)).toBe(true);
    expect(w.fouledPrimitives.has(b.id)).toBe(true);
    expect(computeComplexity(w, P1)).toBe(0);
  });

  it('severing a fouled structure OFF its splat-anchor unfouls the splat-less side (un-cleanable income-0 fix)', () => {
    const w = baseWorld();
    const { a, b, c, ab } = fouledChain(w);
    // Cut a—b: §VIII.4 deletes the smaller fragment {a} — the SPLAT-ANCHOR side. Pre-fix,
    // the surviving {b,c} stayed fouled with NO splat left to wipe → income 0 forever.
    const split = severSplit(ab, w.primitives, w.bonds);
    expect([...split.del]).toEqual([a.id]);
    applySeverTopology(w, ab, split);
    expect(w.primitives.has(a.id)).toBe(false);
    expect(w.fouledPrimitives.size).toBe(0); // anchor died with its fragment → all clean
    expect(computeComplexity(w, P1)).toBeGreaterThan(0); // b,c earn again
    // The splat itself is now an orphan; the main.ts sweep CLEANs it (next test).
    expect(w.poops.size).toBe(1);
    expect([b.id, c.id].every((id) => w.primitives.has(id))).toBe(true);
  });

  it('orphan CLEAN_POOP (anchor prim gone) deletes the splat (pre-fix: per-tick no-op forever)', () => {
    const w = baseWorld();
    const splat = makePoop({ id: asPoopId(0), pos: { x: 100, y: 400 }, spawnedAtTick: 0 });
    splat.state = 'SPLAT_STRUCTURE';
    splat.landedAtTick = 0;
    splat.fouledPrimId = asPrimitiveId(999); // anchor was destroyed
    w.poops.set(splat.id, splat);
    applyCleanPoop(w, { type: 'CLEAN_POOP', poopId: asPoopId(0) });
    expect(w.poops.size).toBe(0);
  });
});

describe('S80 — poop collision lowest-id equivalence + foul-on-merge consistency', () => {
  it('collision picks the LOWEST-id primitive among ALL hits regardless of Map insertion order', () => {
    const w = baseWorld();
    // Insert in non-ascending order so Map iteration order ≠ id order — the S80
    // zero-allocation selection must still pick the lowest id (the exact primitive the
    // pre-S80 sorted-first-hit loop picked), not the first-inserted.
    addPrim(w, 9, 500, 400);
    addPrim(w, 2, 505, 400);
    addPrim(w, 5, 495, 400);
    const poop = makePoop({ id: asPoopId(0), pos: { x: 500, y: 395 }, spawnedAtTick: 0 });
    w.poops.set(poop.id, poop);
    applyPoopTick(w, { type: 'POOP_TICK', poopId: asPoopId(0) }); // falls to y=402 → all 3 in radius
    expect(poop.state).toBe('SPLAT_STRUCTURE');
    expect(poop.fouledPrimId).toBe(asPrimitiveId(2));
    expect(w.fouledPrimitives.has(asPrimitiveId(2))).toBe(true);
  });

  it('collision picks the LOWEST-id Free spark among hits and consumes the poop', () => {
    const w = baseWorld();
    w.tick = 50;
    const mk = (id: number, x: number) =>
      makeFreeSpark({
        id: asSparkId(id), type: SparkType.Dot, pos: { x, y: 540 },
        velocity: { x: 30, y: 0 }, dt: 1 / 60, createdTick: 0,
      });
    const s7 = mk(7, 960);
    const s3 = mk(3, 962);
    w.freeSparks.set(s7.id, s7); // inserted FIRST but higher id
    w.freeSparks.set(s3.id, s3);
    w.poops.set(asPoopId(0), makePoop({ id: asPoopId(0), pos: { x: 961, y: 535 }, spawnedAtTick: 0 }));
    applyPoopTick(w, { type: 'POOP_TICK', poopId: asPoopId(0) }); // falls to 542 → both in radius
    expect(s3.poopyUntilTick).toBe(50 + POOP_SLOW_TICKS); // lowest id takes the hit
    expect(s7.poopyUntilTick).toBeUndefined();
    expect(w.poops.size).toBe(0);
  });

  it('bonding a new prim into a fouled structure fouls it IMMEDIATELY (reconcile on placement)', () => {
    const w = baseWorld();
    const a = addPrim(w, 1, 100, 400);
    const b = addPrim(w, 2, 220, 400);
    connect(w, 10, a, b);
    const splat = makePoop({ id: asPoopId(0), pos: { x: 100, y: 400 }, spawnedAtTick: 0 });
    splat.state = 'SPLAT_STRUCTURE';
    splat.landedAtTick = 0;
    splat.fouledPrimId = a.id;
    w.poops.set(splat.id, splat);
    for (const p of [a, b]) w.fouledPrimitives.add(p.id);
    expect(computeComplexity(w, P1)).toBe(0);

    // Place a new prim bonded onto `b` via the REAL dispatch path (PICKUP → PLACE).
    const spark = makeFreeSpark({
      id: asSparkId(0), type: SparkType.Dot, pos: { x: 260, y: 400 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    w.freeSparks.set(spark.id, spark);
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: spark.id, playerId: P1, pos: spark.pos });
    dispatch(w, { type: 'PLACE_PRIMITIVE', playerId: P1, targetPrimitiveId: b.id, stiffnessTier: 'MID' });

    expect(w.primitives.size).toBe(3); // placement actually happened (not a silent reject)
    const newPrimId = [...w.primitives.keys()].find((id) => id !== a.id && id !== b.id);
    expect(newPrimId).toBeDefined();
    // Pre-S80: the new prim earned income on a pooped building until an unrelated destroy
    // event retroactively fouled it. Now it joins the foul at placement time.
    expect(w.fouledPrimitives.has(newPrimId as typeof a.id)).toBe(true);
    expect(computeComplexity(w, P1)).toBe(0);

    // Cleaning the splat still unfouls the WHOLE grown component including the new prim.
    applyCleanPoop(w, { type: 'CLEAN_POOP', poopId: splat.id });
    expect(w.fouledPrimitives.size).toBe(0);
    expect(computeComplexity(w, P1)).toBeGreaterThan(0);
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

describe('S81 P1 — owner-only splat wipe (canAvatarCleanSplat)', () => {
  const P2 = asPlayerId(1);
  const BLUE = PLAYER_COLORS[1];

  /** Owner P1 (RED) structure at (500,400) with a structure-splat sitting on it. */
  function splatWorld(): { w: World; splat: ReturnType<typeof makePoop> } {
    const w = baseWorld(); // P1 RED at (0,0)
    w.players.set(P2, makeIdlePlayer(P2, BLUE));
    const a = addPrim(w, 1, 500, 400);
    const splat = makePoop({ id: asPoopId(0), pos: { x: a.pos.x, y: a.pos.y }, spawnedAtTick: 0 });
    splat.state = 'SPLAT_STRUCTURE';
    splat.fouledPrimId = a.id;
    splat.landedAtTick = 0;
    w.poops.set(splat.id, splat);
    w.fouledPrimitives.add(a.id);
    w.tick = 100;
    return { w, splat };
  }

  it('the OWNER within POOP_CLEAN_RADIUS may clean', () => {
    const { w, splat } = splatWorld();
    const owner = w.players.get(P1)!;
    owner.avatarPos.x = 500 + POOP_CLEAN_RADIUS - 1;
    owner.avatarPos.y = 400;
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(true);
  });

  it('an ENEMY within radius may NOT clean (user round-3: only your own structure)', () => {
    const { w, splat } = splatWorld();
    const enemy = w.players.get(P2)!;
    enemy.avatarPos.x = 500;
    enemy.avatarPos.y = 400;
    expect(canAvatarCleanSplat(w, enemy, splat)).toBe(false);
  });

  it('the owner OUTSIDE the radius may not clean', () => {
    const { w, splat } = splatWorld();
    const owner = w.players.get(P1)!;
    owner.avatarPos.x = 500 + POOP_CLEAN_RADIUS + 1;
    owner.avatarPos.y = 400;
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(false);
  });

  it('a BENCHED owner may not clean until the bench expires (S80 invariant preserved)', () => {
    const { w, splat } = splatWorld();
    const owner = w.players.get(P1)!;
    owner.avatarPos.x = 500;
    owner.avatarPos.y = 400;
    owner.benchedUntilTick = w.tick + 60;
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(false);
    w.tick = owner.benchedUntilTick; // bench just expired
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(true);
  });

  it('rainbow-shuffle parity: ownerColor + player.color remap in lockstep → owner still cleans, enemy still cannot', () => {
    const { w, splat } = splatWorld();
    const owner = w.players.get(P1)!;
    const enemy = w.players.get(P2)!;
    owner.avatarPos.x = 500;
    owner.avatarPos.y = 400;
    enemy.avatarPos.x = 500;
    enemy.avatarPos.y = 400;
    // simulate the shuffle: owner RED→MAGENTA, anchor follows (rainbowLifecycle remaps both)
    const MAGENTA = PLAYER_COLORS[5];
    owner.color = MAGENTA;
    w.primitives.get(asPrimitiveId(1))!.ownerColor = MAGENTA;
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(true);
    expect(canAvatarCleanSplat(w, enemy, splat)).toBe(false);
  });

  it('gone-anchor / non-structure poops are never predicate-cleanable (orphan branch owns those)', () => {
    const { w, splat } = splatWorld();
    const owner = w.players.get(P1)!;
    owner.avatarPos.x = 500;
    owner.avatarPos.y = 400;
    w.primitives.delete(asPrimitiveId(1));
    expect(canAvatarCleanSplat(w, owner, splat)).toBe(false); // anchor destroyed → orphan sweep
    const falling = makePoop({ id: asPoopId(9), pos: { x: 500, y: 400 }, spawnedAtTick: 0 });
    expect(canAvatarCleanSplat(w, owner, falling)).toBe(false); // FALLING, not a splat
  });
});
