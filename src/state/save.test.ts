import { describe, expect, it } from 'vitest';
import {
  BOMB_TTL_TICKS,
  PHASE_1_WIN_PRIMITIVE_COUNT,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, asPotatoId, asSparkId } from '../types.ts';
import { dispatch, makeWorld } from './world.ts';
import { restore, snapshot } from './save.ts';
import { applySpawnBomb } from './bombLifecycle.ts';
import { applySpawnHunter } from './hunters/hunterLifecycle.ts';
import { applyPickupPotato, applySpawnPotato } from './potatoLifecycle.ts';

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
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });
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
        killCount: 0,
        spawnedAtTick: 10,
        despawnAtTick: 490,
        sourceSpawnerId: null,
        chewProgress: 0,
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

  it('S36 P3 — killCount round-trips when > 0; omitted when 0 (additive-optional)', () => {
    const w1 = makeWorld(0);
    w1.creatures.set(
      0 as unknown as import('../types.ts').CreatureId,
      {
        id: 0 as unknown as import('../types.ts').CreatureId,
        type: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: 100, y: 200 },
        prevPos: { x: 100, y: 200 },
        targetPos: { x: 110, y: 210 },
        targetBondId: null,
        state: 'DESPAWNING',
        ticksInState: 0,
        killCount: 3,
        spawnedAtTick: 50,
        despawnAtTick: 530,
        sourceSpawnerId: null,
        chewProgress: 0,
      },
    );
    const snap = snapshot(w1);
    // Wire-emit only when > 0 (byte-identical pre-S36 saves for kill=0 case)
    expect(snap.creatures?.[0].killCount).toBe(3);

    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    const rehydrated = w2.creatures.get(0 as unknown as import('../types.ts').CreatureId)!;
    expect(rehydrated.killCount).toBe(3);
  });

  it('S36 P3 — pre-S36 snapshots (no killCount field) rehydrate as 0', () => {
    const w1 = makeWorld(0);
    w1.creatures.set(
      0 as unknown as import('../types.ts').CreatureId,
      {
        id: 0 as unknown as import('../types.ts').CreatureId,
        type: 'voltkin',
        ownerPlayerId: P1,
        pos: { x: 100, y: 200 },
        prevPos: { x: 100, y: 200 },
        targetPos: { x: 110, y: 210 },
        targetBondId: null,
        state: 'DESPAWNING',
        ticksInState: 0,
        killCount: 0,
        spawnedAtTick: 50,
        despawnAtTick: 530,
        sourceSpawnerId: null,
        chewProgress: 0,
      },
    );
    const snap = snapshot(w1);
    // killCount=0 emits no field (additive-optional pre-S36 byte-compat)
    expect(snap.creatures?.[0].killCount).toBeUndefined();

    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    const rehydrated = w2.creatures.get(0 as unknown as import('../types.ts').CreatureId)!;
    // Nullish-coalesce default 0 on rehydrate.
    expect(rehydrated.killCount).toBe(0);
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
        killCount: 0,
        spawnedAtTick: 0,
        despawnAtTick: 480,
        sourceSpawnerId: null,
        chewProgress: 0,
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
        killCount: 0,
        spawnedAtTick: 100,
        despawnAtTick: 580,
        sourceSpawnerId: null,
        chewProgress: 0,
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

// S31 P0-3 — NetSnapshot filtered effects array. Council R1 Q2 CONVERGENT
// BLOCKER (Grok + Gemini): wire shape must drop host-local visual effects
// (BOND_COMMIT, SEVER_ERASE, STRUCTURE_GROW, STRUCTURE_MERGE, SCORE_TIER) and
// keep only the 3 NET-relevant kinds (ARC_FLASH, BOND_FORMED, BOND_SEVERED).
// Gemini Q-01: each effect carries the host `tick` field so client renderer
// computes age as `(world.tick - effect.tick)`, preserving replay determinism
// across snapshot latency.
describe('WorldSnapshot effects field (S31 P0-3)', () => {
  it('empty world.effects produces snapshot with effects undefined (pre-S31 back-compat)', () => {
    const w1 = makeWorld(0);
    expect(w1.effects.length).toBe(0);
    const snap = snapshot(w1);
    expect(snap.effects).toBeUndefined();
  });

  it('host-local visual effects (BOND_COMMIT, SEVER_ERASE, STRUCTURE_GROW, STRUCTURE_MERGE, SCORE_TIER) are dropped on the wire', () => {
    const w1 = makeWorld(0);
    // Inject 1 of each host-local kind directly into world.effects.
    w1.effects.push(
      { kind: 'BOND_COMMIT', tick: 10, pos: { x: 1, y: 2 }, color: 0xff0000, radius: 8, visualEffectId: 'fx.bond.default', otherPos: { x: 10, y: 20 } },
      { kind: 'SEVER_ERASE', tick: 11, pos: { x: 3, y: 4 }, color: 0x00ff00, radius: 10 },
      {
        kind: 'STRUCTURE_GROW',
        tick: 12,
        originPrimId: 0 as never,
        hopByPrimId: new Map(),
        hopByBondId: new Map(),
        color: 0x0000ff,
        maxHop: 3,
      },
      { kind: 'STRUCTURE_MERGE', tick: 13, originPos: { x: 5, y: 6 }, unionPrimIds: [], color: 0xffff00 },
      { kind: 'SCORE_TIER', tick: 14, tier: 1, color: 0xff00ff, pos: { x: 7, y: 8 } },
    );
    const snap = snapshot(w1);
    expect(snap.effects).toBeUndefined();
  });

  it('NET-relevant effects (ARC_FLASH, BOND_FORMED, BOND_SEVERED) are kept on the wire', () => {
    const w1 = makeWorld(0);
    w1.effects.push(
      { kind: 'ARC_FLASH', tick: 100, start: { x: 50, y: 60 }, end: { x: 200, y: 220 } },
      { kind: 'BOND_FORMED', tick: 101, pos: { x: 11, y: 12 }, bondCount: 1 },
      { kind: 'BOND_SEVERED', tick: 102, pos: { x: 13, y: 14 }, cause: 'creature' },
    );
    const snap = snapshot(w1);
    expect(snap.effects).toBeDefined();
    expect(snap.effects?.length).toBe(3);
    const kinds = snap.effects?.map((e) => e.kind).sort();
    expect(kinds).toEqual(['ARC_FLASH', 'BOND_FORMED', 'BOND_SEVERED']);
  });

  it('mixed effects produce filtered snapshot (3 kept of 8 emitted)', () => {
    const w1 = makeWorld(0);
    w1.effects.push(
      { kind: 'BOND_COMMIT', tick: 1, pos: { x: 0, y: 0 }, color: 0, radius: 8, visualEffectId: 'fx.bond.default', otherPos: { x: 0, y: 0 } },
      { kind: 'ARC_FLASH', tick: 2, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      { kind: 'SEVER_ERASE', tick: 3, pos: { x: 0, y: 0 }, color: 0, radius: 8 },
      { kind: 'BOND_FORMED', tick: 4, pos: { x: 0, y: 0 }, bondCount: 1 },
      { kind: 'STRUCTURE_GROW', tick: 5, originPrimId: 0 as never, hopByPrimId: new Map(), hopByBondId: new Map(), color: 0, maxHop: 1 },
      { kind: 'BOND_SEVERED', tick: 6, pos: { x: 0, y: 0 }, cause: 'player' },
      { kind: 'STRUCTURE_MERGE', tick: 7, originPos: { x: 0, y: 0 }, unionPrimIds: [], color: 0 },
      { kind: 'SCORE_TIER', tick: 8, tier: 1, color: 0, pos: { x: 0, y: 0 } },
    );
    const snap = snapshot(w1);
    expect(snap.effects?.length).toBe(3);
  });

  it('round-trip preserves ARC_FLASH field-for-field (tick, start, end)', () => {
    const w1 = makeWorld(0);
    w1.effects.push({
      kind: 'ARC_FLASH',
      tick: 42,
      start: { x: 100, y: 200 },
      end: { x: 300, y: 400 },
    });
    const json = JSON.stringify(snapshot(w1));
    const reparsed = JSON.parse(json);
    const w2 = makeWorld(0);
    restore(reparsed, w2);
    expect(w2.effects.length).toBe(1);
    const e = w2.effects[0];
    expect(e.kind).toBe('ARC_FLASH');
    if (e.kind === 'ARC_FLASH') {
      expect(e.tick).toBe(42);
      expect(e.start).toEqual({ x: 100, y: 200 });
      expect(e.end).toEqual({ x: 300, y: 400 });
      // S34 PB-7 — pre-S33 emissions omit creatureId; rehydrated effect MUST
      // have creatureId === undefined (additive-optional precedent S15/S28/S31).
      expect(e.creatureId).toBe(undefined);
    }
  });

  // S33 P1-11 — creatureId additive-optional field. Pre-S33 emissions
  // (this test, line above) omit creatureId; rehydrated GameEffect has
  // creatureId === undefined which arcSeed coerces to 0 via `(x | 0)`.
  // Post-S33 emissions set creatureId; round-trip preserves it.
  it('round-trip preserves ARC_FLASH.creatureId when present (S33 P1-11)', () => {
    const w1 = makeWorld(0);
    w1.effects.push({
      kind: 'ARC_FLASH',
      tick: 99,
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      creatureId: 7 as unknown as import('../types.ts').CreatureId,
    });
    const json = JSON.stringify(snapshot(w1));
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    expect(w2.effects.length).toBe(1);
    const e = w2.effects[0];
    if (e.kind === 'ARC_FLASH') {
      expect(e.creatureId).toBe(7);
    }
  });

  it('legacy ARC_FLASH (no creatureId) rehydrates with creatureId undefined (S33 P1-11 back-compat)', () => {
    // Simulate a pre-S33 wire payload: ARC_FLASH JSON missing creatureId.
    const legacySnap = {
      schemaVersion: 1 as const,
      savedAt: new Date().toISOString(),
      tick: 0,
      rngSeed: 0,
      gameState: 'PLAYING' as const,
      lastWinnerId: null,
      nextPrimitiveId: 0,
      nextBondId: 0,
      freeSparks: [],
      primitives: [],
      bonds: [],
      players: [{ id: 0 as never, color: 0, energy: 0, score: 0, avatarPos: { x: 0, y: 0 } }],
      effects: [
        { kind: 'ARC_FLASH' as const, tick: 5, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      ],
    };
    const json = JSON.stringify(legacySnap);
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    expect(w2.effects.length).toBe(1);
    const e = w2.effects[0];
    if (e.kind === 'ARC_FLASH') {
      expect(e.creatureId).toBeUndefined();
    }
  });

  // S37 P7 — wire mirror of the Voltkin charge-up audio cue. Same additive-
  // optional pattern as ARC_FLASH/BOND_*: serializeEffect/deserializeEffect
  // round-trip bit-for-bit. Pre-S37 wire payloads + saves never carry this
  // kind (host doesn't emit pre-S37); rehydrate succeeds without the variant.
  it('S37 P7 — round-trip preserves CREATURE_CHARGE (kind, tick, pos)', () => {
    const w1 = makeWorld(0);
    w1.effects.push({
      kind: 'CREATURE_CHARGE',
      tick: 123,
      pos: { x: 50, y: 75 },
    });
    const json = JSON.stringify(snapshot(w1));
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    expect(w2.effects.length).toBe(1);
    const e = w2.effects[0];
    expect(e.kind).toBe('CREATURE_CHARGE');
    if (e.kind === 'CREATURE_CHARGE') {
      expect(e.tick).toBe(123);
      expect(e.pos).toEqual({ x: 50, y: 75 });
    }
  });

  it('S37 P7 — CREATURE_CHARGE coexists with ARC_FLASH + BOND_* in mixed-emit round-trip', () => {
    const w1 = makeWorld(0);
    w1.effects.push(
      { kind: 'CREATURE_CHARGE', tick: 100, pos: { x: 50, y: 50 } },
      { kind: 'ARC_FLASH', tick: 130, start: { x: 50, y: 50 }, end: { x: 200, y: 200 } },
      { kind: 'BOND_SEVERED', tick: 130, pos: { x: 200, y: 200 }, cause: 'creature' },
      { kind: 'CREATURE_CHARGE', tick: 160, pos: { x: 60, y: 60 } },
    );
    const json = JSON.stringify(snapshot(w1));
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    expect(w2.effects.length).toBe(4);
    // Order preserved; CHARGE bracketed by the FIRE-tick lightning trio.
    expect(w2.effects[0].kind).toBe('CREATURE_CHARGE');
    expect(w2.effects[1].kind).toBe('ARC_FLASH');
    expect(w2.effects[2].kind).toBe('BOND_SEVERED');
    expect(w2.effects[3].kind).toBe('CREATURE_CHARGE');
  });

  it('S37 P7 — defensive pos copy on serialize + deserialize (no shared refs)', () => {
    const w1 = makeWorld(0);
    const sharedPos = { x: 100, y: 200 };
    w1.effects.push({ kind: 'CREATURE_CHARGE', tick: 50, pos: sharedPos });
    const snap = snapshot(w1);
    // Mutate original pos on host side; the serialized pos must be a defensive copy.
    sharedPos.x = 999;
    sharedPos.y = 999;
    const serialized = snap.effects?.[0];
    expect(serialized?.kind).toBe('CREATURE_CHARGE');
    if (serialized?.kind === 'CREATURE_CHARGE') {
      expect(serialized.pos).toEqual({ x: 100, y: 200 });
    }
    // Round-trip preserves the original snapshot values regardless.
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    const e = w2.effects[0];
    if (e.kind === 'CREATURE_CHARGE') {
      expect(e.pos).toEqual({ x: 100, y: 200 });
    }
  });

  it('round-trip preserves BOND_FORMED + BOND_SEVERED with cause discriminator', () => {
    const w1 = makeWorld(0);
    w1.effects.push(
      { kind: 'BOND_FORMED', tick: 50, pos: { x: 1, y: 2 }, bondCount: 3 },
      { kind: 'BOND_SEVERED', tick: 51, pos: { x: 4, y: 5 }, cause: 'physics' },
      { kind: 'BOND_SEVERED', tick: 52, pos: { x: 6, y: 7 }, cause: 'creature' },
    );
    const json = JSON.stringify(snapshot(w1));
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    expect(w2.effects.length).toBe(3);
    // Effects rehydrate in original order.
    expect(w2.effects[0].kind).toBe('BOND_FORMED');
    if (w2.effects[0].kind === 'BOND_FORMED') {
      expect(w2.effects[0].bondCount).toBe(3);
    }
    expect(w2.effects[1].kind).toBe('BOND_SEVERED');
    if (w2.effects[1].kind === 'BOND_SEVERED') {
      expect(w2.effects[1].cause).toBe('physics');
    }
    expect(w2.effects[2].kind).toBe('BOND_SEVERED');
    if (w2.effects[2].kind === 'BOND_SEVERED') {
      expect(w2.effects[2].cause).toBe('creature');
    }
  });

  it('Gemini Q-01 — effect.tick preserved across roundtrip for replay-deterministic age computation', () => {
    // Effects renderer computes age as `world.tick - effect.tick`. If snapshot
    // doesn't preserve emit-tick, client renders effects at age=0 starting
    // from whatever tick the snapshot arrived — losing k-tick latency window
    // (client sees shorter visual duration than host). Round-trip MUST keep
    // the host emit-tick so age math is deterministic regardless of snapshot
    // arrival timing.
    const HOST_EMIT_TICK = 1234;
    const w1 = makeWorld(0);
    w1.tick = 1240; // host is 6 ticks past emit (one 10Hz snapshot window)
    w1.effects.push({
      kind: 'ARC_FLASH',
      tick: HOST_EMIT_TICK,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    });
    const json = JSON.stringify(snapshot(w1));
    const w2 = makeWorld(0);
    restore(JSON.parse(json), w2);
    // After applying snapshot, world.tick === host snap tick. Effect retains
    // emit-tick, so client renderer computes age = world.tick - 1234 = 6,
    // matching host's render age at the same wall-clock moment.
    expect(w2.tick).toBe(1240);
    expect(w2.effects[0].tick).toBe(HOST_EMIT_TICK);
    expect(w2.tick - w2.effects[0].tick).toBe(6);
  });

  it('pre-S31 snapshot (no effects field) → restored world has empty effects (Δ3 back-compat)', () => {
    const w1 = makeWorld(0);
    placeChain(w1, 4); // populate primitives + bonds so restore has bodies to walk
    w1.effects.length = 0; // and ensure no effects emitted
    const json = JSON.stringify(snapshot(w1));
    const reparsed = JSON.parse(json);
    // Simulate pre-S31 wire payload: strip the `effects` key entirely.
    delete reparsed.effects;
    const w2 = makeWorld(0);
    // Pre-populate w2.effects to verify restore CLEARS them (replacement, not
    // append) — important so client doesn't accumulate stale effects from
    // dropped/replayed snapshots.
    w2.effects.push({ kind: 'BOND_FORMED', tick: 999, pos: { x: 0, y: 0 }, bondCount: 1 });
    restore(reparsed, w2);
    expect(w2.effects.length).toBe(0);
  });

  it('applySnapshotCore REPLACES (not appends) effects to prevent stale accumulation', () => {
    const w1 = makeWorld(0);
    w1.effects.push({ kind: 'ARC_FLASH', tick: 10, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
    const snap1 = JSON.parse(JSON.stringify(snapshot(w1)));

    const w2 = makeWorld(0);
    // Client has stale effect from a prior snapshot.
    w2.effects.push({ kind: 'ARC_FLASH', tick: 5, start: { x: 0, y: 0 }, end: { x: 99, y: 99 } });
    expect(w2.effects.length).toBe(1);
    restore(snap1, w2);
    expect(w2.effects.length).toBe(1);
    // Stale effect (tick=5) wiped; replaced with snap1's (tick=10).
    expect(w2.effects[0].tick).toBe(10);
  });
});

describe('Audit Pass 1 3c8630d7 — restore() resets audio drain cursor (Delta-4 carry-forward)', () => {
  it('post-restore, an effect at a previously-drained tick still fires audio', async () => {
    // Late import so test-suite collection order doesn't matter
    // (drainAudioEffects mutates module-level state).
    const audio = await import('../render/audioManager.ts');
    const w1 = makeWorld(0);
    w1.tick = 100;
    // Advance the audio cursor past tick 50 by draining at tick 100.
    audio.drainAudioEffects([], 100);
    const before = audio.inspectAudioChain().claveCallsTotal;
    // Now restore a saved state at tick 50. Without the fix, cursor stays at
    // 100 and a fresh BOND_FORMED at tick 50 would be silently dropped.
    const snap = snapshot(w1);
    snap.tick = 50;
    const w2 = makeWorld(0);
    restore(snap, w2);
    // After restore, the audio cursor should be reset so a tick-50 effect fires.
    audio.drainAudioEffects(
      [{ kind: 'BOND_FORMED', tick: 50, pos: { x: 0, y: 0 }, bondCount: 1 }],
      50,
    );
    const after = audio.inspectAudioChain().claveCallsTotal;
    expect(after - before).toBe(1);
  });
});

describe('S71 P1 — bomb snapshot round-trip', () => {
  it('roundtrips bombs via snapshot → JSON → restore (TTL preserved, id advanced)', () => {
    const w1 = makeWorld(1);
    w1.tick = 50;
    applySpawnBomb(w1, { type: 'SPAWN_BOMB', pos: { x: 300, y: 400 } });
    const snap = JSON.parse(JSON.stringify(snapshot(w1)));
    const w2 = makeWorld(2);
    restore(snap, w2);
    expect(w2.bombs.size).toBe(1);
    const bomb = [...w2.bombs.values()][0];
    expect(bomb.pos).toEqual({ x: 300, y: 400 });
    expect(bomb.dissipateAtTick).toBe(50 + BOMB_TTL_TICKS);
    expect(w2.nextBombId).toBe(1); // advanced past the max loaded id (no collide on next mint)
  });

  it('a pre-bomb snapshot (no bombs field) clears bombs on restore (back-compat)', () => {
    const w1 = makeWorld(1);
    const snap = snapshot(w1);
    expect(snap.bombs).toBeUndefined(); // no live bombs → field omitted (byte-identical wire)
    const w2 = makeWorld(2);
    applySpawnBomb(w2, { type: 'SPAWN_BOMB', pos: { x: 1, y: 1 } }); // stale bomb in w2
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.bombs.size).toBe(0); // restore replaced (cleared) the stale bomb
  });
});

describe('S72 P2 — hunter snapshot round-trip', () => {
  it('roundtrips hunters + hunterSpawned (render-trim; prevPos snaps to pos, id advanced)', () => {
    const w1 = makeWorld(1);
    w1.gameMode = '1v1';
    w1.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), 0x3bd7ff, { x: 900, y: 500 }));
    w1.scoreByPlayer.set(asPlayerId(1), 40);
    w1.tick = 300;
    applySpawnHunter(w1, { type: 'SPAWN_HUNTER' });
    const hid = [...w1.hunters.keys()][0];
    w1.hunters.get(hid)!.ticksInState = 12;
    const snap = JSON.parse(JSON.stringify(snapshot(w1)));
    const w2 = makeWorld(2);
    restore(snap, w2);
    expect(w2.hunters.size).toBe(1);
    expect(w2.hunterSpawned).toBe(true);
    expect(w2.nextHunterId).toBe(1); // advanced past max loaded id (no collide on next mint)
    const h = [...w2.hunters.values()][0];
    expect(h.state).toBe('SEEKING');
    expect(h.ticksInState).toBe(12);
    expect(h.targetPlayerId).toBe(asPlayerId(1));
    expect(h.prevPos).toEqual(h.pos); // render-trim: client snaps prevPos to pos
  });

  it('roundtrips a player benchedUntilTick (additive-optional)', () => {
    const w1 = makeWorld(1);
    w1.players.get(asPlayerId(0))!.benchedUntilTick = 4242;
    const w2 = makeWorld(2);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    expect(w2.players.get(asPlayerId(0))!.benchedUntilTick).toBe(4242);
  });

  it('pre-S72 snapshot (no hunters / hunterSpawned / bench) restores cleanly (back-compat)', () => {
    const w1 = makeWorld(1);
    const snap = snapshot(w1);
    expect(snap.hunters).toBeUndefined();
    expect(snap.hunterSpawned).toBeUndefined();
    expect(snap.players[0].benchedUntilTick).toBeUndefined();
    const w2 = makeWorld(2);
    applySpawnHunter(w2, { type: 'SPAWN_HUNTER' }); // stale hunter + flag in w2
    w2.players.get(asPlayerId(0))!.benchedUntilTick = 999;
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.hunters.size).toBe(0); // cleared
    expect(w2.hunterSpawned).toBe(false);
    expect(w2.players.get(asPlayerId(0))!.benchedUntilTick).toBeUndefined();
  });
});

describe('S72 P3 — potato snapshot round-trip', () => {
  it('roundtrips potatoes (detonateAtTick + state + carrierId preserved, id advanced)', () => {
    const w1 = makeWorld(1);
    w1.tick = 100;
    applySpawnPotato(w1, { type: 'SPAWN_POTATO', pos: { x: 700, y: 300 } });
    const po = [...w1.potatoes.values()][0];
    po.state = 'ARMED';
    const snap = JSON.parse(JSON.stringify(snapshot(w1)));
    const w2 = makeWorld(2);
    restore(snap, w2);
    expect(w2.potatoes.size).toBe(1);
    expect(w2.nextPotatoId).toBe(1); // advanced past the max loaded id
    const r = [...w2.potatoes.values()][0];
    expect(r.state).toBe('ARMED');
    expect(r.pos).toEqual({ x: 700, y: 300 });
    expect(r.carrierId).toBe(null);
    expect(r.detonateAtTick).toBe(po.detonateAtTick); // fuse fire-tick survives host save/load
    expect(r.prevPos).toEqual(r.pos); // render-trim: prevPos snaps to pos
  });

  it('roundtrips a player carriedPotatoId (additive-optional)', () => {
    const w1 = makeWorld(1);
    applySpawnPotato(w1, { type: 'SPAWN_POTATO', pos: { x: 500, y: 500 } });
    applyPickupPotato(w1, { type: 'PICKUP_POTATO', potatoId: asPotatoId(0), playerId: asPlayerId(0) });
    const w2 = makeWorld(2);
    restore(JSON.parse(JSON.stringify(snapshot(w1))), w2);
    expect(w2.players.get(asPlayerId(0))!.carriedPotatoId).toBe(asPotatoId(0));
  });

  it('pre-S72-P3 snapshot (no potatoes / carriedPotatoId) restores cleanly (back-compat)', () => {
    const w1 = makeWorld(1);
    const snap = snapshot(w1);
    expect(snap.potatoes).toBeUndefined();
    expect(snap.players[0].carriedPotatoId).toBeUndefined();
    const w2 = makeWorld(2);
    applySpawnPotato(w2, { type: 'SPAWN_POTATO', pos: { x: 1, y: 1 } }); // stale potato in w2
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.potatoes.size).toBe(0); // restore cleared it
  });
});

describe('S84 P2 — rainbowSwitchTick snapshot round-trip', () => {
  it('roundtrips the switch tick via snapshot → JSON → restore (flyover window resumes)', () => {
    const w1 = makeWorld(1);
    w1.tick = 500;
    w1.rainbowSwitchTick = 460; // mid-window
    const snap = JSON.parse(JSON.stringify(snapshot(w1)));
    const w2 = makeWorld(2);
    restore(snap, w2);
    expect(w2.rainbowSwitchTick).toBe(460);
  });

  it('omits the field when unset (byte-identical pre-S84 wire) and clears stale local state', () => {
    const w1 = makeWorld(1);
    const snap = snapshot(w1);
    expect(snap.rainbowSwitchTick).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain('rainbowSwitchTick'); // truly absent on the wire
    const w2 = makeWorld(2);
    w2.rainbowSwitchTick = 123; // stale local window (e.g. host tore the match down)
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.rainbowSwitchTick).toBeUndefined(); // plain-assign clears it
  });
});

describe('S88 G3a — combo discovery snapshot round-trip', () => {
  it('round-trips discoveredCombos (SORTED) + comboToastTick + names via snapshot → JSON → restore', () => {
    const w1 = makeWorld(1);
    w1.tick = 500;
    // insert out of alphabetical order to prove the wire form is sorted (PRIME-AUDIT R2).
    const set = w1.discoveredCombos as unknown as Set<string>;
    set.add('Line->Line');
    set.add('Dot->Line');
    w1.comboToastTick = 470;
    w1.lastDiscoveredComboNames = ['Cable'];

    const snap = JSON.parse(JSON.stringify(snapshot(w1)));
    expect(snap.discoveredCombos).toEqual(['Dot->Line', 'Line->Line']); // sorted, canonical

    const w2 = makeWorld(2);
    restore(snap, w2);
    expect([...(w2.discoveredCombos as unknown as Set<string>)].sort()).toEqual([
      'Dot->Line',
      'Line->Line',
    ]);
    expect(w2.comboToastTick).toBe(470);
    expect(w2.lastDiscoveredComboNames).toEqual(['Cable']);
  });

  it('omits the keys with no discoveries (byte-identical pre-S88 wire) + a keyless snapshot decodes + clears stale local state', () => {
    const w1 = makeWorld(1);
    const snap = snapshot(w1);
    expect(snap.discoveredCombos).toBeUndefined();
    expect(snap.comboToastTick).toBeUndefined();
    expect(snap.lastDiscoveredComboNames).toBeUndefined();
    const s = JSON.stringify(snap);
    expect(s).not.toContain('discoveredCombos');
    expect(s).not.toContain('comboToastTick');

    // a pre-S88-shaped snapshot (no discovery keys) still decodes AND clears stale local state.
    const w2 = makeWorld(2);
    (w2.discoveredCombos as unknown as Set<string>).add('Dot->Line'); // stale
    w2.comboToastTick = 99;
    w2.lastDiscoveredComboNames = ['Filament'];
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.discoveredCombos.size).toBe(0);
    expect(w2.comboToastTick).toBeUndefined();
    expect(w2.lastDiscoveredComboNames).toBeUndefined();
  });
});

describe('save — S97 P5 godlyFiredThisMatch round-trip', () => {
  it('omits the field when empty, round-trips a fired type (sorted), restores it', () => {
    const w1 = makeWorld(7);
    expect(snapshot(w1).godlyFiredThisMatch).toBeUndefined(); // empty → omitted (byte-stable wire)
    w1.godlyFiredThisMatch.add('voltkin');
    const snap = snapshot(w1);
    expect(snap.godlyFiredThisMatch).toEqual(['voltkin']);
    const w2 = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snap)), w2);
    expect(w2.godlyFiredThisMatch.has('voltkin')).toBe(true); // a save/migration host won't re-fire it
  });

  it('restoring a pre-S97 payload (no field) clears the set, never crashes', () => {
    const w2 = makeWorld(0);
    w2.godlyFiredThisMatch.add('voltkin');
    const legacy = snapshot(makeWorld(0)); // empty world → no godlyFiredThisMatch on the wire
    restore(JSON.parse(JSON.stringify(legacy)), w2);
    expect(w2.godlyFiredThisMatch.size).toBe(0);
  });
});
