/**
 * SPARK — S192 `s192/visuals` (owner: *"upgrade the effects where we are based on the recommendations"*) —
 * **THE DETERMINISTIC PARTICLE EMITTER. PURE: NO PIXI, NO DOM, NO CLOCK, NO `Math.random`.**
 *
 * ⛔ WHY THE COMMUNITY EMITTERS WERE NOT USED. `@pixi/particle-emitter` (v7-only) and its v8 fork both
 * roll `Math.random()` per particle, so two screens watching the same Vlad siphon would see two
 * different clouds of motes. SPARK's rule for every visual is the sim's rule — the host and every
 * joiner draw the same thing from the same synced numbers (`bossAuras.ts` header: *"a visual that
 * disagrees between two screens is the same class of defect as a divergent sim, just quieter"*).
 *
 * ⭐ SO A PARTICLE HERE IS NOT AN OBJECT THAT LIVES — IT IS A PURE FUNCTION.
 * `(seed, birth tick, index, now tick) → where it is`. Nothing is stored between frames, so:
 *   · a joiner who arrives mid-effect sees exactly the particles the host sees;
 *   · a host migration, a replay or a re-render of the same tick reproduces every mote bit-for-bit;
 *   · there is no pool of particle STATE to leak — only a pool of sprites (`fxLayer.ts`).
 *
 * The seed is always derived from synced integers (entity id, effect tick, rounded position).
 */

/** The textures `softTextures.ts` generates. Every one is white, so `tint` colours it. */
export type FxTex = 'soft' | 'core' | 'ring' | 'smoke' | 'bubble';
/** `add` brightens what is under it (light, fire, magic); `normal` darkens/covers (smoke, stains). */
export type FxBlend = 'add' | 'normal';

/**
 * Where a layout writes. `w`/`h` are the DRAWN size in board px (h ≠ w stretches a mote into a
 * streak, or squashes a ground pool into the board's perspective ellipse); `rot` is radians.
 * One call per sprite, no allocation — the layouts stay zero-garbage at 60 Hz.
 */
export interface FxSink {
  emit(tex: FxTex, x: number, y: number, w: number, h: number, rot: number, alpha: number, tint: number, blend: FxBlend): void;
}

/**
 * A ground-distortion ripple request (`ShockwaveFilter` on HIGH quality; ignored on LOW and in tests).
 * `age` is in ticks since the ripple started; `radius` is its full reach in board px.
 */
export interface FxShockSink {
  shock(x: number, y: number, age: number, radius: number, amplitude: number): void;
}

/**
 * ⭐ S193 `s193/visuals-boss` (V10) — ADDED, the frozen API above is unchanged. A DIRECTIONAL ground
 * ripple (`DisplacementFilter` on HIGH; ignored on LOW, in legacy mode and in tests). Where the
 * shockwave is a full circle, this is a 120°-wide arc of rippling water centred on (x, y), its crest at
 * `radius` board px, facing `rot` radians; `strength` is the peak shove in board px (0 = none).
 */
export interface FxDisplaceSink {
  ripple(x: number, y: number, radius: number, rot: number, strength: number): void;
}

/**
 * Integer hash → [0, 1). `Math.imul` mixing (a 32-bit avalanche in the murmur3 finaliser's shape), so
 * nearby inputs (index 7 vs 8, tick 100 vs 101) land far apart. Deterministic on every JS engine:
 * every step is a 32-bit integer operation.
 */
export function fxHash(seed: number, a: number, b = 0): number {
  let h = (seed | 0) ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A seed from synced integers. `salt` separates two effects on the same entity. */
export function fxSeed(entityId: number, salt: number): number {
  return Math.imul((entityId | 0) + 0x632be5ab, 0x2c1b3c6d) ^ Math.imul(salt | 0, 0x297a2d39);
}

/** A seed for a positioned one-shot (an effect push): its tick and its rounded position. */
export function fxSeedAt(tick: number, x: number, y: number): number {
  return fxSeed(Math.round(x) * 7919 + Math.round(y), tick);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}
export function easeInQuad(t: number): number {
  const c = clamp01(t);
  return c * c;
}
/** 0 → 1 → 0 over a life, peaking at `peak` (0..1). The in/out envelope every mote fades with. */
export function envelope(t: number, peak = 0.25): number {
  const c = clamp01(t);
  if (c <= 0 || c >= 1) return 0;
  return c < peak ? c / peak : (1 - c) / (1 - peak);
}

/** Per-channel blend of two 0xRRGGBB colours. Pure integer output. */
export function mixColor(a: number, b: number, t: number): number {
  const c = clamp01(t);
  const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, c));
  const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, c));
  const bl = Math.round(lerp(a & 0xff, b & 0xff, c));
  return (r << 16) | (g << 8) | bl;
}

/**
 * ⭐ THE STATELESS CONTINUOUS EMITTER. A source that spawns `perBirth` particles every `period` ticks,
 * each living `life` ticks, has — at tick `now` — exactly the particles born on the ticks
 * `b ≡ phase (mod period)` in `(now − life, now]`. This enumerates them, oldest first, with each one's
 * age as a 0..1 fraction. `phase` spreads two sources (two towers) so they do not pulse in step;
 * derive it from an entity id, never from an accumulator.
 *
 * `cb(birthTick, k, t)` — `k` is the particle's index within its birth, `t` its life fraction.
 * The pair (birthTick, k) is the particle's identity: hash it for every random property.
 */
export function forEachLive(
  now: number,
  period: number,
  life: number,
  perBirth: number,
  phase: number,
  cb: (birthTick: number, k: number, t: number) => void,
): void {
  if (period < 1 || life < 1 || perBirth < 1) return;
  const p = Math.floor(period);
  const ph = ((Math.floor(phase) % p) + p) % p;
  // The most recent birth tick ≤ now that is ≡ ph (mod p).
  const newest = now - ((((now - ph) % p) + p) % p);
  for (let b = newest - Math.floor((life - 1) / p) * p; b <= newest; b += p) {
    const age = now - b;
    if (age < 0 || age >= life) continue;
    const t = age / life;
    for (let k = 0; k < perBirth; k++) cb(b, k, t);
  }
}

/** A sink that discards everything — the default when no fx layer is installed. */
export const NULL_SINK: FxSink = { emit() { /* nothing installed */ } };
export const NULL_SHOCK: FxShockSink = { shock() { /* nothing installed */ } };
/** S193 — the no-op directional ripple (nothing installed, LOW, legacy). */
export const NULL_DISPLACE: FxDisplaceSink = { ripple() { /* nothing installed */ } };

/** Test helper shape — a recorded emit, so a test can compare two runs with `toEqual`. */
export interface FxEmitRecord {
  tex: FxTex; x: number; y: number; w: number; h: number; rot: number; alpha: number; tint: number; blend: FxBlend;
}
/** A sink that records every emit. Used by the unit tests; cheap enough to use in a dev probe too. */
export function recordingSink(): FxSink & { out: FxEmitRecord[] } {
  const out: FxEmitRecord[] = [];
  return {
    out,
    emit(tex, x, y, w, h, rot, alpha, tint, blend) { out.push({ tex, x, y, w, h, rot, alpha, tint, blend }); },
  };
}
