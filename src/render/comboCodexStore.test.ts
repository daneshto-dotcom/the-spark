import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadDiscoveredCombos,
  mergeDiscoveredCombos,
  magicComboCatalog,
  parseComboKey,
} from './comboCodexStore.ts';
import { MAGIC_COMBO_KEYS, comboKey, type ComboKey } from '../combos.ts';
import { SparkType } from '../constants.ts';

const STORAGE_KEY = 'spark:combos:discovered:v1';

// vitest runs in the node env here (no jsdom) → inject a minimal localStorage.
function installMockStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  } as Storage;
  return store;
}

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

describe('comboCodexStore — cross-match persistence', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installMockStorage(); });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('loads empty when nothing is stored', () => {
    expect(loadDiscoveredCombos().size).toBe(0);
  });

  it('merge persists new keys (sorted) and is idempotent on the rising edge', () => {
    const k0 = MAGIC_COMBO_KEYS[0];
    const k1 = MAGIC_COMBO_KEYS[1];
    expect(mergeDiscoveredCombos([k0])).toBe(true);
    expect(loadDiscoveredCombos().has(k0)).toBe(true);
    expect(mergeDiscoveredCombos([k0])).toBe(false); // nothing new → no write
    expect(mergeDiscoveredCombos([k0, k1])).toBe(true); // union grows
    const set = loadDiscoveredCombos();
    expect(set.has(k0)).toBe(true);
    expect(set.has(k1)).toBe(true);
    const stored = JSON.parse(store.get(STORAGE_KEY)!) as string[];
    expect(stored).toEqual([...stored].sort()); // byte-stable sorted storage
  });

  it('drops non-magic / garbage keys on load and never persists them', () => {
    store.set(STORAGE_KEY, JSON.stringify([MAGIC_COMBO_KEYS[0], 'not-a-key', '99->99', 42]));
    const set = loadDiscoveredCombos();
    expect(set.has(MAGIC_COMBO_KEYS[0])).toBe(true);
    expect(set.size).toBe(1); // the 3 garbage entries are filtered out
    expect(mergeDiscoveredCombos([comboKey(SparkType.Spiral, SparkType.Spiral)])).toBe(false); // placeholder ≠ magic
  });

  it('survives corrupt JSON / non-array storage', () => {
    store.set(STORAGE_KEY, '{not json');
    expect(loadDiscoveredCombos().size).toBe(0);
    store.set(STORAGE_KEY, JSON.stringify({ foo: 1 }));
    expect(loadDiscoveredCombos().size).toBe(0);
  });

  it('tolerates absent localStorage (private mode) without throwing', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => loadDiscoveredCombos()).not.toThrow();
    expect(loadDiscoveredCombos().size).toBe(0);
    expect(() => mergeDiscoveredCombos([MAGIC_COMBO_KEYS[0] as ComboKey])).not.toThrow();
  });
});
