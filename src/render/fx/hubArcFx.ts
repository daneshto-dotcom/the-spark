/**
 * SPARK — S194 `s194/visuals-6` — **THE LIGHTNING HUB'S ARCS (the V07 leftover).**
 *
 * S192 plan V07 listed four lightning sources: Voltkin arc, laser turret, drone cloud, lightning hub.
 * S193 visuals-4 rebuilt the first three and recorded the fourth as not doable in its file set: *"no arc
 * drawer exists"*. That was accurate — the hub's only effect was its BOMB_EXPLODE blast. A lightning
 * tower that never throws lightning is this item. So this adds the arcs, in the V07 vocabulary
 * (`lightningFx.ts`: a wide soft glow + a hot sheath, a thin white core, sparks at the end, a flicker and a
 * re-strike keyed to the tick):
 *   · a constant small CRACKLE round the crown (the TV crackle's drawer, at a quarter of the art);
 *   · every `HUB_ARC_CYCLE_TICKS` a DISCHARGE: one or two bolts from the crown to the ground at the base,
 *     each lasting `HUB_ARC_LIFE_TICKS` with sparks thrown where it lands.
 *
 * ⛔ PURE, no `Math.random`, no clock: the cycle, the landing points and every jag are hashes of (the
 * hub's anchor id, the cycle number, the tick). Cosmetic only — it is not the hub's attack (the hub has
 * none; its drones are). Every number is MINE (⚠ owner LOOK item).
 */

import { fxHash, fxSeed, type FxSink } from './emitter.ts';
import {
  VOLT_STYLE, boltGlowFx, lightningCoreFx, lightningFlicker, lightningPath, lightningSparksFx, lightningStrikeSeed, tvCrackleFx,
} from './lightningFx.ts';

/** A discharge every this many ticks. MINE. */
export const HUB_ARC_CYCLE_TICKS = 50;
/** How long one discharge lasts. MINE. */
export const HUB_ARC_LIFE_TICKS = 16;
/** The crown (where the bolts leave) sits this fraction of the art height above the foot. MINE. */
export const HUB_CROWN_FRAC = 0.82;

/** Where the hub's discharge stands at `tick`: its number and age, or null between discharges. PURE. */
export function hubDischargeAt(id: number, tick: number): { cycle: number; age: number } | null {
  const off = Math.floor(fxHash(fxSeed(id, 0x4b0), 1) * HUB_ARC_CYCLE_TICKS);
  const t = tick + off;
  const cycle = Math.floor(t / HUB_ARC_CYCLE_TICKS);
  const age = t - cycle * HUB_ARC_CYCLE_TICKS;
  return age < HUB_ARC_LIFE_TICKS ? { cycle, age } : null;
}

export function hubArcFx(
  top: FxSink, id: number, footX: number, footY: number, artW: number, artH: number, tick: number, low: boolean,
): void {
  const seed = fxSeed(id, 0x4b0);
  const cx = footX;
  const cy = footY - artH * HUB_CROWN_FRAC;
  // The idle crackle round the crown.
  tvCrackleFx(top, cx, cy, Math.max(10, artW * 0.28), seed, tick, 0.55, low ? 1 : 2);

  const d = hubDischargeAt(id, tick);
  if (d === null) return;
  const t = d.age / HUB_ARC_LIFE_TICKS;
  const fade = 1 - t * t;
  const bolts = low ? 1 : 2;
  const R = Math.max(30, artW * 0.7);
  for (let k = 0; k < bolts; k++) {
    const a = fxHash(seed, d.cycle, 10 + k) * Math.PI * 2;
    const f = 0.65 + 0.4 * fxHash(seed, d.cycle, 20 + k);
    const tx = footX + Math.cos(a) * R * f;
    const ty = footY + Math.sin(a) * R * 0.36 * f;
    const s = lightningStrikeSeed(seed ^ Math.imul(d.cycle + 1, 0x2c1b3c6d) ^ (k * 0x51ed), tick);
    const len = Math.hypot(tx - cx, ty - cy);
    const path = lightningPath(s, cx, cy, tx, ty, 5, len * 0.14);
    const alpha = lightningFlicker(s, tick) * fade;
    boltGlowFx(top, path, VOLT_STYLE, alpha, 0.6);
    lightningCoreFx(top, path, 2.2, 0.95 * alpha);
    lightningSparksFx(top, tx, ty, fxSeed(d.cycle, k + id), t, low ? 4 : 7, 22, VOLT_STYLE.sheath);
  }
  // the crown flashes as it fires
  top.emit('core', cx, cy, 16 * fade + 6, 16 * fade + 6, 0, 0.9 * fade, 0xffffff, 'add');
}
