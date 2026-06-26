/**
 * SPARK — stress test: 30-primitive structure + heavy spawn over simulated
 * time. Pinch-points: bond solver stability, immobility guard
 * correctness, soft-cap behavior, NaN/Infinity drift detection.
 *
 * Default sim length is 60 seconds (3600 ticks @ 60Hz) to keep CI fast.
 * The 10-minute version (LOCKED_DECISIONS § 5 done-gate target) is gated
 * by STRESS_FULL=1 — run with `STRESS_FULL=1 npm test -- stress` to
 * exercise the full duration.
 */

import { describe, expect, it } from 'vitest';
import {
  FREE_SPARK_SOFT_CAP,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { snapshotInvariants, verifyInvariants } from '../game/invariants.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG, enforceSpawnerBounds } from '../game/spawner.ts';
import { resolveCollisions } from './collision.ts';
import { solveBonds } from './bonds.ts';
import { SpatialGrid } from './spatial.ts';
import { verletStepAll } from './verlet.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
// Vitest exposes `import.meta.env`; for the stress-full opt-in we sniff the
// global env without depending on @types/node.
const FULL_RUN =
  (typeof globalThis !== 'undefined' &&
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.STRESS_FULL === '1') ||
  false;
const SECONDS = FULL_RUN ? 600 : 60;
const TICKS = SECONDS * PHYSICS_HZ;

describe('stress', () => {
  it(`physics survives ${SECONDS}s with 30-prim structure + heavy spawn`, () => {
    const SEED = 0xfacefeed;
    const world = makeWorld(SEED);
    const rng = mulberry32(SEED);
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, rng);
    const grid = new SpatialGrid(32);
    const P1 = asPlayerId(0);

    // Build a 30-primitive chain anchored near center, spaced 50 px apart
    // (matches the typical bond restLength → starts at near-zero strain).
    buildChain(world, P1, 30);
    expect(world.primitives.size).toBe(30);
    expect(world.bonds.size).toBe(29);

    let invariantSnap = snapshotInvariants(world.primitives);
    let nanFound = false;
    let immobilityHits = 0;
    let maxFreeSparks = 0;
    const tickMs: number[] = [];

    for (let t = 0; t < TICKS; t++) {
      const tickStart = performance.now();

      // Spawn — let the Poisson spawner do its thing.
      const spawned: Spark[] = [];
      spawner.tick(PHYSICS_DT, world.tick, spawned);
      for (const s of spawned) dispatch(world, { type: 'SPAWN_SPARK', spark: s });

      // Soft-cap enforcement.
      enforceFreeSparkCap(world);

      let freeCount = 0;
      for (const s of world.freeSparks.values()) if (s.state.kind === 'Free') freeCount++;
      if (freeCount > maxFreeSparks) maxFreeSparks = freeCount;

      // Energy ticks (the world wants them for FSM bookkeeping).
      for (const player of world.players.values()) {
        dispatch(world, { type: 'TICK_ENERGY', playerId: player.id, deltaSec: PHYSICS_DT });
      }

      // Physics — same substep loop the main app uses.
      const sparkArr = Array.from(world.freeSparks.values());
      let bondArr = Array.from(world.bonds.values());
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        verletStepAll(sparkArr, SUBSTEP_DT);
        if (bondArr.length > 0) {
          const broken = solveBonds(bondArr);
          if (broken.length > 0) {
            for (const bondId of broken) {
              if (world.bonds.has(bondId)) dispatch(world, { type: 'SEVER_BOND', bondId, playerId: asPlayerId(0), cause: 'physics' });
            }
            bondArr = Array.from(world.bonds.values());
          }
        }
        enforceSpawnerBounds(sparkArr);
        resolveCollisions(sparkArr, grid);
      }
      world.tick++;

      // Invariant verification — every tick.
      const violations = verifyInvariants(world.primitives, world.freeSparks, invariantSnap);
      for (const v of violations) {
        if (v.kind === 'nonfinite-primitive' || v.kind === 'nonfinite-spark') nanFound = true;
        if (v.kind === 'immobility') immobilityHits++;
      }
      invariantSnap = snapshotInvariants(world.primitives);

      tickMs.push(performance.now() - tickStart);
    }

    expect(nanFound, 'no NaN/Infinity in any position').toBe(false);
    expect(immobilityHits, 'no immobility violations').toBe(0);
    // Soft-cap holds (at most one tick of overshoot allowed because of
    // the spawn → cap-enforce ordering).
    expect(maxFreeSparks, `free-spark count stayed at or below cap (saw ${maxFreeSparks})`)
      .toBeLessThanOrEqual(FREE_SPARK_SOFT_CAP + 1);
    // Sanity: tick budget. Stress test runs without rendering, so a
    // physics-only tick should be well under one frame. Assert on the p95
    // (NOT the single worst tick) so a transient GC/OS-scheduler spike — which
    // is machine-variant noise, not a regression — can't flake the gate
    // (a lone 51ms outlier on a loaded CI box used to fail the old max<50ms
    // assertion). p95<50ms still catches a SYSTEMIC slowdown (if 5%+ of ticks
    // blow the frame budget, something is genuinely wrong). The catastrophic
    // ceiling is the real-pathology canary: a runaway O(n²)/NaN cascade is
    // seconds-per-tick, not tens of ms — and a sustained one also trips the
    // test's own 60s timeout.
    tickMs.sort((a, b) => a - b);
    const p95 = tickMs[Math.floor(tickMs.length * 0.95)];
    const worstTick = tickMs[tickMs.length - 1];
    expect(p95, `p95 tick ${p95.toFixed(2)}ms (worst ${worstTick.toFixed(2)}ms)`).toBeLessThan(50);
    expect(worstTick, `no catastrophic single tick (${worstTick.toFixed(2)}ms)`).toBeLessThan(1000);
  }, FULL_RUN ? 300_000 : 60_000);
});

function buildChain(world: ReturnType<typeof makeWorld>, playerId: ReturnType<typeof asPlayerId>, n: number): void {
  const cy = SPAWNER_CENTER_Y;
  // Chain anchored 20 px outside the spawner ring and extends leftward, so
  // every placement is in valid build space (§ IX.5 v0.5.1 blocks in-zone
  // placement). 30 px spacing keeps the 30-prim chain on canvas.
  const startX = SPAWNER_CENTER_X - 270;
  for (let i = 0; i < n; i++) {
    const sparkId = asSparkId(10_000 + i);
    const spark = makeFreeSpark({
      id: sparkId,
      type: ((i % 6) as SparkType),
      pos: { x: startX - i * 30, y: cy },
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId, pos: { x: spark.pos.x, y: spark.pos.y } });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId,
      targetPrimitiveId: i === 0 ? null : asPrimitiveId(i - 1),
      stiffnessTier: 'MID',
    });
  }
}

function enforceFreeSparkCap(world: ReturnType<typeof makeWorld>): void {
  let freeCount = 0;
  for (const s of world.freeSparks.values()) if (s.state.kind === 'Free') freeCount++;
  if (freeCount <= FREE_SPARK_SOFT_CAP) return;
  const candidates = [];
  for (const s of world.freeSparks.values()) if (s.state.kind === 'Free') candidates.push(s);
  candidates.sort((a, b) => a.createdTick - b.createdTick);
  const excess = freeCount - FREE_SPARK_SOFT_CAP;
  for (let i = 0; i < excess; i++) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
  }
}
