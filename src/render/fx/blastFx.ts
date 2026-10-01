/**
 * SPARK — S192 `s192/visuals` STEP 3 (V04) — **EVERY DETONATION, REBUILT: FLASH, FIREBALL, EMBERS, SMOKE, SHOCK.**
 *
 * One drawer, six producers — the `BOMB_EXPLODE` effect is what the lightning hub's self-destruct
 * (`potatoLifecycle.ts`), the zombie boss's 380 px death raze (`hostTick.ts` → `STRUCTURE_SELFDESTRUCT`),
 * the suicide goblin (`suicideBlast.ts`), the lightning drone (`droneLifecycle.ts`), the stink tower
 * and its bags (`stinkTower.ts`) and `damage.ts` all push. So this one file upgrades all of them.
 * The S71 drawer (`effects/bombExplode.ts`, kept behind `?fx=legacy`) was an orange stroke ring and
 * a flat disc — and its ring grew to 3.2 × the radius, far past the area that is actually hit.
 *
 * ⭐ WHAT THIS DRAWS, sized off the effect's own `radius` so a 70 px goblin pop and the 380 px zombie
 * raze are the same explosion at two scales — every number is MINE:
 *   · a white-hot FLASH (the first quarter of the life);
 *   · a FIREBALL, orange to deep red, swelling and fading;
 *   · a soft SHOCK RING running out to 1.15 × radius — the true hitbox, give or take its soft edge;
 *   · 28 EMBERS thrown outward under gravity, stretched along their flight;
 *   · 8 SMOKE puffs, normal blend (smoke covers, it does not glow), rising and spreading;
 *   · a SCORCH on the ground that outlives the fire;
 *   · a ground ripple (`ShockwaveFilter`, HIGH only).
 *
 * ⚠ The effect is a pushed `world.effects` entry, so its clock is the effect's own `tick` (age = now −
 * tick) and its seed is that tick plus its rounded position — the same on every screen that drained it.
 */

import { clamp01, easeOutCubic, envelope, fxHash, fxSeedAt, mixColor, type FxShockSink, type FxSink } from './emitter.ts';

export const BLAST_FX_EMBERS = 28;
export const BLAST_FX_SMOKE = 8;
/** The shock ring's reach, as a multiple of the effect radius. */
export const BLAST_FX_RING_REACH = 1.15;

const FLASH = 0xfff4d6;
const FIRE_HOT = 0xffc35a;
const FIRE_COOL = 0xd2361a;
const EMBER_HOT = 0xffe6a0;
const EMBER_COOL = 0xff6a1f;
const SMOKE = 0x51463f; // lighter than soot, so it still reads as smoke on the dark race boards
const SCORCH = 0x1a1210;

/**
 * Where ember `k` is at life fraction `t` (offsets from the blast centre). Thrown out on a hashed
 * bearing and speed, decelerating (ease-out) and falling under a constant gravity. PURE.
 */
export function blastEmberAt(seed: number, k: number, t: number, radius: number): { dx: number; dy: number } {
  const a = fxHash(seed, k, 1) * Math.PI * 2;
  const reach = radius * (0.55 + 0.75 * fxHash(seed, k, 2));
  const d = reach * easeOutCubic(t);
  const lift = radius * (0.25 + 0.35 * fxHash(seed, k, 3)); // thrown UP a little first
  const gravity = radius * 0.9;
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.6 - lift * t + gravity * t * t };
}

export function blastFx(
  top: FxSink,
  ground: FxSink,
  shock: FxShockSink,
  effectTick: number,
  x: number,
  y: number,
  radius: number,
  t: number,
  ageTicks: number,
): void {
  if (t < 0 || t >= 1 || radius <= 0) return;
  const seed = fxSeedAt(effectTick, x, y);
  const r = radius;

  // The scorch: lands at once, fades slowest. Normal blend — burnt ground darkens.
  ground.emit('soft', x, y, r * 2.1, r * 0.95, 0, 0.5 * (1 - t * t), SCORCH, 'normal');

  // Smoke: rising, spreading, darkening the fire from above.
  for (let s = 0; s < BLAST_FX_SMOKE; s++) {
    const a = fxHash(seed, s, 40) * Math.PI * 2;
    const d = r * (0.25 + 0.5 * fxHash(seed, s, 41)) * easeOutCubic(t);
    const size = r * (0.55 + 0.6 * t) * (0.7 + 0.5 * fxHash(seed, s, 42));
    const sx = x + Math.cos(a) * d;
    const sy = y + Math.sin(a) * d * 0.5 - r * 0.45 * t;
    top.emit('smoke', sx, sy, size, size * 0.85, fxHash(seed, s, 43) * 6.283, 0.6 * envelope(t, 0.3), SMOKE, 'normal');
  }

  // The fireball.
  const fire = clamp01(1 - t / 0.75);
  if (fire > 0) {
    const fr = r * (0.7 + 0.6 * easeOutCubic(t));
    top.emit('soft', x, y - r * 0.08, fr * 2.2, fr * 1.7, 0, fire * 0.95, mixColor(FIRE_HOT, FIRE_COOL, t / 0.75), 'add');
    top.emit('core', x, y - r * 0.08, fr * 1.2, fr * 1.0, 0, fire * 0.9, FIRE_HOT, 'add');
  }

  // The flash.
  const flash = clamp01(1 - t / 0.22);
  if (flash > 0) top.emit('core', x, y, r * 2.0 * (0.6 + 0.4 * flash), r * 1.5 * (0.6 + 0.4 * flash), 0, flash, FLASH, 'add');

  // The shock ring.
  const ringD = 2 * r * (0.25 + (BLAST_FX_RING_REACH - 0.25) * easeOutCubic(t / 0.6));
  top.emit('ring', x, y, ringD, ringD * 0.6, 0, 0.9 * clamp01(1 - t / 0.6), FIRE_HOT, 'add');

  // The embers.
  for (let k = 0; k < BLAST_FX_EMBERS; k++) {
    const life = 0.55 + 0.45 * fxHash(seed, k, 4); // each ember burns out on its own clock
    const et = t / life;
    if (et >= 1) continue;
    const p = blastEmberAt(seed, k, et, r);
    const q = blastEmberAt(seed, k, Math.max(0, et - 0.04), r);
    const vx = p.dx - q.dx;
    const vy = p.dy - q.dy;
    const len = Math.hypot(vx, vy);
    const size = Math.max(2.5, r * 0.06) * (1 - 0.6 * et);
    top.emit('soft', x + p.dx, y + p.dy, Math.max(size, Math.min(size * 5, len * 2.5)), size, Math.atan2(vy, vx),
      (1 - et) * 0.95, mixColor(EMBER_HOT, EMBER_COOL, et), 'add');
  }

  shock.shock(x, y, ageTicks, r * 1.4, Math.min(30, 8 + r * 0.06));
}
