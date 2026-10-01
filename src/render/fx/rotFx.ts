/**
 * SPARK — S192 `s192/visuals` STEP 3 (V05) — **THE ZOMBIE BOSS'S ROT AURA, REBUILT AS A BOIL.**
 *
 * The S170 drawing (`bossAuras.ts` `drawRotAura`, kept behind `?fx=legacy`) was 14 flat green circles
 * over a dark disc. The disc STAYS — it is drawn at exactly `ZOMBIE_AURA_RADIUS`, the circle the sim
 * damages inside, so it is a readout and keeps its hard edge. What changes is everything ON it:
 *   · 18 soft glowing BUBBLES that swell over 70 % of their cycle and then POP — the pop throws 3 droplets
 *     out and up and leaves a small splash ring (the S170 bubble just shrank away);
 *   · ~18 slow MIASMA wisps (the smoke texture, sickly green, additive) rising off the boil.
 * Every number is MINE — the owner ruled the mechanic (R138), not the look — except the one thing he
 * did say about this boss's visuals: the death blast *"kinda looks just like a stink tower radius"*.
 * So, still, no ring around the edge.
 *
 * ⚠ It is drawn only while he is NOT stunned — `bossAuras.ts` checks the same predicate the sim's
 * `runZombieRotAura` does before calling here, exactly as it did for the S170 drawing.
 */

import { envelope, forEachLive, fxHash, fxSeed, type FxSink } from './emitter.ts';

export const ROT_FX_BUBBLES = 18;
export const ROT_FX_CYCLE = 42;
export const ROT_FX_WISP_LIFE = 90;
export const ROT_FX_WISP_PERIOD = 5;

const BUBBLE = 0x8fd14a;
const DROPLET = 0xc8f27a;
const MIASMA = 0x86c94a;

/** Bubble `k` of boss `id`: its fixed spot (offsets) and where it is in its swell→pop cycle. PURE. */
export function rotBubbleAt(id: number, k: number, tick: number, radius: number): { dx: number; dy: number; t: number } {
  const seed = fxSeed(id, 0x707);
  const a = fxHash(seed, k, 1) * Math.PI * 2;
  const d = Math.sqrt(fxHash(seed, k, 2)) * radius * 0.92; // sqrt: an even spread over the disc, not a clump at the centre
  const offset = Math.floor(fxHash(seed, k, 3) * ROT_FX_CYCLE);
  const phase = (((tick + offset) % ROT_FX_CYCLE) + ROT_FX_CYCLE) % ROT_FX_CYCLE;
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.55, t: phase / ROT_FX_CYCLE };
}

export function rotFx(ground: FxSink, top: FxSink, id: number, x: number, y: number, tick: number, radius: number): void {
  const seed = fxSeed(id, 0x707);
  for (let k = 0; k < ROT_FX_BUBBLES; k++) {
    const b = rotBubbleAt(id, k, tick, radius);
    const bx = x + b.dx;
    const by = y + b.dy;
    const size = 11 + 12 * fxHash(seed, k, 4);
    if (b.t < 0.7) {
      const swell = b.t / 0.7;
      const s = size * (0.35 + 0.65 * swell);
      ground.emit('bubble', bx, by, s, s * 0.85, 0, 0.45 + 0.55 * swell, BUBBLE, 'add');
      ground.emit('soft', bx, by, s * 1.8, s * 1.2, 0, 0.18 + 0.2 * swell, BUBBLE, 'add'); // its glow
    } else {
      // THE POP: a splash ring and three droplets thrown out and up, all gone by the cycle's end.
      const p = (b.t - 0.7) / 0.3;
      ground.emit('ring', bx, by, size * (1 + 1.6 * p), size * (0.6 + 0.9 * p), 0, (1 - p) * 0.7, BUBBLE, 'add');
      for (let j = 0; j < 3; j++) {
        const a = fxHash(seed, k * 3 + j, 5) * Math.PI * 2;
        const d = size * (0.6 + 1.4 * p);
        const hop = Math.sin(p * Math.PI) * size * 1.2;
        top.emit('core', bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.5 - hop, 6, 6, 0, (1 - p) * 0.95, DROPLET, 'add');
      }
    }
  }
  forEachLive(tick, ROT_FX_WISP_PERIOD, ROT_FX_WISP_LIFE, 1, id * 11, (birth, k, t) => {
    const a = fxHash(seed, birth, k + 50) * Math.PI * 2;
    const d = Math.sqrt(fxHash(seed, birth, k + 51)) * radius * 0.8;
    const rise = (30 + 40 * fxHash(seed, birth, k + 52)) * t;
    const sway = Math.sin(t * 5 + a) * 5;
    const size = 18 + 26 * t;
    top.emit('smoke', x + Math.cos(a) * d + sway, y + Math.sin(a) * d * 0.55 - rise, size, size * 0.8, a,
      envelope(t, 0.3) * 0.4, MIASMA, 'add');
  });
}
