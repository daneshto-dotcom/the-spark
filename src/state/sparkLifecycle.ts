/**
 * SPARK — pure-helper extractions of world.ts dispatch case bodies.
 *
 * S20 P1 (Standard, anti-bloat §XV, Council R1 + PRIME-AUDIT delta): five
 * inline case-bodies in world.ts (SPAWN_SPARK, DESPAWN_SPARK, PICKUP_SPARK,
 * DROP_SPARK, TICK_ENERGY) lifted to pure helpers returning World. WIN_TRIGGER
 * (3 LOC scalar mutation) stays inline per Council R1 Grok#2 + Gemini#4
 * (cohesion-mismatch — gameState transition, not spark lifecycle).
 *
 * S42 (Full, Council R1+R2): turn-based hotseat gating REMOVED — game is
 * now real-time per SPARK_Blueprint.md:3,36-56. applyPickupSpark's
 * "spark.state not Free" path was a throw (S20 invariant); under real-time
 * it's a legitimate race outcome (P1 picked up before P2's intent arrived)
 * so changed to silent-return + world.diagnostics.raceRejects++ counter
 * (Battle Ledger row 1 CONVERGENT). The "spark missing" path remains a
 * throw — that's a true invariant violation (caller bug or wire corruption).
 */

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

/** Player picks up a free spark. Throws on spark missing (true invariant
 *  violation). On spark-not-Free (real-time race: another player grabbed it
 *  first), silently returns + increments world.diagnostics.raceRejects so
 *  the race is observable in tests without crashing the dispatch loop.
 *  S42 Battle Ledger row 1 — Council R1 CONVERGENT (Grok-C1 + Gemini-#1).
 *
 *  S45 BUG-CRITICAL-3 Sym A — for REMOTE carriers (1v1 mode + carrier !=
 *  world.localPlayerId), snap spark.pos to the carrier's avatarPos at pickup
 *  time. This captures the joiner's cursor-intent on the host's authoritative
 *  side; without it, the joiner's same-tick PICKUP_SPARK + PLACE_PRIMITIVE
 *  pair lands the primitive at host's stale spark.pos (spawner pulse value)
 *  instead of where the joiner clicked. Continues to track via
 *  applyUpdateAvatarPos's carrying-sync at the 10Hz throttled dispatch rate.
 *
 *  For LOCAL carriers (solo, or host's own pickups in 1v1), the snap is
 *  skipped because controls.applyPerSubstep already snaps spark.pos to
 *  controls.cursor each substep — and the LMB-up dispatches PICKUP then
 *  PLACE atomically in the same tick, so the snap-to-avatarPos here would
 *  clobber the local cursor-based position with a 100ms-stale avatarPos
 *  value, breaking the single-action-place UX. Gated on remote-carrier so
 *  pre-S45 single-player + host-mode behavior is byte-identical.
 *
 *  Council R2 C1 + PRIME-AUDIT Δ4 expansion. */
export function applyPickupSpark(world: World, action: PickupSparkAction): World {
  const player = requirePlayer(world, action.playerId);
  const spark = world.freeSparks.get(action.sparkId);
  if (spark === undefined) throw new Error(`spark ${action.sparkId} not free`);
  if (spark.state.kind !== 'Free') {
    world.diagnostics.raceRejects++;
    return world;
  }
  const next = fsmPickup(player, action.sparkId);
  world.players.set(next.id, next);
  spark.state = { kind: 'Carried', carrierId: action.playerId };
  // S45 Sym A — snap only for remote carriers; local carriers preserve
  // pre-S45 snap-prevPos-to-pos behavior (kills velocity, leaves pos alone).
  const isRemoteCarrier =
    world.gameMode === '1v1' && action.playerId !== world.localPlayerId;
  if (isRemoteCarrier) {
    spark.pos.x = next.avatarPos.x;
    spark.pos.y = next.avatarPos.y;
    spark.prevPos.x = next.avatarPos.x;
    spark.prevPos.y = next.avatarPos.y;
  } else {
    spark.prevPos.x = spark.pos.x;
    spark.prevPos.y = spark.pos.y;
  }
  return world;
}

/** Player drops the carried spark at a position. Throws CarryViolation if
 *  player isn't Carrying (player owns their own carry slot — not a race).
 *  Pre-pos snap to drop position kills any inherited carry-frame velocity.
 *  S42 — turn-based gating removed. */
export function applyDropSpark(world: World, action: DropSparkAction): World {
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
