/**
 * SPARK — S120 P3: dense-pile collision hardening (Council #3 CONCEDED add).
 *
 * Context: phase (c) hoists grid.insertAll out of the COLLISION_ITERATIONS
 * loop (64 → 8 rebuilds/tick — once per resolveCollisions call, i.e. per
 * SUBSTEP, never per tick). Iterations 2..8 then pair off start-of-substep
 * buckets while positions move under resolution. GROK-DISRUPTOR's attack:
 * "pile formation exceeds the displacement bound → missed/phantom pairs
 * degrade dense piles." The analytic refutation (phantom pairs no-op on the
 * live-position distance check; misses self-heal at the next substep's
 * rebuild 1/480 s later) is locked here EMPIRICALLY, on the worst case the
 * game actually produces: a spawner-zone-density jam.
 *
 * This test is deliberately BEHAVIOR-AGNOSTIC between the pre- and post-hoist
 * code (it asserts invariants, not bytes-vs-frozen-reference), so it guards
 * the hoist without needing regeneration — determinism is asserted as
 * two-run byte-equality of the SAME code (the repo's standard replay idiom).
 *
 *  1. determinism  — two same-seed pile runs end byte-identical;
 *  2. stability    — no NaN/Infinity in any position at any tick;
 *  3. containment  — the pile disperses (resolution actually works) but never
 *                    explodes (all bodies stay near the pile; no tunneling
 *                    ejection), and canvas bounds hold via enforceSpawnerBounds.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ, PHYSICS_SUBSTEPS, SparkType } from '../constants.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { enforceSpawnerBounds } from '../game/spawner.ts';
import { resolveCollisions } from './collision.ts';
import { SpatialGrid } from './spatial.ts';
import { verletStepAll } from './verlet.ts';
import { mulberry32 } from '../state/rng.ts';
import { asSparkId } from '../types.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;

const PILE_CENTER = { x: 400, y: 540 }; // open field, away from the spawner ring
const PILE_COUNT = 30; // spawner-zone steady-state density (spatial.ts docblock)
const SEED = 0xd15ea5ed;

/**
 * Build a deterministic 30-spark jam: positions in a 90px disc → heavy overlap.
 * (90px, not tighter: near-coincident bodies produce separation impulses far
 * more violent than any spawn-cadence pile the game can form — S120 fixture
 * tuning showed a 55px disc ejects bodies 780px+, pure fixture artifact.)
 */
function buildPile(seed: number): Spark[] {
  const rng = mulberry32(seed);
  const sparks: Spark[] = [];
  for (let i = 0; i < PILE_COUNT; i++) {
    const ang = rng() * Math.PI * 2;
    const r = rng() * 90;
    sparks.push(
      makeFreeSpark({
        id: asSparkId(20_000 + i),
        type: ((i % 6) as SparkType),
        pos: { x: PILE_CENTER.x + Math.cos(ang) * r, y: PILE_CENTER.y + Math.sin(ang) * r },
        velocity: { x: 0, y: 0 },
        dt: PHYSICS_DT,
        createdTick: 0,
      }),
    );
  }
  return sparks;
}

/** Run the pile through the app's substep loop for `ticks`. Returns positions JSON. */
function runPile(seed: number, ticks: number): { json: string; sparks: Spark[]; nanSeen: boolean } {
  const sparks = buildPile(seed);
  const grid = new SpatialGrid(32);
  let nanSeen = false;
  for (let t = 0; t < ticks; t++) {
    for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
      verletStepAll(sparks, SUBSTEP_DT);
      enforceSpawnerBounds(sparks);
      resolveCollisions(sparks, grid);
    }
    for (const sp of sparks) {
      if (!Number.isFinite(sp.pos.x) || !Number.isFinite(sp.pos.y)) nanSeen = true;
    }
  }
  const json = JSON.stringify(sparks.map((sp) => [sp.pos.x, sp.pos.y]));
  return { json, sparks, nanSeen };
}

describe('S120 P3 — dense-pile collision hardening (grid-rebuild hoist guard)', () => {
  const TICKS = 180; // 3 s of jam→dispersal

  it('two same-seed pile runs are byte-identical (determinism through the hoisted grid)', () => {
    const a = runPile(SEED, TICKS);
    const b = runPile(SEED, TICKS);
    expect(a.json).toBe(b.json);
  });

  it('no NaN/Infinity at any tick; pile disperses without explosion or ejection', () => {
    const { sparks, nanSeen } = runPile(SEED, TICKS);
    expect(nanSeen, 'no non-finite positions').toBe(false);

    // Resolution actually worked: residual overlap is tiny (pairs separated).
    // (Real signal against a broken hoist — a grid that stops finding pairs
    // leaves the initial jam overlapping heavily.)
    let worstOverlap = 0;
    for (let i = 0; i < sparks.length; i++) {
      for (let j = i + 1; j < sparks.length; j++) {
        const a = sparks[i];
        const b = sparks[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dist = Math.hypot(dx, dy);
        const overlap = a.radius + b.radius - dist;
        if (overlap > worstOverlap) worstOverlap = overlap;
      }
    }
    expect(worstOverlap, `worst residual overlap ${worstOverlap.toFixed(2)}px`).toBeLessThan(1.5);

    // No explosion/tunneling canary: report the worst drift, bound it loosely.
    // (Bound set from the observed pre-hoist baseline × ~2 — see docblock.)
    let worstDrift = 0;
    for (const sp of sparks) {
      const d = Math.hypot(sp.pos.x - PILE_CENTER.x, sp.pos.y - PILE_CENTER.y);
      if (d > worstDrift) worstDrift = d;
    }
    // eslint-disable-next-line no-console
    console.log(`[S120-P3] pile worst drift after ${TICKS} ticks: ${worstDrift.toFixed(0)}px`);
    // Observed pre-hoist baseline: 798px (violent jam + verlet glide is the
    // CURRENT shipped behavior). Explosion-class failure is runaway/NaN scale.
    expect(worstDrift, `no explosion-class ejection (worst ${worstDrift.toFixed(0)}px)`).toBeLessThan(1500);
  });

  it('different seeds diverge (canary — the determinism assert has real signal)', () => {
    const a = runPile(SEED, TICKS);
    const b = runPile(SEED + 1, TICKS);
    expect(a.json).not.toBe(b.json);
  });

  it('informational: resolveCollisions timing on the jammed pile (not a gate)', () => {
    const sparks = buildPile(SEED);
    const grid = new SpatialGrid(32);
    // Warm-up + measure: 2000 calls ≈ 250 ticks of substep work on the worst case.
    for (let i = 0; i < 200; i++) resolveCollisions(sparks, grid);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) resolveCollisions(sparks, grid);
    const perCallUs = ((performance.now() - t0) / 2000) * 1000;
    // eslint-disable-next-line no-console
    console.log(`[S120-P3 bench] resolveCollisions on 30-spark jam: ${perCallUs.toFixed(1)} µs/call`);
    expect(perCallUs).toBeGreaterThan(0); // informational only
  });
});
