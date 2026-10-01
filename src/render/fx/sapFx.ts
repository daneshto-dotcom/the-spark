/**
 * SPARK — S192 `s192/visuals` PILOT 1 — **VLAD'S LIFE SAP, REBUILT AS LIGHT.**
 *
 * Owner on the look (S170, R140): *"It needs to be looking scary and cool, like life sap, you know,
 * and Dota."* The S170 version (`bossAuras.ts` `drawLifeSap`, kept intact behind `?fx=legacy`) was
 * one growing circle and 18 solid 3.4 px dots sliding inward — the audit's example of a flat shape.
 *
 * ⭐ WHAT THIS DRAWS — every number below is MINE (the owner gave a reference, not geometry):
 *   · ~96 crimson motes on THREE SPIRAL ARMS, born up to `SAP_FX_SPAWN_R` out, streaking inward on a
 *     tightening curl and swallowed at his chest. Each is a soft additive sprite STRETCHED along its own
 *     velocity, which is what makes a dot read as a streak of blood rather than a bead;
 *   · every third mote carries a hot pink-white centre, so the stream sparkles instead of flattening;
 *   · a pulsing crimson CORE at the chest that swells as the life arrives;
 *   · a dark-red STAIN on the ground under him (normal blend — blood darkens, it does not glow);
 *   · in the last fifth, the LANDING: a burst ring, 20 sparks thrown outward and a ground ripple
 *     (`ShockwaveFilter`, HIGH quality only).
 *
 * ⛔ STILL NO VICTIM, AND THAT IS STILL THE MECHANIC. R140 is a pure self-heal (see `drawLifeSap`'s
 * docblock), so the motes converge from every side and name no donor. A tether would claim a drain
 * the sim does not perform.
 *
 * ⚠ SAME TRIGGER, SAME WINDOW: `sapFlashUntilTick` (serialized + hashed) and `VLAD_SAP_FLASH_TICKS`.
 * Every particle is a pure function of (boss id, ticks into the flash), so the enemy sees the same
 * siphon on the same tick — the owner's actual requirement. No new field, no protocol bump.
 */

import { VLAD_SAP_FLASH_TICKS } from '../../constants.ts';
import {
  clamp01, easeInQuad, easeOutCubic, envelope, fxHash, fxSeed, mixColor,
  type FxShockSink, type FxSink,
} from './emitter.ts';

/** Motes in the stream. */
export const SAP_FX_MOTES = 96;
/** Spiral arms the motes ride. */
export const SAP_FX_ARMS = 3;
/** Furthest a mote is born from the chest, in board px (the legacy version used 96). */
export const SAP_FX_SPAWN_R = 118;
/** The chest — where the life is swallowed — above his feet, in board px. ⚠ MINE, measured off his sprite in the S192 screenshots. */
export const SAP_FX_CHEST_DY = -64;
/** Fraction of the flash at which the landing burst begins. */
export const SAP_FX_LAND_AT = 0.78;
/** Sparks in the landing burst. */
export const SAP_FX_SPARKS = 20;
/** The ripple's full reach, board px. */
export const SAP_FX_SHOCK_R = 150;

const MOTE_FAR = 0x7a0818;
const MOTE_NEAR = 0xff5a75;
const HOT = 0xffd3dc;
const CORE = 0xff4d6a;
const CORE_HALO = 0xb3122b;
const STAIN = 0x3a0510;

/** 0 → 1 across the flash; null when no flash is live. Integer-derived, exactly as `drawLifeSap` does it. */
export function sapProgress(tick: number, until: number | undefined): number | null {
  if (until === undefined || tick >= until) return null;
  const remaining = until - tick;
  if (remaining > VLAD_SAP_FLASH_TICKS) return null; // a stamp from the future (clock skew): draw nothing
  return 1 - remaining / VLAD_SAP_FLASH_TICKS;
}

/**
 * Where mote `k` of boss `id` is at flash progress `t`, or null while it is unborn or swallowed.
 * PURE and exported so the test can pin "it converges" and "it spirals" without a renderer.
 */
export function sapMoteAt(id: number, k: number, t: number): { dx: number; dy: number; travel: number } | null {
  const seed = fxSeed(id, 0x5a9);
  const lead = fxHash(seed, k, 1) * 0.42; // staggered starts: a stream, not a ring
  const travel = clamp01((t - lead) / 0.5);
  if (travel <= 0 || travel >= 1) return null;
  const arm = k % SAP_FX_ARMS;
  const base = fxHash(seed, 0, 9) * Math.PI * 2; // the arms' orientation, fixed per boss
  // The curl tightens as the mote closes in: 2.4 rad of twist spent over the approach.
  const ang = base + (arm * Math.PI * 2) / SAP_FX_ARMS + (1 - travel) * 2.4 + (fxHash(seed, k, 2) - 0.5) * 0.55;
  const r0 = SAP_FX_SPAWN_R * (0.72 + 0.45 * fxHash(seed, k, 3));
  const dist = r0 * (1 - easeInQuad(travel));
  return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.62, travel }; // ×0.62: the board's tilt
}

export function sapFx(
  top: FxSink,
  ground: FxSink,
  shock: FxShockSink,
  id: number,
  x: number,
  y: number,
  tick: number,
  until: number | undefined,
): void {
  const t = sapProgress(tick, until);
  if (t === null) return;
  const cx = x;
  const cy = y + SAP_FX_CHEST_DY;
  const seed = fxSeed(id, 0x5a9);

  // The stain under him: grows in, lingers, fades. Normal blend — blood darkens the ground.
  const stainA = 0.5 * envelope(t, 0.35);
  ground.emit('soft', x, y + 4, 150 * (0.7 + 0.3 * easeOutCubic(t)), 58, 0, stainA, STAIN, 'normal');

  // The stream.
  for (let k = 0; k < SAP_FX_MOTES; k++) {
    const m = sapMoteAt(id, k, t);
    if (m === null) continue;
    const prev = sapMoteAt(id, k, Math.max(0, t - 0.035));
    const px = cx + m.dx;
    const py = cy + m.dy;
    let dir = 0;
    let len = 0;
    if (prev !== null) {
      const vx = m.dx - prev.dx;
      const vy = m.dy - prev.dy;
      dir = Math.atan2(vy, vx);
      len = Math.hypot(vx, vy);
    }
    const size = 11 * (1 - 0.5 * m.travel);
    const streak = Math.max(size, Math.min(size * 4, len * 2.2));
    const alpha = Math.min(1, m.travel * 4) * (0.55 + 0.45 * m.travel);
    top.emit('soft', px, py, streak, size, dir, alpha, mixColor(MOTE_FAR, MOTE_NEAR, m.travel), 'add');
    if (k % 3 === 0) top.emit('core', px, py, size * 0.7, size * 0.7, 0, alpha * 0.85, HOT, 'add');
  }

  // The core: swells as the life arrives, breathing on the tick so both screens pulse together.
  const pulse = 0.5 + 0.5 * Math.sin((tick % 628) * 0.6);
  const core = 26 + 36 * easeOutCubic(t) + 6 * pulse;
  top.emit('soft', cx, cy, core * 2, core * 1.7, 0, 0.3 + 0.35 * t, CORE_HALO, 'add');
  top.emit('core', cx, cy, core, core, 0, 0.45 + 0.45 * t, CORE, 'add');

  // The landing.
  const bt = (t - SAP_FX_LAND_AT) / (1 - SAP_FX_LAND_AT);
  if (bt > 0) {
    const ringD = 40 + 170 * easeOutCubic(bt);
    top.emit('ring', cx, cy, ringD, ringD * 0.72, 0, (1 - bt) * 0.95, MOTE_NEAR, 'add');
    for (let s = 0; s < SAP_FX_SPARKS; s++) {
      const a = fxHash(seed, s, 20) * Math.PI * 2;
      const d = (24 + 80 * fxHash(seed, s, 21)) * easeOutCubic(bt);
      const sx = cx + Math.cos(a) * d;
      const sy = cy + Math.sin(a) * d * 0.7;
      top.emit('soft', sx, sy, 14 * (1 - bt) + 4, 4, a, (1 - bt) * 0.9, mixColor(HOT, MOTE_NEAR, bt), 'add');
    }
    shock.shock(x, y, (t - SAP_FX_LAND_AT) * VLAD_SAP_FLASH_TICKS, SAP_FX_SHOCK_R, 14);
  }
}
