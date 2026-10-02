/**
 * SPARK — S193 `s193/visuals-board` (V20 + V23) — **BUILD JUICE AND THE RAIDED CLOUD, LIT.**
 *
 * The S6/S10/S13 build punctuation (bond commit, sever erase, structure grow and merge, score tier)
 * was drawn as flat Graphics discs and 1-3 px stroke rings. This file is the light that replaces the
 * flat parts: soft additive rings and small spark pops in the OWNER's colour (`effect.color` — the
 * placer's, the severer's, the raider's), all on the bloomed TOP layer.
 *
 * ⚠ WHAT STAYS. The twelve bespoke combo silhouettes (`effects/silhouettes.ts`) are the combo's
 * IDENTITY, so `bondCommit.ts` still draws them over this light; the RAIDED cloud's crisp ring and its
 * two "struck here" ticks stay too, because they are what keep the cloud POINTING at the spot after it
 * has billowed away from it (S152 P1). Only the flat discs and the generic default ring are replaced.
 *
 * ⭐ PURE. Every particle is a function of (the effect's own tick + rounded position, the particle
 * index, the effect's age). The effect is a drained `world.effects` entry, so every screen that drew
 * it draws the same sparks. No Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`).
 *
 * Every number is MINE (⚠ owner LOOK item), sized off the effect's own radius.
 */

import { clamp01, easeOutCubic, envelope, fxHash, mixColor, type FxSink } from './emitter.ts';

/** Spark pops per bond commit. */
export const COMMIT_FX_SPARKS = 8;
/** Fragments per sever. */
export const SEVER_FX_SHARDS = 6;
/** Sparks per score-tier crossing. */
export const TIER_FX_SPARKS = 12;
/** Debris fragments per RAIDED kill (a survived hit throws half). */
export const RAIDED_FX_DEBRIS = 8;

/**
 * BOND_COMMIT: a soft flash, a soft ring running out to ~3.5 × the prim radius (the old default
 * ring's reach) and 8 spark pops thrown outward. `t` is the 0..1 life (24 ticks).
 */
export function bondCommitFx(top: FxSink, seed: number, x: number, y: number, radius: number, color: number, t: number): void {
  if (t < 0 || t >= 1) return;
  const e = easeOutCubic(t);
  const fade = 1 - t;
  if (t < 0.35) {
    const f = 1 - t / 0.35;
    const d = radius * (2.4 + 1.2 * e);
    top.emit('soft', x, y, d * 2, d * 2, 0, 0.55 * f, color, 'add');
    top.emit('core', x, y, radius * 2.2, radius * 2.2, 0, 0.8 * f, mixColor(color, 0xffffff, 0.6), 'add');
  }
  const ringD = radius * 2 * (1 + 2.5 * e);
  top.emit('ring', x, y, ringD, ringD, 0, 0.7 * fade, color, 'add');
  for (let k = 0; k < COMMIT_FX_SPARKS; k++) {
    const a = (k / COMMIT_FX_SPARKS) * Math.PI * 2 + fxHash(seed, k, 1) * 0.6;
    const d = radius * (1.2 + 2.6 * fxHash(seed, k, 2)) * e;
    const len = 3 + 7 * fade;
    top.emit('soft', x + Math.cos(a) * d, y + Math.sin(a) * d, len, 2.6, a, 0.9 * fade, mixColor(0xffffff, color, t), 'add');
  }
}

/**
 * SEVER_ERASE: the shape dissolves. A soft ghost glow that shrinks, a soft ring running out to the
 * old shock reach (~4.5 × radius), and 6 fragments drifting outward and DOWN while they cool.
 */
export function severEraseFx(top: FxSink, seed: number, x: number, y: number, radius: number, color: number, t: number): void {
  if (t < 0 || t >= 1) return;
  const ease = t * t;
  const fade = 1 - ease;
  const ghostD = radius * 2 * (1.3 - 0.6 * ease);
  top.emit('soft', x, y, ghostD * 1.6, ghostD * 1.6, 0, 0.5 * fade, color, 'add');
  const ringD = radius * 2 * (1 + 3.5 * easeOutCubic(t));
  top.emit('ring', x, y, ringD, ringD, 0, 0.45 * fade, color, 'add');
  for (let k = 0; k < SEVER_FX_SHARDS; k++) {
    const a = fxHash(seed, k, 1) * Math.PI * 2;
    const d = radius * (0.8 + 2.2 * fxHash(seed, k, 2)) * easeOutCubic(t);
    const fall = radius * 1.4 * t * t;
    top.emit('soft', x + Math.cos(a) * d, y + Math.sin(a) * d + fall, 4.5, 4.5, 0, 0.8 * fade, mixColor(color, 0x8a8a96, t), 'add');
  }
}

/**
 * STRUCTURE_GROW, one primitive's flash as the wavefront reaches it: a soft glow and a soft ring.
 * `t` is the 0..1 position inside that primitive's own flash window; `env` the drawer's sine envelope.
 */
export function growPrimFx(top: FxSink, x: number, y: number, primRadius: number, color: number, t: number): void {
  const env = envelope(t, 0.4);
  if (env <= 0) return;
  const d = primRadius * 2 * (1.5 + 1.4 * t);
  top.emit('ring', x, y, d, d, 0, 0.75 * env, color, 'add');
  top.emit('soft', x, y, d * 1.1, d * 1.1, 0, 0.35 * env, color, 'add');
}

/**
 * STRUCTURE_GROW, one bond's flash: a soft streak laid along the bond, plus a travelling bead that
 * runs a → b while the bond lights.
 */
export function growBondFx(top: FxSink, ax: number, ay: number, bx: number, by: number, color: number, t: number): void {
  const env = envelope(t, 0.4);
  if (env <= 0) return;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const rot = Math.atan2(dy, dx);
  top.emit('soft', (ax + bx) / 2, (ay + by) / 2, len * 1.25, 10, rot, 0.45 * env, color, 'add');
  const c = clamp01(t);
  top.emit('core', ax + dx * c, ay + dy * c, 10, 10, 0, 0.9 * env, mixColor(color, 0xffffff, 0.55), 'add');
}

/**
 * STRUCTURE_MERGE, one union primitive: a soft glow swelling with the sine envelope, and two spark
 * pops that rise off it — the merge reads as one SNAP across the whole union.
 */
export function mergePrimFx(top: FxSink, seed: number, x: number, y: number, primRadius: number, color: number, t: number): void {
  const env = envelope(t, 0.3);
  if (env <= 0) return;
  const d = primRadius * 2 * (1.8 + 1.2 * t);
  top.emit('soft', x, y, d * 1.3, d * 1.3, 0, 0.55 * env, color, 'add');
  for (let k = 0; k < 2; k++) {
    const a = -Math.PI / 2 + (fxHash(seed, k, 1) - 0.5) * 1.6;
    const r = primRadius * (1 + 2.2 * t);
    top.emit('core', x + Math.cos(a) * r, y + Math.sin(a) * r, 6, 6, 0, 0.9 * env, mixColor(color, 0xffffff, 0.5), 'add');
  }
}

/**
 * SCORE_TIER: a soft bloom (60 → 100 px, the S13 sizes), a soft leading ring (40 → 100 px) and 12
 * sparks fanning out and rising. `t` is the 0..1 life (48 ticks).
 */
export function scoreTierFx(top: FxSink, seed: number, x: number, y: number, color: number, t: number): void {
  if (t < 0 || t > 1) return;
  const env = Math.sin(clamp01(t) * Math.PI);
  if (env <= 0) return;
  const bloomD = (60 + t * 40) * 2;
  top.emit('soft', x, y, bloomD, bloomD, 0, 0.5 * env, color, 'add');
  const ringD = (40 + t * 60) * 2;
  top.emit('ring', x, y, ringD, ringD, 0, 0.85 * env, color, 'add');
  for (let k = 0; k < TIER_FX_SPARKS; k++) {
    const a = (k / TIER_FX_SPARKS) * Math.PI * 2 + fxHash(seed, k, 1) * 0.4;
    const d = (30 + 70 * fxHash(seed, k, 2)) * easeOutCubic(t);
    const rise = 26 * t * t;
    top.emit('soft', x + Math.cos(a) * d, y + Math.sin(a) * d - rise, 8, 3, a, 0.95 * env, mixColor(0xffffff, color, t), 'add');
  }
}

/** The RAIDED cloud's puff table, the same lopsided ring `effects/raided.ts` draws (fractions of 16 px). */
export const RAIDED_FX_PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  [0.0, -0.35, 0.62],
  [-0.55, -0.05, 0.5],
  [0.55, -0.1, 0.54],
  [-0.3, 0.3, 0.44],
  [0.34, 0.32, 0.46],
];
const RAIDED_BASE = 16;

/**
 * RAIDED (V23): the attribution cloud in the RAIDER's saturated colour, as soft smoke puffs (normal
 * blend on the non-bloomed SHADE layer — smoke covers, it does not glow), plus a soft impact flash in
 * the first sixth of the life and debris thrown out under gravity in the first third. The hold-then-go
 * fade and the billow/rise are the S152 numbers exactly, so the cloud still lives 3 s and still reads
 * at a glance from across the board.
 */
export function raidedFx(top: FxSink, shade: FxSink, seed: number, x: number, y: number, color: number, killed: boolean, t: number): void {
  if (t < 0 || t >= 1) return;
  const alpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
  const eased = 1 - (1 - t) * (1 - t);
  const spread = 1 + eased * 0.85;
  const rise = eased * 14;
  const scale = (killed ? 1 : 0.6) * spread;
  for (let i = 0; i < RAIDED_FX_PUFFS.length; i++) {
    const [dx, dy, pr] = RAIDED_FX_PUFFS[i]!;
    // The smoke texture's visible body is ~0.8 of its box, so a box of 2.5 × r covers the old disc.
    const d = pr * RAIDED_BASE * scale * 2.5;
    const rot = fxHash(seed, i, 7) * Math.PI * 2 + t * (i % 2 === 0 ? 0.6 : -0.6);
    shade.emit('smoke', x + dx * RAIDED_BASE * spread, y + dy * RAIDED_BASE * spread - rise, d, d, rot, alpha * 0.8, color, 'normal');
  }
  // A faint glow under the cloud in the raider's colour, so it reads on a dark board.
  top.emit('soft', x, y - rise * 0.5, RAIDED_BASE * 3.2 * scale, RAIDED_BASE * 2.6 * scale, 0, alpha * 0.35, color, 'add');
  if (t < 1 / 6) {
    const f = 1 - t * 6;
    top.emit('core', x, y, 46 * f + 14, 46 * f + 14, 0, 0.9 * f, mixColor(color, 0xffffff, 0.55), 'add');
  }
  const n = killed ? RAIDED_FX_DEBRIS : RAIDED_FX_DEBRIS / 2;
  const dt = t * 3;
  if (dt < 1) {
    for (let k = 0; k < n; k++) {
      const a = fxHash(seed, k, 1) * Math.PI * 2;
      const d = (14 + 30 * fxHash(seed, k, 2)) * easeOutCubic(dt);
      const lift = 10 + 12 * fxHash(seed, k, 3);
      const py = y + Math.sin(a) * d * 0.6 - lift * dt + 34 * dt * dt;
      top.emit('soft', x + Math.cos(a) * d, py, 5, 5, 0, 0.9 * (1 - dt), mixColor(0xffffff, color, 0.4 + 0.6 * dt), 'add');
    }
  }
}
