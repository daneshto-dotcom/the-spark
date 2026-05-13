/**
 * SPARK — per-player godly-trigger cooldown helpers (S22 P3 D7).
 *
 * Authoritative state is tick-based (60s @ 60Hz = 3600 ticks) so save/replay
 * stay deterministic across save.ts:netSnapshot() round-trips. UI displays
 * seconds-remaining via wall-clock conversion in the render layer
 * (PRIME-AUDIT Δ4 / Battle Ledger row 4 Solomon split).
 */

import type { Player } from '../game/player.ts';
import { PHYSICS_HZ } from '../constants.ts';

/** Cooldown duration: 60 seconds at PHYSICS_HZ. Locked by S21 D7. */
export const GODLY_COOLDOWN_TICKS = 60 * PHYSICS_HZ;

/**
 * Returns true if `player` is still inside their godly cooldown window.
 * A player with no recorded cooldown (= never triggered) is always off cooldown.
 */
export function isOnCooldown(player: Player, currentTick: number): boolean {
  return player.godlyCooldownEndsAtTick !== null && currentTick < player.godlyCooldownEndsAtTick;
}

/** Set the cooldown to end 60s after `currentTick`. Mutates `player` in place. */
export function setCooldown(player: Player, currentTick: number): void {
  player.godlyCooldownEndsAtTick = currentTick + GODLY_COOLDOWN_TICKS;
}

/**
 * UI helper: returns wall-clock seconds remaining (>= 0). Converts tick delta
 * via PHYSICS_HZ. NOT authoritative — display only.
 */
export function cooldownSecondsRemaining(player: Player, currentTick: number): number {
  if (player.godlyCooldownEndsAtTick === null) return 0;
  const ticksLeft = Math.max(0, player.godlyCooldownEndsAtTick - currentTick);
  return ticksLeft / PHYSICS_HZ;
}
