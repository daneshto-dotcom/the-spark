/**
 * S6 P3 placeholder bond-commit silhouettes. 14 magic combos get distinct
 * one-shot flair at the moment of bond creation; the 22 functional combos
 * use drawDefaultRing. Easing + lifetime are owned by the caller — these
 * are pure draw helpers.
 *
 * All flair eases out and dies at the same lifetime as the default ring,
 * so the active-list ageing in `sync` doesn't need to know which is which.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';

export function drawDefaultRing(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  g.circle(x, y, r).stroke({
    width: 2 - eased,
    color,
    alpha: 0.85 * alpha,
  });
}

/** Filament (Dot→Line, HIGH): tight white-hot starburst — 8 radial spikes. */
export function drawFilament(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const inner = radius * 0.6;
  const outer = radius + eased * radius * 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    g.moveTo(x + cosA * inner, y + sinA * inner)
      .lineTo(x + cosA * outer, y + sinA * outer)
      .stroke({ width: 1.5, color, alpha: 0.9 * alpha });
  }
  // Bright core ring.
  g.circle(x, y, radius * 1.1).stroke({
    width: 1.5, color, alpha: 0.85 * alpha,
  });
}

/** Cable (Line→Line, MID): twin parallel lines along the bond axis. */
export function drawCable(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  eased: number, alpha: number,
): void {
  const ax = effect.pos.x, ay = effect.pos.y;
  const bx = effect.otherPos.x, by = effect.otherPos.y;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  // Perpendicular offset, opening outward as effect ages.
  const perp = (effect.radius * 0.6) * (1 + eased * 1.5);
  const nx = -dy / len, ny = dx / len;
  for (const sign of [-1, 1]) {
    g.moveTo(ax + nx * perp * sign, ay + ny * perp * sign)
      .lineTo(bx + nx * perp * sign, by + ny * perp * sign)
      .stroke({ width: 1.5, color: effect.color, alpha: 0.85 * alpha });
  }
}

/** Bracket (Line→Triangle, HIGH): angular triangle outline pulse. */
export function drawBracket(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  // Equilateral triangle pointing up.
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (-Math.PI / 2) + (i / 3) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  g.moveTo(pts[0][0], pts[0][1])
    .lineTo(pts[1][0], pts[1][1])
    .lineTo(pts[2][0], pts[2][1])
    .lineTo(pts[0][0], pts[0][1])
    .stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
}

/** Diamond (Triangle→Triangle, HIGH): rotated square (45° diamond). */
export function drawDiamond(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.5;
  g.moveTo(x, y - r)
    .lineTo(x + r, y)
    .lineTo(x, y + r)
    .lineTo(x - r, y)
    .lineTo(x, y - r)
    .stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Wheel (Triangle→Circle, MID): expanding ring with rotating spokes. */
export function drawWheel(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2.2;
  g.circle(x, y, r).stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
  // 4 spokes that rotate as the effect ages.
  const rotation = eased * Math.PI * 0.5;
  for (let i = 0; i < 4; i++) {
    const a = rotation + (i / 4) * Math.PI * 2;
    g.moveTo(x, y)
      .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      .stroke({ width: 1, color, alpha: 0.7 * alpha });
  }
}

/** Star (Circle→Triangle, MID): 5-point star burst. */
export function drawStar(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const outer = radius + eased * radius * 2.5;
  const inner = outer * 0.45;
  // 5-point star = 10 alternating outer/inner verts.
  let first = true;
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-Math.PI / 2) + (i / 10) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Orbital (Circle→Circle, LOW): two concentric expanding rings. */
export function drawOrbital(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r1 = radius + eased * radius * 2.5;
  const r2 = radius * 0.6 + eased * radius * 1.7;
  g.circle(x, y, r1).stroke({ width: 2 - eased, color, alpha: 0.85 * alpha });
  g.circle(x, y, r2).stroke({ width: 1.5, color, alpha: 0.6 * alpha });
}

/** Lattice (Square→Square, HIGH): cross-hatch grid. */
export function drawLattice(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const r = radius + eased * radius * 2;
  // Outer square outline.
  g.rect(x - r, y - r, r * 2, r * 2).stroke({
    width: 2 - eased, color, alpha: 0.85 * alpha,
  });
  // Cross-hatch at +/- r/2.
  g.moveTo(x - r, y).lineTo(x + r, y).stroke({ width: 1, color, alpha: 0.6 * alpha });
  g.moveTo(x, y - r).lineTo(x, y + r).stroke({ width: 1, color, alpha: 0.6 * alpha });
}

/** Capsule (Square→Circle, MID): rounded rect outline. */
export function drawCapsule(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const w = (radius + eased * radius * 2) * 1.6;
  const h = radius + eased * radius * 1.5;
  g.roundRect(x - w / 2, y - h / 2, w, h, h / 2).stroke({
    width: 2 - eased, color, alpha: 0.85 * alpha,
  });
}

/** Vortex (Dot→Spiral, HIGH): outward spiral curve. */
export function drawVortex(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const turns = 1.5;
  const steps = 32;
  const maxR = radius + eased * radius * 3;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = t * maxR;
    const a = t * turns * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}

/** Whip (Spiral→Line, LOW): wave squiggle along the bond. */
export function drawWhip(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOND_COMMIT' }>,
  eased: number, alpha: number,
): void {
  const ax = effect.pos.x, ay = effect.pos.y;
  const bx = effect.otherPos.x, by = effect.otherPos.y;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const tx = dx / len, ty = dy / len;
  const nx = -ty, ny = tx;
  const amp = effect.radius * 0.8 * (1 - eased * 0.6);
  const cycles = 3;
  const steps = 24;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dist = t * len;
    const wave = Math.sin(t * cycles * Math.PI * 2) * amp;
    const px = ax + tx * dist + nx * wave;
    const py = ay + ty * dist + ny * wave;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color: effect.color, alpha: 0.9 * alpha });
}

/** Warped (Triangle→Spiral, LOW): wobbly distorted ring. */
export function drawWarped(
  g: Graphics, x: number, y: number, radius: number, color: number,
  eased: number, alpha: number,
): void {
  const baseR = radius + eased * radius * 2.5;
  const steps = 40;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // Wobble on a 3-fold pattern that grows with age.
    const r = baseR + Math.sin(a * 3 + eased * 4) * radius * 0.4;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: 2 - eased, color, alpha: 0.9 * alpha });
}
