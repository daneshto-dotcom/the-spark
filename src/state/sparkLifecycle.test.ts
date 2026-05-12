/**
 * Unit tests for sparkLifecycle.ts pure helpers + authGate.ts.
 *
 * S20 P1 Council R1 ADOPT-AS-TEST (Grok #4 + #8, Gemini #6 + #10): explicit
 * test coverage for the throw paths + happy paths that the inline case
 * bodies in world.ts had only via integration coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  applyDespawnSpark,
  applyDropSpark,
  applyPickupSpark,
  applySpawnSpark,
  applyTickEnergy,
} from './sparkLifecycle.ts';
import { requireActivePlayer } from './authGate.ts';
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

describe('requireActivePlayer (authGate)', () => {
  it('always returns true in solo mode (no inactive player)', () => {
    const world = makeWorld(1);
    world.gameMode = 'solo';
    world.currentPlayerId = asPlayerId(0);
    expect(requireActivePlayer(world, asPlayerId(0))).toBe(true);
    expect(requireActivePlayer(world, asPlayerId(1))).toBe(true); // would never happen in solo, but predicate is solo-permissive
  });

  it('in 1v1 returns true only when playerId matches currentPlayerId', () => {
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.currentPlayerId = asPlayerId(0);
    expect(requireActivePlayer(world, asPlayerId(0))).toBe(true);
    expect(requireActivePlayer(world, asPlayerId(1))).toBe(false);

    world.currentPlayerId = asPlayerId(1);
    expect(requireActivePlayer(world, asPlayerId(0))).toBe(false);
    expect(requireActivePlayer(world, asPlayerId(1))).toBe(true);
  });
});

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
  it('silently rejects in 1v1 when playerId !== currentPlayerId', () => {
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.currentPlayerId = asPlayerId(0);
    const spark = makeTestSpark(1);
    world.freeSparks.set(spark.id, spark);
    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: asPlayerId(1), // wrong player
    });
    expect(spark.state.kind).toBe('Free'); // unchanged
  });

  it('throws if spark is missing', () => {
    const world = makeWorld(1);
    expect(() =>
      applyPickupSpark(world, {
        type: 'PICKUP_SPARK',
        sparkId: asSparkId(999),
        playerId: asPlayerId(0),
      }),
    ).toThrowError(/spark 999 not free/);
  });

  it('throws if spark is not in Free state', () => {
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
    ).toThrowError(/not Free/);
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
  it('silently rejects in 1v1 when playerId !== currentPlayerId', () => {
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.currentPlayerId = asPlayerId(0);
    applyDropSpark(world, {
      type: 'DROP_SPARK',
      playerId: asPlayerId(1),
      pos: { x: 0, y: 0 },
    });
    const p = world.players.get(asPlayerId(0))!;
    expect(p.kind).toBe('Idle'); // unchanged
  });

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
