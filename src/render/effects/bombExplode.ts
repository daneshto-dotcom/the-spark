/**
 * BOMB_EXPLODE — S71 P1 bomb detonation burst. An expanding orange shock ring +
 * a warm flash core at the bomb position, fading over its lifetime (~0.6s).
 * Ease-out on the ring expansion (bursts fast, eases out); linear alpha fade.
 *
 * Pure drawer (parent owns the shared Graphics + the age→t mapping), mirroring
 * severErase.ts. `t` is progress 0..1 across the effect lifetime.
 */

import { Graphics } from 'pixi.js';
import type { GameEffect } from '../../game/effects.ts';

const CORE_COLOR = 0xffd27a; // warm white-orange flash
const RING_COLOR = 0xff7a2a; // orange shock ring
const RING_MAX_SCALE = 3.2;  // ring expands to radius × this

export function drawBombExplode(
  g: Graphics,
  effect: Extract<GameEffect, { kind: 'BOMB_EXPLODE' }>,
  t: number,
): void {
  const { x, y } = effect.pos;
  const r = effect.radius;

  // Expanding shock ring (ease-out so it bursts then settles).
  const easeOut = 1 - (1 - t) * (1 - t);
  const ringR = r * (1 + easeOut * (RING_MAX_SCALE - 1));
  const ringAlpha = (1 - t) * 0.6;
  g.circle(x, y, ringR).stroke({ width: 3, color: RING_COLOR, alpha: ringAlpha });

  // Bright flash core that shrinks + fades.
  const coreR = r * (1 - 0.5 * t);
  const coreAlpha = (1 - t) * 0.85;
  g.circle(x, y, coreR).fill({ color: CORE_COLOR, alpha: coreAlpha });
}
