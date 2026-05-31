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
 * S61 P1: SEVER_BOND orchestrator body extracted to src/state/severBond.ts
 *         (applySeverBond) — dispatch() is now uniformly 1-line delegations.
 */

import { PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, TERRITORY_SHRINK_DURATION_TICKS } from '../constants.ts';
import { applySeverBond } from './severBond.ts';
import type { World } from './worldTypes.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import { asPlayerId, type BondId, type PlayerId } from '../types.ts';
import {
  applyReturnToTitle,
  applyStartGame,
  applyUpdateAvatarPos,
  type ReturnToTitleAction,
  type StartGameAction,
  type UpdateAvatarPosAction,
} from './gameMode.ts';
import { placePrimitive, type PlacePrimitiveAction } from './placePrimitive.ts';
import { applyPlaceFromFree, type PlaceFromFreeAction } from './placeFromFree.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { applyGodlyAbort, applyGodlyComplete, applyGodlyTrigger } from './godlyActions.ts';
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

// Re-export addScore from gameMode.ts for back-compat with placePrimitive.ts
// and session15.test.ts (S16 P0 extraction preserved external import paths).
export { addScore } from './gameMode.ts';

// S61 P3 — World / GameState / GameMode moved to src/state/worldTypes.ts (§XV
// de-hypertrophy): world.ts is the dispatch seam, worldTypes.ts the data shape.
// Direct type-only re-export so consumers keep importing them from './world.ts'.
export type { GameMode, GameState, World } from './worldTypes.ts';

export type GameAction =
  | SpawnSparkAction
  | DespawnSparkAction
  | PickupSparkAction
  | DropSparkAction
  | PlacePrimitiveAction
  // S52 P1 — Atomic PLACE_FROM_FREE replaces the LMB-up PICKUP+PLACE burst
  // (Council R1 CONVERGENT BLOCKER C1 Grok#8+Gemini#1; full doc in
  // src/state/placeFromFree.ts). Wire protocol bumped 2→3.
  | PlaceFromFreeAction
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
  | CreatureAttackAction
  // S49 P1 (Sym F) — territorial shrink disruption. Costs 1 disruptionCharge;
  // halves all enemy territorial radii for TERRITORY_SHRINK_DURATION_TICKS
  // (300 ticks = 5s at 60Hz). 1v1-only semantics (solo no-ops in dispatch;
  // no enemies exist in world.players). Guard in controls.ts prevents the key
  // from doing anything in solo mode.
  | { readonly type: 'SHRINK_TERRITORY'; readonly playerId: PlayerId };

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
      territoryBlockRejects: 0,
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

    case 'PLACE_FROM_FREE':
      return applyPlaceFromFree(world, action);

    // S61 P1 — SEVER_BOND orchestrator extracted to severBond.ts (§XV
    // de-hypertrophy). Effect ordering + charge semantics preserved verbatim;
    // dispatch() is now uniformly 1-line delegations.
    case 'SEVER_BOND':
      return applySeverBond(world, action);

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

    // S60 P5 — the GODLY cinematic-state cluster extracted to godlyActions.ts
    // (§XV de-hypertrophy). Behaviour + mutation order preserved verbatim.
    case 'GODLY_TRIGGER':
      return applyGodlyTrigger(world, action.event);

    case 'GODLY_COMPLETE':
      return applyGodlyComplete(world);

    case 'GODLY_ABORT':
      return applyGodlyAbort(world);

    case 'SPAWN_CREATURE':
      return applySpawnCreature(world, action);

    case 'DESPAWN_CREATURE':
      return applyDespawnCreature(world, action);

    case 'CREATURE_TICK':
      return applyCreatureTick(world, action);

    case 'CREATURE_ATTACK':
      return applyCreatureAttack(world, action);

    case 'SHRINK_TERRITORY': {
      // 1v1-only: solo has no enemy, loop finds no targets → implicit no-op.
      // Charge guard prevents charge loss on accidental trigger.
      if (world.gameMode !== '1v1') return world;
      const attacker = world.players.get(action.playerId);
      if (attacker === undefined) return world;
      if (attacker.disruptionCharges < 1) return world;
      attacker.disruptionCharges--;
      const until = world.tick + TERRITORY_SHRINK_DURATION_TICKS;
      for (const [pid, enemy] of world.players) {
        if (pid !== action.playerId) {
          enemy.territorialShrinkUntilTick = until;
        }
      }
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

