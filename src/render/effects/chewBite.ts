/**
 * CHEW_BITE — S100 P1 (TD Phase 1a) chewer bite burst. A small bite ring + a
 * graphite-dust spray at the chewed bond midpoint, fading over its lifetime
 * (~0.6 s). Modeled on `drawBombExplode` (small-scale) — a quick punctuation
 * mark each time a chewer gnaws a connector (one per non-final CHEW_INTERVAL).
 *
 * Pure drawer (parent owns the shared Graphics + the age→t mapping), mirroring
 * `bombExplode.ts`/`severErase.ts`. `t` is progress 0..1 across the effect
 * lifetime. HOST-LOCAL ONLY — this effect is never serialized to the wire, so
 * it carries no protocol surface (TOWER_DEFENSE_DESIGN.md §5.2).
 *
 * `creatureId` keys the graphite-dust spray angles so two chewers biting on the
 * same tick read as distinct sprays (the ARC_FLASH.creatureId jitter precedent).
 * Deterministic by id — but this is a RENDER-ONLY drawer so even pure
 * `Math.*`-free jitter here can never touch sim state.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';

const BITE_RING_COLOR = 0x6b6f7a; // graphite grey ring (pencil-lead)
const DUST_COLOR = 0x3a3d44; // darker graphite crumb
const DUST_LIGHT = 0x9aa0ac; // lighter smudge fleck
const BASE_RADIUS = 7; // small — a bite, not a blast
const RING_MAX_SCALE = 2.6;
const DUST_COUNT = 6; // little crumbs flung out

export function drawChewBite(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'CHEW_BITE' }>,
  t: number,
): void {
  const { x, y } = effect.pos;
  const r = BASE_RADIUS;

  // Expanding bite ring (ease-out so it pops then settles), like the bomb ring
  // but small + graphite-grey rather than orange.
  const easeOut = 1 - (1 - t) * (1 - t);
  const ringR = r * (1 + easeOut * (RING_MAX_SCALE - 1));
  const ringAlpha = (1 - t) * 0.55;
  g.circle(x, y, ringR).stroke({ width: 2, color: BITE_RING_COLOR, alpha: ringAlpha });

  // A second, faster inner crescent — reads as the "bite mark" snapping shut.
  const innerR = r * (0.5 + easeOut * 0.8);
  g.circle(x, y, innerR).stroke({ width: 1.5, color: DUST_LIGHT, alpha: (1 - t) * 0.4 });

  // Graphite-dust burst: a ring of little crumbs flung outward, decelerating.
  // Per-emitter phase from creatureId so simultaneous bites scatter differently.
  const idPhase = ((effect.creatureId as number) * 0.6180339887) % 1; // golden-ratio spread
  const spread = r * (1.4 + easeOut * 3.2);
  const dustAlpha = (1 - t) * 0.8;
  for (let i = 0; i < DUST_COUNT; i++) {
    const ang = ((i / DUST_COUNT) + idPhase) * Math.PI * 2;
    // Alternate crumb size + colour so the spray reads as graphite grit.
    const far = spread * (0.7 + 0.3 * ((i * 7 + (effect.creatureId as number)) % 5) / 4);
    const cx = x + Math.cos(ang) * far;
    const cy = y + Math.sin(ang) * far;
    const crumbR = (i % 2 === 0 ? 1.6 : 1.0) * (1 - 0.4 * t);
    g.circle(cx, cy, crumbR).fill({
      color: i % 3 === 0 ? DUST_LIGHT : DUST_COLOR,
      alpha: dustAlpha,
    });
  }
}
