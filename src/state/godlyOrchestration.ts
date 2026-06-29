/**
 * SPARK — Godly cinematic matcher + lifecycle orchestration.
 *
 * Extracted from main.ts in S50 P2 (Council Standard-tier refactor, Battle
 * Ledger C2 ADOPT 4 extractions). Pre-S50 these two functions lived inside
 * the 1010-LOC bootstrap() closure in main.ts; closure state migrated to a
 * mutable holder so the orchestrator remains pure-function-ish per Council
 * R1 architectural-correctness vote (PRIME-AUDIT Δ1: read deps per-invocation,
 * never capture at factory creation).
 *
 * Two functions, called from main.ts ticker:
 *   runGodlyMatcher        — host-only; scans world.effects for BOND_FORMED
 *                            matching a registered recipe; fires GODLY_TRIGGER
 *                            (+ broadcasts to client in 1v1).
 *   startCinematicIfNeeded — both peers; detects activeCinematicPlayerId
 *                            transition; kicks/aborts CutsceneOverlay, manages
 *                            counter-window vignette + pendingCreatureSpawn.
 *
 * State (mutable, single instance per session):
 *   lastMatcherTick     — cursor for stale-BOND_FORMED skip (strict `<`, S23 P4)
 *   lastCinematicOwner  — previous activeCinematicPlayerId for transition detection
 */

import { Controls } from '../input/controls.ts';
import { NetTransport } from '../net/transport.ts';
import { CinematicVignetteHandle } from '../render/cinematicVignette.ts';
// S87 P4 — unlockGodly moved to codexStore.ts (tiny localStorage helper) so this
// always-eager orchestration no longer drags the heavy CodexOverlay Pixi class
// into the index chunk; main.ts lazy-loads the overlay UI on first Codex click.
import { unlockGodly } from '../render/codexStore.ts';
import { CutsceneOverlay, FADE_MS } from '../render/cutsceneOverlay.ts';
import type { DebugOverlayHandle, RuntimeProbes } from '../render/debugOverlay.ts';
import { playOneShot } from '../render/audioManager.ts';
import { cinematicMsToTicks } from './creatures/creature.ts';
import { findDefenderMatches, findGodlyMatch, getRecipe, makeTriggerEvent } from './godlyRecipes/index.ts';
import { findAllPentagramAnchors, pentagramOwnerForAnchor } from './godlyRecipes/pentagram.ts';
// S113 Batch C — the lightning-hub spawner recipe. Importing it also triggers its registerRecipe
// side-effect (Codex TOWERS & STRUCTURES tab), exactly like the pentagram import above.
import { findAllLightningHubAnchors, lightningHubOwnerForAnchor } from './godlyRecipes/lightningHub.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { dispatch, isNetworked, type World } from './world.ts';

export interface GodlyOrchestrationState {
  /** Last tick at which the matcher cursor advanced. Strict `<` skip (S23 P4). */
  lastMatcherTick: number;
  /** Previous activeCinematicPlayerId observed (transition detection). */
  lastCinematicOwner: number | null;
}

export function makeGodlyOrchestrationState(): GodlyOrchestrationState {
  return { lastMatcherTick: -1, lastCinematicOwner: null };
}

export interface GodlyOrchestrationCtx {
  /** Read PER-INVOCATION (PRIME-AUDIT Δ1) — caller may have reconnected. */
  netTransport: NetTransport | null;
  /** Null when ?debug=1 absent. */
  debugOverlay: DebugOverlayHandle | null;
  /** Mutable probe values shared with main.ts debug strip. */
  debugProbes: RuntimeProbes;
  cutsceneOverlay: CutsceneOverlay;
  vignette: CinematicVignetteHandle;
  controls: Controls;
}

/**
 * S22 P3 — godly matcher. Host-only. Single trigger per frame; queue handles
 * concurrent. Cursor advance to current tick after scan (full sweep, not just
 * the matched eff).
 */
export function runGodlyMatcher(
  world: World,
  state: GodlyOrchestrationState,
  ctx: GodlyOrchestrationCtx,
): void {
  if (!world.isHost) return;

  // S100 P1 (TD Phase 1b, Layer 5) — SPAWNER ignition, scanned FIRST + DECOUPLED
  // from the cinematic single-slot. This runs BEFORE the `activeCinematicPlayerId`
  // early-return below, so a spawner can ignite while ANY player's cinematic plays
  // (and vice-versa) — a pentagram never blocks, nor is blocked by, a cinematic. It
  // dispatches REGISTER_SPAWNER directly: it NEVER touches activeCinematicPlayerId /
  // pendingCinematics, and is EXCLUDED from godlyFiredThisMatch (gated instead
  // per-(playerId, anchorPrimitiveId) against the LIVE creatureSpawners map below —
  // rebuildable after a raid, multiple players may each have one).
  runSpawnerIgnition(world);
  // S103 P2 — DEFENDER ignition, same decoupled-from-cinematic treatment as the spawner above.
  runDefenderIgnition(world);

  if (world.activeCinematicPlayerId !== null) return; // queue handled in reducer
  for (const eff of world.effects) {
    // S99 — a godly is matched on any TOPOLOGY change, not just bond creation:
    // BOND_FORMED (build UP to the pattern) OR a PLAYER-initiated BOND_SEVERED
    // (reduce DOWN to it). The user built a big structure then DELETED bonds
    // until it was a valid 4Sq→4Tr Voltkin chain — but the matcher only ran on
    // bond creation, so the reduction never re-evaluated. Only cause 'player'
    // re-triggers; bomb/creature/physics/godly severs do NOT (a chaotic combat
    // sever must not random-fire a godly). The single loop + `break` below still
    // caps to ONE trigger per frame, so a BOND_FORMED and a sever in the same
    // frame can't double-fire. findGodlyMatch scans the whole world (the Voltkin
    // predicate is global + ignores bondPos), so any qualifying eff.pos suffices.
    const isForm = eff.kind === 'BOND_FORMED';
    const isPlayerSever = eff.kind === 'BOND_SEVERED' && eff.cause === 'player';
    if (!isForm && !isPlayerSever) continue;
    // S23 P2 — record BOND_FORMED observation for debug overlay BEFORE the
    // stale-cursor skip so the probe surfaces every event even if matcher
    // skips it for cursor reasons. (Sever observations aren't probed here.)
    if (isForm && ctx.debugOverlay !== null && eff.tick > ctx.debugProbes.lastBondFormedTick) {
      ctx.debugProbes.lastBondFormedTick = eff.tick;
      ctx.debugProbes.bondFormedCount += 1;
    }
    // S23 P4 — strict `<` not `<=`. Click-handler dispatches between physics
    // ticks emit BOND_FORMED with the current (un-advanced) world.tick;
    // `<=` against a cursor that already equals world.tick silently skipped
    // those. This is the root cause of "Voltkin never fires" — the final
    // bond completes the chain via a click dispatch that the matcher then
    // ignored. Equality now passes; only ticks BELOW cursor (stale replays)
    // are skipped.
    if (eff.tick < state.lastMatcherTick) continue;
    const result = findGodlyMatch(world, eff.pos);
    if (result === null) continue;
    const event = makeTriggerEvent(result, world.tick);
    // Broadcast first so client renders sooner (D4 standalone latency choice).
    if (ctx.netTransport !== null && isNetworked(world)) {
      ctx.netTransport.send({ kind: 'GODLY_TRIGGER', event });
    }
    dispatch(world, { type: 'GODLY_TRIGGER', event });
    // Codex unlock on host (mirrors client-side unlock on receipt).
    unlockGodly(event.godlyId);
    ctx.debugProbes.matcherFiredEver = true;
    break; // single trigger per frame; queue handles concurrent
  }
  // Advance cursor to current tick after scan.
  state.lastMatcherTick = world.tick;
  ctx.debugProbes.lastMatcherTick = world.tick;
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — host-only spawner ignition. Decoupled from the
 * cinematic single-slot: dispatches REGISTER_SPAWNER WITHOUT touching
 * activeCinematicPlayerId / pendingCinematics, and never consults / mutates
 * godlyFiredThisMatch.
 *
 * Gating (mirrors the cinematic matcher's intent, NOT its mechanism):
 *  - Run only on a topology change this frame (a BOND_FORMED or a PLAYER-caused
 *    BOND_SEVERED — build UP to the shape OR reduce DOWN to it; combat severs do
 *    NOT ignite). Without a qualifying effect, the shape can't have just changed,
 *    so there's nothing new to ignite. (The reducer + live-map de-dup below make a
 *    redundant scan harmless, but this keeps the per-tick cost out.)
 *  - De-dup per-(playerId, anchorPrimitiveId) against the LIVE creatureSpawners
 *    map: an anchor that is already a live spawner OWNED BY THE SAME PLAYER is
 *    skipped (can't double-register; CAN rebuild after the prior spawner was
 *    removed). Defense-in-depth: applyRegisterSpawner also no-ops on a duplicate
 *    anchor regardless of owner.
 *  - Multi-anchor-in-one-frame tie-break = LOWEST anchorPrimitiveId: enumerate all
 *    pentagram anchors ascending, register the first un-registered one, and stop
 *    (single ignition per frame, paralleling the cinematic matcher's `break`).
 */
/**
 * S113 Batch C — register the lowest un-registered anchor of ONE spawner recipe (generalizes the
 * original pentagram-only loop). Returns true if it ignited one (caller stops — single ignition per
 * frame). The per-(player, anchor) de-dup against the live creatureSpawners map is unchanged.
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
    // Already a live spawner on this anchor owned by this player? Skip (no double-register; rebuild
    // allowed after the prior one was removed).
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

function runSpawnerIgnition(world: World): void {
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  // Single ignition per frame. Scan pentagram first (registry-order parity), then the S113
  // lightning-hub; in practice only one spawner structure completes per topology-change frame, and
  // the per-(player,anchor) de-dup makes a redundant scan harmless either way.
  if (igniteOneSpawnerRecipe(world, findAllPentagramAnchors(world), pentagramOwnerForAnchor, 'pentagram')) return;
  igniteOneSpawnerRecipe(world, findAllLightningHubAnchors(world), lightningHubOwnerForAnchor, 'lightningHub');
}

/**
 * S103 P2 — host-only DEFENDER ignition (mirror of runSpawnerIgnition). On a topology change,
 * scan every registered defender recipe for a buildable anchor (each predicate already skips
 * anchors that are ALREADY live defenders — see DefenderRecipePredicate) and dispatch
 * REGISTER_DEFENDER for each. Decoupled from the cinematic single-slot (dispatches directly, never
 * touches activeCinematicPlayerId / godlyFiredThisMatch). One defender per recipe per frame; a
 * second turret/HELGA ignites on a later frame once its predicate surfaces the next anchor.
 */
function runDefenderIgnition(world: World): void {
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  for (const { recipe, match } of findDefenderMatches(world, { x: 0, y: 0 })) {
    // Defense-in-depth (the predicate already skips live anchors): don't double-register an anchor.
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
 * S22 P3 — cinematic lifecycle. Detects activeCinematicPlayerId transitions
 * and kicks/aborts CutsceneOverlay accordingly. Host-only schedules
 * pendingCreatureSpawn (S28 P0); both peers manage local overlay/vignette.
 */
export function startCinematicIfNeeded(
  world: World,
  state: GodlyOrchestrationState,
  ctx: GodlyOrchestrationCtx,
): void {
  const owner = world.activeCinematicPlayerId;
  if (owner === state.lastCinematicOwner) return;
  state.lastCinematicOwner = owner;
  if (owner === null) {
    // Transition non-null → null: ABORT or natural completion. The
    // cutsceneOverlay.onComplete callback (registered in cutsceneOverlay.play
    // below) is the sole driver of GODLY_COMPLETE dispatch + pendingCinematics
    // queue advancement at fade-end. This branch only tears down the visual
    // overlay / vignette on the abort path. Idempotent if already cleaned up
    // (overlay.abort() bails on inactive overlay; vignette.setVisible(false)
    // is a Pixi flag set).
    ctx.cutsceneOverlay.abort();
    ctx.vignette.setVisible(false);
    return;
  }
  // Transition null → non-null: find the recipe + start the cinematic.
  // S22 P4 — uses world.currentCinematicEvent (set by GODLY_TRIGGER reducer)
  // to pick the right recipe + target pos. Generalizes for Anvil / Pac-Predator.
  const event = world.currentCinematicEvent;
  if (event === null) {
    console.warn('[godly] active cinematic but no currentCinematicEvent on world');
    return;
  }
  const recipe = getRecipe(event.godlyId);
  if (recipe === undefined) {
    console.warn('[godly] no recipe registered for id', event.godlyId);
    return;
  }
  // S100 P1 (TD Phase 1b, Layer 5) — GodlyRecipe is now a discriminated union; the
  // cinematic pipeline (cutsceneOverlay.play + the timing reads below) only handles
  // the cinematic variant. A cinematic event should NEVER reference a spawner recipe
  // (spawner recipes dispatch REGISTER_SPAWNER, never GODLY_TRIGGER), so this guard
  // is defensive — narrow `recipe` to CinematicGodlyRecipe before touching its
  // cinematic-only fields (cinematicMs/sustainedEffectMs/etc.).
  if (recipe.kind !== 'cinematic') {
    console.warn('[godly] cinematic event references a non-cinematic recipe', event.godlyId);
    return;
  }
  const localPlayerId = ctx.controls.getPlayerId();
  if (owner !== localPlayerId) ctx.vignette.setVisible(true);
  const targetPos = event.targetPos;
  void ctx.cutsceneOverlay.play(recipe, {
    targetPos,
    onComplete: () => {
      // Idempotent — GODLY_COMPLETE clears activeCinematicPlayerId; next tick
      // observes the transition + handles vignette + advances queue.
      dispatch(world, { type: 'GODLY_COMPLETE' });
      // Advance queue: if pendingCinematics has an event, fire it.
      const next = world.pendingCinematics.shift();
      if (next !== undefined) {
        dispatch(world, { type: 'GODLY_TRIGGER', event: next });
      }
    },
    playVoice: (assetUrl: string) => {
      void playOneShot(assetUrl);
    },
  });
  // S28 P0 — REPLACE S25's wall-clock setTimeout-on-handoff (Council Q2
  // UNANIMOUS A single-slot pending-spawn flag). Host-only schedule: the
  // poll in the physics tick loop (Step 0 below) fires SPAWN_CREATURE at
  // `world.tick >= fireAtTick`, replay-safe + deterministic. PRIME-AUDIT
  // Δ6 single-slot overwrite guard: log a dev-mode warning if a previous
  // spawn is still pending (should never fire — upstream activeCinematic
  // serialization prevents two cinematics overlapping).
  if (world.isHost) {
    if (import.meta.env.DEV && world.pendingCreatureSpawn !== null) {
      console.warn(
        '[godly] startCinematic overwriting pending creature spawn',
        {
          existingFireAtTick: world.pendingCreatureSpawn.fireAtTick,
          currentTick: world.tick,
          newEvent: event.godlyId,
        },
      );
    }
    // S31 P0-1 — fireAtTick delayed by `sustainedEffectMs + FADE_MS` ticks
    // so SPAWN_CREATURE dispatches at the exact moment `bg.alpha` reaches 0
    // (cutsceneOverlay completes its fade-out). Pre-S31 the creature spawned
    // at `cinematicMs` (mp4-end), then ran ~48 of its 60-tick SPAWNING
    // animation UNDER the still-opaque overlay (`bg.alpha=1` for
    // sustainedEffectMs ms post-mp4, then linear fade over FADE_MS to 0).
    // Council Q1 ruled fade-START (spawn at +sustainedEffectMs only); PRIME-
    // AUDIT overrode to fade-END (+sustainedEffectMs + FADE_MS) because the
    // first 18 ticks of SPAWNING under the fade-out lose ~30% of the entry
    // pulse the fix is meant to expose. Spawn delay is now wall-clock
    // (cinematicMs + sustainedEffectMs + FADE_MS) → ticks-deterministic via
    // cinematicMsToTicks for replay safety.
    world.pendingCreatureSpawn = {
      fireAtTick: world.tick + cinematicMsToTicks(
        recipe.cinematicMs + recipe.sustainedEffectMs + FADE_MS,
      ),
      event,
    };
  }
  // S31 P0-4 — cinematicTimer setTimeout REMOVED here. Pre-S31 this fired
  // GODLY_COMPLETE at `recipe.cinematicMs + recipe.sustainedEffectMs` (Voltkin
  // 4500ms). Duplicate of cutsceneOverlay.completeTimer → fade → onComplete
  // path which fires GODLY_COMPLETE 300ms later at fade-end (4800ms). Single
  // dispatch path via `cutsceneOverlay.onComplete`.
}
