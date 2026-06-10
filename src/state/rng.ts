/**
 * SPARK — seeded PRNG (mulberry32).
 * § 10.5 LOCKED — required for deterministic replay (Phase 3 prerequisite).
 * Game tick + seeded RNG → reproducible spawner / collision sequences.
 */

export type Rng = () => number;

/**
 * S79 P5 — a serializable Rng. mulberry32's entire state is one uint32, so exposing
 * getState/setState makes every stream resumable: capture the word, restore it later,
 * and the sequence continues bit-exactly (save/load + replay can resume mid-stream
 * instead of restarting from the seed). Backward-compatible: a StatefulRng IS an Rng.
 */
export interface StatefulRng extends Rng {
  getState(): number;
  setState(state: number): void;
}

export function mulberry32(seed: number): StatefulRng {
  let t = seed >>> 0;
  const next = (() => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }) as StatefulRng;
  next.getState = () => t;
  next.setState = (state: number) => {
    t = state >>> 0;
  };
  return next;
}

export const rngRange = (rng: Rng, min: number, max: number): number =>
  min + (max - min) * rng();

const rngInt = (rng: Rng, minInclusive: number, maxExclusive: number): number =>
  Math.floor(minInclusive + (maxExclusive - minInclusive) * rng());

export const rngPick = <T>(rng: Rng, arr: readonly T[]): T => arr[rngInt(rng, 0, arr.length)];

/**
 * S33 P1-10 — One-shot deterministic pseudo-random in [-1, 1] from an integer
 * seed (mulberry32-style single-step hash). Replay-safe: same (seed, index)
 * input → same output across all clients. Distinct from the `mulberry32`
 * generator above — `pseudoRand` is stateless and one-shot, while `mulberry32`
 * returns a stateful sequence.
 *
 * The optional `index` parameter differentiates same-seed call sites (e.g.
 * per-vertex jitter for a multi-segment polyline driven by a single base
 * seed). Omitting it (or passing 0) collapses to the seed-only form —
 * algebraically equivalent because `seed ^ 0 === seed` and `0 * K === 0`,
 * so the math reduces to `(seed | 0) >>> 0` start.
 *
 * Consolidated from previously-duplicated copies in
 *   - `src/render/effects/arcFlash.ts` (2-arg form: per-vertex jitter)
 *   - `src/render/screenShake.ts` (1-arg form: per-tick offset)
 * Byte-exact math preserved — guarded by `save.replay.test.ts` (S33 P1-12).
 */
export function pseudoRand(seed: number, index: number = 0): number {
  let x = ((seed | 0) ^ ((index | 0) * 2654435761)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x / 0x80000000) - 1;
}
