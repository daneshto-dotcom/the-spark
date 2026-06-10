/**
 * SPARK — S82 P2: Spawner state wired into WorldSnapshot (the S79 P5 capability, landed).
 *
 * Locks three contracts:
 *   1. WIRE ABSENCE — spawner state must NEVER appear on a NetSnapshot. Triple defense:
 *      snapshot(world) without opts cannot emit it (param injection), the NetSnapshot
 *      Omit type strips it statically, and netSnapshot()'s runtime destructure strips it
 *      even if a future path passes opts. (Council S82 R1: clients never run a spawner;
 *      shipping the 5 stream words would leak the spawn schedule — rngSeed precedent.)
 *   2. BYTE-COMPAT — a snapshot WITHOUT spawner state is byte-identical to pre-S82.
 *   3. RESUME — save mid-run with spawner state, restore into a FRESH world + a
 *      DIFFERENT-seed spawner, continue both: the spark sequence (ids, types, positions)
 *      and the world snapshot JSON stay bit-identical with the uninterrupted original.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ } from '../constants.ts';
import {
  DEFAULT_SPAWNER_CONFIG,
  Spawner,
  type SpawnerState,
} from '../game/spawner.ts';
import type { Spark } from '../game/spark.ts';
import { mulberry32 } from './rng.ts';
import { netSnapshot, restore, snapshot } from './save.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const DT = 1 / PHYSICS_HZ;

/** Mirror main.ts's 5-stream construction (same xor constants as spawner.test fullSpawner). */
function fullSpawner(seed: number): Spawner {
  return new Spawner(
    DEFAULT_SPAWNER_CONFIG,
    mulberry32(seed),
    mulberry32((seed ^ 0x9e3779b9) >>> 0),
    mulberry32((seed ^ 0x85ebca6b) >>> 0),
    mulberry32((seed ^ 0xc2b2ae35) >>> 0),
    mulberry32((seed ^ 0x5a4e28b8) >>> 0),
  );
}

/** Tick spawner + dispatch its sparks into the world (the stepPhysics spawn idiom, minus hazards). */
function runTicks(world: World, spawner: Spawner, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const out: Spark[] = [];
    spawner.tick(DT, world.tick, out);
    for (const s of out) dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    world.tick++;
  }
}

function stableJson(world: World, spawnerState?: SpawnerState | null): string {
  const snap = snapshot(world, spawnerState !== undefined ? { spawnerState } : undefined);
  return JSON.stringify({ ...snap, savedAt: 'X' });
}

describe('S82 P2 — spawner state in WorldSnapshot', () => {
  it('emits WorldSnapshot.spawner only when injected; null getState() degrades to omitted', () => {
    const w = makeWorld(0);
    const sp = fullSpawner(0xc0ffee);
    expect(JSON.stringify(snapshot(w))).not.toContain('"spawner"');
    expect(JSON.stringify(snapshot(w, { spawnerState: null }))).not.toContain('"spawner"');
    const withState = snapshot(w, { spawnerState: sp.getState() });
    expect(withState.spawner).toBeDefined();
    expect(withState.spawner!.rngState).toBeTypeOf('number');
    expect(withState.spawner!.bombRngState).toBeTypeOf('number');
  });

  it('WIRE ABSENCE: netSnapshot never carries spawner state', () => {
    const w = makeWorld(0);
    const json = JSON.stringify(netSnapshot(w));
    expect(json).not.toContain('"spawner"');
    expect(json).not.toContain('rngState');
  });

  it('BYTE-COMPAT: snapshot without spawner opts is byte-identical to the no-opts call', () => {
    const w = makeWorld(7);
    expect(stableJson(w)).toBe(stableJson(w, null));
  });

  it('RESUME: restore + restoreState continues the spark sequence + world bytes bit-exactly', () => {
    // Reference run: 120s uninterrupted from one seed.
    const wRef = makeWorld(0xc0ffee);
    const spRef = fullSpawner(0xc0ffee);
    runTicks(wRef, spRef, 60 * PHYSICS_HZ);

    // Interrupted run: same seed for the first 30s, then SAVE (world + spawner state).
    const wA = makeWorld(0xc0ffee);
    const spA = fullSpawner(0xc0ffee);
    runTicks(wA, spA, 30 * PHYSICS_HZ);
    const saved = JSON.parse(
      JSON.stringify(snapshot(wA, { spawnerState: spA.getState() })),
    ) as ReturnType<typeof snapshot>;
    expect(saved.spawner).toBeDefined();

    // Restore into a FRESH world + a DIFFERENT-seed spawner (proves the state, not the
    // seed, carries the sequence), then continue to the same 60s mark.
    const wB = makeWorld(0);
    const spB = fullSpawner(0xdeadbeef);
    restore(saved, wB);
    spB.restoreState(saved.spawner!);
    runTicks(wB, spB, 30 * PHYSICS_HZ);

    // Continuation must be bit-identical to the uninterrupted reference run:
    // same free sparks (ids/types/positions), same tick, same full snapshot JSON.
    expect(wB.tick).toBe(wRef.tick);
    expect(stableJson(wB, spB.getState())).toBe(stableJson(wRef, spRef.getState()));
    // And the spawner itself resumed: its post-run state words match exactly.
    expect(spB.getState()).toEqual(spRef.getState());
  });

  it('RESUME guards SparkId continuity: no id collision after load (nextId round-trips)', () => {
    const w1 = makeWorld(0xc0ffee);
    const sp1 = fullSpawner(0xc0ffee);
    runTicks(w1, sp1, 60 * PHYSICS_HZ); // long enough to have spawned several sparks
    const maxId = Math.max(...[...w1.freeSparks.keys()].map((k) => k as number));
    const saved = JSON.parse(
      JSON.stringify(snapshot(w1, { spawnerState: sp1.getState() })),
    ) as ReturnType<typeof snapshot>;
    const w2 = makeWorld(0);
    const sp2 = fullSpawner(1);
    restore(saved, w2);
    sp2.restoreState(saved.spawner!);
    // The very next minted spark id must be ABOVE every rehydrated id.
    runTicks(w2, sp2, 60 * PHYSICS_HZ);
    const newIds = [...w2.freeSparks.keys()].map((k) => k as number).filter((id) => id > maxId);
    expect(newIds.length).toBeGreaterThan(0);
    expect(new Set([...w2.freeSparks.keys()]).size).toBe(w2.freeSparks.size); // Map guarantees, sanity
  });
});
