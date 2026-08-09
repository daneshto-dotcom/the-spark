/**
 * SPARK — V6-1.1 gatherer entity (pure type, leaf module).
 *
 * The "gatherer" is a player-owned hauler unit bought from the placeholder keep for
 * GATHERER_PRICE victory points. Mirrors the creatures/hunters `Map<Id,Entity>` + `nextId`
 * convention; `worldTypes.ts` imports `Gatherer` from here so there is no
 * worldTypes <-> gathererLifecycle cycle (worldTypes -> leaf domain types only).
 *
 * NAMING (owner ruling S134): "gatherer" everywhere in code AND docs. The identifier can
 * NEVER be `Worker` — the Web Worker (workerSim.ts) owns the authoritative World.
 *
 * SCOPE (V6-1.1): the gatherer is a bought, host-authoritative, SERIALIZED world entity that
 * appears at the owner's keep. Its shapeshifting-spark look is RENDERER-ONLY — a pure fn of
 * (tick, gathererId) at render time — and is deliberately NOT a field here: no morph state,
 * no wire cost, cannot desync (owner ruling S134). Roaming/hauling behaviour + the bank are
 * later slots (V6-1.2/1.3); this entity carries only identity, owner, position and birth tick.
 */

import { MAX_PLAYERS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../../constants.ts';
import type { GathererId, PlayerId, Vec2 } from '../../types.ts';

export interface Gatherer {
  readonly id: GathererId;
  /** The owning seat — drives the keep it belongs to and its tint (looks like that player's spark). */
  readonly ownerPlayerId: PlayerId;
  /** Where it sits. Static in V6-1.1 (parked at the keep); mutable for the V6-1.2 roaming FSM. */
  pos: Vec2;
  /** Birth tick (deterministic; reserved for future cadence — no runtime reader in V6-1.1). */
  readonly spawnedAtTick: number;
}

/**
 * Factory for a freshly-bought gatherer. `pos` is copied (never aliased to the caller's Vec2).
 */
export function makeGatherer(args: {
  id: GathererId;
  ownerPlayerId: PlayerId;
  pos: Vec2;
  spawnedAtTick: number;
}): Gatherer {
  return {
    id: args.id,
    ownerPlayerId: args.ownerPlayerId,
    pos: { x: args.pos.x, y: args.pos.y },
    spawnedAtTick: args.spawnedAtTick,
  };
}

/**
 * The fixed per-seat KEEP anchor — a deterministic ring around the central spawner. Seat 0 sits
 * to the LEFT of the spawner, matching the P0 avatar start in `makeWorld`; the remaining seats
 * fan evenly around it. This is the single source of truth for BOTH the (render-only) castle box
 * and a bought gatherer's spawn position, so the unit always appears at its owner's keep. Pure +
 * deterministic — a gatherer's spawn pos is hashed host-authoritative state and must be
 * replay-stable across the host and the worker/mirror.
 */
export function castleAnchor(seat: number): Vec2 {
  const angle = Math.PI + (seat / MAX_PLAYERS) * Math.PI * 2;
  const r = SPAWNER_RADIUS + 150;
  return {
    x: SPAWNER_CENTER_X + Math.cos(angle) * r,
    y: SPAWNER_CENTER_Y + Math.sin(angle) * r,
  };
}
