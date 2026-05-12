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
 */

import { ENERGY_PER_SECOND_FLAT, PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';
import { type GameEffect } from '../game/effects.ts';
import { snapPrevPosForUnbonded } from '../game/invariants.ts';
import { type Primitive } from '../game/primitive.ts';
import { severSplit } from '../game/structure.ts';
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
import { placePrimitive, type PlacePrimitiveAction } from './placePrimitive.ts';

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
  | { readonly type: 'SEVER_BOND'; readonly bondId: BondId }
  | { readonly type: 'TICK_ENERGY'; readonly playerId: PlayerId; readonly deltaSec: number }
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId }
  | { readonly type: 'START_GAME'; readonly mode: GameMode; readonly isHost: boolean }
  | { readonly type: 'END_TURN' }
  | { readonly type: 'RETURN_TO_TITLE' }
  | { readonly type: 'UPDATE_AVATAR_POS'; readonly playerId: PlayerId; readonly pos: Vec2 };

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
      // Note: SEVER_BOND has no playerId in current schema. Controls layer
      // (controls.ts) gates by FSM Idle + active turn before dispatch. v1
      // host trusts; S16 may add playerId for defense-in-depth.
      const bond = world.bonds.get(action.bondId);
      if (bond === undefined) return world;
      const split = severSplit(bond, world.primitives, world.bonds);
      for (const primId of split.del) {
        const p = world.primitives.get(primId);
        if (p === undefined) continue;
        world.effects.push({
          kind: 'SEVER_ERASE',
          tick: world.tick,
          pos: { x: p.pos.x, y: p.pos.y },
          color: p.placerColor,
          radius: p.radius,
        });
      }
      const a = world.primitives.get(bond.aId);
      const b = world.primitives.get(bond.bId);
      a?.bonds.delete(bond.id);
      b?.bonds.delete(bond.id);
      world.bonds.delete(bond.id);
      for (const bondId of split.delBonds) {
        const lost = world.bonds.get(bondId);
        if (lost === undefined) continue;
        world.primitives.get(lost.aId)?.bonds.delete(bondId);
        world.primitives.get(lost.bId)?.bonds.delete(bondId);
        world.bonds.delete(bondId);
      }
      for (const primId of split.del) world.primitives.delete(primId);
      snapPrevPosForUnbonded(world.primitives);
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

    case 'START_GAME': {
      world.gameMode = action.mode;
      world.isHost = action.isHost;
      world.gameState = 'PLAYING';
      world.currentPlayerId = asPlayerId(0);
      if (action.mode === '1v1') {
        // Ensure P2 exists with cyan color at spawner-rim right.
        const p2Id = asPlayerId(1);
        if (!world.players.has(p2Id)) {
          const p2 = makeIdlePlayer(p2Id, PLAYER_COLORS[1], {
            x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 40,
            y: SPAWNER_CENTER_Y,
          });
          world.players.set(p2.id, p2);
          world.scoreByPlayer.set(p2.id, 0);
        }
      }
      return world;
    }

    case 'END_TURN': {
      if (world.gameMode !== '1v1') return world;
      if (world.gameState !== 'PLAYING') return world;
      const next = world.currentPlayerId === asPlayerId(0) ? asPlayerId(1) : asPlayerId(0);
      world.currentPlayerId = next;
      return world;
    }

    case 'RETURN_TO_TITLE': {
      world.gameState = 'TITLE';
      world.gameMode = 'solo';
      world.currentPlayerId = asPlayerId(0);
      world.primitives.clear();
      world.bonds.clear();
      world.freeSparks.clear();
      world.effects.length = 0;
      world.lastWinnerId = null;
      world.nextPrimitiveId = 0;
      world.nextBondId = 0;
      world.scoreProgress = 0;
      world.scoreByPlayer.clear();
      // Keep P1 only; drop P2 if present.
      const survivors: PlayerId[] = [];
      for (const pid of world.players.keys()) {
        if (pid !== asPlayerId(0)) survivors.push(pid);
      }
      for (const pid of survivors) world.players.delete(pid);
      // Reset P1's per-game state.
      const p1 = world.players.get(asPlayerId(0));
      if (p1 !== undefined) {
        p1.energy = 0;
        p1.buildActions = 0;
        p1.disruptionCharges = 0;
        if (p1.kind === 'Carrying') {
          world.players.set(p1.id, { ...p1, kind: 'Idle' as const } as never);
        }
      }
      world.scoreByPlayer.set(asPlayerId(0), 0);
      return world;
    }

    case 'UPDATE_AVATAR_POS': {
      const player = world.players.get(action.playerId);
      if (player === undefined) return world;
      player.avatarPos.x = action.pos.x;
      player.avatarPos.y = action.pos.y;
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

/**
 * S15 P2 — per-player score helper.
 *
 * Solo: scoreProgress is the scalar leader (additive). scoreByPlayer also
 * tracks for future-proofing but solo gameplay never reads it. Test
 * contracts that DIRECTLY mutate world.scoreProgress (session10.test.ts
 * scoreProgress=14 pre-bake, session13.test.ts likewise) remain valid
 * because solo path is additive (scoreProgress += delta).
 *
 * 1v1: scoreProgress = max(scoreByPlayer.values()) — the leader's score
 * drives the PHASE_1_WIN_SCORE gate in gameState.ts. Each player's
 * personal score lives in scoreByPlayer for HUD display + winner
 * attribution. The leader-max ensures WIN fires when ANY player crosses
 * the threshold first, not when summed totals do.
 */
export function addScore(world: World, playerId: PlayerId, delta: number): void {
  const prev = world.scoreByPlayer.get(playerId) ?? 0;
  const next = prev + delta;
  world.scoreByPlayer.set(playerId, next);
  if (world.gameMode === '1v1') {
    let max = next;
    for (const v of world.scoreByPlayer.values()) if (v > max) max = v;
    world.scoreProgress = max;
  } else {
    // Solo additive — preserves test contract where world.scoreProgress
    // is the source of truth and may be set directly by callers.
    world.scoreProgress += delta;
  }
}
