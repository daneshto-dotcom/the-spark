/**
 * SPARK — S192 `s192/visuals` PILOT 2 — **THE BUILDING AURA, REBUILT AS A POOL OF LIGHT AND RISING EMBERS.**
 *
 * The S100 aura (`spawnerZoneRenderer.ts`, kept intact behind `?fx=legacy`) was a 6-11 % disc, three
 * 2 px radiating rings, a stroke over every bond, midpoint beads and a core dot — and since S183 all
 * of it fades to nothing under a finished building (owner: *"the old triangles and connectors between
 * them and that little graphic that have it, like, radiate … That's what I'm having issue with."*).
 *
 * ⭐ WHAT THIS DRAWS INSTEAD — every number is MINE; the owner approved "the building aura" as a
 * pilot item (S192) and has not seen it yet:
 *   · a soft owner-coloured POOL OF LIGHT on the ground under the footprint, breathing slowly
 *     (two additive ellipses: a wide dim one and a brighter inner one);
 *   · slow RISING EMBERS around the footprint — 12 to 28 by footprint size — drifting up with a sway,
 *     fading in and out, tinted towards white.
 *
 * ⛔ AND WHAT IT DELIBERATELY DOES NOT DRAW: rings, bond strokes, beads or a core dot. Those are the
 * pieces he objected to, and they stay faded under the building exactly as S183 ruled. Unlike them,
 * the pool and the embers stay visible AROUND a covered building: they are not a copy of its
 * connectors, they are light coming off it. ⚠ That is a new look, recorded in the progress file as
 * the first thing to show him.
 *
 * ⚠ The pulse and the embers age on `world.tick` and phase by the spawner id: two towers never
 * breathe in step, and every screen sees the same embers. No `performance.now()` (the legacy aura's
 * bond shimmer used it; it is kept only in the legacy path).
 */

import { envelope, forEachLive, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

/** Ember life, ticks. */
export const AURA_EMBER_LIFE = 120;
/** One full breath of the light pool, ticks. */
export const AURA_PULSE_TICKS = 110;

/** Live embers for a footprint of `radius` px: 12 for the smallest tower, 28 at most. */
export function auraEmberCount(radius: number): number {
  return Math.max(12, Math.min(28, Math.round(10 + radius / 5)));
}
/** The emitter period that keeps `auraEmberCount` embers alive at once. */
export function auraEmberPeriod(radius: number): number {
  return Math.max(1, Math.ceil(AURA_EMBER_LIFE / auraEmberCount(radius)));
}

export function auraFx(
  ground: FxSink,
  top: FxSink,
  spawnerId: number,
  cx: number,
  cy: number,
  radius: number,
  tint: number,
  tick: number,
): void {
  const phase = spawnerId * 37;
  const pulse = 0.5 + 0.5 * Math.sin((((tick + phase) % AURA_PULSE_TICKS) / AURA_PULSE_TICKS) * Math.PI * 2);
  const bright = mixColor(tint, 0xffffff, 0.35);

  // The pool: wide and dim, then inner and brighter. Squashed to the board's perspective.
  ground.emit('soft', cx, cy + radius * 0.15, radius * 3.0, radius * 1.4, 0, 0.3 + 0.12 * pulse, tint, 'add');
  ground.emit('soft', cx, cy + radius * 0.1, radius * 1.6, radius * 0.72, 0, 0.3 + 0.14 * pulse, bright, 'add');

  // The embers.
  const ember = mixColor(tint, 0xffffff, 0.5);
  forEachLive(tick, auraEmberPeriod(radius), AURA_EMBER_LIFE, 1, phase, (b, k, t) => {
    const e = auraEmberAt(spawnerId, b, k, t, cx, cy, radius);
    top.emit('core', e.x, e.y, e.size, e.size * 1.6, 0, e.alpha, ember, 'add');
  });
}

/**
 * PURE — ember (birth `b`, index `k`) of spawner `spawnerId` at life fraction `t`. Exported so the test
 * can follow ONE ember through its life (it rises, it fades in and out) without a renderer.
 */
export function auraEmberAt(
  spawnerId: number, b: number, k: number, t: number, cx: number, cy: number, radius: number,
): { x: number; y: number; size: number; alpha: number } {
  const seed = fxSeed(spawnerId, 0xa0a);
  const h1 = fxHash(seed, b, k);
  const h2 = fxHash(seed, b, k + 101);
  const h3 = fxHash(seed, b, k + 202);
  const a = h1 * Math.PI * 2;
  const rr = radius * (0.35 + 0.75 * h2);
  const rise = (40 + 55 * h3) * t;
  const sway = Math.sin(t * Math.PI * 2 * (0.6 + h2) + h1 * 6.283) * 6;
  return {
    x: cx + Math.cos(a) * rr + sway,
    y: cy + Math.sin(a) * rr * 0.5 - rise,
    size: 6 + 6 * h3,
    alpha: envelope(t, 0.2) * (0.7 + 0.3 * h1),
  };
}
