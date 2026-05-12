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
  /**
   * S17 P2 — Phase-2 §VI.4/§X.2 multi-color contribution rendering.
   * colorA = endpoint A's placerColor; colorB = endpoint B's placerColor
   * (immutable contribution record per §VI.4, NOT transient ownerColor —
   * Council R1 Gemini #1 BLOCKER fix). Both passed through stress-tint by
   * caller (structureRenderer.ts). When colorA===colorB the default line
   * renders as solid stroke (Phase-1 back-compat). When different,
   * drawDefaultLine emits 4 lerped sub-segments to fake the A→B gradient
   * (Pixi v8 has no native A→B endpoint gradient stroke API per Council R1
   * Grok #6 + Gemini #5). S19 P3 — all 12 magic silhouettes now extend the
   * gradient: bond-axis strokes lerp A→B; ornaments at the midpoint use
   * the mid color (`midColor(p)`); endpoint-anchored elements (bracket
   * sides, diamond sides, lattice sides, capsule end caps) use the
   * respective endpoint's own placerColor — closer to spec §X.2 "reveal
   * contributions". Vortex spiral + whip sine wave segment into 8 pieces
   * along their parametric `t` so the gradient follows the curved path.
   */
  readonly colorA: number;
  readonly colorB: number;
  readonly alpha: number;
  readonly width: number;
  /** world.tick — drives animation phase for wheel/vortex/orbital. */
  readonly tick: number;
}

/**
 * S17 P2 — pure RGB lerp helper. Exported for vitest pixel-sample tests
 * (S10 #test-via-pure-helper-export pattern). Channel-wise interpolation
 * between two RGB-packed colors (0xRRGGBB) at parameter t∈[0,1]. Same
 * interpolation as the multi-color stroke decomposition in drawDefaultLine.
 */
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

/**
 * S19 P3 — midpoint color for ornaments centered between A and B.
 * Equivalent to `lerpColor(p.colorA, p.colorB, 0.5)` but reads better
 * at silhouette call sites.
 */
function midColor(p: BondVisualParams): number {
  return p.colorA === p.colorB ? p.colorA : lerpColor(p.colorA, p.colorB, 0.5);
}

/**
 * S19 P3 — N-segment linear stroke between two endpoints with A→B color
 * lerp. Same pattern as `drawDefaultLine`, factored for reuse by magic
 * silhouettes whose primary stroke spans the bond axis (filament, cable,
 * bracket base, diamond, wheel diameter, capsule parallels). Fast-path
 * single stroke when colorA===colorB.
 *
 * `widthScale` + `alphaScale` allow callers to adjust stroke weight without
 * mutating BondVisualParams.
 */
function strokeAxisLerp(
  g: Graphics,
  p: BondVisualParams,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  widthScale: number = 1,
  alphaScale: number = 1,
): void {
  const width = p.width * widthScale;
  const alpha = p.alpha * alphaScale;
  if (p.colorA === p.colorB) {
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width, color: p.colorA, alpha });
    return;
  }
  const segments = 4;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const tMid = (t0 + t1) / 2;
    const x0 = ax + (bx - ax) * t0;
    const y0 = ay + (by - ay) * t0;
    const x1 = ax + (bx - ax) * t1;
    const y1 = ay + (by - ay) * t1;
    const color = lerpColor(p.colorA, p.colorB, tMid);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, alpha });
  }
}

/**
 * S19 P3 — parametric path stroke with A→B color lerp. Used by vortex
 * (spiral) and whip (sine wave) where the path is curved but the
 * parametric `t` corresponds to position along the bond. Fast-path
 * single stroke when colorA===colorB; otherwise emit `colorSegments`
 * polyline strokes, each in its own lerped color.
 *
 * `point(t)` returns the {x,y} along the path at parameter t∈[0,1].
 */
function strokePathLerp(
  g: Graphics,
  p: BondVisualParams,
  steps: number,
  point: (t: number) => { x: number; y: number },
  widthScale: number,
  alphaScale: number = 1,
  colorSegments: number = 8,
): void {
  const width = p.width * widthScale;
  const alpha = p.alpha * alphaScale;
  if (p.colorA === p.colorB) {
    let first = true;
    for (let i = 0; i <= steps; i++) {
      const pt = point(i / steps);
      if (first) { g.moveTo(pt.x, pt.y); first = false; }
      else g.lineTo(pt.x, pt.y);
    }
    g.stroke({ width, color: p.colorA, alpha });
    return;
  }
  const stepsPerSeg = steps / colorSegments;
  for (let s = 0; s < colorSegments; s++) {
    const tMid = (s + 0.5) / colorSegments;
    const color = lerpColor(p.colorA, p.colorB, tMid);
    let first = true;
    for (let i = 0; i <= stepsPerSeg; i++) {
      const ii = s * stepsPerSeg + i;
      const pt = point(ii / steps);
      if (first) { g.moveTo(pt.x, pt.y); first = false; }
      else g.lineTo(pt.x, pt.y);
    }
    g.stroke({ width, color, alpha });
  }
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

/**
 * Plain line — used by the 24 functional combos and as the degenerate fallback.
 * S17 P2: stroke decomposition into 4 sub-segments when colorA !== colorB to
 * simulate an A→B gradient. Pixi v8 Graphics has no native endpoint-color
 * gradient stroke API (Council R1 Grok #6 + Gemini #5 confirmed); the cheapest
 * spec-faithful path is mid-segment color lerp. Same-color bonds take the
 * fast path (single stroke) for Phase-1 back-compat + zero perf cost.
 */
function drawDefaultLine(g: Graphics, p: BondVisualParams): void {
  if (p.colorA === p.colorB) {
    g.moveTo(p.ax, p.ay)
      .lineTo(p.bx, p.by)
      .stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
    return;
  }
  const segments = 4;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const tMid = (t0 + t1) / 2;
    const x0 = p.ax + (p.bx - p.ax) * t0;
    const y0 = p.ay + (p.by - p.ay) * t0;
    const x1 = p.ax + (p.bx - p.ax) * t1;
    const y1 = p.ay + (p.by - p.ay) * t1;
    const color = lerpColor(p.colorA, p.colorB, tMid);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: p.width, color, alpha: p.alpha });
  }
}

// ========== Magic-12 silhouettes ==========

/** Filament (Dot→Line, HIGH): bright bond with 6-ray starburst at midpoint. */
function drawFilament(g: Graphics, p: BondVisualParams): void {
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
function drawCable(g: Graphics, p: BondVisualParams): void {
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

  // S19 P3 — 4-sided rhombus. Sides touching A use colorA, sides touching
  // B use colorB. Fast path when colors match.
  if (p.colorA === p.colorB) {
    g.moveTo(p.ax, p.ay)
      .lineTo(tx, ty)
      .lineTo(p.bx, p.by)
      .lineTo(lx, ly)
      .lineTo(p.ax, p.ay)
      .stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
  } else {
    g.moveTo(p.ax, p.ay).lineTo(tx, ty).stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
    g.moveTo(tx, ty).lineTo(p.bx, p.by).stroke({ width: p.width, color: p.colorB, alpha: p.alpha });
    g.moveTo(p.bx, p.by).lineTo(lx, ly).stroke({ width: p.width, color: p.colorB, alpha: p.alpha });
    g.moveTo(lx, ly).lineTo(p.ax, p.ay).stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
  }
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

/** Star (Circle→Triangle, MID): 5-point star at midpoint, oriented along bond. */
function drawStar(g: Graphics, p: BondVisualParams): void {
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
function drawOrbital(g: Graphics, p: BondVisualParams): void {
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

  const cx = mx + nx * half;
  const cy = my + ny * half;
  const dx2 = mx - nx * half;
  const dy2 = my - ny * half;

  // S19 P3 — outline: sides touching A use colorA; sides touching B use
  // colorB. Cross-hatch (centered between sides) uses mid color.
  if (p.colorA === p.colorB) {
    g.moveTo(p.ax, p.ay)
      .lineTo(cx, cy)
      .lineTo(p.bx, p.by)
      .lineTo(dx2, dy2)
      .lineTo(p.ax, p.ay)
      .stroke({ width: p.width * 0.8, color: p.colorA, alpha: p.alpha });
  } else {
    const w = p.width * 0.8;
    g.moveTo(p.ax, p.ay).lineTo(cx, cy).stroke({ width: w, color: p.colorA, alpha: p.alpha });
    g.moveTo(cx, cy).lineTo(p.bx, p.by).stroke({ width: w, color: p.colorB, alpha: p.alpha });
    g.moveTo(p.bx, p.by).lineTo(dx2, dy2).stroke({ width: w, color: p.colorB, alpha: p.alpha });
    g.moveTo(dx2, dy2).lineTo(p.ax, p.ay).stroke({ width: w, color: p.colorA, alpha: p.alpha });
  }

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
function drawCapsule(g: Graphics, p: BondVisualParams): void {
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

/** Vortex (Dot→Spiral, HIGH): archimedean spiral from A out to B; phase rotates with tick. */
function drawVortex(g: Graphics, p: BondVisualParams): void {
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

/** Warped (Triangle→Spiral, LOW): 3-fold ring at midpoint. Lobes rotate + breathe over time. */
function drawWarped(g: Graphics, p: BondVisualParams): void {
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
