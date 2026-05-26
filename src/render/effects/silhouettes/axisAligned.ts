/**
 * SPARK — bond-axis-aligned silhouettes (S20 P3 archetype grouping).
 *
 * Seven silhouettes whose primary stroke runs along or through the bond
 * axis from endpoint A to endpoint B. Each takes a Graphics buffer + the
 * shared `BondVisualParams`. All use the bond axis as their organizing
 * geometry; midpoint ornaments (filament starburst, wheel ring+spokes)
 * are secondary accents.
 */

import type { Graphics } from 'pixi.js';
import {
  drawDefaultLine,
  midColor,
  strokeAxisLerp,
  type BondVisualParams,
} from './shared.ts';

/** Filament (Dot→Line, HIGH): bright bond with 6-ray starburst at midpoint. */
export function drawFilament(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // Main bond, slightly thicker (filament = high-energy). S19 P3 — bond
  // stroke uses A→B color lerp; the starburst rays at the midpoint use the
  // mid-blend (single color for the symmetric 6-ray ornament).
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by, 1.3, 1);

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const rayLen = Math.min(12, len * 0.25);
  const rayAlpha = p.alpha * (0.55 + Math.sin(p.tick * 0.04) * 0.15);
  const rayColor = midColor(p);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(mx, my)
      .lineTo(mx + Math.cos(a) * rayLen, my + Math.sin(a) * rayLen)
      .stroke({ width: 1, color: rayColor, alpha: rayAlpha });
  }
}

/** Cable (Line→Line, MID): twin parallel lines along the bond axis. */
export function drawCable(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const nx = -dy / len;
  const ny = dx / len;
  const offset = 3;

  // S19 P3 — both parallels lerp A→B.
  strokeAxisLerp(g, p, p.ax + nx * offset, p.ay + ny * offset, p.bx + nx * offset, p.by + ny * offset);
  strokeAxisLerp(g, p, p.ax - nx * offset, p.ay - ny * offset, p.bx - nx * offset, p.by - ny * offset);
}

/** Bracket (Line→Triangle, HIGH): triangle with bond as base, apex perpendicular. */
export function drawBracket(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const apexHeight = len * 0.35;
  const apexX = mx + nx * apexHeight;
  const apexY = my + ny * apexHeight;

  // S19 P3 — base lerps A→B; apex sides terminate at A and B respectively
  // and use the matching endpoint's color (apex is "owned by both" so the
  // sides reveal each endpoint's contribution).
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by);
  g.moveTo(p.ax, p.ay).lineTo(apexX, apexY)
    .stroke({ width: p.width * 0.85, color: p.colorA, alpha: p.alpha * 0.75 });
  g.moveTo(p.bx, p.by).lineTo(apexX, apexY)
    .stroke({ width: p.width * 0.85, color: p.colorB, alpha: p.alpha * 0.75 });
}

/** Diamond (Triangle→Triangle, HIGH): rhombus with A,B as long-diagonal endpoints. */
export function drawDiamond(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const short = len * 0.3;

  const tx = mx + nx * short;
  const ty = my + ny * short;
  const lx = mx - nx * short;
  const ly = my - ny * short;

  g.moveTo(p.ax, p.ay)
    .lineTo(tx, ty)
    .lineTo(p.bx, p.by)
    .lineTo(lx, ly)
    .lineTo(p.ax, p.ay)
    .stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
}

/** Wheel (Triangle→Circle, MID): bond as one diameter + perpendicular spoke + circle, slowly rotating. */
export function drawWheel(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const r = len / 2;

  // S19 P3 — diameter lerps A→B; concentric circle + rotating spokes share
  // the mid color (they're ornaments centered at the midpoint).
  strokeAxisLerp(g, p, p.ax, p.ay, p.bx, p.by);
  const ringColor = midColor(p);
  g.circle(mx, my, r).stroke({ width: 1, color: ringColor, alpha: p.alpha * 0.55 });
  const phase = (p.tick * 0.015) % (Math.PI / 2);
  for (const k of [0, 1]) {
    const angle = phase + (Math.PI / 4) + k * (Math.PI / 2);
    const ex = mx + Math.cos(angle) * r;
    const ey = my + Math.sin(angle) * r;
    g.moveTo(mx, my).lineTo(ex, ey)
      .stroke({ width: 1, color: ringColor, alpha: p.alpha * 0.5 });
  }
}

/** Lattice (Square→Square, HIGH): rotated square (A,B as opposite corners) + cross-hatch. */
export function drawLattice(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const half = len / 2;

  const cx = mx + nx * half;
  const cy = my + ny * half;
  const dx2 = mx - nx * half;
  const dy2 = my - ny * half;

  g.moveTo(p.ax, p.ay)
    .lineTo(cx, cy)
    .lineTo(p.bx, p.by)
    .lineTo(dx2, dy2)
    .lineTo(p.ax, p.ay)
    .stroke({ width: p.width * 0.8, color: p.colorA, alpha: p.alpha });

  const crossWidth = Math.max(1.2, p.width * 0.55);
  const crossAlpha = p.alpha * 0.65;
  const crossColor = midColor(p);
  g.moveTo((p.ax + cx) / 2, (p.ay + cy) / 2)
    .lineTo((p.bx + dx2) / 2, (p.by + dy2) / 2)
    .stroke({ width: crossWidth, color: crossColor, alpha: crossAlpha });
  g.moveTo((cx + p.bx) / 2, (cy + p.by) / 2)
    .lineTo((dx2 + p.ax) / 2, (dy2 + p.ay) / 2)
    .stroke({ width: crossWidth, color: crossColor, alpha: crossAlpha });
}

/** Capsule (Square→Circle, MID): pill — twin parallels + end-cap circles. */
export function drawCapsule(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const nx = -dy / len;
  const ny = dx / len;
  const halfH = 6;

  // S19 P3 — parallels lerp A→B; end-cap circles take their endpoint's
  // own placerColor (each cap belongs to one endpoint).
  strokeAxisLerp(g, p, p.ax + nx * halfH, p.ay + ny * halfH, p.bx + nx * halfH, p.by + ny * halfH);
  strokeAxisLerp(g, p, p.ax - nx * halfH, p.ay - ny * halfH, p.bx - nx * halfH, p.by - ny * halfH);
  g.circle(p.ax, p.ay, halfH).stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
  g.circle(p.bx, p.by, halfH).stroke({ width: p.width, color: p.colorB, alpha: p.alpha });
}
