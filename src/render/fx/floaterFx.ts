/**
 * SPARK — S193 `s193/visuals-combat` (visuals-4, V08) — **THE DAMAGE AND HEAL NUMBERS' JUICE.**
 *
 * Called from `damageNumbers.ts`'s per-frame `advance()` and nowhere else, so that file's change is a
 * few lines (it is also edited by `s192/zombies` and `s192/magic`). The number itself stays crisp
 * Kanit text; this only shapes how it ARRIVES and what sparkles beside a heal:
 *   · POP-IN 0.6× → 1.15× → 1× across the first sixth of the life (the S192 plan's V08 shape; the
 *     shipped NameplateSCT 0.5 → 2.0 → 1.0 punch stays the `?fx=legacy` path);
 *   · a BIG HIT shakes ±2 px for its first few frames, settling to still;
 *   · a HEAL gets three green-white sparkle motes rising and twinkling beside it.
 *
 * ⛔ IT DOES NOT TOUCH WHERE A NUMBER SITS OR HOW MANY THERE ARE. The owner's R185-D (every hit at its
 * own anchor, numbers *"go over each other, it looks epic"*) and R190-I (the hit and the heal each
 * get their own number) live entirely in `damageNumbers.ts`'s watch, anchor and `place`; the shake
 * is a ±2 px wobble around the anchor `place` chose, and nothing here merges, hides or moves one.
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). The age is the
 * renderer's presentational FRAME counter (its own header explains why a tick would stutter on a
 * peer), and the seed is the floater's own anchor and amount, so the wobble is reproducible.
 *
 * ⚠ Every number here is MINE except the 0.6 / 1.15 / 1 pop and the 2 px shake (the S192 plan).
 */

import { clamp01, easeOutCubic, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

/** The pop's start, overshoot and rest scale (S192 plan V08). */
export const FLOATER_POP_FROM = 0.6;
export const FLOATER_POP_PEAK = 1.15;
/**
 * ⚠ MINE — a hit this many FIFTHS or more is "big" and shakes. 60 fifths is 12 HP: above every
 * goblin swing (`attackFifths(2,1)` = 12) and every tower shot on the shipped roster, reached by
 * boss strikes, a lightning-hub blast (120) and a stacked chain — so a shake still means something.
 */
export const FLOATER_BIG_HIT_FIFTHS = 60;
/** The shake's amplitude (px, S192 plan) and how many frames it lasts before settling (MINE). */
export const FLOATER_SHAKE_PX = 2;
export const FLOATER_SHAKE_FRAMES = 10;
/** Sparkle motes beside a heal (S192 plan: three). */
export const FLOATER_HEAL_MOTES = 3;

/**
 * The pop-in scale at `age` frames, where the pop spans `popFrames`. 0.6 → 1.15 over the first
 * half (eased out, so it snaps up), 1.15 → 1 over the second half, then 1 for the rest of its life.
 */
export function floaterPopScale(age: number, popFrames: number): number {
  const k = popFrames <= 0 ? 1 : age / popFrames;
  if (k >= 1) return 1;
  if (k < 0.5) return FLOATER_POP_FROM + (FLOATER_POP_PEAK - FLOATER_POP_FROM) * easeOutCubic(k / 0.5);
  return FLOATER_POP_PEAK + (1 - FLOATER_POP_PEAK) * ((k - 0.5) / 0.5);
}

/** A floater's seed: its anchor (rounded) and its amount — synced numbers, so every screen agrees. */
export function floaterSeed(x: number, y: number, amount: number): number {
  return fxSeed(Math.round(x) * 7919 + Math.round(y), amount);
}

/**
 * The big-hit wobble at `age` frames, in px, as a reused out-parameter (no allocation per frame).
 * Zero for a heal, for a hit under `FLOATER_BIG_HIT_FIFTHS`, and after `FLOATER_SHAKE_FRAMES`.
 * The amplitude decays linearly to 0, and each frame's offset is a fresh hash, so it judders.
 */
export function floaterShake(
  out: { dx: number; dy: number }, age: number, amount: number, heal: boolean, seed: number,
): { dx: number; dy: number } {
  out.dx = 0;
  out.dy = 0;
  if (heal || amount < FLOATER_BIG_HIT_FIFTHS || age >= FLOATER_SHAKE_FRAMES || age < 0) return out;
  const amp = FLOATER_SHAKE_PX * (1 - age / FLOATER_SHAKE_FRAMES);
  out.dx = (fxHash(seed, age, 0x5ac1) * 2 - 1) * amp;
  out.dy = (fxHash(seed, age, 0x5ac2) * 2 - 1) * amp;
  return out;
}

/**
 * THE HEAL SPARKLE — three motes beside the number at (x, y): each starts at a hashed spot within
 * ±22 px, rises a little faster than the number, twinkles (its size steps every 3 frames), and
 * fades with the number's own `alpha`. Additive, green cooling to white.
 */
export function healSparkleFx(
  top: FxSink, x: number, y: number, age: number, lifeFrames: number, alpha: number, seed: number,
): void {
  if (alpha <= 0.02 || lifeFrames <= 0) return;
  const p = clamp01(age / lifeFrames);
  for (let m = 0; m < FLOATER_HEAL_MOTES; m++) {
    const delay = 0.12 * m; // staggered, so the three do not appear on one frame
    const q = (p - delay) / (1 - delay);
    if (q <= 0) continue;
    const ox = (fxHash(seed, m, 0x4e1) * 2 - 1) * 22;
    const oy = (fxHash(seed, m, 0x4e2) * 2 - 1) * 6 - 4;
    const rise = 18 * q;
    const twinkle = 0.6 + 0.4 * fxHash(seed, m * 97 + Math.floor(age / 3), 0x4e3);
    const d = (8 + 5 * fxHash(seed, m, 0x4e4)) * twinkle;
    const mx = x + ox;
    const my = y + oy - rise;
    top.emit('soft', mx, my, d * 3, d * 3, 0, 0.7 * alpha, 0x3fdc5a, 'add');
    top.emit('core', mx, my, d, d, 0, 0.95 * alpha, mixColor(0x9dffb0, 0xffffff, q), 'add');
  }
}
