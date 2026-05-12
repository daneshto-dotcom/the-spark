/**
 * S10 P4 / S13 P4 — score-tier-crossing pulse at the placement position.
 *
 * S10 design (corner anchor near HUD progress bar) replaced in S13 P4
 * with a center pulse at effect.pos — typically the new primitive's
 * world position. The HUD progress bar itself still fills continuously
 * as the running indicator; this pulse is the *moment* of tier crossing,
 * co-located with the player's foveal attention at the placement cursor.
 *
 * Geometry: soft outer bloom + sharp leading ring, both sine-enveloped
 * over SCORE_TIER_DURATION_TICKS. Scaled up from S10's corner sizes for
 * visibility against an open canvas.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';
import { SCORE_TIER_DURATION_TICKS } from './lifetime.ts';

export function drawScoreTier(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'SCORE_TIER' }>,
  age: number,
): void {
  const t = age / SCORE_TIER_DURATION_TICKS;
  if (t > 1) return;
  const env = Math.sin(t * Math.PI);
  const cx = effect.pos.x;
  const cy = effect.pos.y;
  // Soft outer bloom — fills behind the ring. Starts at 60 (S10 was 28
  // at corner; doubled for visibility in open canvas) and grows to 100.
  const bloomR = 60 + t * 40;
  g.circle(cx, cy, bloomR).fill({
    color: effect.color,
    alpha: 0.38 * env,
  });
  // Sharp leading ring — expands faster than the bloom for a "pop" feel.
  // 40 → 100 px over the duration; 3 px stroke width vs S10's 2.
  const ringR = 40 + t * 60;
  g.circle(cx, cy, ringR).stroke({
    width: 3,
    color: effect.color,
    alpha: 0.7 * env,
  });
}
