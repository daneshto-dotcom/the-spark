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
import { isBenchDeniedIntent } from './benchGate.ts';
import { isBenched } from './hunters/hunter.ts';
import { applySeverBond } from './severBond.ts';
import type { World } from './worldTypes.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import { asPlayerId, type BondId, type PlayerId } from '../types.ts';
import {
  applyBenchOfflinePlayer,
  applyReturnToTitle,
  applyStartGame,
  applyUpdateAvatarPos,
  isNetworked,
  type BenchOfflinePlayerAction,
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
import {
  applyDissipateBomb,
  applySpawnBomb,
  applyTriggerBomb,
  teardownBombs,
  type DissipateBombAction,
  type SpawnBombAction,
  type TriggerBombAction,
} from './bombLifecycle.ts';
import {
  applyHunterCatch,
  applyHunterTick,
  applySpawnHunter,
  teardownHunters,
  type HunterCatchAction,
  type HunterTickAction,
  type SpawnHunterAction,
} from './hunters/hunterLifecycle.ts';
import {
  applyCleanPoop,
  applyPoopTick,
  applySeagullTick,
  applySpawnSeagull,
  reconcileFouledPrimitives,
  teardownSeagulls,
  type CleanPoopAction,
  type PoopTickAction,
  type SeagullTickAction,
  type SpawnSeagullAction,
} from './seagulls/seagullLifecycle.ts';
import {
  applyDissipatePotato,
  applyDropPotato,
  applyPickupPotato,
  applyPlacePotato,
  applyPotatoDetonate,
  applySpawnPotato,
  teardownPotatoes,
  type DissipatePotatoAction,
  type DropPotatoAction,
  type PickupPotatoAction,
  type PlacePotatoAction,
  type PotatoDetonateAction,
  type SpawnPotatoAction,
} from './potatoLifecycle.ts';
import {
  applyDissipateRainbow,
  applySpawnRainbow,
  applyTriggerRainbow,
  teardownRainbows,
  type DissipateRainbowAction,
  type SpawnRainbowAction,
  type TriggerRainbowAction,
} from './rainbowLifecycle.ts';

// Re-export addScore from gameMode.ts for back-compat with placePrimitive.ts
// and session15.test.ts (S16 P0 extraction preserved external import paths).
import { submitSudokuSolve } from './sudokuEvent.ts';
export { addScore, isNetworked } from './gameMode.ts';

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
      // S71 P1 — 'bomb' added: bypasses charge + auth like 'creature'/'physics'
      // (host-authoritative bomb detonation; the picker damages their OWN bonds).
      readonly cause: 'player' | 'physics' | 'creature' | 'bomb';
    }
  | TickEnergyAction
  | { readonly type: 'WIN_TRIGGER'; readonly winnerId: PlayerId }
  | StartGameAction
  | ReturnToTitleAction
  | UpdateAvatarPosAction
  // S82 P4(c) — host-internal mid-game drop-bench (rolling re-stamp; see gameMode.ts).
  // Deliberately NOT in net/protocol.ts CLIENT_INTENT_TYPES — clients cannot send it.
  | BenchOfflinePlayerAction
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
  | { readonly type: 'SHRINK_TERRITORY'; readonly playerId: PlayerId }
  // S71 P1 — bomb hazard. SPAWN_BOMB + DISSIPATE_BOMB are host-internal (spawner
  // cadence / TTL poll); TRIGGER_BOMB is a client→host intent (drives the v4→5
  // PROTOCOL_VERSION bump). Reducers in bombLifecycle.ts.
  | SpawnBombAction
  | TriggerBombAction
  | DissipateBombAction
  // S72 P2 — Pac-Man hunter (host-internal; NOT client INTENTs — host-authored +
  // snapshot-replicated, so PROTOCOL_VERSION stays 5). Reducers in hunters/hunterLifecycle.ts.
  | SpawnHunterAction
  | HunterTickAction
  | HunterCatchAction
  // S77 P3 — seagull hazard (host-internal; reducers in seagulls/seagullLifecycle.ts).
  | SpawnSeagullAction
  | SeagullTickAction
  | PoopTickAction
  | CleanPoopAction
  // S72 P3 — potato bomb. PICKUP/PLACE/DROP_POTATO are client INTENTs (a joiner can
  // carry + plant a potato); SPAWN_POTATO + POTATO_DETONATE are host-internal (spawner
  // cadence / fuse poll). NO PROTOCOL_VERSION bump — the S71 v4->5 covers the batch.
  | SpawnPotatoAction
  | PickupPotatoAction
  | PlacePotatoAction
  | DropPotatoAction
  | PotatoDetonateAction
  | DissipatePotatoAction
  // S75 P3 — rainbow color-shuffle. TRIGGER_RAINBOW is a client INTENT (any player clicking it);
  // SPAWN_RAINBOW + DISSIPATE_RAINBOW are host-internal (spawner cadence / TTL poll). PROTOCOL 5->6.
  | SpawnRainbowAction
  | TriggerRainbowAction
  | DissipateRainbowAction
  // S93 — NONET: a player submits a completed Sudoku grid (client INTENT or host/solo local);
  // the host validates first-valid-wins. playerId is host-stamped to the sender's seat.
  | { readonly type: 'SUDOKU_SOLVED'; readonly playerId: PlayerId; readonly grid: readonly number[] };

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
    bombs: new Map(),
    nextBombId: 0,
    hunters: new Map(),
    nextHunterId: 0,
    hunterSpawned: false,
    potatoes: new Map(),
    nextPotatoId: 0,
    rainbows: new Map(),
    nextRainbowId: 0,
    seagulls: new Map(),
    nextSeagullId: 0,
    poops: new Map(),
    nextPoopId: 0,
    fouledPrimitives: new Set(),
    // S88 G3a — in-match combo-discovery set (the magic combos); empty at world birth.
    discoveredCombos: new Set(),
    // S42 — race-condition observability (real-time 1v1) + local-player
    // convention (replaces removed currentPlayerId active-player concept).
    diagnostics: {
      raceRejects: 0,
      rejectReasons: {
        pickupPosShape: 0,
        pickupSparkNotFree: 0,
        pickupReachFail: 0,
        pickupPoopedTooFar: 0,
        placeTargetMissing: 0,
        actorBenched: 0,
      },
      territoryBlockRejects: 0,
    },
    localPlayerId: asPlayerId(0),
    botSeats: new Set(),
    // S93 — NONET event: no trial active, not yet fired this match.
    sudoku: null,
    sudokuFiredThisMatch: false,
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
  // S86 P3 — central bench gate (Council CONCEDED→GROK: ONE choke point, not
  // per-verb enumeration). A benched (eaten) actor's acquisitive/structural
  // intents are rejected HERE, before any case body, covering local input,
  // optimistic joiner prediction AND remote intents the host applies — the
  // round-6 playtest proved input-layer-only locking lets an eaten player
  // keep collecting and building. Policy + rationale: benchGate.ts.
  // Pure fn of synced fields (benchedUntilTick, world.tick) → optimistic and
  // authoritative dispatch agree by construction.
  if (isBenchDeniedIntent(action.type) && 'playerId' in action) {
    const actor = world.players.get(action.playerId);
    if (actor !== undefined && isBenched(actor.benchedUntilTick, world.tick)) {
      world.diagnostics.raceRejects++;
      world.diagnostics.rejectReasons.actorBenched++;
      return world;
    }
  }
  switch (action.type) {
    case 'SPAWN_SPARK':
      return applySpawnSpark(world, action);

    case 'DESPAWN_SPARK':
      return applyDespawnSpark(world, action);

    case 'PICKUP_SPARK':
      return applyPickupSpark(world, action);

    case 'DROP_SPARK':
      return applyDropSpark(world, action);

    case 'PLACE_PRIMITIVE': {
      // S80 — placement can BOND into (or merge structures with) a poop-fouled component;
      // re-derive the foul set so it always equals the splat-anchors' CURRENT components.
      // Pre-S80 the new prim stayed un-fouled until some unrelated destroy event triggered
      // a reconcile — a timing-dependent inconsistency (income + tint flipped retroactively).
      // No-op (early-out) in the common nothing-fouled case.
      placePrimitive(world, action);
      reconcileFouledPrimitives(world);
      return world;
    }

    case 'PLACE_FROM_FREE': {
      // S80 — same foul-set consistency as PLACE_PRIMITIVE (this is the second bond-forming
      // placement path).
      applyPlaceFromFree(world, action);
      reconcileFouledPrimitives(world);
      return world;
    }

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
      // S72 P2 — tear the hunter down on the PLAYING->WIN edge so it never lingers
      // on the win screen + no player carries a bench into POSTGAME / the next match.
      teardownHunters(world);
      // S72 P3 — same for potatoes (no armed potato / carry-slot persists past the win).
      teardownPotatoes(world);
      // S73 P2 — and bombs (landing-audit parity fix): completes the all-three-hazards
      // teardown on the PLAYING->WIN edge so a bomb live at the win moment doesn't linger.
      teardownBombs(world);
      // S75 P3 — and rainbows (completes the all-hazards teardown on the PLAYING->WIN edge).
      teardownRainbows(world);
      // S77 P3 — and seagulls/poops/fouled state (so no gull/poop/foul persists onto the win
      // screen or into the next match — a fouled prim would otherwise halt income next game).
      teardownSeagulls(world);
      return world;

    case 'START_GAME':
      return applyStartGame(world, action);

    case 'RETURN_TO_TITLE':
      return applyReturnToTitle(world);

    case 'UPDATE_AVATAR_POS':
      return applyUpdateAvatarPos(world, action);

    // S82 P4(c) — host-internal mid-game peer-drop bench.
    case 'BENCH_OFFLINE_PLAYER':
      return applyBenchOfflinePlayer(world, action);

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
      if (!isNetworked(world)) return world;
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

    // S71 P1 — bomb hazard lifecycle (reducers in bombLifecycle.ts).
    case 'SPAWN_BOMB':
      return applySpawnBomb(world, action);

    case 'TRIGGER_BOMB':
      return applyTriggerBomb(world, action);

    case 'DISSIPATE_BOMB':
      return applyDissipateBomb(world, action);

    // S72 P2 — Pac-Man hunter lifecycle (reducers in hunters/hunterLifecycle.ts).
    case 'SPAWN_HUNTER':
      return applySpawnHunter(world, action);

    case 'HUNTER_TICK':
      return applyHunterTick(world, action);

    case 'HUNTER_CATCH':
      return applyHunterCatch(world, action);

    // S77 P3 — seagull hazard lifecycle (reducers in seagulls/seagullLifecycle.ts).
    case 'SPAWN_SEAGULL':
      return applySpawnSeagull(world, action);

    case 'SEAGULL_TICK':
      return applySeagullTick(world, action);

    case 'POOP_TICK':
      return applyPoopTick(world, action);

    case 'CLEAN_POOP':
      return applyCleanPoop(world, action);

    // S72 P3 — potato bomb lifecycle (reducers in potatoLifecycle.ts).
    case 'SPAWN_POTATO':
      return applySpawnPotato(world, action);

    case 'PICKUP_POTATO':
      return applyPickupPotato(world, action);

    case 'PLACE_POTATO':
      return applyPlacePotato(world, action);

    case 'DROP_POTATO':
      return applyDropPotato(world, action);

    case 'POTATO_DETONATE':
      return applyPotatoDetonate(world, action);

    case 'DISSIPATE_POTATO':
      return applyDissipatePotato(world, action);

    // S75 P3 — rainbow color-shuffle lifecycle (reducers in rainbowLifecycle.ts).
    case 'SPAWN_RAINBOW':
      return applySpawnRainbow(world, action);

    case 'TRIGGER_RAINBOW':
      return applyTriggerRainbow(world, action);

    case 'DISSIPATE_RAINBOW':
      return applyDissipateRainbow(world, action);

    // S93 — NONET solve submission (host-authoritative; first valid grid wins). On the host this
    // applies the ×2/÷2; on a client this case never runs (clients send it as an INTENT, the host
    // dispatches it, and the result returns via NetSnapshot).
    case 'SUDOKU_SOLVED':
      submitSudokuSolve(world, action.playerId, action.grid);
      return world;
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

