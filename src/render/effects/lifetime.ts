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
// S13 P4: 30 → 48 ticks (~800ms) for visibility. Now co-located with the
// placement cursor (was: fixed HUD corner), so the pulse spends a longer
// portion of the player's foveal-attention window.
export const SCORE_TIER_DURATION_TICKS = 48;
// S27 P0 — Voltkin per-attack lightning arc base duration.
// S30 P0c — BUMPED 18 → 24 ticks (~400 ms). S29 P0b fixed overlay-timing so the
// lightning is now actually visible (creature was hidden during pre-S30
// 12-sec cinematic overlay). Bumping from 300→400 ms gives the eye time to
// register the jittered polyline against the play-field clutter (bonds,
// prims, score). Still short enough to feel like a discrete "zap" event.
// Council R1 Q5 UNANIMOUS creature-only: this is THE per-attack feedback
// (audio S28-deferred per Q4), so the visual must be prominent. Renderer
// fades alpha 1.0 → 0.0 linearly across the lifetime.
export const ARC_FLASH_DURATION_TICKS = 24;

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
    case 'ARC_FLASH':
      return ARC_FLASH_DURATION_TICKS;
    case 'BOND_FORMED':
    case 'BOND_SEVERED':
    case 'CREATURE_CHARGE':
      // S18 P1 + S37 P7 — audio-only effects. Filtered out at drain time in
      // effectsRenderer.sync so they never enter the active visual list;
      // this branch exists purely for TS exhaustiveness on the union.
      return 0;
  }
}
