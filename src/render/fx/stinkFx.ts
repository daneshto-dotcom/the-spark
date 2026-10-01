/**
 * SPARK — S193 `s193/visuals-board` (V16) — **THE STINK CLOUD, AS SMOKE, AND THE LOB, AS A CONTRAIL.**
 *
 * The S158 cloud was a flat green disc with a stroke at its true damage radius. ⛔ THAT DISC'S EDGE
 * STAYS — it is the readout (`stinkCloudRenderer.ts`: *"a player who cannot see its EDGE cannot tell
 * whether stepping there costs them a unit"*). This adds the body of the smell over it:
 *   · 12 lumpy smoke puffs that turn slowly about the bag, half one way and half the other, breathing;
 *   · a stream of wisps that rise off the patch and thin out;
 * all normal blend (smoke covers, it does not glow), sickly greens, and every puff kept INSIDE the
 * radius so the drawn edge is still the hazard's edge.
 *
 * The LOB: the bag lands at FIRE entry (`stinkTower.ts` creates the cloud that tick), and the FIRE
 * window is held 12 ticks. So the trail is drawn as what is left in the air after the throw — puffs
 * strung along the S141 arc that dissolve from the tower end first — plus a splash of 6 puffs at the
 * landing point.
 *
 * ⭐ PURE: a function of synced integers (cloud id, `landedAtTick`, defender id, its fire tick) and
 * `world.tick`. Every number is MINE (⚠ owner LOOK item).
 */

import { clamp01, easeOutCubic, envelope, forEachLive, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

export const STINK_FX_PUFFS = 12;
/** Wisps: one born every 8 ticks, each living 96 ticks → 12 live. */
export const STINK_FX_WISP_PERIOD = 8;
export const STINK_FX_WISP_LIFE = 96;
export const STINK_LOB_FX_TRAIL = 7;
export const STINK_LOB_FX_SPLASH = 6;

const GREEN_A = 0x7fa63a; // the haze colour
const GREEN_B = 0x9bbd45;
const GREEN_C = 0x56752a;

/**
 * Where puff `k` of a cloud sits at `tick` (offset from the cloud centre), and its drawn size. PURE.
 * ⛔ `d + 0.42 × size ≤ radius` for every k — the smoke texture's visible body is ~0.84 of its box,
 * so a puff never spills past the true damage edge (pinned in the unit test).
 */
export function stinkPuffAt(seed: number, k: number, age: number, radius: number): { dx: number; dy: number; size: number; rot: number } {
  const dir = k % 2 === 0 ? 1 : -1;
  const speed = (0.004 + 0.004 * fxHash(seed, k, 3)) * dir; // radians a tick: one turn in ~13-26 s
  const a = fxHash(seed, k, 1) * Math.PI * 2 + age * speed;
  const breath = 0.5 + 0.5 * Math.sin(age * 0.03 + fxHash(seed, k, 4) * 6.283);
  const size = radius * (0.72 + 0.2 * fxHash(seed, k, 5) + 0.1 * breath);
  const maxD = Math.max(0, radius - 0.42 * size);
  const d = maxD * (0.2 + 0.8 * fxHash(seed, k, 2));
  // The board is seen at a slant: the patch is an ellipse on the ground, flattened to 0.8.
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, size, rot: a * 0.5 + k };
}

export function stinkCloudFx(sink: FxSink, cloudId: number, landedAtTick: number, tick: number, x: number, y: number, radius: number, fade: number): void {
  if (fade <= 0 || radius <= 0) return;
  const seed = fxSeed(cloudId, 0x571c);
  const age = Math.max(0, tick - landedAtTick);
  // Billow in over the first half-second, so a landing reads as a burst rather than a pop-in.
  const grow = 0.55 + 0.45 * easeOutCubic(age / 30);
  for (let k = 0; k < STINK_FX_PUFFS; k++) {
    const p = stinkPuffAt(seed, k, age, radius);
    const tint = mixColor(k % 3 === 0 ? GREEN_C : GREEN_A, GREEN_B, fxHash(seed, k, 6));
    sink.emit('smoke', x + p.dx * grow, y + p.dy * grow, p.size * grow, p.size * grow * 0.85, p.rot, 0.42 * fade, tint, 'normal');
  }
  // Rising wisps, born inside the inner half of the patch.
  forEachLive(age, STINK_FX_WISP_PERIOD, STINK_FX_WISP_LIFE, 1, cloudId, (b, k, t) => {
    const a = fxHash(seed, b, k + 11) * Math.PI * 2;
    const d = radius * 0.5 * fxHash(seed, b, k + 12);
    const rise = radius * 0.55 * t;
    const sway = Math.sin(t * 5 + fxHash(seed, b, 13) * 6.283) * radius * 0.06;
    const s = radius * (0.22 + 0.25 * t);
    sink.emit('smoke', x + Math.cos(a) * d + sway, y + Math.sin(a) * d * 0.8 - rise, s, s, t * 2, envelope(t, 0.3) * 0.45 * fade, GREEN_B, 'normal');
  });
}

/** A point on the S141 lob arc (the same quadratic `stinkTowerRenderer.drawLob` strokes). PURE. */
export function stinkLobPoint(x0: number, y0: number, x1: number, y1: number, s: number): { x: number; y: number } {
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.35 - 26;
  const u = 1 - s;
  return { x: u * u * x0 + 2 * u * s * mx + s * s * x1, y: u * u * y0 + 2 * u * s * my + s * s * y1 };
}

/**
 * The lob's contrail and splash. `progress` is the 0..1 position in the FIRE hold; `seed` comes from
 * the defender id and its fire tick. Puffs on `shade` (normal blend), the splash glow on `top`.
 */
export function stinkLobFx(top: FxSink, shade: FxSink, seed: number, x0: number, y0: number, x1: number, y1: number, progress: number): void {
  const t = clamp01(progress);
  if (progress < 0 || progress >= 1) return;
  for (let i = 0; i < STINK_LOB_FX_TRAIL; i++) {
    const s = (i + 0.5) / STINK_LOB_FX_TRAIL;
    // The tower end dissolves first: a puff at s lives until t reaches 0.3 + 0.7 s.
    const life = 0.3 + 0.7 * s;
    const a = 1 - t / life;
    if (a <= 0) continue;
    const p = stinkLobPoint(x0, y0, x1, y1, s);
    const size = 10 + 10 * s + 14 * t;
    shade.emit('smoke', p.x, p.y - 6 * t, size, size, fxHash(seed, i, 1) * 6.283, 0.6 * a, mixColor(GREEN_A, GREEN_C, s), 'normal');
  }
  const e = easeOutCubic(t);
  for (let k = 0; k < STINK_LOB_FX_SPLASH; k++) {
    const a = (k / STINK_LOB_FX_SPLASH) * Math.PI * 2 + fxHash(seed, k, 2);
    const d = (8 + 22 * fxHash(seed, k, 3)) * e;
    const size = 14 + 12 * e;
    shade.emit('smoke', x1 + Math.cos(a) * d, y1 + Math.sin(a) * d * 0.6, size, size, a, 0.65 * (1 - t), GREEN_B, 'normal');
  }
  top.emit('soft', x1, y1, 44 * (1 - t) + 16, 30 * (1 - t) + 10, 0, 0.45 * (1 - t), GREEN_B, 'add');
}
