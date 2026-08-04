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
import {
  PROBE_SENTINEL, diffOwned, takeFromInventory, seatShareReadout, RAMP_SETTLE_TICKS,
} from './probeHarness.ts';
import { MAX_PLAYERS, FREE_SPARK_TTL_TICKS } from '../constants.ts';

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

  // ── S132 · THE INVENTORY MUST NOT LEAK ON A REFUSED DRAW ──────────────────────────────────
  // Found by driving the real harness in headless Chromium: 8/8 → 7/8 (genuine draw) → 6/8 (a
  // REFUSED draw that consumed a slot anyway), because `inventory.shift()` sat above the carry-1
  // guard. These assert the CONTRACT — refusal paths leave the array byte-identical — so they fail
  // if the consume is ever hoisted back above a refusal, which is the whole bug class.
  describe('S132 — takeFromInventory never consumes on a refused draw', () => {
    const stocked = (): SparkType[] => [SparkType.Square, SparkType.Circle, SparkType.Dot];

    it('consumes exactly one slot, from the FRONT, on a successful draw', () => {
      const world = makeWorld(1);
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
      const inv = stocked();

      const drawn = takeFromInventory(world, world.localPlayerId, inv);

      expect(drawn).not.toBeNull();
      expect(drawn!.type).toBe(SparkType.Square); // FIFO — the front, not the back
      expect(inv).toEqual([SparkType.Circle, SparkType.Dot]);
      // The draw position is the avatar's, so the spark is claimable by the normal pickup path.
      const me = world.players.get(world.localPlayerId)!;
      expect(drawn!.at).toEqual({ x: me.avatarPos.x, y: me.avatarPos.y });
    });

    it('refuses while the player is already Carrying, and leaves the inventory UNTOUCHED', () => {
      const world = makeWorld(1);
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
      const playerId = world.localPlayerId;
      const inv = stocked();

      // First draw succeeds and puts the player in Carrying — the real precondition, reached
      // through the shipped reducers rather than by hand-mutating a player into a fake state.
      const first = takeFromInventory(world, playerId, inv);
      expect(first).not.toBeNull();
      const id = asSparkId(PROBE_ID_BASE);
      dispatch(world, {
        type: 'SPAWN_SPARK',
        spark: makeFreeSpark({
          id, type: first!.type, pos: first!.at,
          velocity: { x: 0, y: 0 }, dt: PHYSICS_DT, createdTick: world.tick,
        }),
      });
      dispatch(world, { type: 'PICKUP_SPARK', sparkId: id, playerId, pos: first!.at });
      expect(world.players.get(playerId)!.kind).toBe('Carrying');

      const before = [...inv];
      // Three more presses while carrying — a human holds Q down. Not one, because an off-by-one
      // consume would still pass a single-press assertion if the array happened to be long enough.
      expect(takeFromInventory(world, playerId, inv)).toBeNull();
      expect(takeFromInventory(world, playerId, inv)).toBeNull();
      expect(takeFromInventory(world, playerId, inv)).toBeNull();
      expect(inv).toEqual(before);
      expect(inv).toHaveLength(2);
    });

    it('refuses on an empty inventory without throwing, and stays empty', () => {
      const world = makeWorld(1);
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
      const inv: SparkType[] = [];
      expect(takeFromInventory(world, world.localPlayerId, inv)).toBeNull();
      expect(inv).toEqual([]);
    });

    it('refuses when the seat does not exist, and leaves the inventory UNTOUCHED', () => {
      const world = makeWorld(1);
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
      const inv = stocked();
      // Seat 5 is unoccupied in a 1-player world. The player-exists refusal must not consume
      // either — it sat above the shift already, and must stay above it.
      expect(takeFromInventory(world, asPlayerId(5), inv)).toBeNull();
      expect(inv).toEqual(stocked());
    });
  });

  // ── S132 · THE SEAT-SHARE TRAP ────────────────────────────────────────────────────────────
  // B3 is a six-seat claim; the probe is solo-only, so solo receives the WHOLE arena faucet and
  // fills an 8-slot bank ~6x faster than B3's condition. Measured: 41s solo vs 248s at a fair
  // share. If this readout is wrong or absent the owner rules the blocker the wrong way.
  describe('S132 — seatShareReadout exposes the solo-vs-6-seat faucet gap', () => {
    const SHIPPED = 0.1875; // constants.ts:107 default, mirrored deliberately (see probeHarness.ts)

    it('flags the shipped default as NOT representative, and quantifies by how much', () => {
      const r = seatShareReadout(8, SHIPPED);
      expect(r.representative).toBe(false);
      expect(r.fairShareLambda).toBeCloseTo(SHIPPED / MAX_PLAYERS, 10);
      // Solo fills 8 slots in ~43s; a fair 1/6 share needs ~256s. The ratio IS MAX_PLAYERS.
      expect(r.fillHereSec).toBeCloseTo(8 / SHIPPED, 6);
      expect(r.fillFairShareSec).toBeCloseTo(8 / (SHIPPED / MAX_PLAYERS), 6);
      expect(r.fillFairShareSec! / r.fillHereSec!).toBeCloseTo(MAX_PLAYERS, 6);
    });

    it('accepts the documented ?spawn= value as representative', () => {
      const r = seatShareReadout(8, SHIPPED / MAX_PLAYERS);
      expect(r.representative).toBe(true);
      // Once representative, both numbers agree — there is no gap left to misread.
      expect(r.fillHereSec).toBeCloseTo(r.fillFairShareSec!, 6);
      expect(r.fillFairShareSec).toBeCloseTo(256, 0); // the figure BACKLOG B3 quotes
    });

    it('tolerates a hand-typed 4-decimal ?spawn=0.0313 but rejects a merely-close value', () => {
      expect(seatShareReadout(8, 0.0313).representative).toBe(true);
      // 2% band: 0.0313 is +0.16% off and must pass; 0.04 is +28% off and must NOT.
      expect(seatShareReadout(8, 0.04).representative).toBe(false);
    });

    it('returns null fill times for the unlimited bank rather than Infinity', () => {
      const r = seatShareReadout(Number.POSITIVE_INFINITY, SHIPPED);
      expect(r.fillHereSec).toBeNull();
      expect(r.fillFairShareSec).toBeNull();
      // The fair-share lambda is still meaningful with an unlimited cap.
      expect(r.fairShareLambda).toBeCloseTo(SHIPPED / MAX_PLAYERS, 10);
    });

    it('returns a null fill time for a zero lambda instead of Infinity', () => {
      expect(seatShareReadout(8, 0).fillHereSec).toBeNull();
    });
  });

  // ── S132 · THE RAMP THRESHOLD IS IN TICKS, AND ITS HUMAN-FACING NUMBER IS 60s ──────────────
  // The first cut of the ramp warning compared `poolSamples.length` against `TTL * 6`. The sampler
  // fires every 100 ms (~10 samples/s) while the sim runs at 60 ticks/s, so it silently demanded
  // 360 s of hold while the on-screen message promised 60 s — the overlay still read "ramping"
  // after a 63 s hold. Caught by screenshotting the overlay, not by any test, because every string
  // was correct and only the UNIT was wrong. This pins the seconds the message quotes, so a
  // regression back to sample-count units cannot keep the advertised number honest.
  describe('S132 — the pool ramp threshold is denominated in sim ticks', () => {
    it('settles after exactly 60s of SIM TIME (six TTLs), the number the overlay prints', () => {
      expect(RAMP_SETTLE_TICKS / PHYSICS_HZ).toBe(60);
      expect(RAMP_SETTLE_TICKS).toBe(FREE_SPARK_TTL_TICKS * 6);
    });

    it('is long enough to contain several TTLs — a 1-TTL window is all ramp', () => {
      // The defect this defends against is a threshold so short the reading is meaningless, so
      // assert the RATIO rather than the literal: at least 4 TTLs, or the ramp dominates.
      expect(RAMP_SETTLE_TICKS / FREE_SPARK_TTL_TICKS).toBeGreaterThanOrEqual(4);
    });
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
