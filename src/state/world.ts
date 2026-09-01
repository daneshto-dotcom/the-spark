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

import { PHASE_DURATION_TICKS, PLAYER_COLORS, RAID_ATK, RAID_PEN, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, TERRITORY_SHRINK_DURATION_TICKS } from '../constants.ts';
import { attackFifths } from './stats.ts';
import { isBenchDeniedIntent } from './benchGate.ts';
import { isBenched } from './hunters/hunter.ts';
import { applySeverBond } from './severBond.ts';
import type { World } from './worldTypes.ts';
import { makeIdlePlayer, type Player } from '../game/player.ts';
import { asPlayerId, type BondId, type CreatureId, type PlayerId } from '../types.ts';
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
import { damageConnector, damageEntity } from './damage.ts';
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
  applyStructureSelfDestruct,
  teardownPotatoes,
  type DissipatePotatoAction,
  type DropPotatoAction,
  type PickupPotatoAction,
  type PlacePotatoAction,
  type PotatoDetonateAction,
  type SpawnPotatoAction,
  type StructureSelfDestructAction,
} from './potatoLifecycle.ts';
// S113 Batch C — lightning-drone explode reducer (host-internal). dispatch()<->droneLifecycle is the
// same runtime-safe cycle as creatureAttack.ts (dispatch is called, not imported, at module-init).
import { applyDroneExplode, type DroneExplodeAction } from './droneLifecycle.ts';
// S158 P3 (CF-S157-e) — the terrorist goblin's own detonation, distinct from the drone's bond-sever.
import { applySuicideBlast, type SuicideBlastAction } from './creatures/suicideBlast.ts';
import {
  applyDissipateRainbow,
  applySpawnRainbow,
  applyTriggerRainbow,
  teardownRainbows,
  type DissipateRainbowAction,
  type SpawnRainbowAction,
  type TriggerRainbowAction,
} from './rainbowLifecycle.ts';
import {
  applyRegisterSpawner,
  applyRemoveSpawner,
  teardownSpawners,
  type RegisterSpawnerAction,
  type RemoveSpawnerAction,
} from './spawners/spawnerLifecycle.ts';
import {
  applyRegisterDefender,
  applyRemoveDefender,
  applyDefenderTick,
  teardownDefenders,
  type RegisterDefenderAction,
  type RemoveDefenderAction,
  type DefenderTickAction,
} from './defenders/defenderLifecycle.ts';
import { applyBuildBlueprint, type BuildBlueprintAction } from './blueprintBuild.ts';
import { applyFeedTower, type FeedTowerAction } from './goblinTowerFeed.ts';
import {
  applyRepairStructure,
  applyScrapStructure,
  type RepairStructureAction,
  type ScrapStructureAction,
} from './structureRepair.ts';
import {
  applyBuyGatherer,
  applyGathererTick,
  applyPullFromBank,
  applySetGathererPreference,
  applyUpgradeGathererSpeed,
  teardownGatherers,
  type BuyGathererAction,
  type GathererTickAction,
  type PullFromBankAction,
  type SetGathererPreferenceAction,
  applyCancelGathererOrder,
  applyEnqueueGathererOrder,
  type CancelGathererOrderAction,
  type EnqueueGathererOrderAction,
  type UpgradeGathererSpeedAction,
} from './gatherers/gathererLifecycle.ts';

// Re-export addScore from gameMode.ts for back-compat with placePrimitive.ts
// and session15.test.ts (S16 P0 extraction preserved external import paths).
import { submitSudokuSolve } from './sudokuEvent.ts';
export { addScore, isNetworked } from './gameMode.ts';

// S61 P3 — World / GameState / GameMode moved to src/state/worldTypes.ts (§XV
// de-hypertrophy): world.ts is the dispatch seam, worldTypes.ts the data shape.
// Direct type-only re-export so consumers keep importing them from './world.ts'.
export type { GameMode, GameState, MatchPhase, World } from './worldTypes.ts';

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
      // S102 #2 — 'chewer' added: a pencil chewer's final bite (gnaw audio, no lightning;
      // bypasses charge + auth exactly like 'creature').
      // S113 Batch C — 'drone' added: a lightning-drone's detonation sever. Bypasses charge + auth
      // exactly like 'creature'/'chewer'/'bomb' (host-authoritative; the drone severs ENEMY bonds).
      // ⭐ S152 P1 (owner R78) — 'raid' added: the sever a RAID causes once accumulated connector
      // damage reaches capacity. Bypasses the disruption-charge gate because the raid was paid for
      // with a RAID POINT — a separate currency. ⚠ THIS UNION IS NOT THE SAME UNION AS
      // `GameEffect['BOND_SEVERED'].cause` (which also carries 'godly'); both had to be widened, and
      // tsc caught only this one AFTER the tests were already green. Vitest does not typecheck.
      readonly cause: 'player' | 'physics' | 'creature' | 'bomb' | 'chewer' | 'drone' | 'raid';
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
  // S102 #1 — RAID a creature: the player's "raid" (the same charge-spending disruption as
  // a bond sever) aimed at an enemy SPAWN instead of a connector. Right-clicking an enemy
  // pencil chewer pops it (1 charge → 1 damage → chewer hp 1 dies, green-goo splat). A
  // CLIENT_INTENT (a 1v1 joiner can raid); the host applies it authoritatively.
  //
  // ⭐ S152 P1 (owner R78) — RENAMED `RAID_CREATURE` → `RAID_TARGET` AND WIDENED TO CONNECTORS.
  // The old name became a lie the moment a raid could hit a bond, and a wire-visible action type
  // that misdescribes itself is the `DefenderDeathCause` mistake in a different costume — a name
  // the next author plans around. The target is DISCRIMINATED for the same reason `DamageTarget`
  // is: so a caller cannot hand a BondId to the creature arm.
  | {
      readonly type: 'RAID_TARGET';
      readonly target:
        | { readonly kind: 'creature'; readonly id: CreatureId }
        | { readonly kind: 'bond'; readonly id: BondId };
      readonly playerId: PlayerId;
    }
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
  // S113 Batch C — lightning-drone building (host-internal; reducers in droneLifecycle.ts +
  // potatoLifecycle.ts). DRONE_EXPLODE: a drone detonates (radial enemy-bond sever via SEVER_BOND
  // cause:'drone'). STRUCTURE_SELFDESTRUCT: the hub blows up (potato-style AoE) after its 3rd drone.
  // NEITHER is a client INTENT — host-authored + snapshot-replicated; they ride
  // KNOWN_GAME_ACTION_TYPES_RECORD only. PROTOCOL_VERSION 13->14 (new CreatureType + recipeId).
  | DroneExplodeAction
  | SuicideBlastAction
  | StructureSelfDestructAction
  // S75 P3 — rainbow color-shuffle. TRIGGER_RAINBOW is a client INTENT (any player clicking it);
  // SPAWN_RAINBOW + DISSIPATE_RAINBOW are host-internal (spawner cadence / TTL poll). PROTOCOL 5->6.
  | SpawnRainbowAction
  | TriggerRainbowAction
  | DissipateRainbowAction
  // S100 P1 (TD Phase 1a) — creature-spawner lifecycle (host-internal; reducers in
  // spawners/spawnerLifecycle.ts). REGISTER_SPAWNER is dispatched on spawner-structure
  // ignition (Layer 5); REMOVE_SPAWNER by the host re-validation poll when the shape
  // breaks. NEITHER is a client INTENT — host-authored + snapshot-replicated, so they go
  // in KNOWN_GAME_ACTION_TYPES_RECORD only, NOT CLIENT_INTENT_TYPES (PROTOCOL_VERSION
  // bump handled in the protocol layer).
  | RegisterSpawnerAction
  | RemoveSpawnerAction
  // S103 P2 — generic DEFENDER lifecycle (host-internal; reducers in defenders/defenderLifecycle.ts).
  // REGISTER_DEFENDER on recipe ignition; REMOVE_DEFENDER on re-validation break/teardown;
  // DEFENDER_TICK advances the auto-attack FSM. None is a client INTENT (host-authored +
  // snapshot-replicated), so they ride KNOWN_GAME_ACTION_TYPES_RECORD only — PROTOCOL 11->12.
  | RegisterDefenderAction
  | RemoveDefenderAction
  | DefenderTickAction
  // V6-1.1 — buy a gatherer from the placeholder keep. A CLIENT INTENT (a 1v1 joiner can buy);
  // the host applies it authoritatively. Reducer in gatherers/gathererLifecycle.ts. PROTOCOL bump.
  | BuyGathererAction
  // V6-1.2 — the haul cycle. GATHERER_TICK is HOST-INTERNAL (fanned out from runHostTick, never a
  // client intent); UPGRADE_GATHERER_SPEED and SET_GATHERER_PREFERENCE are CLIENT INTENTs (a joiner
  // can buy speed and re-task their own unit — both are ownership- and affordability-gated on the host).
  | GathererTickAction
  | UpgradeGathererSpeedAction
  | SetGathererPreferenceAction
  | EnqueueGathererOrderAction
  | CancelGathererOrderAction
  // S136 P1 (V6-1.3) — PULL_FROM_BANK takes one stored shape out of the castle onto the porch. A
  // CLIENT INTENT (a joiner builds from their own bank); ownership is the action's own playerId and
  // the host applies it authoritatively against ITS bank, so a stale client index simply no-ops.
  | PullFromBankAction
  // S144 P1 — click-to-build: stamps a recipe's real geometry from banked shapes.
  | BuildBlueprintAction
  | FeedTowerAction
  // S152 (R13/R19/R21) — the attrition economy. FIX re-mints exactly the shapes a structure lost;
  // SCRAP tears it down and returns exactly the shapes still standing. Both are CLIENT INTENTs (a
  // joiner repairs and scraps its own towers), both are BUILD-stage-only through the shared
  // `canBuildNow`, and both are NO-OP-never-throw — a joiner acting on a lagged snapshot names a
  // primitive that may already be rubble, and that must cost the host nothing.
  | RepairStructureAction
  | ScrapStructureAction
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
    // S147 P1 — the match clock starts with a FULL BUILD stage, so nobody can be attacked before
    // they have had a chance to build anything. `startMatch` re-stamps both at the PLAYING edge.
    matchPhase: 'BUILD',
    phaseEndsAtTick: PHASE_DURATION_TICKS,
    // S148 P1 — a fresh world is the SOLO/1v1 pitch. `applyStartGame` re-stamps this from the real
    // seat count at the PLAYING edge (`layoutForSeatCount`), exactly as it re-stamps the clock above.
    // The default matters because `makeWorld`'s test contract starts in PLAYING without ever calling
    // START_GAME, and a `layout` of `undefined` would put every castle anchor at NaN.
    layout: 'PITCH_2P',
    nextPrimitiveId: 0,
    nextBondId: 0,
    // S146 P2 — descending negative allocator for reducer-minted (pulled) sparks. See worldTypes.
    nextPulledSparkId: -1,
    lastWinnerId: null,
    effects: [],
    scoreProgress: 0,
    scoreByPlayer: new Map(),
    cinematicsEnabled: true,
    gameMode: 'solo',
    isHost: true,
    activeCinematicPlayerId: null,
    currentCinematicEvent: null,
    cinematicIsFirstShowing: false, // S158 P5 — set per-trigger by applyGodlyTrigger
    pendingCinematics: [],
    creatures: new Map(),
    // S155 N1 — transient; opened + swept inside runHostTick only.
    pendingCreatureDeaths: null,
    nextCreatureId: 0,
    // S100 P1 (TD Phase 1a) — host-authoritative creature spawners; empty at world birth.
    creatureSpawners: new Map(),
    nextSpawnerId: 0,
    // S103 P2 — host-authoritative generic defenders; empty at world birth.
    defenders: new Map(),
    nextDefenderId: 0,
    // V6-1.1 — player-owned gatherers; empty at world birth (bought from the keep).
    gatherers: new Map(),
    // S136 P1 (V6-1.3) — per-seat castle bank; seats are populated lazily on first deposit.
    castleBanks: new Map(),
    gathererOrders: new Map(), // S141 P2 (V6-1.4) — the per-player ordered build queue
    nextGathererId: 0,
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
      intentThrottled: 0,
    },
    localPlayerId: asPlayerId(0),
    botSeats: new Set(),
    // S93 — NONET event: no trial active, not yet fired this match.
    sudoku: null,
    sudokuFiredThisMatch: false,
    waveNumber: 1, // S157 B8 — the opening BUILD is wave 1
    // S97 P5 — per-type godly guard: no godly type fired yet this match.
    godlyFiredThisMatch: new Set(),
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

    // V6-RISK(R5): this reducer DESTROYS seven entity families at t=0 of the win, spawners and
    // defenders included. A castle / gatherer / bank added to the teardown list below therefore
    // VANISHES at second 0 of the planned 28-second V6-3.1 endgame ceremony — which makes it a
    // **V6-1.2 decision, not a V6-3.1 one**: whoever adds those families must decide here whether
    // they survive into WIN/POSTGAME. See BACKLOG CARRY-FORWARD LEDGER.
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
      // S100 P1 (TD Phase 1a) — and creature spawners (a lingering spawner would keep minting
      // chewers + accruing income onto the win screen / into the next match).
      teardownSpawners(world);
      // S103 P2 — and defenders (a lingering turret/HELGA would keep firing onto the win screen).
      teardownDefenders(world);
      // V6-1.1 (R5 decision) — and gatherers: they get NO endgame-ceremony role in V6-1.1, so tear
      // them down on the PLAYING->WIN edge like the hazards. Revisit if V6-3.1 wants them to linger.
      teardownGatherers(world);
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

    case 'RAID_TARGET': {
      /*
       * ⭐ S152 P1 (owner R78) — A RAID IS A 2-ATK HIT, AND THAT IS THE ENTIRE RULE.
       *
       * Owner: *"a raid point is basically a 2atk hit. you can use it on units and it will hit them
       * (if they are in the >2defensive points range then they will die) ... and also if you use
       * raid on a structure/connector it will leave the RAIDED cloud"*.
       *
       * ⭐ THERE IS NO THRESHOLD SPECIAL CASE, AND THAT IS THE DESIGN. The owner's "if they are in
       * the >2defensive points range then they will die" is not a rule to implement — it FALLS OUT
       * of putting 10 fifths into the same pool arithmetic every other hit uses. Writing a
       * defence-comparison here would duplicate the ladder and then drift from it.
       *
       * ⚠ WHAT CHANGED FROM S102's `RAID_CREATURE`, ALL OWNER-DIRECTED:
       *   · 1 ATK → 2 ATK (`RAID_ATK`), so 5 fifths → 10;
       *   · paid with a RAID POINT, not a disruption charge (a separate currency — R78 names it);
       *   · the chewers-only restriction (`sourceSpawnerId !== null`) is GONE — R78 says "units";
       *   · connectors are targetable, which S102 could not express at all.
       */
      const raider = world.players.get(action.playerId);
      if (raider === undefined) return world;
      if (raider.raidPoints < 1) return world;

      // ⛔ EVERY GATE RUNS BEFORE THE POINT IS SPENT. Same atomicity rule `applyFeedTower` and
      // `applyBuildBlueprint` document: "paid but got nothing" must be unrepresentable, because
      // carry-forward CF1 is a live bug of exactly that shape on the ?worker=1 path.
      const damage = attackFifths(RAID_ATK, RAID_PEN);

      if (action.target.kind === 'creature') {
        const target = world.creatures.get(action.target.id);
        if (target === undefined) return world;
        if (target.ownerPlayerId === action.playerId) return world; // enemy-only — never your own
        // ⚠ POSITION CAPTURED BEFORE THE HIT. `damageEntity` removes the creature when it dies, so
        // reading `target.pos` afterwards reads a corpse that is already out of the map — and the
        // cloud's whole job is marking WHERE THE UNIT STOOD.
        const pos = { x: target.pos.x, y: target.pos.y };
        raider.raidPoints--;
        const killed = damageEntity(world, { kind: 'creature', id: action.target.id }, damage, 'player');
        world.effects.push({ kind: 'RAIDED', tick: world.tick, pos, color: raider.color, killed });
        return world;
      }

      // ── CONNECTOR ─────────────────────────────────────────────────────────────────────────────
      const bond = world.bonds.get(action.target.id);
      if (bond === undefined) return world;
      // Enemy-only, on the same principle as the creature arm. A bond has no owner field, so
      // ownership is read off the primitives it joins — `placerColor` is the placing seat's colour.
      const aOwner = world.primitives.get(bond.aId)?.placedBy;
      const bOwner = world.primitives.get(bond.bId)?.placedBy;
      if (aOwner === action.playerId || bOwner === action.playerId) return world;
      // Midpoint: a connector has no single position, and the cloud must land ON the thing that
      // was hit rather than at one arbitrary endpoint.
      const pos = {
        x: (bond.a.pos.x + bond.b.pos.x) / 2,
        y: (bond.a.pos.y + bond.b.pos.y) / 2,
      };
      raider.raidPoints--;
      /*
       * ⚠ `damageConnector` RETURNS "SHOULD SEVER" AND DOES NOT SEVER. Severance must run through
       * the one `SEVER_BOND` path — it splits topology, emits SEVER_ERASE before the mutation and
       * BOND_SEVERED after, and settles charges. Re-dispatching from inside a reducer is the
       * established, Council-sanctioned exception here (`applyCreatureAttack` does exactly this,
       * and `applyFeedTower` re-dispatches SPAWN_CREATURE), and JS being single-threaded makes the
       * synchronous re-entry safe.
       *
       * ⭐ AND THIS IS WHY A RAID CANNOT ALWAYS CUT. Capacity is `connectorCount + 4` fifths, so 10
       * fifths severs only while the component has ≤6 connectors. A big lattice absorbs raids —
       * which is the incentive owner R76 asked for, not a bug to tune away.
       */
      const shouldSever = damageConnector(world, action.target.id, damage);
      if (shouldSever) {
        dispatch(world, {
          type: 'SEVER_BOND',
          bondId: action.target.id,
          playerId: action.playerId,
          // ⛔ 'raid', NOT 'player'. A 'player' sever is a PURCHASE gated on disruption charges;
          // this one was already paid for with a raid point and is a CONSEQUENCE of damage
          // reaching capacity. 'player' made a fully-damaged connector silently refuse to break
          // for want of a currency the raider never needed — found by raid.test.ts, which is
          // exactly why that test builds real topology instead of stubbing a bond.
          cause: 'raid',
        });
      }
      world.effects.push({
        kind: 'RAIDED',
        tick: world.tick,
        pos,
        color: raider.color,
        killed: shouldSever,
      });
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

    // S113 Batch C — lightning-drone building reducers.
    case 'DRONE_EXPLODE':
      return applyDroneExplode(world, action);

    case 'SUICIDE_BLAST':
      return applySuicideBlast(world, action);

    case 'STRUCTURE_SELFDESTRUCT':
      return applyStructureSelfDestruct(world, action);

    case 'DISSIPATE_POTATO':
      return applyDissipatePotato(world, action);

    // S75 P3 — rainbow color-shuffle lifecycle (reducers in rainbowLifecycle.ts).
    case 'SPAWN_RAINBOW':
      return applySpawnRainbow(world, action);

    case 'TRIGGER_RAINBOW':
      return applyTriggerRainbow(world, action);

    case 'DISSIPATE_RAINBOW':
      return applyDissipateRainbow(world, action);

    // S100 P1 (TD Phase 1a) — creature-spawner lifecycle (reducers in spawners/spawnerLifecycle.ts).
    case 'REGISTER_SPAWNER':
      return applyRegisterSpawner(world, action);

    case 'REMOVE_SPAWNER':
      return applyRemoveSpawner(world, action);

    // S103 P2 — generic defender lifecycle (reducers in defenders/defenderLifecycle.ts).
    case 'REGISTER_DEFENDER':
      return applyRegisterDefender(world, action);

    case 'REMOVE_DEFENDER':
      return applyRemoveDefender(world, action);

    case 'DEFENDER_TICK':
      return applyDefenderTick(world, action);

    // V6-1.1 — buy a gatherer from the placeholder keep (spend victory points, mint one unit).
    case 'BUY_GATHERER':
      return applyBuyGatherer(world, action);

    case 'GATHERER_TICK':
      return applyGathererTick(world, action);

    case 'UPGRADE_GATHERER_SPEED':
      return applyUpgradeGathererSpeed(world, action);

    case 'PULL_FROM_BANK':
      return applyPullFromBank(world, action);

    // S144 P1 — BUILD_BLUEPRINT. NO-OP-never-throw like PULL_FROM_BANK: it is a CLIENT INTENT and a
    // joiner can raise it against a stale view of its own bank.
    case 'BUILD_BLUEPRINT':
      return applyBuildBlueprint(world, action);

    // ⭐ S151 P3 — FEED_TOWER. Same posture as BUILD_BLUEPRINT: a client INTENT, host-authoritative,
    // and every gate returns before the shape is debited (see the reducer's atomicity note).
    case 'FEED_TOWER':
      return applyFeedTower(world, action);

    // S152 — FIX / SCRAP. Same posture as BUILD_BLUEPRINT above: client INTENTs, host-authoritative,
    // no-op-never-throw. R19 (BUILD-stage only) is enforced inside, through the shared `canBuildNow`
    // rather than a second phase check here — see buildLegality.ts for why that matters.
    case 'REPAIR_STRUCTURE':
      return applyRepairStructure(world, action);

    case 'SCRAP_STRUCTURE':
      return applyScrapStructure(world, action);

    case 'SET_GATHERER_PREFERENCE':
      return applySetGathererPreference(world, action);

    // S141 P2 (V6-1.4) — the gatherer ORDER QUEUE (owner ruling B4). Both are CLIENT INTENTs and both
    // are NO-OP-never-throw, so a joiner acting on a stale view of its own queue simply changes
    // nothing rather than killing the host's dispatch loop.
    case 'ENQUEUE_GATHERER_ORDER':
      return applyEnqueueGathererOrder(world, action);

    case 'CANCEL_GATHERER_ORDER':
      return applyCancelGathererOrder(world, action);

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

