/**
 * SPARK — S193 `s193/visuals-combat` (visuals-4, V07) — **LIGHTNING, LIT.**
 *
 * One vocabulary for every bolt in the game: the Voltkin's chain arc and the drone's sever arc
 * (`effects/arcFlash.ts`, the ARC_FLASH effect), the laser turret's beam (`turretRenderer.ts`), the
 * crackle a killed Voltkin or drone bursts into (`creatureRenderer.ts` lightning clouds), and the
 * screen crackle on the Voltkin TV while he climbs out and while it is dying
 * (`voltkinTowerRenderer.ts`).
 *
 * Each bolt is drawn TWICE (S192 plan V07):
 *   · a wide soft GLOW — one stretched `soft` sprite per segment on the additive, bloomed TOP layer,
 *     overlapped so the segments read as one tube of light rather than a string of beads;
 *   · a thin white CORE — a crisp Graphics stroke drawn by the caller over the same polyline (or,
 *     where the caller has no Graphics, `lightningCoreFx`'s thin `core` streaks).
 * Plus a SPARK BURST at each end, and a FLICKER and a RE-STRIKE keyed to the tick: the bolt jumps
 * to a new jagged path every `LIGHTNING_RESTRIKE_TICKS` and its brightness steps every
 * `LIGHTNING_FLICKER_TICKS`, which is what makes it read as electricity instead of a drawn line.
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every seed is built
 * from synced integers (effect tick, creature id, defender id, a chain's first primitive id) and
 * every "now" is a tick, so the host and every joiner draw the same bolt on the same tick.
 *
 * ⚠ Every number in this file is MINE (not ruled), tuned against the S192 pilot look.
 */

import { clamp01, easeOutCubic, fxHash, mixColor, type FxSink } from './emitter.ts';

/** The bolt jumps to a fresh jagged path this often (ticks). */
export const LIGHTNING_RESTRIKE_TICKS = 3;
/** The bolt's brightness steps this often (ticks). */
export const LIGHTNING_FLICKER_TICKS = 2;
/** The dimmest a flicker step can go, as a fraction of full brightness. */
export const LIGHTNING_FLICKER_MIN = 0.55;

/** A polyline, as parallel coordinate arrays (the shape `buildJitteredPolyline` already returns). */
export interface FxPath {
  readonly xs: number[];
  readonly ys: number[];
}

/** Brightness multiplier in [LIGHTNING_FLICKER_MIN, 1], constant across each flicker step. PURE. */
export function lightningFlicker(seed: number, tick: number): number {
  const step = Math.floor(tick / LIGHTNING_FLICKER_TICKS);
  return LIGHTNING_FLICKER_MIN + (1 - LIGHTNING_FLICKER_MIN) * fxHash(seed, step, 0xf11c);
}

/** A seed that holds for one re-strike window, then changes. PURE. */
export function lightningStrikeSeed(seed: number, tick: number): number {
  const strike = Math.floor(tick / LIGHTNING_RESTRIKE_TICKS);
  return (seed ^ Math.imul(strike + 1, 0x27d4eb2d)) | 0;
}

/**
 * A jagged path from (sx, sy) to (ex, ey): `segments` interior vertices displaced perpendicular to
 * the line by up to `amp` px. The ENDPOINTS ARE EXACT (the bolt always lands where the sim struck),
 * and the displacement tapers towards both ends so the bolt leaves and arrives cleanly. PURE.
 */
export function lightningPath(
  seed: number, sx: number, sy: number, ex: number, ey: number, segments: number, amp: number,
): FxPath {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = len > 1e-6 ? -dy / len : 0;
  const py = len > 1e-6 ? dx / len : 0;
  const xs: number[] = [sx];
  const ys: number[] = [sy];
  for (let i = 1; i <= segments; i++) {
    const f = i / (segments + 1);
    const taper = Math.sin(f * Math.PI); // 0 at both ends, 1 in the middle
    const off = (fxHash(seed, i, 0xa7c) * 2 - 1) * amp * (0.35 + 0.65 * taper);
    xs.push(sx + dx * f + px * off);
    ys.push(sy + dy * f + py * off);
  }
  xs.push(ex);
  ys.push(ey);
  return { xs, ys };
}

/**
 * A short side FORK off one interior vertex of `path`, or null when the path has no interior.
 * Two segments, about a third of the bolt's span, leaning off the main line. PURE.
 */
export function lightningFork(seed: number, path: FxPath): FxPath | null {
  const n = path.xs.length;
  if (n < 3) return null;
  const i = 1 + Math.floor(fxHash(seed, 0xf0, 1) * (n - 2));
  const x0 = path.xs[i]!;
  const y0 = path.ys[i]!;
  const dx = path.xs[n - 1]! - path.xs[0]!;
  const dy = path.ys[n - 1]! - path.ys[0]!;
  const span = Math.sqrt(dx * dx + dy * dy);
  if (span < 8) return null;
  const side = fxHash(seed, 0xf0, 2) < 0.5 ? -1 : 1;
  const a = Math.atan2(dy, dx) + side * (0.5 + 0.5 * fxHash(seed, 0xf0, 3));
  const reach = span * (0.22 + 0.14 * fxHash(seed, 0xf0, 4));
  const x2 = x0 + Math.cos(a) * reach;
  const y2 = y0 + Math.sin(a) * reach;
  return lightningPath(seed ^ 0x5f0c, x0, y0, x2, y2, 1, reach * 0.25);
}

/**
 * THE GLOW PASS — one stretched `soft` sprite per segment, additive. Each sprite is longer than its
 * segment (×1.5 plus half the width) so neighbours overlap into one continuous tube.
 */
export function lightningGlowFx(top: FxSink, path: FxPath, width: number, alpha: number, tint: number): void {
  if (alpha <= 0.01) return;
  const { xs, ys } = path;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1]!; const y0 = ys[i - 1]!;
    const x1 = xs[i]!; const y1 = ys[i]!;
    const dx = x1 - x0; const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    top.emit('soft', (x0 + x1) / 2, (y0 + y1) / 2, len * 1.5 + width * 0.5, width, Math.atan2(dy, dx), alpha, tint, 'add');
  }
}

/** THE CORE PASS, for a caller with no Graphics: thin white `core` streaks along the path. */
export function lightningCoreFx(top: FxSink, path: FxPath, width: number, alpha: number): void {
  if (alpha <= 0.01) return;
  const { xs, ys } = path;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1]!; const y0 = ys[i - 1]!;
    const x1 = xs[i]!; const y1 = ys[i]!;
    const dx = x1 - x0; const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) continue;
    top.emit('core', (x0 + x1) / 2, (y0 + y1) / 2, len * 1.25, width, Math.atan2(dy, dx), alpha, 0xffffff, 'add');
  }
}

/**
 * THE ENDPOINT BURST — a white flash that shrinks over the first half of `t`, and `count` sparks
 * thrown outward (decelerating, shrinking, cooling from white to `tint`). `t` is 0..1 over the
 * effect's life; `seed` fixes every spark's angle and reach.
 */
export function lightningSparksFx(
  top: FxSink, x: number, y: number, seed: number, t: number, count: number, reach: number, tint: number,
): void {
  if (t < 0 || t >= 1) return;
  const life = 1 - t;
  if (t < 0.5) {
    const k = 1 - t / 0.5;
    const d = reach * 0.9 * k + 6;
    top.emit('core', x, y, d, d, 0, 0.95 * k, mixColor(0xffffff, tint, 0.15), 'add');
    top.emit('soft', x, y, d * 2.2, d * 2.2, 0, 0.5 * k, tint, 'add');
  }
  const go = easeOutCubic(clamp01(t * 1.6));
  for (let s = 0; s < count; s++) {
    const a = fxHash(seed, s, 0x5a1) * Math.PI * 2;
    const dist = reach * (0.35 + 0.65 * fxHash(seed, s, 0x5a2)) * go;
    const sx = x + Math.cos(a) * dist;
    const sy = y + Math.sin(a) * dist;
    const len = 4 + 9 * life;
    top.emit('soft', sx, sy, len, 2.6, a, 0.95 * life, mixColor(0xffffff, tint, t), 'add');
  }
}

/** How a bolt is coloured and sized. */
export interface BoltStyle {
  /** Outer glow tint and width (px). */
  readonly glow: number;
  readonly glowWidth: number;
  /** Inner glow tint and width (px) — the hot sheath just around the white core. */
  readonly sheath: number;
  readonly sheathWidth: number;
}

/** The Voltkin / drone cyan. */
export const VOLT_STYLE: BoltStyle = { glow: 0x2f9bff, glowWidth: 30, sheath: 0x9ff4ff, sheathWidth: 11 };
/** The laser turret's red. */
export const LASER_STYLE: BoltStyle = { glow: 0xff2a1a, glowWidth: 28, sheath: 0xff8a5a, sheathWidth: 10 };

/** Both glow passes of one bolt (outer glow, then the hot sheath). The caller strokes the core. */
export function boltGlowFx(top: FxSink, path: FxPath, style: BoltStyle, alpha: number, widthMul = 1): void {
  lightningGlowFx(top, path, style.glowWidth * widthMul, 0.5 * alpha, style.glow);
  lightningGlowFx(top, path, style.sheathWidth * widthMul, 0.85 * alpha, style.sheath);
}

/**
 * THE VOLTKIN TV'S SCREEN CRACKLE — `arcs` short bolts that jump between points on a ring of
 * radius `r` around (x, y). Each one re-strikes every `LIGHTNING_RESTRIKE_TICKS` and is lit on
 * roughly three strikes in four, so the screen spits rather than glows. Sprites only (the TV
 * renderer has no Graphics), so the core is `lightningCoreFx`. `intensity` 0..1 scales it all.
 */
export function tvCrackleFx(
  top: FxSink, x: number, y: number, r: number, seed: number, tick: number, intensity: number, arcs = 3,
): void {
  if (intensity <= 0.01) return;
  const strike = Math.floor(tick / LIGHTNING_RESTRIKE_TICKS);
  const flick = lightningFlicker(seed, tick) * intensity;
  for (let k = 0; k < arcs; k++) {
    if (fxHash(seed, strike, 0x7c0 + k) > 0.75) continue; // this arc is dark on this strike
    const s = lightningStrikeSeed(seed ^ Math.imul(k + 1, 0x3c6ef372), tick);
    const a0 = fxHash(s, 1, 0x7c1) * Math.PI * 2;
    const a1 = a0 + (0.6 + 0.8 * fxHash(s, 2, 0x7c1)) * (fxHash(s, 3, 0x7c1) < 0.5 ? -1 : 1);
    const r0 = r * (0.55 + 0.45 * fxHash(s, 4, 0x7c1));
    const r1 = r * (0.55 + 0.45 * fxHash(s, 5, 0x7c1));
    const x0 = x + Math.cos(a0) * r0; const y0 = y + Math.sin(a0) * r0 * 0.8;
    const x1 = x + Math.cos(a1) * r1; const y1 = y + Math.sin(a1) * r1 * 0.8;
    const path = lightningPath(s, x0, y0, x1, y1, 3, r * 0.22);
    boltGlowFx(top, path, VOLT_STYLE, flick, 0.45);
    lightningCoreFx(top, path, 2.4, 0.95 * flick);
    top.emit('core', x1, y1, 9, 9, 0, 0.9 * flick, 0xffffff, 'add');
  }
}

/**
 * One radial bolt of a lightning CLOUD (a killed Voltkin or drone): from the centre out to `reach`
 * at an angle spread evenly around the burst, bending as it goes, re-struck every
 * `LIGHTNING_RESTRIKE_TICKS` of `age`. Three segments, like the S103 scribble it replaces. PURE.
 */
export function lightningCloudBolt(
  id: number, b: number, bolts: number, x: number, y: number, reach: number, age: number,
): FxPath {
  const s = lightningStrikeSeed(Math.imul(id + 1, 0x2545f491) ^ Math.imul(b + 1, 0x9e3779b1), age);
  const base = (b / bolts) * Math.PI * 2 + fxHash(id, b, 0xc1d) * 0.6;
  const xs: number[] = [x];
  const ys: number[] = [y];
  const segs = 3;
  for (let k = 1; k <= segs; k++) {
    const f = k / segs;
    const a = base + (fxHash(s, k, 0xc1e) * 2 - 1) * 0.55 * (1 - f * 0.5);
    xs.push(x + Math.cos(a) * reach * f);
    ys.push(y + Math.sin(a) * reach * f);
  }
  return { xs, ys };
}
