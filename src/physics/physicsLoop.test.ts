/**
 * S109 P1 — unit tests for reapExpiredFreeSparks (the 10s un-claimed-shape TTL).
 *
 * Owner playtest #6: un-claimed shapes must self-despawn after 10s so the spawn zone never
 * piles into chaos. The reap is Free-only, deterministic (pure tick math), and runs BEFORE the
 * count-cap. NO velocity clamp — the fast-fling is an intended tactic (the TTL alone bounds the pile).
 */

import { describe, it, expect } from 'vitest';
import { reapExpiredFreeSparks } from './physicsLoop.ts';
import { makeWorld } from '../state/world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { FREE_SPARK_TTL_TICKS, SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';

function freeSparkAt(idNum: number, createdTick: number) {
  return makeFreeSpark({
    id: asSparkId(idNum),
    type: SparkType.Dot,
    pos: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick,
  });
}

describe('reapExpiredFreeSparks (S109 P1)', () => {
  it('despawns a Free spark older than FREE_SPARK_TTL_TICKS', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS + 1; // spark created at tick 0 → age = TTL+1 ≥ TTL
    const spark = freeSparkAt(1, 0);
    world.freeSparks.set(spark.id, spark);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.has(spark.id)).toBe(false);
  });

  it('keeps a Free spark younger than the TTL', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS - 1; // age = TTL-1 < TTL
    const spark = freeSparkAt(2, 0);
    world.freeSparks.set(spark.id, spark);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.has(spark.id)).toBe(true);
  });

  it('treats the exact TTL boundary as expired (>= comparison)', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS; // age == TTL exactly
    const spark = freeSparkAt(3, 0);
    world.freeSparks.set(spark.id, spark);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.has(spark.id)).toBe(false);
  });

  it('never reaps a Carried spark even when older than the TTL (carry is never yanked)', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS * 10;
    const spark = freeSparkAt(4, 0);
    spark.state = { kind: 'Carried', carrierId: asPlayerId(1) };
    world.freeSparks.set(spark.id, spark);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.has(spark.id)).toBe(true);
  });

  it('never reaps a Bonded spark even when older than the TTL (committed to a structure)', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS * 10;
    const spark = freeSparkAt(5, 0);
    spark.state = { kind: 'Bonded', primitiveId: asPrimitiveId(7) };
    world.freeSparks.set(spark.id, spark);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.has(spark.id)).toBe(true);
  });

  it('reaps only the expired subset, leaving fresh + non-Free sparks (deterministic set)', () => {
    const world = makeWorld(1);
    world.tick = FREE_SPARK_TTL_TICKS + 100;
    const oldA = freeSparkAt(10, 0);                          // expired
    const oldB = freeSparkAt(11, 50);                         // expired
    const fresh = freeSparkAt(12, FREE_SPARK_TTL_TICKS + 1);  // age 99 < TTL → kept
    const carried = freeSparkAt(13, 0);                       // expired-age but Carried → kept
    carried.state = { kind: 'Carried', carrierId: asPlayerId(1) };
    for (const s of [oldA, oldB, fresh, carried]) world.freeSparks.set(s.id, s);

    reapExpiredFreeSparks(world);

    expect(world.freeSparks.has(oldA.id)).toBe(false);
    expect(world.freeSparks.has(oldB.id)).toBe(false);
    expect(world.freeSparks.has(fresh.id)).toBe(true);
    expect(world.freeSparks.has(carried.id)).toBe(true);
  });

  it('is a no-op when no spark has expired (byte-stable freeSparks map)', () => {
    const world = makeWorld(1);
    world.tick = 10;
    const a = freeSparkAt(20, 5);
    const b = freeSparkAt(21, 8);
    world.freeSparks.set(a.id, a);
    world.freeSparks.set(b.id, b);
    reapExpiredFreeSparks(world);
    expect(world.freeSparks.size).toBe(2);
  });
});
