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

/** S19 P3 — linear stroke from (ax,ay) to (bx,by) in colorA. Post-Sym D all bonds are same-color; gradient path removed. */
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
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: p.width * widthScale, color: p.colorA, alpha: p.alpha * alphaScale });
}

/**
 * S19 P3 — parametric path stroke in colorA. `point(t)` returns {x,y} along the path at t∈[0,1].
 * Post-Sym D all bonds are same-color; gradient-segment path removed.
 */
export function strokePathLerp(
  g: Graphics,
  p: BondVisualParams,
  steps: number,
  point: (t: number) => { x: number; y: number },
  widthScale: number,
  alphaScale: number = 1,
): void {
  const width = p.width * widthScale;
  const alpha = p.alpha * alphaScale;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const pt = point(i / steps);
    if (first) { g.moveTo(pt.x, pt.y); first = false; }
    else g.lineTo(pt.x, pt.y);
  }
  g.stroke({ width, color: p.colorA, alpha });
}

/** Plain line — 22 functional combos + degenerate fallback when bond length < 1. */
export function drawDefaultLine(g: Graphics, p: BondVisualParams): void {
  g.moveTo(p.ax, p.ay)
    .lineTo(p.bx, p.by)
    .stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
}
