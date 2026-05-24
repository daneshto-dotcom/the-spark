/**
 * Unit tests for sparkLifecycle.ts pure helpers.
 *
 * S20 P1 Council R1 ADOPT-AS-TEST (Grok #4 + #8, Gemini #6 + #10): explicit
 * test coverage for the throw paths + happy paths that the inline case
 * bodies in world.ts had only via integration coverage.
 *
 * S42 — Removed `requireActivePlayer` describe + 2 hotseat-rejection tests
 * (turn-based gating deleted). Added: applyPickupSpark "not Free" silent-
 * return + diagnostics counter test (Council R1 Battle Ledger row 1).
 */

import { describe, it, expect } from 'vitest';
import {
  applyDespawnSpark,
  applyDropSpark,
  applyPickupSpark,
  applySpawnSpark,
  applyTickEnergy,
} from './sparkLifecycle.ts';
import { makeWorld } from './world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { SparkType } from '../constants.ts';
import { CarryViolation, type CarryingPlayer } from '../game/player.ts';
import { asPlayerId, asSparkId } from '../types.ts';

function makeTestSpark(idNum: number) {
  return makeFreeSpark({
    id: asSparkId(idNum),
    type: SparkType.Dot,
    pos: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
}

describe('applySpawnSpark', () => {
  it('inserts the spark into the freeSparks map keyed by id', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(42);
    applySpawnSpark(world, { type: 'SPAWN_SPARK', spark });
    expect(world.freeSparks.get(asSparkId(42))).toBe(spark);
  });
});

describe('applyDespawnSpark', () => {
  it('removes a free spark from the registry', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(7);
    world.freeSparks.set(spark.id, spark);
    applyDespawnSpark(world, { type: 'DESPAWN_SPARK', sparkId: spark.id });
    expect(world.freeSparks.has(spark.id)).toBe(false);
  });

  it('no-ops if the sparkId is missing', () => {
    const world = makeWorld(1);
    expect(() =>
      applyDespawnSpark(world, { type: 'DESPAWN_SPARK', sparkId: asSparkId(999) }),
    ).not.toThrow();
  });

  it('no-ops if the spark is in a non-Free state (e.g. Carried)', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(8);
    spark.state = { kind: 'Carried', carrierId: asPlayerId(0) };
    world.freeSparks.set(spark.id, spark);
    applyDespawnSpark(world, { type: 'DESPAWN_SPARK', sparkId: spark.id });
    expect(world.freeSparks.has(spark.id)).toBe(true); // unchanged
  });
});

describe('applyPickupSpark', () => {
  it('throws if spark is missing (true invariant violation, not a race)', () => {
    const world = makeWorld(1);
    expect(() =>
      applyPickupSpark(world, {
        type: 'PICKUP_SPARK',
        sparkId: asSparkId(999),
        playerId: asPlayerId(0),
      }),
    ).toThrowError(/spark 999 not free/);
  });

  it('S42 — spark not in Free state silently returns + increments diagnostics.raceRejects', () => {
    // Pre-S42 this threw `spark X not Free` and crashed dispatch. Under
    // real-time 1v1 it's a legitimate race outcome (another player grabbed
    // first) — silent + observable counter. Council R1 Battle Ledger row 1.
    const world = makeWorld(1);
    const spark = makeTestSpark(2);
    spark.state = { kind: 'Carried', carrierId: asPlayerId(1) };
    world.freeSparks.set(spark.id, spark);
    expect(() =>
      applyPickupSpark(world, {
        type: 'PICKUP_SPARK',
        sparkId: spark.id,
        playerId: asPlayerId(0),
      }),
    ).not.toThrow();
    expect(spark.state).toEqual({ kind: 'Carried', carrierId: asPlayerId(1) }); // unchanged
    expect(world.diagnostics.raceRejects).toBe(1);
  });

  it('happy path: spark.state → Carried, player FSM transitions, prevPos snaps', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(3);
    spark.pos = { x: 50, y: 60 };
    spark.prevPos = { x: 49, y: 58 }; // some prior velocity
    world.freeSparks.set(spark.id, spark);

    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: asPlayerId(0),
    });

    expect(spark.state).toEqual({ kind: 'Carried', carrierId: asPlayerId(0) });
    expect(spark.prevPos).toEqual({ x: 50, y: 60 }); // snapped to pos (kills velocity)
    const p = world.players.get(asPlayerId(0))!;
    expect(p.kind).toBe('Carrying');
  });
});

describe('applyDropSpark', () => {
  it('throws CarryViolation if player is not in Carrying state', () => {
    const world = makeWorld(1);
    expect(() =>
      applyDropSpark(world, {
        type: 'DROP_SPARK',
        playerId: asPlayerId(0),
        pos: { x: 0, y: 0 },
      }),
    ).toThrow(CarryViolation);
  });

  it('happy path: spark released at pos, player FSM transitions back to Idle', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(4);
    spark.state = { kind: 'Carried', carrierId: asPlayerId(0) };
    world.freeSparks.set(spark.id, spark);
    // Put player in Carrying state by replacing them.
    const p0 = world.players.get(asPlayerId(0))!;
    const carrying: CarryingPlayer = {
      ...p0,
      kind: 'Carrying',
      carriedSparkId: spark.id,
    };
    world.players.set(asPlayerId(0), carrying);

    applyDropSpark(world, {
      type: 'DROP_SPARK',
      playerId: asPlayerId(0),
      pos: { x: 200, y: 300 },
    });

    expect(spark.state).toEqual({ kind: 'Free' });
    expect(spark.pos).toEqual({ x: 200, y: 300 });
    expect(spark.prevPos).toEqual({ x: 200, y: 300 }); // velocity killed on drop
    expect(world.players.get(asPlayerId(0))!.kind).toBe('Idle');
  });
});

describe('applyTickEnergy', () => {
  it('accumulates energy at the flat regen rate over deltaSec', () => {
    const world = makeWorld(1);
    const p0Before = world.players.get(asPlayerId(0))!;
    const energyBefore = p0Before.energy;
    applyTickEnergy(world, {
      type: 'TICK_ENERGY',
      playerId: asPlayerId(0),
      deltaSec: 1,
    });
    const p0After = world.players.get(asPlayerId(0))!;
    expect(p0After.energy).toBeGreaterThan(energyBefore);
  });

  it('throws if the player is missing (defensive — should not happen in practice)', () => {
    const world = makeWorld(1);
    expect(() =>
      applyTickEnergy(world, {
        type: 'TICK_ENERGY',
        playerId: asPlayerId(99),
        deltaSec: 1,
      }),
    ).toThrowError(/player 99 missing/);
  });
});
