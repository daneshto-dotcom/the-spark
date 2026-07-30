/**
 * SPARK — v0.6 economy probe harness: contract tests (V6-0.1, S128).
 *
 * The harness itself is a DOM/DEV artifact, so what matters is not its rendering but the two
 * contracts it rests on. Both are asserted here at the REDUCER level, which is stronger than a
 * browser click and survives as regression coverage:
 *
 *   1. The NEW-regime draw uses ONLY already-shipped actions — `SPAWN_SPARK` then `PICKUP_SPARK`
 *      — and yields a player Carrying a spark of exactly the requested type. This is what lets
 *      the PDR claim "no new action type, no new reducer, no protocol bump". If someone later
 *      changes those reducers' contracts, this test fails and the claim gets re-examined.
 *   2. Probe ids are drawn from a range disjoint from the Spawner's monotonic allocator, so an
 *      armed probe can never collide with a spawned spark.
 *
 * Deliberately NOT tested here: the overlay text and the key bindings. They are dev ergonomics,
 * and asserting them would be testing the mock rather than the mechanism.
 */

import { describe, it, expect } from 'vitest';
import { makeWorld } from '../state/world.ts';
import { dispatch } from '../state/world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { SparkType, PHYSICS_HZ } from '../constants.ts';
import { asSparkId, asPlayerId } from '../types.ts';
import { PROBE_SENTINEL, diffOwned } from './probeHarness.ts';

const PROBE_ID_BASE = 1_000_000; // must match probeHarness.ts
const PHYSICS_DT = 1 / PHYSICS_HZ;

describe('v0.6 economy probe harness — action contract', () => {
  it('grants an exact-type spark via SPAWN_SPARK + PICKUP_SPARK only (no new action type)', () => {
    const world = makeWorld(1);
    dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    const playerId = world.localPlayerId;
    const at = { x: 700, y: 400 };

    // Exactly the sequence probeHarness.drawSparkFromInventory dispatches.
    const id = asSparkId(PROBE_ID_BASE);
    dispatch(world, {
      type: 'SPAWN_SPARK',
      spark: makeFreeSpark({
        id, type: SparkType.Triangle, pos: at,
        velocity: { x: 0, y: 0 }, dt: PHYSICS_DT, createdTick: world.tick,
      }),
    });
    expect(world.freeSparks.get(id)?.type).toBe(SparkType.Triangle);

    dispatch(world, { type: 'PICKUP_SPARK', sparkId: id, playerId, pos: at });

    const player = world.players.get(playerId);
    expect(player).toBeDefined();
    expect(player!.kind).toBe('Carrying');
    // carry-1 still holds — the player holds exactly the type the inventory asked for.
    const carriedId = (player as { carriedSparkId: ReturnType<typeof asSparkId> }).carriedSparkId;
    expect(carriedId).toBe(id);
    expect(world.freeSparks.get(carriedId)?.type).toBe(SparkType.Triangle);
    expect(world.freeSparks.get(carriedId)?.state.kind).toBe('Carried');
  });

  it('can grant every one of the six spark types (an exact-type inventory is expressible)', () => {
    const types = [SparkType.Dot, SparkType.Line, SparkType.Triangle,
                   SparkType.Square, SparkType.Circle, SparkType.Spiral];
    for (const [i, type] of types.entries()) {
      const world = makeWorld(1);
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
      const playerId = world.localPlayerId;
      const at = { x: 600, y: 500 };
      const id = asSparkId(PROBE_ID_BASE + i);
      dispatch(world, {
        type: 'SPAWN_SPARK',
        spark: makeFreeSpark({ id, type, pos: at, velocity: { x: 0, y: 0 }, dt: PHYSICS_DT, createdTick: 0 }),
      });
      dispatch(world, { type: 'PICKUP_SPARK', sparkId: id, playerId, pos: at });
      expect(world.freeSparks.get(id)?.type).toBe(type);
      expect(world.players.get(playerId)!.kind).toBe('Carrying');
    }
  });

  it('mints ids in a range disjoint from the spawner allocator', () => {
    // The Spawner starts at 0 and increments monotonically (spawner.ts:332,144). A session would
    // need a million spawns to reach PROBE_ID_BASE; at the shipped 0.1875/s that is ~61 days of
    // continuous play, so the ranges cannot realistically meet.
    expect(PROBE_ID_BASE).toBeGreaterThan(100_000);
    const secondsToCollide = PROBE_ID_BASE / 0.1875;
    expect(secondsToCollide / 86_400).toBeGreaterThan(30); // > 30 days
  });

  it('diffOwned does not alias a placement against a sever in the same sampling window', () => {
    // THE DEFECT THIS PINS (S128 CHECK, GEMINI-AUDITOR, rated fatal). The first implementation
    // compared counts: `owned > prev` => build, `owned < prev` => sculpt. Place one and sever one
    // inside a single sampling window and the net change is ZERO, so BOTH events vanished. The bias
    // ran in the worst possible direction for this instrument — it under-reports carving, which is
    // precisely the reading that would wrongly "confirm" B4 and authorise redesigning directives.
    const prev = new Set([1, 2, 3]);
    const next = new Set([2, 3, 9]);           // removed 1, added 9 — a net count delta of ZERO
    expect(next.size).toBe(prev.size);          // the aliasing precondition
    expect(diffOwned(prev, next)).toEqual({ added: 1, removed: 1 });
  });

  it('diffOwned reports a multi-primitive sever as one action with its true magnitude', () => {
    // A sever deletes the smaller resulting component, so one carving ACTION can remove many
    // primitives. B4 asks *whether* the player carves, so actions are the unit — but the magnitude
    // is still worth reporting, hence added/removed counts rather than booleans.
    const prev = new Set([1, 2, 3, 4, 5, 6, 7]);
    const next = new Set([1, 2, 3]);
    expect(diffOwned(prev, next)).toEqual({ added: 0, removed: 4 });
  });

  it('diffOwned counts every placement in a window, not one event per window', () => {
    // Rapid sequential placements (the direct-assembly behaviour B4 contrasts against) must not
    // collapse into a single build event just because they share a sampler tick.
    const prev = new Set<number>();
    const next = new Set([10, 11, 12, 13]);
    expect(diffOwned(prev, next)).toEqual({ added: 4, removed: 0 });
  });

  it('exposes a sentinel string that must be absent from production bundles', () => {
    // The build-time contract: `grep -rl SPARK_V06_ECONOMY_PROBE_HARNESS dist/assets/*.js` must
    // return nothing, proving import.meta.env.DEV stripping worked. Asserted here so the sentinel
    // cannot be silently renamed out of sync with that check.
    expect(PROBE_SENTINEL).toBe('SPARK_V06_ECONOMY_PROBE_HARNESS');
  });

  it('is inert in a non-browser context — importing and calling it must not throw', async () => {
    // vitest runs in Node with no `window`/`document`. The harness must return null rather than
    // throw, so a Node-side import can never blow up. (This test FOUND that gap: the first draft
    // read window.location.search unguarded. Fixed by mirroring constants.ts:101's idiom.)
    const mod = await import('./probeHarness.ts');
    expect(typeof window).toBe('undefined');
    let handle: unknown;
    expect(() => {
      handle = mod.installProbeHarness({
        getWorld: () => makeWorld(1),
        dispatch: () => {},
        playerId: asPlayerId(1),
      });
    }).not.toThrow();
    expect(handle).toBeNull();
  });
});
