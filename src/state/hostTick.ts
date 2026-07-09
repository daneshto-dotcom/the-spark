/**
 * SPARK — S119 P1 (B2 phase a): the host's authoritative per-tick sim body,
 * extracted VERBATIM from main.ts's ticker drain loop (provenance: 840f31f,
 * main.ts ~1109–1641) into a DOM/Pixi-free unit. This is the worker-sim
 * milestone's (a)-phase (WORKER_SIM_FOUNDATION.md): everything in here may
 * one day run inside a Web Worker, so this module MUST NOT import from
 * render/ or touch DOM/Pixi/transport objects.
 *
 * WHAT MOVED (byte-identical by construction — see hostTick.differential.test.ts):
 *   stepPhysics → tickScoring → tickGameState → NONET trigger sweep →
 *   pendingCreatureSpawn / bomb / spawner / defender polls → creature fan-out →
 *   bots → hunter orchestration → potato / rainbow / seagull / poop polls →
 *   DROP-BENCH sweep → DEV invariant check.
 *
 * WHAT DID NOT MOVE (stays in main.ts's loop, on purpose):
 *   • the NONET-freeze branch (its `continue` semantics belong to the drain loop);
 *   • the SHARED tail watchers (ENDGAME send, PLAYING-edge music/preload,
 *     TITLE-edge teardown, lastGameState) — they run for BOTH host and client,
 *     so they are main-thread orchestration, not host sim (Council S119 R2);
 *   • screenShake.trigger at creature attack-fire — replaced by a post-drain
 *     ARC_FLASH effects-scan in main.ts (the exact pattern the CLIENT has used
 *     since S31; render-identical because nothing renders mid-drain and
 *     ScreenShake.trigger has replace-not-stack semantics).
 *
 * SUBSTITUTIONS vs the original (each Council-reviewed, S119 Battle Ledger):
 *   • every `!isClient` conjunct dropped — this function is only called on the
 *     host/solo path, where isClient === false, so the conjunct was provably true;
 *   • `session.netTransport.peerIds()` (read per tick) → deps.alivePeerIds
 *     (computed once per frame by the caller). Equivalent: JS is single-threaded
 *     and the drain loop is synchronous, so the transport's peer set cannot
 *     change between ticks of one frame (empirically re-verified per-tick-vs-
 *     per-frame in hostTick.differential.test.ts);
 *   • closure vars (peerAbsentSinceTick, invariantSnap, lastViolationLogTick)
 *     → explicit HostTickState struct (no hidden closures — worker-serializable).
 */

import {
  DRONE_EMIT_INTERVAL_TICKS,
  HUNTER_TRIGGER_SCORE,
  PEER_DROP_BENCH_TICKS,
  PEER_DROP_GRACE_TICKS,
  REVALIDATE_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
  STRUCTURE_SELFDESTRUCT_DRONE_COUNT,
  STRUCTURE_SELFDESTRUCT_RADIUS,
} from '../constants.ts';
import type { BotManager } from '../bots/botManager.ts';
import type { Spawner } from '../game/spawner.ts';
import {
  snapshotInvariants,
  verifyInvariants,
  type InvariantSnapshot,
} from '../game/invariants.ts';
import type { Controls } from '../input/controls.ts';
import { computeStubTargetPos } from '../physics/creatureVerlet.ts';
import { stepPhysics } from '../physics/physicsLoop.ts';
import type { SpatialGrid } from '../physics/spatial.ts';
import {
  bondMidpoint,
  findNearestBondTarget,
  findNearestEnemyCreature,
  isWithinAttackRange,
} from './creatures/creatureAI.ts';
import { underChewerCaps } from './creatures/creatureLifecycle.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { recipeStillSatisfied as defenderRecipeStillSatisfied } from './defenders/defenderLifecycle.ts';
import { underDroneCaps } from './droneLifecycle.ts';
import { awardSpawnerKillReward } from './gameMode.ts';
import { tickGameState, type GameStateExtras } from './gameState.ts';
import { shouldCookOffInHand } from './potatoLifecycle.ts';
import { tickScoring } from './scoring.ts';
import { canAvatarCleanSplat } from './seagulls/seagullLifecycle.ts';
import { recipeStillSatisfied } from './spawners/spawnerLifecycle.ts';
import { detectNonet, mintNonetSeed, startSudoku } from './sudokuEvent.ts';
import { dispatch, isNetworked, type World } from './world.ts';
import { asPlayerId, type PlayerId } from '../types.ts';

// Human is always seat 0 (mirrors main.ts's module const of the same name —
// the BotManager comment documents the invariant).
const P1 = asPlayerId(0);

// S100 P1 (TD Phase 1a, Layer 4) — mandatory perf mitigation (§3.4 R7): a CHEWER
// re-selects its SEEKING target only every K ticks, phase-spread across the swarm by
// `world.tick % K === creature.id % K` so the O(creatures×bonds) target scans don't all
// land on the same tick. Tick-deterministic (pure fn of world.tick + creature.id — NO
// wall-clock, NO RNG), so the replay byte-equivalence holds. VOLTKIN is unaffected: it
// keeps its every-tick re-selection (Council R1 Q3 UNANIMOUS A) byte-for-byte — the
// throttle is gated on `sourceSpawnerId != null` only. K=6 ≈ the 10 Hz snapshot cadence,
// so a chewer re-aims at most ~once per emitted snapshot frame (imperceptible in transit).
// (Moved here with the creature fan-out, S119 P1.)
const CHEWER_SEEK_RESELECT_TICKS = 6;

/** Everything the host tick needs from the main thread, as plain data/handles. */
export interface HostTickDeps {
  spawner: Spawner;
  grid: SpatialGrid;
  controls: Controls;
  /** Null until a VS-BOTS match starts (lazy chunk); read fresh per frame. */
  botManager: BotManager | null;
  gameStateExtras: GameStateExtras;
  /**
   * Transport-alive peer ids, computed ONCE per frame by the caller
   * (`new Set(netTransport.peerIds())`), or null when there is no transport.
   * Single-threaded JS ⇒ per-frame is equivalent to the per-tick read the
   * pre-S119 inline code did (nothing can mutate the peer set mid-drain).
   */
  alivePeerIds: ReadonlySet<string> | null;
  /** The host's frozen peerId→seat map (session.hostSeats). */
  hostSeats: ReadonlyMap<string, PlayerId>;
}

/** Mutable cross-tick state owned by the host tick (was main.ts closure vars). */
export interface HostTickState {
  /** S82 P4(c) — first-absent-tick per peer for the DROP-BENCH grace window. */
  peerAbsentSinceTick: Map<string, number>;
  /** DEV invariant-probe snapshot of the previous tick's primitives. */
  invariantSnap: InvariantSnapshot;
  /** DEV invariant-probe log throttle (≤1 error line per 60 ticks). */
  lastViolationLogTick: number;
}

export function makeHostTickState(world: World): HostTickState {
  return {
    peerAbsentSinceTick: new Map<string, number>(),
    invariantSnap: snapshotInvariants(world.primitives),
    lastViolationLogTick: -Infinity,
  };
}

/**
 * One host/solo fixed-step sim tick. Caller contract (main.ts drain loop):
 *   • call ONLY when `isClient === false` (networked client never simulates);
 *   • the NONET-freeze branch (world.sudoku !== null during PLAYING) must be
 *     handled BEFORE this call (main.ts `continue`s past the whole tick);
 *   • advances world.tick exactly once (inside stepPhysics when PLAYING,
 *     manually otherwise — byte-identical to the pre-S119 inline paths).
 */
export function runHostTick(world: World, deps: HostTickDeps, state: HostTickState): void {
  if (world.gameState === 'PLAYING') {
    stepPhysics(world, deps.spawner, deps.grid, deps.controls);
  } else {
    world.tick++;
  }
  // S76 P3 — host-only complexity-income accrual. Runs BEFORE the WIN check
  // (tickGameState) and the hunter 75% trigger below so both observe this tick's
  // freshly-accrued scoreProgress. The client never accrues (host-authoritative); it
  // reads scoreProgress from the NetSnapshot. Gated on PLAYING.
  if (world.gameState === 'PLAYING') {
    tickScoring(world);
  }
  tickGameState(world, deps.gameStateExtras, P1);

  // S94 — NONET trigger sweep (host-only, once/match): a connected component of EXACTLY 9
  // shapes of ONE type summons the trial. Per-tick sweep (cheap — comparable to tickScoring's
  // own per-tick prim/bond walk; the once-per-match guard skips it after firing) so it catches
  // the structure forming by PLACEMENT or by ERASING down to 9 of a single type (user tactic).
  if (
    world.gameState === 'PLAYING' &&
    world.sudoku === null &&
    !world.sudokuFiredThisMatch
  ) {
    const nonetOwner = detectNonet(world);
    if (nonetOwner !== null) startSudoku(world, nonetOwner, mintNonetSeed(world));
  }

  // S28 P0 — Step 0 (tick-deterministic pending creature spawn poll).
  // Replaces S25's `onCinematicHandoff` wall-clock setTimeout in
  // cutsceneOverlay.ts (S25 reflexion #6 lesson: never mutate world from
  // wall-clock setTimeout — replay breaks). Council Q2 UNANIMOUS A single-
  // slot pendingCreatureSpawn. Host-only (client never holds a pending
  // schedule — its creatures Map is rehydrated via NetSnapshot v2 inside
  // applySnapshotCore). Boundary uses `>=` per S27 reflexion #6: integer-
  // boundary checks must clear the equality case.
  if (
    world.gameState === 'PLAYING' &&
    world.pendingCreatureSpawn !== null &&
    world.tick >= world.pendingCreatureSpawn.fireAtTick
  ) {
    const { event } = world.pendingCreatureSpawn;
    world.pendingCreatureSpawn = null;
    const spawnTargetPos = computeStubTargetPos(world.tick, event.triggererPlayerId);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: event.triggererPlayerId,
      pos: { x: event.targetPos.x, y: event.targetPos.y },
      targetPos: spawnTargetPos,
    });
  }

  // S71 P1 — bomb dissipation poll (host-only, tick-deterministic). An
  // un-grabbed bomb is removed HARMLESSLY when its TTL elapses (no detonation).
  // Snapshot the entries first (DISSIPATE_BOMB deletes from the Map). Cheap
  // no-op when no bombs. Runs after the creature poll, before the creature
  // fan-out — order-independent (idempotent delete + skip-if-missing detonate).
  if (world.gameState === 'PLAYING' && world.bombs.size > 0) {
    for (const [bombId, bomb] of [...world.bombs]) {
      if (world.tick >= bomb.dissipateAtTick) {
        dispatch(world, { type: 'DISSIPATE_BOMB', bombId });
      }
    }
  }

  // S100 P1 (TD Phase 1a, Layer 4) — creature-spawner emit + re-validation poll
  // (host-only, tick-deterministic). Modeled on the bomb-dissipate poll above and
  // the pendingCreatureSpawn one-shot poll — NOT game/spawner.ts (its dtSec wall-
  // clock cadence + 5 RNG streams are the S25 replay-break class). NO 6th RNG
  // stream: cadence + re-validation are pure fns of world.tick.
  //
  // For each live spawner:
  //   (a) THROTTLED re-validation (every REVALIDATE_INTERVAL_TICKS via the
  //       lastValidatedTick cache, §3.4): if the anchor primitive is gone OR its
  //       current component no longer satisfies the recipe → REMOVE_SPAWNER and
  //       skip — the income bonus + chewer cadence stop instantly (the counterplay).
  //   (b) EMIT: when world.tick >= nextSpawnTick AND the chewer caps allow, dispatch
  //       SPAWN_CREATURE{creatureType:'chewer', sourceSpawnerId:id} at the anchor's
  //       LIVE position, then advance the cadence by `+=` (NOT `= tick + interval`)
  //       so emit timing never drifts. Snapshot the entries first (REMOVE_SPAWNER
  //       deletes from the Map mid-loop, mirroring the bomb-dissipate snapshot).
  if (world.gameState === 'PLAYING' && world.creatureSpawners.size > 0) {
    for (const [spawnerId, sp] of [...world.creatureSpawners]) {
      if (world.tick - sp.lastValidatedTick >= REVALIDATE_INTERVAL_TICKS) {
        sp.lastValidatedTick = world.tick;
        if (!world.primitives.has(sp.anchorPrimitiveId) || !recipeStillSatisfied(world, sp)) {
          // S100 P1 (Layer 6) — destruction (NOT teardown): award the one-shot raid
          // reward split across enemies BEFORE removing the record (awardSpawnerKillReward
          // reads sp.ownerPlayerId). teardownSpawners clears the map directly and never
          // reaches this branch, so a match-end / title-return mints nothing.
          awardSpawnerKillReward(world, sp);
          dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId });
          continue;
        }
      }
      // S109 P2 — a pooped chewer-spawner stops emitting until the owner cleans it
      // ("shouldn't work until cleaned"). Keep the cadence aligned to NOW while fouled so a
      // cleaned spawner resumes on its normal cadence instead of dumping a backlog burst of the
      // now-overdue slots (Council C5). fouledPrimitives already round-trips → no wire bump.
      if (world.fouledPrimitives.has(sp.anchorPrimitiveId)) {
        while (world.tick >= sp.nextSpawnTick) sp.nextSpawnTick += SPAWN_INTERVAL_TICKS;
        continue;
      }
      // S113 Batch C — branch the emit on the recipe. A pentagram (the default) spawns chewers
      // (unchanged). A lightningHub spawns up to STRUCTURE_SELFDESTRUCT_DRONE_COUNT lightning
      // drones on the cadence, then on the NEXT cadence slot SELF-DESTRUCTS (a large
      // owner-agnostic AoE at the anchor) + REMOVE_SPAWNER — fired together so it is exactly-once
      // (the spawner leaves the map, so this branch is structurally unreachable again). Reusing
      // nextSpawnTick for the self-destruct delay gives the 3rd drone a full cadence to fly out.
      if (sp.recipeId === 'lightningHub') {
        if (world.tick >= sp.nextSpawnTick) {
          const anchor = world.primitives.get(sp.anchorPrimitiveId);
          if (sp.spawnedCount >= STRUCTURE_SELFDESTRUCT_DRONE_COUNT) {
            if (anchor !== undefined) {
              dispatch(world, {
                type: 'STRUCTURE_SELFDESTRUCT',
                pos: { x: anchor.pos.x, y: anchor.pos.y },
                radius: STRUCTURE_SELFDESTRUCT_RADIUS,
              });
            }
            dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId });
          } else if (anchor !== undefined && underDroneCaps(world, spawnerId)) {
            dispatch(world, {
              type: 'SPAWN_CREATURE',
              creatureType: 'lightningDrone',
              ownerPlayerId: sp.ownerPlayerId,
              // The drone spawns at the hub; the fan-out picks its nearest-enemy-bond target the
              // first SEEKING tick (targetPos is a harmless anchor seed until then).
              pos: { x: anchor.pos.x, y: anchor.pos.y },
              targetPos: { x: anchor.pos.x, y: anchor.pos.y },
              sourceSpawnerId: spawnerId,
            });
            sp.nextSpawnTick += DRONE_EMIT_INTERVAL_TICKS;
            sp.spawnedCount++;
          }
        }
      } else if (world.tick >= sp.nextSpawnTick && underChewerCaps(world, spawnerId)) {
        const anchor = world.primitives.get(sp.anchorPrimitiveId);
        // Defense-in-depth: a deleted anchor between the (throttled) re-validation
        // and this tick would leave `anchor` undefined — skip the emit (the next
        // re-validation tears the spawner down). The chewer SPAWNS at the anchor's
        // current position; its enemy-only target is selected by the fan-out below
        // once it transitions SPAWNING → SEEKING.
        if (anchor !== undefined) {
          dispatch(world, {
            type: 'SPAWN_CREATURE',
            creatureType: 'chewer',
            ownerPlayerId: sp.ownerPlayerId,
            pos: { x: anchor.pos.x, y: anchor.pos.y },
            // SPAWNING is force-free + has no committed target yet, so targetPos is
            // a harmless seed (the anchor); the fan-out overwrites it the first
            // SEEKING tick from findNearestBondTarget's bond midpoint.
            targetPos: { x: anchor.pos.x, y: anchor.pos.y },
            sourceSpawnerId: spawnerId,
          });
          sp.nextSpawnTick += SPAWN_INTERVAL_TICKS;
          sp.spawnedCount++;
        }
      }
    }
  }

  // S103 P2 — DEFENDER poll (host-only), mirroring the spawner poll above. Each tick:
  //   (a) revalidate (throttled per-defender by a deterministic phase slot): anchor gone OR the
  //       recipe broke (a chewer ate the structure) → REMOVE_DEFENDER (the v1 counterplay).
  //   (b) DEFENDER_TICK advances the FSM (acquire → windup → FIRE damage → recover) + pins the
  //       defender to its anchor. Snapshot entries first (REMOVE_DEFENDER mutates the map).
  if (world.gameState === 'PLAYING' && world.defenders.size > 0) {
    for (const [defenderId, d] of [...world.defenders]) {
      const did = defenderId as unknown as number;
      if (world.tick % REVALIDATE_INTERVAL_TICKS === did % REVALIDATE_INTERVAL_TICKS) {
        if (!world.primitives.has(d.anchorPrimitiveId) || !defenderRecipeStillSatisfied(world, d)) {
          dispatch(world, { type: 'REMOVE_DEFENDER', defenderId });
          continue;
        }
      }
      dispatch(world, { type: 'DEFENDER_TICK', defenderId });
    }
  }

  // S25 P0 — fan-out CREATURE_TICK to every live creature. Host-only (client
  // never simulates; S28 NetSnapshot v2 mirrors host→client creature state).
  // Snapshot the keys BEFORE iterating because applyCreatureTick auto-deletes
  // at despawnAtTick (Council R1 S25 D5 majority: auto-delete inside reducer).
  // Without the snapshot, an in-loop delete would skip subsequent ids in V8.
  //
  // S27 P0 — Voltkin Phase 2C orchestration per creature (Council R1 Q3 + Q6):
  //   1. PRE-TICK: if state==='SEEKING', re-select targetBondId via the AI
  //      module (every-tick re-selection, Q3 UNANIMOUS A). Update targetPos
  //      to the bond midpoint so existing seek/arrive steering homes in on
  //      the AI-chosen target. When no bond exists, targetBondId stays null
  //      and creature drifts toward its S26 stub targetPos (degenerate fallback).
  //   2. TICK: dispatch CREATURE_TICK. applyCreatureTick reads the fresh
  //      targetBondId to transition SEEKING → ATTACKING when in range
  //      (isWithinAttackRange check). Also handles ATTACKING → SEEKING
  //      transitions (cadence elapsed OR Δ4 wind-up bond-vanish abort).
  //   3. POST-TICK: if state==='ATTACKING' && ticksInState===FIRE_TICK (30)
  //      && targetBondId is set, dispatch CREATURE_ATTACK. The reducer
  //      validates the bond, dispatches SEVER_BOND{cause:'creature'} (Q1
  //      UNANIMOUS B central severance path), and emits ARC_FLASH visual.
  //      Q6 UNANIMOUS A: dispatch lives in the host tick (NOT in applyCreatureTick),
  //      preserving CQS "no-re-dispatch-in-reducer" for the CREATURE_TICK
  //      action specifically (applyCreatureAttack's re-dispatch of
  //      SEVER_BOND is a separate, Council-sanctioned exception).
  if (world.gameState === 'PLAYING' && world.creatures.size > 0) {
    const creatureIds = Array.from(world.creatures.keys());
    for (const id of creatureIds) {
      // Step 1: AI target re-selection BEFORE the tick. Only during SEEKING —
      // SPAWNING is force-free, ATTACKING is locked to its current target for
      // the cycle duration, DESPAWNING is fading out.
      //
      // S100 P1 (TD Phase 1a, Layer 4) — chewer vs Voltkin re-selection diverge:
      //  • VOLTKIN (sourceSpawnerId === null): UNCHANGED — every-tick re-selection
      //    (Council R1 Q3 UNANIMOUS A), default enemyOnly=false (the own-bond fallback
      //    is a Voltkin feature). This branch is byte-for-byte the pre-S100 code.
      //  • CHEWER (sourceSpawnerId !== null): (a) target-STICKINESS — once committed to
      //    a bond (chewProgress > 0) it does NOT re-select (glued to the bond per R9);
      //    (b) THROTTLE — otherwise it re-selects only every CHEWER_SEEK_RESELECT_TICKS,
      //    phase-spread by id (§3.4 R7); (c) enemyOnly=true so it never eats its own
      //    spawner (R8) + runs the FFA target-spread.
      const creature = world.creatures.get(id);
      if (creature !== undefined && creature.state === 'SEEKING' && getCreatureConfig(creature.type).selfExplode) {
        // S113 Batch C — a lightning-DRONE is a homing missile: every-tick enemy-only
        // re-selection (NOT the chewer throttle/stickiness — it never commits/chews). It then
        // DETONATES in Step 1.5 below the moment it is in blast range (or its fuse expires).
        const nextTarget = findNearestBondTarget(world, creature, true);
        creature.targetBondId = nextTarget;
        if (nextTarget !== null) {
          const targetBond = world.bonds.get(nextTarget);
          if (targetBond !== undefined) {
            const mid = bondMidpoint(targetBond);
            creature.targetPos.x = mid.x;
            creature.targetPos.y = mid.y;
          }
        }
      } else if (creature !== undefined && creature.state === 'SEEKING') {
        const isChewer = creature.sourceSpawnerId !== null;
        let doReselect: boolean;
        let enemyOnly: boolean;
        if (!isChewer) {
          doReselect = true; // Voltkin — every-tick, byte-identical
          enemyOnly = false;
        } else {
          enemyOnly = true;
          // Stickiness: committed to a bond → skip re-selection entirely.
          // Otherwise throttle the scan to a per-creature phase slot.
          doReselect =
            creature.chewProgress === 0 &&
            world.tick % CHEWER_SEEK_RESELECT_TICKS ===
              (creature.id as unknown as number) % CHEWER_SEEK_RESELECT_TICKS;
        }
        if (doReselect) {
          const nextTarget = findNearestBondTarget(world, creature, enemyOnly);
          creature.targetBondId = nextTarget;
          if (nextTarget !== null) {
            const targetBond = world.bonds.get(nextTarget);
            if (targetBond !== undefined) {
              const mid = bondMidpoint(targetBond);
              creature.targetPos.x = mid.x;
              creature.targetPos.y = mid.y;
            }
          }
        }
        // S103 #8 — Voltkin ONLY: opportunistic enemy-creature target. Bonds stay the
        // navigation target (targetPos unchanged); this just notes a chewer ALREADY within
        // attackRange so the FSM can zap it this cycle (Council MF3 — never path toward it).
        // `findNearestEnemyCreature` is range-gated + lowest-id, returns null with no enemy
        // creatures → byte-identical Voltkin (MF4). Chewers never get a creature target.
        if (!isChewer) {
          creature.targetCreatureId = findNearestEnemyCreature(world, creature);
        }
      }

      // Step 1.5: S113 Batch C — a lightning-DRONE DETONATES (skipping its CREATURE_TICK) the
      // moment it arrives within blast range of the nearest enemy connector, OR when its
      // fly-time fuse is about to expire (explode-in-place rather than silently fade). Checked in
      // SEEKING only (SPAWNING is the materialize window). DRONE_EXPLODE deletes the drone, so we
      // `continue` past the CREATURE_TICK / attack-fire steps. Runs AFTER Step 1's fresh target
      // re-selection so `isWithinAttackRange` sees this tick's nearest-enemy-bond.
      const droneCandidate = world.creatures.get(id);
      if (
        droneCandidate !== undefined &&
        droneCandidate.state === 'SEEKING' &&
        getCreatureConfig(droneCandidate.type).selfExplode
      ) {
        const inRange =
          droneCandidate.targetBondId !== null &&
          isWithinAttackRange(world, droneCandidate, droneCandidate.targetBondId);
        const fuseExpiring = world.tick >= droneCandidate.despawnAtTick - 1;
        if (inRange || fuseExpiring) {
          dispatch(world, { type: 'DRONE_EXPLODE', creatureId: id });
          continue;
        }
      }

      // Step 2: FSM tick.
      dispatch(world, { type: 'CREATURE_TICK', creatureId: id });

      // Step 3: post-tick attack fire check. Re-fetch creature (the tick may
      // have transitioned state OR auto-deleted at despawnAtTick boundary).
      //
      // S100 P1 (TD Phase 1a, Layer 4) — the FIRE tick is read from the creature's
      // config (was the Voltkin-only VOLTKIN_ATTACK_FIRE_TICK module const). Voltkin's
      // config.attackFireTick is still 30 (byte-identical); a chewer's is 300 (its
      // FINAL, 5th chew — chewHits × CHEW_INTERVAL_TICKS), so the SEVER_BOND dispatch
      // lands exactly when the chew completes (R9). Both creatures stay in ATTACKING
      // when this fires; the chewer's FSM then releases the commit next tick (the
      // bond-gone branch), Voltkin recovers via its cadence bounce.
      const after = world.creatures.get(id);
      if (
        after !== undefined &&
        after.state === 'ATTACKING' &&
        after.ticksInState === getCreatureConfig(after.type).attackFireTick &&
        (after.targetCreatureId !== null || after.targetBondId !== null)
      ) {
        // S103 #8 — creature-FIRST: a Voltkin zaps an in-range enemy creature this cycle if
        // it has one (the chewer right next to it is the immediate threat), else severs its
        // committed bond target. Chewers never set targetCreatureId, so they always sever.
        if (after.targetCreatureId !== null) {
          dispatch(world, {
            type: 'CREATURE_ATTACK',
            creatureId: id,
            bondId: null,
            targetCreatureId: after.targetCreatureId,
          });
        } else {
          dispatch(world, {
            type: 'CREATURE_ATTACK',
            creatureId: id,
            bondId: after.targetBondId,
          });
        }
        // S30 P0e / S33 P1-6 — the screen-shake trigger that lived here moved to
        // main.ts's post-drain ARC_FLASH scan (S119 P1): shake is render-side, and
        // nothing renders mid-drain, so scanning world.effects once after the loop
        // is render-identical (the CLIENT has used exactly that pattern since S31).
      }
    }
  }

  // S87 — VS-BOTS: bots think + act (host-only by construction — bots mode
  // has no client). Runs BEFORE the hunter/hazard polls so a bot's
  // UPDATE_AVATAR_POS lands this tick and the hunter chases fresh
  // positions, mirroring the human input path (controls write the cursor
  // before stepPhysics). Every bot action flows through dispatch(), so
  // bench/poop/reach/territory gates bind bots exactly like remote humans.
  if (world.gameState === 'PLAYING' && deps.botManager !== null) {
    deps.botManager.tick(world);
  }

  // S72 P2 — Pac-Man hunter orchestration (host-only). (a) Trigger ONCE when the
  // leader first reaches 75% (HUNTER_TRIGGER_SCORE); applySpawnHunter sets
  // world.hunterSpawned so it never re-fires this game. (b) Fan out HUNTER_TICK
  // per hunter (after the creature loop) — applyHunterTick steers + runs the FSM
  // + catches inline. Snapshot the keys first (a tick may delete on escape /
  // chomp-end). (c) Bench-expiry sweep: clear benchedUntilTick once world.tick
  // passes it (tidiness; isInputLocked + avatarRenderer already self-heal on the
  // tick compare — Council R5).
  if (world.gameState === 'PLAYING') {
    if (!world.hunterSpawned && Math.floor(world.scoreProgress) >= HUNTER_TRIGGER_SCORE) {
      dispatch(world, { type: 'SPAWN_HUNTER' });
    }
    if (world.hunters.size > 0) {
      for (const hid of Array.from(world.hunters.keys())) {
        dispatch(world, { type: 'HUNTER_TICK', hunterId: hid });
      }
    }
    for (const player of world.players.values()) {
      if (player.benchedUntilTick !== undefined && world.tick >= player.benchedUntilTick) {
        player.benchedUntilTick = undefined;
      }
    }
  }

  // S72 P3 — potato poll (host-only, beside the bomb dissipate). For each potato:
  // (a) CARRIED → sync pos to the carrier's avatar (the uniform blast center); if the
  //     carrier vanished (disconnect / eliminate) → FORCE-DETONATE at the last pos
  //     ("cooks off if its carrier vanishes" — no orphan; deterministic in-loop, no
  //     net-handler hook). (a2) S81 P2 — held >3s since the grab → cooks off IN HAND
  //     (shouldCookOffInHand; per-grab window, real hot potato — pass it or eat the
  //     bench). (b) tick >= detonateAtTick (from-SPAWN fuse) → DETONATE.
  // Snapshot the entries first (DETONATE deletes from the Map).
  if (world.gameState === 'PLAYING' && world.potatoes.size > 0) {
    for (const [potatoId, potato] of [...world.potatoes]) {
      if (potato.state === 'CARRIED' && potato.carrierId !== null) {
        const carrier = world.players.get(potato.carrierId);
        if (carrier === undefined) {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
          continue;
        }
        potato.pos.x = carrier.avatarPos.x;
        potato.pos.y = carrier.avatarPos.y;
        if (shouldCookOffInHand(potato, world.tick)) {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
          continue;
        }
      }
      if (world.tick >= potato.detonateAtTick) {
        // S78 — a FREE (never-engaged) potato DISSIPATES harmlessly at fuse-time instead of
        // detonating: it was clogging the spawn-zone centre with "random" explosions nobody
        // triggered (user report). CARRIED (cooked-off-in-hand) + ARMED (planted) still detonate,
        // so the hot-potato mechanic is intact; an un-touched one just quietly rots.
        if (potato.state === 'FREE') {
          dispatch(world, { type: 'DISSIPATE_POTATO', potatoId });
        } else {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
        }
      }
    }
  }

  // S75 P3 — rainbow dissipate poll (host-only; mirror the bomb dissipate). An un-clicked
  // rainbow is removed HARMLESSLY when its TTL elapses (no colour-shuffle). Snapshot the
  // entries first (DISSIPATE_RAINBOW deletes from the Map). Cheap no-op when none.
  if (world.gameState === 'PLAYING' && world.rainbows.size > 0) {
    for (const [rainbowId, rainbow] of [...world.rainbows]) {
      if (world.tick >= rainbow.dissipateAtTick) {
        dispatch(world, { type: 'DISSIPATE_RAINBOW', rainbowId });
      }
    }
  }

  // S77 P3 — seagull + poop orchestration (host-only). (a) fan out SEAGULL_TICK per gull
  // (advance + drop poop + despawn off-screen); (b) fan out POOP_TICK per poop (fall +
  // collide + TTL); (c) CLEAN a structure-splat when its anchor prim is gone (orphan sweep)
  // OR the structure OWNER's avatar is within POOP_CLEAN_RADIUS (host-detected — NO client
  // intent; S81 P1 owner-only — canAvatarCleanSplat). Snapshot the keys first (a tick may
  // delete from the Map mid-iteration).
  // S80 — size>0 gates match the bomb/potato/rainbow poll idiom (those blocks already
  // guard), skipping three per-tick array allocations in the common no-hazard case.
  if (world.gameState === 'PLAYING' && world.seagulls.size > 0) {
    for (const sid of Array.from(world.seagulls.keys())) {
      dispatch(world, { type: 'SEAGULL_TICK', seagullId: sid });
    }
  }
  if (world.gameState === 'PLAYING' && world.poops.size > 0) {
    for (const pid of Array.from(world.poops.keys())) {
      dispatch(world, { type: 'POOP_TICK', poopId: pid });
    }
    for (const [poopId, poop] of [...world.poops]) {
      if (poop.state !== 'SPLAT_STRUCTURE') continue;
      if (poop.fouledPrimId === undefined || !world.primitives.has(poop.fouledPrimId)) {
        dispatch(world, { type: 'CLEAN_POOP', poopId }); // orphan: anchor prim was destroyed
        continue;
      }
      for (const player of world.players.values()) {
        // Predicate (seagullLifecycle.canAvatarCleanSplat): not benched (S80 — a frozen
        // hidden avatar must not passively wipe), OWNER of the fouled structure (S81 P1 —
        // an enemy walk-over no longer cleans your splat), and within POOP_CLEAN_RADIUS.
        if (canAvatarCleanSplat(world, player, poop)) {
          dispatch(world, { type: 'CLEAN_POOP', poopId });
          break;
        }
      }
    }
  }

  // S82 P4(c) — mid-game DROP-BENCH sweep (6p hardening; host-only). A seated peer
  // absent from the transport past PEER_DROP_GRACE_TICKS stops ghosting: its player
  // is benched via a rolling re-stamp (benchedUntilTick = tick + PEER_DROP_BENCH_TICKS
  // EVERY tick while absent). Self-healing: the instant the peer rejoins (same
  // in-page selfId → same frozen seat) the re-stamp stops and the bench expires
  // within 2s — no unbench action, no reconnect/bench race (Council S82 Gemini R1#9).
  if (
    world.gameState === 'PLAYING' &&
    isNetworked(world) &&
    deps.hostSeats.size > 0 &&
    deps.alivePeerIds !== null
  ) {
    const present = deps.alivePeerIds;
    for (const [peerId, seat] of deps.hostSeats) {
      if (present.has(peerId)) {
        state.peerAbsentSinceTick.delete(peerId);
        continue;
      }
      const since = state.peerAbsentSinceTick.get(peerId);
      if (since === undefined) {
        state.peerAbsentSinceTick.set(peerId, world.tick);
      } else if (world.tick - since >= PEER_DROP_GRACE_TICKS) {
        dispatch(world, {
          type: 'BENCH_OFFLINE_PLAYER',
          playerId: seat,
          untilTick: world.tick + PEER_DROP_BENCH_TICKS,
        });
      }
    }
  } else if (state.peerAbsentSinceTick.size > 0) {
    state.peerAbsentSinceTick.clear();
  }

  if (import.meta.env.DEV && world.gameState === 'PLAYING') {
    const violations = verifyInvariants(world.primitives, world.freeSparks, state.invariantSnap);
    if (violations.length > 0 && world.tick - state.lastViolationLogTick > 60) {
      console.error('[SPARK] invariant violation tick=' + world.tick, violations);
      state.lastViolationLogTick = world.tick;
    }
    state.invariantSnap = snapshotInvariants(world.primitives);
  }
}
