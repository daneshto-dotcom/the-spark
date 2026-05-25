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
  type CreatureId,
  type PlayerId,
  type PrimitiveId,
  type SparkId,
} from '../types.ts';
import {
  applyReturnToTitle,
  applyStartGame,
  applyUpdateAvatarPos,
  type ReturnToTitleAction,
  type StartGameAction,
  type UpdateAvatarPosAction,
} from './gameMode.ts';
import { placePrimitive, type PlacePrimitiveAction } from './placePrimitive.ts';
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
import {
  applyCreatureTick,
  applyDespawnCreature,
  applySpawnCreature,
  type CreatureTickAction,
  type DespawnCreatureAction,
  type SpawnCreatureAction,
} from './creatures/creatureLifecycle.ts';
import {
  applyCreatureAttack,
  type CreatureAttackAction,
} from './creatures/creatureAttack.ts';
import type { Creature } from './creatures/creature.ts';

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
  /**
   * S25 P0 — autonomous creature actors (Voltkin Phase 2A). Host-authoritative;
   * spawned at cinematic handoff (T+cinematicMs), auto-removed at despawnAtTick
   * (8s lifetime per blueprint Q5). S28 P0 mirrors host→client via NetSnapshot
   * v2 (additive-optional `creatures?` field on WorldSnapshot — Council Q1
   * UNANIMOUS A S15 P2 pattern). Cleared by GODLY_ABORT cascade.
   */
  creatures: Map<CreatureId, Creature>;
  /**
   * S25 P0 — monotonic counter for creature IDs. Host-only mint authority.
   */
  nextCreatureId: number;
  /**
   * S28 P0 — tick-deterministic pending-spawn schedule (Council Q2 UNANIMOUS A
   * single-slot). Replaces S25's wall-clock `setTimeout(handoff, cinematicMs)`
   * in cutsceneOverlay.ts (S25 reflexion: never mutate world from wall-clock
   * setTimeout — replay determinism breaks). Set by main.ts startCinematicIfNeeded
   * after recipe lookup (host-only); polled in physics tick loop; dispatches
   * SPAWN_CREATURE + clears self when `world.tick >= fireAtTick`. GODLY_ABORT
   * MUST clear this (PRIME-AUDIT Δ5 enforced — otherwise zombie spawn fires
   * after peer-drop abort, violating blueprint Edge Case #2).
   */
  pendingCreatureSpawn: { fireAtTick: number; event: GodlyTriggerEvent } | null;
  /**
   * S42 — host-side counter of "shared-resource race rejected" events.
   * Increments when applyPickupSpark or placePrimitive silently no-ops
   * because the targeted spark/primitive was claimed by the other player
   * first under real-time race. Non-serialized (test-observable; per-session
   * informational). Replaces the prior throw-on-race pattern (S20 invariant)
   * which would crash dispatch under legitimate concurrent intents.
   * Council R1+R2 Battle Ledger row 1 (CONVERGENT Grok-C1 + Gemini-#1) +
   * row 5 (Gemini-#3 R2-sharpened — shared-resource vs player-owned).
   */
  /**
   * S48 P3 (Sym A diagnostic gap fix) — extended with rejectReasons
   * sub-bucket so the joiner-side debug overlay can surface WHICH path
   * silently rejected an intent. `raceRejects` remains the aggregate
   * counter (back-compat with session15.test.ts + sparkLifecycle.test.ts
   * assertions); rejectReasons is purely additive and incremented in
   * parallel with `raceRejects` at each reject site:
   *   - pickupPosShape: PICKUP_SPARK pos field malformed (wire corruption /
   *     pre-S46 peer / TS-bypass via JSON.parse)
   *   - pickupSparkNotFree: target spark already Carried by other player
   *     under real-time race (S42 shared-resource race)
   *   - pickupReachFail: remote carrier's pos failed isValidPickupPos
   *     (canvas bounds OR REASONABLE_PICKUP_REACH plausibility from
   *     avatarPos)
   *   - placeTargetMissing: PLACE_PRIMITIVE references a primitive id that
   *     no longer exists on host (race: host severed it between joiner
   *     intent and host application)
   * Surfaced in debugOverlay (?debug=1) so 2-peer smoke tests can pinpoint
   * the rejection path in real time.
   */
  diagnostics: {
    raceRejects: number;
    rejectReasons: {
      pickupPosShape: number;
      pickupSparkNotFree: number;
      pickupReachFail: number;
      placeTargetMissing: number;
    };
  };
  /**
   * S42 — local player id (non-serialized convention; client only mutates
   * its own copy at join time). Default asPlayerId(0) covers solo + 1v1
   * host. main.ts onJoinAttempt sets to asPlayerId(1) for the client peer.
   * HUD reads this to render the LOCAL player's energy gauge in 1v1 (was
   * previously reading world.currentPlayerId which only made sense in the
   * removed turn-based model). Replaces Grok-C3 + Gemini-validated R2
   * concern about HUD signature-threading.
   */
  localPlayerId: PlayerId;
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
  // S27 P0 (Council R1 Q1 UNANIMOUS B) — cause='creature' added for autonomous
  // CREATURE_ATTACK severances. Auth gate bypassed (host-authoritative; creature
  // mint requires SPAWN_CREATURE which is host-only per S25 PRIME-AUDIT Δ1
  // host-gate at main.ts onCinematicHandoff:499) + charge bypassed (creature
  // doesn't pay disruption charge — analogous to 'physics' bypass, semantics
  // documented in disruptionManager.ts canSeverBond + computeBaseCharge).
  | {
      readonly type: 'SEVER_BOND';
      readonly bondId: BondId;
      readonly playerId: PlayerId;
      readonly cause: 'player' | 'physics' | 'creature';
    }
  | TickEnergyAction
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId }
  | StartGameAction
  | ReturnToTitleAction
  | UpdateAvatarPosAction
  // S22 P3 — godly-trigger action. Host dispatches locally on matcher match,
  // client dispatches on receiving GodlyTriggerMsg over the network. Reducer
  // sets activeCinematicPlayerId (or queues if one is already active) and
  // starts the godly cooldown. S27 P0 — DELETED the synchronous SEVER_BOND
  // cascade that previously fired here; bond severance is now creature-driven
  // (autonomous Voltkin actor severs ~7 bonds at 1/sec over its 8-second
  // active window — see reducer body for full migration commentary).
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
  // S25 P0 — also cascade-clears `world.creatures` (blueprint Edge Case #2).
  | { readonly type: 'GODLY_ABORT' }
  // S25 P0 — creature actor lifecycle (Voltkin Phase 2A scaffold).
  | SpawnCreatureAction
  | DespawnCreatureAction
  | CreatureTickAction
  // S27 P0 — discrete creature attack (Voltkin Phase 2C). Dispatched from
  // main.ts post-CREATURE_TICK fan-out when a creature reaches FIRE_TICK in
  // ATTACKING state with a valid targetBondId. The reducer re-dispatches
  // SEVER_BOND with cause='creature' (Council R1 Q1 UNANIMOUS B — central
  // severance path) and emits an ARC_FLASH visual effect.
  | CreatureAttackAction;

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
    isHost: true,
    activeCinematicPlayerId: null,
    currentCinematicEvent: null,
    pendingCinematics: [],
    creatures: new Map(),
    nextCreatureId: 0,
    pendingCreatureSpawn: null,
    // S42 — race-condition observability (real-time 1v1) + local-player
    // convention (replaces removed currentPlayerId active-player concept).
    diagnostics: {
      raceRejects: 0,
      rejectReasons: {
        pickupPosShape: 0,
        pickupSparkNotFree: 0,
        pickupReachFail: 0,
        placeTargetMissing: 0,
      },
    },
    localPlayerId: asPlayerId(0),
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

    case 'RETURN_TO_TITLE':
      return applyReturnToTitle(world);

    case 'UPDATE_AVATAR_POS':
      return applyUpdateAvatarPos(world, action);

    case 'GODLY_TRIGGER': {
      // S22 P3 — single-slot cinematic serialization (PRIME-AUDIT Δ2).
      // If another cinematic is active, queue. Otherwise activate + start
      // cooldown. The cinematic plays in main.ts; the creature actor spawned
      // at handoff (main.ts onCinematicHandoff) handles bond severance.
      //
      // S27 P0 — CASCADE DELETED (Council R1 Q5 UNANIMOUS creature-only;
      // blueprint § "S27 migration notes" Gap A). Pre-S27 this case ran a
      // 26-line synchronous SEVER_BOND cascade over the target component's
      // bonds with cause='godly'. That instant destruction is replaced by
      // the autonomous Voltkin creature actor (S25 + S26 + S27 pipeline):
      //   - GODLY_TRIGGER sets cinematic + cooldown ONLY (this reducer body)
      //   - cutsceneOverlay plays the 4-second cinematic
      //   - onCinematicHandoff dispatches SPAWN_CREATURE at cinematic end
      //   - applyCreatureTick FSM-drives the creature for 8s
      //   - applyCreatureAttack severs target bonds at ~1/sec cadence via
      //     SEVER_BOND{cause:'creature'} + emits ARC_FLASH per zap
      //
      // BOND_SEVERED.cause='godly' is now unreachable in production code but
      // the union variant is preserved in effects.ts for type-system back-compat
      // (no live emitter post-S27; future revival possible if a new "instant
      // godly effect" recipe ships in S29+).
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
      // S25 P0 — cascade-clear creatures (blueprint Edge Case #2). Peer-drop or
      // explicit abort must remove all live actors so no zombie sprites persist.
      world.creatures.clear();
      // S28 P0 — PRIME-AUDIT Δ5: clear pending creature spawn so a queued
      // spawn cannot fire after abort (replay + 1v1 peer-drop both honored).
      world.pendingCreatureSpawn = null;
      return world;
    }

    case 'SPAWN_CREATURE':
      return applySpawnCreature(world, action);

    case 'DESPAWN_CREATURE':
      return applyDespawnCreature(world, action);

    case 'CREATURE_TICK':
      return applyCreatureTick(world, action);

    case 'CREATURE_ATTACK':
      return applyCreatureAttack(world, action);
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

