/**
 * SPARK — S192 `s192/visuals` STEP 3 (V06) — **THE CASTLE GUN'S BOLT, LIT.**
 *
 * The race ammunition stays exactly what S161 drew (`raceMotifs.ts` `drawCastleShotVfx`: the bat fan,
 * the water lance, the sand spray, the spore glob, the tumbling axe, the shadow bolt). Those shapes ARE
 * the race identity, so they are not replaced. This adds the light around them:
 *   · a soft GLOW HALO in the race colour around the head, with a white-hot core;
 *   · a 6-mote TRAIL behind it, shrinking and whitening towards the tail;
 *   · on arrival (the last 20 % of the flight) an IMPACT: a flash, a small burst ring and 8 sparks.
 * Every number is MINE.
 *
 * ⚠ Same clock and same cosmetic contract as the S161 drawer: `progress` is `ticksSinceCastleShot /
 * CASTLE_SHOT_VFX_TICKS`, derived from synced state by the caller, and nothing here reads `raceId` or
 * changes a number (`castleGuns.ts`: *"Nothing in this file reads `raceId`, and nothing ever may"*).
 * The seed is the seat and the shot's own fire tick, so every screen throws the same sparks.
 */

import { clamp01, easeOutCubic, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

export const CASTLE_SHOT_FX_TRAIL = 6;
export const CASTLE_SHOT_FX_SPARKS = 8;
/** Fraction of the flight at which the impact begins. */
export const CASTLE_SHOT_FX_IMPACT_AT = 0.8;

/** Where the bolt's head is at `t` (the same straight flight the S161 drawer uses). PURE. */
export function castleShotHead(fromX: number, fromY: number, toX: number, toY: number, t: number): { x: number; y: number } {
  const c = clamp01(t);
  return { x: fromX + (toX - fromX) * c, y: fromY + (toY - fromY) * c };
}

export function castleShotFx(
  top: FxSink,
  fromX: number, fromY: number, toX: number, toY: number,
  progress: number,
  color: number,
  seat: number,
  fireTick: number,
): void {
  const t = clamp01(progress);
  if (progress < 0 || progress >= 1) return;
  const seed = fxSeed(seat * 100003 + fireTick, 0xca5);
  const dir = Math.atan2(toY - fromY, toX - fromX);
  const head = castleShotHead(fromX, fromY, toX, toY, t);
  const fade = 1 - t * 0.5;

  // The trail, oldest first so the head draws on top.
  for (let i = CASTLE_SHOT_FX_TRAIL; i >= 1; i--) {
    const tt = t - i * 0.035;
    if (tt <= 0) continue;
    const p = castleShotHead(fromX, fromY, toX, toY, tt);
    const k = i / CASTLE_SHOT_FX_TRAIL;
    const size = 12 * (1 - 0.7 * k);
    top.emit('soft', p.x, p.y, size * 1.8, size, dir, (1 - k) * 0.7 * fade, mixColor(color, 0xffffff, 0.2 + 0.5 * k), 'add');
  }
  // The head: halo, then core.
  top.emit('soft', head.x, head.y, 30, 30, 0, 0.75 * fade, color, 'add');
  top.emit('core', head.x, head.y, 12, 12, 0, 0.95 * fade, 0xffffff, 'add');

  // The impact.
  const it = (t - CASTLE_SHOT_FX_IMPACT_AT) / (1 - CASTLE_SHOT_FX_IMPACT_AT);
  if (it > 0) {
    top.emit('core', toX, toY, 34 * (1 - it) + 10, 34 * (1 - it) + 10, 0, (1 - it) * 0.9, mixColor(color, 0xffffff, 0.5), 'add');
    const ringD = 14 + 46 * easeOutCubic(it);
    top.emit('ring', toX, toY, ringD, ringD * 0.65, 0, (1 - it) * 0.85, color, 'add');
    for (let s = 0; s < CASTLE_SHOT_FX_SPARKS; s++) {
      const a = fxHash(seed, s, 1) * Math.PI * 2;
      const d = (10 + 26 * fxHash(seed, s, 2)) * easeOutCubic(it);
      top.emit('soft', toX + Math.cos(a) * d, toY + Math.sin(a) * d * 0.7, 9 * (1 - it) + 3, 3, a, (1 - it) * 0.9,
        mixColor(0xffffff, color, it), 'add');
    }
  }
}
