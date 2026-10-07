/**
 * SPARK — S196 `s196/boss-release` (owner R196-T2) — **THE BOSS TOWER'S RELEASE, AND ITS CRUMBLE.**
 *
 * Owner, S196, verbatim: *"when a boss tower releases his boss and it crumbles, there should be a flash that's
 * appropriate to … the player's race and how it crumbles right now. So … check out the crumble loop and make it
 * look like sick with a nice release effect … Definitely build that too."*
 *
 * Two layouts, both PURE (no Pixi, no DOM, no clock, no `Math.random` — `fxGuards.test.ts`). Every particle is a
 * function of (seed, index, age), where the seed is the SPAWNER id (synced) and the age is ticks since THIS
 * client saw the tower go (`bossReleaseTrack.ts` — the derivation, and why it is right on a peer):
 *
 *   · `bossCrumbleFx` — every tier-9 tower that falls, released or destroyed: the boss seal under it flashes and
 *     SHATTERS (its rings break into arcs flung outward, its glyphs scatter), glowing cracks run across the
 *     ground, stone debris is thrown off the walls and tumbles to the ground in a staggered collapse, and a dust
 *     cloud billows out along the ground and down the walls. It runs for `BOSS_CRUMBLE_FX_TICKS`, the length of
 *     the sprite's own destroy cinematic (`TOWER_CRUMBLE_FRAMES` in `towerFrames.ts`; a test pins the equality).
 *   · `bossReleaseFx` — ONLY when the tower let its boss out: a white-hot flash, a pillar of the race's light,
 *     a shock ring (and a ground ripple on HIGH), then the race's own eruption:
 *
 * | race | release |
 * |---|---|
 * | demons | a hellfire burst — violet flame tongues blown out round the base, a column of fire, souls screaming up |
 * | mummies | a sand-storm column — a widening vortex of sand winding up out of the tower, gold glints, a sand skirt |
 * | nagas | a water geyser — a jet of foam thrown high, droplets raining back, splash rings where they land |
 * | orcs | a war-fire blast — a fireball rolling out, embers flung wide, a black smoke mushroom |
 * | vampires | blood and bats — a crimson burst, bats flung out spiralling up, blood raining down |
 * | zombies | a toxic eruption — goo blobs lobbed high that splat on landing, a green gas cloud, popping bubbles |
 *
 * Smoke, dust and stone are dark: they go to the SHADE sink (normal blend, never bloomed — audit V-2). Light
 * goes to TOP (additive); what lies on the ground (cracks, rings, the seal) to GROUND.
 *
 * ⚠ EVERY NUMBER, COLOUR, COUNT AND TIMING HERE IS MINE (an owner LOOK item). LOW draws the same picture with
 * about half the particles, no dust curtain and no ground ripple; MINIMAL and `?fx=legacy` never reach this file
 * (the caller is inside the `fxActive()` branch), so the weakest tier gets no heavier.
 */

import { RACE_COLORS, type RaceId } from '../../state/races.ts';
import { clamp01, easeOutCubic, envelope, fxHash, mixColor, type FxShockSink, type FxSink } from './emitter.ts';

/** How long the race's release burst runs, ticks. MINE. */
export const BOSS_RELEASE_TICKS = 96;
/**
 * How long the crumble runs, ticks — the sprite's destroy cinematic is `TOWER_CRUMBLE_FRAMES` (150) render frames,
 * i.e. 150 ticks at 60 Hz, and the debris should land as the building does. MINE (matched; a test pins it).
 */
export const BOSS_CRUMBLE_FX_TICKS = 150;
/** Debris chunks thrown off a falling boss tower (HIGH; LOW draws half). MINE. */
export const BOSS_CRUMBLE_DEBRIS = 18;
/** Dust puffs billowing out along the ground (HIGH; LOW draws half). MINE. */
export const BOSS_CRUMBLE_DUST = 10;
/** Arcs the seal's outer ring breaks into. MINE. */
export const BOSS_SEAL_SHARDS = 12;

/** The sinks a release writes. `shock` is the ground ripple (a no-op on LOW and in tests). */
export interface BossReleaseSinks { readonly ground: FxSink; readonly top: FxSink; readonly shade: FxSink; readonly shock: FxShockSink }

const TAU = Math.PI * 2;
const STONE = 0x4a4038;
const DUST = 0x8a7a66;

/** The size unit, the same as the signatures' (`towerSignatureFx.sigUnit`): a ~90 px tower is 1. */
function unit(h: number): number { return Math.max(1, h / 90); }
function half(n: number, low: boolean): number { return low ? Math.max(1, Math.ceil(n / 2)) : n; }

/* ── the CRUMBLE (released or destroyed) ─────────────────────────────────────────────────────── */

/**
 * One tier-9 tower falling. `x/fy` is the foot its renderer last published, `w/h` its drawn size; `age` ticks
 * since this client saw it go. `released` only brightens the seal's break (the boss tore it open). PURE.
 */
export function bossCrumbleFx(
  s: BossReleaseSinks, race: RaceId, seed: number, x: number, fy: number, w: number, h: number,
  age: number, low: boolean, released: boolean,
): void {
  if (!(age >= 0) || age >= BOSS_CRUMBLE_FX_TICKS) return;
  const U = unit(h);
  const base = RACE_COLORS[race];
  const bright = mixColor(base, 0xffffff, 0.45);
  const R = w * 0.8; // the seal's radius (`towerSignatureFx.bossSeal`)

  // 1 · THE SEAL BREAKS. Its rings flash, then the outer one shatters into arcs flung outward.
  if (age < 18) {
    const q = age / 18;
    s.ground.emit('ring', x, fy, R * 2.3 * (1 + 0.15 * q), R * 0.85 * (1 + 0.15 * q), 0, (1 - q) * (released ? 1 : 0.8), bright, 'add');
    s.ground.emit('soft', x, fy, R * 2.6, R * 1.0, 0, (1 - q) * 0.55, base, 'add');
  }
  if (age < 64) {
    const q = age / 64;
    const fly = easeOutCubic(q);
    for (let k = 0; k < half(BOSS_SEAL_SHARDS, low); k++) {
      const a = (k / half(BOSS_SEAL_SHARDS, low)) * TAU + fxHash(seed, k, 0x5e1) * 0.3;
      const r = R * (1.15 + 0.9 * fly * (0.6 + 0.4 * fxHash(seed, k, 0x5e2)));
      const px = x + Math.cos(a) * r;
      const py = fy + Math.sin(a) * r * 0.37;
      // a short arc segment, tangent to the ring, tumbling as it flies
      const rot = Math.atan2(Math.cos(a) * 0.37, -Math.sin(a)) + fly * (fxHash(seed, k, 0x5e3) - 0.5) * 3;
      s.ground.emit('core', px, py, (26 - 10 * q) * U, 4 * U, rot, (1 - q) * 0.95, bright, 'add');
    }
  }

  // 2 · CRACKS run out across the ground from the foot, glowing in the race's colour, then cool.
  if (age < 110) {
    const grow = easeOutCubic(age / 22);
    const cool = age < 40 ? 1 : 1 - (age - 40) / 70;
    const n = low ? 4 : 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + fxHash(seed, k, 0xc4a) * 0.7;
      const len = w * (0.55 + 0.6 * fxHash(seed, k, 0xc4b)) * grow;
      // two segments with a kink, so a crack is not a ruler line
      const kx = x + Math.cos(a) * len * 0.5;
      const ky = fy + Math.sin(a) * len * 0.5 * 0.37;
      const a2 = a + (fxHash(seed, k, 0xc4c) - 0.5) * 0.8;
      const ex = kx + Math.cos(a2) * len * 0.5;
      const ey = ky + Math.sin(a2) * len * 0.5 * 0.37;
      seg(s.ground, x, fy, kx, ky, 5 * U, cool * 0.85, bright);
      seg(s.ground, kx, ky, ex, ey, 4 * U, cool * 0.7, base);
    }
  }

  // 3 · DEBRIS. Chunks break off the walls on a staggered beat (the building comes down over ~a second), are
  //     thrown out, tumble, and land at the foot's ground line, where they lie and fade.
  const nd = half(BOSS_CRUMBLE_DEBRIS, low);
  const DLIFE = 80;
  for (let k = 0; k < nd; k++) {
    const delay = Math.floor(fxHash(seed, k, 0xd0) * 60);
    const a = age - delay;
    if (a < 0 || a >= DLIFE) continue;
    const side = fxHash(seed, k, 0xd1) < 0.5 ? -1 : 1;
    const x0 = x + side * w * (0.05 + 0.3 * fxHash(seed, k, 0xd2));
    const y0 = fy - h * (0.25 + 0.65 * fxHash(seed, k, 0xd3));
    const vx = side * (0.6 + 1.6 * fxHash(seed, k, 0xd4)) * U;
    const vy = -(0.6 + 1.8 * fxHash(seed, k, 0xd5)) * U;
    const g = 0.12 * U;
    const ground = fy + (fxHash(seed, k, 0xd6) - 0.3) * 18 * U; // the board's depth: some land in front
    // time to land: y0 + vy·t + ½g·t² = ground
    const disc = vy * vy + 2 * g * (ground - y0);
    const tLand = (-vy + Math.sqrt(Math.max(0, disc))) / g;
    const tt = Math.min(a, tLand);
    const px = x0 + vx * tt;
    const py = y0 + vy * tt + 0.5 * g * tt * tt;
    const landed = a >= tLand;
    const sz = (7 + 9 * fxHash(seed, k, 0xd7)) * U;
    const rot = landed ? fxHash(seed, k, 0xd8) * TAU : (fxHash(seed, k, 0xd8) * TAU + tt * (fxHash(seed, k, 0xd9) - 0.5) * 0.4);
    const fade = a < DLIFE - 24 ? 1 : (DLIFE - a) / 24;
    s.shade.emit('core', px, py, sz * 1.3, sz, rot, 0.95 * fade, mixColor(STONE, base, 0.12), 'normal');
    // a hot edge on the chunk while it is still in the air (light, so it reads on the night board)
    if (!landed) s.top.emit('core', px, py, sz * 0.7, sz * 0.5, rot, 0.5 * (1 - a / DLIFE), mixColor(base, 0xffe0b0, 0.5), 'add');
  }

  // 4 · DUST. Puffs billow out from the base along the ground; on HIGH a curtain also rolls down the walls.
  const nu = half(BOSS_CRUMBLE_DUST, low);
  const ULIFE = 96;
  for (let k = 0; k < nu; k++) {
    const delay = Math.floor(fxHash(seed, k, 0xe0) * 44);
    const a = age - delay;
    if (a < 0 || a >= ULIFE) continue;
    const t = a / ULIFE;
    const ang = (k / nu) * TAU + fxHash(seed, k, 0xe1) * 0.6;
    const r = w * (0.25 + 0.85 * easeOutCubic(t));
    const size = w * (0.35 + 0.7 * t);
    s.shade.emit('smoke', x + Math.cos(ang) * r, fy + Math.sin(ang) * r * 0.37 - t * h * 0.12, size, size * 0.7,
      fxHash(seed, k, 0xe2) * TAU + t, envelope(t, 0.15) * 0.55, DUST, 'normal');
  }
  if (!low) {
    for (let k = 0; k < 6; k++) {
      const delay = 8 + Math.floor(fxHash(seed, k, 0xe5) * 40);
      const a = age - delay;
      if (a < 0 || a >= 80) continue;
      const t = a / 80;
      const ox = (fxHash(seed, k, 0xe6) - 0.5) * w * 0.7;
      const size = w * (0.3 + 0.45 * t);
      s.shade.emit('smoke', x + ox * (1 + t), fy - h * (0.7 - 0.55 * t), size, size, fxHash(seed, k, 0xe7) * TAU, envelope(t, 0.2) * 0.45, DUST, 'normal');
    }
  }

  // 5 · Embers of the race's colour drifting up out of the ruin.
  const ne = low ? 5 : 10;
  for (let k = 0; k < ne; k++) {
    const delay = Math.floor(fxHash(seed, k, 0xf0) * 90);
    const a = age - delay;
    if (a < 0 || a >= 60) continue;
    const t = a / 60;
    const ox = (fxHash(seed, k, 0xf1) - 0.5) * w * 0.8;
    s.top.emit('core', x + ox + Math.sin(t * 6 + k) * 5 * U, fy - h * 0.15 - t * h * 0.7, 5 * U, 5 * U, 0, envelope(t, 0.2), bright, 'add');
  }
}

/* ── the RELEASE (the boss came out) ─────────────────────────────────────────────────────────── */

/** One tier-9 tower letting its boss out, `age` ticks in. PURE. */
export function bossReleaseFx(
  s: BossReleaseSinks, race: RaceId, seed: number, x: number, fy: number, w: number, h: number,
  age: number, low: boolean,
): void {
  if (!(age >= 0) || age >= BOSS_RELEASE_TICKS) return;
  const U = unit(h);
  const base = RACE_COLORS[race];
  const bright = mixColor(base, 0xffffff, 0.5);
  const t = age / BOSS_RELEASE_TICKS;
  const cy = fy - h * 0.45;

  // The FLASH: white-hot at the heart of the tower, fading into the race's colour.
  if (age < 20) {
    const q = age / 20;
    s.top.emit('soft', x, cy, w * (1.6 + 2.2 * q), w * (1.6 + 2.2 * q), 0, (1 - q) * 0.95, mixColor(0xffffff, base, q), 'add');
    s.top.emit('core', x, cy, w * 0.9 * (1 - q), w * 0.9 * (1 - q), 0, 1 - q, 0xffffff, 'add');
  }
  // The PILLAR: the race's light shot up out of the tower, thinning as it fades.
  if (age < 70) {
    const q = age / 70;
    const pw = w * 0.55 * (1 - 0.7 * q);
    s.top.emit('soft', x, fy - h * 1.3, pw * 1.8, h * 3.2, 0, (1 - q) * (1 - q) * 0.75, base, 'add');
    s.top.emit('soft', x, fy - h * 1.2, pw * 0.5, h * 2.8, 0, (1 - q) * 0.85, bright, 'add');
  }
  // The SHOCK RING across the ground (and, on HIGH, the ground itself ripples).
  if (age < 48) {
    const q = age / 48;
    const r = w * (0.4 + 2.2 * easeOutCubic(q));
    s.ground.emit('ring', x, fy, r * 2, r * 0.74, 0, (1 - q) * 0.95, bright, 'add');
    if (!low) s.shock.shock(x, fy, age, w * 1.8, 16);
  }

  switch (race) {
    case 'demons': demonsRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    case 'mummies': mummiesRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    case 'nagas': nagasRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    case 'orcs': orcsRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    case 'vampires': vampiresRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    case 'zombies': zombiesRelease(s, seed, x, fy, w, h, age, t, low, base, U); break;
    default: {
      const unhandled: never = race;
      void unhandled;
    }
  }
}

/** A streak sprite between two points. */
function seg(sink: FxSink, x0: number, y0: number, x1: number, y1: number, thick: number, alpha: number, tint: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5 || !(alpha > 0)) return;
  sink.emit('soft', (x0 + x1) / 2, (y0 + y1) / 2, len + thick, thick, Math.atan2(dy, dx), alpha, tint, 'add');
}

/** Ballistic position `a` ticks after launch from (x0, y0) at (vx, vy) under gravity `g`. */
function arc(x0: number, y0: number, vx: number, vy: number, g: number, a: number): [number, number] {
  return [x0 + vx * a, y0 + vy * a + 0.5 * g * a * a];
}

/** DEMONS — a hellfire burst: flame tongues blown out round the base, a column of fire, souls screaming up. */
function demonsRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const violet = mixColor(base, 0xc060ff, 0.4);
  const n = half(18, low);
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * TAU + fxHash(seed, k, 0xd1) * 0.4;
    const life = 44 + Math.floor(fxHash(seed, k, 0xd2) * 20);
    if (age >= life) continue;
    const q = age / life;
    const r = w * (0.2 + 1.5 * easeOutCubic(q) * (0.6 + 0.4 * fxHash(seed, k, 0xd3)));
    const px = x + Math.cos(ang) * r;
    const py = fy + Math.sin(ang) * r * 0.37 - q * h * 0.5;
    const fw = 22 * U * (1 - 0.6 * q);
    s.top.emit('soft', px, py, fw, fw * 1.9, 0, envelope(q, 0.1) * 0.95, mixColor(0xffd0ff, violet, q), 'add');
  }
  // the column of fire
  if (age < 80) {
    const q = age / 80;
    const m = half(8, low);
    for (let k = 0; k < m; k++) {
      const u = k / m;
      const fl = 0.7 + 0.3 * fxHash(seed, Math.floor(age / 3), k);
      const fw = w * (0.55 - 0.3 * u) * (1 - 0.5 * q);
      s.top.emit('soft', x + Math.sin(age * 0.3 + k) * 4 * U, fy - h * (0.2 + 1.6 * u * (0.5 + 0.5 * easeOutCubic(q * 3))), fw, fw * 1.6, 0, (1 - q) * fl * 0.9, mixColor(0xff80ff, violet, u), 'add');
    }
  }
  // souls screaming up out of it
  const ws = half(5, low);
  for (let k = 0; k < ws; k++) {
    const q = clamp01((age - 6 - k * 4) / 70);
    if (q <= 0 || q >= 1) continue;
    const a = q * TAU * 1.6 + k * 1.3;
    const px = x + Math.cos(a) * w * 0.45 * (1 - 0.4 * q);
    const py = fy - h * 0.3 - q * h * 2.2;
    const al = envelope(q, 0.15);
    s.top.emit('soft', px, py, 18 * U, 26 * U, 0, al, mixColor(base, 0xffffff, 0.65), 'add');
    s.top.emit('core', px, py - 3 * U, 5 * U, 5 * U, 0, al, 0xffffff, 'add');
  }
  void t;
}

/** MUMMIES — a sand-storm column: a widening vortex of sand winding up out of the tower. */
function mummiesRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const sand = mixColor(base, 0xe8c070, 0.55);
  const gold = 0xffd860;
  const rise = easeOutCubic(clamp01(age / 30)); // the column stands up in half a second …
  const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4; // … and blows away in the last 40 %
  const n = half(30, low);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n; // height fraction up the column
    const ang = age * (0.16 + 0.1 * u) + fxHash(seed, k, 0xa1) * TAU;
    const r = w * (0.22 + 0.75 * u) * (1 + 0.4 * t);
    const px = x + Math.cos(ang) * r;
    const py = fy - h * 2.3 * u * rise + Math.sin(ang) * r * 0.3;
    const near = Math.sin(ang) > 0 ? 1 : 0.45;
    const al = fade * near * (0.55 + 0.45 * fxHash(seed, k, 0xa2));
    s.top.emit('soft', px, py, 18 * U, 10 * U, ang, al * 0.85, sand, 'add');
    s.top.emit('core', px, py, 4 * U, 4 * U, 0, al, 0xfff2c0, 'add');
  }
  // gold glints flashing in the storm
  const roll = Math.floor(age / 6);
  for (let k = 0; k < (low ? 2 : 4); k++) {
    const gx = x + (fxHash(seed, roll, k + 3) - 0.5) * w * 1.4;
    const gy = fy - fxHash(seed, roll, k + 4) * h * 2 * rise;
    const tw = (1 - (age % 6) / 6) * fade;
    s.top.emit('core', gx, gy, 20 * tw * U + 2, 3 * U, 0, tw, gold, 'add');
    s.top.emit('core', gx, gy, 3 * U, 20 * tw * U + 2, 0, tw, gold, 'add');
  }
  // a skirt of sand rolling out over the ground
  const m = half(8, low);
  for (let k = 0; k < m; k++) {
    const ang = (k / m) * TAU + fxHash(seed, k, 0xa5);
    const q = clamp01(age / 80);
    const r = w * (0.4 + 1.2 * easeOutCubic(q));
    const size = w * (0.4 + 0.5 * q);
    s.shade.emit('smoke', x + Math.cos(ang) * r, fy + Math.sin(ang) * r * 0.37, size, size * 0.6, ang, envelope(q, 0.2) * 0.45, mixColor(DUST, sand, 0.4), 'normal');
  }
}

/** NAGAS — a water geyser: a jet of foam thrown high, droplets raining back, splash rings where they land. */
function nagasRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const water = mixColor(base, 0x9ff0ff, 0.45);
  const foam = mixColor(base, 0xffffff, 0.75);
  // the jet: a column that shoots up, holds, and collapses back
  const up = easeOutCubic(clamp01(age / 14));
  const down = age < 40 ? 0 : clamp01((age - 40) / 40);
  const top = fy - h * 2.6 * up * (1 - down);
  const jetH = fy - top;
  if (jetH > 2) {
    const m = half(10, low);
    for (let k = 0; k < m; k++) {
      const u = (k + 0.5) / m;
      const jy = fy - jetH * u;
      const jw = (16 + 10 * (1 - u)) * U * (1 + 0.25 * Math.sin(age * 0.5 + k));
      s.top.emit('soft', x + Math.sin(age * 0.4 + k * 1.7) * 3 * U, jy, jw, jetH / m * 2.2, 0, 0.85 * (1 - down * 0.6), u > 0.8 ? foam : water, 'add');
    }
    s.top.emit('soft', x, top, 44 * U, 30 * U, 0, 0.9 * (1 - down), foam, 'add'); // the crown of spray
  }
  // droplets thrown out of the top of the jet, raining back down; a splash ring where each lands
  const n = half(26, low);
  const g = 0.16 * U;
  for (let k = 0; k < n; k++) {
    const launch = 4 + Math.floor(fxHash(seed, k, 0x71) * 34);
    const a = age - launch;
    if (a < 0) continue;
    const x0 = x;
    const y0 = fy - h * 2.4 * easeOutCubic(clamp01(launch / 14));
    const ang = (fxHash(seed, k, 0x72) - 0.5) * 2.2;
    const v = (2.2 + 2.4 * fxHash(seed, k, 0x73)) * U;
    const vx = Math.sin(ang) * v * 1.3;
    const vy = -Math.cos(ang) * v;
    const gy = fy + (fxHash(seed, k, 0x74) - 0.4) * 30 * U;
    const disc = vy * vy + 2 * g * (gy - y0);
    const tl = (-vy + Math.sqrt(Math.max(0, disc))) / g;
    if (a < tl) {
      const [px, py] = arc(x0, y0, vx, vy, g, a);
      s.top.emit('soft', px, py, 9 * U, 14 * U, Math.atan2(vy + g * a, vx) - Math.PI / 2, 0.95, a < 10 ? foam : water, 'add');
    } else if (a < tl + 24) {
      const q = (a - tl) / 24;
      const [lx] = arc(x0, y0, vx, vy, g, tl);
      s.ground.emit('ring', lx, gy, (10 + 26 * q) * U, (4 + 10 * q) * U, 0, (1 - q) * 0.8, foam, 'add');
    }
  }
  // the mist hanging over it
  s.top.emit('soft', x, fy - h * 0.8, w * 2.2, h * 1.8, 0, envelope(t, 0.2) * 0.35, water, 'add');
}

/** ORCS — a war-fire blast: a fireball rolling out, embers flung wide, a black smoke mushroom. */
function orcsRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const cy = fy - h * 0.4;
  // the fireball: puffs blown outward, white → yellow → orange → red as they cool
  const n = half(16, low);
  for (let k = 0; k < n; k++) {
    const life = 36 + Math.floor(fxHash(seed, k, 0x01) * 18);
    if (age >= life) continue;
    const q = age / life;
    const ang = fxHash(seed, k, 0x02) * TAU;
    const r = w * 0.9 * easeOutCubic(q) * (0.4 + 0.6 * fxHash(seed, k, 0x03));
    const px = x + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r * 0.6 - q * h * 0.5;
    const size = w * (0.35 + 0.55 * q);
    const col = q < 0.3 ? mixColor(0xfff4c0, 0xffb030, q / 0.3) : mixColor(0xffb030, mixColor(base, 0xff2a08, 0.5), (q - 0.3) / 0.7);
    s.top.emit('soft', px, py, size, size, 0, (1 - q) * 0.95, col, 'add');
  }
  // the smoke mushroom climbing out of it (HIGH: a full cap; LOW: the stem)
  const m = low ? 4 : 10;
  for (let k = 0; k < m; k++) {
    const delay = 10 + k * 3;
    const a = age - delay;
    if (a < 0) continue;
    const q = clamp01(a / 70);
    const cap = k >= m / 2;
    const ang = fxHash(seed, k, 0x05) * TAU;
    const spread = cap ? w * 0.7 * q : w * 0.15;
    const px = x + Math.cos(ang) * spread;
    const py = fy - h * (cap ? 0.8 + 1.4 * easeOutCubic(q) : 0.3 + 1.2 * q);
    const size = w * (0.4 + 0.7 * q);
    s.shade.emit('smoke', px, py, size, size * 0.85, ang + q, envelope(q, 0.15) * 0.55, 0x2a2624, 'normal');
  }
  // embers flung wide and falling
  const ne = half(18, low);
  const g = 0.1 * U;
  for (let k = 0; k < ne; k++) {
    const ang = fxHash(seed, k, 0x08) * TAU;
    const v = (2.5 + 3 * fxHash(seed, k, 0x09)) * U;
    const [px, py] = arc(x, cy, Math.cos(ang) * v, Math.sin(ang) * v * 0.7 - 1.5 * U, g, age);
    const life = 50 + Math.floor(fxHash(seed, k, 0x0a) * 30);
    if (age >= life || py > fy + 20 * U) continue;
    s.top.emit('core', px, py, 6 * U, 4 * U, ang, (1 - age / life), 0xffa040, 'add');
  }
  void t;
}

/** VAMPIRES — blood and bats: a crimson burst, bats flung out spiralling up, blood raining down. */
function vampiresRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const blood = mixColor(base, 0xff1030, 0.5);
  const wing = mixColor(base, 0xff3050, 0.4);
  const cy = fy - h * 0.5;
  // the crimson burst
  if (age < 36) {
    const q = age / 36;
    s.top.emit('soft', x, cy, w * (1 + 2 * q), h * (0.8 + 1.4 * q), 0, (1 - q) * 0.8, blood, 'add');
  }
  // bats flung out, spiralling up and away, flapping
  const nb = half(12, low);
  for (let k = 0; k < nb; k++) {
    const q = clamp01((age - k) / 84);
    if (q <= 0 || q >= 1) continue;
    const dir = k % 2 === 0 ? 1 : -1;
    const a0 = (k / nb) * TAU;
    const a = a0 + dir * q * TAU * 0.9;
    const r = w * (0.2 + 1.4 * easeOutCubic(q));
    const bx = x + Math.cos(a) * r;
    const by = cy + Math.sin(a) * r * 0.4 - q * h * 1.6;
    const flap = Math.sin(age * 0.7 + k * 1.9);
    const span = 17 * U * (1 - 0.3 * q);
    const lift = 0.3 + 0.5 * flap;
    const al = envelope(q, 0.08);
    s.top.emit('soft', bx - span * 0.5, by - lift * 4 * U, span, span * 0.42, -lift, al * 0.95, wing, 'add');
    s.top.emit('soft', bx + span * 0.5, by - lift * 4 * U, span, span * 0.42, lift, al * 0.95, wing, 'add');
    s.top.emit('core', bx, by, 7 * U, 9 * U, 0, al, blood, 'add');
    s.top.emit('core', bx, by - 2 * U, 3 * U, 3 * U, 0, al, 0xfff0a0, 'add');
  }
  // blood thrown up and raining back down, staining where it lands
  const nd = half(20, low);
  const g = 0.14 * U;
  for (let k = 0; k < nd; k++) {
    const ang = -Math.PI / 2 + (fxHash(seed, k, 0x41) - 0.5) * 2.6;
    const v = (2.2 + 2.6 * fxHash(seed, k, 0x42)) * U;
    const vx = Math.cos(ang) * v * 1.2;
    const vy = Math.sin(ang) * v;
    const gy = fy + (fxHash(seed, k, 0x43) - 0.4) * 26 * U;
    const disc = vy * vy + 2 * g * (gy - cy);
    const tl = (-vy + Math.sqrt(Math.max(0, disc))) / g;
    if (age < tl) {
      const [px, py] = arc(x, cy, vx, vy, g, age);
      s.top.emit('soft', px, py, 8 * U, 12 * U, Math.atan2(vy + g * age, vx) - Math.PI / 2, 0.95, blood, 'add');
    } else if (age < tl + 40) {
      const q = (age - tl) / 40;
      const [lx] = arc(x, cy, vx, vy, g, tl);
      s.ground.emit('soft', lx, gy, 16 * U, 7 * U, 0, (1 - q) * 0.75, blood, 'add');
    }
  }
  void t;
}

/** ZOMBIES — a toxic eruption: goo blobs lobbed high that splat on landing, a green gas cloud, popping bubbles. */
function zombiesRelease(s: BossReleaseSinks, seed: number, x: number, fy: number, w: number, h: number, age: number, t: number, low: boolean, base: number, U: number): void {
  const goo = mixColor(base, 0x9cff3a, 0.4);
  const hot = mixColor(base, 0xffffff, 0.5);
  const cy = fy - h * 0.55;
  // the gout of goo off the crown
  if (age < 30) {
    const q = age / 30;
    s.top.emit('soft', x, cy - q * h * 0.6, w * (0.6 + 0.8 * q), h * (0.9 + 0.8 * q), 0, (1 - q) * 0.85, goo, 'add');
  }
  // blobs lobbed high, falling, splatting
  const n = half(16, low);
  const g = 0.13 * U;
  for (let k = 0; k < n; k++) {
    const launch = Math.floor(fxHash(seed, k, 0x21) * 16);
    const a = age - launch;
    if (a < 0) continue;
    const ang = -Math.PI / 2 + (fxHash(seed, k, 0x22) - 0.5) * 2.2;
    const v = (2.6 + 2.6 * fxHash(seed, k, 0x23)) * U;
    const vx = Math.cos(ang) * v * 1.3;
    const vy = Math.sin(ang) * v;
    const gy = fy + (fxHash(seed, k, 0x24) - 0.4) * 30 * U;
    const disc = vy * vy + 2 * g * (gy - cy);
    const tl = (-vy + Math.sqrt(Math.max(0, disc))) / g;
    const sz = (12 + 10 * fxHash(seed, k, 0x25)) * U;
    if (a < tl) {
      const [px, py] = arc(x, cy, vx, vy, g, a);
      s.top.emit('bubble', px, py, sz, sz * 1.15, 0, 0.95, goo, 'add');
    } else if (a < tl + 40) {
      const q = (a - tl) / 40;
      const [lx] = arc(x, cy, vx, vy, g, tl);
      s.ground.emit('soft', lx, gy, sz * (2 + q), sz * 0.8, 0, (1 - q) * 0.85, goo, 'add');
      if (q < 0.4) s.ground.emit('ring', lx, gy, sz * (1.5 + 3 * q), sz * (0.6 + q), 0, (1 - q / 0.4) * 0.8, hot, 'add');
    }
  }
  // the gas cloud rolling out (shade: it darkens, a sickly green)
  const m = half(9, low);
  for (let k = 0; k < m; k++) {
    const delay = Math.floor(fxHash(seed, k, 0x28) * 20);
    const q = clamp01((age - delay) / 76);
    if (q <= 0 || q >= 1) continue;
    const ang = fxHash(seed, k, 0x29) * TAU;
    const r = w * (0.2 + 1.1 * easeOutCubic(q));
    const size = w * (0.4 + 0.7 * q);
    s.shade.emit('smoke', x + Math.cos(ang) * r, fy - h * 0.2 + Math.sin(ang) * r * 0.37 - q * h * 0.4, size, size * 0.8, ang + q, envelope(q, 0.15) * 0.5, mixColor(0x3c5a22, goo, 0.25), 'normal');
  }
  // bubbles swelling and popping over the ruin
  const nb = low ? 3 : 6;
  for (let k = 0; k < nb; k++) {
    const q = clamp01((age - 10 - k * 9) / 30);
    if (q <= 0 || q >= 1) continue;
    const bx = x + (fxHash(seed, k, 0x2b) - 0.5) * w * 1.2;
    const by = fy - h * 0.1 - fxHash(seed, k, 0x2c) * h * 0.4;
    const sz = (14 + 10 * fxHash(seed, k, 0x2d)) * U;
    if (q < 0.75) s.top.emit('bubble', bx, by, sz * (0.3 + q), sz * (0.3 + q), 0, 0.9, goo, 'add');
    else s.top.emit('ring', bx, by, sz * 2.2, sz * 1.5, 0, (1 - (q - 0.75) / 0.25) * 0.85, hot, 'add');
  }
  void t;
}
