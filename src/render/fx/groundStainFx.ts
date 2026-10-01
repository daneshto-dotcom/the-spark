/**
 * SPARK — S193 `s193/visuals-board` (V24) — **THE GROUND STAIN, NOISE-TEXTURED, IN PLACE OF A FLAT ELLIPSE.**
 *
 * `raceGround.ts` (S185) laid a race mark under every tower as flat, hard-edged ellipses at one
 * colour each. This is the texel function of the soft stain that replaces those BASE fills: mottled
 * by a value-noise fbm, with an irregular soft edge, in the race's own palette (goo, blood, charred
 * violet, banked sand, rippled silt, grainy hardpan). The race MOTIFS drawn over it (bubbles, cracks,
 * droplets, banks, rings, scuffs) are unchanged — `drawRaceGround(…, { skipBase: true })`.
 *
 * ⛔ THE S185 RULES HOLD:
 *   · every texel is in the race's OWN colour (`shade(RACE_COLORS[race], f)`), never near-black;
 *   · the core is OPAQUE (alpha 1) — the layer is faded ONCE (`groundDecalRenderer.ts`, now with an
 *     `AlphaFilter`, so two overlapping zones genuinely "integrate equally" instead of summing);
 *   · the stain stays inside the S185 ellipse (alpha 0 at ρ ≥ 1), so the zone does not grow.
 *
 * ⭐ PURE AND FIXED: `fxHash` lattice noise, no `Math.random`, no clock. The texture is identical on
 * every screen and is baked once per (race, variant) by `groundStainTextures.ts`. Numbers are MINE.
 */

import { RACE_COLORS, type RaceId } from '../../state/races.ts';
import { shade } from '../raceGround.ts';
import { clamp01, fxHash } from './emitter.ts';

/** Variants per race; a structure picks one by id so a row of towers is not stamped. */
export const GROUND_STAIN_VARIANTS = 2;
/** The baked texture size (2:1, the ground ellipse's box). */
export const GROUND_STAIN_TEX_W = 128;
export const GROUND_STAIN_TEX_H = 64;
/** No texel is darker than this fraction of the race colour (the S185 near-black rule). */
export const GROUND_STAIN_MIN_SHADE = 0.2;

const RACE_SALT: Readonly<Record<RaceId, number>> = {
  vampires: 11, nagas: 23, mummies: 37, zombies: 41, orcs: 53, demons: 67,
};

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on an integer lattice, 0..1. PURE. */
export function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const a = fxHash(seed, xi, yi);
  const b = fxHash(seed, xi + 1, yi);
  const c = fxHash(seed, xi, yi + 1);
  const d = fxHash(seed, xi + 1, yi + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Four-octave fbm, 0..1. PURE. */
export function fbm(seed: number, x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(seed + o * 1013, x * f, y * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / 0.9375;
}

export interface StainTexel { readonly color: number; readonly alpha: number }

/**
 * The stain at ellipse-normalised (u, v) ∈ [−1, 1]² for `race` and `variant`. `ρ = |(u, v)|` is 1 on
 * the S185 ellipse's rim. PURE.
 */
export function groundStainTexel(race: RaceId, variant: number, u: number, v: number): StainTexel {
  const seed = RACE_SALT[race] * 7919 + variant * 104729;
  const rho = Math.sqrt(u * u + v * v);
  // An irregular soft edge, pulled inward by up to 0.24 of the radius, never pushed out.
  const edgeN = fbm(seed + 1, u * 2.6 + 9, v * 2.6 + 9);
  const edge = 0.76 + 0.24 * edgeN;
  const alpha = rho >= 1 ? 0 : 1 - smooth(clamp01((rho - (edge - 0.26)) / 0.26));
  const m = fbm(seed + 2, u * 3.2 + 3, v * 3.2 + 3) - 0.5;
  const core = 1 - clamp01(rho);
  let f: number;
  switch (race) {
    case 'zombies': {
      // goo: brighter towards the middle, glossy where the noise runs high
      f = 0.34 + 0.2 * core + 0.24 * m;
      if (fbm(seed + 3, u * 6 + 1, v * 6 + 1) > 0.7) f += 0.22;
      break;
    }
    case 'vampires': {
      // blood: a darker pool with tacky clots and a wet glint at the middle
      f = 0.26 + 0.18 * core * core + 0.16 * m;
      if (fbm(seed + 3, u * 5 + 2, v * 5 + 2) < 0.32) f *= 0.8;
      break;
    }
    case 'demons': {
      // charred ground with violet veins: a ridged noise band is lit
      f = 0.22 + 0.1 * m;
      const ridge = Math.abs(fbm(seed + 3, u * 3 + 4, v * 3 + 4) - 0.5);
      if (ridge < 0.035) f = 0.95 - ridge * 8;
      break;
    }
    case 'mummies': {
      // drifted sand: the noise is stretched along the wind
      f = 0.3 + 0.08 * core + 0.24 * (fbm(seed + 3, u * 1.6 + 6, v * 7 + 6) - 0.5) + 0.08 * m;
      break;
    }
    case 'nagas': {
      // wet silt rippled in rings, the rings wandering with the noise
      const ripple = 0.5 + 0.5 * Math.sin(rho * 20 + m * 5);
      f = 0.24 + 0.1 * ripple + 0.1 * m;
      break;
    }
    case 'orcs': {
      // trampled hardpan: coarse mottling plus a fine grain
      f = 0.27 + 0.16 * m + 0.12 * (valueNoise(seed + 4, u * 22 + 5, v * 22 + 5) - 0.5);
      break;
    }
  }
  const factor = Math.max(GROUND_STAIN_MIN_SHADE, Math.min(1.2, f));
  return { color: shade(RACE_COLORS[race], factor), alpha };
}

/** Which variant a structure uses, and whether it is mirrored. PURE, from its id. */
export function groundStainPick(id: number): { variant: number; flip: boolean } {
  const h = fxHash(0x57a1, id | 0);
  return { variant: Math.floor(h * GROUND_STAIN_VARIANTS) % GROUND_STAIN_VARIANTS, flip: fxHash(0x57a2, id | 0) < 0.5 };
}
