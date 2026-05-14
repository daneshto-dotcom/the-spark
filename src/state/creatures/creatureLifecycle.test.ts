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
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_RANGE,
  VOLTKIN_LIFETIME_TICKS,
  asCreatureId,
  makeVoltkinCreature,
} from './creature.ts';
import { computeCreatureAlpha } from '../../render/creatureRenderer.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../../types.ts';
import { PLAYER_COLORS, SparkType } from '../../constants.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { applyNetSnapshot, netSnapshot } from '../save.ts';

const TARGET_POS = { x: 100, y: 200 };
// S26 P0 — every SPAWN_CREATURE / makeVoltkinCreature now carries targetPos
// (Council Q1 + Δ5 caller-computed). Using a fixed stub so tests are deterministic
// and don't depend on `computeStubTargetPos` (which is exercised in creatureVerlet.test.ts).
const STUB_TARGET = { x: 800, y: 600 };

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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: 999, y: 999 }, // would-be-different pos, ignored
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(1),
      pos: { x: 300, y: 400 },
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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

  it('transitions SPAWNING → SEEKING at ticksInState >= CREATURE_SPAWN_TICKS (S26 P0)', () => {
    const id = asCreatureId(0);
    expect(world.creatures.get(id)!.state).toBe('SPAWNING');
    expect(world.creatures.get(id)!.ticksInState).toBe(0);
    // Call applyCreatureTick CREATURE_SPAWN_TICKS times. World.tick stays at 0
    // throughout (applyCreatureTick doesn't advance world.tick — that's main.ts's
    // job). On the 60th call, ticksInState increments to 60, the check fires,
    // state flips to SEEKING and ticksInState resets to 0.
    for (let i = 1; i < CREATURE_SPAWN_TICKS; i++) {
      applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    }
    // After 59 calls: still SPAWNING, ticksInState=59 (one less than threshold).
    expect(world.creatures.get(id)!.state).toBe('SPAWNING');
    expect(world.creatures.get(id)!.ticksInState).toBe(CREATURE_SPAWN_TICKS - 1);
    // 60th call: increment to 60, transition fires.
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('SEEKING');
    expect(world.creatures.get(id)!.ticksInState).toBe(0);
    // Subsequent ticks in SEEKING just increment without further transition until
    // the DESPAWNING boundary at world.tick >= despawnAtTick - 60.
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('SEEKING');
    expect(world.creatures.get(id)!.ticksInState).toBe(1);
  });

  it('SEEKING → DESPAWNING transitions correctly (blueprint Q5/Q8 — SEEKING also routes through despawn window)', () => {
    const id = asCreatureId(0);
    const c = world.creatures.get(id)!;
    // Manually promote to SEEKING (analogue of 60 SPAWNING ticks; covered by the
    // dedicated test above). Then fast-forward to the DESPAWNING boundary.
    c.state = 'SEEKING';
    c.ticksInState = 0;
    world.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId: id });
    expect(world.creatures.get(id)!.state).toBe('DESPAWNING');
    expect(world.creatures.get(id)!.ticksInState).toBe(0);
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

describe('applyCreatureTick — S27 P0 SEEKING ↔ ATTACKING transitions', () => {
  // Helper: build a world with an enemy bond at a known midpoint, plus a creature
  // in SEEKING state at controllable distance. Mirrors the disruptionManager.test.ts
  // setup pattern. Distance from creature.pos to bond midpoint controls range gating.
  function setupSeeking(opts: {
    creatureX: number;
    creatureY: number;
    bondMidX: number;
    bondMidY: number;
    creatureState?: 'SEEKING' | 'ATTACKING';
    targetBondSet?: boolean;
  }): {
    world: World;
    creatureId: ReturnType<typeof asCreatureId>;
    bondId: ReturnType<typeof asBondId>;
  } {
    const w = makeWorld(0);
    w.players.clear();
    w.players.set(asPlayerId(0), makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0]));
    w.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]));

    // Enemy bond (P1's color) at the requested midpoint. Endpoints offset ±10 px
    // so midpoint is exactly (bondMidX, bondMidY).
    const primA: Primitive = {
      id: asPrimitiveId(1),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[1],
      placedBy: asPlayerId(1),
      createdTick: 0,
      pos: { x: opts.bondMidX - 10, y: opts.bondMidY },
      prevPos: { x: opts.bondMidX - 10, y: opts.bondMidY },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[1],
      lastOwnershipChange: 0,
      radius: 8,
    };
    const primB: Primitive = {
      id: asPrimitiveId(2),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[1],
      placedBy: asPlayerId(1),
      createdTick: 0,
      pos: { x: opts.bondMidX + 10, y: opts.bondMidY },
      prevPos: { x: opts.bondMidX + 10, y: opts.bondMidY },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[1],
      lastOwnershipChange: 0,
      radius: 8,
    };
    w.primitives.set(primA.id, primA);
    w.primitives.set(primB.id, primB);
    const bond: Bond = {
      id: asBondId(1),
      aId: primA.id,
      bId: primB.id,
      a: primA,
      b: primB,
      restLength: 32,
      stiffnessTier: 'MID',
      createdTick: 0,
    };
    w.bonds.set(bond.id, bond);
    primA.bonds.add(bond.id);
    primB.bonds.add(bond.id);

    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(0),
      pos: { x: opts.creatureX, y: opts.creatureY },
      targetPos: { x: opts.bondMidX, y: opts.bondMidY },
    });
    const creatureId = asCreatureId(0);
    const c = w.creatures.get(creatureId)!;
    c.state = opts.creatureState ?? 'SEEKING';
    c.ticksInState = 0;
    if (opts.targetBondSet !== false) {
      c.targetBondId = bond.id;
    }
    return { world: w, creatureId, bondId: bond.id };
  }

  it('SEEKING → ATTACKING when targetBondId is set AND bond midpoint in range', () => {
    const { world, creatureId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: VOLTKIN_ATTACK_RANGE - 50,
      bondMidY: 0,
    });
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    expect(world.creatures.get(creatureId)!.state).toBe('ATTACKING');
    expect(world.creatures.get(creatureId)!.ticksInState).toBe(0);
  });

  it('SEEKING stays SEEKING when bond is out of attack range', () => {
    const { world, creatureId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: VOLTKIN_ATTACK_RANGE * 2, // way out of range
      bondMidY: 0,
    });
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    expect(world.creatures.get(creatureId)!.state).toBe('SEEKING');
    // ticksInState incremented but no transition.
    expect(world.creatures.get(creatureId)!.ticksInState).toBe(1);
  });

  it('SEEKING stays SEEKING when targetBondId is null (no target available)', () => {
    const { world, creatureId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: 1, // would be in range, but...
      bondMidY: 0,
      targetBondSet: false, // ...targetBondId stays null
    });
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    expect(world.creatures.get(creatureId)!.state).toBe('SEEKING');
  });

  it('ATTACKING → SEEKING after VOLTKIN_ATTACK_CADENCE_TICKS (Council Q5 blueprint Q9 1/sec rhythm)', () => {
    const { world, creatureId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: 50,
      bondMidY: 0,
      creatureState: 'ATTACKING',
    });
    const c = world.creatures.get(creatureId)!;
    // Fast-forward ticksInState to just before cadence.
    c.ticksInState = VOLTKIN_ATTACK_CADENCE_TICKS - 1;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    // Increment + check: now ticksInState=60 → cadenceElapsed → SEEKING.
    expect(world.creatures.get(creatureId)!.state).toBe('SEEKING');
    expect(world.creatures.get(creatureId)!.ticksInState).toBe(0);
    expect(world.creatures.get(creatureId)!.targetBondId).toBe(null);
  });

  it('Δ4: ATTACKING → SEEKING early when bond vanishes BEFORE FIRE_TICK (wind-up abort)', () => {
    const { world, creatureId, bondId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: 50,
      bondMidY: 0,
      creatureState: 'ATTACKING',
    });
    const c = world.creatures.get(creatureId)!;
    c.ticksInState = 10; // mid wind-up (< FIRE_TICK=30)
    // Simulate concurrent severance.
    world.bonds.delete(bondId);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    expect(world.creatures.get(creatureId)!.state).toBe('SEEKING');
    expect(world.creatures.get(creatureId)!.targetBondId).toBe(null);
  });

  it('Δ4 boundary: ATTACKING stays ATTACKING through recovery even if bond gone POST-FIRE_TICK', () => {
    const { world, creatureId, bondId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: 50,
      bondMidY: 0,
      creatureState: 'ATTACKING',
    });
    const c = world.creatures.get(creatureId)!;
    c.ticksInState = 40; // post FIRE_TICK (30), still inside cadence (60)
    // Bond severed by creature's earlier attack-fire (or by another actor).
    world.bonds.delete(bondId);
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    // Should NOT abort early — blueprint Q9 honors the full 60-tick cycle for
    // rhythmic 1/sec pacing. Bond-gone-during-recovery is the EXPECTED state.
    expect(world.creatures.get(creatureId)!.state).toBe('ATTACKING');
    expect(world.creatures.get(creatureId)!.ticksInState).toBe(41);
  });

  it('ATTACKING → DESPAWNING at the despawn boundary (S27 extends step #2 to include ATTACKING)', () => {
    const { world, creatureId } = setupSeeking({
      creatureX: 0,
      creatureY: 0,
      bondMidX: 50,
      bondMidY: 0,
      creatureState: 'ATTACKING',
    });
    const c = world.creatures.get(creatureId)!;
    world.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(world, { type: 'CREATURE_TICK', creatureId });
    expect(world.creatures.get(creatureId)!.state).toBe('DESPAWNING');
    expect(world.creatures.get(creatureId)!.ticksInState).toBe(0);
    // targetBondId cleared on transition.
    expect(world.creatures.get(creatureId)!.targetBondId).toBe(null);
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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
    });
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: asPlayerId(1),
      pos: { x: 300, y: 400 },
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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
      targetPos: STUB_TARGET,
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
