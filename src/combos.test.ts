/**
 * SPARK — combo table coverage.
 * § V LOCKED: 6 types × 6 ordered = 36 combos. 14 magical, 22 functional
 * (MID/1.0×). Every ordered pair must resolve. Order-dependence (§ V.1)
 * means A→B and B→A may differ.
 */

import { describe, expect, it, test } from 'vitest';
import { ALL_SPARK_TYPES, SparkType } from './constants.ts';
import {
  COMBO_TABLE,
  MAGIC_COMBO_KEYS,
  comboKey,
  isMagical,
  lookupCombo,
} from './combos.ts';

describe('combo table coverage', () => {
  it('contains exactly 36 entries (6×6)', () => {
    expect(COMBO_TABLE.size).toBe(36);
  });

  it('has 14 distinct magic names; 22 magic ordered entries (8 one-ways mirrored, S98)', () => {
    // The catalog (drives the "N/14" HUD + Codex) stays the 14 forward keys.
    expect(MAGIC_COMBO_KEYS.length).toBe(14);
    const magicOutcomes = [...COMBO_TABLE.values()].filter((c) => c.isMagical);
    // S98 order-symmetry mirrors the 8 one-way pairs (Dot↔Line, Line↔Triangle,
    // Square↔Circle, Dot↔Spiral, Spiral↔Line, Triangle↔Spiral, Dot↔Square,
    // Line↔Circle) → 14 forward + 8 reverse = 22 magic ordered entries. Wheel/Star
    // (directional dual) + the 4 magic self-pairs are NOT mirrored.
    expect(magicOutcomes.length).toBe(22);
    // ...but only 14 DISTINCT magic names (the reverses reuse the forward outcome).
    expect(new Set(magicOutcomes.map((c) => c.resultName)).size).toBe(14);
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

  it('S98 order-symmetry: the 8 one-way pairs are symmetric; Triangle↔Circle stays a directional dual', () => {
    // Each of the 8 mirrored one-way magic pairs now yields the SAME magic in BOTH orders,
    // via the byte-identical outcome object (Option B). This is the protection the old loose
    // "≥1 asymmetric pair" invariant is replaced by — it asserts the exact symmetric set.
    const symmetricPairs: ReadonlyArray<readonly [SparkType, SparkType, string]> = [
      [SparkType.Dot, SparkType.Line, 'Filament'],
      [SparkType.Line, SparkType.Triangle, 'Bracket'],
      [SparkType.Square, SparkType.Circle, 'Capsule'],
      [SparkType.Dot, SparkType.Spiral, 'Vortex'],
      [SparkType.Spiral, SparkType.Line, 'Whip'],
      [SparkType.Triangle, SparkType.Spiral, 'Warped Anchor'],
      [SparkType.Dot, SparkType.Square, 'Anchor'],
      [SparkType.Line, SparkType.Circle, 'Spindle'],
    ];
    for (const [a, b, name] of symmetricPairs) {
      expect(lookupCombo(a, b).resultName).toBe(name);
      expect(lookupCombo(b, a).resultName).toBe(name); // reverse = SAME magic (S98)
      expect(lookupCombo(b, a)).toBe(lookupCombo(a, b)); // byte-identical outcome object
    }
    // Triangle↔Circle remains intentionally asymmetric — the dual the symmetry must NOT collapse.
    expect(lookupCombo(SparkType.Triangle, SparkType.Circle).resultName).toBe('Wheel');
    expect(lookupCombo(SparkType.Circle, SparkType.Triangle).resultName).toBe('Star');
  });

  it('Magic-12 seed is functionally magical', () => {
    expect(isMagical(SparkType.Dot, SparkType.Line)).toBe(true);     // Filament
    expect(isMagical(SparkType.Triangle, SparkType.Triangle)).toBe(true); // Diamond
    expect(isMagical(SparkType.Spiral, SparkType.Line)).toBe(true);  // Whip
  });

  it('functional placeholders default to MID/1.0×', () => {
    // A combo NOT in the magical list — Dot→Dot (Dot→Square is now the Anchor magic combo, S91).
    const out = lookupCombo(SparkType.Dot, SparkType.Dot);
    expect(out.isMagical).toBe(false);
    expect(out.stiffnessTier).toBe('MID');
    expect(out.areaMultiplier).toBe(1.0);
  });

  it('S91 G2-PROMO — Dot↔Square=Anchor and Line↔Circle=Spindle are magic (now order-symmetric, S98)', () => {
    const anchor = lookupCombo(SparkType.Dot, SparkType.Square);
    expect(anchor.isMagical).toBe(true);
    expect(anchor.resultName).toBe('Anchor');
    expect(anchor.visualEffectId).toBe('fx.anchor');
    const spindle = lookupCombo(SparkType.Line, SparkType.Circle);
    expect(spindle.isMagical).toBe(true);
    expect(spindle.resultName).toBe('Spindle');
    expect(spindle.visualEffectId).toBe('fx.spindle');
    // S98 — the reversed pairs now yield the SAME magic (were functional placeholders pre-S98).
    expect(lookupCombo(SparkType.Square, SparkType.Dot).resultName).toBe('Anchor');
    expect(lookupCombo(SparkType.Circle, SparkType.Line).resultName).toBe('Spindle');
  });
});
