/**
 * Per-kind lifetime for visual effects. STRUCTURE_GROW depends on the
 * effect's maxHop — deeper components linger longer so the trailing
 * wave can finish. All other kinds are constant per kind.
 */

import {
  STRUCTURE_FLASH_TICKS,
  STRUCTURE_GROW_HOP_TICKS,
} from '../../constants.ts';
import type { GameEffect } from '../../game/effects.ts';

export const COMMIT_DURATION_TICKS = 24; // 0.4s @ 60Hz
export const ERASE_DURATION_TICKS = 30; // 0.5s @ 60Hz
export const MERGE_LEAD_IN_TICKS = 4;   // delay before union flash begins
export const SCORE_TIER_DURATION_TICKS = 30; // ~500ms corner pulse

export function effectLifetime(effect: GameEffect): number {
  switch (effect.kind) {
    case 'BOND_COMMIT':
      return COMMIT_DURATION_TICKS;
    case 'SEVER_ERASE':
      return ERASE_DURATION_TICKS;
    case 'STRUCTURE_GROW':
      return effect.maxHop * STRUCTURE_GROW_HOP_TICKS + STRUCTURE_FLASH_TICKS;
    case 'STRUCTURE_MERGE':
      return MERGE_LEAD_IN_TICKS + STRUCTURE_FLASH_TICKS;
    case 'SCORE_TIER':
      return SCORE_TIER_DURATION_TICKS;
  }
}
