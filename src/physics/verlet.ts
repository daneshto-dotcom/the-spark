/**
 * SPARK — position-based Verlet integration.
 * § 4 LOCKED: 60 Hz, 8 substeps, damping 0.998 per substep.
 *
 * Why position-based (not force-based): impulses with Hooke's k=10/50/100
 * exploded in early prototypes (Session 0 reflexion #verlet). Position-based
 * dynamics with constraint relaxation in [0,1] is unconditionally stable
 * for the stiffness range we use.
 *
 * Velocity is implicit: v ≈ (pos - prevPos) / dt.
 * Update rule per substep:
 *     newPos = pos + (pos - prevPos) * damping + accel * dt²
 *     prevPos = pos
 *     pos = newPos
 */

import { VELOCITY_DAMPING } from '../constants.ts';
import type { Spark } from '../game/spark.ts';
import type { Vec2 } from '../types.ts';

const ZERO_ACCEL: Vec2 = { x: 0, y: 0 };

/** Step a single body one substep. Mutates spark.pos / spark.prevPos in place. */
export function verletStep(spark: Spark, dtSub: number, accel: Vec2 = ZERO_ACCEL): void {
  const px = spark.pos.x;
  const py = spark.pos.y;
  const vx = (px - spark.prevPos.x) * VELOCITY_DAMPING;
  const vy = (py - spark.prevPos.y) * VELOCITY_DAMPING;
  const ax = accel.x * dtSub * dtSub;
  const ay = accel.y * dtSub * dtSub;
  spark.prevPos.x = px;
  spark.prevPos.y = py;
  spark.pos.x = px + vx + ax;
  spark.pos.y = py + vy + ay;
}

/** Apply Verlet to many bodies. */
export function verletStepAll(sparks: readonly Spark[], dtSub: number, accel: Vec2 = ZERO_ACCEL): void {
  for (let i = 0; i < sparks.length; i++) {
    verletStep(sparks[i], dtSub, accel);
  }
}

/**
 * Read implicit velocity (pre-damping) for a spark.
 * Useful for tests + spawn-bounce reflection where we need to know the velocity
 * to reflect about a normal.
 */
export function getVelocity(spark: Spark, dtSub: number): Vec2 {
  return {
    x: (spark.pos.x - spark.prevPos.x) / dtSub,
    y: (spark.pos.y - spark.prevPos.y) / dtSub,
  };
}

/**
 * Set implicit velocity by adjusting prevPos relative to current pos.
 * Used by spawner bounce + carry release.
 */
export function setVelocity(spark: Spark, velocity: Vec2, dtSub: number): void {
  spark.prevPos.x = spark.pos.x - velocity.x * dtSub;
  spark.prevPos.y = spark.pos.y - velocity.y * dtSub;
}
