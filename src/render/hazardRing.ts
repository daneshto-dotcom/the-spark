/**
 * SPARK — S85 P4b: above-fog HAZARD IDENTITY ring (the S77 Δ5 carry-forward).
 *
 * S77 P2 made global-reach entities render in aboveFogLayer as bare sprites
 * over the fog. Through near-black fog a hostile hazard (hunter, potato bomb)
 * reads as "some blob" — and the potato's existing ARMED ring is pure-red,
 * exactly the channel CVD players lose. This module draws a slow-pulsing
 * DASHED WHITE ring around hostile hazards: a luminance + motion cue (no
 * color channel), the same CVD posture as the S82 P{n} nameplates.
 *
 * Drawn INSIDE each hazard renderer's existing Graphics — adds NO children to
 * aboveFogLayer (the fog.spec children-count contract stays at its roll call).
 *
 * The rainbow (a goodie) and Voltkin (a 256px animated creature with its own
 * cinematic intro) deliberately get NO ring — the ring MEANS "hostile hazard".
 */

import type { Graphics } from 'pixi.js';

const SEGMENTS = 6;
/** Fraction of each segment slot that is drawn (rest is the dash gap). */
const DASH_FILL = 0.62;
const RING_COLOR = 0xffffff;
const ROTATE_HZ = 0.15; // slow crawl — readable motion, nowhere near strobe
const PULSE_HZ = 0.8;
const ALPHA_BASE = 0.28;
const ALPHA_AMP = 0.17; // alpha sweeps 0.28 ± 0.17 → 0.11..0.45

export interface RingSegment {
  readonly start: number;
  readonly end: number;
}

/**
 * Pure geometry: the dashed-ring segment angles at time tSec (wall-clock
 * seconds — the potato/hunter renderers' existing cosmetic-anim convention).
 * Exported for unit tests: segment count, dash fill ratio, rotation drift.
 */
export function hazardRingSegments(tSec: number): RingSegment[] {
  const rot = tSec * ROTATE_HZ * Math.PI * 2;
  const slot = (Math.PI * 2) / SEGMENTS;
  const segs: RingSegment[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const start = rot + i * slot;
    segs.push({ start, end: start + slot * DASH_FILL });
  }
  return segs;
}

/** Pure: ring alpha pulse at time tSec. Exported for unit tests (range lock). */
export function hazardRingAlpha(tSec: number): number {
  return ALPHA_BASE + Math.sin(tSec * PULSE_HZ * Math.PI * 2) * ALPHA_AMP;
}

/** Stroke the dashed identity ring into an existing per-frame Graphics. */
export function drawHazardRing(g: Graphics, x: number, y: number, radius: number, tSec: number): void {
  const alpha = hazardRingAlpha(tSec);
  for (const seg of hazardRingSegments(tSec)) {
    // S86 P2 — lift the pen to the dash start BEFORE arc(): canvas-path
    // semantics make arc() draw a connecting LINE from the current pen
    // position to the arc start, and on a freshly-cleared Graphics that pen
    // sits at the world origin — round-6 playtest screenshots showed a stray
    // line from screen top-left to every ringed hazard (and chords bridging
    // the dash gaps). moveTo starts each dash as its own subpath.
    g.moveTo(x + radius * Math.cos(seg.start), y + radius * Math.sin(seg.start))
      .arc(x, y, radius, seg.start, seg.end)
      .stroke({ width: 1.5, color: RING_COLOR, alpha });
  }
}
