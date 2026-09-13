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

import { VOLTKIN_EMERGE_MS } from '../constants.ts';
import { Controls } from '../input/controls.ts';
import { NetTransport } from '../net/transport.ts';
import { CinematicVignetteHandle } from '../render/cinematicVignette.ts';
/*
 * ⭐ S174 (b) — THE `unlockGodly` IMPORT THAT STOOD HERE IS GONE, AND SO IS `codexStore.ts`.
 *
 * Owner, from the live build: *"all the ones that are hidden, that are undiscovered yet — that's
 * silly, because I've obviously discovered all of them, I play all the games… It should ALL be
 * discovered right from the start."*
 *
 * The codex no longer HAS an unlock set to write into, so the call this docblock's S87 P4 note was
 * built around (splitting the store out of the overlay to keep Pixi off the eager index chunk) has
 * nothing left to do. That headroom win survives the deletion — there is now no codex import here
 * at all, which is strictly lighter than the one it replaced.
 */
import { CutsceneOverlay } from '../render/cutsceneOverlay.ts';
import type { DebugOverlayHandle, RuntimeProbes } from '../render/debugOverlay.ts';
import { playOneShot } from '../render/audioManager.ts';
import { cinematicMsToTicks } from './creatures/creature.ts';
import { getRecipe } from './godlyRecipes/index.ts';
// S122 P1 — the matcher core (spawner/defender ignition + the cinematic matcher loop) lives in
// godlyMatcherCore.ts (worker-safe, state-only imports); this module is the render-side wrapper.
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
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
  // S122 P1 — matcher core extracted to state/godlyMatcherCore.ts (worker-safe: no render
  // imports). This wrapper re-injects the three main-thread side effects at their ORIGINAL
  // call sites, preserving byte-identical direct-mode behavior + ordering (probe observation
  // before the stale-cursor skip; transport broadcast BEFORE the dispatch; unlock + probe
  // flag after it). Worker mode calls the core directly and performs these on BatchResult.
  runGodlyMatcherCore(world, state, {
    observeBondFormed: (effTick) => {
      // S23 P2 — record BOND_FORMED observation for the debug overlay.
      if (ctx.debugOverlay !== null && effTick > ctx.debugProbes.lastBondFormedTick) {
        ctx.debugProbes.lastBondFormedTick = effTick;
        ctx.debugProbes.bondFormedCount += 1;
      }
    },
    beforeDispatch: (event) => {
      // Broadcast first so client renders sooner (D4 standalone latency choice).
      if (ctx.netTransport !== null && isNetworked(world)) {
        ctx.netTransport.send({ kind: 'GODLY_TRIGGER', event });
      }
    },
    afterDispatch: () => {
      // ⭐ S174 (b) — the `unlockGodly(event.godlyId)` that led this block is gone with the codex's
      // discovery mechanism. The probe flag is the whole body now; the dispatch itself is untouched.
      ctx.debugProbes.matcherFiredEver = true;
    },
  });
  ctx.debugProbes.lastMatcherTick = world.tick;
}

// S122 P1 — igniteOneSpawnerRecipe / runSpawnerIgnition / runDefenderIgnition MOVED VERBATIM
// to state/godlyMatcherCore.ts (worker-safe). The matcher core calls them; nothing else here did.

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
  /*
   * ⭐ S158 P5 (CF-S157-d) — THE CUTSCENE PLAYS ONCE PER MATCH; THE VOLTKIN STILL COMES EVERY TIME.
   *
   * Owner: *"voltkin cinematic SHOULD be once per game for the first person to have built him. but
   * the voltkin spawn himself should be generated every time someone builds his tower."*
   *
   * `cinematicIsFirstShowing` is captured by `applyGodlyTrigger` from `godlyFiredThisMatch` in the
   * one instant the answer still exists — immediately before it records the id.
   *
   * ⛔ A REPEAT IS PLAYED SILENTLY, NOT SKIPPED. `cutsceneOverlay.onComplete` (below) is the SOLE
   * driver of `GODLY_COMPLETE` and of `pendingCinematics` advancement, so returning early here would
   * latch `activeCinematicPlayerId` forever and queue every later Voltkin behind it. The silent run
   * keeps the clock, the completion, the queue and `pendingCreatureSpawn` byte-identical, and drops
   * only the video, the voice and the vignette.
   */
  /*
   * ⭐⭐ S175 P4b (owner) — **ALWAYS SILENT. THE CUTSCENE IS GONE.**
   *
   * Owner: *"you know how now there is the cutscene where you can see kind of a TV, and it stops the
   * whole game — we'll remove that and just make it like a cool animation inside the game without a
   * cutscene."* And, on what replaces it: *"it's gonna be like the tower is being built … kind of
   * like when bosses come out. But even cooler."*
   *
   * ⛔ IT IS STILL A SILENT PLAY, NOT A SKIP, AND THAT IS THE WHOLE REASON THIS LINE IS NOT A
   * `return`. `cutsceneOverlay.onComplete` below is the SOLE driver of `GODLY_COMPLETE` and of
   * `pendingCinematics` advancement. Not calling `play()` would latch `activeCinematicPlayerId`
   * forever and queue every later Voltkin behind it — strictly worse than the cutscene it removes.
   * S158 P5 wrote that warning for the repeat case; S175 makes every showing take that path.
   *
   * ⚠ `cinematicIsFirstShowing` IS DELIBERATELY LEFT ALONE. It is sim state, it is hashed, and
   * `godlyCinematicOnce.test.ts` (11 cases) still guards it. Making the RENDERER ignore it costs
   * nothing; deleting it would be a wire change for no gain, and it is what a future 'play the
   * cinematic in a replay/theatre mode' would read.
   */
  const silent = true;
  // The vignette dims the board for everyone who is NOT the summoner — it exists to frame the
  // cutscene, so it goes with it. Without this gate, a repeat would dim the screen for the other
  // players for ~4.8 s with nothing to look at, which is worse than either extreme.
  if (owner !== localPlayerId && !silent) ctx.vignette.setVisible(true);
  const targetPos = event.targetPos;
  void ctx.cutsceneOverlay.play(recipe, {
    silent,
    silentDurationMs: VOLTKIN_EMERGE_MS,
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
    /*
     * ⭐⭐ S175 P4b — THE 4.8 s DELAY IS GONE WITH THE THING IT EXISTED FOR.
     *
     * Everything above this line is the S31 reasoning for the old number, and it is kept because it
     * explains why the number was RIGHT: the creature was held back until `bg.alpha` reached 0 so
     * its entry pulse was not spent under an opaque overlay. There is no overlay any more. Holding
     * the delay would leave the summoner watching an unchanged board for five seconds — the exact
     * complaint, moved rather than fixed.
     *
     * ⚠ THIS MOVES REPLAY AND DIFFERENTIAL BASELINES, and that is expected rather than a regression:
     * `pendingCreatureSpawn.fireAtTick` is sim state and the Voltkin now arrives ~4 s earlier.
     */
    world.pendingCreatureSpawn = {
      fireAtTick: world.tick + cinematicMsToTicks(VOLTKIN_EMERGE_MS),
      event,
    };
  }
  // S31 P0-4 — cinematicTimer setTimeout REMOVED here. Pre-S31 this fired
  // GODLY_COMPLETE at `recipe.cinematicMs + recipe.sustainedEffectMs` (Voltkin
  // 4500ms). Duplicate of cutsceneOverlay.completeTimer → fade → onComplete
  // path which fires GODLY_COMPLETE 300ms later at fade-end (4800ms). Single
  // dispatch path via `cutsceneOverlay.onComplete`.
}
