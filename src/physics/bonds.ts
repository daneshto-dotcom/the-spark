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
  /**
   * S49 P1 (Sym F) — per-tick territorial engulf-warp multiplier. Set each
   * physics tick by computeTerritorialInfluence() before solveBonds. Resets
   * to 1.0 at the top of each influence pass (ephemeral derived quantity, NOT
   * game state — same pattern as pos/prevPos mutations in verletStepAll).
   * Values < 1.0 produce "sluggish" bond behaviour: reduced position correction
   * makes the structure sag/oscillate inside enemy territory. 0.3 = 70% reduction
   * (effective stiffness MID→0.15, LOW→0.06, HIGH→0.24). Non-readonly because it
   * is intentionally mutated outside the dispatch cycle.
   */
  stiffnessMultiplier?: number;
  /**
   * ⭐ S151 P2 (owner R76) — ACCUMULATED COMBAT DAMAGE ON THIS CONNECTOR, IN FIFTHS.
   *
   * Owner R75: *"towers have attack and piercing but not def and hp because they are based on the
   * connectors that build them. its the connectors that have different hp and def."*
   *
   * A connector's DURABILITY is not stored — it is derived every time from the current connector
   * count of this bond's connected component (`connectorCapacityFifths`, = `count + 4` fifths). Only
   * the damage taken is state. The bond severs when `damageFifths >= capacity`.
   *
   * ⚠ **THIS FIELD REPLACES A COUNTER THAT LIVED ON THE ATTACKER.** Before S151 a connector's
   * toughness was `CREATURE_CONFIGS[type].chewHits` and its progress was the chewer's own
   * `chewProgress` — i.e. the DEFENDER'S durability was defined on the ATTACKER. That is the same
   * inversion owner R72 objected to in the goblin (`PRINCESS_SLAP_DAMAGE = f(GOBLIN_HP)`), and it had
   * two visible consequences: every bond took exactly 5 chews regardless of what it was part of, and
   * two chewers on one bond each had to do the FULL work because neither could see the other's
   * progress. Pooling the damage here fixes both.
   *
   * ⚠ NOT `readonly` — it accumulates. Every other field on a Bond is set once at construction.
   *
   * ⭐ WHY OMITTING THIS ON THE WIRE WHEN ZERO IS SAFE, where omitting `Creature.hp` was NOT.
   * The S150/R71 hazard was that an omitted `hp` made the receiving peer rebuild the value from ITS
   * OWN COMPILED CONSTANT (`VOLTKIN_HP`), which silently turned that constant into shared wire state
   * and forced three protocol bumps. Here the default is the LITERAL 0 — no constant is consulted —
   * and the capacity it is compared against is derived from TOPOLOGY, which is itself fully synced.
   * So there is no local constant either side could disagree about. See `save.ts`.
   */
  damageFifths: number;
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
