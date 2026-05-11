/**
 * S10 P4: corner pulse near the progress bar at every SCORE_TIER_STEP
 * boundary crossing. Soft fill + sharp leading ring, sine-envelope over
 * SCORE_TIER_DURATION_TICKS. Renderer-only (no world lookup needed) so
 * it draws cleanly even if a tier event lands during a load/restore.
 *
 * Corner anchor is co-located with HUD progress-bar layout in ui.ts
 * (PROGRESS_X=12, PROGRESS_WIDTH=80, PROGRESS_Y vertical track at
 * CANVAS_HEIGHT-80..-40). If those values move in ui.ts, update here too.
 */

import { Graphics } from 'pixi.js';
import { CANVAS_HEIGHT } from '../../constants.ts';
import type { GameEffect } from '../../game/effects.ts';
import { SCORE_TIER_DURATION_TICKS } from './lifetime.ts';

const SCORE_TIER_CENTER_X = 12 + 80 / 2;
const SCORE_TIER_CENTER_Y = CANVAS_HEIGHT - 60;

export function drawScoreTier(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'SCORE_TIER' }>,
  age: number,
): void {
  const t = age / SCORE_TIER_DURATION_TICKS;
  if (t > 1) return;
  const env = Math.sin(t * Math.PI);
  // Soft outer bloom — filled disc, generous radius.
  const bloomR = 28 + t * 28;
  g.circle(SCORE_TIER_CENTER_X, SCORE_TIER_CENTER_Y, bloomR).fill({
    color: effect.color,
    alpha: 0.38 * env,
  });
  // Sharp leading ring — expands faster than the bloom.
  const ringR = 18 + t * 50;
  g.circle(SCORE_TIER_CENTER_X, SCORE_TIER_CENTER_Y, ringR).stroke({
    width: 2,
    color: effect.color,
    alpha: 0.7 * env,
  });
}
