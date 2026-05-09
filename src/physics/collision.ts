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
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    grid.insertAll(sparks);
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
