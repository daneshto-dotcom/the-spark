/**
 * SPARK — full game-loop integration test.
 * Mirrors main.ts stepPhysics() — runs spawner + Verlet + bonds + bounds +
 * collision for 60 simulated seconds and asserts the Session-1 exit gate:
 *   - No NaN in positions
 *   - Every spark stays inside the spawner disk
 *   - All 6 SparkTypes appear
 *   - At least 60 sparks accumulate (≈ 90 expected at 1.5/sec × 60s)
 *   - Median per-tick physics time stays well under 5.5 ms in node
 *     (real-browser timing differs; this is a sanity floor, not the
 *     exit-gate budget — the dev overlay measures the real budget).
 *
 * Note: this test overrides the spawner rate to 1.5/sec (instead of the
 * S5-dropped playability default 0.15/sec) — its purpose is to stress the
 * physics loop under spawn pressure, not to re-verify the rate constant.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import type { Spark } from '../game/spark.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner, enforceSpawnerBounds } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { resolveCollisions } from './collision.ts';
import { solveBonds } from './bonds.ts';
import type { Bond } from './bonds.ts';
import { SpatialGrid } from './spatial.ts';
import { verletStepAll } from './verlet.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
const SPATIAL_CELL_SIZE = 32;

describe('Session-1 exit gate (60s integration)', () => {
  it('runs the full physics loop for 60s with stable, in-bounds, type-diverse sparks', () => {
    const sparks: Spark[] = [];
    const bonds: Bond[] = []; // no bonds yet in Session 1
    const rng = mulberry32(0xc0ffee);
    // Stress-rate (1.5/sec) — see file header.
    const spawner = new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: 1.5 }, rng);
    const grid = new SpatialGrid(SPATIAL_CELL_SIZE);

    const TICKS = 60 * PHYSICS_HZ;
    const tickTimes: number[] = [];

    for (let tick = 0; tick < TICKS; tick++) {
      const t0 = performance.now();
      spawner.tick(PHYSICS_DT, tick, sparks);
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        verletStepAll(sparks, SUBSTEP_DT);
        if (bonds.length > 0) solveBonds(bonds);
        enforceSpawnerBounds(sparks);
        resolveCollisions(sparks, grid);
      }
      tickTimes.push(performance.now() - t0);
    }

    // No NaN.
    for (const s of sparks) {
      expect(Number.isFinite(s.pos.x)).toBe(true);
      expect(Number.isFinite(s.pos.y)).toBe(true);
    }

    // All in-bounds (allow tiny tolerance for floating point at the rim).
    for (const s of sparks) {
      const d = Math.hypot(s.pos.x - SPAWNER_CENTER_X, s.pos.y - SPAWNER_CENTER_Y);
      expect(d).toBeLessThanOrEqual(SPAWNER_RADIUS + 0.5);
    }

    // Type diversity: all 6 types observed.
    const types = new Set(sparks.map((s) => s.type));
    for (const t of ALL_SPARK_TYPES) expect(types.has(t)).toBe(true);

    // Spawn count near expectation.
    expect(sparks.length).toBeGreaterThan(60);
    expect(sparks.length).toBeLessThan(120);

    // Per-tick time floor (sanity — Node, not browser).
    tickTimes.sort((a, b) => a - b);
    const median = tickTimes[Math.floor(tickTimes.length / 2)];
    expect(median).toBeLessThan(5.5);
  }, 30_000);
});
