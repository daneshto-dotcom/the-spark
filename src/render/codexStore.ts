/**
 * SPARK — Codex unlock store (localStorage-backed).
 *
 * S87 P4 — EXTRACTED from codexOverlay.ts. `unlockGodly` is called from the
 * always-eager godlyOrchestration (tick loop) whenever a godly fires, which
 * previously dragged the WHOLE heavy CodexOverlay Pixi class (Assets /
 * ColorMatrixFilter / Sprite + ~220 LOC) into the index chunk. Splitting the
 * tiny localStorage helpers out lets main.ts lazy-load the overlay UI on first
 * Codex click (the botSetupOverlay pattern), recovering index-chunk headroom
 * for the quickmatch UI without changing any codex behaviour.
 */

import type { GodlyId } from '../state/godlyRecipes/types.ts';

const STORAGE_KEY = 'spark:codex:unlocked:v1';

export function loadUnlockedSet(): Set<GodlyId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is GodlyId => typeof x === 'string') as GodlyId[]);
  } catch {
    return new Set();
  }
}

function persistUnlockedSet(set: Set<GodlyId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage may be disabled (private mode); silent skip is fine.
  }
}

/** Record a successful godly trigger as an unlock. Idempotent. */
export function unlockGodly(id: GodlyId): void {
  const set = loadUnlockedSet();
  if (set.has(id)) return;
  set.add(id);
  persistUnlockedSet(set);
}
