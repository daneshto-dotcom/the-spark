/**
 * SPARK — Combo Codex model (S97 G3b): cross-match discovered-combo persistence
 * + the Magic-14 catalog the title-screen Combo Codex renders.
 *
 * WHY a separate store: in-match discovery (`world.discoveredCombos`) is CLEARED
 * on START_GAME / RETURN_TO_TITLE (worldTypes.ts), so it is gone by the time the
 * player opens the Codex on the title screen. main.ts therefore merges the
 * in-match set into THIS browser-persisted "discovered ever" set whenever it
 * grows (host + the 1v1 client mirror each persist their own witnessed view —
 * the client mirrors the host's authoritative set via the snapshot). Mirrors the
 * codexStore.ts (godly) pattern: tiny, eager, localStorage-backed; the heavy
 * Pixi overlay (comboCodexOverlay.ts) stays lazy.
 *
 * Pixi-FREE on purpose so the vitest node env (the project default — no
 * jsdom/localStorage) can exercise it with an injected localStorage mock.
 */

import { SparkType } from '../constants.ts';
import { MAGIC_COMBO_KEYS, lookupCombo, type ComboKey, type ComboOutcome } from '../combos.ts';

const STORAGE_KEY = 'spark:combos:discovered:v1';

/** The valid, discoverable key universe — guards persistence against stale/garbage entries. */
const VALID_KEYS: ReadonlySet<ComboKey> = new Set(MAGIC_COMBO_KEYS);

/**
 * Load the persisted "discovered ever" set. Filters to the current Magic-14
 * universe so a removed/renamed combo (or corrupt storage) can never surface a
 * phantom Codex tile. Returns an empty set on any failure (localStorage absent,
 * private mode, malformed JSON).
 */
export function loadDiscoveredCombos(): Set<ComboKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr.filter((x): x is ComboKey => typeof x === 'string' && VALID_KEYS.has(x as ComboKey)),
    );
  } catch {
    return new Set();
  }
}

function persist(set: Set<ComboKey>): void {
  try {
    // Sorted → byte-stable storage (matches the discoveredCombos snapshot convention in save.ts).
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].sort()));
  } catch {
    // localStorage may be disabled (private mode) — silent skip, like codexStore.persistUnlockedSet.
  }
}

/**
 * Union the given combo keys into the persisted set. Only valid Magic-14 keys
 * land (defensive — `world.discoveredCombos` only ever holds magic keys, but a
 * filter keeps storage clean regardless). Idempotent; returns true iff anything
 * new was written (so the caller can skip a redundant localStorage write).
 */
export function mergeDiscoveredCombos(keys: Iterable<ComboKey>): boolean {
  const set = loadDiscoveredCombos();
  let changed = false;
  for (const k of keys) {
    if (VALID_KEYS.has(k) && !set.has(k)) {
      set.add(k);
      changed = true;
    }
  }
  if (changed) persist(set);
  return changed;
}

export interface ComboCatalogEntry {
  readonly key: ComboKey;
  readonly a: SparkType;
  readonly b: SparkType;
  readonly outcome: ComboOutcome;
}

/**
 * Parse an order-dependent ComboKey "a->b" back to its two SparkTypes. The key
 * is built from the NUMERIC SparkType enum (Dot=0 .. Spiral=5) by combos.comboKey,
 * so the halves are numeric strings ("0->3" === Dot->Square).
 */
export function parseComboKey(key: ComboKey): [SparkType, SparkType] {
  const parts = key.split('->');
  return [Number(parts[0]) as SparkType, Number(parts[1]) as SparkType];
}

/**
 * The ordered Magic-14 catalog the Combo Codex renders (preserves
 * MAGIC_COMBO_KEYS / LOCKED_DECISIONS §6 order so the grid reads stably).
 */
export function magicComboCatalog(): ComboCatalogEntry[] {
  return MAGIC_COMBO_KEYS.map((key) => {
    const [a, b] = parseComboKey(key);
    return { key, a, b, outcome: lookupCombo(a, b) };
  });
}
