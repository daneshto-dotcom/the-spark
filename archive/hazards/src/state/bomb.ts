/**
 * SPARK — S71 P1 bomb hazard entity (pure type, leaf module).
 *
 * Mirrors the `creatures/creature.ts` pattern: `worldTypes.ts` imports `Bomb`
 * from here so there is NO `worldTypes.ts` <-> `bombLifecycle.ts` cycle
 * (worldTypes -> leaf domain types only; bombLifecycle -> worldTypes + this).
 *
 * The bomb is a STATIONARY, host-authoritative spawn-zone hazard — NOT a 7th
 * SparkType (the 6 SparkTypes are LOCKED §IV "no variants"). Grabbing it is an
 * INSTANT self-detonation (no carry state) — see `bombLifecycle.applyTriggerBomb`.
 * Replicated to clients via the additive-optional `bombs[]` field in NetSnapshot
 * (snapshot field needs no version bump — creature/effect precedent; the new
 * TRIGGER_BOMB *intent* is what drives the v4->5 PROTOCOL_VERSION bump).
 */

import type { BombId, Vec2 } from '../types.ts';

export interface Bomb {
  readonly id: BombId;
  /** Stationary spawn-zone position (host-authoritative; not moved in v1). */
  readonly pos: Vec2;
  /** Visual + pick radius (a distinct, dark pulsing orb — "misclickable" in a rush). */
  readonly radius: number;
  readonly spawnedAtTick: number;
  /**
   * Tick at which an un-grabbed bomb harmlessly dissipates
   * (spawnedAtTick + BOMB_TTL_TICKS). Polled host-only in main.ts.
   */
  readonly dissipateAtTick: number;
}
