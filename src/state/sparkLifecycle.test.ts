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
        pos: { x: 100, y: 100 },
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
        pos: { x: 100, y: 100 },
      }),
    ).not.toThrow();
    expect(spark.state).toEqual({ kind: 'Carried', carrierId: asPlayerId(1) }); // unchanged
    expect(world.diagnostics.raceRejects).toBe(1);
  });

  it('happy path: spark.state → Carried, player FSM transitions, spark.pos snaps to action.pos (S46 P2 unified snap)', () => {
    // S46 P2 (BUG-CRITICAL-5 Sym A, Council R2 C1+C12+Δ1+Δ4) —
    // applyPickupSpark now uses MANDATORY action.pos as the authoritative
    // cursor position at LMB-up. Unified across solo + local + remote
    // carriers: spark.pos := action.pos. For local carriers (solo, host's
    // own pickups in 1v1), action.pos === controls.cursor === spark.pos
    // already (controls.applyPerSubstep keeps them synced) — so the snap
    // is functionally a no-op vs pre-S46. Test asserts the new explicit
    // contract: caller passes pos, reducer snaps to that pos.
    const world = makeWorld(1);
    const spark = makeTestSpark(3);
    spark.pos = { x: 50, y: 60 };
    spark.prevPos = { x: 49, y: 58 }; // some prior velocity
    world.freeSparks.set(spark.id, spark);

    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: asPlayerId(0),
      pos: { x: 50, y: 60 },
    });

    expect(spark.state).toEqual({ kind: 'Carried', carrierId: asPlayerId(0) });
    expect(spark.pos).toEqual({ x: 50, y: 60 });     // snapped to action.pos (no-op since same)
    expect(spark.prevPos).toEqual({ x: 50, y: 60 }); // snapped to action.pos (velocity killed)
    const p = world.players.get(asPlayerId(0))!;
    expect(p.kind).toBe('Carrying');
  });

  it('S46 P2 — REMOTE carrier (1v1 + carrier != localPlayerId): spark snaps to action.pos (joiner cursor)', () => {
    // S46 P2 replaces S45's avatarPos-snap with action.pos-snap. Scenario:
    // from HOST's POV, spark was at (500, 300) host-authoritative; joiner's
    // cursor was at (700, 400) when LMB-up fired and the INTENT envelope
    // carries pos:{700,400}. Host applies → spark.pos snaps to action.pos
    // = (700, 400) — the authoritative claim from joiner. action.pos is
    // re-validated against joiner.avatarPos (must be within
    // REASONABLE_PICKUP_REACH=250) so this scenario passes (cursor ahead
    // of avatarPos by 0 — they're equal here for test simplicity).
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.isHost = true;
    world.localPlayerId = asPlayerId(0);
    const joinerId = asPlayerId(1);
    world.players.set(joinerId, {
      id: joinerId,
      color: 0x3bd7ff,
      kind: 'Idle',
      energy: 0,
      buildActions: 0,
      disruptionCharges: 0,
      avatarPos: { x: 700, y: 400 }, // joiner's authoritative avatarPos
      godlyCooldownEndsAtTick: null,
    } as never);
    const spark = makeTestSpark(7);
    spark.pos = { x: 500, y: 300 };
    spark.prevPos = { x: 498, y: 299 };
    world.freeSparks.set(spark.id, spark);

    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: joinerId,
      pos: { x: 700, y: 400 }, // joiner's cursor at LMB-up
    });

    expect(spark.pos).toEqual({ x: 700, y: 400 });
    expect(spark.prevPos).toEqual({ x: 700, y: 400 });
    expect(spark.state).toEqual({ kind: 'Carried', carrierId: joinerId });
  });

  it('S46 P2 Δ1 — REMOTE carrier with pos OUT-OF-BOUNDS: silently rejected + raceRejects++', () => {
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.isHost = true;
    world.localPlayerId = asPlayerId(0);
    const joinerId = asPlayerId(1);
    world.players.set(joinerId, {
      id: joinerId, color: 0x3bd7ff, kind: 'Idle',
      energy: 0, buildActions: 0, disruptionCharges: 0,
      avatarPos: { x: 700, y: 400 },
      godlyCooldownEndsAtTick: null,
    } as never);
    const spark = makeTestSpark(8);
    world.freeSparks.set(spark.id, spark);
    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: joinerId,
      pos: { x: -50, y: 400 }, // off-canvas
    });
    expect(spark.state.kind).toBe('Free');
    expect(world.diagnostics.raceRejects).toBe(1);
  });

  it('S46 P2 Δ1 — REMOTE carrier with pos TELEPORT-distance from avatarPos: rejected', () => {
    const world = makeWorld(1);
    world.gameMode = '1v1';
    world.isHost = true;
    world.localPlayerId = asPlayerId(0);
    const joinerId = asPlayerId(1);
    world.players.set(joinerId, {
      id: joinerId, color: 0x3bd7ff, kind: 'Idle',
      energy: 0, buildActions: 0, disruptionCharges: 0,
      avatarPos: { x: 100, y: 100 },
      godlyCooldownEndsAtTick: null,
    } as never);
    const spark = makeTestSpark(9);
    world.freeSparks.set(spark.id, spark);
    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: joinerId,
      pos: { x: 1800, y: 1000 }, // 1700px+ from avatarPos — exploit
    });
    expect(spark.state.kind).toBe('Free');
    expect(world.diagnostics.raceRejects).toBe(1);
  });

  it('S46 P2 Δ6 — malformed pos field (pre-S46 peer): silently rejected', () => {
    const world = makeWorld(1);
    const spark = makeTestSpark(10);
    world.freeSparks.set(spark.id, spark);
    // Simulate pre-S46 wire payload where pos is undefined / missing.
    applyPickupSpark(world, {
      type: 'PICKUP_SPARK',
      sparkId: spark.id,
      playerId: asPlayerId(0),
      pos: undefined as unknown as { x: number; y: number },
    });
    expect(spark.state.kind).toBe('Free');
    expect(world.diagnostics.raceRejects).toBe(1);
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
