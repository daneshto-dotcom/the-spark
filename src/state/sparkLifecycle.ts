/**
 * SPARK — pure-helper extractions of world.ts dispatch case bodies.
 *
 * S20 P1 (Standard, anti-bloat §XV, Council R1 + PRIME-AUDIT delta): five
 * inline case-bodies in world.ts (SPAWN_SPARK, DESPAWN_SPARK, PICKUP_SPARK,
 * DROP_SPARK, TICK_ENERGY) lifted to pure helpers returning World. WIN_TRIGGER
 * (3 LOC scalar mutation) stays inline per Council R1 Grok#2 + Gemini#4
 * (cohesion-mismatch — gameState transition, not spark lifecycle).
 *
 * Cohesion: spark registry + player-spark carry FSM + player energy tick all
 * sit at the player-spark interaction layer. SPAWN/DESPAWN manage the free-
 * sparks Map; PICKUP/DROP transition the player FSM between Idle and Carrying
 * while flipping spark.state between Free and Carried; TICK_ENERGY refills
 * the player energy that PLACE_PRIMITIVE consumes (energy gates spark→prim
 * conversion in placePrimitive.ts). They cluster as the player-spark
 * resource-cycle layer.
 *
 * Mirrors the gameMode.ts pattern from S16 P0 — each helper returns the
 * World instance after in-place mutation (consistent with the rest of the
 * reducer's call ergonomics; Council R1 Gemini#1+#2 ADOPT).
 *
 * 1v1 input-sanitization (S15 P2 Gemini R1 BLOCKER) is now centralized in
 * authGate.ts; PICKUP and DROP helpers call requireActivePlayer first.
 * Pre-S20 the gate was inline at world.ts dispatch sites.
 */

import { requireActivePlayer } from './authGate.ts';
import { CarryViolation, drop as fsmDrop, pickup as fsmPickup, tickEnergy } from '../game/player.ts';
import { ENERGY_PER_SECOND_FLAT } from '../constants.ts';
import { requirePlayer, type World } from './world.ts';
import type { PlayerId, SparkId, Vec2 } from '../types.ts';
import type { Spark } from '../game/spark.ts';

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnSparkAction {
  readonly type: 'SPAWN_SPARK';
  readonly spark: Spark;
}

export interface DespawnSparkAction {
  readonly type: 'DESPAWN_SPARK';
  readonly sparkId: SparkId;
}

export interface PickupSparkAction {
  readonly type: 'PICKUP_SPARK';
  readonly sparkId: SparkId;
  readonly playerId: PlayerId;
}

export interface DropSparkAction {
  readonly type: 'DROP_SPARK';
  readonly playerId: PlayerId;
  readonly pos: Vec2;
}

export interface TickEnergyAction {
  readonly type: 'TICK_ENERGY';
  readonly playerId: PlayerId;
  readonly deltaSec: number;
}

/** Insert a spawned spark into the free-sparks map. No-op-safe if id collides
 *  (later spawn overwrites — same as pre-S20 behavior). */
export function applySpawnSpark(world: World, action: SpawnSparkAction): World {
  world.freeSparks.set(action.spark.id, action.spark);
  return world;
}

/** Remove a free spark from the registry. No-op if the id is missing or the
 *  spark is in a non-Free state (e.g. Carried — despawn should not race a
 *  carry). Matches pre-S20 behavior bit-for-bit. */
export function applyDespawnSpark(world: World, action: DespawnSparkAction): World {
  const s = world.freeSparks.get(action.sparkId);
  if (s === undefined) return world;
  if (s.state.kind !== 'Free') return world;
  world.freeSparks.delete(action.sparkId);
  return world;
}

/** Player picks up a free spark. 1v1 wrong-player intent silently rejected
 *  (defense-in-depth). Throws on spark missing or spark not in Free state —
 *  these are invariant violations from the controls/network layer, not user
 *  errors. */
export function applyPickupSpark(world: World, action: PickupSparkAction): World {
  if (!requireActivePlayer(world, action.playerId)) return world;
  const player = requirePlayer(world, action.playerId);
  const spark = world.freeSparks.get(action.sparkId);
  if (spark === undefined) throw new Error(`spark ${action.sparkId} not free`);
  if (spark.state.kind !== 'Free') throw new Error(`spark ${action.sparkId} not Free`);
  const next = fsmPickup(player, action.sparkId);
  world.players.set(next.id, next);
  spark.state = { kind: 'Carried', carrierId: action.playerId };
  spark.prevPos.x = spark.pos.x;
  spark.prevPos.y = spark.pos.y;
  return world;
}

/** Player drops the carried spark at a position. 1v1 wrong-player intent
 *  silently rejected. Throws CarryViolation if player isn't Carrying.
 *  Pre-pos snap to drop position kills any inherited carry-frame velocity. */
export function applyDropSpark(world: World, action: DropSparkAction): World {
  if (!requireActivePlayer(world, action.playerId)) return world;
  const player = requirePlayer(world, action.playerId);
  if (player.kind !== 'Carrying') throw new CarryViolation('not carrying');
  const spark = world.freeSparks.get(player.carriedSparkId);
  if (spark === undefined) throw new Error(`carried spark missing`);
  spark.state = { kind: 'Free' };
  spark.pos.x = action.pos.x;
  spark.pos.y = action.pos.y;
  spark.prevPos.x = action.pos.x;
  spark.prevPos.y = action.pos.y;
  world.players.set(player.id, fsmDrop(player));
  return world;
}

/** Tick player energy by deltaSec at the flat regen rate. The 1v1 gate does
 *  NOT apply here — energy ticks for both players each frame (regen accrues
 *  while inactive); only PLACE_PRIMITIVE / PICKUP gate on active-player. */
export function applyTickEnergy(world: World, action: TickEnergyAction): World {
  const player = requirePlayer(world, action.playerId);
  tickEnergy(player, action.deltaSec, ENERGY_PER_SECOND_FLAT);
  return world;
}
