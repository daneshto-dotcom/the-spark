/**
 * SPARK — S110 P4 (Batch B) — DEFENDER walk locomotion (HELGA).
 *
 * A Defender-callable MIRROR of the creature Verlet integrator (physics/creatureVerlet.ts:
 * `creatureVerletStep` + `arriveForce`). The math — VELOCITY_DAMPING per substep, accel·dtSub²,
 * the arrive ramp-down, the exact operation ORDER — is COPIED BYTE-FOR-BYTE so HELGA's motion is
 * IEEE-754 replay-byte-equivalent with how a creature would move (Council: mirror the proven
 * float-Verlet model; do NOT invent a fixed-point / client-extrapolation scheme — that would be a
 * novel untested netcode path inconsistent with the rest of the sim).
 *
 * We MIRROR rather than reuse creatureVerlet's helpers because those are `(c: Creature, …)`-typed
 * and reusing them across the tested creature path risks perturbing that replay-equivalence guard
 * (S110 PDR + the creatureVerlet `@internal` test-only contract). A Defender exposes the same
 * { pos, prevPos } shape, so the copy is mechanical.
 *
 * Determinism: pure fn of the defender's own pos/prevPos + the target; no wall-clock, no RNG. One
 * `stepDefenderWalk` call advances ONE world tick = PHYSICS_SUBSTEPS Verlet substeps (the same
 * per-tick displacement a creature gets), keeping HELGA's top speed in the same units as creatures.
 */

import { PHYSICS_HZ, PHYSICS_SUBSTEPS, VELOCITY_DAMPING } from '../../constants.ts';
import type { Vec2 } from '../../types.ts';
import type { Defender } from './defender.ts';

// Mirror physicsLoop.ts:51 / spawner.ts:47 EXACTLY: PHYSICS_DT = 1/PHYSICS_HZ; SUBSTEP_DT = PHYSICS_DT/PHYSICS_SUBSTEPS.
const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;

/**
 * One Verlet substep on a Defender. Mirrors creatureVerletStep (creatureVerlet.ts:80-91) exactly:
 * implicit velocity = (pos − prevPos) × VELOCITY_DAMPING; accel in px·s⁻² (× dtSub²). Mutates in place.
 */
function defenderVerletStep(d: Defender, dtSub: number, accel: Vec2): void {
  const px = d.pos.x;
  const py = d.pos.y;
  const vx = (px - d.prevPos.x) * VELOCITY_DAMPING;
  const vy = (py - d.prevPos.y) * VELOCITY_DAMPING;
  const ax = accel.x * dtSub * dtSub;
  const ay = accel.y * dtSub * dtSub;
  d.prevPos.x = px;
  d.prevPos.y = py;
  d.pos.x = px + vx + ax;
  d.pos.y = py + vy + ay;
}

/**
 * Arrive steering for a Defender. Mirrors arriveForce (creatureVerlet.ts:203-218) exactly: unit
 * vector toward target × maxAccel, linearly ramped down inside arriveRadius (smooth stop). ZERO at
 * coincident pos.
 */
function defenderArrive(d: Defender, target: Vec2, arriveRadius: number, maxAccel: number): Vec2 {
  const dx = target.x - d.pos.x;
  const dy = target.y - d.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const scale = dist < arriveRadius ? dist / arriveRadius : 1;
  return {
    x: (dx / dist) * maxAccel * scale,
    y: (dy / dist) * maxAccel * scale,
  };
}

/**
 * Advance a Defender ONE world tick toward `target` (PHYSICS_SUBSTEPS arrive-Verlet substeps, the
 * same cadence a creature integrates at). Mutates pos/prevPos in place. Replay byte-equivalent with
 * creature motion. `maxAccel` = the defender's config.moveAccel; `arriveRadius` the ramp-down radius.
 */
export function stepDefenderWalk(d: Defender, target: Vec2, maxAccel: number, arriveRadius: number): void {
  for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
    const accel = defenderArrive(d, target, arriveRadius, maxAccel);
    defenderVerletStep(d, SUBSTEP_DT, accel);
  }
}

/** Freeze a defender in place this tick (prevPos := pos → zero implicit velocity). */
export function freezeDefender(d: Defender): void {
  d.prevPos.x = d.pos.x;
  d.prevPos.y = d.pos.y;
}

/** Squared distance helper (avoids a sqrt for range checks). */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
