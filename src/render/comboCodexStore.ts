/**
 * SPARK — Combo Codex model (S97 G3b): the Magic-14 catalog the Codex's COMBOS tab renders.
 *
 * ## ⭐ S174 (b) — THE "DISCOVERED EVER" STORE IS DELETED, AND THAT WAS THE OTHER HALF OF THIS FILE
 *
 * Owner, from the live build: *"all the ones that are hidden, that are undiscovered yet — that's
 * silly, because I've obviously discovered all of them, I play all the games … We need to REMOVE
 * the discoverable part where you actually need to use them before you discover them in the codex.
 * All of it should be visible because now there's a lot. People should be able to see them."*
 *
 * `loadDiscoveredCombos` / `mergeDiscoveredCombos` and the `spark:combos:discovered:v1` key they
 * read and wrote are gone — REMOVED rather than pre-filled, because a store that every reader
 * treats as full is a store with no readers. main.ts's per-frame rising-edge mirror of
 * `world.discoveredCombos` went with them.
 *
 * ⚠ THE SIM'S OWN `world.discoveredCombos` IS UNTOUCHED. It is per-match state (cleared on
 * START_GAME / RETURN_TO_TITLE) that drives the in-play combo toast, and it is not the codex's
 * business. Only the localStorage MIRROR of it is gone.
 *
 * ⚠ S141 — the overlay used to be named here as `comboCodexOverlay.ts`, which was DELETED in
 * S104 P3 when the combo codex was folded into the unified `codexOverlay.ts`. The pointer sent
 * readers to a file that has not existed for thirty-seven sessions.
 *
 * Pixi-FREE on purpose so the vitest node env (the project default) can exercise it directly.
 */

import { SparkType } from '../constants.ts';
import { MAGIC_COMBO_KEYS, lookupCombo, type ComboKey, type ComboOutcome } from '../combos.ts';

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
