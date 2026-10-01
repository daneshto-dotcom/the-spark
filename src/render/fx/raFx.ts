/**
 * SPARK — S193 `s193/visuals-boss` (V09) — **RA: THE TELEGRAPH'S SAND, THE BEAM'S LIGHT, THE IMPACT'S DUST,
 * AND THE PHARAOH'S HALO.**
 *
 * ⛔ THE OWNER'S STRIKE ART STAYS. *"it doesn't look good the way you did it with code"* (S188) — so nothing
 * here draws a beam. The sprite sheet (`raStrikeArt.ts`) still carries the ring, the beam, the flash, the
 * explosion and the mushroom cloud. This module only adds LIGHT and MATTER around it:
 *   · TELEGRAPH — a soft glow pool and a soft ring riding the growing shade, and ~18 sand motes that
 *     spiral INTO the circle while it grows (the column "drawing in" the desert before it lands);
 *   · BEAM — an additive glow column and a ground flare on the beam frames (the bloom on the top layer
 *     turns them into a halo around the art), and a white flash on the impact frames;
 *   · IMPACT — a dust burst (sandy smoke puffs, normal blend on the SHADE layer so they darken) and
 *     sand sparks thrown out on arcs, at the true kill radius;
 *   · HALO — the channelling Pharaoh's halo as a soft additive disc with SIX orbiting sun motes. The
 *     motes behind him (the upper half of the orbit) draw on the GROUND layer, under his sprite; the
 *     ones in front draw on TOP — so the ring reads as going AROUND him, not as a sticker on him.
 *
 * ⛔ THE HITBOX IS NOT HERE. The growing shade and its outline (`bossAuras.ts` `drawRaColumns`) stay Graphics
 * at the EXACT kill radius (R171-B — *"you know where the column is gonna hit"*), and so do the Ra aim
 * circles. The glow ring here grows on the same curve (`raTelegraphRadius`), but it is decoration.
 *
 * ⛔ PURE: every sprite is a function of (column seed, `world.tick`, the SIM's own impact tick). No Pixi,
 * no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every number below is ⚠ MINE — the owner
 * ruled the mechanic and the art, not this light.
 */

import { clamp01, easeOutCubic, envelope, forEachLive, fxHash, mixColor, type FxSink } from './emitter.ts';

const SAND = 0xe8c27a;
const SAND_HOT = 0xffe2a0;
const TELEGRAPH_GLOW = 0xffb43c;
const BEAM_GLOW = 0xfff0c0;
const DUST = 0xb39468;
const HALO = 0xffd970;
const SUN = 0xfff0b0;

/** Sand motes in a telegraph: one born every `RA_FX_MOTE_PERIOD` ticks, each living `RA_FX_MOTE_LIFE`. */
export const RA_FX_MOTE_PERIOD = 2;
export const RA_FX_MOTE_LIFE = 36;
/** The beam glow starts when the art's beam drops (slot 4, 48 ticks before impact) and is gone by +30. */
export const RA_FX_BEAM_FROM = -48;
export const RA_FX_BEAM_TO = 30;
/** How long the impact dust burst lasts, in ticks after impact. */
export const RA_FX_DUST_LIFE = 60;
export const RA_FX_DUST_PUFFS = 12;
export const RA_FX_SPARKS = 16;
/** The halo's orbiting suns. The brief's number: six. */
export const RA_FX_HALO_SUNS = 6;
/** How tall the glow column stands above the impact, in board px (the code beam stood 520). */
const BEAM_H = 520;

/** The telegraph's drawn radius at progress `t` — the SAME curve `drawRaColumns` grows the shade on. */
export function raTelegraphRadius(radius: number, t: number): number {
  return radius * (0.18 + 0.82 * clamp01(t));
}

/** A column's seed: the sim's impact tick and its rounded landing point (synced integers only). */
export function raColumnSeed(impactTick: number, x: number, y: number): number {
  return Math.imul((impactTick | 0) + 0x5a17, 0x2c1b3c6d) ^ Math.imul(Math.round(x) * 7919 + Math.round(y), 0x297a2d39);
}

/**
 * TELEGRAPH — drawn on every frame from the column's announcement to its impact. `windowStart` and
 * `impact` are ticks (the sim's own: `drawRaColumns` derives them from `until`).
 */
export function raTelegraphFx(
  ground: FxSink, seed: number, x: number, y: number, tick: number, windowStart: number, impact: number, radius: number,
): void {
  if (tick < windowStart || tick >= impact) return;
  const t = (tick - windowStart) / Math.max(1, impact - windowStart);
  const r = raTelegraphRadius(radius, t);
  ground.emit('soft', x, y, r * 2.1, r * 2.1, 0, 0.06 + 0.16 * t, TELEGRAPH_GLOW, 'add');
  const ring = (2 * r) / 0.82; // the ring texture peaks at 82 % of its half-size
  ground.emit('ring', x, y, ring, ring, 0, 0.18 + 0.42 * t, TELEGRAPH_GLOW, 'add');
  forEachLive(tick, RA_FX_MOTE_PERIOD, RA_FX_MOTE_LIFE, 1, seed & 0xff, (birth, k, u) => {
    if (birth < windowStart || birth >= impact) return; // only motes the telegraph itself gave birth to
    const h1 = fxHash(seed, birth, k + 1);
    const h2 = fxHash(seed, birth, k + 2);
    const dir = fxHash(seed, birth, k + 3) < 0.5 ? -1 : 1;
    const a = h1 * Math.PI * 2 + dir * u * 2.4;
    const d = radius * (1.15 + 0.3 * h2) * Math.pow(1 - u, 1.3);
    const size = 5 + 4 * h2;
    const tangent = a + dir * (Math.PI / 2);
    ground.emit('soft', x + Math.cos(a) * d, y + Math.sin(a) * d, size * 2.2, size, tangent,
      envelope(u, 0.2) * (0.6 + 0.4 * t), mixColor(SAND, SAND_HOT, 0.4 + 0.6 * u), 'add');
  });
}

/** The beam glow's strength at `rel` ticks from impact (0 = none). With no art, only the code beam's 14 ticks. */
export function raBeamGlow(rel: number, hasArt: boolean, flicker: number): number {
  if (!hasArt) return rel >= 0 && rel <= 14 ? 1.4 * (1 - rel / 14) : 0;
  if (rel < RA_FX_BEAM_FROM || rel >= RA_FX_BEAM_TO) return 0;
  if (rel < -36) return (rel - RA_FX_BEAM_FROM + 1) / 12; // the beam drops
  if (rel < 0) return 0.82 + 0.18 * flicker;              // it burns in the ring
  if (rel < 6) return 1.5;                                 // ⭐ THE FLASH — the damage tick
  return 1.2 * (1 - (rel - 6) / (RA_FX_BEAM_TO - 6));      // cracks, the explosion, fading
}

/**
 * BEAM + IMPACT — light on `top` (additive, bloomed on HIGH), dust on `shade` (normal blend, never
 * bloomed). `impact` is the sim's impact tick for this column.
 */
export function raBeamFx(
  top: FxSink, shade: FxSink, seed: number, x: number, y: number, tick: number, impact: number, hasArt: boolean, radius: number,
): void {
  const rel = tick - impact;
  const g = raBeamGlow(rel, hasArt, fxHash(seed, tick, 9));
  if (g > 0) {
    const w = radius * 0.9;
    top.emit('soft', x, y - BEAM_H / 2, w * 2.2, BEAM_H * 1.1, 0, Math.min(1, 0.3 * g), BEAM_GLOW, 'add');
    top.emit('soft', x, y - BEAM_H / 2, w * 0.7, BEAM_H, 0, Math.min(1, 0.3 * g), 0xffffff, 'add');
    top.emit('soft', x, y, radius * 2.2, radius * 1.0, 0, Math.min(1, 0.3 * g), BEAM_GLOW, 'add');
  }
  if (rel >= 0 && rel < 6) {
    const f = rel / 6;
    top.emit('core', x, y, radius * 2.2 * (1 + 0.5 * f), radius * 1.1 * (1 + 0.5 * f), 0, 0.85 * (1 - f), 0xffffff, 'add');
  }
  if (rel < 0 || rel >= RA_FX_DUST_LIFE) return;
  // THE DUST BURST — sandy puffs rolling out to (and a little past) the kill radius, rising as they go.
  for (let k = 0; k < RA_FX_DUST_PUFFS; k++) {
    const life = RA_FX_DUST_LIFE * (0.7 + 0.3 * fxHash(seed, k, 20));
    const u = rel / life;
    if (u >= 1) continue;
    const a = (k / RA_FX_DUST_PUFFS) * Math.PI * 2 + fxHash(seed, k, 21) * 0.5;
    const d = radius * (0.3 + 0.9 * easeOutCubic(u)) * (0.75 + 0.3 * fxHash(seed, k, 22));
    const size = (26 + 22 * fxHash(seed, k, 23)) * (0.6 + 0.9 * u);
    shade.emit('smoke', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55 - 18 * u, size, size * 0.8, a,
      envelope(u, 0.12) * 0.55, DUST, 'normal');
  }
  // SAND SPARKS — hot grains thrown out on arcs, gone in half a second.
  for (let k = 0; k < RA_FX_SPARKS; k++) {
    const u = rel / 30;
    if (u >= 1) break;
    const a = fxHash(seed, k, 30) * Math.PI * 2;
    const d = radius * (0.2 + 1.1 * easeOutCubic(u)) * (0.6 + 0.4 * fxHash(seed, k, 31));
    const hop = Math.sin(u * Math.PI) * radius * 0.5 * fxHash(seed, k, 32);
    top.emit('core', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55 - hop, 5, 5, 0, 1 - u, mixColor(SAND_HOT, SAND, u), 'add');
  }
}

/**
 * HALO — the channelling Pharaoh. `pulse` is the S171 halo's own `0.5 + 0.5·sin(tick / 9)`, so the
 * rebuilt halo breathes on the same beat as the legacy stroke it replaces.
 */
export function raHaloFx(ground: FxSink, top: FxSink, id: number, x: number, y: number, tick: number): void {
  const pulse = 0.5 + 0.5 * Math.sin((tick / 9) % (Math.PI * 2));
  const r = 30 + pulse * 6;
  ground.emit('soft', x, y, r * 2.8, r * 2.8, 0, 0.32 + 0.2 * pulse, HALO, 'add');
  const ring = (2 * r) / 0.82;
  ground.emit('ring', x, y, ring, ring, 0, 0.3 + 0.3 * pulse, HALO, 'add');
  const spin = ((tick * 2 + id * 37) % 360) * (Math.PI / 180);
  for (let k = 0; k < RA_FX_HALO_SUNS; k++) {
    const a = spin + (k / RA_FX_HALO_SUNS) * Math.PI * 2;
    const sx = x + Math.cos(a) * r * 1.15;
    const sy = y + Math.sin(a) * r * 0.45;
    // sin(a) < 0 is the far half of the orbit: behind him, under his sprite.
    const sink = Math.sin(a) < 0 ? ground : top;
    sink.emit('soft', sx, sy, 30, 30, 0, 0.45 + 0.25 * pulse, HALO, 'add');
    sink.emit('core', sx, sy, 14, 14, 0, 0.85 + 0.15 * pulse, SUN, 'add');
  }
}
