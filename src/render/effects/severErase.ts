/**
 * SEVER_ERASE — ghost circle that shrinks + fades at the deleted
 * primitive's last position (~0.5s erase), with a faint outward
 * shockwave. Quadratic ease-in.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';
import { severEraseFx } from '../fx/buildFx.ts';
import { fxSeedAt } from '../fx/emitter.ts';
import { fxActive, fxTop } from '../fx/fxState.ts';

export function drawSeverErase(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'SEVER_ERASE' }>,
  t: number,
): void {
  // ⭐ S193 (V20) — soft light replaces the flat ghost + 1 px ring when the fx layers are live.
  if (fxActive()) {
    severEraseFx(fxTop(), fxSeedAt(effect.tick, effect.pos.x, effect.pos.y), effect.pos.x, effect.pos.y, effect.radius, effect.color, t);
    return;
  }
  const eased = t * t; // quadratic ease-in
  const ghostR = effect.radius * (1 - 0.4 * eased);
  const ghostAlpha = (1 - eased) * 0.7;
  g.circle(effect.pos.x, effect.pos.y, ghostR).fill({
    color: effect.color,
    alpha: ghostAlpha,
  });
  const shockR = effect.radius + eased * effect.radius * 3.5;
  const shockAlpha = (1 - eased) * 0.4;
  g.circle(effect.pos.x, effect.pos.y, shockR).stroke({
    width: 1,
    color: effect.color,
    alpha: shockAlpha,
  });
}
