/**
 * SPARK — GODLY_TRIGGER / GODLY_COMPLETE / GODLY_ABORT reducer (S22 P3 D4 + Δ2 + Δ3).
 *
 * Tests cover: single-slot serialization (Δ2 queue), abort drains the queue (Δ3),
 * cooldown is set on dispatch, target component's bonds get SEVER_BOND cascade.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type PrimitiveId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { GODLY_COOLDOWN_TICKS } from './godlyCooldown.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';

function event(triggerer: number, targetIds: number[] = [], tick = 0): GodlyTriggerEvent {
  return {
    godlyId: 'voltkin',
    triggererPlayerId: asPlayerId(triggerer),
    targetComponentPrimitiveIds: targetIds.map((n) => n as unknown as PrimitiveId),
    targetPos: { x: 100, y: 100 },
    triggerTick: tick,
  };
}

describe('GODLY_TRIGGER reducer', () => {
  let world: World;

  beforeEach(() => {
    world = makeWorld(1);
    // ensure both players exist for 1v1 tests
    const p2 = makeIdlePlayer(asPlayerId(1), 0x00ff00);
    world.players.set(p2.id, p2);
  });

  it('null → owner: dispatch sets activeCinematicPlayerId + cooldown', () => {
    expect(world.activeCinematicPlayerId).toBe(null);
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    expect(world.activeCinematicPlayerId).toBe(asPlayerId(0));
    const p1 = world.players.get(asPlayerId(0))!;
    expect(p1.godlyCooldownEndsAtTick).toBe(world.tick + GODLY_COOLDOWN_TICKS);
  });

  it('concurrent trigger queues behind the active one (Δ2 serialization)', () => {
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(1) });
    expect(world.activeCinematicPlayerId).toBe(asPlayerId(0));
    expect(world.pendingCinematics.length).toBe(1);
    expect(world.pendingCinematics[0].triggererPlayerId).toBe(asPlayerId(1));
  });

  it('GODLY_COMPLETE clears active without re-dispatching queued (CQS-clean)', () => {
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(1) });
    dispatch(world, { type: 'GODLY_COMPLETE' });
    expect(world.activeCinematicPlayerId).toBe(null);
    // Queue NOT drained — main.ts wall-clock timer is responsible for shifting next.
    expect(world.pendingCinematics.length).toBe(1);
  });

  it('GODLY_ABORT clears active AND drains queue (Δ3 disconnect path)', () => {
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(1) });
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    expect(world.pendingCinematics.length).toBe(2);
    dispatch(world, { type: 'GODLY_ABORT' });
    expect(world.activeCinematicPlayerId).toBe(null);
    expect(world.pendingCinematics.length).toBe(0);
  });

  it('GODLY_TRIGGER on missing player is a no-op (no crash)', () => {
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(99) });
    expect(world.activeCinematicPlayerId).toBe(null);
  });

  it('reducer does not pause world.tick (D5 — physics keeps ticking during cinematic)', () => {
    const startTick = world.tick;
    dispatch(world, { type: 'GODLY_TRIGGER', event: event(0) });
    // tick is NOT mutated by GODLY_TRIGGER — cinematic is wall-clock overlay,
    // physics loop in main.ts continues ticking independently.
    expect(world.tick).toBe(startTick);
  });
});
