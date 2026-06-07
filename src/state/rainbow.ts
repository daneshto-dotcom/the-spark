/**
 * SPARK — S75 P3 rainbow color-shuffle primitive (pure type, leaf module).
 *
 * Mirrors the bomb.ts pattern: a stationary, host-authored spawn-zone entity with a TTL.
 * worldTypes.ts imports `Rainbow` from here so there is NO worldTypes <-> rainbowLifecycle
 * cycle (worldTypes -> leaf domain types only).
 *
 * The rainbow is a SEPARATE host-authoritative entity (its own world.rainbows Map, mirroring
 * bombs/potatoes/hunters). It is NOT carryable: clicking it (TRIGGER_RAINBOW) is an INSTANT
 * host-authoritative global colour-shuffle — every player + their structures are remapped to a
 * new, unique colour (a derangement over the active palette). Un-clicked for RAINBOW_TTL_TICKS
 * -> dissipates harmlessly. Replicated to clients via the additive-optional `rainbows[]`
 * NetSnapshot field; the colour-shuffle RESULT rides the already-serialized player/prim colours.
 */

import { RAINBOW_TTL_TICKS } from '../constants.ts';
import type { RainbowId, Vec2 } from '../types.ts';

export interface Rainbow {
  readonly id: RainbowId;
  /** Spawn-zone position (stationary; the click target). */
  pos: Vec2;
  readonly spawnedAtTick: number;
  /** Tick at which an un-clicked rainbow dissipates harmlessly (spawnedAtTick + RAINBOW_TTL_TICKS). */
  readonly dissipateAtTick: number;
}

/** Factory for a freshly-spawned rainbow. TTL armed from spawn (mirror of the bomb). */
export function makeRainbow(args: { id: RainbowId; pos: Vec2; spawnedAtTick: number }): Rainbow {
  return {
    id: args.id,
    pos: { x: args.pos.x, y: args.pos.y },
    spawnedAtTick: args.spawnedAtTick,
    dissipateAtTick: args.spawnedAtTick + RAINBOW_TTL_TICKS,
  };
}
