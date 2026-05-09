/**
 * SPARK — combo table coverage.
 * § V LOCKED: 6 types × 6 ordered = 36 combos. 12 magical, 24 functional
 * (MID/1.0×). Every ordered pair must resolve. Order-dependence (§ V.1)
 * means A→B and B→A may differ.
 */

import { describe, expect, it, test } from 'vitest';
import { ALL_SPARK_TYPES, SparkType } from './constants.ts';
import {
  COMBO_TABLE,
  MAGIC_12_KEYS,
  comboKey,
  isMagical,
  lookupCombo,
} from './combos.ts';

describe('combo table coverage', () => {
  it('contains exactly 36 entries (6×6)', () => {
    expect(COMBO_TABLE.size).toBe(36);
  });

  it('has exactly 12 magical entries', () => {
    expect(MAGIC_12_KEYS.length).toBe(12);
    const magicalCount = [...COMBO_TABLE.values()].filter((c) => c.isMagical).length;
    expect(magicalCount).toBe(12);
  });

  test.each(
    ALL_SPARK_TYPES.flatMap((a) => ALL_SPARK_TYPES.map((b) => [a, b] as const)),
  )('lookupCombo(%i, %i) returns a valid outcome', (a, b) => {
    const out = lookupCombo(a, b);
    expect(out).toBeDefined();
    expect(out.resultName.length).toBeGreaterThan(0);
    expect(['LOW', 'MID', 'HIGH']).toContain(out.stiffnessTier);
    expect(out.areaMultiplier).toBeGreaterThan(0);
    expect(typeof out.isMagical).toBe('boolean');
  });

  it('every ordered pair (a,b) has a unique key', () => {
    const seen = new Set<string>();
    for (const a of ALL_SPARK_TYPES) {
      for (const b of ALL_SPARK_TYPES) {
        const key = comboKey(a, b);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(36);
  });

  it('order-dependence: at least one A→B differs from B→A (§ V.1)', () => {
    let asymmetric = 0;
    for (const a of ALL_SPARK_TYPES) {
      for (const b of ALL_SPARK_TYPES) {
        if (a === b) continue;
        const ab = lookupCombo(a, b);
        const ba = lookupCombo(b, a);
        if (ab.resultName !== ba.resultName) asymmetric++;
      }
    }
    expect(asymmetric).toBeGreaterThan(0);
  });

  it('Magic-12 seed is functionally magical', () => {
    expect(isMagical(SparkType.Dot, SparkType.Line)).toBe(true);     // Filament
    expect(isMagical(SparkType.Triangle, SparkType.Triangle)).toBe(true); // Diamond
    expect(isMagical(SparkType.Spiral, SparkType.Line)).toBe(true);  // Whip
  });

  it('functional placeholders default to MID/1.0×', () => {
    // A combo NOT in the magical list — e.g., Dot→Square
    const out = lookupCombo(SparkType.Dot, SparkType.Square);
    expect(out.isMagical).toBe(false);
    expect(out.stiffnessTier).toBe('MID');
    expect(out.areaMultiplier).toBe(1.0);
  });
});
