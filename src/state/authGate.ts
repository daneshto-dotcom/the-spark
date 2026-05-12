/**
 * SPARK — shared 1v1 active-player auth gate (S20 P1 Council R1 Grok#3+#10
 * + Gemini#3+#9 convergent ADOPT).
 *
 * Before S20 P1 the gate was inlined three times in world.ts dispatch
 * (PICKUP_SPARK, DROP_SPARK, PLACE_PRIMITIVE) — three copies of the same
 * `if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId)
 * return world;` predicate. Council R1 flagged the duplication as a maintainable-
 * single-source-of-truth concern.
 *
 * Semantics (preserved bit-for-bit from the inline implementations):
 *   - In solo mode (`world.gameMode === 'solo'`): always returns true →
 *     action proceeds. There is no inactive player in solo.
 *   - In 1v1 mode: returns true iff the action's playerId matches the
 *     current active player. Inactive-player intents are SILENTLY rejected
 *     (the dispatcher returns the world unchanged — defense-in-depth even
 *     when the controls layer was supposed to guard locally; per Gemini R1
 *     S15 P2 BLOCKER #input-sanitization-on-host).
 *
 * This module is a leaf — it only imports types from world.ts (type-only),
 * so no circular-import risk back into world.ts even if world.ts later
 * imports authGate.ts (which it does, S20 P1).
 */

import type { World } from './world.ts';
import type { PlayerId } from '../types.ts';

/**
 * Returns true when the action should proceed (solo, or 1v1 with the
 * correct active player). Returns false when the action should silently
 * no-op (1v1 wrong-player intent).
 */
export function requireActivePlayer(world: World, playerId: PlayerId): boolean {
  if (world.gameMode === 'solo') return true;
  return playerId === world.currentPlayerId;
}
