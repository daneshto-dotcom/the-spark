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
 * S14 P2.0: PLACE_PRIMITIVE handler extracted to src/state/placePrimitive.ts.
 * S16 P0: START_GAME / END_TURN / RETURN_TO_TITLE / UPDATE_AVATAR_POS handler
 *         bodies + addScore extracted to src/state/gameMode.ts.
 * S19 P2: SEVER_BOND helpers extracted to src/state/disruptionManager.ts.
 * S20 P1: SPAWN_SPARK / DESPAWN_SPARK / PICKUP_SPARK / DROP_SPARK / TICK_ENERGY
 *         case bodies extracted to src/state/sparkLifecycle.ts (Council R1).
 *         1v1 active-player auth gate centralized in src/state/authGate.ts
 *         (eliminates inline duplication at 3 dispatch sites). WIN_TRIGGER
 *         stays inline (3 LOC scalar mutation, cohesion-mismatch for sparkLifecycle).
 *         All §XV charter compliance work mechanical, zero behavior change.
 */

import { PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { type Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
import {
  applySeverTopology,
  canSeverBond,
  computeBaseCharge,
  computeSeverEraseEffects,
} from './disruptionManager.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import type { Spark } from '../game/spark.ts';
import type { Bond } from '../physics/bonds.ts';
import {
  asPlayerId,
  type BondId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
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
import { requireActivePlayer } from './authGate.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { setCooldown } from './godlyCooldown.ts';
import {
  applyDespawnSpark,
  applyDropSpark,
  applyPickupSpark,
  applySpawnSpark,
  applyTickEnergy,
  type DespawnSparkAction,
  type DropSparkAction,
  type PickupSparkAction,
  type SpawnSparkAction,
  type TickEnergyAction,
} from './sparkLifecycle.ts';

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
  /**
   * S22 P3 — currently-playing godly cinematic owner. Null when no cinematic
   * is active. Single-slot serialization (PRIME-AUDIT Δ2): concurrent
   * GODLY_TRIGGER actions queue into pendingCinematics and fire one at a
   * time so cinematics never overlap visually.
   */
  activeCinematicPlayerId: PlayerId | null;
  /**
   * S22 P4 — currently-playing godly cinematic event (godlyId + targetPos
   * + targetComponentPrimitiveIds + triggerTick). Used by the renderer to
   * pick the right recipe for cutsceneOverlay.play(). Cleared on
   * GODLY_COMPLETE / GODLY_ABORT.
   */
  currentCinematicEvent: GodlyTriggerEvent | null;
  /**
   * S22 P3 — queue of pending godly triggers behind the active one. Host
   * processes one at a time. main.ts setTimeout (wall-clock cinematicMs +
   * sustainedEffectMs) shifts the next event and re-dispatches.
   */
  pendingCinematics: GodlyTriggerEvent[];
}

export type GameAction =
  | SpawnSparkAction
  | DespawnSparkAction
  | PickupSparkAction
  | DropSparkAction
  | PlacePrimitiveAction
  // S17 P1 — Phase-2 §VIII.3 row 1: SEVER_BOND carries playerId + cause.
  // cause='player' → routes through auth gate (hostile-if-either-endpoint-
  // placerColor-differs per Council R1 Gemini #3) + charge consumption
  // (§VIII.1-2). cause='physics' → bypass both gates.
  | {
      readonly type: 'SEVER_BOND';
      readonly bondId: BondId;
      readonly playerId: PlayerId;
      readonly cause: 'player' | 'physics';
    }
  | TickEnergyAction
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId }
  | StartGameAction
  | EndTurnAction
  | ReturnToTitleAction
  | UpdateAvatarPosAction
  // S22 P3 — godly-trigger action. Host dispatches locally on matcher match,
  // client dispatches on receiving GodlyTriggerMsg over the network. Reducer
  // sets activeCinematicPlayerId (or queues if one is already active), starts
  // cooldown, and emits SEVER_BOND cascade on target component's bonds for
  // the sustained effect.
  | {
      readonly type: 'GODLY_TRIGGER';
      readonly event: GodlyTriggerEvent;
    }
  // S22 P3 — clear active cinematic + advance pendingCinematics queue.
  // Dispatched by main.ts wall-clock timer after cinematicMs + sustainedEffectMs.
  | { readonly type: 'GODLY_COMPLETE' }
  // S22 P3 — abort active cinematic + drain queue. Dispatched on peer-drop
  // (PRIME-AUDIT Δ3 — connectionLostOverlay calls this so audio/video can be
  // stopped cleanly and no more godlies fire in a dead session).
  | { readonly type: 'GODLY_ABORT' };

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
    activeCinematicPlayerId: null,
    currentCinematicEvent: null,
    pendingCinematics: [],
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
      return applySpawnSpark(world, action);

    case 'DESPAWN_SPARK':
      return applyDespawnSpark(world, action);

    case 'PICKUP_SPARK':
      return applyPickupSpark(world, action);

    case 'DROP_SPARK':
      return applyDropSpark(world, action);

    case 'PLACE_PRIMITIVE':
      if (!requireActivePlayer(world, action.playerId)) return world;
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

    case 'TICK_ENERGY':
      return applyTickEnergy(world, action);

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

    case 'GODLY_TRIGGER': {
      // S22 P3 — single-slot cinematic serialization (PRIME-AUDIT Δ2).
      // If another cinematic is active, queue. Otherwise activate + start
      // cooldown + cascade SEVER_BOND on target component's bonds.
      const { event } = action;
      if (world.activeCinematicPlayerId !== null) {
        world.pendingCinematics.push(event);
        return world;
      }
      const triggerer = world.players.get(event.triggererPlayerId);
      if (triggerer === undefined) return world;
      world.activeCinematicPlayerId = event.triggererPlayerId;
      world.currentCinematicEvent = event;
      setCooldown(triggerer, world.tick);
      // Sustained effect: SEVER_BOND every bond connected to the target
      // component. Reuses existing severance machinery with cause='godly'.
      const targetSet = new Set(event.targetComponentPrimitiveIds);
      const targetBondIds: BondId[] = [];
      for (const [bondId, bond] of world.bonds) {
        if (targetSet.has(bond.aId) || targetSet.has(bond.bId)) {
          targetBondIds.push(bondId);
        }
      }
      for (const bondId of targetBondIds) {
        const bond = world.bonds.get(bondId);
        if (bond === undefined) continue;
        const primA = world.primitives.get(bond.aId);
        const primB = world.primitives.get(bond.bId);
        if (primA === undefined || primB === undefined) continue;
        // 'godly' bypasses auth + charge gates entirely (host-validated upstream).
        const split = severSplit(bond, world.primitives, world.bonds);
        for (const e of computeSeverEraseEffects(world, split, world.tick)) world.effects.push(e);
        applySeverTopology(world, bond, split);
        world.effects.push({
          kind: 'BOND_SEVERED',
          tick: world.tick,
          pos: { x: primA.pos.x, y: primA.pos.y },
          cause: 'godly',
        });
      }
      return world;
    }

    case 'GODLY_COMPLETE': {
      world.activeCinematicPlayerId = null;
      world.currentCinematicEvent = null;
      // No re-dispatch from inside the reducer (CQS — main.ts setTimeout
      // shifts next pending event and dispatches GODLY_TRIGGER for it).
      return world;
    }

    case 'GODLY_ABORT': {
      world.activeCinematicPlayerId = null;
      world.currentCinematicEvent = null;
      world.pendingCinematics.length = 0;
      return world;
    }
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

