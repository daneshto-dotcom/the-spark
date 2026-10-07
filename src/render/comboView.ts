/**
 * SPARK — S196 (joiner-lag, R196-P1) — THE COMBO TABLE, AS THE RENDERERS READ IT: one array slot per pair.
 *
 * `lookupCombo(a, b)` builds the template-string key `${a}->${b}` and hashes it into a Map on EVERY call.
 * The connector walk (`structureRenderer.forEachBondDraw`) calls it once per connector per frame and the
 * keystone telegraph two to three times per connector per frame, so on a 500-connector board a joiner was
 * allocating ~1 500 throwaway strings a frame just to re-read a table that never changes (profile, wave 10:
 * `lookupCombo` + `isAnchorCombo` ~1.5–2.5 % self, plus their share of GC). This memoises the answers per
 * (a, b) in a flat array, filled from `lookupCombo` itself on first use — so it cannot disagree with the
 * table, and every renderer reads the identical outcome object it read before.
 *
 * Render-only and pure: the sim keeps calling `lookupCombo` (src/combos.ts is not this file's to change).
 */
import { isAnchorCombo, isFilamentCombo, lookupCombo, type ComboOutcome } from '../combos.ts';
import type { SparkType } from '../constants.ts';

export interface ComboView {
  readonly outcome: ComboOutcome;
  readonly visualEffectId: string;
  readonly isMagical: boolean;
  readonly isAnchor: boolean;
  readonly isFilament: boolean;
}

/** Slots per axis. SparkType is 0..5 today; 8 leaves room without a resize. */
const STRIDE = 8;
const views: Array<ComboView | undefined> = new Array<ComboView | undefined>(STRIDE * STRIDE);

/** The (a, b) combo as renderers need it. Same answers as `lookupCombo` (and it throws on the same inputs). */
export function comboView(a: SparkType, b: SparkType): ComboView {
  const inRange = a >= 0 && a < STRIDE && b >= 0 && b < STRIDE && (a | 0) === a && (b | 0) === b;
  const i = a * STRIDE + b;
  if (inRange) {
    const hit = views[i];
    if (hit !== undefined) return hit;
  }
  const outcome = lookupCombo(a, b);
  const v: ComboView = {
    outcome,
    visualEffectId: outcome.visualEffectId,
    isMagical: outcome.isMagical,
    isAnchor: isAnchorCombo(a, b),
    isFilament: isFilamentCombo(a, b),
  };
  if (inRange) views[i] = v;
  return v;
}
