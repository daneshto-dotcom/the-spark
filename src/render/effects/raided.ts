/**
 * SPARK — S152 P1 (owner R78) — THE "RAIDED" CLOUD.
 *
 * Owner: *"leaving a "RAIDED" cloud where that unit used to stand and the clouds color is [that of]
 * the player that raided it, the cloud dissipates within 3 sec … so that players wont be confused
 * as in WHAT HAPPENED TO MY UNIT!? it just disappeared!? and they will know who attacked them
 * adding heated exchanges!"*
 *
 * ⭐ THIS IS AN ATTRIBUTION MESSAGE, NOT AN EXPLOSION. Every other effect in this folder is a
 * ~0.4s punctuation mark on something the player was already watching. This one exists to be found
 * by someone who was looking somewhere else, up to three seconds later. That drives every choice
 * here: it lives far longer, it holds near-full opacity through the first half instead of fading
 * immediately, and it is drawn in a SATURATED, UNMIXED player colour so "who" is legible at a
 * glance rather than inferred from a tint.
 *
 * ⚠ THE COLOUR IS THE RAIDER'S. Drawing it in the victim's colour would make the effect
 * indistinguishable from any other death and destroy the only reason it exists.
 */

import type { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';

/** Puff offsets, as fractions of the cloud radius. Fixed, not random — see the note below. */
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  // [dx, dy, r] — a lopsided ring so it reads as a cloud rather than a target reticle.
  [0.0, -0.35, 0.62],
  [-0.55, -0.05, 0.5],
  [0.55, -0.1, 0.54],
  [-0.3, 0.3, 0.44],
  [0.34, 0.32, 0.46],
];

const BASE_RADIUS = 16;

/**
 * @param t normalised age, 0 → 1 across `RAIDED_CLOUD_TICKS`.
 *
 * ⚠ NO `Math.random()` ANYWHERE. Effects are serialized and replayed on the victim's peer, and a
 * per-frame random would make the same cloud look different on each side of the wire — which for an
 * attribution channel is worse than ugly, it is untrustworthy. The puff layout is a constant table
 * and every motion below is a pure function of `t`.
 */
export function drawRaided(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'RAIDED' }>,
  t: number,
): void {
  const { x, y } = effect.pos;

  // Hold, then go. Opacity stays high for the first ~55% so a player glancing over still catches it,
  // then falls away smoothly. A linear fade over 3s spends most of its life nearly invisible.
  const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
  const alpha = Math.max(0, fade);

  // Billow outward and drift up, easing off — smoke, not a shockwave.
  const eased = 1 - (1 - t) * (1 - t);
  const spread = 1 + eased * 0.85;
  const rise = eased * 14;
  // A survived hit is a smaller mark than a kill: same language, lower volume.
  const scale = (effect.killed ? 1 : 0.6) * spread;

  for (const [dx, dy, pr] of PUFFS) {
    g.circle(
      x + dx * BASE_RADIUS * spread,
      y + dy * BASE_RADIUS * spread - rise,
      pr * BASE_RADIUS * scale,
    ).fill({ color: effect.color, alpha: alpha * 0.42 });
  }

  // A crisp ring at the exact spot the target stood. The puffs drift and grow; this does not, so
  // the cloud still POINTS at the position after it has billowed away from it.
  g.circle(x, y, BASE_RADIUS * 0.32).stroke({
    width: 2,
    color: effect.color,
    alpha: alpha * 0.9,
  });

  // Two ticks crossing the ring — a small "struck here" mark that survives at low alpha and keeps
  // the cloud from reading as an ordinary spawn puff.
  const armLen = BASE_RADIUS * (0.55 + eased * 0.25);
  for (const [ax, ay] of [
    [1, 1],
    [1, -1],
  ] as const) {
    g.moveTo(x + ax * armLen * 0.45, y + ay * armLen * 0.45)
      .lineTo(x + ax * armLen, y + ay * armLen)
      .stroke({ width: 2, color: effect.color, alpha: alpha * 0.7 });
  }
}
