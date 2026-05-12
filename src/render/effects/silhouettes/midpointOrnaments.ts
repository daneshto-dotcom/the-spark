/**
 * SPARK — midpoint-ornament silhouettes (S20 P3 archetype grouping).
 *
 * Three silhouettes whose primary visual is an ornament centered between
 * endpoints A and B, with a faint axis-aligned underlay. Each shape's
 * organizing geometry is the midpoint; the underlay is a secondary cue
 * that anchors the ornament to the bond endpoints.
 */

import type { Graphics } from 'pixi.js';
import {
  drawDefaultLine,
  midColor,
  strokeAxisLerp,
  type BondVisualParams,
} from './shared.ts';

/** Star (Circle→Triangle, MID): 5-point star at midpoint, oriented along bond. */
export function drawStar(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // S19 P3 — faint underlay lerps A→B; star ornament at midpoint = mid color.
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by, 0.6, 0.45);

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const outer = Math.min(len / 2 * 0.85, 18);
  const inner = outer * 0.45;
  const baseAngle = Math.atan2(dy, dx) - Math.PI / 2;

  let first = true;
  for (let i = 0; i <= 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const a = baseAngle + (i / 10) * Math.PI * 2;
    const px = mx + Math.cos(a) * radius;
    const py = my + Math.sin(a) * radius;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: p.width * 0.75, color: midColor(p), alpha: p.alpha });
}

/** Orbital (Circle→Circle, LOW): two concentric rings at midpoint, gentle radius pulse. */
export function drawOrbital(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // S19 P3 — faint bond underlay lerps A→B; rings at midpoint = mid color.
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by, 0.5, 0.4);

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const pulse = 1 + Math.sin(p.tick * 0.035) * 0.06;
  const r1 = (len / 2) * pulse;
  const r2 = r1 * 0.55;
  const ringColor = midColor(p);

  g.circle(mx, my, r1).stroke({ width: 1.25, color: ringColor, alpha: p.alpha * 0.65 });
  g.circle(mx, my, r2).stroke({ width: 1, color: ringColor, alpha: p.alpha * 0.55 });
}

/** Warped (Triangle→Spiral, LOW): 3-fold ring at midpoint. Lobes rotate + breathe over time. */
export function drawWarped(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // S19 P3 — faint bond underlay lerps A→B; 3-fold ring at midpoint = mid color.
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by, 0.5, 0.4);

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const baseR = Math.min(len / 2 * 0.8, 16);
  const steps = 32;
  const rotPhase = p.tick * 0.008;
  const breatheAmp = 0.3 + Math.sin(p.tick * 0.025) * 0.08;

  let first = true;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = baseR + Math.sin(a * 3 + rotPhase) * baseR * breatheAmp;
    const px = mx + Math.cos(a) * r;
    const py = my + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: p.width * 0.75, color: midColor(p), alpha: p.alpha });
}
