/**
 * SEVER_ERASE — ghost circle that shrinks + fades at the deleted
 * primitive's last position (~0.5s erase), with a faint outward
 * shockwave. Quadratic ease-in.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';

export function drawSeverErase(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'SEVER_ERASE' }>,
  t: number,
): void {
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
