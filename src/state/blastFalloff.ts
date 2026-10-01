/**
 * SPARK — S193 (owner R193-B4) — **CLOSER TO THE BLAST = MORE DAMAGE. ONE FALLOFF FOR EVERY BLAST.**
 *
 * > *"whoever is closer to him, to the actual blast, gets damaged more. So you need to figure out that
 * > … algorithm. And that's obviously for every blast. It's like that. The closer you are to the blast
 * > side, the more damage you take. That's uh, the poop bag or the stink tower blast. Similarly,
 * > right?"* — owner, S193 (R193-B4)
 *
 * Every area-damage BLAST in production reads its distance rule from this file, and nowhere else
 * (`blastFalloff.census.test.ts` fails on a blast producer that does not). There are two kinds:
 *
 *  1. **A SPLIT POOL** (the zombie boss's death blast, the lightning hub's self-destruct): one total
 *     shared over everything in range. Each target's share is weighted by `blastSplitWeight` — linear in
 *     distance, `max(1, floor(R − d))`, times a per-blast KIND weight — and `splitBlastPool` turns the
 *     weights into integer shares that sum to EXACTLY the pool.
 *  2. **A FULL HIT PER TARGET** (suicide goblin, lightning drone, stink bag throw / burst, stink tower
 *     death blast — everything through `applyRadialDamage`): each target's hit is scaled by
 *     `blastHitAtDistance` — the full ladder number at the centre, falling linearly to
 *     `BLAST_EDGE_FLOOR_PERCENT` of it at the rim, floored at 1 on a real hit.
 *
 * ## Determinism
 *
 * Integers in, integers out. The only non-integer step is `Math.sqrt(d²)`, which IEEE-754 requires to be
 * correctly rounded — the same bits on every peer and in the worker (never `Math.hypot`, whose rounding
 * is implementation-defined). No RNG, no clock, no accumulator. The ORDER the remainder is handed out
 * in is the caller's total order (squared distance, then kind, then id), never `Map` order.
 */

/**
 * ⚠ MINE (R193-B4 rules the direction — "closer = more" — not the magnitude). A full-hit blast deals
 * 100 % at its centre and this percentage at its rim, linearly in between. 50 keeps at least half of
 * every number the owner already ruled (the goblin's 4 ATK, the drone's 5/1, R77's stink numbers) while
 * making the gradient plainly visible. His alternatives: 25 (a steep cone) or 75 (a gentle one).
 * THE ONE LEVER for every full-hit blast.
 */
export const BLAST_EDGE_FLOOR_PERCENT = 50;

/**
 * ⚠ MINE — the per-blast creature:structure weight for a split pool, everywhere it is NOT ruled. The
 * 2:1 is ruled only for the zombie boss (`T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT`, R193-B2); the hub's
 * blast passes this default (1:1) until he says otherwise.
 */
export const BLAST_KIND_WEIGHT_DEFAULT = 1;

/** The distance of a target `d2` (squared) from a blast's centre. Correctly rounded — deterministic. */
function blastDistance(d2: number): number {
  return Math.sqrt(d2);
}

/**
 * ⭐ PURE — a target's weight in a SPLIT-POOL blast of radius `radius`: `kindWeight × max(1, floor(R − d))`.
 * `R` at the centre, `1` at the rim (so a target the blast reaches always counts), linear between.
 */
export function blastSplitWeight(d2: number, radius: number, kindWeight: number = BLAST_KIND_WEIGHT_DEFAULT): number {
  if (!Number.isInteger(kindWeight) || kindWeight < 1) {
    throw new Error(`blastSplitWeight: kindWeight must be a positive INTEGER, got ${kindWeight}.`);
  }
  return kindWeight * Math.max(1, Math.floor(radius - blastDistance(d2)));
}

/**
 * ⭐⭐ PURE — share `pool` fifths over targets whose weights are given IN THE CALLER'S TOTAL ORDER
 * (nearest first). Each takes `floor(pool × w / Σw)`; the leftover fifths go one apiece in that order,
 * so the shares are integers that sum to EXACTLY `pool` (the leftover is always fewer than the
 * targets). A target far out among many may take 0 — a fifth is the ladder's smallest unit.
 */
export function splitBlastPool(pool: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0 || pool <= 0) return weights.map(() => 0);
  let sumW = 0;
  for (const w of weights) sumW += w;
  const out = weights.map((w) => Math.floor((pool * w) / sumW));
  let left = pool;
  for (const s of out) left -= s;
  for (let i = 0; left > 0; i++, left--) out[i % n]! += 1;
  return out;
}

/**
 * ⭐ PURE — the hit a FULL-HIT blast of radius `radius` deals to a target `d2` from its centre, from the
 * `full` ladder number it deals at the centre: linear from 100 % (d = 0) to `BLAST_EDGE_FLOOR_PERCENT`
 * (d = R), floored, and never below 1 when `full` is a real hit. A target past the rim is the caller's
 * to exclude; one passed in anyway is treated as on the rim.
 */
export function blastHitAtDistance(full: number, d2: number, radius: number): number {
  if (full <= 0) return 0;
  if (radius <= 0) return full;
  const d = Math.min(radius, blastDistance(d2));
  const edge = BLAST_EDGE_FLOOR_PERCENT;
  const scaled = Math.floor((full * (edge * radius + (100 - edge) * (radius - d))) / (100 * radius));
  return Math.max(1, Math.min(full, scaled));
}
