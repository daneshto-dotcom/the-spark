/**
 * SPARK — the Magic-14 catalog the Codex's COMBOS tab renders.
 *
 * ⭐ S174 (b) — THE 'cross-match persistence' SUITE THAT STOOD BELOW THIS ONE IS DELETED, with the
 * store it exercised. Owner: *"We need to REMOVE the discoverable part where you actually need to
 * use them before you discover them in the codex."* Five tests covering load/merge/garbage-filter/
 * corrupt-JSON/absent-localStorage went with `loadDiscoveredCombos` + `mergeDiscoveredCombos`, and
 * so did the `installMockStorage` helper they needed — there is no localStorage read left in this
 * module to mock. The CATALOG half is untouched and is what remains here.
 */

import { describe, it, expect } from 'vitest';
import { magicComboCatalog, parseComboKey } from './comboCodexStore.ts';
import { MAGIC_COMBO_KEYS, comboKey } from '../combos.ts';
import { SparkType } from '../constants.ts';

describe('comboCodexStore — Magic-14 catalog', () => {
  it('is exactly the Magic-14, in MAGIC_COMBO_KEYS order, all magical with a named silhouette', () => {
    const cat = magicComboCatalog();
    expect(cat).toHaveLength(MAGIC_COMBO_KEYS.length);
    expect(cat.map((e) => e.key)).toEqual([...MAGIC_COMBO_KEYS]);
    for (const e of cat) {
      expect(e.outcome.isMagical).toBe(true);
      expect(e.outcome.visualEffectId).not.toBe('fx.bond.default'); // every tile gets a real silhouette
      expect(comboKey(e.a, e.b)).toBe(e.key); // parse round-trips to the original key
    }
  });

  it('parseComboKey decodes the numeric SparkType halves (order-dependent)', () => {
    expect(parseComboKey(comboKey(SparkType.Dot, SparkType.Square))).toEqual([SparkType.Dot, SparkType.Square]);
    expect(parseComboKey(comboKey(SparkType.Circle, SparkType.Triangle))).toEqual([SparkType.Circle, SparkType.Triangle]);
  });
});
