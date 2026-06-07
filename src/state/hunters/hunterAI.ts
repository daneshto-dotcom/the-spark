/**
 * SPARK — S72 P2 hunter steering (pure, deterministic, self-contained).
 *
 * SELF-CONTAINED on purpose: the Voltkin steering helpers (arriveForce /
 * seekForce / repulseForce in physics/creatureVerlet.ts) carry a LOCKED
 * "do NOT import outside creatureVerlet.test.ts" contract (S34 P2-17), and
 * Council Fork C mandates ZERO Voltkin coupling for the hunter. So this module
 * MIRRORS the proven creatureVerletStep math (implicit-velocity Verlet) rather
 * than importing it — keeping the §13.15 LOCKED creature system untouched.
 *
 * Determinism: pure float math (same-browser §10.5). Math.hypot is used for the
 * steering normalize exactly as the creature steering does (accepted for replay);
 * the catch GATE uses squared distance (huntDistSq) — no sqrt.
 */

import type { Vec2 } from '../../types.ts';

/** Squared distance — avoids sqrt for the per-tick catch gate. */
export function huntDistSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * One deterministic per-tick momentum-pursuit step toward `target`. Mutates
 * pos/prevPos in place: Verlet implicit velocity (pos - prevPos) is damped, then
 * steered toward the target, then speed-capped. `maxSpeed` is below a flicking
 * cursor so an attentive player can out-juke it; `damping` retains momentum so
 * sharp turns overshoot (the juke window). Pure: no world / RNG / wall-clock dep.
 */
export function hunterPursue(
  hunter: { pos: Vec2; prevPos: Vec2 },
  target: Vec2,
  accel: number,
  maxSpeed: number,
  damping: number,
): void {
  const px = hunter.pos.x;
  const py = hunter.pos.y;
  let vx = (px - hunter.prevPos.x) * damping;
  let vy = (py - hunter.prevPos.y) * damping;
  const dx = target.x - px;
  const dy = target.y - py;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) {
    vx += (dx / dist) * accel;
    vy += (dy / dist) * accel;
  }
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    vx *= s;
    vy *= s;
  }
  hunter.prevPos.x = px;
  hunter.prevPos.y = py;
  hunter.pos.x = px + vx;
  hunter.pos.y = py + vy;
}
