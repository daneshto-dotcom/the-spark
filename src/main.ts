/**
 * SPARK — entry point.
 * Sessions 1+2: Verlet physics + spawner + carry-1 + first bond.
 *
 * Frame loop (§ 10.6):
 *   accumulate dt → fixed-step physics ticks at 60 Hz → render
 *   per physics tick (host or solo only):
 *     dispatch SPAWN_SPARK for each spawn this tick
 *     for substep in 0..8:
 *       controls.applyPerSubstep   (attract force / cursor lock)
 *       verletStepAll
 *       solveBonds
 *       enforceBounds              (only for Free sparks)
 *       resolveCollisions
 *
 * S15 P2 (§ 11 LOCKED): gameState FSM extended with TITLE + LOBBY screens
 * for 1v1 networked play via Trystero. Boot enters TITLE; user picks
 * "1 Player" (solo, identical to post-S14) or "1v1 (2 Player)" → LOBBY
 * (host or join via 6-char room code) → PLAYING. Host runs authoritative
 * Verlet sim + emits NetSnapshot at NET_SNAPSHOT_HZ. Client renders
 * lerp-interpolated snapshots + sends INTENT envelopes.
 */

import { Application, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  NET_INTERPOLATION_MS,
  NET_SNAPSHOT_HZ,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from './constants.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from './game/spawner.ts';
import {
  snapshotInvariants,
  verifyInvariants,
  type InvariantSnapshot,
} from './game/invariants.ts';
import { Controls, type ControlsDispatchFn } from './input/controls.ts';
// S50 P2 — NetTransport / HostSync / ClientSync / generateRoomCode no longer
// referenced directly from main.ts after lobby-callback extraction (Battle
// Ledger C2). NetTransport type retained only for the __SPARK__ DEV accessor.
import type { NetTransport } from './net/transport.ts';
import { makeNetSession, teardownNet } from './net/session.ts';
import { createHostStartHandler, createBeginMatchHandler } from './net/hostHandlers.ts';
import { createJoinAttemptHandler } from './net/clientHandlers.ts';
import { SpatialGrid } from './physics/spatial.ts';
// S50 P2 — physics tick orchestration extracted to physicsLoop.ts (Council
// Standard-tier refactor, Battle Ledger C2). main.ts pre-S50 was 1221 LOC;
// stepPhysics + enforceFreeSparkCap + freeSparkArray + PHYSICS_DT/SUBSTEP_DT
// constants all lived at module scope here — mechanical extraction with
// zero behavior change. PHYSICS_DT re-imported here for the outer ticker
// accumulator (frame-rate-independent fixed-step loop).
import { stepPhysics, freeSparkArray, PHYSICS_DT } from './physics/physicsLoop.ts';
// S26 P0 — Voltkin Phase 2B: deterministic stub target computation for
// onCinematicHandoff. Per-substep Verlet integration + steering forces for
// creatures now live in physicsLoop.ts (consumed inside stepPhysics).
import { computeStubTargetPos } from './physics/creatureVerlet.ts';
// S27 P0 — Voltkin Phase 2C: AI target selection + attack-fire dispatch.
// findNearestBondTarget runs every CREATURE_TICK during SEEKING (Council R1 Q3
// UNANIMOUS A); bondMidpoint feeds the per-tick targetPos update so the
// existing steering forces (seek/arrive) home in on the nearest bond's center.
import { bondMidpoint, findNearestBondTarget } from './state/creatures/creatureAI.ts';
import { VOLTKIN_ATTACK_FIRE_TICK } from './state/creatures/creature.ts';
import { AvatarRenderer } from './render/avatarRenderer.ts';
import { drainAudioEffects, initAudio, isMuted, playMusic, toggleMute } from './render/audioManager.ts';
// S50 P2 — Audit Pass 2 refactor 622a7c7f: triggerReset is now called from
// inside teardownNet (extracted to src/net/session.ts). No direct main.ts
// import required.
import { EffectsRenderer } from './render/effectsRenderer.ts';
import { FogRenderer } from './render/fogRenderer.ts';
import { LobbyScreen } from './render/lobbyScreen.ts';
import { SparkRenderer, makeLegend, makeSpawnerRing } from './render/renderer.ts';
import { createSettingsOverlay } from './render/settingsOverlay.ts';
import { StatsOverlay } from './render/statsOverlay.ts';
import { StructureRenderer } from './render/structureRenderer.ts';
import { TitleScreen } from './render/titleScreen.ts';
import { HUD } from './render/ui.ts';
import { CutsceneOverlay } from './render/cutsceneOverlay.ts';
import { makeCinematicVignette } from './render/cinematicVignette.ts';
import { CodexOverlay, entryFromRecipe } from './render/codexOverlay.ts';
import { CreatureRenderer } from './render/creatureRenderer.ts';
import { ScreenShake, shouldTriggerShakeForArcFlash } from './render/screenShake.ts';
// S23 P2 — debug overlay (toggleable via ?debug=1 URL param). Surfaces runtime
// gates + audio chain + chain progress for in-vivo diagnosis when offline tests
// pass but live trigger doesn't fire.
import { createDebugOverlay, isDebugMode, type DebugOverlayHandle, type RuntimeProbes } from './render/debugOverlay.ts';
import { listRecipes } from './state/godlyRecipes/index.ts';
// S22 P4 — side-effect import registers Voltkin recipe in the registry.
import './state/godlyRecipes/voltkin.ts';
// S50 P2 — godly matcher + cinematic-lifecycle orchestration extracted to
// godlyOrchestration.ts (Council Standard-tier refactor, Battle Ledger C2).
// Pre-S50 these two functions (runGodlyMatcher + startCinematicIfNeeded)
// lived inside the 1010-LOC bootstrap() closure. State migrated to a mutable
// holder per PRIME-AUDIT Δ1 (per-invocation freshness on netTransport refs).
import {
  makeGodlyOrchestrationState,
  runGodlyMatcher,
  startCinematicIfNeeded,
} from './state/godlyOrchestration.ts';
import { mulberry32 } from './state/rng.ts';
import { dispatch, makeWorld, type GameAction, type GameState } from './state/world.ts';
import { makeGameStateExtras, softReset, tickGameState } from './state/gameState.ts';
import { saveToLocalStorage } from './state/save.ts';
import { asPlayerId } from './types.ts';

// S50 P2 — PHYSICS_DT / SUBSTEP_DT extracted to physicsLoop.ts; PHYSICS_DT
// re-imported (above) for the outer ticker accumulator.
const SPATIAL_CELL_SIZE = 32;
const P1 = asPlayerId(0);
const SNAPSHOT_INTERVAL_TICKS = Math.max(1, Math.round(PHYSICS_HZ / NET_SNAPSHOT_HZ));

async function bootstrap(): Promise<void> {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x000000,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  const root = document.getElementById('app');
  if (!root) throw new Error('No #app element in DOM');
  root.appendChild(app.canvas);

  const spawnerRing = makeSpawnerRing(SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS);
  const legend = makeLegend(app);
  app.stage.addChild(spawnerRing);
  app.stage.addChild(legend);

  // S16 P3.a — persistent BETA badge top-right of canvas. Added directly to
  // app.stage (not inside any screen container) so it's never hidden by
  // TITLE/LOBBY/WIN overlays. Cyan accent at low alpha for non-obtrusive
  // signaling that the build is not yet 1.0.
  const betaBadge = new Text({
    // S17 P3 — Phase-2 Tier-1 LIVE (Sever-as-disruption + multi-color bond
    // rendering). Badge text signals the build is past Phase-1 minimal.
    text: 'BETA · S17 PHASE-2',
    style: new TextStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0x3bd7ff,
      letterSpacing: 4,
    }),
  });
  betaBadge.anchor.set(1, 0);
  betaBadge.position.set(CANVAS_WIDTH - 12, 12);
  betaBadge.alpha = 0.55;
  app.stage.addChild(betaBadge);

  // S18 P1 — mute indicator. Small ♪ glyph anchored top-right (y=30),
  // between BETA badge (y=12) and connection dot (y=48). Added AFTER
  // BETA so child-add-order naturally renders it on top (Council R1
  // Grok #6 — no zIndex API needed). Dims when muted as visual feedback
  // for 'M' keypress.
  const muteIndicator = new Text({
    text: '♪',
    style: new TextStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0x3bd7ff,
    }),
  });
  muteIndicator.anchor.set(1, 0);
  muteIndicator.position.set(CANVAS_WIDTH - 12, 30);
  muteIndicator.alpha = 0.55;
  app.stage.addChild(muteIndicator);

  // S19 P1 — ⚙ settings icon at top-right next to ♪ glyph. Click opens
  // HTML overlay (createSettingsOverlay) for per-channel mute + volume.
  const settingsOverlay = createSettingsOverlay();
  const settingsIcon = new Text({
    text: '⚙',
    style: new TextStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0x3bd7ff,
    }),
  });
  settingsIcon.anchor.set(1, 0);
  settingsIcon.position.set(CANVAS_WIDTH - 32, 30);
  settingsIcon.alpha = 0.55;
  settingsIcon.eventMode = 'static';
  settingsIcon.cursor = 'pointer';
  settingsIcon.on('pointertap', () => {
    // initAudio() makes the gear icon double as a user-gesture trigger,
    // matching the pointerdown/keydown listeners below. Safe to call when
    // already initialized.
    initAudio();
    settingsOverlay.toggle();
  });
  app.stage.addChild(settingsIcon);

  const SEED = 0xc0ffee;
  const world = makeWorld(SEED);
  // S15 P2 — boot at TITLE (not 'PLAYING' which is the default for tests).
  world.gameState = 'TITLE';
  const rng = mulberry32(SEED);
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, rng);
  const gameStateExtras = makeGameStateExtras();

  // ===== S15 P2 — net session state (1v1 only). S50 P2 — unified into
  // NetSession state holder (Council Battle Ledger C3 ADOPT). Holder
  // identity preserved across the tick loop + lobby callback factories
  // so per-tick reads always see the latest reference. =====
  const session = makeNetSession();

  // S15 P2 — dispatcher injection. In solo or host mode, dispatch locally.
  // In client mode, wrap as INTENT and send via transport (host applies
  // authoritatively; snapshot returns ~RTT/2 later).
  //
  // S46 P2 C13 — client-side prediction for select actions. Joiner applies
  // PICKUP_SPARK + UPDATE_AVATAR_POS locally BEFORE wrapping as INTENT so
  // the carry + avatar-pos changes are visible at zero perceived latency.
  // Host's authoritative snapshot arrives ~RTT/2 later and reconciles. NO
  // prediction for PLACE_PRIMITIVE / SEVER_BOND (state mutations with
  // downstream effects — primitive IDs would conflict with host's).
  // Council Battle Ledger C13.
  const PREDICTABLE_ACTIONS: ReadonlySet<GameAction['type']> = new Set([
    'PICKUP_SPARK',
    // S58 (#2) — the LMB-up release of a spawner-spark claim. Predicted so the
    // joiner's spark returns to Free + player to Idle at zero perceived latency
    // (the host's authoritative snapshot reconciles ~RTT/2 later). Safe to
    // predict: applyDropSpark throws CarryViolation if not carrying, caught by
    // the try/catch below.
    'DROP_SPARK',
    'UPDATE_AVATAR_POS',
  ]);
  const dispatchFn: ControlsDispatchFn = (action: GameAction) => {
    if (
      world.gameMode === '1v1' &&
      !world.isHost &&
      session.clientSync !== null &&
      session.netTransport !== null
    ) {
      // S46 P2 — optimistic local apply for predictable actions.
      if (PREDICTABLE_ACTIONS.has(action.type)) {
        try {
          dispatch(world, action);
        } catch {
          // Local prediction may legitimately fail (e.g. race with another
          // joiner intent). Host snapshot will overwrite anyway — swallow.
        }
      }
      session.netTransport.send(session.clientSync.wrapIntent(action));
    } else {
      dispatch(world, action);
    }
  };

  const controls = new Controls(app, world, P1, dispatchFn);
  const sparkRenderer = new SparkRenderer(app);
  const structureRenderer = new StructureRenderer(app);
  // S25 P0 — creatureRenderer attached AFTER structureRenderer so creatures
  // render ABOVE prims (phase-through reads as overlap — blueprint Q1 z-order).
  const creatureRenderer = new CreatureRenderer(app);
  const effectsRenderer = new EffectsRenderer(app);
  // S30 P0e — global screen-shake instance. Triggered on Voltkin fire-tick
  // (when CREATURE_ATTACK successfully severs a bond → ARC_FLASH emitted).
  // applyToStage runs every render frame to set/reset stage.position offset.
  const screenShake = new ScreenShake();
  // S45 BUG-CRITICAL-3 Sym B — AvatarRenderer now multi-player. Drops the
  // single-player `P1` arg; reads world.players + controls.getPlayerId()
  // internally to render each player's avatar at the right source (local =
  // controls.cursor lag-free; remote = world.players[id].avatarPos snapshot-
  // driven). Battle Ledger C3 + C10.
  const avatarRenderer = new AvatarRenderer(app);
  // S57 P1 — fog of war. Constructed AFTER avatarRenderer so its container sits
  // ABOVE the avatars (the enemy avatar glow is fogged until scouted; the local
  // avatar stays revealed at the centre of its own personal-vision cutout) and
  // BEFORE the HUD (the HUD is never fogged). Active only in 1v1 PLAYING; lifts
  // on WIN. Client-side cosmetic only — no network messages (each peer already
  // holds the full world.primitives via snapshot).
  const fogRenderer = new FogRenderer(app);
  const hud = new HUD(app);
  const stats = new StatsOverlay(app);
  const grid = new SpatialGrid(SPATIAL_CELL_SIZE);

  // ===== S22 P3 — godly cinematic overlay + counter-window vignette + Codex =====
  const recipeHint = (id: string): string => {
    // v1 hints are purposefully cryptic to preserve discovery. S24+ may refine.
    if (id === 'voltkin') return 'lightning meets a screen';
    return '???';
  };
  const cutsceneOverlay = new CutsceneOverlay(app);
  const vignette = makeCinematicVignette(app);
  const codexEntries = listRecipes().map((recipe) => entryFromRecipe(
    recipe,
    recipe.id.toUpperCase(),
    recipeHint(recipe.id),
  ));
  const codexOverlay = new CodexOverlay(app, codexEntries, () => {
    codexOverlay.setVisible(false);
  });

  // ===== S15 P2 — title + lobby screens =====
  const titleScreen = new TitleScreen(app, {
    onSoloSelected: () => {
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    },
    on1v1Selected: () => {
      world.gameState = 'LOBBY';
    },
    onCodexSelected: () => {
      codexOverlay.setVisible(true);
    },
  });

  // S50 P2 — lobby callbacks extracted to hostHandlers.ts + clientHandlers.ts.
  // lobbyScreen forward-declared so onLobbyError can be defined as a thunk
  // (late-bound) and passed to the factories before LobbyScreen exists.
  // Avoids circular-init pain without sacrificing type safety.
  let lobbyScreen: LobbyScreen;
  const onLobbyError = (errMsg: string): void => {
    lobbyScreen.setErrorMessage(errMsg);
  };
  const onHostStart = createHostStartHandler({ session, world, onLobbyError });
  const onJoinAttempt = createJoinAttemptHandler({
    session,
    world,
    controls,
    onLobbyError,
  });
  const onBeginMatch = createBeginMatchHandler({ session, world });

  lobbyScreen = new LobbyScreen(app, {
    onHostStart,
    onJoinAttempt,
    onBeginMatch,
    onBackToTitle: () => {
      // S31 P0-2 (PRIME-AUDIT Δ5 scope amendment) — route through reducer
      // dispatch so the new applyReturnToTitle cinematic-state-clear cleanup
      // applies on the lobby-back path too. Pre-S31 this set gameState
      // directly which bypassed the reducer cleanup entirely.
      teardownNet(session, world, controls, P1);
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    },
    onReturnFromConnectionLost: () => {
      teardownNet(session, world, controls, P1);
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    },
  });

  const hint = new Text({
    text: 'LMB drag spark → place · RMB click on bond → sever · Q shrink territory · ~ stats · C cinematics',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x444444 }),
  });
  hint.position.set(10, CANVAS_HEIGHT - 22);
  app.stage.addChild(hint);

  if (import.meta.env.DEV) {
    // S46 P1 — exposed lobbyScreen + titleScreen for Playwright E2E harness
    // (e2e/helpers.ts reads room code + clicks Pixi buttons via canvas coords).
    // Council C6/Δ1 — read live state via __SPARK__ instead of fragile visual
    // assertions. DEV-only; tree-shaken from production bundle.
    (globalThis as { __SPARK__?: unknown }).__SPARK__ = {
      get world() { return world; },
      get controls() { return controls; },
      get netTransport(): NetTransport | null { return session.netTransport; },
      get lobbyScreen() { return lobbyScreen; },
      get titleScreen() { return titleScreen; },
      get fogRenderer() { return fogRenderer; },
      app,
    };
  }

  let lastGameState: GameState = world.gameState;
  const resetIfPostgame = (): void => {
    if (world.gameState === 'POSTGAME') {
      // S15 P2 — POSTGAME → TITLE flow clears scoreProgress + drops P2 on
      // RETURN_TO_TITLE. Solo path: RETURN_TO_TITLE drops to TITLE; user
      // re-selects 1 Player to play again (cleaner than implicit replay).
      teardownNet(session, world, controls, P1);
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    }
  };
  app.canvas.addEventListener('click', resetIfPostgame);

  // S18 P1 — audio: lazy-init AudioContext on first user gesture anywhere
  // (canvas or window). Browser autoplay policy requires this to be inside
  // a user-gesture handler. Idempotent — initAudio() is a no-op after the
  // first call. Listener auto-removes (once: true).
  const initAudioOnGesture = (): void => { initAudio(); };
  window.addEventListener('pointerdown', initAudioOnGesture, { once: true });
  window.addEventListener('keydown', initAudioOnGesture, { once: true });

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && world.gameState === 'POSTGAME') {
      resetIfPostgame();
    }
    if (e.key === 'c' || e.key === 'C') {
      world.cinematicsEnabled = !world.cinematicsEnabled;
    }
    // S18 P1 — 'M' toggles audio mute. Gated on activeElement not being an
    // input/textarea so typing 'M' into the lobby room-code input doesn't
    // toggle mute (PRIME-AUDIT A).
    if (e.key === 'm' || e.key === 'M') {
      const focusedTag = document.activeElement?.tagName;
      if (focusedTag !== 'INPUT' && focusedTag !== 'TEXTAREA') {
        toggleMute();
      }
    }
  });

  let invariantSnap: InvariantSnapshot = snapshotInvariants(world.primitives);
  let lastViolationLogTick = -Infinity;
  let physicsAccumulator = 0;

  // S50 P2 — godly orchestration state (lastMatcherTick + lastCinematicOwner)
  // migrated to godlyOrchestration.ts (Battle Ledger C2 — closure state moved
  // to mutable holder). Holder identity preserved across invocations.
  const godlyState = makeGodlyOrchestrationState();
  // S23 P2 — debug overlay state. Tracked here so closure scope can expose to
  // the overlay; only created when ?debug=1 is in the URL.
  let debugOverlay: DebugOverlayHandle | null = null;
  const debugProbes: RuntimeProbes = {
    lastMatcherTick: -1,
    lastBondFormedTick: -1,
    bondFormedCount: 0,
    matcherFiredEver: false,
  };
  if (isDebugMode()) {
    debugOverlay = createDebugOverlay();
    console.log('[debug] overlay enabled via ?debug=1 — copy snapshot by clicking panel');
  }
  // S50 P2 — lastCinematicOwner migrated to godlyState (above).
  // S31 P0-4 — `cinematicTimer` REMOVED. Previously this main.ts-scoped
  // setTimeout fired GODLY_COMPLETE at `cinematicMs + sustainedEffectMs`;
  // cutsceneOverlay.completeTimer ALSO fires GODLY_COMPLETE via its
  // onComplete callback at the same offset + FADE_MS. Single dispatch path
  // now goes through `cutsceneOverlay.onComplete` (set inside
  // `startCinematicIfNeeded` in godlyOrchestration.ts).
  let lastConnectionLost = false;
  // S31 P0-3 — client-side cursor for ARC_FLASH-triggered screen-shake. Host
  // triggers shake locally inside the `!isClient` block in the tick loop;
  // client peer must mirror that feedback or 1v1 plays as visually & kinesthe-
  // tically silent on Voltkin attacks. Cursor tracks the highest ARC_FLASH
  // tick already shaken-for so subsequent snapshots that re-deliver the same
  // (still-alive) effect don't re-trigger the shake every frame. Reset to
  // -Infinity on PLAYING→TITLE transition (P0-2 watcher below) so re-entering
  // PLAYING starts fresh. Implicit-detection per PRIME-AUDIT Δ2 (Council Q3
  // ruled explicit SCREEN_SHAKE NetMessage; overridden per YAGNI — refactor
  // when Anvil ships a non-ARC_FLASH shake source).
  let clientLastShakeArcFlashTick = -Infinity;

  // S50 P2 — runGodlyMatcher + startCinematicIfNeeded extracted to
  // src/state/godlyOrchestration.ts. Both invoked from the ticker (below).

  // S45 BUG-CRITICAL-3 Sym B — UPDATE_AVATAR_POS dispatch throttle state.
  // Council R2 C2 + PRIME-AUDIT Δ2: throttle in main.ts game-loop at 10Hz +
  // delta-skip (|dx|+|dy|<2px) to match snapshot cadence without intent-flood
  // on the Nostr/torrent transport. State is closure-scoped so each session
  // resets cleanly via game-mode transitions.
  const AVATAR_POS_DISPATCH_MIN_INTERVAL_MS = 100; // 10 Hz cap
  const AVATAR_POS_DISPATCH_MIN_DELTA_PX = 2;      // skip-jitter floor
  let lastAvatarPosDispatchMs = 0;
  let lastDispatchedCursorX = Number.NEGATIVE_INFINITY;
  let lastDispatchedCursorY = Number.NEGATIVE_INFINITY;

  app.ticker.add((tickerObj) => {
    const dtSec = Math.min(tickerObj.deltaMS / 1000, 0.05);
    physicsAccumulator += dtSec;

    const physStart = performance.now();
    while (physicsAccumulator >= PHYSICS_DT) {
      const isClient = world.gameMode === '1v1' && !world.isHost;
      if (world.gameState === 'PLAYING' && !isClient) {
        stepPhysics(world, spawner, grid, controls);
      } else {
        // S56 P1 (GAP 1) — client-side AttractDrag prediction. The client runs
        // no authoritative physics, but it MUST run the local attract-follow so
        // the joiner's dragged free spark tracks their cursor identically to the
        // host. Root cause of the playtest "shape frozen at spawn then teleports
        // on release" report: applyPerSubstep (the stepAttractLerp follow) lived
        // ONLY inside stepPhysics(), which is !isClient-gated — so it never ran
        // on the client. Mirror the host's PHYSICS_SUBSTEPS cadence INSIDE this
        // same accumulator-bounded tick loop (dtSec is clamped to 0.05 above →
        // ≤3 ticks/frame, identical to the host → no frame-rate overshoot;
        // Council GROK#3 refuted via the clamp). applyPerSubstep is the exact
        // host code path; its null/!Free spark guard (controls.ts) ends the drag
        // cleanly if the host despawns/grabs/consumes the spark mid-gesture
        // (Council edge R2 / Gemini-D). GAP 2 — the 10Hz snapshot rebuild
        // resetting the dragged spark to spawn — is closed in
        // ClientSync.interpolateInto (sync.ts preserve/restore).
        if (world.gameState === 'PLAYING' && isClient) {
          for (let i = 0; i < PHYSICS_SUBSTEPS; i++) controls.applyPerSubstep();
        }
        world.tick++;
      }
      tickGameState(world, gameStateExtras, P1);

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
        !isClient &&
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
      //      Q6 UNANIMOUS A: dispatch lives in main.ts (NOT in applyCreatureTick),
      //      preserving CQS "no-re-dispatch-in-reducer" for the CREATURE_TICK
      //      action specifically (applyCreatureAttack's re-dispatch of
      //      SEVER_BOND is a separate, Council-sanctioned exception).
      if (world.gameState === 'PLAYING' && !isClient && world.creatures.size > 0) {
        const creatureIds = Array.from(world.creatures.keys());
        for (const id of creatureIds) {
          // Step 1: AI target re-selection BEFORE the tick. Only during SEEKING —
          // SPAWNING is force-free, ATTACKING is locked to its current target for
          // the cycle duration, DESPAWNING is fading out.
          const creature = world.creatures.get(id);
          if (creature !== undefined && creature.state === 'SEEKING') {
            const nextTarget = findNearestBondTarget(world, creature);
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

          // Step 2: FSM tick.
          dispatch(world, { type: 'CREATURE_TICK', creatureId: id });

          // Step 3: post-tick attack fire check. Re-fetch creature (the tick may
          // have transitioned state OR auto-deleted at despawnAtTick boundary).
          const after = world.creatures.get(id);
          if (
            after !== undefined &&
            after.state === 'ATTACKING' &&
            after.ticksInState === VOLTKIN_ATTACK_FIRE_TICK &&
            after.targetBondId !== null
          ) {
            const bondId = after.targetBondId;
            dispatch(world, {
              type: 'CREATURE_ATTACK',
              creatureId: id,
              bondId,
            });
            // S30 P0e — trigger screen-shake when CREATURE_ATTACK emits an
            // ARC_FLASH this tick. S33 P1-6 replaced the prior
            // `!world.bonds.has(bondId)` gate with an explicit ARC_FLASH
            // predicate (shouldTriggerShakeForArcFlash) — functionally
            // identical today (creatureAttack.ts only emits ARC_FLASH on
            // successful sever) but forward-defended for Anvil cleave/AOE
            // that may sever bonds without ARC_FLASH or emit ARC_FLASH
            // without bond delta. Replay-safe + 1v1-safe (host + client
            // read the same effects stream).
            if (shouldTriggerShakeForArcFlash(world.effects, world.tick)) {
              screenShake.trigger(world.tick);
            }
          }
        }
      }

      // S15 P2 — host emits NetSnapshot every SNAPSHOT_INTERVAL_TICKS
      // (60Hz / 10Hz = 6 ticks). Suppressed in TITLE/LOBBY (no snapshot
      // to send pre-game) and in solo.
      //
      // S47 P1 (Sym I fix): gate WIDENED from `gameState === 'PLAYING'`
      // to `PLAYING|WIN|POSTGAME`. Pre-fix, host stopped sending snapshots
      // the instant it transitioned to WIN, leaving joiner stuck at the
      // last PLAYING snapshot forever — joiner never saw the win and the
      // game ended silently on the remote side. Defence-in-depth alongside
      // the dedicated ENDGAME envelope below: snapshots keep flowing so the
      // joiner gets continuous interpolation through the WIN dwell + POSTGAME
      // freeze, AND a guaranteed ENDGAME envelope fires once on the transition.
      if (
        (world.gameState === 'PLAYING' ||
          world.gameState === 'WIN' ||
          world.gameState === 'POSTGAME') &&
        world.gameMode === '1v1' &&
        world.isHost &&
        session.hostSync !== null &&
        session.netTransport !== null &&
        world.tick - session.lastSnapshotTick >= SNAPSHOT_INTERVAL_TICKS
      ) {
        session.netTransport.send(session.hostSync.buildSnapshotMessage(world));
        session.lastSnapshotTick = world.tick;
      }

      if (import.meta.env.DEV && world.gameState === 'PLAYING' && !isClient) {
        const violations = verifyInvariants(world.primitives, world.freeSparks, invariantSnap);
        if (violations.length > 0 && world.tick - lastViolationLogTick > 60) {
          console.error('[SPARK] invariant violation tick=' + world.tick, violations);
          lastViolationLogTick = world.tick;
        }
        invariantSnap = snapshotInvariants(world.primitives);
      }
      if (world.gameState === 'POSTGAME' && lastGameState !== 'POSTGAME') {
        saveToLocalStorage(world);
      }
      // S47 P1 (Sym I fix) — host broadcasts ENDGAME envelope on the
      // PLAYING→WIN transition so the joiner is informed even if the
      // accompanying snapshot is dropped on the wire. The envelope was
      // defined in protocol.ts since at least S15 but NEVER wired —
      // host never called netTransport.send({kind:'ENDGAME', ...}) and
      // joiner had no recv handler. Same anti-pattern as parseNetMessage
      // being defined-but-never-called pre-S38 audit.
      //
      // Transition guard: fire ONCE on the PLAYING→WIN edge, NOT every
      // tick while in WIN. lastWinnerId is set synchronously by the
      // WIN_TRIGGER reducer (world.ts:360-363) so it's authoritative at
      // this point. 1v1-only — solo has no peer to notify.
      if (
        world.gameState === 'WIN' &&
        lastGameState !== 'WIN' &&
        world.gameMode === '1v1' &&
        world.isHost &&
        session.netTransport !== null &&
        world.lastWinnerId !== null
      ) {
        session.netTransport.send({ kind: 'ENDGAME', winnerId: world.lastWinnerId });
      }
      // S18 P1 — start background music on transition to PLAYING. Covers
      // solo + 1v1 host + 1v1 client paths (client transitions via snapshot
      // showing gameState='PLAYING'). Idempotent — playMusic() is no-op when
      // already playing (Council Adoption-F).
      if (world.gameState === 'PLAYING' && lastGameState !== 'PLAYING') {
        void playMusic();
      }
      // S31 P0-2 — *→TITLE transition orchestration cleanup. Mirrors the
      // reducer-side cinematic-state-clear (gameMode.ts applyReturnToTitle)
      // by tearing down ORCHESTRATION state that lives outside the world
      // object: the HTMLVideoElement + Pixi sprite + ticker callback owned
      // by cutsceneOverlay, the stage offset owned by screenShake, and the
      // lastCinematicOwner watcher used to gate startCinematicIfNeeded.
      // Fires on POSTGAME→TITLE (canvas click → resetIfPostgame → dispatch),
      // lobby Back-to-Title (onBackToTitle → dispatch), and peer-drop via
      // onReturnFromConnectionLost. Idempotent on no-cinematic-active path:
      // cutsceneOverlay.abort bails when isActive() is false; screenShake.reset
      // is plain field assignment; lastCinematicOwner=null is a noop when
      // already null. Without this hook, mid-cinematic title-return would
      // leave the HTMLVideoElement playing audio off-DOM, the ticker pumping
      // a dead Texture, and the stage offset stuck at last-shake-amplitude.
      if (world.gameState === 'TITLE' && lastGameState !== 'TITLE') {
        cutsceneOverlay.abort();
        screenShake.reset();
        // S34 P2-16 — explicit sprite cleanup. The reducer-side
        // applyReturnToTitle clears world.creatures, but creatureRenderer's
        // internal sprite Map is orchestration state; its sync() prune runs
        // AFTER this transition watcher on the next render frame. clear()
        // closes the one-frame orphan-sprite window (PRIME-AUDIT Δ3).
        // Container preserved — next PLAYING entry can re-mount sprites.
        creatureRenderer.clear();
        godlyState.lastCinematicOwner = null;
        // S31 P0-3 — reset client shake cursor on TITLE transition so re-
        // entering PLAYING doesn't carry forward a stale tick threshold that
        // would suppress shake on the next ARC_FLASH if the new session's
        // host happens to be at a tick < clientLastShakeArcFlashTick.
        clientLastShakeArcFlashTick = -Infinity;
        // S60 P3(c) — clear explored grid + ghost memory + hide the brush pool so the
        // title is clean and the next match starts fresh (covers all *→TITLE paths:
        // lobby Back, POSTGAME→title, peer-drop).
        fogRenderer.reset();
      }
      lastGameState = world.gameState;
      physicsAccumulator -= PHYSICS_DT;
    }
    stats.recordPhysics(performance.now() - physStart);

    // S15 P2 — client interpolation. Runs every render frame to lerp
    // primitive + freeSpark positions between prev + current snapshot.
    //
    // S52 P1 Council C4 — pass dragLockedSparkId so the spark currently
    // being AttractDragged locally (or in the 300ms post-LMB-up window
    // pendingPlaceFromFree) is skipped by the interpolation loop. Without
    // this, the joiner's local stepAttractLerp writes are clobbered every
    // 100ms by the host's stale "spark at spawn" snapshot — symptom user
    // reported as "they stay at spawn point and then teleport to supposed
    // leave point" + visual jitter during drag.
    if (world.gameMode === '1v1' && !world.isHost && session.clientSync !== null) {
      session.clientSync.interpolateInto(
        world,
        performance.now(),
        NET_INTERPOLATION_MS,
        controls.getDragLockedSparkId() ?? undefined,
      );
      // S31 P0-3 — implicit shake trigger on mirrored ARC_FLASH. Scan the
      // just-rehydrated world.effects (replaced by applySnapshotCore inside
      // interpolateInto when needsFullApply) for any ARC_FLASH whose host
      // emit-tick is newer than the cursor; trigger shake at that tick and
      // advance the cursor. Multiple ARC_FLASHes in one snapshot collapse
      // to one shake at the latest tick (matches host behavior: ScreenShake.
      // trigger replaces existing shake, no stacking).
      let latestArcFlashTick = clientLastShakeArcFlashTick;
      for (const e of world.effects) {
        if (e.kind === 'ARC_FLASH' && e.tick > latestArcFlashTick) {
          latestArcFlashTick = e.tick;
        }
      }
      if (latestArcFlashTick > clientLastShakeArcFlashTick) {
        screenShake.trigger(latestArcFlashTick);
        clientLastShakeArcFlashTick = latestArcFlashTick;
      }
    }

    // S15 P2 — screen visibility gate (TITLE / LOBBY overlays).
    const showTitle = world.gameState === 'TITLE';
    const showLobby = world.gameState === 'LOBBY';
    if (titleScreen.isVisible() !== showTitle) titleScreen.setVisible(showTitle);
    lobbyScreen.setVisible(showLobby);

    // S16 P3.b — hide spawner ring + legend during TITLE/LOBBY so they don't
    // bleed through the overlay panes (user-flagged after S15 screenshot review).
    const inOverlayScreen = showTitle || showLobby;
    spawnerRing.visible = !inOverlayScreen;
    legend.visible = !inOverlayScreen;

    // S15 P2 — connection-lost overlay (1v1, PLAYING, no peers).
    const connectionLost = world.gameMode === '1v1'
      && world.gameState === 'PLAYING'
      && session.netTransport !== null
      && session.netTransport.peerCount() === 0;
    lobbyScreen.setConnectionLostVisible(connectionLost);
    // S22 P3 — PRIME-AUDIT Δ3: on peer-drop, abort any active cinematic
    // and drain the godly queue cleanly. Transition-edge gated.
    if (connectionLost && !lastConnectionLost) {
      // S31 P0-4 — cinematicTimer cleanup REMOVED (deleted alongside the
      // setTimeout that created it). cutsceneOverlay.abort() internally
      // clears all overlay-owned setTimeout handles via its `this.timers`
      // sweep, so cinematic teardown remains complete on peer-drop.
      cutsceneOverlay.abort();
      vignette.setVisible(false);
      dispatch(world, { type: 'GODLY_ABORT' });
      godlyState.lastCinematicOwner = null;
    }
    lastConnectionLost = connectionLost;

    // S22 P3 — godly matcher (host-only) + cinematic transition watcher.
    // Matcher scans BOND_FORMED in world.effects before effectsRenderer wipes.
    // S50 P2 — ctx reconstructed per-frame so netTransport ref is fresh (Δ1).
    if (world.gameState === 'PLAYING') {
      const godlyCtx = {
        netTransport: session.netTransport,
        debugOverlay,
        debugProbes,
        cutsceneOverlay,
        vignette,
        controls,
      };
      runGodlyMatcher(world, godlyState, godlyCtx);
      startCinematicIfNeeded(world, godlyState, godlyCtx);
    }

    // S15 P2 — update lobby peer status when waiting.
    if (showLobby && session.netTransport !== null) {
      lobbyScreen.updatePeerStatus(session.netTransport.peerCount());
      // S39 P1 — visible-to-user wire diagnostics while joining + connected.
      // Surfaces the three S38-audit silent-drop modes (rejected at parseNetMessage,
      // applyNetSnapshot throw, snapshot never arriving) without requiring
      // `?debug=1` console + live retest. Host pane doesn't show this strip
      // (only the joiner is the one stuck waiting; host knows they pressed Begin).
      if (!world.isHost && session.netTransport.peerCount() > 0) {
        const td = session.netTransport.getDiagnostics();
        const errs = session.clientSync !== null ? session.clientSync.applyErrors() : 0;
        // S44 — surface multi-strategy health (Council G-NEW-2 / GE-NEW-2).
        // Shows e.g. "nostr:6/7" = 6 of 7 relays connected. Failed strategies
        // shown as "torrent:fail". Disabled strategies omitted from the strip.
        const strategySummary = td.strategies
          .filter((s) => s.state !== 'disabled')
          .map((s) => {
            if (s.state === 'failed') return `${s.name}:fail`;
            if (s.state === 'starting') return `${s.name}:…`;
            const ok = s.relays.filter((r) => r.connected).length;
            const total = s.relays.length;
            return total > 0 ? `${s.name}:${ok}/${total}` : `${s.name}:✓`;
          })
          .join(' ');
        lobbyScreen.updateDiagnostics(
          `sync ${td.accepted}/${td.accepted + td.rejected} ` +
          `seq=${td.lastSeq} kind=${td.lastKind ?? '—'} ` +
          `applyErr=${errs} gs=${world.gameState} ` +
          `[${strategySummary}]`,
        );
      } else {
        lobbyScreen.updateDiagnostics('');
      }
      // S46 P1 Phase A.0 — host-side diagnostic strip. Mirror joiner pattern
      // so the host can SEE the load-bearing state for the BUG-CRITICAL-4
      // "Begin Match never appears" regression. Three hypothesis spaces:
      //   H1 — Trystero one-way: pc=0 on host while joiner says connected
      //   H2 — Silent throw in ticker upstream: mode/hc/bv values inconsistent
      //   H3 — Latch drift: hc=true but bv=false (or vice versa)
      // User screenshots this strip during 2-peer smoke → empirical root cause.
      if (world.isHost) {
        const td = session.netTransport.getDiagnostics();
        const ds = lobbyScreen.getDebugState();
        const strategySummary = td.strategies
          .filter((s) => s.state !== 'disabled')
          .map((s) => {
            if (s.state === 'failed') return `${s.name}:fail`;
            if (s.state === 'starting') return `${s.name}:…`;
            const ok = s.relays.filter((r) => r.connected).length;
            const total = s.relays.length;
            return total > 0 ? `${s.name}:${ok}/${total}` : `${s.name}:✓`;
          })
          .join(' ');
        lobbyScreen.updateHostDiagnostics(
          `host pc=${session.netTransport.peerCount()} mode=${ds.mode} ` +
          `hc=${ds.hostConnected} bv=${ds.beginButtonVisible} ` +
          `gm=${world.gameMode} gs=${world.gameState} ` +
          `[${strategySummary}]`,
        );
      } else {
        lobbyScreen.updateHostDiagnostics('');
      }
    }

    // S15 P2 — HUD connection dot.
    hud.setConnectionPeers(session.netTransport !== null ? session.netTransport.peerCount() : 0);

    // S18 P1 — mute indicator visual feedback (dim + slash glyph when muted).
    if (isMuted()) {
      muteIndicator.text = '♪̸';
      muteIndicator.alpha = 0.25;
    } else {
      muteIndicator.text = '♪';
      muteIndicator.alpha = 0.55;
    }

    // S45 BUG-CRITICAL-3 Sym B — dispatch throttled UPDATE_AVATAR_POS so both
    // players' avatarPos field stays current in the snapshot stream. Host
    // dispatches locally (world.players[hostId].avatarPos updates immediately
    // → next snapshot to joiner). Joiner dispatches as INTENT (host receives
    // → applies → next snapshot reflects joiner.avatarPos). The
    // applyUpdateAvatarPos reducer (state/gameMode.ts:152) ALSO syncs the
    // carrier's carried spark.pos when player.kind === 'Carrying' — this is
    // the load-bearing Sym A coupling that makes joiner-built primitives land
    // at the joiner's intended position instead of the stale pickup-time pos.
    // Council Battle Ledger C2 (10Hz throttle) + Δ2 (in game-loop, not
    // controls.ts). Gated on PLAYING + 1v1 — solo mode has no remote viewer
    // so dispatch is wasted work + would also be a no-op (reducer would only
    // update the local player's avatarPos for nobody to see).
    if (world.gameState === 'PLAYING' && world.gameMode === '1v1') {
      const nowMs = performance.now();
      const dx = controls.cursor.x - lastDispatchedCursorX;
      const dy = controls.cursor.y - lastDispatchedCursorY;
      const enoughDelta = Math.abs(dx) + Math.abs(dy) >= AVATAR_POS_DISPATCH_MIN_DELTA_PX;
      const enoughElapsed =
        nowMs - lastAvatarPosDispatchMs >= AVATAR_POS_DISPATCH_MIN_INTERVAL_MS;
      if (enoughDelta && enoughElapsed) {
        dispatchFn({
          type: 'UPDATE_AVATAR_POS',
          playerId: controls.getPlayerId(),
          pos: { x: controls.cursor.x, y: controls.cursor.y },
        });
        lastAvatarPosDispatchMs = nowMs;
        lastDispatchedCursorX = controls.cursor.x;
        lastDispatchedCursorY = controls.cursor.y;
      }
    }

    const renderStart = performance.now();
    // S30 P0e — apply screen-shake offset to stage BEFORE renderers sync.
    // Idempotent: when shake is inactive/expired, this sets stage.position back
    // to (0, 0). Per-frame call so the offset decays smoothly through the
    // shake duration (6 ticks). Stage offset is global — every Pixi child
    // inherits the translation, giving the whole play-field the shake feel.
    screenShake.applyToStage(app.stage, world.tick);
    const freeSparkArr = freeSparkArray(world.freeSparks);
    // S45 Sym C(a) — pass world for per-frame carrier-color tint resolution
    // of Carried-state sparks. SparkRenderer falls back to FREE_SPARK_TINT
    // defensively when world omitted or carrier missing (Battle Ledger C4).
    sparkRenderer.sync(freeSparkArr, world);
    structureRenderer.sync(world);
    // S25 P0 — creature sprite sync. After structureRenderer (z-order: above
    // prims, blueprint Q1) and before effectsRenderer (so ARC_FLASH effects
    // can stack above creatures in S27). Cheap when world.creatures empty.
    creatureRenderer.sync(world);
    // S18 P1 — drain audio effects BEFORE effectsRenderer (which wipes
    // world.effects). Cursor-gated; replay-safe.
    drainAudioEffects(world.effects, world.tick);
    // S23 P2 — debug overlay sync runs BEFORE effects wipe so chain-progress
    // sees this frame's bonds. Cheap when null (no-op).
    if (debugOverlay !== null) debugOverlay.sync(world, debugProbes);
    effectsRenderer.sync(world);
    avatarRenderer.sync(world, controls);
    // S57 P1 — fog mask. Live cursor = personal-vision centre (lag-free);
    // ticker.deltaMS drives the win-lift fade. Cheap no-op in solo / once lifted.
    fogRenderer.sync(world, controls.cursor, app.ticker.deltaMS / 1000);
    hud.sync(world);
    stats.recordWorld(world, effectsRenderer.activeCount);
    stats.recordFrame(world.freeSparks.size + world.primitives.size);
    stats.recordRender(performance.now() - renderStart);
  });
}

// S50 P2 — stepPhysics, freeSparkArray, enforceFreeSparkCap, PHYSICS_DT,
// SUBSTEP_DT extracted to src/physics/physicsLoop.ts. Mechanical extraction;
// no behavior change.

// Suppress softReset unused-import warning (kept available for future hooks).
void softReset;

bootstrap().catch((err) => {
  console.error('SPARK boot failure:', err);
});
