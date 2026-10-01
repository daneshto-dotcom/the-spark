/**
 * SPARK — S191 P12 (`s191/perf`) — THE REFERENCE BOND SOLVER. TEST-ONLY. ⛔ Never imported by production
 * code (the `.fixtures.ts` convention).
 *
 * A VERBATIM copy of `solveBonds` (and its `EPSILON`) exactly as it shipped at master 42cc2ee (live
 * deploy #4), before s191/perf hoisted the tier-table lookups. The ONLY edits: `solveBonds` →
 * `referenceSolveBonds`, `EPSILON` → `REFERENCE_EPSILON`. Checked mechanically when written: the body
 * diffs to zero lines against `git show 42cc2ee:src/physics/bonds.ts` bar those two names.
 *
 * `solveBonds.differential.test.ts` and the SOLVER arm of `s191Perf.differential.test.ts` run this
 * beside the real solver from the same positions and assert every endpoint position `Object.is`-equal
 * and the same broken list. ⚠ IF YOU CHANGE SOLVER *BEHAVIOUR*, change THIS FILE FIRST.
 */
import {
  POSITION_CORRECTION_CLAMP_RATIO,
  STIFFNESS_BY_TIER,
  STRAIN_BREAK_BY_TIER,
} from '../constants.ts';
import type { BondId } from '../types.ts';
import type { Bond } from './bonds.ts';

const REFERENCE_EPSILON = 1e-6;

/**
 * Solve every bond once. Bonds whose strain exceeds the tier's break ratio
 * are returned for the caller to remove from the structure (severing rule
 * landlords combo behavior in Session 3).
 *
 * Mutates body positions in place.
 */
export function referenceSolveBonds(bonds: readonly Bond[]): BondId[] {
  if (bonds.length === 0) return [];
  const broken: BondId[] = [];
  for (let i = 0; i < bonds.length; i++) {
    const bond = bonds[i];
    const dx = bond.b.pos.x - bond.a.pos.x;
    const dy = bond.b.pos.y - bond.a.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < REFERENCE_EPSILON) continue;
    const dist = Math.sqrt(distSq);

    if (dist > bond.restLength * STRAIN_BREAK_BY_TIER[bond.stiffnessTier]) {
      broken.push(bond.id);
      continue;
    }

    const error = dist - bond.restLength;
    const stiffness = STIFFNESS_BY_TIER[bond.stiffnessTier] * (bond.stiffnessMultiplier ?? 1.0);
    let correction = (error / dist) * stiffness * 0.5;
    const maxCorrectionMagnitude = POSITION_CORRECTION_CLAMP_RATIO * bond.restLength;
    const moveMagnitude = Math.abs(correction * dist);
    if (moveMagnitude > maxCorrectionMagnitude) {
      correction = (Math.sign(correction) * maxCorrectionMagnitude) / dist;
    }
    const cx = dx * correction;
    const cy = dy * correction;
    bond.a.pos.x += cx;
    bond.a.pos.y += cy;
    bond.b.pos.x -= cx;
    bond.b.pos.y -= cy;
  }
  return broken;
}
