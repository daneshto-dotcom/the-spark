/**
 * SPARK — Combo table.
 * Spec § V.1 (S98 AMENDED): the 8 one-way magic pairs are now ORDER-SYMMETRIC —
 * both carry orders yield the SAME magic (e.g. Line→Dot is also a Filament). The
 * Triangle↔Circle dual stays order-DEPENDENT by design (Triangle→Circle = Wheel,
 * Circle→Triangle = Star are two intentionally-different magics). The 4 magic
 * self-pairs (Cable/Diamond/Orbital/Lattice) are inherently symmetric.
 * Catalog: 14 distinct magic NAMES; table holds 22 magic ordered entries
 * (14 forward + 8 mirrored reverses) + 14 functional placeholders = 36 entries.
 * See LOCKED_DECISIONS § 6 (S98 order-symmetry amendment).
 */

import { SparkType, ALL_SPARK_TYPES } from './constants.ts';
import type { StiffnessTier } from './constants.ts';

// The key is still built carried→target (a->b); it is NOT canonicalized/sorted
// (so persistence/replay keys are unchanged) — symmetry is achieved by mirroring
// the 8 one-way rows into the TABLE, not by sorting the key. See canonicalComboKey
// for the discovery-dedup canonical form.
export type ComboKey = `${SparkType}->${SparkType}`;

export interface ComboOutcome {
  resultName: string;
  stiffnessTier: StiffnessTier;
  areaMultiplier: number;
  visualEffectId: string;
  isMagical: boolean;
  description: string;
}

export function comboKey(a: SparkType, b: SparkType): ComboKey {
  return `${a}->${b}` as ComboKey;
}

// === Magic-14 (LOCKED — see LOCKED_DECISIONS § 6) ===
const MAGICAL: Array<[SparkType, SparkType, ComboOutcome]> = [
  [SparkType.Dot, SparkType.Line, {
    resultName: 'Filament',
    stiffnessTier: 'HIGH',
    areaMultiplier: 1.5,
    visualEffectId: 'fx.filament',
    isMagical: true,
    description: 'Snap-tight pop with pitch-rising audio',
  }],
  [SparkType.Line, SparkType.Line, {
    resultName: 'Cable',
    stiffnessTier: 'MID',
    areaMultiplier: 1.0,
    visualEffectId: 'fx.cable',
    isMagical: true,
    description: 'Two segments fuse into one fluid axis-aligned line',
  }],
  [SparkType.Line, SparkType.Triangle, {
    resultName: 'Bracket',
    stiffnessTier: 'HIGH',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.bracket',
    isMagical: true,
    description: 'Locks angle; rigidity propagates visibly',
  }],
  [SparkType.Triangle, SparkType.Triangle, {
    resultName: 'Diamond',
    stiffnessTier: 'HIGH',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.diamond',
    isMagical: true,
    description: 'Anti-rotation lattice; glints under stress',
  }],
  [SparkType.Triangle, SparkType.Circle, {
    resultName: 'Wheel',
    stiffnessTier: 'MID',
    areaMultiplier: 3.0,
    visualEffectId: 'fx.wheel',
    isMagical: true,
    description: 'Slow rotation begins; rigid -> organic',
  }],
  [SparkType.Circle, SparkType.Triangle, {
    resultName: 'Star',
    stiffnessTier: 'MID',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.star',
    isMagical: true,
    description: 'Stabilized spin with triangulated arc',
  }],
  [SparkType.Circle, SparkType.Circle, {
    resultName: 'Orbital',
    stiffnessTier: 'LOW',
    areaMultiplier: 3.0,
    visualEffectId: 'fx.orbital',
    isMagical: true,
    description: 'Two bodies linked, breathe outward in rings',
  }],
  [SparkType.Square, SparkType.Square, {
    resultName: 'Lattice',
    stiffnessTier: 'HIGH',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.lattice',
    isMagical: true,
    description: 'Grid tessellation, visibly tiles',
  }],
  [SparkType.Square, SparkType.Circle, {
    resultName: 'Capsule',
    stiffnessTier: 'MID',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.capsule',
    isMagical: true,
    description: 'Hard corners learn to roll, leave glow trails',
  }],
  [SparkType.Dot, SparkType.Spiral, {
    resultName: 'Vortex',
    stiffnessTier: 'HIGH',
    areaMultiplier: 2.0,
    visualEffectId: 'fx.vortex',
    isMagical: true,
    description: 'Pulls nearby free sparks toward it (anchor pull)',
  }],
  [SparkType.Spiral, SparkType.Line, {
    resultName: 'Whip',
    stiffnessTier: 'LOW',
    areaMultiplier: 1.5,
    visualEffectId: 'fx.whip',
    isMagical: true,
    description: 'Line writhes/twists; chaos modifier propagates',
  }],
  [SparkType.Triangle, SparkType.Spiral, {
    resultName: 'Warped Anchor',
    stiffnessTier: 'LOW',
    areaMultiplier: 3.0,
    visualEffectId: 'fx.warped',
    isMagical: true,
    description: 'Rigid base becomes warped; dramatic transformation',
  }],
  // S91 P1 (G2-PROMO) — Dot→Square + Line→Circle promoted from functional placeholders to named
  // magic combos (the two pairs the user called out as "the whole point" of a geometric builder).
  // Phase 1 (S91) shipped visual silhouette + discovery toast + the magic income premium ONLY. S98
  // then made these two pairs ORDER-SYMMETRIC like the other one-way magic combos (the mirror loop
  // below covers them — Square→Dot / Circle→Line now resolve to the SAME Anchor/Spindle outcome, NOT
  // placeholders; the S91-era "forward keys only" note is superseded). S115 (G2-PROMO Phase-2) gave
  // them BEHAVIORS keyed off resultName so BOTH orders earn them: P1 Anchor resists the S49
  // territorial sag (state/anchorStabilize.ts); P2 Spindle imparts a bounded tangential swirl. MID/
  // 1.0× still keeps their bond DISTANCE-constraint physics identical to the placeholder tier (the
  // Anchor effect is a per-tick stiffnessMultiplier floor, not a rest-length change).
  // See LOCKED_DECISIONS § 6 (Magic-14 seed) + the S91 win-score rebalance + the S98 symmetry amendment.
  [SparkType.Dot, SparkType.Square, {
    resultName: 'Anchor',
    stiffnessTier: 'MID',
    areaMultiplier: 1.0,
    visualEffectId: 'fx.anchor',
    isMagical: true,
    description: 'A dot plants into a square footing — a grounded, anchored joint',
  }],
  [SparkType.Line, SparkType.Circle, {
    resultName: 'Spindle',
    stiffnessTier: 'MID',
    areaMultiplier: 1.0,
    visualEffectId: 'fx.spindle',
    isMagical: true,
    description: 'A line winds onto the circle — a spun spindle of stored motion',
  }],
];

const FUNCTIONAL_DEFAULTS = {
  stiffnessTier: 'MID' as StiffnessTier,
  areaMultiplier: 1.0,
  visualEffectId: 'fx.bond.default',
  isMagical: false,
};

const TABLE = new Map<ComboKey, ComboOutcome>();

for (const [a, b, outcome] of MAGICAL) {
  TABLE.set(comboKey(a, b), outcome);
}

// S98 P2 — ORDER-SYMMETRY (Option B, user-approved): mirror the 8 one-way magic
// pairs so both carry orders resolve to the SAME magic outcome (the user's "make
// connecting two shapes feel consistent" fix). We reuse the forward row's EXACT
// outcome object, so the reverse is byte-identical (same resultName/tier/
// areaMultiplier/visualEffectId/isMagical) — i.e. genuinely "the same magic".
//   - Self-pairs (a===b: Cable/Diamond/Orbital/Lattice) are already symmetric → skip.
//   - Triangle↔Circle (Wheel/Star) is an INTENTIONAL directional dual → keep one-way
//     (both directions are already explicit, different rows in MAGICAL).
// This leaves MAGICAL / MAGIC_COMBO_KEYS / the Codex catalog at the 14 forward
// keys (the reverses live only in TABLE), so the "N/14" HUD stays /14.
const DIRECTIONAL_DUAL: ReadonlySet<ComboKey> = new Set<ComboKey>([
  comboKey(SparkType.Triangle, SparkType.Circle), // Wheel
  comboKey(SparkType.Circle, SparkType.Triangle), // Star
]);
for (const [a, b, outcome] of MAGICAL) {
  if (a === b) continue; // self-pair already symmetric
  if (DIRECTIONAL_DUAL.has(comboKey(a, b))) continue; // keep Wheel/Star directional
  const reverse = comboKey(b, a);
  if (!TABLE.has(reverse)) TABLE.set(reverse, outcome); // mirror, reusing the same outcome
}

for (const a of ALL_SPARK_TYPES) {
  for (const b of ALL_SPARK_TYPES) {
    const key = comboKey(a, b);
    if (!TABLE.has(key)) {
      TABLE.set(key, {
        resultName: `Bond_${a}_${b}`,
        ...FUNCTIONAL_DEFAULTS,
        description: 'Functional placeholder — generic bond',
      });
    }
  }
}

if (TABLE.size !== 36) {
  throw new Error(`Combo table size invariant: expected 36, got ${TABLE.size}`);
}

export function lookupCombo(a: SparkType, b: SparkType): ComboOutcome {
  const outcome = TABLE.get(comboKey(a, b));
  if (!outcome) {
    throw new Error(`Combo lookup failed for ${a}->${b}`);
  }
  return outcome;
}

export function isMagical(a: SparkType, b: SparkType): boolean {
  return lookupCombo(a, b).isMagical;
}

/**
 * S89 P6 (G1b) — is the A→B bond the Vortex combo (Dot↔Spiral)? Table-coupled (keys off the
 * combo's resultName, so it follows the table if the Vortex pairing is ever retuned). S98:
 * Dot↔Spiral is now order-SYMMETRIC, so BOTH Dot→Spiral and Spiral→Dot are Vortices and pull
 * (consistent with "same magic both orders"). Lets the Vortex-pull behavior identify its anchors
 * without importing the table internals.
 */
export function isVortexCombo(a: SparkType, b: SparkType): boolean {
  return lookupCombo(a, b).resultName === 'Vortex';
}

/**
 * S90 P1 (G1b ECONOMY) — is the A→B bond a Filament (Dot↔Line)? Table-coupled. S98: Dot↔Line is
 * now order-SYMMETRIC, so BOTH Dot→Line and Line→Dot are Filaments and earn the trickle. A
 * Filament earns an EXTRA income trickle on top of its magic-bond complexity (see
 * scoring.computeComplexity + FILAMENT_INCOME_COMPLEXITY).
 */
export function isFilamentCombo(a: SparkType, b: SparkType): boolean {
  return lookupCombo(a, b).resultName === 'Filament';
}

/**
 * S90 P2 (G1b DEFENSE) — is the A→B bond a Diamond (Triangle→Triangle) or Lattice (Square→Square)?
 * Both are SELF-PAIRED (a===b types), so this is order-symmetric (unlike Vortex/Filament). A
 * defensive bond costs an attacking player DEFENSIVE_SEVER_CHARGE_COST charges to HOSTILE-sever
 * (see disruptionManager) — it resists enemy sabotage, NOT environmental hazards (physics /
 * creature / bomb sever still bypass, by design).
 */
export function isDefensiveCombo(a: SparkType, b: SparkType): boolean {
  const name = lookupCombo(a, b).resultName;
  return name === 'Diamond' || name === 'Lattice';
}

/**
 * S115 P1 (G2-PROMO Phase-2) — is the A→B bond the Anchor (Dot↔Square)? Table-coupled (keys off
 * resultName). S98 ORDER-SYMMETRIC: both Dot→Square and Square→Dot resolve to the Anchor outcome
 * (the mirror loop above), so — like Vortex/Filament — BOTH orders earn the behavior, not just the
 * income. An Anchor bond resists the S49 territorial engulf-sag (state/anchorStabilize.ts) —
 * realizing its "a grounded, anchored joint" table description as a "planted joint" that stays rigid
 * in enemy territory where a normal bond's effective stiffness sags toward ~0.06.
 */
export function isAnchorCombo(a: SparkType, b: SparkType): boolean {
  return lookupCombo(a, b).resultName === 'Anchor';
}

export const COMBO_TABLE: ReadonlyMap<ComboKey, ComboOutcome> = TABLE;

export const MAGIC_COMBO_KEYS: readonly ComboKey[] = MAGICAL.map(
  ([a, b]) => comboKey(a, b),
);

const MAGIC_KEY_SET: ReadonlySet<ComboKey> = new Set(MAGIC_COMBO_KEYS);

/**
 * S98 P2 — the CANONICAL discovery key for a magic bond, independent of carry order.
 * Used by combo-discovery so a magic discovered in either order unlocks the SAME
 * Codex tile and is counted ONCE (keeps "Combos N/14" unordered at /14):
 *   - if the forward key (a→b) is a catalogued magic → use it (also handles the
 *     Triangle↔Circle dual, where BOTH directions are catalogued → Wheel and Star
 *     stay distinct canonical keys);
 *   - else if the reverse key (b→a) is catalogued (the mirrored one-way pairs) →
 *     use the forward/catalogued reverse;
 *   - else (non-magic / not catalogued) → the forward key (never used: callers
 *     gate on isMagical first).
 */
export function canonicalComboKey(a: SparkType, b: SparkType): ComboKey {
  const forward = comboKey(a, b);
  if (MAGIC_KEY_SET.has(forward)) return forward;
  const reverse = comboKey(b, a);
  return MAGIC_KEY_SET.has(reverse) ? reverse : forward;
}

/**
 * S98 P2 — does (a,b) yield the SAME outcome in both carry orders? True for the 8 mirrored
 * one-way magic pairs (and the magic self-pairs); FALSE for the Triangle↔Circle dual (Wheel
 * vs Star). The Codex uses this to show "↔" vs "→" so the player sees that order no longer
 * matters for the symmetric pairs.
 */
export function isOrderSymmetric(a: SparkType, b: SparkType): boolean {
  return lookupCombo(a, b).resultName === lookupCombo(b, a).resultName;
}
