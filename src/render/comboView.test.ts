/**
 * S196 (joiner-lag) — `comboView` is the renderers' memo of the combo table. It must answer EXACTLY what
 * `lookupCombo` / `isAnchorCombo` / `isFilamentCombo` / `isMagical` answer, for every pair, every time.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { comboView } from './comboView.ts';
import { isAnchorCombo, isFilamentCombo, isMagical, lookupCombo } from '../combos.ts';
import { ALL_SPARK_TYPES, type SparkType } from '../constants.ts';

describe('S196 — comboView answers what the combo table answers', () => {
  it('every pair, twice (cold then memoised): same outcome object, same flags', () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const a of ALL_SPARK_TYPES) for (const b of ALL_SPARK_TYPES) {
        const v = comboView(a, b);
        expect(v.outcome).toBe(lookupCombo(a, b));
        expect(v.visualEffectId).toBe(lookupCombo(a, b).visualEffectId);
        expect(v.isMagical).toBe(isMagical(a, b));
        expect(v.isAnchor).toBe(isAnchorCombo(a, b));
        expect(v.isFilament).toBe(isFilamentCombo(a, b));
      }
    }
    // the table really has both kinds, so the flags above were not vacuously false
    expect(ALL_SPARK_TYPES.some((a) => ALL_SPARK_TYPES.some((b) => comboView(a, b).isAnchor))).toBe(true);
    expect(ALL_SPARK_TYPES.some((a) => ALL_SPARK_TYPES.some((b) => comboView(a, b).isFilament))).toBe(true);
  });

  it('the memo is real: a second read returns the same view object', () => {
    expect(comboView(0 as SparkType, 1 as SparkType)).toBe(comboView(0 as SparkType, 1 as SparkType));
  });

  it('NEGATIVE: an unknown type throws exactly as lookupCombo does (never a silent default)', () => {
    expect(() => lookupCombo(7 as SparkType, 0 as SparkType)).toThrow();
    expect(() => comboView(7 as SparkType, 0 as SparkType)).toThrow();
    expect(() => comboView(-1 as SparkType, 0 as SparkType)).toThrow();
  });

  it('REACH guard: the per-frame connector and keystone walks read the memo, not the string-keyed table', () => {
    const sr = readFileSync(new URL('./structureRenderer.ts', import.meta.url), 'utf8');
    const kt = readFileSync(new URL('./keystoneTelegraphRenderer.ts', import.meta.url), 'utf8');
    expect(sr).toMatch(/visualEffectId: comboView\(a\.type, b\.type\)\.visualEffectId/);
    expect(sr).not.toMatch(/\blookupCombo\(/);
    expect(kt).not.toMatch(/\b(lookupCombo|isAnchorCombo|isFilamentCombo|isMagical)\(/);
  });
});
