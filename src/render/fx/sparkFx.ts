/**
 * SPARK — S193 `s193/visuals-board` (V25) — **A FREE SPARK GLOWS.**
 *
 * A free spark is raw matter, drawn as a flat off-white shape (`renderer.ts`). This puts one soft
 * additive glow BEHIND each one that breathes slowly, so the quarry reads as a pool of live energy
 * rather than a scatter of stickers. A carried spark glows a little brighter, in its carrier's colour
 * (the S45 rule: the carry "lights up").
 *
 * ⭐ PURE and ONE SPRITE A SPARK. The pulse is a function of `world.tick` and the spark's id (the
 * phase spread), never an accumulator, so every screen breathes in step. Every number is MINE.
 */

import { type FxSink } from './emitter.ts';

/** Ticks per breath: 2.5 s. */
export const SPARK_GLOW_PERIOD_TICKS = 150;
/** Glow diameter as a multiple of the spark's drawn size (~24 px). */
export const SPARK_GLOW_SCALE = 2.6;
const SPARK_GLOW_PX = 24;

/** The 0..1 breath of spark `id` at `tick`. PURE. */
export function sparkGlowPulse(id: number, tick: number): number {
  const phase = ((Math.imul(id | 0, 0x9e3779b1) >>> 0) % SPARK_GLOW_PERIOD_TICKS);
  const u = ((tick + phase) % SPARK_GLOW_PERIOD_TICKS) / SPARK_GLOW_PERIOD_TICKS;
  return 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
}

export function sparkGlowFx(sink: FxSink, id: number, tick: number, x: number, y: number, tint: number, carried: boolean): void {
  const p = sparkGlowPulse(id, tick);
  const d = SPARK_GLOW_PX * SPARK_GLOW_SCALE * (0.85 + 0.25 * p);
  const a = (carried ? 0.42 : 0.24) + (carried ? 0.18 : 0.16) * p;
  sink.emit('soft', x, y, d, d, 0, a, tint, 'add');
}
