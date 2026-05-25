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
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ENERGY_PER_SECOND_FLAT,
  REASONABLE_PICKUP_REACH,
} from '../constants.ts';
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

/**
 * PICKUP_SPARK — pick up a free spark.
 *
 * S46 P2 (BUG-CRITICAL-5 Sym A): `pos` is now MANDATORY (Council C12).
 * Represents the player's cursor at LMB-up — the authoritative claim of
 * "this is where the spark should be at pickup time". Replaces S45's
 * stale-avatarPos snap which broke joiner LMB-place (10Hz throttled
 * avatarPos was often still inside spawner zone at LMB-up time, causing
 * silent PLACE_PRIMITIVE rejection per spec §IX.5).
 *
 * The host treats `pos` as UNTRUSTED INPUT from remote joiners. Host
 * re-validates against canvas bounds + plausibility (within
 * REASONABLE_PICKUP_REACH of joiner's authoritative avatarPos) per
 * Council Δ1. Solo + host-own pickups in 1v1 skip the check (action
 * comes from local trusted controls).
 *
 * Network protocol amendment LOCKED §13.X (S46 P2): IntentMsg payload
 * for PICKUP_SPARK now carries the pos field. BREAKING change vs S45;
 * mid-deploy peers force-disconnect on first action dispatch then
 * Trystero reconnect on next handshake (Δ6 accepted).
 */
export interface PickupSparkAction {
  readonly type: 'PICKUP_SPARK';
  readonly sparkId: SparkId;
  readonly playerId: PlayerId;
  readonly pos: Vec2;
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
 *  S46 P2 (BUG-CRITICAL-5 Sym A, Council R2 C1+C4+C12+Δ1+Δ4 expansion):
 *  PickupSparkAction now carries mandatory `pos` (authoritative cursor at
 *  LMB-up). Replaces S45's avatarPos-snap (stale 10Hz, often inside
 *  spawner-zone at LMB-up causing silent PLACE rejection).
 *
 *  Host re-validates `action.pos` from REMOTE carriers as untrusted input:
 *    - canvas bounds (0 ≤ x ≤ CANVAS_WIDTH, 0 ≤ y ≤ CANVAS_HEIGHT)
 *    - plausibility (within REASONABLE_PICKUP_REACH=250 of joiner's last
 *      authoritative avatarPos — prevents teleport-anywhere exploit)
 *  Solo + host-own pickups in 1v1 are LOCAL/trusted; skip validation.
 *
 *  Snap is now unified for all carriers — spark.pos := action.pos. For
 *  local carriers, action.pos == controls.cursor == spark.pos already
 *  (controls.applyPerSubstep keeps them synced each substep), so the snap
 *  is functionally a no-op; pre-S45 single-action-place UX is byte-
 *  identical. For remote carriers, action.pos is the joiner's intended
 *  cursor position at LMB-up. */
export function applyPickupSpark(world: World, action: PickupSparkAction): World {
  // S46 P2 Δ6 — defensive runtime shape check for wire-level pos. Pre-S46
  // peers omit the field; reject silently rather than crashing on undefined
  // deref. Trystero reconnect handles version mismatch + the in-process TS
  // compiler already enforces shape on local dispatches.
  if (!isPosShape(action.pos)) {
    world.diagnostics.raceRejects++;
    return world;
  }
  const player = requirePlayer(world, action.playerId);
  const spark = world.freeSparks.get(action.sparkId);
  if (spark === undefined) throw new Error(`spark ${action.sparkId} not free`);
  if (spark.state.kind !== 'Free') {
    world.diagnostics.raceRejects++;
    return world;
  }
  // S46 P2 Δ1 — host re-validates remote carrier's untrusted pos input.
  const isRemoteCarrier =
    world.gameMode === '1v1' && action.playerId !== world.localPlayerId;
  if (isRemoteCarrier && !isValidPickupPos(action.pos, player.avatarPos)) {
    world.diagnostics.raceRejects++;
    return world;
  }
  const next = fsmPickup(player, action.sparkId);
  world.players.set(next.id, next);
  spark.state = { kind: 'Carried', carrierId: action.playerId };
  // S46 P2 — unified snap to action.pos (authoritative cursor at LMB-up).
  // Pre-S45 behavior (kill velocity, leave pos) and S45 behavior (snap to
  // avatarPos) both subsumed: action.pos === cursor === spark.pos for
  // local carriers (no-op), and action.pos === joiner-cursor for remote
  // carriers (authoritative claim, validated above).
  spark.pos.x = action.pos.x;
  spark.pos.y = action.pos.y;
  spark.prevPos.x = action.pos.x;
  spark.prevPos.y = action.pos.y;
  return world;
}

/**
 * S46 P2 Δ1 — host-side validator for untrusted PICKUP_SPARK.pos from
 * remote joiners. Returns true if pos passes (a) canvas bounds and (b)
 * plausibility within REASONABLE_PICKUP_REACH of carrier's avatarPos.
 *
 * Solo + host-own pickups don't run this check — action comes from local
 * trusted controls + already-validated cursor mapping (S39 P2 letterbox-
 * aware cssToCanvasCoords).
 */
function isValidPickupPos(pos: Vec2, avatarPos: Vec2): boolean {
  if (pos.x < 0 || pos.x > CANVAS_WIDTH) return false;
  if (pos.y < 0 || pos.y > CANVAS_HEIGHT) return false;
  const dx = pos.x - avatarPos.x;
  const dy = pos.y - avatarPos.y;
  return dx * dx + dy * dy <= REASONABLE_PICKUP_REACH * REASONABLE_PICKUP_REACH;
}

/**
 * S46 P2 Δ6 — runtime shape check for wire-level pos field. Pre-S46
 * clients omit the field, so any TypeScript-bypass via JSON.parse() may
 * pass action.pos as undefined / non-object / NaN. Belt-and-suspenders
 * over the in-process compile-time enforcement.
 */
function isPosShape(pos: unknown): pos is Vec2 {
  if (typeof pos !== 'object' || pos === null) return false;
  const p = pos as { x?: unknown; y?: unknown };
  return typeof p.x === 'number' && Number.isFinite(p.x)
    && typeof p.y === 'number' && Number.isFinite(p.y);
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
