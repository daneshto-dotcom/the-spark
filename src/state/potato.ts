/**
 * SPARK — S72 P3 potato-bomb entity (pure type, leaf module).
 *
 * Mirrors the `bomb.ts` / `hunters/hunter.ts` pattern: `worldTypes.ts` imports
 * `Potato` from here so there is NO worldTypes <-> potatoLifecycle cycle
 * (worldTypes -> leaf domain types only).
 *
 * The potato is a SEPARATE host-authoritative entity (Council Fork D UNANIMOUS:
 * its own world.potatoes Map, NOT the bombs Map — keeps each feature simple). It is
 * CARRYABLE (carry-slot mutually exclusive with a spark) and detonates on a FROM-SPAWN
 * fuse (Fork E, user reading) with a deterministic position-based radial AoE. Replicated
 * to clients via the additive-optional `potatoes[]` NetSnapshot field (no version bump —
 * the S71 v4->5 covers the batch).
 */

import { POTATO_FUSE_TICKS } from '../constants.ts';
import type { PlayerId, PotatoId, Vec2 } from '../types.ts';

/**
 * FREE    — spawned in the zone, un-grabbed (stationary; blast center = pos).
 * CARRIED — held by carrierId; host syncs pos to the carrier's avatar each tick.
 * ARMED   — planted/dropped on the board (stationary; blast center = pos).
 * In ALL states `pos` is the authoritative blast center, so detonation is uniform.
 */
export type PotatoState = 'FREE' | 'CARRIED' | 'ARMED';

export interface Potato {
  readonly id: PotatoId;
  /** Authoritative blast center: spawn pos (FREE), carrier avatar (CARRIED, host-synced), planted pos (ARMED). */
  pos: Vec2;
  /** Forward-compat (a future THROWN potato); v1 never Verlet-integrates the potato. */
  prevPos: Vec2;
  state: PotatoState;
  /** The carrier while CARRIED; null when FREE/ARMED. */
  carrierId: PlayerId | null;
  readonly spawnedAtTick: number;
  /**
   * Tick at which the fuse fires. FORK E (user reading): set FROM SPAWN at
   * construction (spawnedAtTick + POTATO_FUSE_TICKS) and NOT reset on place — a
   * potato held too long cooks off in your hand ("hot potato"). Mutable so the
   * one-line flip to Council's from-PLACEMENT can reassign it in applyPlacePotato.
   */
  detonateAtTick: number;
}

/**
 * Factory for a freshly-spawned FREE potato. prevPos snaps to pos. FORK E: the fuse
 * is armed FROM SPAWN here. To flip to from-PLACEMENT (Council preference), set
 * detonateAtTick = Number.POSITIVE_INFINITY here and assign world.tick +
 * POTATO_FUSE_TICKS inside applyPlacePotato (one-line change, both sites commented).
 */
export function makePotato(args: { id: PotatoId; pos: Vec2; spawnedAtTick: number }): Potato {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    state: 'FREE',
    carrierId: null,
    spawnedAtTick: args.spawnedAtTick,
    detonateAtTick: args.spawnedAtTick + POTATO_FUSE_TICKS, // FORK E: from-SPAWN
  };
}
