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
  CHEW_INTERVAL_TICKS,
  DRONE_EMIT_INTERVAL_TICKS,
  HUNTER_TRIGGER_SCORE,
  PEER_DROP_BENCH_TICKS,
  PEER_DROP_GRACE_TICKS,
  phaseDurationTicks,
  REVALIDATE_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
  STRUCTURE_SELFDESTRUCT_RADIUS,
  GOBLIN_UNIT_ACQUIRE_RADIUS,
  GOBLIN_UNIT_LEASH_RADIUS,
  GOBLIN_SPREAD_RADIUS,
  STINK_BAG_AGGRO_RADIUS, // S159 P1 — the AGGRO half of R77's landed bag
} from '../constants.ts';
import type { BotManager } from '../bots/botManager.ts';
import type { Spawner } from '../game/spawner.ts';
import {
  snapshotInvariants,
  verifyInvariants,
  type InvariantSnapshot,
} from '../game/invariants.ts';
import type { ControlsLike } from '../input/controlsCore.ts';
import { computeStubTargetPos } from '../physics/creatureVerlet.ts';
import { stepPhysics } from '../physics/physicsLoop.ts';
import {
  bondMidpoint,
  findNearestBondTarget,
  findNearestEnemyCreature,
  pickNavUnit,
  enemyCastleInReach,
  isRetreatWindow,
  ownHomePos,
  spreadTargetPos,
  standoffTargetPos,
  enemyCastleMarchPos,
  findNearestEnemyPrimitiveFrom,
  isWithinAttackRange,
  killableDefenderInReach, // S158 P7 — the fifth strike clause (CF-S157-c)
  enemyStinkCloudInReach, // S158 A2 — the sixth: a destructible landed bag (R77)
  nearestEnemyStinkCloudWithin, // S159 P1 — and the bag a unit should WALK to (R77 aggro)
  distSq, // S158 P3 — the goblin bomber's arrival test (shape or acquired unit)
} from './creatures/creatureAI.ts';
import { underChewerCaps, sweepDeferredDeaths } from './creatures/creatureLifecycle.ts';
// S158 P6 — the landed stink bag's damage beat + expiry sweep (CF-S157-b).
import { stinkCloudTick, sweepExpiredStinkClouds } from './defenders/stinkCloud.ts';
import { applyRadialDamage } from './damage.ts';
// S157 P0 — the lightning hub razes its OWN component on self-destruct; see the emit branch.
import { componentOf } from '../game/structure.ts';
import { razePrimitives } from './razePrimitives.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import {
  recipeStillSatisfied as defenderRecipeStillSatisfied,
  standDownDefenders,
} from './defenders/defenderLifecycle.ts';
// S159 P8 — the magazine refill on the BUILD edge reads each kind's `bags` from its config.
import { getDefenderConfig } from './defenders/defender.ts';
import {
  releaseShelteredGatherers,
  tickGathererShelter,
} from './gatherers/gathererLifecycle.ts';
import { underDroneCaps } from './droneLifecycle.ts';
// S158 B2 — ONE definition of a recipe's emit cadence, shared with the registration seed.
import { spawnerIntervalTicks } from './spawners/spawner.ts';
import { awardSpawnerKillReward } from './gameMode.ts';
import { tickGameState, type GameStateExtras } from './gameState.ts';
import { shouldCookOffInHand } from './potatoLifecycle.ts';
import { tickScoring } from './scoring.ts';
import { canAvatarCleanSplat } from './seagulls/seagullLifecycle.ts';
import { recipeStillSatisfied } from './spawners/spawnerLifecycle.ts';
import { detectNonet, mintNonetSeed, startSudoku } from './sudokuEvent.ts';
import { dispatch, isNetworked, type World } from './world.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import { creatureCanTarget } from './stats.ts';

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
  controls: ControlsLike;
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

/**
 * ⭐ S154 P4 (owner A3) — THE DEADLINE HALF OF THE RETREAT: on the FIGHT→BUILD edge, every creature
 * still out in the field is put back at its own home.
 *
 * ## Why a walk alone could not satisfy the owner
 *
 * The whole creature fan-out is gated on `matchPhase === 'FIGHT'` (S149 P3 — creatures are dormant
 * during BUILD). The instant the phase flips they stop ticking entirely: `state`, `ticksInState` and
 * `targetPos` freeze at whatever they were. So the run-home window can only ever be a BEST EFFORT —
 * a slow unit, or one that acquired a target late, is frozen mid-field for the whole BUILD phase,
 * standing in enemy territory. That is precisely the screenshot the owner sent.
 *
 * This is the same shape as `GATHERER_SHELTER_LEAD_TICKS`, whose docblock settles the principle:
 * *"THIS IS A DEADLINE, NOT A HEAD START. The mechanism deliberately does NOT send gatherers walking
 * home and hope they arrive."* The difference is that the owner asked for the WALK by name — it is
 * the thing they want to see — so A3 ships both: the walk is the read, and this is the guarantee.
 *
 * ⚠ NO NEW FIELD AND NO NEW STATE, deliberately. A `RETREATING` CreatureState would be a hard wire
 * parse break (the 'SHELTERED' 25→26 class) AND would render as the idle animation row, because
 * `goblinRenderer` maps every state that is not ATTACKING or SEEKING to 'idle' — so a retreating
 * goblin would slide across the board standing still. Position is already hashed and already
 * serialized, so moving it costs nothing new.
 *
 * Idempotent: called once per boundary-crossing tick, and running it twice is a no-op.
 */
export function recallArmies(world: World): void {
  for (const c of world.creatures.values()) {
    const home = ownHomePos(world, c);
    if (home === null) continue;
    // ⚠ prevPos MOVES WITH pos. This is a Verlet integrator: velocity is implicit in
    // (pos - prevPos), so setting pos alone would hand the creature a colossal one-frame velocity
    // and fling it back out across the board the moment FIGHT resumes.
    c.pos.x = home.x;
    c.pos.y = home.y;
    c.prevPos.x = home.x;
    c.prevPos.y = home.y;
    c.targetPos.x = home.x;
    c.targetPos.y = home.y;
    // Drop every commitment: the target it was walking to is on the other side of the board now.
    c.targetBondId = null;
    c.targetCreatureId = null;
    c.targetPrimitiveId = null;
    /*
     * ⭐ S157 F3 (found by review) — **CLEAR THE BITE COUNTER, OR THE CHEWER IS BRICKED FOR THE MATCH.**
     *
     * A chewer recalled mid-bite kept `chewProgress > 0`, and re-selection is gated on
     * `chewProgress === 0` (the "do not abandon a commit halfway" rule). But the only writer that
     * zeroes it lives inside the ATTACKING branch of the FSM — which this recall has just left. So the
     * creature could never re-select (no bond), never re-enter ATTACKING (nothing in reach), and never
     * reset the counter. A closed loop: it stood at its spawner doing nothing for the rest of the
     * match while still occupying the population cap.
     *
     * Dropping it here is correct rather than merely convenient: the recall has already dropped the
     * bond this progress was AGAINST, so a surviving count is progress toward a target that no longer
     * exists. Every other commitment on this creature is cleared three lines up for exactly that
     * reason; this field was simply missed.
     */
    c.chewProgress = 0;
    if (c.state === 'ATTACKING') {
      c.state = 'SEEKING';
      c.ticksInState = 0;
    }
  }
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
    stepPhysics(world, deps.spawner, deps.controls);
  } else {
    world.tick++;
  }

  /* ────────────────────── S147 P1 — THE MATCH CLOCK ────────────────────── */
  // The BUILD/FIGHT heartbeat (owner's notes: 90 s to gather & build, then a 90 s fight; repeat).
  //
  // PLACED HERE ON PURPOSE — after the tick has advanced (inside stepPhysics when PLAYING, in the
  // else-branch otherwise) and BEFORE the tickScoring gate below, so THIS tick's phase is settled
  // before scoring decides whether to accrue. Putting it after scoring would pay income for a tick
  // the player was no longer in FIGHT for.
  //
  // ⛔ NO WALL-CLOCK. The blueprint ranks a Date.now()-driven phase timer as the #1 CRITICAL desync
  // risk of the whole tower-defence pivot. This reads world.tick and nothing else.
  //
  // ⛔ `phaseEndsAtTick += PHASE_DURATION_TICKS`, NEVER `= world.tick + PHASE_DURATION_TICKS`.
  // Advancing the boundary RELATIVELY makes the clock drift-free: phase edges stay on their original
  // cadence no matter how many ticks passed between evaluations. Re-stamping from the current tick
  // would push every future boundary later each time an evaluation was skipped — and evaluations DO
  // get skipped, because the NONET-freeze branch in main.ts advances world.tick and `continue`s past
  // this whole function while a Sudoku trial runs.
  //
  // ⚠ WHILE, NOT IF — and the PLAYING guard is hoisted OUT of the loop condition. The loop is what
  // makes a skip longer than a whole phase correct rather than merely non-crashing: it flips once per
  // boundary actually crossed, so phase PARITY is preserved (a 2.5-phase freeze lands you in the
  // right half of the cycle, not an arbitrary one). It always terminates because every pass adds
  // PHASE_DURATION_TICKS. The guard is hoisted because a condition that can go false mid-loop is a
  // bug this project has already shipped once (S145: "my loop guard went false after the first
  // iteration") — gameState cannot change in here, and hoisting makes that structural rather than
  // something a reader has to verify.
  //
  // No PHASE_CHANGED effect is emitted. The renderer and audio derive the edge by diffing the
  // matchPhase they last observed — the shipped `rainbowSwitchTick` / creatureRenderer death-watcher
  // pattern. A transient sim effect would be LOST to a joiner and to a post-migration client, who
  // receive a snapshot with the phase already flipped and would silently never get the transition.
  if (world.gameState === 'PLAYING') {
    let flipped = false;
    while (world.tick >= world.phaseEndsAtTick) {
      world.matchPhase = world.matchPhase === 'BUILD' ? 'FIGHT' : 'BUILD';
      // ⭐ S149 — the phases have DIFFERENT lengths (BUILD 90 s, FIGHT 45 s), so the deadline
      // extends by the length of the phase just ENTERED. `matchPhase` was flipped on the line
      // above, so reading it here is already the new phase — which is exactly what is wanted.
      world.phaseEndsAtTick += phaseDurationTicks(world.matchPhase);
      flipped = true;
    }
    // ⭐ S149 P2 — THE PHASE EDGE ACTIONS (R4 / R6 / R12).
    //
    // Keyed on "the loop ran AND we landed in X", not on a before/after comparison. That matters
    // because the loop can flip MORE THAN ONCE when a NONET freeze skips past a whole phase: a
    // before/after diff reads "BUILD → BUILD" across a double flip and would skip the edge work
    // entirely, even though a full FIGHT elapsed. Both actions are idempotent, so firing them once
    // per boundary-crossing tick is correct and re-firing is harmless.
    if (flipped) {
      if (world.matchPhase === 'BUILD') {
        /*
         * ⭐ S157 B8 (owner) — A NEW BUILD IS A NEW WAVE.
         *
         * *"each build-fight turn should be considered as WAVE"*. Counted on entry into BUILD, so
         * wave N is "the Nth BUILD+FIGHT turn" and the opening BUILD (which never crosses this edge)
         * is wave 1 from `makeWorld`. Incrementing on the FIGHT edge instead would have made the
         * very first fight wave 2.
         *
         * Sits inside the `flipped` guard with the other edge actions, so a NONET freeze that skips
         * a whole phase still advances exactly one wave per boundary crossing rather than one per
         * tick — the same reason that guard is keyed on "the loop ran AND we landed in X".
         */
        world.waveNumber += 1;
        /*
         * ⭐ S157 B6 — and the fight she outlived her scaffold in is over, so now she goes.
         *
         * This is what stops "survives the recipe break" becoming "immortal". She fights on with a
         * broken tower for the rest of that FIGHT — the owner's ask — and is cleared at the turn
         * boundary if the structure was never rebuilt. A tower that IS rebuilt re-summons her next
         * BUILD through the normal ignition path.
         */
        for (const [defenderId, d] of [...world.defenders]) {
          if (d.kind !== 'princess') continue;
          if (!world.primitives.has(d.anchorPrimitiveId) || !defenderRecipeStillSatisfied(world, d)) {
            dispatch(world, { type: 'REMOVE_DEFENDER', defenderId });
          }
        }
        // Walls up, guns cold, doors open.
        standDownDefenders(world);
        /*
         * ⭐ S159 P8 (owner playtest) — **AND THE MAGAZINES REFILL. THE STINK TOWER ONLY EVER FIRED
         * ONCE PER MATCH.**
         *
         * Owner, after playing the S159 build: *"stink tower only plays on his first fight cycle
         * (throwing 5 poop bags ...) and then the next fight he does nothing! Need to restart him
         * each round."*
         *
         * ⛔ THE CAUSE, MEASURED: `bagsRemaining` had exactly TWO writes in `src/` — filled once at
         * construction (`makeDefender`, from `config.bags`) and decremented once per throw
         * (`stinkThrowBag`). **Nothing refilled it, ever**, and `state/defenders/` had no phase
         * awareness at all. After five bags `stinkIsDepleted()` was permanently true, so the tower
         * dropped to aura-plus-taunt for the rest of the match and REBUILDING it was the only
         * reload — which is precisely what the owner was doing by hand, every round.
         *
         * ⚠ THE NUMBER IS THE OWNER'S; THE CADENCE IS MINE. `STINK_TOWER_BAGS = 5` comes from
         * *"visibly shoot out all 5 stink bags"*. What never existed is a REFILL RULE. One full
         * magazine per round is the reading that matches *"each round"*, and the BUILD edge is where
         * it belongs rather than the FIGHT edge: `stinkTowerRenderer` draws the hanging bag count
         * from this field, so the player WATCHES the tower re-arm during BUILD instead of it
         * silently filling at the whistle. The two alternatives, if this is wrong: a slow reload
         * spread across BUILD (visible progress, punishes a short build), or a FEED gesture like the
         * goblin tower's (a real cost, but then a tower can be starved).
         *
         * Idempotent by construction — it assigns a constant, so the double-flip a NONET freeze can
         * cause (see the `flipped` guard above) refills to the same 5 rather than stacking.
         * `config.bags` is 0 for every kind without a magazine, so this is a no-op for the turret,
         * HELGA and every future kind that does not carry one.
         */
        for (const d of world.defenders.values()) {
          d.bagsRemaining = getDefenderConfig(d.kind).bags;
        }
        releaseShelteredGatherers(world);
        // ⭐ S154 P4 (owner A3) — and NOBODY IS LEFT STANDING IN ENEMY GROUND.
        recallArmies(world);
      }
    }
  }
  // ⭐ S149 P2 — pull the gatherers in 1 s before this BUILD ends (R6). Deliberately OUTSIDE the
  // `flipped` branch: it is a WINDOW that must be evaluated every tick, not an edge. Its own guards
  // handle phase, timing and idempotence — see `tickGathererShelter`.
  tickGathererShelter(world);
  // S76 P3 — host-only complexity-income accrual. Runs BEFORE the WIN check
  // (tickGameState) and the hunter 75% trigger below so both observe this tick's
  // freshly-accrued scoreProgress. The client never accrues (host-authoritative); it
  // reads scoreProgress from the NetSnapshot. Gated on PLAYING.
  // S147 P1 (R3 / R7 / R16) — SCORING IS FIGHT-ONLY. *"Points accrue during the FIGHT stage ONLY —
  // there is no point tick during BUILD."* One added conjunct, one call site: tickScoring has exactly
  // ONE production caller (this one), and the income engine itself already does the right thing —
  // it already scales with structure complexity and already falls as connectors are severed (R16),
  // and it already counts plain non-recipe structures (R17). So the tower-defence economy needed the
  // engine GATED, not rewritten.
  //
  // ⚠ This is also what switches off the R28 anti-coast leader decay during BUILD for free: the decay
  // lives INSIDE tickScoring, so gating the call gates the decay. LEADER_DECAY_ENABLED then switches
  // it off in FIGHT too, which is the actual ruling.
  if (world.gameState === 'PLAYING' && world.matchPhase === 'FIGHT') {
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
          /*
           * ⭐ S159 P9 — **THE LIGHTNING HUB'S BLAST, MOVED FROM ITS THIRD DRONE TO ITS DEATH.**
           *
           * The owner asked for continuous production (*"he should continuously spawn them at the
           * equal intervals"*), which retires the emit-counted self-destruct. It does NOT retire the
           * blast: they objected to the tower disappearing, not to it having one, and S113 R3 records
           * them choosing the owner-agnostic AoE deliberately. So the hub still pays the price it
           * always paid — it now pays it when its recipe breaks, which is the `stinkDeathBlast`
           * shape one directory over.
           *
           * ⛔ WHY THIS EXACT BRANCH AND NOT `applyRemoveSpawner`: the reducer is reached by every
           * teardown path, so a blast there would detonate on the win screen and on a title-return.
           * This branch is DESTRUCTION, not teardown, and its own comment above says why that holds —
           * *"teardownSpawners clears the map directly and never reaches this branch"* — which is the
           * same guarantee `awardSpawnerKillReward` on the line above already relies on. One
           * property, two consumers.
           *
           * S157 P0's two rulings move with the code unchanged: the AoE SPARES the owner's other
           * structures, and the hub razes its OWN component explicitly so its leaves cannot survive
           * as bond-less orphans (*"the last shape stays and attracts enemy fire"*).
           */
          if (sp.recipeId === 'lightningHub') {
            const dying = world.primitives.get(sp.anchorPrimitiveId);
            if (dying !== undefined) {
              const selfIds = [...componentOf(dying, world.primitives, world.bonds).primitiveIds];
              dispatch(world, {
                type: 'STRUCTURE_SELFDESTRUCT',
                pos: { x: dying.pos.x, y: dying.pos.y },
                radius: STRUCTURE_SELFDESTRUCT_RADIUS,
                ownerPlayerId: sp.ownerPlayerId,
              });
              razePrimitives(world, selfIds);
            }
          }
          dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId });
          continue;
        }
      }
      /*
       * ⭐ S157 P0 (owner) — **SPAWNERS ARE DORMANT OUTSIDE THE FIGHT.** This poll was the ONE
       * subsystem with no phase gate at all, and that single omission drove three of the owner's
       * nine playtest reports:
       *
       *   · *"lightning hubs blow up own structures … during build phase"* — the hub's arc ends in
       *     `STRUCTURE_SELFDESTRUCT`, a 240 px raze, and it fired 60 s after ignition, i.e. inside
       *     the 90 s BUILD. A hub built early in BUILD ALWAYS detonated in its owner's own base.
       *   · *"pencil chewers … not being spawned late game"* — pentagrams kept minting through
       *     BUILD while the despawn (inside `applyCreatureTick`, dispatched only by the FIGHT-gated
       *     fan-out at the bottom of this file) could not run, so the global chewer cap filled with
       *     frozen chewers.
       *   · *"0 Goblins … the shapes are being consumed nevertheless"* — those frozen chewers hold
       *     the cap that `applySpawnCreature` (wrongly) applies to fed goblins, and BUILD is exactly
       *     when a player feeds their tower.
       *
       * Placed AFTER the revalidation above and BEFORE the emit, deliberately — the same split the
       * defender poll uses (`matchPhase !== 'FIGHT'` sits below its own revalidate): a spawner whose
       * recipe was broken during BUILD must still be REMOVED, because dormancy suspends the WEAPON,
       * not the bookkeeping.
       *
       * ⛔ AND THE CADENCE IS KEPT ALIGNED TO NOW, not merely skipped. A bare `continue` would leave
       * `nextSpawnTick` in the past across a 90 s BUILD, so the FIGHT edge would dump a backlog
       * burst — and for a lightningHub, fire its self-destruct on the first FIGHT tick. That is the
       * absolute-deadline-survives-a-phase-edge class that has now bitten this repo three times
       * (S156 P3's `loadRephaseDefenders`, the drone fuse, `standDownDefenders`). The `while` idiom
       * is lifted verbatim from the fouled branch below, which solved this exact problem in S109.
       */
      if (world.matchPhase !== 'FIGHT') {
        /*
         * ⭐ S158 B2 (owner playtest) — RE-ALIGN BY THE SPAWNER'S **OWN** CADENCE.
         *
         * This advanced every recipe by `SPAWN_INTERVAL_TICKS`, the CHEWER's 15 s, whatever the
         * spawner actually was. For a lightning hub — whose cadence S158 B2 cut to 5 s so its three
         * drones land inside one 45 s fight — that meant the BUILD re-alignment left `nextSpawnTick`
         * up to 15 s past the FIGHT edge, and the tower stood silent through a third of the fight it
         * was built for. The cadence fix alone would not have been felt.
         *
         * The S157 P0 reasoning this line was written for is untouched and still the point: keep the
         * deadline aligned to NOW so a 90 s BUILD cannot bank a backlog burst — for a hub, one that
         * would fire its self-destruct on the first FIGHT tick. Only the STEP was wrong.
         */
        const step = spawnerIntervalTicks(sp.recipeId);
        while (world.tick >= sp.nextSpawnTick) sp.nextSpawnTick += step;
        continue;
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
      // (unchanged).
      /*
       * ⭐ S159 P9 (owner playtest) — **THE HUB IS A FACTORY NOW, NOT A THREE-SHOT BURST.**
       *
       * Owner, after playing the S159 build: *"lightning drone tower spawns like 3 drones and then
       * dissapears! wtf? it should not be so. he should continuously spawn them at the equal
       * intervals."*
       *
       * ⚠ WHAT THEY SAW WAS NOT A BUG — IT WAS THIS BLOCK DOING EXACTLY WHAT S113 SPECIFIED, WHICH
       * IS WHY THE OLD COMMENT IS QUOTED HERE RATHER THAN DELETED. It read: *"A lightningHub spawns
       * up to STRUCTURE_SELFDESTRUCT_DRONE_COUNT lightning drones on the cadence, then on the NEXT
       * cadence slot SELF-DESTRUCTS (a large owner-agnostic AoE at the anchor) + REMOVE_SPAWNER"*.
       * The S113 Batch C PDR calls the hub a **"glass-cannon"** and its R3 records
       * *"Structure self-destruct kills your own build: INTENDED (owner chose owner-agnostic)"*.
       * So the owner is REVERSING THEIR OWN RULING, which is entirely their call — and the reversal
       * is recorded here, at the code it governs, the way S158 A1 recorded the aura correction
       * instead of quietly re-purposing an owner number.
       *
       * ⭐ WHAT SURVIVES, AND WHY THAT IS MY CALL RATHER THAN THEIRS: **the lightning storm is not
       * deleted, it MOVED TO THE HUB'S DEATH** (the recipe-break branch above). They objected to the
       * tower *disappearing after three drones*, not to it having a blast — and deleting an
       * owner-chosen mechanic nobody complained about is the expensive reading of a two-sentence
       * report. If they want it gone it is one branch to strike; if they want it back on a trigger,
       * the FEED-row on the structure popover is the shipped precedent for a player-fired button.
       *
       * ⚠ AND THE SLOT IS SKIPPED, NOT BANKED, WHEN THE LIVE CAP BLOCKS IT. `nextSpawnTick` now
       * advances even on a blocked slot, so emits stay on the exact `DRONE_EMIT_INTERVAL_TICKS`
       * grid — *"equal intervals"* in the owner's words. Banking blocked slots would drain them one
       * per tick the moment a drone died, i.e. a burst of three at once, which is the same
       * now-overdue-slot hazard the fouled-primitive branch above handles with its own `while`.
       */
      if (sp.recipeId === 'lightningHub') {
        if (world.tick >= sp.nextSpawnTick) {
          const anchor = world.primitives.get(sp.anchorPrimitiveId);
          // ⭐ S159 P9 — the cadence advances on EVERY due slot, emitted or skipped. See the note above.
          sp.nextSpawnTick += DRONE_EMIT_INTERVAL_TICKS;
          if (anchor !== undefined && underDroneCaps(world, spawnerId)) {
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
            sp.spawnedCount++;
          }
        }
        /*
         * ⛔ S159 P9 — THE SELF-DESTRUCT ARM THAT USED TO LIVE HERE IS GONE, and what it did is
         * preserved in two places rather than lost: the owner's reversal is quoted in the block
         * comment above, and the BLAST ITSELF now fires from the recipe-break branch further up
         * (`hubDeathBlast`) so the hub still pays a price — it just pays it when it DIES instead
         * of after its third drone. S157 P0's reasoning moved with the code: the blast spares the
         * owner's other structures, and the hub razes its OWN component explicitly so the five
         * leaves cannot be left as bond-less orphans (*"the last shape stays and attracts enemy
         * fire"*).
         */
      } else if (sp.recipeId === 'goblinTower') {
        /*
         * ⭐ S152 A1 (owner playtest) — THE GOBLIN TOWER EMITS NOTHING ON A CADENCE. It is FED.
         *
         * Owner: *"goblin tower is passively generating pencil chewers. i think you have made this
         * tower also have same specs as pentagram... WRONG."* — and that diagnosis was exactly
         * right. The arm below is the PENTAGRAM behaviour, but it was written as an `else`, i.e. a
         * DEFAULT that catches every recipeId which is not 'lightningHub'. S152 P2 made the goblin
         * tower register a spawner for the first time and it fell straight into the chewer arm.
         *
         * ⛔ THE REAL DEFECT WAS THE DEFAULT ITSELF, WHICH IS WHY THIS BRANCH IS EXPLICIT AND
         * EMPTY RATHER THAN A CONDITION BOLTED ONTO THE ARM BELOW. Any future producing recipe
         * would have inherited chewers the same silent way. Keeping the cadence UNTOUCHED here is
         * deliberate too: `nextSpawnTick` is never read for this recipe, so there is no backlog to
         * drain and nothing to keep aligned.
         *
         * The tower's whole output goes through FEED_TOWER (`applyFeedTower`), one unit per shape
         * handed to it — owner R70: *"takes one shape to feed to then spawn a goblin of different
         * kinds"*.
         */
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
        /*
         * ⭐ S157 B6 (owner) — **HELGA IS A CHARACTER, NOT A TOWER, AND SHE OUTLIVES HER SCAFFOLD.**
         *
         * Owner: *"Helga should stay alive after her tower connectors are destroyed until she is
         * destroyed herself"*, and separately: *"i never saiid a tower has no hit points of its
         * own!!! ... helga has her own hit points and stats regardless of her towers stats"*.
         *
         * Every defender used to die the instant its recipe broke. For a TURRET that is right and the
         * owner endorsed it — a tower's durability IS its connectors. For Helga it was never right:
         * she is a summoned unit standing next to a structure, and cutting one connector deleted her
         * mid-swing.
         *
         * She now ignores the recipe check for the whole FIGHT she was summoned into, and is swept at
         * the BUILD edge (below) if her structure is gone. A missing ANCHOR still removes her, because
         * `applyDefenderTick` reads the anchor for her home position and an anchorless princess would
         * drift with no leash.
         */
        const survivesRecipeBreak = d.kind === 'princess' && world.matchPhase === 'FIGHT';
        if (
          !world.primitives.has(d.anchorPrimitiveId) ||
          (!survivesRecipeBreak && !defenderRecipeStillSatisfied(world, d))
        ) {
          dispatch(world, { type: 'REMOVE_DEFENDER', defenderId });
          continue;
        }
      }
      // ⭐ S149 P2 (R4) — TOWERS ARE DORMANT OUTSIDE THE FIGHT. The owner's report was *"your
      // towers can fight during build stage"*; this is the one line that ends it. Placed AFTER the
      // revalidation above, deliberately: a defender whose recipe was broken during BUILD (the
      // player severed their own bonds, or is mid-rebuild) must still be REMOVED, or a dead tower
      // would linger all phase and come back to life at the FIGHT edge. Dormancy suspends the
      // WEAPON, not the entity's bookkeeping.
      if (world.matchPhase !== 'FIGHT') continue;
      dispatch(world, { type: 'DEFENDER_TICK', defenderId });
    }
  }

  /*
   * ⭐ S158 P6 (CF-S157-b) — LANDED STINK BAGS keep stinking after the tower that threw them.
   *
   * ⚠ ITS OWN LOOP, NOT A BRANCH INSIDE THE DEFENDER FAN-OUT ABOVE, AND THAT IS THE POINT. A cloud
   * OUTLIVES its tower — that is most of what makes it a hazard rather than an aura — so hanging it
   * off the defender loop would silently kill every cloud the moment its tower was destroyed, which
   * is precisely the moment a player most wants the ground to stay foul.
   *
   * FIGHT-gated like every other weapon (S149 R5: nothing attacks during BUILD), but the SWEEP runs
   * unconditionally below so a cloud thrown in the last second of a fight cannot survive into the
   * next build stage as an invisible minefield.
   */
  if (world.gameState === 'PLAYING' && world.stinkClouds.size > 0) {
    if (world.matchPhase === 'FIGHT') {
      // Snapshot the values first: `applyRadialDamage` can delete primitives and creatures, and one
      // day may delete a cloud, and mutating a map mid-iteration is where replay divergence hides.
      for (const c of [...world.stinkClouds.values()]) {
        if (!world.stinkClouds.has(c.id)) continue; // defensive: a sibling tick removed it
        stinkCloudTick(world, c, applyRadialDamage);
      }
    }
    sweepExpiredStinkClouds(world);
  }

  /*
   * ⭐ S155 N1 — OPEN THE ONE-TICK DEATH DEFERRAL for the strike batch below.
   *
   * Owner, after a cross-network match: *"player 2 had a way bigger army then me but theyt couldnt
   * even destroy one of my goblins"*, then: *"both players goblins did appear to be fighting each
   * other but only Player one spawn actuall managed to kill"*.
   *
   * ⛔ THE DECIDING VARIABLE WAS THIS LOOP'S ORDER — not the seat, and not the creature id (both were
   * ruled out by swapping them in `_probe_symmetry`). Whoever the loop reached FIRST killed the other
   * outright and took ZERO damage back, because the loser was deleted mid-loop and every later step
   * reads `world.creatures.get(id)` → undefined, so it never reached its own fire tick. Creatures live
   * in SPAWN order, so whoever spawned first won every single exchange — which is exactly why it
   * looked like only seat 0's units had working stats.
   *
   * With the removal deferred, a creature that takes a lethal blow still lands the strike it had
   * already committed to this tick. A mutual engagement therefore destroys BOTH, and a bigger army
   * wins on attrition — which is the outcome the owner expected and did not get.
   *
   * ⚠ The one-shot arithmetic is deliberately untouched: `GOBLIN_MELEE_HP = 1` is the owner's R70
   * ruling and ATK/DEF are R72's ladder. Removing the ORDER advantage is sufficient and does not
   * retune anyone's balance numbers.
   */
  world.pendingCreatureDeaths = new Set();

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
  // ⭐ S149 P3 — CREATURES ARE DORMANT DURING BUILD TOO.
  //
  // ⚠ A DELIBERATE, FLAGGED ADDITION BEYOND THE P3 SPEC, on the S147 bounty-gate precedent.
  // P2 shut the tower half of the owner's report (*"your towers can fight during build stage"*),
  // but the probe for THIS priority found creatures ticking completely unguarded — during BUILD
  // they were still seeking, closing on enemy structures and dispatching CREATURE_ATTACK, which
  // SEVERS BONDS. That is the same rule broken by a different entity: R5's premise is that
  // nothing can be attacked while the walls are up, and the shelter snap's whole justification
  // ("nothing can attack during BUILD, so the snap is unobservable as unfairness") is FALSE while
  // a chewer can eat your tower mid-build.
  //
  // It is folded in here rather than logged, because shipping walls that stop movement while
  // creatures still freely attack through the build stage would be incoherent — the owner would
  // read it as the same defect they already reported once.
  //
  // ⛔ WHY THE WHOLE BLOCK AND NOT A MOVEMENT CLAMP. A clamp would freeze them in place but leave
  // Step 1's target re-selection and Step 3's CREATURE_ATTACK dispatch running, so a creature
  // already adjacent to a bond would keep chewing it without moving an inch.
  if (world.gameState === 'PLAYING' && world.matchPhase === 'FIGHT' && world.creatures.size > 0) {
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
      /*
       * ⭐ S158 P3 (CF-S157-e) — `&& !targetsStructures` IS THE WHOLE FIX, AND HERE IS WHY IT IS A
       * CONJUNCT RATHER THAN A REORDER.
       *
       * `GOBLIN_SUICIDE_CONFIG` sets BOTH `selfExplode` and `targetsStructures`. This branch ran
       * first, so the terrorist goblin was handed the lightning drone's whole identity: it homed on
       * enemy CONNECTORS instead of shapes, detonated through `applyDroneExplode` — which severs
       * bonds and never reads atk/pen, so its 4 ATK / 0 PEN applied to NOTHING — and used the
       * drone's 110 px radius instead of its own 70 px. Every stat the owner dictated for the unit
       * was dead.
       *
       * The `else if` below was correct when it was written: no creature was both, because the flag
       * pair had no overlap until the goblin roster landed. Nothing was wrong at the time and
       * nothing failed when it became wrong — the config simply grew a case the branch never
       * considered.
       *
       * ⚠ A CONJUNCT, NOT A SWAP. Putting `targetsStructures` first would move the shipped drone /
       * Voltkin / chewer selection code, and the comment two screens down records that its byte
       * position is pinned by creatureAI.test.ts, hostTick.differential.test.ts and
       * save.replay.test.ts. This narrows the drone branch to what it always meant — "explodes AND
       * is not a structure-attacker" — and leaves every existing creature byte-identical
       * (`lightningDrone` is `targetsStructures: false`).
       */
      const seekCfg = creature === undefined ? null : getCreatureConfig(creature.type);
      if (
        creature !== undefined &&
        creature.state === 'SEEKING' &&
        seekCfg !== null &&
        seekCfg.selfExplode &&
        !seekCfg.targetsStructures
      ) {
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
      } else if (
        creature !== undefined &&
        creature.state === 'SEEKING' &&
        getCreatureConfig(creature.type).targetsStructures
      ) {
        // ── S139 P2 — STRUCTURE-ATTACKER (goblin) target selection ─────────────────────────
        // A separate `else if` placed AHEAD of the existing branch rather than an `if` nested
        // inside it: the shipped Voltkin/chewer/drone selection below is a byte-equivalence
        // guard pinned by creatureAI.test.ts, hostTick.differential.test.ts and
        // save.replay.test.ts, so it is left textually untouched.
        //
        // Owner ruling: goblins go for "the closest enemy structure", and fight "each other".
        //  - The SHAPE is the navigation + strike target (`targetPrimitiveId`, enemy-only with no
        //    own-shape fallback — see findNearestEnemyPrimitiveFrom on why that fallback is a
        //    Voltkin feature that must NOT be inherited).
        //  - `targetBondId` is forced null: a goblin never commits to a connector, and leaving a
        //    stale bond id would make the SEEKING→ATTACKING range test below fire on the wrong
        //    thing.
        //  - The enemy-CREATURE target is set with the same range-gated, lowest-id opportunism
        //    Voltkin uses, which is what makes "or each other" work for free. It is checked FIRST
        //    at strike time, so a goblin defends itself instead of ignoring an attacker to keep
        //    hitting a wall.
        // Re-selected every tick (no stickiness): a goblin is not glued to a shape the way a
        // chewer is glued to a bond, so it retargets the moment its shape dies under it.
        const nextPrim = findNearestEnemyPrimitiveFrom(world, creature);
        creature.targetPrimitiveId = nextPrim;
        creature.targetBondId = null;

        // ⭐ S153 P1 (owner R83) — UNITS FIRST, THEN STRUCTURES.
        //
        // This is the line that reverses Council ruling MF3 for structure-attackers only. MF3 said
        // bonds drive navigation and a creature is struck only once it has wandered into range;
        // the owner wants goblins to deal with the soldier in front of them before resuming the
        // push. Voltkin and chewers are untouched — they take the branch below.
        //
        // ⭐ AND IT FINALLY GIVES `creatureCanTarget` A CALLER. A0 measured the R72 targeting
        // matrix as DECLARED BUT DEAD: `creatureCanTarget` had zero production callers, so the
        // table documenting who may hit what was enforcing nothing. It is the authority here
        // rather than a hardcoded type check, which is the whole reason the table exists.
        const navUnit = creatureCanTarget(creature.type, 'units')
          ? pickNavUnit(
              world,
              creature,
              creature.targetCreatureId,
              GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS,
              GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS,
            )
          : null;
        creature.targetCreatureId = navUnit;

        /*
         * ⭐ S154 P4 (owner A3) — RUN HOME, AND IT OUTRANKS EVERYTHING ELSE.
         *
         * Owner: *"they should run back 2 or 3 sec before end of fight and stay near their tower as
         * if they were just built... this is the mode for all spawn armies"*, and then again with a
         * screenshot of goblins standing in enemy territory during BUILD: *"thats inherently wrong -
         * they would be killed"*.
         *
         * Placed ABOVE the unit / shape / keep chain because a retreat that yields to a target is
         * not a retreat — a goblin with an enemy in leash range would keep fighting through the
         * whistle and be exactly where the owner photographed it.
         *
         * ⚠ THE COST OF THAT, NAMED RATHER THAN HIDDEN: for these last three seconds an army turns
         * its back while the other side may still be swinging. GEMINI raised it as a game-feel
         * objection and it is a real one. It ships as asked because the owner ruled it explicitly and
         * it is SYMMETRIC — both armies turn at the same tick, and the phase is ending anyway.
         */
        const goingHome = isRetreatWindow(world) ? ownHomePos(world, creature) : null;

        /*
         * ⭐ S159 P1 (owner R77) — **AND A LANDED STINK BAG PULLS, which is the "aggro" in R77's
         * *"destructible stink bags as entities with aggro and on-destroy damage"*.**
         *
         * S158 A2 shipped the two halves that need no navigation: the bag has a pool, and it bursts
         * when killed. It also wired the two clauses that let a unit ALREADY STANDING at one deal
         * with it — the sixth engagement clause in `creatureLifecycle` and the bag arm in
         * `creatureAttack`. Nothing walked to a bag, so the pull existed on paper only.
         *
         * ⚠ PLACED BELOW THE ACQUIRED UNIT AND ABOVE THE COMMITTED SHAPE, and that order is the
         * design: the soldier swinging at you outranks the bag at your feet, and the bag at your
         * feet outranks the wall you are marching on. Under HOME, like everything else — a retreat
         * that detours to pop a bag is not a retreat (S154 P4).
         *
         * ⚠ THE GATE THIS DOES *NOT* NEED, stated because its sibling does. The depleted tower's
         * taunt has to check `sourceSpawnerId` (a chewer mid-chew is glued to its bond by design)
         * and `targetsStructures` (nothing else reads `targetPrimitiveId`). Neither applies here:
         * this branch is ALREADY `targetsStructures`-only, and a chewer never enters it — so the
         * provenance question is answered by which branch the creature took, not by a flag test.
         * The consequence is the same one the taunt records: a Voltkin will sail past a bag, and a
         * playtester should expect it.
         */
        const bagId = nearestEnemyStinkCloudWithin(world, creature, STINK_BAG_AGGRO_RADIUS);

        // Steering priority: HOME if the fight is ending, else the acquired unit, else a landed
        // enemy bag in the way (S159 P1), else the committed shape, else — when the enemy has no
        // shapes left standing — the enemy keep (owner R85).
        let steerTo: Vec2 | null = goingHome;
        if (steerTo === null && navUnit !== null) {
          const quarry = world.creatures.get(navUnit);
          if (quarry !== undefined) steerTo = quarry.pos;
        }
        if (steerTo === null && bagId !== null) {
          const bag = world.stinkClouds.get(bagId);
          if (bag !== undefined) steerTo = bag.pos;
        }
        if (steerTo === null && nextPrim !== null) {
          const prim = world.primitives.get(nextPrim);
          if (prim !== undefined) steerTo = prim.pos;
        }
        if (steerTo === null) steerTo = enemyCastleMarchPos(world, creature);

        /*
         * ⭐ S154 P2 — A STANDOFF FIGHTER AIMS AT THE RING, NOT AT THE VICTIM.
         *
         * The bat rider and the archer are `holdsRange: true`. Steering them straight at the thing
         * they are shooting relied on the FSM to stop them — and `ZERO_ACCEL` in ATTACKING means
         * COAST, not stop, so their approach momentum glided them ~175 px past the standoff and
         * into the melee band. Pulling the destination back onto the ring lets `arriveForce`'s
         * existing linear ramp-down brake them, so they arrive slow and stay put.
         *
         * ⚠ ONLY WHEN THERE IS SOMETHING TO SHOOT. When `steerTo` is the enemy KEEP (the R85
         * no-shapes-left march) there is no victim to stand off from, so the march is left alone —
         * otherwise a ranged goblin would stop 128 px short of the castle it is marching on, which
         * is the opposite of the point.
         */
        const holdsRange = getCreatureConfig(creature.type).holdsRange;
        // ⚠ `goingHome` disqualifies the standoff: a retreating archer must reach its own tower, not
        // park 0.8×range short of it, and home is not something to stand off from.
        // ⭐ S159 P1 — a BAG counts as a victim for the standoff, or a ranged unit would walk into
        // the very cloud it can already shoot from outside. `bagId` is only non-null inside
        // STINK_BAG_AGGRO_RADIUS, so this cannot fire on a bag the unit is not going to.
        const hasVictim =
          goingHome === null && (navUnit !== null || bagId !== null || nextPrim !== null);
        if (steerTo !== null && holdsRange && hasVictim) {
          // ⚠ AND IT REPLACES THE TRANSLATIONAL SPREAD BELOW, rather than composing with it:
          // `standoffTargetPos` already scatters the squad by ROTATING along the ring, which keeps
          // every member exactly `ring` px out. Adding a 26 px translation on top would point some
          // of them straight at the victim and eat the whole standoff margin.
          const spread = standoffTargetPos(
            creature.pos,
            steerTo,
            getCreatureConfig(creature.type).attackRange,
            creature.id,
          );
          creature.targetPos.x = spread.x;
          creature.targetPos.y = spread.y;
        } else if (steerTo !== null) {
          // R82 — aim at a per-creature point on a small ring around the shared destination, so a
          // squad converges into an arc rather than the single pile the owner photographed. Pure
          // function of the creature id: no draw, no tick, nothing that can desync.
          const spread = spreadTargetPos(steerTo, creature.id, GOBLIN_SPREAD_RADIUS);
          creature.targetPos.x = spread.x;
          creature.targetPos.y = spread.y;
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
          } else {
            /*
             * ⭐ S157 B5 (owner) — NOTHING LEFT TO CHEW? MARCH ON THE KEEP.
             *
             * Owner: *"after all enemy structures are destroyed pencil chewers just stand there
             * idle...."* — and they did, literally. `findNearestBondTarget` returns null with no
             * enemy bond on the board, `targetPos` was then left at its stale value, and the
             * creature stood still for the rest of the match.
             *
             * `enemyCastleMarchPos` already existed and was already wired — for GOBLINS, in the
             * `targetsStructures` branch above. This is the same call in the branch that never got
             * it. (My first plan had this backwards: I thought the strike was generic and only
             * navigation was missing. Review proved the reverse — navigation existed, the strike was
             * type-gated. Both halves were needed, and shipping either alone gives a unit that walks
             * to the keep and cannot hit it, or one that can hit it and never walks there.)
             *
             * ⛔ ONLY IN THE `nextTarget === null` ARM, which preserves the ordering the goblin branch
             * already uses: the castle is the LAST fallback, reached when there is genuinely nothing
             * else. Hoisting it any higher would have chewers abandoning a half-chewed connector to
             * beeline the keep — exactly the degenerate rush the fallback ordering exists to prevent.
             */
            const march = enemyCastleMarchPos(world, creature);
            if (march !== null) {
              creature.targetPos.x = march.x;
              creature.targetPos.y = march.y;
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
      const bomberCfg = droneCandidate === undefined ? null : getCreatureConfig(droneCandidate.type);
      if (droneCandidate !== undefined && bomberCfg !== null && droneCandidate.state === 'SEEKING' && bomberCfg.selfExplode) {
        /*
         * ⭐ S158 P3 (CF-S157-e) — TWO BOMBERS, TWO ARRIVAL TESTS, TWO DETONATIONS.
         *
         * The drone arrives at a CONNECTOR and severs; the terrorist goblin arrives at a SHAPE (or at
         * the unit it acquired on the way) and deals its stats in a radius. Sharing one arrival test
         * was the second half of the bug: a goblin whose `targetBondId` is forced null by the
         * structure-attacker branch could never be "in range", so it would have flown until its FUSE
         * expired and then detonated wherever it happened to be — which is how the old code reached
         * `applyDroneExplode` at all.
         */
        const fuseExpiring = world.tick >= droneCandidate.despawnAtTick - 1;
        if (bomberCfg.targetsStructures) {
          // ⚠ A goblin bomber commits to a PRIMITIVE, and opportunistically to a unit. Both count as
          // arrival — owner R83's "units first, then structures" would be hollow if a bomber walked
          // through the soldier in front of it to reach a wall.
          const prim =
            droneCandidate.targetPrimitiveId === null
              ? undefined
              : world.primitives.get(droneCandidate.targetPrimitiveId);
          const quarry =
            droneCandidate.targetCreatureId === null
              ? undefined
              : world.creatures.get(droneCandidate.targetCreatureId);
          const reach = bomberCfg.attackRange * bomberCfg.attackRange;
          const atShape = prim !== undefined && distSq(droneCandidate.pos, prim.pos) <= reach;
          const atUnit = quarry !== undefined && distSq(droneCandidate.pos, quarry.pos) <= reach;
          if (atShape || atUnit || fuseExpiring) {
            dispatch(world, { type: 'SUICIDE_BLAST', creatureId: id });
            continue;
          }
        } else {
          const inRange =
            droneCandidate.targetBondId !== null &&
            isWithinAttackRange(world, droneCandidate, droneCandidate.targetBondId);
          if (inRange || fuseExpiring) {
            dispatch(world, { type: 'DRONE_EXPLODE', creatureId: id });
            continue;
          }
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
      // ⭐ S151 P2 (owner R76) — A GNAWER FIRES ON EVERY BITE, NOT ONCE AT THE END.
      //
      // Before S151 a chewer's `attackFireTick` was `chewHits × CHEW_INTERVAL_TICKS` (300), so it
      // dispatched a single CREATURE_ATTACK at the end of a fixed five-bite span and that one strike
      // severed the bond outright. Durability now lives on the CONNECTOR, so each bite has to land
      // its own damage and the bond decides when it gives way — which means firing on the cadence
      // rather than at a fixed tick. `ticksInState > 0` excludes the entry tick; the loop ends when
      // the bond vanishes (the FSM's bond-gone branch releases the commit).
      const afterCfg = after === undefined ? null : getCreatureConfig(after.type);
      const firesThisTick =
        after !== undefined &&
        afterCfg !== null &&
        (afterCfg.chewsConnectors
          ? after.ticksInState > 0 && after.ticksInState % CHEW_INTERVAL_TICKS === 0
          : after.ticksInState === afterCfg.attackFireTick);
      if (
        after !== undefined &&
        after.state === 'ATTACKING' &&
        firesThisTick &&
        // S139 P2 — a goblin's strike target is a PRIMITIVE, so neither of the two shipped
        // conditions holds for it and without this third clause it would enter ATTACKING, run its
        // whole cadence and never actually hit anything. `applyCreatureAttack` reads the shape from
        // `targetPrimitiveId` when `bondId` is null, so the dispatch below needs no new branch.
        // ⭐ S154 AMENDMENT C — A FOURTH CLAUSE, for exactly the reason the S139 P2 note above
        // gives about the third: a goblin attacking a CASTLE has no bond, no creature and no
        // primitive target, so without this it enters ATTACKING, runs its whole cadence and never
        // hits anything. That is precisely what the first cut of this feature did.
        (after.targetCreatureId !== null ||
          after.targetBondId !== null ||
          after.targetPrimitiveId !== null ||
          enemyCastleInReach(world, after, getCreatureConfig(after.type).attackRange) !== null ||
          // ⭐ S158 P7 (CF-S157-c) — A FIFTH CLAUSE, for exactly the reason the third and fourth
          // exist: HELGA is neither a creature, a bond, a primitive nor a castle, so without this
          // a goblin standing next to her would enter ATTACKING, run its whole cadence and never
          // hit anything. `killableDefenderInReach` filters to defenders with a POOL, so a turret
          // still cannot be engaged — towers die by recipe-break (R75), unchanged.
          killableDefenderInReach(world, after, getCreatureConfig(after.type).attackRange) !== null ||
          // S158 A2 — a SIXTH clause, same reason as the third, fourth and fifth: a landed stink
          // bag is none of the four target families, so without this a unit enters ATTACKING against
          // it and runs its whole cadence hitting nothing.
          enemyStinkCloudInReach(world, after, getCreatureConfig(after.type).attackRange) !== null)
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

  /*
   * ⭐ S155 N1 — CLOSE THE DEFERRAL. Every creature that took a lethal blow in the batch above is
   * removed here, after all of them have struck. Deterministic (built in loop order, and removal
   * order cannot change the outcome), and the field is nulled so no snapshot, save or hash can ever
   * observe a non-null value at a tick boundary.
   */
  if (world.pendingCreatureDeaths !== null) {
    sweepDeferredDeaths(world, world.pendingCreatureDeaths);
    world.pendingCreatureDeaths = null;
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
    // V6-1.2 — the gatherer haul cycle. Host-only and tick-deterministic, fanned out per unit like
    // the hunter loop above. Keys are snapshotted first: a tick can mutate the population in a
    // future slot (respawn/harassment, V6-2.2), and iterating a live Map while it changes is the
    // bug class the creature fan-out already guards against.
    if (world.gatherers.size > 0) {
      for (const gid of Array.from(world.gatherers.keys())) {
        dispatch(world, { type: 'GATHERER_TICK', gathererId: gid });
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
