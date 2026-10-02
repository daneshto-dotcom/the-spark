/**
 * SPARK — S193 `s193/visuals-board` (V27) — **MIST ALONG THE EDGE OF WHAT YOU CAN SEE.**
 *
 * The S82 fog brush gave the vision hole a fuzzy edge; the shroud past it is a flat dim sheet. This
 * lays slow-drifting soft mist puffs just OUTSIDE the edge, so the boundary reads as fog rolling at
 * the limit of sight rather than a cut-out.
 *
 * ⛔⛔ THE FOG IS A GAME-RULE SURFACE, SO THIS IS BUILT TO BE INCAPABLE OF REVEALING ANYTHING:
 *   1. it only ADDS (normal-blend puffs drawn OVER the shroud, inside the fog container); it erases
 *      nothing, and concealment is per-entity culling (`concealment.ts`) that this never touches;
 *   2. its geometry is a function of the LOCAL seat's own vision sources and its own quarter only —
 *      the same inputs the mask is already cut from — so no puff's position, size or alpha can carry
 *      information about the enemy (it never reads an enemy entity);
 *   3. it peaks just past the fade band and is ZERO well inside it, so it never veils your own
 *      visible ground or your own units.
 *
 * ## How it is laid out (PURE)
 * A fixed board lattice of `FOG_MIST_CELL` px. For each lattice point the signed distance `d` to the
 * nearest vision edge (`radius + VISION_FADE_PX` of the nearest source, or the own-quarter rectangle)
 * is found by stamping each source over only the cells it can reach. A point's mist weight is a soft
 * bump of `d` (0 inside the edge, peak 40 px out, 0 by 120 px out), so as the cursor moves the mist slides
 * with the edge instead of popping cell by cell. Points are thinned by a fixed hash to keep the count
 * near `FOG_MIST_MAX`. Every number is MINE (⚠ owner LOOK item).
 */

import { fxHash, type FxSink } from './emitter.ts';

export const FOG_MIST_CELL = 48;
/** Hard ceiling on puffs per frame (the plan's "~60 sprites"). */
export const FOG_MIST_MAX = 72;
/** Where the bump starts, peaks and ends, in px past the vision edge. */
/*
 * ⚠ S193 audit LOW 1 — moved out 60 px (was 0 / 40 / 120). A puff is ~100-160 px wide, so with the
 * bump starting AT the edge its body reached ~75 px back inside what you can see. Starting it 60 px
 * out keeps the mist where the claim says it is: in the fog, outside the edge.
 */
export const FOG_MIST_D0 = 60;
export const FOG_MIST_PEAK = 100;
export const FOG_MIST_D1 = 180;
/** Fraction of edge points that carry a puff (a fixed per-point hash, so the choice never flickers). */
export const FOG_MIST_KEEP = 0.55;
const MIST_TINT = 0x8090a8;
const MIST_ALPHA = 0.26;

export interface MistSource { readonly x: number; readonly y: number; readonly radius: number }
export interface MistRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** The lattice for a `width × height` board. `d` is reused frame to frame (no allocation per frame). */
export interface MistField {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly d: Float32Array;
}

export function makeMistField(width: number, height: number): MistField {
  const cols = Math.ceil(width / FOG_MIST_CELL) + 1;
  const rows = Math.ceil(height / FOG_MIST_CELL) + 1;
  return { cols, rows, width, height, d: new Float32Array(cols * rows) };
}

/** The soft bump: 0 at/below D0, 1 at PEAK, 0 at/above D1. PURE. */
export function mistWeight(d: number): number {
  if (d <= FOG_MIST_D0 || d >= FOG_MIST_D1) return 0;
  const t = d < FOG_MIST_PEAK ? (d - FOG_MIST_D0) / (FOG_MIST_PEAK - FOG_MIST_D0) : (FOG_MIST_D1 - d) / (FOG_MIST_D1 - FOG_MIST_PEAK);
  return t * t * (3 - 2 * t);
}

/**
 * Fill `field.d` with each lattice point's signed distance past the nearest vision edge (negative =
 * inside what you can see). `fadePx` is `VISION_FADE_PX`. Points out of every source's reach keep
 * +Infinity (deep fog: no mist there). PURE over its inputs.
 */
export function computeMistField(field: MistField, sources: readonly MistSource[], ownZone: MistRect | null, fadePx: number): void {
  const { cols, rows, d } = field;
  d.fill(Number.POSITIVE_INFINITY);
  const C = FOG_MIST_CELL;
  for (const s of sources) {
    const edge = s.radius + fadePx;
    const reach = edge + FOG_MIST_D1;
    const c0 = Math.max(0, Math.floor((s.x - reach) / C));
    const c1 = Math.min(cols - 1, Math.ceil((s.x + reach) / C));
    const r0 = Math.max(0, Math.floor((s.y - reach) / C));
    const r1 = Math.min(rows - 1, Math.ceil((s.y + reach) / C));
    for (let r = r0; r <= r1; r++) {
      const dy = r * C - s.y;
      for (let c = c0; c <= c1; c++) {
        const dx = c * C - s.x;
        const v = Math.sqrt(dx * dx + dy * dy) - edge;
        const i = r * cols + c;
        if (v < d[i]!) d[i] = v;
      }
    }
  }
  if (ownZone !== null) {
    // The own quarter is lit edge to edge; its edge is the rectangle (no fade band: it is a hard erase).
    // ⚠ Only its INTERIOR edges count: the side that is the board's own border is not a vision edge,
    // and counting it would lay mist over the rim of your own quarter.
    const L = ownZone.x > 0;
    const R = ownZone.x + ownZone.w < field.width;
    const T = ownZone.y > 0;
    const B = ownZone.y + ownZone.h < field.height;
    for (let r = 0; r < rows; r++) {
      const y = r * C;
      for (let c = 0; c < cols; c++) {
        const x = c * C;
        const ox = Math.max(ownZone.x - x, 0, x - (ownZone.x + ownZone.w));
        const oy = Math.max(ownZone.y - y, 0, y - (ownZone.y + ownZone.h));
        const inside = ox === 0 && oy === 0;
        const v = inside
          ? -Math.min(
            L ? x - ownZone.x : Infinity,
            R ? ownZone.x + ownZone.w - x : Infinity,
            T ? y - ownZone.y : Infinity,
            B ? ownZone.y + ownZone.h - y : Infinity,
          )
          : Math.sqrt(ox * ox + oy * oy);
        const i = r * cols + c;
        if (v < d[i]!) d[i] = v;
      }
    }
  }
}

/**
 * Emit the mist for this frame. `fogAlpha` is the fog's own 0..1 strength (it fades with the win-lift).
 * Each puff drifts slowly on its own hashed heading and breathes; its alpha is its point's weight.
 */
export function fogMistFx(sink: FxSink, field: MistField, tick: number, fogAlpha: number): number {
  if (fogAlpha <= 0) return 0;
  const { cols, rows, d } = field;
  const C = FOG_MIST_CELL;
  /*
   * ⚠ S193 audit LOW 2 — THIN EVENLY, DO NOT TRUNCATE. The cap used to fire in ~94 % of frames and the
   * lattice is walked top-down, so the bottom of the board got no mist at all. Count the candidates
   * first and lower the keep fraction to fit the cap (a fixed per-point hash, so the choice is stable
   * for a given field); the hard cap below is only a backstop now.
   */
  let candidates = 0;
  for (let i = 0; i < d.length; i++) if (mistWeight(d[i]!) > 0) candidates++;
  const keep = candidates === 0 ? 0 : Math.min(FOG_MIST_KEEP, (FOG_MIST_MAX * 0.9) / candidates);
  let n = 0;
  for (let r = 0; r < rows && n < FOG_MIST_MAX; r++) {
    for (let c = 0; c < cols && n < FOG_MIST_MAX; c++) {
      const i = r * cols + c;
      const w = mistWeight(d[i]!);
      if (w <= 0) continue;
      if (fxHash(0xf06, i) >= keep) continue;
      const h1 = fxHash(0xf06, i, 1);
      const h2 = fxHash(0xf06, i, 2);
      const h3 = fxHash(0xf06, i, 3);
      const a = h1 * Math.PI * 2;
      const drift = Math.sin(tick * 0.004 + h2 * 6.283) * 16;
      const x = c * C + (h2 - 0.5) * C * 0.8 + Math.cos(a) * drift;
      const y = r * C + (h3 - 0.5) * C * 0.8 + Math.sin(a) * drift * 0.6;
      const breath = 0.75 + 0.25 * Math.sin(tick * 0.011 + h1 * 6.283);
      const size = 100 + 60 * h3;
      sink.emit('smoke', x, y, size, size * 0.7, a + tick * 0.0008, MIST_ALPHA * w * breath * fogAlpha, MIST_TINT, 'normal');
      n++;
    }
  }
  return n;
}
