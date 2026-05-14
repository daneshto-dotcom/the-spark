/**
 * SPARK — GODLY_TRIGGER / GODLY_COMPLETE / GODLY_ABORT reducer (S22 P3 D4 + Δ2 + Δ3).
 *
 * Tests cover: single-slot serialization (Δ2 queue), abort drains the queue (Δ3),
 * cooldown is set on dispatch. As of S27 P0 (Council R1 Q5 UNANIMOUS creature-only)
 * the synchronous SEVER_BOND cascade on target component's bonds has been DELETED
 * from this reducer — bond severance is now creature-driven via CREATURE_ATTACK.
 * The post-migration regression test below LOCKS this: GODLY_TRIGGER must NOT
 * mutate world.bonds nor emit BOND_SEVERED/SEVER_ERASE effects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  type PrimitiveId,
} from '../types.ts';
import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
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

  // S28 P0 — Voltkin Phase 2D PRIME-AUDIT Δ5: GODLY_ABORT MUST clear the
  // pendingCreatureSpawn schedule so a queued spawn cannot fire after peer-
  // drop abort (replay + 1v1 disconnect both honored). The schedule itself
  // is set in main.ts startCinematicIfNeeded (host path); the reducer-side
  // CLEAR is the regression-locked contract.
  it('S28 migration: pendingCreatureSpawn starts null on fresh world', () => {
    expect(world.pendingCreatureSpawn).toBe(null);
  });

  it('S28 migration: GODLY_ABORT clears pendingCreatureSpawn (PRIME-AUDIT Δ5)', () => {
    // Simulate the host-side schedule (mirrors what main.ts startCinematic
    // does post-recipe-lookup). Direct write is the established pattern for
    // control-plane fields (see pendingCinematics in dispatch reducer body).
    world.pendingCreatureSpawn = {
      fireAtTick: world.tick + 240,
      event: event(0),
    };
    expect(world.pendingCreatureSpawn).not.toBe(null);
    dispatch(world, { type: 'GODLY_ABORT' });
    expect(world.pendingCreatureSpawn).toBe(null);
  });

  // S27 P0 — cascade DELETION migration regression (Council R1 Q5 UNANIMOUS
  // creature-only + blueprint § "S27 migration notes" Gap A). Pre-S27 this
  // reducer ran a 26-line synchronous SEVER_BOND cascade on the target
  // component's bonds. S27 deleted it; severance is now creature-driven via
  // CREATURE_ATTACK (autonomous Voltkin actor severs ~7 bonds at 1/sec over
  // its 8-second active window). The two tests below LOCK the post-migration
  // contract so any future drift surfaces immediately.
  it('S27 migration: GODLY_TRIGGER does NOT mutate world.bonds (cascade DELETED)', () => {
    // Build a small target component: 2 prims + 1 bond. Pre-S27 this would
    // have been entirely consumed by the cascade.
    const primA: Primitive = {
      id: asPrimitiveId(10),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[0],
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 100, y: 100 },
      prevPos: { x: 100, y: 100 },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: 0,
      radius: 8,
    };
    const primB: Primitive = {
      id: asPrimitiveId(11),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[0],
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 132, y: 100 },
      prevPos: { x: 132, y: 100 },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(primA.id, primA);
    world.primitives.set(primB.id, primB);
    const bond: Bond = {
      id: asBondId(99),
      aId: primA.id,
      bId: primB.id,
      a: primA,
      b: primB,
      restLength: 32,
      stiffnessTier: 'MID',
      createdTick: 0,
    };
    world.bonds.set(bond.id, bond);
    primA.bonds.add(bond.id);
    primB.bonds.add(bond.id);

    const bondsBefore = world.bonds.size;
    const primsBefore = world.primitives.size;

    dispatch(world, {
      type: 'GODLY_TRIGGER',
      event: event(0, [10, 11]),
    });

    // Post-S27: GODLY_TRIGGER only sets cinematic state. Bonds + prims untouched.
    expect(world.bonds.size).toBe(bondsBefore);
    expect(world.primitives.size).toBe(primsBefore);
    expect(world.bonds.has(bond.id)).toBe(true);
  });

  it('S27 migration: GODLY_TRIGGER emits NO severance effects (no BOND_SEVERED, no SEVER_ERASE)', () => {
    // Same setup as above — target component with a bond — but we assert on
    // emitted effects rather than topology.
    const primA: Primitive = {
      id: asPrimitiveId(20),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[0],
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 200, y: 200 },
      prevPos: { x: 200, y: 200 },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: 0,
      radius: 8,
    };
    const primB: Primitive = {
      id: asPrimitiveId(21),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[0],
      placedBy: asPlayerId(0),
      createdTick: 0,
      pos: { x: 232, y: 200 },
      prevPos: { x: 232, y: 200 },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: 0,
      radius: 8,
    };
    world.primitives.set(primA.id, primA);
    world.primitives.set(primB.id, primB);
    const bond: Bond = {
      id: asBondId(199),
      aId: primA.id,
      bId: primB.id,
      a: primA,
      b: primB,
      restLength: 32,
      stiffnessTier: 'MID',
      createdTick: 0,
    };
    world.bonds.set(bond.id, bond);
    primA.bonds.add(bond.id);
    primB.bonds.add(bond.id);

    world.effects.length = 0;

    dispatch(world, {
      type: 'GODLY_TRIGGER',
      event: event(0, [20, 21]),
    });

    const severEvents = world.effects.filter(
      (e) => e.kind === 'BOND_SEVERED' || e.kind === 'SEVER_ERASE',
    );
    expect(severEvents.length).toBe(0);
  });
});
