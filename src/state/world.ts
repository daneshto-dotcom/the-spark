/**
 * SPARK — world state + dispatch seam.
 * § 10.2 LOCKED: every world mutation routes through `dispatch(world, action)`.
 * Phase 1 calls it locally; Phase 3 swaps in `await dispatchOverNetwork(action)`
 * with the same call sites. Actions are JSON-serialisable (IDs only, no refs).
 *
 * State is mutated in place — `dispatch` returns the same world object for
 * call-site ergonomics. The seam is the function-call boundary, not
 * structural immutability.
 *
 * S14 P2.0: PLACE_PRIMITIVE handler extracted to src/state/placePrimitive.ts
 * per § XV soft LOC charter.
 *
 * S15 P2 (§ 11 LOCKED amendment): extended gameState FSM with TITLE + LOBBY;
 * added gameMode ('solo' | '1v1'), currentPlayerId, isHost, scoreByPlayer
 * for 1v1 networked play. New actions: START_GAME, END_TURN, RETURN_TO_TITLE.
 * PICKUP_SPARK + PLACE_PRIMITIVE silently reject in 1v1 when action.playerId
 * !== currentPlayerId (Gemini R1 BLOCKER — input sanitization on host;
 * defense-in-depth even when controls layer guards locally).
 *
 * S16 P0: START_GAME / END_TURN / RETURN_TO_TITLE / UPDATE_AVATAR_POS handler
 * bodies + addScore helper extracted to src/state/gameMode.ts (mechanical, zero
 * behavior change; closes S15 § XV PRIME-AUDIT carry-forward). Dispatch
 * switch retains the case labels and delegates to imported pure functions.
 */

import { ENERGY_PER_SECOND_FLAT, PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { type Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import {
  CarryViolation,
  drop as fsmDrop,
  makeIdlePlayer,
  pickup as fsmPickup,
  tickEnergy,
  type Player,
} from '../game/player.ts';
import type { Spark } from '../game/spark.ts';
import type { Bond } from '../physics/bonds.ts';
import {
  asPlayerId,
  type BondId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
  type Vec2,
} from '../types.ts';
import {
  applyEndTurn,
  applyReturnToTitle,
  applyStartGame,
  applyUpdateAvatarPos,
  type EndTurnAction,
  type ReturnToTitleAction,
  type StartGameAction,
  type UpdateAvatarPosAction,
} from './gameMode.ts';
import { placePrimitive, type PlacePrimitiveAction } from './placePrimitive.ts';

// Re-export addScore from gameMode.ts for back-compat with placePrimitive.ts
// and session15.test.ts (S16 P0 extraction preserved external import paths).
export { addScore } from './gameMode.ts';

/**
 * S15 P2: extended FSM. Solo path TITLE→PLAYING→WIN→POSTGAME→TITLE. 1v1
 * path TITLE→LOBBY→PLAYING→WIN→POSTGAME→TITLE. Tests + back-compat: makeWorld
 * still initializes gameState='PLAYING' (test contract) — main.ts boot path
 * overrides to 'TITLE' after construction.
 */
export type GameState = 'TITLE' | 'LOBBY' | 'PLAYING' | 'WIN' | 'POSTGAME';

export type GameMode = 'solo' | '1v1';

export interface World {
  tick: number;
  rngSeed: number;
  freeSparks: Map<SparkId, Spark>;
  primitives: Map<PrimitiveId, Primitive>;
  bonds: Map<BondId, Bond>;
  players: Map<PlayerId, Player>;
  gameState: GameState;
  /** Monotonic counter for primitive IDs. */
  nextPrimitiveId: number;
  /** Monotonic counter for bond IDs. */
  nextBondId: number;
  /** Telemetry / debug — not persisted. */
  lastWinnerId: PlayerId | null;
  effects: GameEffect[];
  /**
   * S9 P3 / S15 P2: combo-weighted progress. In solo, equals the lone
   * player's progress. In 1v1, equals max(scoreByPlayer.values()) — i.e.
   * the leader's score, which drives the WIN check. Per-player scores are
   * tracked in `scoreByPlayer` for 1v1 HUD.
   */
  scoreProgress: number;
  /**
   * S15 P2 — per-player score map. In solo: { 0 → scoreProgress }. In 1v1:
   * both players' scores tracked independently; HUD reads this directly;
   * win = first player to reach PHASE_1_WIN_SCORE.
   */
  scoreByPlayer: Map<PlayerId, number>;
  /**
   * S10 P5: debug toggle for structure cinematics.
   */
  cinematicsEnabled: boolean;
  /**
   * S15 P2 — game mode. Solo (Phase 1 preserved) vs 1v1 (networked). Set
   * by START_GAME action when transitioning from TITLE / LOBBY → PLAYING.
   * makeWorld defaults to 'solo' for test back-compat.
   */
  gameMode: GameMode;
  /**
   * S15 P2 — active player. In solo always 0. In 1v1 flips between 0 and
   * 1 on END_TURN. The reducer's per-action auth gate compares
   * action.playerId === currentPlayerId for PICKUP_SPARK / PLACE_PRIMITIVE.
   */
  currentPlayerId: PlayerId;
  /**
   * S15 P2 — host vs client flag for 1v1. Host runs the authoritative sim;
   * client renders interpolated snapshots and sends Intent envelopes. In
   * solo, isHost is true (the local player IS the authority).
   */
  isHost: boolean;
}

export type GameAction =
  | { readonly type: 'SPAWN_SPARK'; readonly spark: Spark }
  | { readonly type: 'DESPAWN_SPARK'; readonly sparkId: SparkId }
  | { readonly type: 'PICKUP_SPARK'; readonly sparkId: SparkId; readonly playerId: PlayerId }
  | { readonly type: 'DROP_SPARK'; readonly playerId: PlayerId; readonly pos: Vec2 }
  | PlacePrimitiveAction
  // S17 P1 — Phase-2 §VIII.3 row 1: SEVER_BOND now carries playerId + cause.
  // cause='player' → routes through auth gate (hostile-if-either-endpoint-
  // placerColor-differs per Council R1 Gemini #3) + charge consumption
  // (§VIII.1-2). cause='physics' → bypass both gates (constraint solver
  // overstretch breakage is not a disruption action). PRIME-AUDIT B:
  // cycle-bond sever (severSplit returns empty del per §VIII.4 no-op) does
  // NOT consume charge; bond removal still applies (pre-existing behavior).
  | {
      readonly type: 'SEVER_BOND';
      readonly bondId: BondId;
      readonly playerId: PlayerId;
      readonly cause: 'player' | 'physics';
    }
  | { readonly type: 'TICK_ENERGY'; readonly playerId: PlayerId; readonly deltaSec: number }
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId }
  | StartGameAction
  | EndTurnAction
  | ReturnToTitleAction
  | UpdateAvatarPosAction;

export function makeWorld(rngSeed: number): World {
  const w: World = {
    tick: 0,
    rngSeed,
    freeSparks: new Map(),
    primitives: new Map(),
    bonds: new Map(),
    players: new Map(),
    gameState: 'PLAYING', // test contract; main.ts overrides to 'TITLE' at boot
    nextPrimitiveId: 0,
    nextBondId: 0,
    lastWinnerId: null,
    effects: [],
    scoreProgress: 0,
    scoreByPlayer: new Map(),
    cinematicsEnabled: true,
    gameMode: 'solo',
    currentPlayerId: asPlayerId(0),
    isHost: true,
  };
  // Phase 1 + solo default: P1 only at spawner-rim left.
  const p1 = makeIdlePlayer(asPlayerId(0), PLAYER_COLORS[0], {
    x: SPAWNER_CENTER_X - SPAWNER_RADIUS - 40,
    y: SPAWNER_CENTER_Y,
  });
  w.players.set(p1.id, p1);
  w.scoreByPlayer.set(p1.id, 0);
  return w;
}

export function dispatch(world: World, action: GameAction): World {
  switch (action.type) {
    case 'SPAWN_SPARK':
      world.freeSparks.set(action.spark.id, action.spark);
      return world;

    case 'DESPAWN_SPARK': {
      const s = world.freeSparks.get(action.sparkId);
      if (s === undefined) return world;
      if (s.state.kind !== 'Free') return world;
      world.freeSparks.delete(action.sparkId);
      return world;
    }

    case 'PICKUP_SPARK': {
      // S15 P2 1v1 input sanitization (Gemini R1 BLOCKER): host silently
      // rejects intents from the inactive player. Solo path always passes.
      if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId) return world;
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

    case 'DROP_SPARK': {
      if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId) return world;
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

    case 'PLACE_PRIMITIVE':
      if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId) return world;
      return placePrimitive(world, action);

    case 'SEVER_BOND': {
      // S17 §13.11 LOCKED; S19 P2 orchestrator over disruptionManager helpers.
      // Effect ordering (Council R1 Grok#4 + Gemini#1 BLOCKER): SEVER_ERASE
      // effects emit BEFORE topology mutation (need live prims for pos/color
      // /radius); BOND_SEVERED emits AFTER (end-of-operation marker for audio).
      const bond = world.bonds.get(action.bondId);
      if (bond === undefined) return world;

      const primA = world.primitives.get(bond.aId);
      const primB = world.primitives.get(bond.bId);
      if (primA === undefined || primB === undefined) return world;

      // Capture sever pos before any mutation (audio drain payload).
      const severPos = { x: primA.pos.x, y: primA.pos.y };

      if (!canSeverBond(world, action, primA, primB)) return world;

      const split = severSplit(bond, world.primitives, world.bonds);
      // Cycle-no-consume (§VIII.4): hostile sever that produces zero deletions
      // (closed-cycle bond) keeps charge; bond is still removed.
      const chargeToConsume = split.del.size === 0
        ? 0
        : computeBaseCharge(world, action, primA, primB);
      if (chargeToConsume > 0) {
        requirePlayer(world, action.playerId).disruptionCharges -= chargeToConsume;
      }

      for (const e of computeSeverEraseEffects(world, split, world.tick)) world.effects.push(e);
      applySeverTopology(world, bond, split);
      world.effects.push({
        kind: 'BOND_SEVERED',
        tick: world.tick,
        pos: severPos,
        cause: action.cause,
      });

      return world;
    }

    case 'TICK_ENERGY': {
      const player = requirePlayer(world, action.playerId);
      tickEnergy(player, action.deltaSec, ENERGY_PER_SECOND_FLAT);
      return world;
    }

    case 'WIN_TRIGGER':
      world.gameState = 'WIN';
      world.lastWinnerId = action.winnerId;
      return world;

    case 'START_GAME':
      return applyStartGame(world, action);

    case 'END_TURN':
      return applyEndTurn(world);

    case 'RETURN_TO_TITLE':
      return applyReturnToTitle(world);

    case 'UPDATE_AVATAR_POS':
      return applyUpdateAvatarPos(world, action);
  }
}

/**
 * Lookup helper exported for placePrimitive.ts (and any other state mutator
 * that needs a player by id). Throws if the player is missing.
 */
export function requirePlayer(world: World, id: PlayerId): Player {
  const p = world.players.get(id);
  if (p === undefined) throw new Error(`player ${id} missing`);
  return p;
}

