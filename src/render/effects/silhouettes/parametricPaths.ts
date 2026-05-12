/**
 * SPARK — parametric-path silhouettes (S20 P3 archetype grouping).
 *
 * Two silhouettes whose path traces from endpoint A to endpoint B along
 * a curved parametric `t∈[0,1]`. Shared infrastructure is `strokePathLerp`
 * (8 colorSegments by default for the gradient sweep along the curve).
 */

import type { Graphics } from 'pixi.js';
import {
  drawDefaultLine,
  strokePathLerp,
  type BondVisualParams,
} from './shared.ts';

/** Vortex (Dot→Spiral, HIGH): archimedean spiral from A out to B; phase rotates with tick. */
export function drawVortex(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const baseAngle = Math.atan2(dy, dx);
  const phase = (p.tick * 0.0035) % (Math.PI * 2);
  const turns = 1.5;
  const steps = 32;  // Bumped from 28 → 32 (divisible by 8 colorSegments).

  // S19 P3 — spiral's parametric t∈[0,1] = position A→B. strokePathLerp
  // fast-paths single-color and segments into 8 sub-strokes for gradient.
  strokePathLerp(g, p, steps, (t) => {
    const r = t * len;
    const a = baseAngle + phase + t * turns * Math.PI * 2;
    return { x: p.ax + Math.cos(a) * r, y: p.ay + Math.sin(a) * r };
  }, 0.85);
}

/** Whip (Spiral→Line, LOW): sine wave from A to B; phase drifts A→B with tick. */
export function drawWhip(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const amp = Math.min(8, len * 0.18);
  const cycles = 3;
  const steps = 24;
  const driftPhase = p.tick * 0.022;

  // S19 P3 — sine wave parametric t∈[0,1] = position A→B. Shared lerp helper.
  strokePathLerp(g, p, steps, (t) => {
    const dist = t * len;
    const wave = Math.sin((t * cycles + driftPhase) * Math.PI * 2) * amp;
    return {
      x: p.ax + tx * dist + nx * wave,
      y: p.ay + ty * dist + ny * wave,
    };
  }, 1);
}
