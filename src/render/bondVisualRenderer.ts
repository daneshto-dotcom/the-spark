/**
 * SPARK — per-combo persistent bond visuals (S7 P2).
 *
 * The 24 functional combos render as the original straight line. The 12
 * magic combos render as their named silhouette stretched/anchored
 * between the two bond endpoints. The visual IS the bond — there's no
 * separate "decoration" layer. Stress-tint and width are applied by the
 * caller (structureRenderer) so the silhouette inherits stress feedback
 * without this module knowing about it.
 *
 * Why between-endpoint and not centered-on-midpoint:
 *   The S6 ephemeral effects (effectsRenderer.ts) used a centered-radius
 *   draw because they were one-shot pops at a single primitive's position.
 *   A persistent bond visual must answer "what shape connects A to B,"
 *   not "what symbol decorates a point" — so the geometry here is
 *   re-imagined: cable spans A→B as twin parallels, diamond uses A and B
 *   as opposite vertices of its long diagonal, capsule is a pill, etc.
 *
 * Animation (wheel rotation, vortex phase, orbital pulse) is keyed on
 * `tick` rather than wall-clock so the visual pauses with physics —
 * matches the convention established for the ephemeral effects ageing
 * (effectsRenderer.ts uses world.tick deltas, not requestAnimationFrame).
 *
 * Performance: each silhouette emits ≤32 stroke ops; with <100 bonds in
 * Phase 1 that's ≤3.2K ops/frame, well inside the 7ms render budget
 * (LOCKED_DECISIONS § 10.7).
 */

import type { Graphics } from 'pixi.js';

export interface BondVisualParams {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly visualEffectId: string;
  readonly color: number;
  readonly alpha: number;
  readonly width: number;
  /** world.tick — drives animation phase for wheel/vortex/orbital. */
  readonly tick: number;
}

export function drawBondVisual(g: Graphics, p: BondVisualParams): void {
  switch (p.visualEffectId) {
    case 'fx.filament': drawFilament(g, p); break;
    case 'fx.cable': drawCable(g, p); break;
    case 'fx.bracket': drawBracket(g, p); break;
    case 'fx.diamond': drawDiamond(g, p); break;
    case 'fx.wheel': drawWheel(g, p); break;
    case 'fx.star': drawStar(g, p); break;
    case 'fx.orbital': drawOrbital(g, p); break;
    case 'fx.lattice': drawLattice(g, p); break;
    case 'fx.capsule': drawCapsule(g, p); break;
    case 'fx.vortex': drawVortex(g, p); break;
    case 'fx.whip': drawWhip(g, p); break;
    case 'fx.warped': drawWarped(g, p); break;
    default: drawDefaultLine(g, p); break;
  }
}

/** Plain line — used by the 24 functional combos and as the degenerate fallback. */
function drawDefaultLine(g: Graphics, p: BondVisualParams): void {
  g.moveTo(p.ax, p.ay)
    .lineTo(p.bx, p.by)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
}

// ========== Magic-12 silhouettes ==========

/** Filament (Dot→Line, HIGH): bright bond with 6-ray starburst at midpoint. */
function drawFilament(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // Main bond, slightly thicker (filament = high-energy).
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by).stroke({
    width: p.width * 1.3,
    color: p.color,
    alpha: p.alpha,
  });

  // 6-ray starburst at midpoint — short rays so they don't drown the bond.
  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const rayLen = Math.min(12, len * 0.25);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(mx, my)
      .lineTo(mx + Math.cos(a) * rayLen, my + Math.sin(a) * rayLen)
      .stroke({ width: 1, color: p.color, alpha: p.alpha * 0.7 });
  }
}

/** Cable (Line→Line, MID): twin parallel lines along the bond axis. */
function drawCable(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const nx = -dy / len;
  const ny = dx / len;
  const offset = 3;

  g.moveTo(p.ax + nx * offset, p.ay + ny * offset)
    .lineTo(p.bx + nx * offset, p.by + ny * offset)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
  g.moveTo(p.ax - nx * offset, p.ay - ny * offset)
    .lineTo(p.bx - nx * offset, p.by - ny * offset)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
}

/** Bracket (Line→Triangle, HIGH): triangle with bond as base, apex perpendicular. */
function drawBracket(g: Graphics, p: BondVisualParams): void {
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

  // Base + two sides.
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
  g.moveTo(p.ax, p.ay).lineTo(apexX, apexY)
    .stroke({ width: p.width * 0.85, color: p.color, alpha: p.alpha * 0.75 });
  g.moveTo(p.bx, p.by).lineTo(apexX, apexY)
    .stroke({ width: p.width * 0.85, color: p.color, alpha: p.alpha * 0.75 });
}

/** Diamond (Triangle→Triangle, HIGH): rhombus with A,B as long-diagonal endpoints. */
function drawDiamond(g: Graphics, p: BondVisualParams): void {
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
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
}

/** Wheel (Triangle→Circle, MID): bond as one diameter + perpendicular spoke + circle, slowly rotating. */
function drawWheel(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const r = len / 2;

  // Bond diameter.
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
  // Outer circle.
  g.circle(mx, my, r).stroke({ width: 1, color: p.color, alpha: p.alpha * 0.55 });
  // Two extra rotating spokes, phase tied to tick (slow).
  const phase = (p.tick * 0.015) % (Math.PI / 2);
  for (const k of [0, 1]) {
    const angle = phase + (Math.PI / 4) + k * (Math.PI / 2);
    const ex = mx + Math.cos(angle) * r;
    const ey = my + Math.sin(angle) * r;
    g.moveTo(mx, my).lineTo(ex, ey)
      .stroke({ width: 1, color: p.color, alpha: p.alpha * 0.5 });
  }
}

/** Star (Circle→Triangle, MID): 5-point star at midpoint, oriented along bond. */
function drawStar(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // Faint underlay so the bond connection reads even with a busy star.
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by)
    .stroke({ width: p.width * 0.6, color: p.color, alpha: p.alpha * 0.45 });

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const outer = Math.min(len / 2 * 0.85, 18);
  const inner = outer * 0.45;
  // Orient: one point of the star faces along +bond axis.
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
  g.stroke({ width: p.width * 0.75, color: p.color, alpha: p.alpha });
}

/** Orbital (Circle→Circle, LOW): two concentric rings at midpoint, gentle radius pulse. */
function drawOrbital(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // Faint bond underlay.
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by)
    .stroke({ width: p.width * 0.5, color: p.color, alpha: p.alpha * 0.4 });

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  // Pulse: ~3-second cycle (180 ticks) at low amplitude — "breathing rings".
  const pulse = 1 + Math.sin(p.tick * 0.035) * 0.06;
  const r1 = (len / 2) * pulse;
  const r2 = r1 * 0.55;

  g.circle(mx, my, r1).stroke({ width: 1.25, color: p.color, alpha: p.alpha * 0.65 });
  g.circle(mx, my, r2).stroke({ width: 1, color: p.color, alpha: p.alpha * 0.55 });
}

/** Lattice (Square→Square, HIGH): rotated square (A,B as opposite corners) + cross-hatch. */
function drawLattice(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const half = len / 2;

  // Square's other two corners — perpendicular to bond at midpoint.
  const cx = mx + nx * half;
  const cy = my + ny * half;
  const dx2 = mx - nx * half;
  const dy2 = my - ny * half;

  // Outline.
  g.moveTo(p.ax, p.ay)
    .lineTo(cx, cy)
    .lineTo(p.bx, p.by)
    .lineTo(dx2, dy2)
    .lineTo(p.ax, p.ay)
    .stroke({ width: p.width * 0.8, color: p.color, alpha: p.alpha });

  // Cross-hatch — connect midpoints of opposite sides.
  g.moveTo((p.ax + cx) / 2, (p.ay + cy) / 2)
    .lineTo((p.bx + dx2) / 2, (p.by + dy2) / 2)
    .stroke({ width: 1, color: p.color, alpha: p.alpha * 0.5 });
  g.moveTo((cx + p.bx) / 2, (cy + p.by) / 2)
    .lineTo((dx2 + p.ax) / 2, (dy2 + p.ay) / 2)
    .stroke({ width: 1, color: p.color, alpha: p.alpha * 0.5 });
}

/** Capsule (Square→Circle, MID): pill — twin parallels + end-cap circles. */
function drawCapsule(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const nx = -dy / len;
  const ny = dx / len;
  const halfH = 6;

  g.moveTo(p.ax + nx * halfH, p.ay + ny * halfH)
    .lineTo(p.bx + nx * halfH, p.by + ny * halfH)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
  g.moveTo(p.ax - nx * halfH, p.ay - ny * halfH)
    .lineTo(p.bx - nx * halfH, p.by - ny * halfH)
    .stroke({ width: p.width, color: p.color, alpha: p.alpha });
  // End caps — full circles read as half-caps under the parallel lines.
  g.circle(p.ax, p.ay, halfH).stroke({ width: p.width, color: p.color, alpha: p.alpha });
  g.circle(p.bx, p.by, halfH).stroke({ width: p.width, color: p.color, alpha: p.alpha });
}

/** Vortex (Dot→Spiral, HIGH): archimedean spiral from A out to B; phase rotates with tick. */
function drawVortex(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  const baseAngle = Math.atan2(dy, dx);
  // Slow phase rotation — full turn ~30 seconds at 60Hz.
  const phase = (p.tick * 0.0035) % (Math.PI * 2);
  const turns = 1.5;
  const steps = 28;

  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = t * len;
    const a = baseAngle + phase + t * turns * Math.PI * 2;
    const px = p.ax + Math.cos(a) * r;
    const py = p.ay + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: p.width * 0.85, color: p.color, alpha: p.alpha });
}

/** Whip (Spiral→Line, LOW): sine wave from A to B; phase drifts A→B with tick. */
function drawWhip(g: Graphics, p: BondVisualParams): void {
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
  // ~one wavelength every ~2.4s at 60Hz, propagating from A toward B.
  const driftPhase = p.tick * 0.022;

  let first = true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dist = t * len;
    const wave = Math.sin((t * cycles + driftPhase) * Math.PI * 2) * amp;
    const px = p.ax + tx * dist + nx * wave;
    const py = p.ay + ty * dist + ny * wave;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: p.width, color: p.color, alpha: p.alpha });
}

/** Warped (Triangle→Spiral, LOW): wobbly 3-fold ring at midpoint, sized by half bond. */
function drawWarped(g: Graphics, p: BondVisualParams): void {
  const dx = p.bx - p.ax;
  const dy = p.by - p.ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) { drawDefaultLine(g, p); return; }

  // Faint bond underlay so the topology stays legible.
  g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by)
    .stroke({ width: p.width * 0.5, color: p.color, alpha: p.alpha * 0.4 });

  const mx = (p.ax + p.bx) / 2;
  const my = (p.ay + p.by) / 2;
  const baseR = Math.min(len / 2 * 0.8, 16);
  const steps = 32;

  let first = true;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = baseR + Math.sin(a * 3) * baseR * 0.3;
    const px = mx + Math.cos(a) * r;
    const py = my + Math.sin(a) * r;
    if (first) { g.moveTo(px, py); first = false; }
    else g.lineTo(px, py);
  }
  g.stroke({ width: p.width * 0.75, color: p.color, alpha: p.alpha });
}
