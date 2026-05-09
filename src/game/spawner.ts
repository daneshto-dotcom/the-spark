/**
 * SPARK — spawner: confined 250-px zone, Poisson 1.5/sec, elastic bounce.
 * § 2 LOCKED + § 11 invariant "Spawner confinement" enforcement point.
 *
 * Poisson process: interarrival time ~ Exponential(λ=1.5/sec) — log of a
 * uniform sample. Each spawn picks a uniform point inside the disk and a
 * uniform random initial velocity (20-80 px/s, see constants).
 *
 * Confinement: at the end of each substep, any spark outside the disk is
 * teleported back to the boundary and its velocity reflected about the
 * inward normal, scaled by SPAWNER_BOUNCE_DAMPING. Velocity in Verlet is
 * implicit, so we manipulate prevPos.
 */

import {
  ALL_SPARK_TYPES,
  PHYSICS_HZ,
  SPAWN_RATE_PER_SECOND,
  SPAWNER_BOUNCE_DAMPING,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SPARK_INITIAL_VELOCITY_MAX,
  SPARK_INITIAL_VELOCITY_MIN,
  SparkType,
} from '../constants.ts';
import { rngPick, rngRange } from '../state/rng.ts';
import type { Rng } from '../state/rng.ts';
import { asSparkId } from '../types.ts';
import type { SparkId } from '../types.ts';
import type { Spark } from './spark.ts';
import { makeFreeSpark } from './spark.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;

export interface SpawnerConfig {
  readonly center: { x: number; y: number };
  readonly radius: number;
  readonly ratePerSecond: number;
  readonly types: readonly SparkType[];
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  center: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
  radius: SPAWNER_RADIUS,
  ratePerSecond: SPAWN_RATE_PER_SECOND,
  types: ALL_SPARK_TYPES,
};

export class Spawner {
  private nextId = 0;
  private secondsUntilNextSpawn: number;

  constructor(
    private readonly cfg: SpawnerConfig,
    private readonly rng: Rng,
  ) {
    this.secondsUntilNextSpawn = this.sampleInterarrival();
  }

  /**
   * Advance the spawner by `dtSec` of wall time and append any new sparks.
   * Returns the count spawned this frame (handy for stats overlay).
   */
  tick(dtSec: number, tick: number, freeSparks: Spark[]): number {
    let n = 0;
    this.secondsUntilNextSpawn -= dtSec;
    while (this.secondsUntilNextSpawn <= 0) {
      freeSparks.push(this.spawnOne(tick));
      this.secondsUntilNextSpawn += this.sampleInterarrival();
      n++;
    }
    return n;
  }

  private spawnOne(tick: number): Spark {
    const id = asSparkId(this.nextId++);
    const type = rngPick(this.rng, this.cfg.types);

    // Uniform point inside disk: r = R · √u, θ = 2π · v.
    const r = this.cfg.radius * Math.sqrt(this.rng()) * 0.85; // 0.85 keeps spawns off the rim
    const theta = 2 * Math.PI * this.rng();
    const pos = {
      x: this.cfg.center.x + r * Math.cos(theta),
      y: this.cfg.center.y + r * Math.sin(theta),
    };

    const speed = rngRange(this.rng, SPARK_INITIAL_VELOCITY_MIN, SPARK_INITIAL_VELOCITY_MAX);
    const dir = 2 * Math.PI * this.rng();
    const velocity = { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed };

    return makeFreeSpark({ id, type, pos, velocity, dt: PHYSICS_DT, createdTick: tick });
  }

  private sampleInterarrival(): number {
    // Exponential(λ): -ln(1-u)/λ.
    const u = Math.max(this.rng(), 1e-9);
    return -Math.log(u) / this.cfg.ratePerSecond;
  }
}

/**
 * Per-substep confinement: any spark outside the disk is reflected back.
 * Mutates spark.pos and spark.prevPos in place.
 *
 * `exemptSparkId` (S5 hot-fix): the player's AttractDrag target skips
 * reflection so it can be pulled out of the spawner zone. Without this the
 * boundary bounces the spark back inward each substep and PICKUP never fires.
 */
export function enforceSpawnerBounds(
  sparks: readonly Spark[],
  cfg: SpawnerConfig = DEFAULT_SPAWNER_CONFIG,
  exemptSparkId: SparkId | null = null,
): void {
  const cx = cfg.center.x;
  const cy = cfg.center.y;
  const R = cfg.radius;
  const damp = SPAWNER_BOUNCE_DAMPING;
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (s.state.kind !== 'Free') continue;
    if (exemptSparkId !== null && s.id === exemptSparkId) continue;
    const dx = s.pos.x - cx;
    const dy = s.pos.y - cy;
    const distSq = dx * dx + dy * dy;
    const limit = R - s.radius;
    if (distSq <= limit * limit) continue;
    const dist = Math.sqrt(distSq) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Snap to the boundary.
    s.pos.x = cx + nx * limit;
    s.pos.y = cy + ny * limit;

    // Reflect implicit velocity (v = pos - prevPos) about the inward normal.
    const vx = s.pos.x - s.prevPos.x;
    const vy = s.pos.y - s.prevPos.y;
    const vDotN = vx * nx + vy * ny;
    // Only reflect if heading outward; avoids re-reflecting on subsequent substeps.
    if (vDotN <= 0) continue;
    const rvx = (vx - 2 * vDotN * nx) * damp;
    const rvy = (vy - 2 * vDotN * ny) * damp;
    s.prevPos.x = s.pos.x - rvx;
    s.prevPos.y = s.pos.y - rvy;
  }
}
