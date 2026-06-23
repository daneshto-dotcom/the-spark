/**
 * SPARK — NONET winner "jackpot" celebration math (S97 P4). Pure + unit-tested; the Pixi rendering
 * lives in sudokuOverlay.ts (the lazy NONET chunk). Shown ONLY to the solver (ev.solvedBy ===
 * localPlayerId) — losers/timeout see nothing new. All animation is keyed off elapsed ticks since
 * the resolve, so it rides world.tick (which advances during the NONET freeze on the host, and via
 * snapshots on the client) the same way the S95 resolve-flood does.
 *
 * Photosensitivity charter: the full-screen jackpot glow gently breathes (~1 Hz) and is capped well
 * under the 0.30 alpha ceiling (matches FLOOD_PEAK_ALPHA / the rainbow flyover) — the "flashy" feel
 * comes from the small-area fireworks particles, never a high-frequency full-screen strobe.
 */

export const CELEBRATION_DURATION_TICKS = 270; // ~4.5 s @ 60 Hz
export const FW_RISE_TICKS = 28; // rocket rise
export const FW_BURST_TICKS = 56; // burst spread + fade
export const FW_PARTICLES = 20; // particles per burst
export const JACKPOT_GLOW_PEAK_ALPHA = 0.24; // < 0.30 charter cap, gentle ~1 Hz breathe (no strobe)

export interface Firework {
  readonly x: number; // launch/burst x
  readonly burstY: number; // y at which it bursts
  readonly startTick: number; // elapsed-tick offset when it launches (staggered)
  readonly hue: number; // base hue 0..360
}

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly r: number;
  readonly color: number;
}

/** HSL→packed-RGB (h in [0,360), s/l in [0,1]). Pure. */
export function hslToHex(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const to = (v: number): number => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

/**
 * Build `count` staggered fireworks across the screen. `rand` is an injected 0..1 source (Math.random
 * in production — purely cosmetic, winner-local, so no determinism needed; tests pass a seeded source).
 */
export function makeFireworks(count: number, w: number, h: number, rand: () => number): Firework[] {
  const span = Math.max(1, CELEBRATION_DURATION_TICKS - FW_RISE_TICKS - FW_BURST_TICKS);
  const out: Firework[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: w * (0.12 + 0.76 * rand()),
      burstY: h * (0.16 + 0.4 * rand()),
      startTick: Math.floor((span * i) / Math.max(1, count) + rand() * 10),
      hue: Math.floor(rand() * 360),
    });
  }
  return out;
}

/**
 * The drawable particles for ONE firework at `elapsed` ticks since celebration start. Empty before it
 * launches / after it dies. During rise: a single bright rocket dot climbing from the floor to burstY.
 * During burst: FW_PARTICLES on a radial spray with gravity, fading + shrinking out. Pure.
 */
export function fireworkParticles(fw: Firework, elapsed: number, screenH: number): Particle[] {
  const local = elapsed - fw.startTick;
  if (local < 0 || local >= FW_RISE_TICKS + FW_BURST_TICKS) return [];

  if (local < FW_RISE_TICKS) {
    const p = local / FW_RISE_TICKS;
    const y = screenH - (screenH - fw.burstY) * p; // floor → burstY
    return [{ x: fw.x, y, alpha: 0.9, r: 3, color: hslToHex(fw.hue, 0.9, 0.82) }];
  }

  const bt = local - FW_RISE_TICKS; // ticks since burst
  const bp = bt / FW_BURST_TICKS; // 0..1
  const speed = 7.5;
  const grav = 0.13;
  const out: Particle[] = [];
  for (let i = 0; i < FW_PARTICLES; i++) {
    const ang = (i / FW_PARTICLES) * Math.PI * 2;
    const x = fw.x + Math.cos(ang) * speed * bt;
    const y = fw.burstY + Math.sin(ang) * speed * bt + 0.5 * grav * bt * bt;
    out.push({
      x,
      y,
      alpha: Math.max(0, (1 - bp) * 0.95),
      r: 3.6 * (1 - bp * 0.55),
      color: hslToHex((fw.hue + i * 5) % 360, 0.95, 0.66),
    });
  }
  return out;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** "YOU WON / JACKPOT" banner pop-in (overshoot) + hold + tail fade. Pure. */
export function bannerPose(elapsed: number): { alpha: number; scale: number } {
  if (elapsed < 0) return { alpha: 0, scale: 0.5 };
  const popIn = Math.min(1, elapsed / 18);
  const scale = 0.55 + 0.5 * easeOutBack(popIn); // → ~1.05 with a little overshoot
  let alpha = Math.min(1, elapsed / 9);
  const fadeStart = CELEBRATION_DURATION_TICKS - 34;
  if (elapsed > fadeStart) alpha *= Math.max(0, 1 - (elapsed - fadeStart) / 34);
  return { alpha, scale };
}

/** Full-screen jackpot glow: gentle ~1 Hz breathe, capped, with a tail fade. Pure. */
export function jackpotGlowAlpha(elapsed: number): number {
  if (elapsed < 0 || elapsed >= CELEBRATION_DURATION_TICKS) return 0;
  const breathe = 0.55 + 0.45 * Math.sin(elapsed * 0.1); // ~0.95 Hz @ 60 tps — well below strobe range
  let env = Math.min(1, elapsed / 12);
  const fadeStart = CELEBRATION_DURATION_TICKS - 44;
  if (elapsed > fadeStart) env = Math.max(0, 1 - (elapsed - fadeStart) / 44);
  return JACKPOT_GLOW_PEAK_ALPHA * breathe * env;
}

/** Slowly-cycling jackpot glow hue (warm gold band) for the "jackpot lights" feel. Pure. */
export function jackpotGlowColor(elapsed: number): number {
  const hue = 40 + 14 * Math.sin(elapsed * 0.06); // ~amber↔gold sweep
  return hslToHex(hue, 0.85, 0.55);
}
