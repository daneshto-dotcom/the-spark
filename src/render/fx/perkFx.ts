/**
 * SPARK — S193 `s193/visuals-racial` (visuals-3, `S192_VISUALS_PLAN.md` §4) — **THE RACIAL PERKS, LIT.**
 *
 * Eight layouts, one per perk the board could not see well enough. Every one is a PURE function in the
 * substrate's shape (`emitter.ts`): synced integers and an age in, sprites into an `FxSink` out. No
 * Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts` scans this file like the others).
 *
 *   · V11 BLOOD DEBT / CRIMSON TIDE — `lifestealFx`: crimson motes from the victim to the healed
 *     attacker, one burst per rise of the synced `Creature.healedFifths` (no new field).
 *   · V12 SCORCHED GROUND / EARTH — `scorchZoneFx` (drifting embers over a burning zone, the quarry
 *     spared) and `burnFlickerFx` (small flames licking at an enemy creature the zone is burning).
 *   · V14 RAGE (the Warlord, BLOOD FRENZY) — `rageFx`: a red ember pool under the unit, heat sparks.
 *   · V18 CORPSE EATER — `corpseFeedFx`: a green-crimson stream spiralling into the feeding boss.
 *   · V19 DEEP CURRENT — `vortexFx`: spiralling droplets and a splash ring at each end of the jump.
 *   · V21 THE SWARM / APEX PREDATOR — `eliteGlowFx`: one faint additive under-glow in the race colour.
 *   · V22 HELLSPAWN — `hellspawnBurstFx`: a hellfire flash and sparks where a split child appears.
 *   (V26, the backdrop grade and vignette, is baked into the backdrop textures — `zoneBackgroundRenderer.ts`.)
 *
 * ⚠ EVERY NUMBER IN THIS FILE IS MINE, NOT THE OWNER'S — sizes, counts, colours, durations. None of
 * them touches a mechanic: each layout reads what the sim already decided and draws it.
 *
 * ⛔ THE LIGHT-ONLY RULE (S192 audit V-2): nothing normal-blend goes on the bloomed TOP sink. Every
 * emit below is `'add'`.
 */

import { clamp01, easeInQuad, easeOutCubic, envelope, forEachLive, fxHash, lerp, mixColor, type FxSink } from './emitter.ts';

const TAU = Math.PI * 2;

// ─────────────────────────────────────────────── V11 · lifesteal ──

/** Render frames one lifesteal burst lasts (the motes' flight plus the arrival flash). ⚠ MINE. */
export const LIFESTEAL_FX_FRAMES = 26;
/** Frames one mote takes to fly from the victim to the attacker. ⚠ MINE. */
export const LIFESTEAL_FX_FLIGHT = 16;
export const LIFESTEAL_FX_MIN_MOTES = 3;
export const LIFESTEAL_FX_MAX_MOTES = 6;
export const LIFESTEAL_FX_COLOR = 0xff2a4a;

/**
 * PURE — motes per heal: 3 for the smallest heal (the floor-at-one fifth), one more per 4 fifths healed,
 * capped at 6 — so CRIMSON TIDE's 50 % reads visibly heavier than BLOOD DEBT's 20 % on the same hit.
 */
export function lifestealMoteCount(healFifths: number): number {
  if (!(healFifths > 0)) return 0;
  return Math.min(LIFESTEAL_FX_MAX_MOTES, LIFESTEAL_FX_MIN_MOTES + Math.floor(healFifths / 4));
}

/**
 * One burst: `n` crimson motes leave (sx, sy) — the victim — staggered, bow outwards, and accelerate
 * into (tx, ty) — the attacker, who may have moved since — with a small flash as they land.
 * `age` is in render frames since the rise was seen; `seed` comes from the creature id and its
 * synced `healedFifths`, so two screens throw the same arcs.
 */
export function lifestealFx(
  top: FxSink,
  sx: number, sy: number, tx: number, ty: number,
  age: number, healFifths: number, seed: number,
): void {
  if (age < 0 || age >= LIFESTEAL_FX_FRAMES) return;
  const n = lifestealMoteCount(healFifths);
  if (n === 0) return;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy);
  // Perpendicular unit (a zero-length flight — a source on the attacker — bows straight up).
  const px = len > 0.001 ? -dy / len : 0;
  const py = len > 0.001 ? dx / len : -1;
  const stagger = (LIFESTEAL_FX_FRAMES - LIFESTEAL_FX_FLIGHT - 4) / Math.max(1, n - 1);
  for (let k = 0; k < n; k++) {
    const t = (age - k * stagger) / LIFESTEAL_FX_FLIGHT;
    if (t < 0 || t >= 1) continue;
    const bow = (fxHash(seed, k, 1) - 0.5) * 2 * (14 + 0.25 * len) * Math.sin(Math.PI * t);
    const e = easeInQuad(t) * 0.7 + t * 0.3; // it accelerates INTO the drinker
    const x = sx + dx * e + px * bow;
    const y = sy + dy * e + py * bow;
    const dir = Math.atan2(dy + py * bow * 0.1, dx + px * bow * 0.1);
    const a = envelope(t, 0.2);
    const size = 5 + 3 * fxHash(seed, k, 2);
    top.emit('soft', x, y, size * 2.4, size, dir, 0.85 * a, LIFESTEAL_FX_COLOR, 'add');
    top.emit('core', x, y, size * 0.9, size * 0.9, 0, 0.9 * a, 0xffc4cc, 'add');
  }
  // The drink: a soft crimson flash on the attacker once the first mote lands.
  const land = (age - LIFESTEAL_FX_FLIGHT) / (LIFESTEAL_FX_FRAMES - LIFESTEAL_FX_FLIGHT);
  if (land >= 0 && land < 1) {
    const d = 18 + 14 * easeOutCubic(land);
    top.emit('soft', tx, ty, d, d * 0.8, 0, (1 - land) * 0.55, LIFESTEAL_FX_COLOR, 'add');
  }
}

// ──────────────────────────────────────── V12 · scorched ground ──

/** Ember births: one every `PERIOD` ticks, each living `LIFE` ticks → LIFE / PERIOD live per zone. ⚠ MINE. */
export const SCORCH_EMBER_PERIOD = 3;
export const SCORCH_EMBER_LIFE = 120;
/** Smouldering ground patches under the embers. ⚠ MINE. */
export const SCORCH_POOL_PERIOD = 20;
export const SCORCH_POOL_LIFE = 120;

/**
 * Drifting embers over a burning zone's rect (x, y, w, h), plus a few slow smouldering ground glows.
 * Live count: 40 embers + 6 pools a zone. Nothing is drawn inside the quarry disc (cx, cy, qr) — the
 * quarry never burns (`scorchedGround.ts`: *"belongs to nobody"*).
 */
export function scorchZoneFx(
  top: FxSink, ground: FxSink,
  x: number, y: number, w: number, h: number,
  tick: number, seed: number,
  quarry: { readonly cx: number; readonly cy: number; readonly r: number },
): void {
  const qr2 = quarry.r * quarry.r;
  const outsideQuarry = (px: number, py: number): boolean => {
    const ddx = px - quarry.cx;
    const ddy = py - quarry.cy;
    return ddx * ddx + ddy * ddy > qr2;
  };
  forEachLive(tick, SCORCH_POOL_PERIOD, SCORCH_POOL_LIFE, 1, seed & 0xff, (b, k, t) => {
    const px = x + fxHash(seed, b, 11 + k) * w;
    const py = y + fxHash(seed, b, 12 + k) * h;
    if (!outsideQuarry(px, py)) return;
    const s = 60 + 70 * fxHash(seed, b, 13);
    ground.emit('soft', px, py, s, s * 0.42, 0, envelope(t, 0.5) * 0.16, 0xff3a0e, 'add');
  });
  forEachLive(tick, SCORCH_EMBER_PERIOD, SCORCH_EMBER_LIFE, 1, (seed >>> 8) & 0xff, (b, k, t) => {
    const h1 = fxHash(seed, b, 1 + k);
    const h2 = fxHash(seed, b, 2 + k);
    const h3 = fxHash(seed, b, 3 + k);
    // The wind: every ember drifts the same way (a zone-wide breeze), each with its own sway.
    const px = x + h1 * w + (h3 - 0.3) * 46 * t + Math.sin(t * 7 + h2 * TAU) * 6;
    const py = y + h2 * h - 58 * t;
    if (!outsideQuarry(px, py)) return;
    const flicker = 0.65 + 0.35 * Math.sin(b * 1.7 + t * 31);
    const size = 3 + 4 * h3;
    top.emit('soft', px, py, size, size * 1.7, 0, envelope(t, 0.2) * 0.85 * flicker, mixColor(0xff5a14, 0xffd27a, h1), 'add');
  });
}

/** Burn-flicker cadence on one burning creature: a flame every 6 ticks living 18 → 3 live. ⚠ MINE. */
export const BURN_FLICKER_PERIOD = 6;
export const BURN_FLICKER_LIFE = 18;

/** Small flames licking up from a burning creature's feet (x, y). `scale` follows its sprite. */
export function burnFlickerFx(top: FxSink, x: number, y: number, tick: number, id: number, scale: number): void {
  const seed = (id | 0) * 0x9e37 + 0x5c0;
  forEachLive(tick, BURN_FLICKER_PERIOD, BURN_FLICKER_LIFE, 1, id, (b, _k, t) => {
    const ox = (fxHash(seed, b, 1) - 0.5) * 16 * scale;
    const py = y - 3 - 16 * t * scale;
    const size = (5 + 3 * fxHash(seed, b, 2)) * scale * (1 - 0.5 * t);
    top.emit('soft', x + ox, py, size, size * 1.5, 0, envelope(t, 0.3) * 0.85, mixColor(0xffe48a, 0xff3a10, t), 'add');
  });
}

// ─────────────────────────────────────────────────── V14 · rage ──

export const RAGE_FX_COLOR = 0xff2a10;
/** Heat sparks: one every 5 ticks living 30 → 6 live a raging unit. ⚠ MINE. */
export const RAGE_SPARK_PERIOD = 5;
export const RAGE_SPARK_LIFE = 30;

/**
 * A raging unit: a pulsing red ember pool on the ground under it, and heat sparks rising past its body.
 * (x, y) is its real `pos` (the feet); `scale` is its sprite multiplier. The red sprite tint stays —
 * this adds light, it replaces nothing.
 */
export function rageFx(ground: FxSink, top: FxSink, x: number, y: number, tick: number, id: number, scale: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(((tick + (id | 0) * 7) / 5) % TAU);
  const w = 58 * scale;
  ground.emit('soft', x, y, w, w * 0.42, 0, 0.32 + 0.18 * pulse, RAGE_FX_COLOR, 'add');
  const seed = (id | 0) * 0x2f1 + 0x4a6e;
  forEachLive(tick, RAGE_SPARK_PERIOD, RAGE_SPARK_LIFE, 1, id * 3, (b, _k, t) => {
    const a = fxHash(seed, b, 1) * TAU;
    const r = (10 + 10 * fxHash(seed, b, 2)) * scale;
    const px = x + Math.cos(a) * r + Math.sin(t * 9 + a) * 3 * scale;
    const py = y + Math.sin(a) * r * 0.4 - 46 * scale * t;
    const s = (3 + 2 * fxHash(seed, b, 3)) * scale;
    top.emit('soft', px, py, s, s * 2, 0, envelope(t, 0.25) * 0.9, mixColor(0xffd060, 0xff3010, t), 'add');
  });
}

// ───────────────────────────────────────────── V18 · corpse eater ──

/** Stream births: one every 2 ticks living 40 → 20 live. ⚠ MINE. */
export const CORPSE_FEED_PERIOD = 2;
export const CORPSE_FEED_LIFE = 40;
/** Ticks the stream takes to swell in at the start of the feed and to die out at its end. ⚠ MINE. */
export const CORPSE_FEED_RAMP = 30;

/** PURE — how strongly the stream runs, from ticks into the feed window and the window's length. */
export function corpseFeedIntensity(elapsed: number, windowTicks: number): number {
  if (elapsed < 0 || elapsed >= windowTicks) return 0;
  return clamp01(Math.min(elapsed / CORPSE_FEED_RAMP, (windowTicks - elapsed) / CORPSE_FEED_RAMP, 1));
}

/**
 * A green-crimson stream of motes spiralling in from the feeding ring (`reach` px about his feet at
 * (x, y)) into his maw at (x, mouthY). The owner's feed rows stay the art; this is the life going in.
 */
export function corpseFeedFx(
  top: FxSink, x: number, y: number, mouthY: number, reach: number,
  tick: number, id: number, intensity: number,
): void {
  if (intensity <= 0) return;
  const seed = (id | 0) * 0x3b5 + 0xc0e;
  forEachLive(tick, CORPSE_FEED_PERIOD, CORPSE_FEED_LIFE, 1, id, (b, _k, t) => {
    const a0 = fxHash(seed, b, 1) * TAU;
    const R = reach * (0.8 + 0.5 * fxHash(seed, b, 2));
    const e = easeInQuad(t);
    const r = R * (1 - e);
    const ang = a0 + t * 2.4;
    // From the ground ring (y) up into the maw (mouthY) as it closes in.
    const cy = lerp(y, mouthY, e);
    const px = x + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r * 0.45;
    const blood = fxHash(seed, b, 3) > 0.5;
    const s = 4 + 3 * fxHash(seed, b, 4);
    top.emit('soft', px, py, s * 2, s, ang + Math.PI / 2, envelope(t, 0.3) * 0.85 * intensity, blood ? 0xd0203a : 0x7dff5a, 'add');
  });
  const throb = 0.5 + 0.5 * Math.sin(((tick + (id | 0) * 5) / 6) % TAU);
  const d = 26 + 10 * throb;
  top.emit('soft', x, mouthY, d, d, 0, (0.3 + 0.2 * throb) * intensity, 0x9cff6a, 'add');
}

// ───────────────────────────────────────────── V19 · deep current ──

export const DEEP_CURRENT_FX_DROPLETS = 16;

/**
 * One end of a DEEP CURRENT jump: droplets spiralling into a closing vortex, a splash ring spreading on
 * the ground, a cold glow at the eye. `t` is the vortex's 0..1 life (its render-frame age over its
 * length, the same clock the S188 swirl uses). Sprites only — there is no Pixi path here at all, so the
 * canon §7c pen-lift rule (every path segment starts with `moveTo`) has nothing to apply to.
 */
export function vortexFx(top: FxSink, ground: FxSink, x: number, y: number, t: number, seed: number, color: number): void {
  if (t < 0 || t >= 1) return;
  const fade = 1 - t;
  const close = easeOutCubic(t);
  for (let k = 0; k < DEEP_CURRENT_FX_DROPLETS; k++) {
    const a0 = fxHash(seed, k, 1) * TAU;
    const r = (8 + 26 * fxHash(seed, k, 2)) * (1 - 0.75 * close);
    const ang = a0 + t * 7 * (0.7 + 0.6 * fxHash(seed, k, 3));
    const px = x + Math.cos(ang) * r;
    const py = y + Math.sin(ang) * r * 0.6;
    const s = 3 + 2 * fxHash(seed, k, 4);
    top.emit('soft', px, py, s * 2.2, s, ang + Math.PI / 2, fade * 0.9, mixColor(color, 0xffffff, 0.35 * fxHash(seed, k, 5)), 'add');
  }
  const d = 16 + 64 * close;
  ground.emit('ring', x, y, d, d * 0.5, 0, fade * 0.75, color, 'add');
  top.emit('soft', x, y, 30, 22, 0, fade * 0.5, mixColor(color, 0xffffff, 0.5), 'add');
}

// ─────────────────────────────────────────────── V21 · elite glow ──

/** One faint additive pool under an elite (THE SWARM's bat swarm, APEX PREDATOR's piranha). */
export function eliteGlowFx(ground: FxSink, x: number, y: number, color: number, scale: number, tick: number, id: number): void {
  const breathe = 0.5 + 0.5 * Math.sin(((tick + (id | 0) * 11) / 14) % TAU);
  const w = 38 * scale;
  ground.emit('soft', x, y, w, w * 0.42, 0, 0.3 + 0.12 * breathe, color, 'add');
}

// ─────────────────────────────────────────────── V22 · hellspawn ──

export const HELLSPAWN_FX_FRAMES = 18;
export const HELLSPAWN_FX_SPARKS = 6;

/** A hellfire burst where one split child appears. `age` in render frames since it was first seen. */
export function hellspawnBurstFx(top: FxSink, x: number, y: number, age: number, seed: number): void {
  if (age < 0 || age >= HELLSPAWN_FX_FRAMES) return;
  const t = age / HELLSPAWN_FX_FRAMES;
  const fade = 1 - t;
  const f = 40 * fade + 8;
  top.emit('core', x, y, f, f, 0, fade, 0xffd27a, 'add');
  const d = 14 + 44 * easeOutCubic(t);
  top.emit('ring', x, y, d, d * 0.6, 0, fade * 0.8, 0xff3010, 'add');
  for (let s = 0; s < HELLSPAWN_FX_SPARKS; s++) {
    const a = fxHash(seed, s, 1) * TAU;
    const dist = (14 + 26 * fxHash(seed, s, 2)) * easeOutCubic(t);
    const px = x + Math.cos(a) * dist;
    const py = y + Math.sin(a) * dist * 0.7 + 18 * t * t; // a little gravity
    top.emit('soft', px, py, 9 * fade + 3, 3, a, fade * 0.95, mixColor(0xffe08a, 0xff2a00, t), 'add');
  }
}
