/**
 * SPARK — S193 `s193/visuals-combat` (visuals-4, V13 + V23) — **ARROWS, HARPOONS, BITES AND SLAPS.**
 *
 * The silhouettes stay exactly what they were: the S153 arrow (plain or flaming, R84), the S154
 * harpoon, the S100 graphite bite ring and the S112 slap star-burst. This adds the light and debris
 * around them:
 *   · V13 — a soft MOTION TRAIL (4 fading streaks behind the tip, `PROJECTILE_TRAIL`) and an IMPACT
 *     PUFF where the shot lands: embers and a flash for a flaming shot, a dust puff and grit for a
 *     plain arrow or a harpoon;
 *   · V23 — the chewer's bite throws graphite chips that fall under gravity, with a dust puff and a
 *     small pale flash; Helga's slap gets a white-hot flash, a shock ring and eight star sparks.
 *
 * Smoke, dust and graphite DARKEN, so they go on the `shade` sink (normal blend, never bloomed —
 * S192 audit V-2); light goes on `top` (additive, bloomed).
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every `t` and `age`
 * the callers pass is derived from synced state (a creature's `ticksInState`, a defender's
 * `ticksInState`, an effect's age in ticks), and every seed from synced integers.
 *
 * ⚠ Every number in this file is MINE (not ruled).
 */

import { clamp01, easeOutCubic, fxHash, mixColor, type FxSink } from './emitter.ts';

/** Streaks in a projectile's motion trail (S192 plan V13: four). */
export const PROJECTILE_TRAIL = 4;
/** How long the impact puff lasts after the fire tick (ticks). */
export const PROJECTILE_IMPACT_TICKS = 12;

const FLAME_TINT = 0xff9a2e;
const FLAME_HOT = 0xffe08a;
const ASH_TINT = 0xf2e8d0;
const STEEL_TINT = 0xd6e2ee;
const DUST_TINT = 0x8a7f6c;

/**
 * THE TRAIL — `PROJECTILE_TRAIL` streaks at earlier points of the same straight flight, oldest
 * faintest. Along the flight axis, so they read as speed. A flaming shot's trail is fire; a plain
 * arrow's is a pale ash shimmer; a harpoon's is cold steel and a little wider.
 */
export function projectileTrailFx(
  top: FxSink,
  fromX: number, fromY: number, toX: number, toY: number,
  t: number, flaming: boolean, harpoon: boolean,
): void {
  if (t <= 0 || t > 1) return;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const rot = Math.atan2(dy, dx);
  const step = Math.min(0.09, 14 / len); // ~14 px between streaks, never more than 9 % of the flight
  const tint = flaming ? FLAME_TINT : harpoon ? STEEL_TINT : ASH_TINT;
  const w0 = flaming ? 9 : harpoon ? 6 : 4.5;
  const peak = flaming ? 0.75 : 0.45;
  for (let i = PROJECTILE_TRAIL; i >= 1; i--) {
    const tt = t - i * step;
    if (tt <= 0) continue;
    const k = i / PROJECTILE_TRAIL; // 1 = oldest
    const x = fromX + dx * tt;
    const y = fromY + dy * tt;
    top.emit('soft', x, y, 22 * (1 - 0.4 * k), w0 * (1 - 0.5 * k), rot, peak * (1 - k * 0.8),
      flaming ? mixColor(FLAME_HOT, tint, k) : tint, 'add');
  }
  if (flaming) {
    const hx = fromX + dx * t;
    const hy = fromY + dy * t;
    top.emit('soft', hx, hy, 18, 18, 0, 0.6, FLAME_TINT, 'add');
  }
}

/**
 * THE IMPACT — `t` 0..1 across `PROJECTILE_IMPACT_TICKS` after the fire tick, at the landing point.
 * Flaming: a hot flash and 7 embers thrown up and falling. Plain / harpoon: a small pale flash, a
 * dust puff that swells and fades, and 5 grit specks.
 */
export function projectileImpactFx(
  top: FxSink, shade: FxSink, x: number, y: number, t: number, flaming: boolean, seed: number,
): void {
  if (t < 0 || t >= 1) return;
  const life = 1 - t;
  const go = easeOutCubic(t);
  if (flaming) {
    const d = 26 * life + 8;
    top.emit('core', x, y, d, d, 0, 0.9 * life, FLAME_HOT, 'add');
    top.emit('soft', x, y, d * 2.2, d * 1.6, 0, 0.6 * life, FLAME_TINT, 'add');
    for (let s = 0; s < 7; s++) {
      const a = -Math.PI / 2 + (fxHash(seed, s, 0xe1) * 2 - 1) * 1.3;
      const v = 14 + 18 * fxHash(seed, s, 0xe2);
      const ex = x + Math.cos(a) * v * go;
      const ey = y + Math.sin(a) * v * go + 22 * t * t; // gravity
      top.emit('soft', ex, ey, 5 * life + 2, 5 * life + 2, 0, 0.95 * life, mixColor(FLAME_HOT, 0xd8341c, t), 'add');
    }
    return;
  }
  if (t < 0.4) {
    const k = 1 - t / 0.4;
    top.emit('core', x, y, 14 * k + 4, 14 * k + 4, 0, 0.7 * k, 0xfff6e0, 'add');
  }
  const puff = 10 + 18 * go;
  shade.emit('smoke', x, y - 3 * go, puff, puff * 0.75, fxHash(seed, 9, 0xe3) * Math.PI, 0.4 * life, DUST_TINT, 'normal');
  for (let s = 0; s < 5; s++) {
    const a = fxHash(seed, s, 0xe4) * Math.PI * 2;
    const d = (6 + 12 * fxHash(seed, s, 0xe5)) * go;
    shade.emit('soft', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 + 6 * t * t, 3, 3, 0, 0.75 * life, 0x4a4238, 'normal');
  }
}

/**
 * V23 — THE CHEW BITE. `t` 0..1 across the effect's life at the chewed connector's midpoint:
 * a pale flash snapping shut, a graphite dust puff, and 7 chips flung out that fall under gravity.
 */
export function chewBiteFx(top: FxSink, shade: FxSink, x: number, y: number, t: number, seed: number): void {
  if (t < 0 || t >= 1) return;
  const life = 1 - t;
  const go = easeOutCubic(t);
  if (t < 0.35) {
    const k = 1 - t / 0.35;
    top.emit('core', x, y, 18 * k + 4, 18 * k + 4, 0, 0.55 * k, 0xdfe6f0, 'add');
  }
  const puff = 10 + 16 * go;
  shade.emit('smoke', x, y - 2 * go, puff, puff * 0.8, fxHash(seed, 0, 0xb1) * Math.PI, 0.45 * life, 0x5a5e68, 'normal');
  for (let s = 0; s < 7; s++) {
    const a = -Math.PI / 2 + (fxHash(seed, s, 0xb2) * 2 - 1) * 1.6;
    const v = 10 + 16 * fxHash(seed, s, 0xb3);
    const cx = x + Math.cos(a) * v * go;
    const cy = y + Math.sin(a) * v * go + 26 * t * t; // the chips fall
    const sz = 2.2 + 2 * fxHash(seed, s, 0xb4);
    shade.emit('soft', cx, cy, sz * 1.6, sz, a + t * 6, 0.9 * life, s % 3 === 0 ? 0x9aa0ac : 0x2e3038, 'normal');
  }
}

/** Ticks the slap's light lasts — the same 8 the S112 star-burst fades over. */
export const SLAP_FX_TICKS = 8;

/**
 * V23 — HELGA'S SLAP. `ticksInState` is her synced FIRE-window clock; `seed` her id and the strike
 * tick. A white-hot flash, a shock ring that races out, and 8 star sparks.
 */
export function slapImpactFx(top: FxSink, x: number, y: number, ticksInState: number, seed: number): void {
  const t = clamp01(ticksInState / SLAP_FX_TICKS);
  if (t >= 1) return;
  const life = 1 - t;
  const go = easeOutCubic(t);
  const d = 34 * life + 8;
  top.emit('core', x, y, d, d, 0, 0.95 * life, 0xffffff, 'add');
  top.emit('soft', x, y, d * 2.4, d * 2.4, 0, 0.55 * life, 0xffd36a, 'add');
  const ring = 16 + 52 * go;
  top.emit('ring', x, y, ring, ring * 0.8, 0, 0.85 * life, 0xfff0b0, 'add');
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2 + fxHash(seed, s, 0x51a) * 0.5;
    const r = (14 + 22 * fxHash(seed, s, 0x51b)) * go;
    top.emit('soft', x + Math.cos(a) * r, y + Math.sin(a) * r, 11 * life + 3, 3, a, 0.95 * life,
      mixColor(0xffffff, 0xffc04a, t), 'add');
  }
}
