/**
 * SPARK — S122 P1 (B2 phase d): the godly matcher CORE — the world-mutating half of
 * runGodlyMatcher, extracted VERBATIM from state/godlyOrchestration.ts into a module that
 * imports ONLY state/ (no render/, no DOM) so it can run inside the sim Worker.
 *
 * SPLIT CONTRACT (Council S122 L2):
 *   • CORE (this file): spawner/defender ignition + the cinematic matcher loop + the
 *     authoritative dispatch(world, GODLY_TRIGGER) + the cursor advance. Runs ONCE PER
 *     BATCH in worker mode (= once per render frame in direct mode) — the cadence cap
 *     ("at most ONE godly trigger per frame", WORKER_SIM_FOUNDATION.md contract) is
 *     preserved by the single loop + `break` exactly as before.
 *   • SIDE EFFECTS (injected callbacks / returned event): transport GODLY_TRIGGER
 *     broadcast, codex unlockGodly (localStorage), debug probes — main-thread concerns.
 *     Direct mode injects them as callbacks at the ORIGINAL call sites (byte-identical
 *     ordering: broadcast BEFORE dispatch — the S22 D4 latency choice); worker mode
 *     omits them and the caller performs them on BatchResult receipt (tick-tagged).
 *
 * The original file-level rationale comments (S99 sever-retrigger, S23 P4 strict-`<`,
 * S100/S103/S113 ignition rules) are preserved inline below — they document THIS code.
 */

import { findDefenderMatches, findGodlyMatch, getRecipe, makeTriggerEvent } from './godlyRecipes/index.ts';
import { findAllPentagramAnchors, pentagramOwnerForAnchor } from './godlyRecipes/pentagram.ts';
// S113 Batch C — importing the lightning-hub recipe also triggers its registerRecipe side-effect,
// exactly like the pentagram import above (registry parity with the pre-split module).
import { findAllLightningHubAnchors, lightningHubOwnerForAnchor } from './godlyRecipes/lightningHub.ts';
// ⛔ A VALUE IMPORT OF A RECIPE MODULE, WHICH FIRES ITS `registerRecipe` — SAFE HERE AND ONLY HERE.
// The S144/S151 trap is `world.ts -> ... -> a recipe module`, which registers every recipe for
// essentially the whole codebase. This file is on the OTHER side of that edge: it imports world.ts,
// world.ts does not import it. Both lines above are the same shape and have been for sessions.
import { findAllGoblinTowerAnchors, goblinTowerOwnerForAnchor } from './godlyRecipes/goblinTower.ts';
import type { GodlyId, GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { cinematicMsToTicks } from './creatures/creature.ts';
import { CUTSCENE_FADE_MS } from '../constants.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { dispatch, type World } from './world.ts';

/** The matcher's cross-frame cursor state (structural subset of GodlyOrchestrationState). */
export interface GodlyMatcherCursor {
  lastMatcherTick: number;
}

/** Main-thread side-effect injection points (all optional — worker mode passes none). */
export interface GodlyMatchSideEffects {
  /** Per fresh BOND_FORMED observation (debug probes; direct mode only). */
  observeBondFormed?: (effTick: number) => void;
  /** Fired with the matched event BEFORE the authoritative dispatch (transport broadcast slot). */
  beforeDispatch?: (event: GodlyTriggerEvent) => void;
  /** Fired AFTER the dispatch (codex unlock + probes slot). */
  afterDispatch?: (event: GodlyTriggerEvent) => void;
}

/**
 * S22 P3 — godly matcher (core). Host-only. Single trigger per invocation; queue handles
 * concurrent. Cursor advances to current tick after the scan (full sweep, not just the
 * matched eff). Returns the fired event (already dispatched into `world`) or null.
 */
export function runGodlyMatcherCore(
  world: World,
  state: GodlyMatcherCursor,
  fx: GodlyMatchSideEffects = {},
): GodlyTriggerEvent | null {
  if (!world.isHost) return null;

  // S100 P1 (TD Phase 1b, Layer 5) — SPAWNER ignition, scanned FIRST + DECOUPLED from the
  // cinematic single-slot (a pentagram never blocks, nor is blocked by, a cinematic).
  runSpawnerIgnition(world);
  // S103 P2 — DEFENDER ignition, same decoupled treatment.
  runDefenderIgnition(world);

  if (world.activeCinematicPlayerId !== null) return null; // queue handled in reducer

  let fired: GodlyTriggerEvent | null = null;
  for (const eff of world.effects) {
    // S99 — a godly is matched on any TOPOLOGY change: BOND_FORMED (build UP to the
    // pattern) OR a PLAYER-initiated BOND_SEVERED (reduce DOWN to it). Only cause
    // 'player' re-triggers; combat severs must not random-fire a godly. The single
    // loop + `break` caps to ONE trigger per invocation.
    const isForm = eff.kind === 'BOND_FORMED';
    const isPlayerSever = eff.kind === 'BOND_SEVERED' && eff.cause === 'player';
    if (!isForm && !isPlayerSever) continue;
    // S23 P2 — probe observation BEFORE the stale-cursor skip (surfaces every event).
    if (isForm && fx.observeBondFormed !== undefined) fx.observeBondFormed(eff.tick);
    // S23 P4 — strict `<` not `<=`: click-handler dispatches between physics ticks emit
    // BOND_FORMED with the current (un-advanced) world.tick; `<=` silently skipped those
    // (the "Voltkin never fires" root cause). Equality passes; only stale replays skip.
    if (eff.tick < state.lastMatcherTick) continue;
    const result = findGodlyMatch(world, eff.pos);
    if (result === null) continue;
    const event = makeTriggerEvent(result, world.tick);
    // Broadcast slot first so the client renders sooner (S22 D4 latency choice).
    if (fx.beforeDispatch !== undefined) fx.beforeDispatch(event);
    dispatch(world, { type: 'GODLY_TRIGGER', event });
    if (fx.afterDispatch !== undefined) fx.afterDispatch(event);
    fired = event;
    break; // single trigger per invocation; queue handles concurrent
  }
  // Advance cursor to current tick after scan.
  state.lastMatcherTick = world.tick;
  return fired;
}

/**
 * S113 Batch C — register the lowest un-registered anchor of ONE spawner recipe. Returns true if
 * it ignited one (caller stops — single ignition per frame). Per-(player, anchor) de-dup against
 * the live creatureSpawners map (can't double-register; CAN rebuild after removal).
 */
function igniteOneSpawnerRecipe(
  world: World,
  anchors: PrimitiveId[],
  ownerForAnchor: (world: World, anchor: PrimitiveId) => PlayerId | null,
  recipeId: GodlyId,
): boolean {
  for (const anchor of anchors) {
    const owner = ownerForAnchor(world, anchor);
    if (owner === null) continue;
    let alreadyLive = false;
    for (const sp of world.creatureSpawners.values()) {
      if (sp.anchorPrimitiveId === anchor && sp.ownerPlayerId === owner) {
        alreadyLive = true;
        break;
      }
    }
    if (alreadyLive) continue;
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: owner,
      anchorPrimitiveId: anchor,
      recipeId,
    });
    return true; // single ignition per frame (lowest-anchor tie-break)
  }
  return false;
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — host-only spawner ignition. Runs only on a topology change
 * this frame (BOND_FORMED or player-caused BOND_SEVERED); never touches the cinematic
 * single-slot or godlyFiredThisMatch. Pentagram scanned first (registry-order parity), then
 * the S113 lightning-hub; single ignition per frame.
 */
export function runSpawnerIgnition(world: World): void {
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  if (igniteOneSpawnerRecipe(world, findAllPentagramAnchors(world), pentagramOwnerForAnchor, 'pentagram')) return;
  if (igniteOneSpawnerRecipe(world, findAllLightningHubAnchors(world), lightningHubOwnerForAnchor, 'lightningHub')) return;
  /*
   * ⭐ S152 P2 — THE GOBLIN TOWER NEVER IGNITED. This line is the whole defect.
   *
   * S151 P3 shipped the tower's recipe, its predicate, its anchor finder, its owner resolver, its
   * teardown (`recipeStillSatisfied` case 'goblinTower') and 13 tests for the feed reducer — and
   * registered `goblinTowerRecipe` into the REGISTRY, whose spawner matcher (`findSpawnerMatch`)
   * has ZERO production callers. This function is the only live ignition path and it names its
   * recipes by hand, so the tower could be BUILT and would never become a spawner.
   *
   * ⛔ SO EVERY DOWNSTREAM GATE WAS CORRECT AND UNREACHABLE. `applyFeedTower`'s Gate 1 looks the
   * spawner up in `world.creatureSpawners`; there was never an entry to find. The S151 handoff
   * recorded "it builds, it IGNITES, it tears down" — building and teardown were true, ignition
   * was not, and nothing failed because no test drove BUILD_BLUEPRINT through this sweep.
   *
   * ⚠ A REGISTERED RECIPE IS NOT A LIVE RECIPE. That is the durable lesson: registration only
   * feeds `findSpawnerMatch`, and adding a recipe to the registry looks like wiring it up.
   */
  igniteOneSpawnerRecipe(world, findAllGoblinTowerAnchors(world), goblinTowerOwnerForAnchor, 'goblinTower');
}

/**
 * S103 P2 — host-only DEFENDER ignition (mirror of runSpawnerIgnition). On a topology change,
 * scan every registered defender recipe for a buildable anchor and REGISTER_DEFENDER each
 * (one per recipe per frame; predicates already skip live anchors — the map check below is
 * defense-in-depth).
 */
export function runDefenderIgnition(world: World): void {
  /*
   * ⭐ S157 B6 (owner) — **DEFENDERS IGNITE DURING BUILD ONLY, WHICH IS ALSO THE "ONLY NEXT TURN" RULE.**
   *
   * Owner: *"if she is destroyed but tower is up he will not produce another helga during the same
   * fight stage that she was destroyed in. only next turn."*
   *
   * Before this, ignition ran on ANY topology change anywhere on the board, with a single de-dup:
   * "is a defender already live at this anchor?". So killing Helga and then forming any bond anywhere
   * re-summoned her instantly, mid-fight, for free — proven by review (delete her, push one
   * BOND_FORMED, she is back in the same FIGHT).
   *
   * ⛔ AND THE FIX IS A PHASE GATE RATHER THAN A NEW SPENT-SET, deliberately. The obvious build is a
   * per-phase `Set<PrimitiveId>` of anchors that have already summoned — but that is new WORLD state,
   * which means serializing it, hashing it, adding it to FIELD_COVERAGE and to the worker
   * differential's SEEDING_COVERAGE, and another PROTOCOL_VERSION bump. The phase gate delivers the
   * owner's rule EXACTLY ("only next turn") with no new state at all, because a turn boundary is
   * precisely a BUILD.
   *
   * It is also coherent for the whole roster, not a Helga special case: `canBuildNow` already refuses
   * every placement outside BUILD, so a recipe can only be COMPLETED during BUILD anyway. The one
   * behaviour this removes is a structure being severed DOWN into a valid recipe mid-fight and popping
   * a tower into existence — which is not a thing a player should be able to do while the walls are
   * down.
   */
  if (world.matchPhase !== 'BUILD') return;
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  for (const { recipe, match } of findDefenderMatches(world, { x: 0, y: 0 })) {
    let alreadyLive = false;
    for (const d of world.defenders.values()) {
      if (d.anchorPrimitiveId === match.anchorPrimitiveId) { alreadyLive = true; break; }
    }
    if (alreadyLive) continue;
    dispatch(world, {
      type: 'REGISTER_DEFENDER',
      defenderKind: recipe.defenderKind,
      ownerPlayerId: match.triggererPlayerId,
      anchorPrimitiveId: match.anchorPrimitiveId,
      recipeId: recipe.id,
      pos: { x: match.pos.x, y: match.pos.y },
    });
  }
}

/**
 * S122 P1 — WORKER-side cinematic lifecycle (the sim-authoritative half of
 * startCinematicIfNeeded). Direct mode completes a cinematic via the render overlay's
 * wall-clock onComplete (cutsceneOverlay fade-end → GODLY_COMPLETE + queue advance); the
 * worker has no overlay, so completion is scheduled in the TICK domain at the exact fade-end
 * moment the S31 P0-1 math already defines: cinematicMsToTicks(cinematicMs + sustainedEffectMs
 * + CUTSCENE_FADE_MS). Deterministic (replay-safe), and it removes any main→worker completion
 * round-trip. The same transition also schedules pendingCreatureSpawn — the EXACT host-only
 * block of startCinematicIfNeeded (same fireAtTick value by construction).
 *
 * Main-thread in worker mode keeps running the render startCinematicIfNeeded on the MIRROR
 * for overlay/vignette (the client's existing posture); its local GODLY_COMPLETE echo on the
 * mirror is overwritten by the next snapshot — exactly like a joiner's.
 */
export interface WorkerCinematicState {
  lastOwner: PlayerId | null;
  completeAtTick: number | null;
}

export function makeWorkerCinematicState(): WorkerCinematicState {
  return { lastOwner: null, completeAtTick: null };
}

export function tickWorkerCinematics(world: World, cs: WorkerCinematicState): void {
  const owner = world.activeCinematicPlayerId;
  if (owner !== cs.lastOwner) {
    cs.lastOwner = owner;
    if (owner === null) {
      // Non-null → null outside our own completion (GODLY_ABORT path): drop the schedule.
      cs.completeAtTick = null;
    } else {
      const event = world.currentCinematicEvent;
      const recipe = event !== null ? getRecipe(event.godlyId) : undefined;
      if (event !== null && recipe !== undefined && recipe.kind === 'cinematic') {
        const delayTicks = cinematicMsToTicks(
          recipe.cinematicMs + recipe.sustainedEffectMs + CUTSCENE_FADE_MS,
        );
        cs.completeAtTick = world.tick + delayTicks;
        // S28 P0 / S31 P0-1 — the host-only pendingCreatureSpawn schedule, verbatim value.
        world.pendingCreatureSpawn = {
          fireAtTick: world.tick + delayTicks,
          event,
        };
      } else {
        cs.completeAtTick = null;
      }
    }
  }
  if (owner !== null && cs.completeAtTick !== null && world.tick >= cs.completeAtTick) {
    cs.completeAtTick = null;
    dispatch(world, { type: 'GODLY_COMPLETE' });
    // Queue advance — the cutsceneOverlay.onComplete behavior, tick-domain.
    const next = world.pendingCinematics.shift();
    if (next !== undefined) {
      dispatch(world, { type: 'GODLY_TRIGGER', event: next });
    }
    // Reset to null (the completion moment) so the NEXT invocation observes the
    // null→chained-owner transition and schedules the chained cinematic — one
    // invocation later, exactly like direct mode's startCinematicIfNeeded picking
    // up the onComplete-dispatched trigger on the following frame.
    cs.lastOwner = null;
  }
}
