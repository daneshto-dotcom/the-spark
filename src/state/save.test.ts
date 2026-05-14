import { describe, expect, it } from 'vitest';
import {
  PHASE_1_WIN_PRIMITIVE_COUNT,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import { restore, snapshot } from './save.ts';

const P1 = asPlayerId(0);

function placeChain(world: ReturnType<typeof makeWorld>, count: number): void {
  let prev: number | null = null;
  for (let i = 0; i < count; i++) {
    const s = makeFreeSpark({
      id: asSparkId(i),
      type: (i % 6) as SparkType,
      pos: { x: 100 + i * 30, y: 100 + i * 5 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: world.tick,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1 });
    const targetId = prev !== null ? ([...world.primitives.keys()][prev] ?? null) : null;
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: targetId,
      stiffnessTier: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MID' : 'LOW',
    });
    prev = i;
    world.tick++;
  }
}

describe('WorldSnapshot save/load (§ 10.4)', () => {
  it('roundtrips a 30-primitive chain via snapshot → JSON → restore', () => {
    const w1 = makeWorld(42);
    placeChain(w1, PHASE_1_WIN_PRIMITIVE_COUNT);
    const snap = snapshot(w1);
    const json = JSON.stringify(snap);
    const reparsed = JSON.parse(json);

    const w2 = makeWorld(0);
    restore(reparsed, w2);

    expect(w2.primitives.size).toBe(w1.primitives.size);
    expect(w2.bonds.size).toBe(w1.bonds.size);
    expect(w2.tick).toBe(w1.tick);
    expect(w2.rngSeed).toBe(w1.rngSeed);
    expect(w2.gameState).toBe(w1.gameState);

    // Adjacency reconstructed: every primitive's bonds are reattached.
    for (const p of w2.primitives.values()) {
      for (const bondId of p.bonds) {
        expect(w2.bonds.has(bondId)).toBe(true);
      }
    }
    // Bond.a and Bond.b refs point at the (newly created) primitive objects.
    for (const b of w2.bonds.values()) {
      expect(b.a).toBe(w2.primitives.get(b.aId));
      expect(b.b).toBe(w2.primitives.get(b.bId));
    }
  });

  it('preserves stiffness tier per bond across the roundtrip', () => {
    const w1 = makeWorld(7);
    placeChain(w1, 6);
    const tiersBefore = [...w1.bonds.values()].map((b) => b.stiffnessTier).sort();

    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    const tiersAfter = [...w2.bonds.values()].map((b) => b.stiffnessTier).sort();
    expect(tiersAfter).toEqual(tiersBefore);
  });

  it('preserves player energy + counters', () => {
    const w1 = makeWorld(0);
    dispatch(w1, { type: 'TICK_ENERGY', playerId: P1, deltaSec: 3.0 });
    placeChain(w1, 2);
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    expect(w2.players.get(P1)!.energy).toBeCloseTo(w1.players.get(P1)!.energy, 6);
  });

  it('rejects unsupported schemaVersion', () => {
    const w1 = makeWorld(0);
    const bad = { ...snapshot(w1), schemaVersion: 99 as 1 };
    const w2 = makeWorld(0);
    expect(() => restore(bad, w2)).toThrow(/schemaVersion/);
  });
});

// S28 P0 — Voltkin Phase 2D NetSnapshot v2 round-trip (Council Q1 UNANIMOUS A
// additive-optional `creatures?` field on WorldSnapshot, Q4 2/3 B trimmed
// render-only shape). Resolves S27 RALPH Δ8 1v1 client visual regression by
// mirroring host's `world.creatures` to client via existing snapshot pipeline.
describe('WorldSnapshot creatures field (S28 P0 NetSnapshot v2)', () => {
  it('empty creatures map produces snapshot with creatures undefined (pre-S28 back-compat)', () => {
    const w1 = makeWorld(0);
    expect(w1.creatures.size).toBe(0);
    const snap = snapshot(w1);
    expect(snap.creatures).toBeUndefined();
  });

  it('round-trip rehydrates creatures with trimmed shape (id/type/pos/state/ticksInState)', () => {
    const w1 = makeWorld(0);
    // Manually inject a creature (testing the serialization path directly —
    // SPAWN_CREATURE dispatch needs targetPos + ownerPlayerId + handoff orchestration,
    // out of scope for a save round-trip unit test).
    w1.creatures.set(
      0 as unknown as import('../types.ts').CreatureId,
      {
        id: 0 as unknown as import('../types.ts').CreatureId,
        type: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: 123, y: 456 },
        prevPos: { x: 100, y: 400 },
        targetPos: { x: 200, y: 500 },
        targetBondId: null,
        state: 'SEEKING',
        ticksInState: 42,
        spawnedAtTick: 10,
        despawnAtTick: 490,
      },
    );
    const snap = snapshot(w1);
    expect(snap.creatures).toBeDefined();
    expect(snap.creatures?.length).toBe(1);
    expect(snap.creatures?.[0].pos).toEqual({ x: 123, y: 456 });
    expect(snap.creatures?.[0].state).toBe('SEEKING');
    expect(snap.creatures?.[0].ticksInState).toBe(42);
    expect(snap.creatures?.[0].type).toBe('voltkin');

    const json = JSON.stringify(snap);
    const reparsed = JSON.parse(json);
    const w2 = makeWorld(0);
    restore(reparsed, w2);
    expect(w2.creatures.size).toBe(1);
    const rehydrated = w2.creatures.get(0 as unknown as import('../types.ts').CreatureId)!;
    expect(rehydrated.pos).toEqual({ x: 123, y: 456 });
    expect(rehydrated.state).toBe('SEEKING');
    expect(rehydrated.ticksInState).toBe(42);
    // Trimmed-shape: sim-only fields default safely (PRIME-AUDIT Δ7 readonly
    // + Council Q4 2/3 B "client never simulates, defaults are fine").
    expect(rehydrated.targetBondId).toBe(null);
    expect(rehydrated.prevPos).toEqual({ x: 123, y: 456 }); // snaps to pos
  });

  it('pre-S28 snapshot (no creatures field) still applies cleanly (Δ3 nullish guard)', () => {
    const w1 = makeWorld(0);
    placeChain(w1, 4); // populate primitives so restore has bodies to walk
    const snap = snapshot(w1);
    // Mutate the snapshot in-place to simulate a pre-S28 wire payload (creatures
    // field absent on the wire, not undefined). JSON.parse round-trip drops
    // undefined keys naturally.
    const json = JSON.stringify(snap);
    const reparsed = JSON.parse(json);
    expect(reparsed.creatures).toBeUndefined();
    const w2 = makeWorld(0);
    expect(() => restore(reparsed, w2)).not.toThrow();
    expect(w2.creatures.size).toBe(0);
  });

  // CHECK Triumvirate cross-Council UNANIMOUS Grok-C1 + Gemini-G1 P0 fix:
  // advance world.nextCreatureId past max-loaded-id so host save-load doesn't
  // re-mint colliding IDs on next SPAWN_CREATURE.
  it('CHECK C1/G1 fix: nextCreatureId advances past max-loaded creature id', () => {
    const w1 = makeWorld(0);
    // Inject 2 creatures with non-contiguous IDs (simulating host that minted
    // ids 0, 3, then 0+1 despawned mid-save).
    w1.creatures.set(
      0 as unknown as import('../types.ts').CreatureId,
      {
        id: 0 as unknown as import('../types.ts').CreatureId,
        type: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: 50, y: 50 },
        prevPos: { x: 50, y: 50 },
        targetPos: { x: 60, y: 60 },
        targetBondId: null,
        state: 'SPAWNING',
        ticksInState: 5,
        spawnedAtTick: 0,
        despawnAtTick: 480,
      },
    );
    w1.creatures.set(
      3 as unknown as import('../types.ts').CreatureId,
      {
        id: 3 as unknown as import('../types.ts').CreatureId,
        type: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: 100, y: 100 },
        prevPos: { x: 100, y: 100 },
        targetPos: { x: 110, y: 110 },
        targetBondId: null,
        state: 'SEEKING',
        ticksInState: 12,
        spawnedAtTick: 100,
        despawnAtTick: 580,
      },
    );
    w1.nextCreatureId = 4;
    const w2 = makeWorld(0);
    expect(w2.nextCreatureId).toBe(0); // fresh world
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    // After load: max-loaded-id is 3, so nextCreatureId must be 4 to avoid
    // collision on next host SPAWN_CREATURE.
    expect(w2.nextCreatureId).toBe(4);
  });

  // CHECK Triumvirate Grok-C3 P1 fix: applySnapshotCore clears pendingCreatureSpawn.
  it('CHECK C3 fix: applySnapshotCore clears pendingCreatureSpawn (parity)', () => {
    const w1 = makeWorld(0);
    const snap = snapshot(w1);
    const w2 = makeWorld(0);
    // Simulate host that has a pending spawn queued pre-load. After loading
    // the saved snapshot the pending must be cleared, mirroring creatures.clear().
    w2.pendingCreatureSpawn = {
      fireAtTick: 999,
      event: {
        godlyId: 'voltkin',
        triggererPlayerId: P1,
        targetComponentPrimitiveIds: [],
        targetPos: { x: 0, y: 0 },
        triggerTick: 0,
      },
    };
    expect(w2.pendingCreatureSpawn).not.toBe(null);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.pendingCreatureSpawn).toBe(null);
  });
});
