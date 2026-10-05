/**
 * SPARK — S195 T19 (owner B-3, RULED: *add a short "repaired" sparkle*) · **THE REPAIRED SPARKLE, PURE.**
 *
 * A FIX that re-stands a fallen tower played nothing (T4 L2 LOOK): its shapes had already been seen standing,
 * so the build sparkle (`fx/towerSparkleFx.ts`, a REVEAL) did not fire again, and the fix-me sparkle simply
 * stopped. This is the beat that marks the moment: a ring of light that swells out from the tower's shapes
 * and a handful of bright motes that rise and twinkle out, in the seat colour — short, then gone.
 *
 * PURE: a function of (seed, position, radius, tint, the beat's 0..1 life). No Pixi, no clock, no `Math.random`
 * (`fxGuards.test.ts` walks `fx/`; this file lives beside its consumer and is pinned by `syncedCues.test.ts`).
 * ⚠ EVERY NUMBER HERE IS MINE (an owner LOOK item, like every S192+ fx number).
 */
import { clamp01, easeOutCubic, fxHash, mixColor, type FxSink } from '../fx/emitter.ts';

/** How long the repaired beat lasts, ticks (0.75 s). MINE. */
export const REPAIRED_SPARKLE_TICKS = 45;
/** Motes thrown up off the re-welded shapes. MINE. */
export const REPAIRED_SPARKLE_MOTES = 8;

export function repairedSparkleFx(
  top: FxSink, seed: number, x: number, y: number, radius: number, tint: number, t: number,
): void {
  if (t < 0 || t >= 1) return;
  const bright = mixColor(tint, 0xffffff, 0.55);
  const fade = 1 - t;
  // The flash: the whole footprint lights up and settles in the first quarter.
  if (t < 0.25) {
    const f = 1 - t / 0.25;
    top.emit('soft', x, y, radius * 2.6, radius * 2.6, 0, 0.45 * f, tint, 'add');
    top.emit('core', x, y, radius * 0.9, radius * 0.9, 0, 0.7 * f, bright, 'add');
  }
  // The ring: swells from the shapes to twice their reach and thins out.
  const d = radius * 2 * (0.6 + 1.4 * easeOutCubic(t));
  top.emit('ring', x, y, d, d, 0, 0.55 * fade * fade, bright, 'add');
  // The motes: each rises on its own line and twinkles out of step with its neighbours.
  for (let k = 0; k < REPAIRED_SPARKLE_MOTES; k++) {
    const a = fxHash(seed, k, 1) * Math.PI * 2;
    const r0 = radius * (0.35 + 0.65 * fxHash(seed, k, 2));
    const rise = (18 + 30 * fxHash(seed, k, 3)) * easeOutCubic(t);
    const tw = 0.5 + 0.5 * Math.sin((t * (3 + 2 * fxHash(seed, k, 4)) + fxHash(seed, k, 5)) * Math.PI * 2);
    const size = 3 + 4 * tw;
    top.emit('core', x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.6 - rise, size, size, 0,
      clamp01((0.4 + 0.6 * tw) * fade * 1.2), bright, 'add');
  }
}
