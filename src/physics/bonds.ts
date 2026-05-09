/**
 * SPARK — distance-constraint solver for bonds (position-based dynamics).
 * § 4 LOCKED: stiffness {0.2, 0.5, 0.8}; per-substep correction clamped to
 * 0.5 × rest_length; strain-break ratios {2.0, 1.5, 1.25}.
 *
 * One pass per substep (iterations are folded into the global substep count).
 * Equal mass assumption — each body absorbs half the correction.
 *
 * Session 1 ships with zero bonds — solver runs as a no-op until Session 2
 * begins committing them. Module exists so the solver loop is wired in
 * place and Session 2 only needs to push entries into the bond list.
 */

import {
  POSITION_CORRECTION_CLAMP_RATIO,
  STIFFNESS_BY_TIER,
  STRAIN_BREAK_BY_TIER,
} from '../constants.ts';
import type { StiffnessTier } from '../constants.ts';
import type { BondId, PrimitiveId, Vec2 } from '../types.ts';

export interface PhysicsBody {
  pos: Vec2;
  prevPos: Vec2;
}

export interface Bond {
  readonly id: BondId;
  readonly aId: PrimitiveId;
  readonly bId: PrimitiveId;
  readonly a: PhysicsBody;
  readonly b: PhysicsBody;
  readonly restLength: number;
  readonly stiffnessTier: StiffnessTier;
  readonly createdTick: number;
}

const EPSILON = 1e-6;

/**
 * Solve every bond once. Bonds whose strain exceeds the tier's break ratio
 * are returned for the caller to remove from the structure (severing rule
 * landlords combo behavior in Session 3).
 *
 * Mutates body positions in place.
 */
export function solveBonds(bonds: readonly Bond[]): BondId[] {
  if (bonds.length === 0) return [];
  const broken: BondId[] = [];
  for (let i = 0; i < bonds.length; i++) {
    const bond = bonds[i];
    const dx = bond.b.pos.x - bond.a.pos.x;
    const dy = bond.b.pos.y - bond.a.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < EPSILON) continue;
    const dist = Math.sqrt(distSq);

    if (dist > bond.restLength * STRAIN_BREAK_BY_TIER[bond.stiffnessTier]) {
      broken.push(bond.id);
      continue;
    }

    const error = dist - bond.restLength;
    const stiffness = STIFFNESS_BY_TIER[bond.stiffnessTier];
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
