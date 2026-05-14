/**
 * SPARK — creature lifecycle reducer tests (S25 P0, Voltkin Phase 2A scaffold).
 *
 * Mirrors `sparkLifecycle.test.ts` pattern (S20 P1): pure reducer tests using
 * vitest, exercising happy paths, max-1-per-player invariant, FSM transitions,
 * auto-delete at despawnAtTick, idempotent missing-id no-ops, and GODLY_ABORT
 * cascade clear.
 *
 * The renderer's alpha-fade math (`computeCreatureAlpha`) is also covered here
 * so the fade curve is regression-locked.
 *
 * Council R1 deltas exercised:
 *   - Δ1 (host gate): not a reducer concern — main.ts integration; covered by
 *     reading the SPAWN_CREATURE dispatch site (manually verified, smoke check).
 *   - Δ2 (full union): tests reference SPAWNING/DESPAWNING explicitly; SEEKING/
 *     ATTACKING reserved (no test path).
 *   - Δ3 (has-guard): "no-op if id missing" tests on DESPAWN + TICK.
 *   - Δ4 (save.ts clear): covered in this file via direct world.creatures
 *     assertion after applySnapshotCore (separate test below).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, makeWorld, type World } from '../world.ts';
import {
  applyCreatureTick,
  applyDespawnCreature,
  applySpawnCreature,
} from './creatureLifecycle.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
  VOLTKIN_LIFETIME_TICKS,
  asCreatureId,
  makeVoltkinCreature,
} from './creature.ts';
import { computeCreatureAlpha } from '../../render/creatureRenderer.ts';
import { asPlayerId } from '../../types.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { applyNetSnapshot, netSnapshot } from '../save.ts';

const TARGET_POS = { x: 100, y: 200 };

describe('applySpawnCreature', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
  });

  it('creates a Voltkin creature with correct shape + lifecycle timestamps', () => {
    expect(world.creatures.size).toBe(0);
    expect(world.nextCreatureId).toBe(0);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
    expect(world.creatures.size).toBe(1);
    expect(world.nextCreatureId).toBe(1);
    const c = world.creatures.get(asCreatureId(0))!;
    expect(c.type).toBe('voltkin');
    expect(c.ownerPlayerId).toBe(asPlayerId(0));
    expect(c.state).toBe('SPAWNING');
    expect(c.ticksInState).toBe(0);
    expect(c.spawnedAtTick).toBe(world.tick);
    expect(c.despawnAtTick).toBe(world.tick + VOLTKIN_LIFETIME_TICKS);
    expect(c.pos).toEqual(TARGET_POS);
    expect(c.prevPos).toEqual(TARGET_POS); // S26-reserved; zero implicit velocity for S25
  });

  it('max-1-per-player invariant: second spawn for same owner is silent no-op', () => {
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 999, y: 999 }, // would-be-different pos, ignored
    });
    expect(world.creatures.size).toBe(1);
    // nextCreatureId not bumped on the rejected spawn — sole spawn took id 0.
    expect(world.nextCreatureId).toBe(1);
  });

  it('1v1: both players can each have 1 creature alive simultaneously', () => {
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x00ff00));
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(1),
      pos: { x: 300, y: 400 },
    });
    expect(world.creatures.size).toBe(2);
    const owners = Array.from(world.creatures.values()).map((c) => c.ownerPlayerId);
    expect(owners).toContain(asPlayerId(0));
    expect(owners).toContain(asPlayerId(1));
  });
});

describe('applyCreatureTick', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
  });

  it('increments ticksInState while in SPAWNING + not at despawn window', () => {
    const id = asCreatureId(0);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.ticksInState).toBe(1);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.ticksInState).toBe(2);
    expect(world.creatures.get(id)!.state).toBe('SPAWNING');
  });

  it('transitions SPAWNING → DESPAWNING at despawnAtTick - CREATURE_DESPAWNING_TICKS', () => {
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    // Fast-forward world.tick to the boundary - 1.
    world.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS - 1;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('SPAWNING'); // not yet
    // Now step to the boundary tick.
    world.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('DESPAWNING');
    expect(world.creatures.get(id)!.ticksInState).toBe(0); // reset on transition
  });

  it('auto-deletes creature when world.tick >= despawnAtTick', () => {
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    world.tick = c.despawnAtTick;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('no-op when creatureId is missing (defense-in-depth has-guard)', () => {
    const missing = asCreatureId(999);
    expect(() =>
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: missing }),
    ).not.toThrow();
    expect(world.creatures.size).toBe(1); // unaffected
  });
});

describe('applyDespawnCreature', () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld(1);
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
  });

  it('deletes a live creature', () => {
    const id = asCreatureId(0);
    expect(world.creatures.has(id)).toBe(true);
    applyDespawnCreature(world, { type: 'DESPAWN_CREATURE', creatureId: id });
    expect(world.creatures.has(id)).toBe(false);
  });

  it('idempotent no-op when id is missing', () => {
    expect(() =>
      applyDespawnCreature(world, {
        type: 'DESPAWN_CREATURE',
        creatureId: asCreatureId(999),
      }),
    ).not.toThrow();
    expect(world.creatures.size).toBe(1);
  });
});

describe('GODLY_ABORT cascade', () => {
  it('clears world.creatures regardless of owner (blueprint Edge Case #2)', () => {
    const world = makeWorld(1);
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x00ff00));
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(1),
      pos: { x: 300, y: 400 },
    });
    expect(world.creatures.size).toBe(2);
    dispatch(world, { type: 'GODLY_ABORT' });
    expect(world.creatures.size).toBe(0);
    expect(world.activeCinematicPlayerId).toBe(null);
    expect(world.pendingCinematics.length).toBe(0);
  });
});

describe('computeCreatureAlpha (renderer fade-curve)', () => {
  it('returns 1.0 during SPAWNING', () => {
    const c = makeVoltkinCreature({
      id: asCreatureId(0),
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
      spawnedAtTick: 0,
    });
    expect(computeCreatureAlpha(c)).toBe(1.0);
    c.ticksInState = 100;
    expect(computeCreatureAlpha(c)).toBe(1.0);
  });

  it('returns 1.0 during DESPAWNING first half (before fade window)', () => {
    const c = makeVoltkinCreature({
      id: asCreatureId(0),
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
      spawnedAtTick: 0,
    });
    c.state = 'DESPAWNING';
    c.ticksInState = 0;
    expect(computeCreatureAlpha(c)).toBe(1.0);
    c.ticksInState = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS - 1;
    expect(computeCreatureAlpha(c)).toBe(1.0);
  });

  it('linearly fades 1.0 → 0.0 across CREATURE_FADE_TICKS', () => {
    const c = makeVoltkinCreature({
      id: asCreatureId(0),
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
      spawnedAtTick: 0,
    });
    c.state = 'DESPAWNING';
    const fadeStart = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
    c.ticksInState = fadeStart;
    expect(computeCreatureAlpha(c)).toBeCloseTo(1.0, 5);
    c.ticksInState = fadeStart + CREATURE_FADE_TICKS / 2;
    expect(computeCreatureAlpha(c)).toBeCloseTo(0.5, 5);
    c.ticksInState = fadeStart + CREATURE_FADE_TICKS;
    expect(computeCreatureAlpha(c)).toBeCloseTo(0.0, 5);
  });

  it('clamps alpha to [0, 1] past the fade window (no negative bleed)', () => {
    const c = makeVoltkinCreature({
      id: asCreatureId(0),
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
      spawnedAtTick: 0,
    });
    c.state = 'DESPAWNING';
    c.ticksInState = 9999;
    expect(computeCreatureAlpha(c)).toBe(0);
  });
});

describe('save.ts integration — applyNetSnapshot clears world.creatures', () => {
  it('zombie creatures on client are wiped when host snapshot arrives', () => {
    // Simulate a corrupted client world with stale creatures (e.g. from a
    // bug fixed in S25 P0 — Council R1 Gap B Δ4 belt-and-suspenders).
    const client = makeWorld(1);
    applySpawnCreature(client, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: TARGET_POS,
    });
    expect(client.creatures.size).toBe(1);
    expect(client.nextCreatureId).toBe(1);

    // Host has no creatures (e.g. cleanly bootstrapped) — produce its NetSnapshot.
    const host = makeWorld(2);
    host.gameMode = '1v1';
    host.isHost = true;
    const snap = netSnapshot(host);

    // Client applies the snapshot. Even though `creatures` is not in the wire
    // schema, applySnapshotCore must clear it for parity with primitives/bonds.
    applyNetSnapshot(snap, client);
    expect(client.creatures.size).toBe(0);
    // Council CHECK Grok CH3: nextCreatureId must also reset so client-mint
    // collisions are impossible if behavior ever diverges from "host-only mint".
    expect(client.nextCreatureId).toBe(0);
  });
});
