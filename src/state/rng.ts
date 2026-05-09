/**
 * SPARK — seeded PRNG (mulberry32).
 * § 10.5 LOCKED — required for deterministic replay (Phase 3 prerequisite).
 * Game tick + seeded RNG → reproducible spawner / collision sequences.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngRange = (rng: Rng, min: number, max: number): number =>
  min + (max - min) * rng();

export const rngInt = (rng: Rng, minInclusive: number, maxExclusive: number): number =>
  Math.floor(minInclusive + (maxExclusive - minInclusive) * rng());

export const rngPick = <T>(rng: Rng, arr: readonly T[]): T => arr[rngInt(rng, 0, arr.length)];
