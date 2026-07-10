/**
 * SPARK — soft pairwise positional collision resolution.
 * Two overlapping bodies are pushed apart along their separation vector
 * until they no longer overlap. No bounce, no friction; momentum is
 * recovered implicitly by Verlet on the next substep.
 *
 * Iteration count comes from § 4 (COLLISION_ITERATIONS=8) — enough to
 * untangle clusters that form in the 250-px spawner zone.
 */

import { COLLISION_ITERATIONS } from '../constants.ts';
import type { Spark } from '../game/spark.ts';
import type { SpatialGrid } from './spatial.ts';

const EPSILON = 1e-6;

export function resolveCollisions(sparks: readonly Spark[], grid: SpatialGrid): void {
  // S120 P3 (worker-sim phase (c)) — the grid is rebuilt ONCE per call (= once
  // per SUBSTEP, 8×/tick — never hoist to per-tick: positions integrate between
  // substeps). Iterations 2..8 re-visit start-of-substep buckets: a stale PAIR
  // re-reads live positions and no-ops below when no longer overlapping, and a
  // pair that drifts >1 cell apart mid-substep self-heals at the next substep's
  // rebuild (SUBSTEP_DT later). Was 64 insertAll/tick (rebuild inside the
  // iteration loop); dense-pile invariants locked by collision.pile.test.ts.
  grid.insertAll(sparks);
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    grid.forEachNearbyPair(resolvePair);
  }
}

function resolvePair(a: Spark, b: Spark): void {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist || distSq < EPSILON) return;
  const dist = Math.sqrt(distSq);
  const overlap = (minDist - dist) * 0.5;
  const nx = dx / dist;
  const ny = dy / dist;
  a.pos.x -= nx * overlap;
  a.pos.y -= ny * overlap;
  b.pos.x += nx * overlap;
  b.pos.y += ny * overlap;
}
