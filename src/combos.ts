/**
 * SPARK — Combo table.
 * Spec § V.1 LOCKED: order-dependent (A->B != B->A).
 * 12 magical (full polish) + 24 functional placeholders = 36 entries.
 */

import { SparkType, ALL_SPARK_TYPES } from './constants.ts';
import type { StiffnessTier } from './constants.ts';

// Order-dependent key — sorted keys would violate § V.1.
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

// === Magic-12 (LOCKED — see LOCKED_DECISIONS § 6) ===
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

export const COMBO_TABLE: ReadonlyMap<ComboKey, ComboOutcome> = TABLE;

export const MAGIC_12_KEYS: readonly ComboKey[] = MAGICAL.map(
  ([a, b]) => comboKey(a, b),
);
