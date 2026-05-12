/**
 * SPARK — shared types + helpers for bond-visual silhouettes.
 *
 * S20 P3 (Council R1 + PRIME-AUDIT) extracts BondVisualParams + the
 * stroke/color helpers + drawDefaultLine (fallback) from bondVisualRenderer.ts
 * into a single shared module. DAG-safe: silhouettes/axisAligned + midpointOrnaments
 * + parametricPaths all import only from shared.ts; bondVisualRenderer.ts
 * imports the dispatch barrel + shared (one-way; no cycles).
 *
 * History (preserved from bondVisualRenderer.ts originals):
 *   - S7 P2 — per-combo persistent bond visuals + the 12 magic silhouettes.
 *   - S17 P2 — multi-color A→B gradient on default-line (4-segment lerp);
 *              `lerpColor` exported for vitest pixel-sample tests.
 *   - S19 P3 — per-silhouette gradient extension; introduced `midColor`,
 *              `strokeAxisLerp`, `strokePathLerp` helpers used by all 12 magic
 *              silhouettes (axis A→B stroke + midpoint ornaments + parametric
 *              curves all share these three helpers).
 *
 * Why drawDefaultLine lives in shared.ts and not in bondVisualRenderer.ts:
 *   Silhouettes call drawDefaultLine as the degenerate fallback when bond
 *   length < 1 px. If drawDefaultLine stayed in the dispatcher, silhouettes
 *   would need to import from bondVisualRenderer.ts, creating a cycle
 *   (dispatcher → silhouettes → dispatcher). Council R1 Gemini #1.
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
   * (immutable contribution record per §VI.4, NOT transient ownerColor).
   * Both passed through stress-tint by caller (structureRenderer.ts).
   * When colorA===colorB the default line renders as solid stroke (Phase-1
   * back-compat). When different, drawDefaultLine emits 4 lerped sub-segments
   * to fake the A→B gradient. S19 P3 extended this to all 12 magic silhouettes
   * via the shared helpers below.
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
 * between two RGB-packed colors (0xRRGGBB) at parameter t∈[0,1].
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
export function midColor(p: BondVisualParams): number {
  return p.colorA === p.colorB ? p.colorA : lerpColor(p.colorA, p.colorB, 0.5);
}

/**
 * S19 P3 — N-segment linear stroke between two endpoints with A→B color
 * lerp. Used by silhouettes whose primary stroke spans the bond axis
 * (filament, cable, bracket base, diamond, wheel diameter, capsule
 * parallels). Fast-path single stroke when colorA===colorB.
 */
export function strokeAxisLerp(
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
export function strokePathLerp(
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

/**
 * Plain line — used by the 24 functional combos and as the degenerate
 * fallback for silhouettes when bond length < 1.
 *
 * S17 P2: stroke decomposition into 4 sub-segments when colorA !== colorB
 * to simulate an A→B gradient. Pixi v8 Graphics has no native endpoint-color
 * gradient stroke API; the cheapest spec-faithful path is mid-segment color
 * lerp. Same-color bonds take the fast path (single stroke).
 */
export function drawDefaultLine(g: Graphics, p: BondVisualParams): void {
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
