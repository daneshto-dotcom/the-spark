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
  FREE_SPARK_SOFT_CAP,
  NET_INTERPOLATION_MS,
  NET_SNAPSHOT_HZ,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from './constants.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG, enforceSpawnerBounds } from './game/spawner.ts';
import {
  snapshotInvariants,
  verifyInvariants,
  type InvariantSnapshot,
} from './game/invariants.ts';
import { Controls, type ControlsDispatchFn } from './input/controls.ts';
import { NetTransport } from './net/transport.ts';
import { HostSync, ClientSync } from './net/sync.ts';
import { generateRoomCode } from './net/protocol.ts';
import { resolveCollisions } from './physics/collision.ts';
import { solveBonds, type Bond } from './physics/bonds.ts';
import { SpatialGrid } from './physics/spatial.ts';
import { verletStepAll } from './physics/verlet.ts';
// S26 P0 — Voltkin Phase 2B: per-substep Verlet integration + steering forces for
// creatures, plus deterministic stub target computation for onCinematicHandoff.
// Host-only at the caller (stepPhysics is already gated by `!isClient` at line 509).
import {
  computeStubTargetPos,
  computeSteeringAccel,
  creatureVerletStep,
} from './physics/creatureVerlet.ts';
// S27 P0 — Voltkin Phase 2C: AI target selection + attack-fire dispatch.
// findNearestBondTarget runs every CREATURE_TICK during SEEKING (Council R1 Q3
// UNANIMOUS A); bondMidpoint feeds the per-tick targetPos update so the
// existing steering forces (seek/arrive) home in on the nearest bond's center.
import { bondMidpoint, findNearestBondTarget } from './state/creatures/creatureAI.ts';
import { cinematicMsToTicks, VOLTKIN_ATTACK_FIRE_TICK } from './state/creatures/creature.ts';
import { AvatarRenderer } from './render/avatarRenderer.ts';
import { drainAudioEffects, initAudio, isMuted, playMusic, playOneShot, toggleMute } from './render/audioManager.ts';
// Audit Pass 2 refactor 622a7c7f: replace direct `resetAudioDrainCursor`
// import with the state-layer publisher seam. audioManager registers its
// cursor-reset handler at module-init (side effect of the import above);
// `triggerReset()` then fires it from inside the state lifecycle.
import { triggerReset as triggerAudioCursorReset } from './state/audioCursor.ts';
import { EffectsRenderer } from './render/effectsRenderer.ts';
import { LobbyScreen } from './render/lobbyScreen.ts';
import { SparkRenderer, makeLegend, makeSpawnerRing } from './render/renderer.ts';
import { createSettingsOverlay } from './render/settingsOverlay.ts';
import { StatsOverlay } from './render/statsOverlay.ts';
import { StructureRenderer } from './render/structureRenderer.ts';
import { TitleScreen } from './render/titleScreen.ts';
import { HUD } from './render/ui.ts';
import { CutsceneOverlay, FADE_MS } from './render/cutsceneOverlay.ts';
import { makeCinematicVignette } from './render/cinematicVignette.ts';
import { CodexOverlay, unlockGodly, entryFromRecipe } from './render/codexOverlay.ts';
import { CreatureRenderer } from './render/creatureRenderer.ts';
import { ScreenShake, shouldTriggerShakeForArcFlash } from './render/screenShake.ts';
// S23 P2 — debug overlay (toggleable via ?debug=1 URL param). Surfaces runtime
// gates + audio chain + chain progress for in-vivo diagnosis when offline tests
// pass but live trigger doesn't fire.
import { createDebugOverlay, isDebugMode, type DebugOverlayHandle, type RuntimeProbes } from './render/debugOverlay.ts';
import { findGodlyMatch, makeTriggerEvent, listRecipes, getRecipe } from './state/godlyRecipes/index.ts';
// S22 P4 — side-effect import registers Voltkin recipe in the registry.
import './state/godlyRecipes/voltkin.ts';
import { mulberry32 } from './state/rng.ts';
import { dispatch, makeWorld, type GameAction, type GameState } from './state/world.ts';
import { makeGameStateExtras, softReset, tickGameState } from './state/gameState.ts';
import { saveToLocalStorage } from './state/save.ts';
import { asPlayerId } from './types.ts';
import type { Spark } from './game/spark.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
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

  // ===== S15 P2 — net session state (1v1 only) =====
  let netTransport: NetTransport | null = null;
  let hostSync: HostSync | null = null;
  let clientSync: ClientSync | null = null;
  let lastSnapshotTick = 0;

  // S15 P2 — dispatcher injection. In solo or host mode, dispatch locally.
  // In client mode, wrap as INTENT and send via transport (host applies
  // authoritatively; snapshot returns ~RTT/2 later).
  const dispatchFn: ControlsDispatchFn = (action: GameAction) => {
    if (
      world.gameMode === '1v1' &&
      !world.isHost &&
      clientSync !== null &&
      netTransport !== null
    ) {
      netTransport.send(clientSync.wrapIntent(action));
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

  const lobbyScreen = new LobbyScreen(app, {
    onHostStart: () => {
      const code = generateRoomCode();
      netTransport = new NetTransport();
      hostSync = new HostSync();
      world.isHost = true;
      // S20 P0 — surface NetTransport errors (signaling, ICE, send) to the
      // lobby statusText in red so users see the failure layer rather than
      // an indefinite "Waiting for Player 2..." stall (the S19 P4-unresolved
      // BLOCKER root cause: zero error plumbing existed).
      netTransport.onError = (errMsg) => lobbyScreen.setErrorMessage(errMsg);
      netTransport.connect(code);
      netTransport.on((msg) => {
        if (msg.kind === 'INTENT' && hostSync !== null) {
          // S15 P2 — host applies client intent authoritatively.
          // S42 — turn-based active-player gate REMOVED (blueprint mandates
          // real-time). Shared-resource race conditions (e.g. both players
          // grab same spark) are resolved by first-Intent-wins host-receive
          // order; loser's intent silently no-ops + increments
          // world.diagnostics.raceRejects (observable for tests).
          dispatch(world, msg.action);
        }
        // S22 P3 — clients never send GODLY_TRIGGER (host-only authority,
        // Battle Ledger row 9). Defensive: drop GODLY_TRIGGER from clients silently.
      });
      return code;
    },
    onJoinAttempt: (code) => {
      netTransport = new NetTransport();
      clientSync = new ClientSync();
      world.isHost = false;
      // S35 P0 — break 1v1 join bootstrap deadlock. The render-loop client-
      // interpolation gate at this file's `if (world.gameMode === '1v1' && ...)`
      // (call site below `app.ticker.add`) is the only path that runs
      // clientSync.interpolateInto → applyNetSnapshot. Without setting gameMode
      // here, the gate stays false because the joiner's world.gameMode stays
      // at the makeWorld default 'solo' — so host's NETSNAPSHOT (which carries
      // gameMode='1v1' + gameState='PLAYING') is RECEIVED but never APPLIED.
      // Host avoids this trap because applyStartGame sets gameMode='1v1'
      // synchronously on onBeginMatch. Setting it here at the joiner's setup-
      // entry-point is symmetric. RETURN_TO_TITLE resets gameMode='solo' so
      // back-out remains clean. Bug pre-dates S15 commit add497f (~20 sessions);
      // explains pending "1v1 brother retest" carry items.
      world.gameMode = '1v1';
      controls.setPlayerId(asPlayerId(1));
      // S42 — non-serialized convention field; HUD energy gauge reads this
      // to render the LOCAL player's energy (replaces removed currentPlayerId
      // "active player" concept). Default asPlayerId(0) covers solo + 1v1
      // host; this assignment covers the 1v1 client peer. Council R1 Battle
      // Ledger row 3 (Grok-C3 ADOPT + Gemini-R2 validated).
      world.localPlayerId = asPlayerId(1);
      // S20 P0 — same onError wiring as host path (see comment above).
      netTransport.onError = (errMsg) => lobbyScreen.setErrorMessage(errMsg);
      netTransport.connect(code);
      netTransport.on((msg) => {
        if (msg.kind === 'NETSNAPSHOT' && clientSync !== null) {
          clientSync.receive(msg, performance.now());
        }
        // S22 P3 — receive host-broadcast godly trigger; apply locally.
        // Client NEVER runs the recipe predicate itself (anti-desync,
        // Battle Ledger row 9). Predicate is host-only.
        if (msg.kind === 'GODLY_TRIGGER') {
          dispatch(world, { type: 'GODLY_TRIGGER', event: msg.event });
        }
        // S39 P1 — dedicated lobby-exit signal. Pre-S39 the peer exited
        // LOBBY only when a NETSNAPSHOT arrived AND applied cleanly; after
        // S38 audit Pass-1/2 added try/catch + strict schemaVersion gate,
        // any silent drop on that path stranded the peer in lobby. This
        // signal kicks the peer's FSM to PLAYING immediately (snapshots
        // still drive authoritative state afterwards). isHost stays false
        // — the peer never claims host authority. Idempotent: only fires
        // when still in LOBBY so a late/duplicate signal (e.g. reconnect
        // ordering, future retry path) can't reset pendingCreatureSpawn
        // that snapshots may have already populated.
        if (msg.kind === 'START_GAME_SIGNAL' && world.gameState === 'LOBBY') {
          dispatch(world, { type: 'START_GAME', mode: msg.mode, isHost: false });
        }
      });
    },
    onBeginMatch: () => {
      // Host triggers START_GAME. The first snapshot will carry
      // gameState='PLAYING' + gameMode='1v1' to the client. S39 P1: also
      // broadcast a dedicated START_GAME_SIGNAL envelope BEFORE the local
      // dispatch so the peer's lobby-exit is decoupled from snapshot
      // delivery reliability (S38 audit added 3 silent-drop points to the
      // snapshot apply chain — strict schemaVersion at the wire, try/catch
      // at applyNetSnapshot, JSON shape validation). Order matters: send
      // first while world.gameState is still LOBBY so the peer learns of
      // the transition at the earliest possible RTT.
      if (netTransport !== null) {
        netTransport.send({ kind: 'START_GAME_SIGNAL', mode: '1v1' });
      }
      dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true });
    },
    onBackToTitle: () => {
      // S31 P0-2 (PRIME-AUDIT Δ5 scope amendment) — route through reducer
      // dispatch so the new applyReturnToTitle cinematic-state-clear cleanup
      // (world.creatures + nextCreatureId + activeCinematicPlayerId +
      // currentCinematicEvent + pendingCinematics + pendingCreatureSpawn)
      // applies on the lobby-back path too. Pre-S31 this set gameState
      // directly which bypassed the reducer cleanup entirely.
      teardownNet();
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    },
    onReturnFromConnectionLost: () => {
      teardownNet();
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    },
  });

  function teardownNet(): void {
    if (netTransport !== null) {
      netTransport.disconnect();
      netTransport = null;
    }
    hostSync = null;
    if (clientSync !== null) {
      clientSync.reset();
      clientSync = null;
    }
    controls.setPlayerId(P1);
    world.isHost = true;
    lastSnapshotTick = 0;
    // Audit Pass 1 fix 3c8630d7 (Δ4 carry-forward) + Pass 2 refactor 622a7c7f:
    // every production RTT path in main.ts calls teardownNet first (onBackToTitle
    // / onReturnFromConnectionLost / resetIfPostgame), so firing the cursor
    // reset here covers the full lifecycle. Pre-Pass-2 this was a direct
    // `resetAudioDrainCursor()` call (state→render dep edge — Pass-1 fix);
    // post-Pass-2 it routes through the state-layer publisher, which dispatches
    // to audioManager's registered handler. Without this, after a postgame→
    // TITLE round-trip and a fresh PLAYING entry, audio cues whose `effect.tick`
    // straddles the cursor's prior maximum silently drop (latent since S18 P1
    // introduced the cursor pattern; affects clave, sever-fart, lightning-
    // crackle, and S37 CREATURE_CHARGE).
    triggerAudioCursorReset();
  }

  const hint = new Text({
    text: 'LMB drag spark out of zone → carry · RMB drag onto a primitive → bond · ~ stats · C cinematics',
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
      get netTransport() { return netTransport; },
      get lobbyScreen() { return lobbyScreen; },
      get titleScreen() { return titleScreen; },
      app,
    };
  }

  let lastGameState: GameState = world.gameState;
  const resetIfPostgame = (): void => {
    if (world.gameState === 'POSTGAME') {
      // S15 P2 — POSTGAME → TITLE flow clears scoreProgress + drops P2 on
      // RETURN_TO_TITLE. Solo path: RETURN_TO_TITLE drops to TITLE; user
      // re-selects 1 Player to play again (cleaner than implicit replay).
      teardownNet();
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

  // S22 P3 — godly matcher cursor. Tracks the last BOND_FORMED tick scanned
  // so the matcher processes each emission exactly once even when render
  // frames out-pace physics ticks.
  let lastMatcherTick = -1;
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
  // Track the most-recent activeCinematicPlayerId observed so we know when
  // to KICK the cutsceneOverlay (transition null → non-null) vs ABORT
  // (transition non-null → null via GODLY_ABORT).
  let lastCinematicOwner: number | null = null;
  // S31 P0-4 — `cinematicTimer` REMOVED. Previously this main.ts-scoped
  // setTimeout fired GODLY_COMPLETE at `cinematicMs + sustainedEffectMs`
  // (e.g. 4500ms for Voltkin); cutsceneOverlay.completeTimer ALSO fires
  // GODLY_COMPLETE via its onComplete callback at the same offset + FADE_MS
  // (4800ms for Voltkin). Two dispatches 300ms apart — idempotent today
  // (second was a no-op against null `activeCinematicPlayerId`) but a
  // latent break-day for any non-idempotent side-effect added later. Single
  // dispatch path now goes through `cutsceneOverlay.onComplete` (set inside
  // `startCinematicIfNeeded` below) which dispatches GODLY_COMPLETE and
  // shifts `world.pendingCinematics`. PRIME-AUDIT investigation confirmed
  // the 300ms shift is safe: `pendingCreatureSpawn` is single-slot, matcher
  // is gated on `activeCinematicPlayerId !== null`, and `lastCinematicOwner`
  // tracks the same field transition that the overlay-driven dispatch
  // resolves.
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

  function runGodlyMatcher(): void {
    if (!world.isHost) return;
    if (world.activeCinematicPlayerId !== null) return; // queue handled in reducer
    for (const eff of world.effects) {
      if (eff.kind !== 'BOND_FORMED') continue;
      // S23 P2 — record BOND_FORMED observation for debug overlay BEFORE the
      // stale-cursor skip so the probe surfaces every event even if matcher
      // skips it for cursor reasons.
      if (debugOverlay !== null && eff.tick > debugProbes.lastBondFormedTick) {
        debugProbes.lastBondFormedTick = eff.tick;
        debugProbes.bondFormedCount += 1;
      }
      // S23 P4 — strict `<` not `<=`. Click-handler dispatches between physics
      // ticks emit BOND_FORMED with the current (un-advanced) world.tick;
      // `<=` against a cursor that already equals world.tick silently skipped
      // those. This is the root cause of "Voltkin never fires" — the final
      // bond completes the chain via a click dispatch that the matcher then
      // ignored. Equality now passes; only ticks BELOW cursor (stale replays)
      // are skipped.
      if (eff.tick < lastMatcherTick) continue;
      const result = findGodlyMatch(world, eff.pos);
      if (result === null) continue;
      const event = makeTriggerEvent(result, world.tick);
      // Broadcast first so client renders sooner (D4 standalone latency choice).
      if (netTransport !== null && world.gameMode === '1v1') {
        netTransport.send({ kind: 'GODLY_TRIGGER', event });
      }
      dispatch(world, { type: 'GODLY_TRIGGER', event });
      // Codex unlock on host (mirrors client-side unlock on receipt).
      unlockGodly(event.godlyId);
      debugProbes.matcherFiredEver = true;
      break; // single trigger per frame; queue handles concurrent
    }
    // Advance cursor to current tick after scan.
    lastMatcherTick = world.tick;
    debugProbes.lastMatcherTick = world.tick;
  }

  function startCinematicIfNeeded(): void {
    const owner = world.activeCinematicPlayerId;
    if (owner === lastCinematicOwner) return;
    lastCinematicOwner = owner;
    if (owner === null) {
      // Transition non-null → null: ABORT or natural completion. The
      // cutsceneOverlay.onComplete callback (registered in cutsceneOverlay.play
      // below) is the sole driver of GODLY_COMPLETE dispatch + pendingCinematics
      // queue advancement at fade-end. This branch only tears down the visual
      // overlay / vignette on the abort path. Idempotent if already cleaned up
      // (overlay.abort() bails on inactive overlay; vignette.setVisible(false)
      // is a Pixi flag set).
      cutsceneOverlay.abort();
      vignette.setVisible(false);
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
    const localPlayerId = controls.getPlayerId();
    if (owner !== localPlayerId) vignette.setVisible(true);
    const targetPos = event.targetPos;
    void cutsceneOverlay.play(recipe, {
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
    // dispatch path via `cutsceneOverlay.onComplete` (line ~486-498 above).
  }

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
      // (60Hz / 10Hz = 6 ticks). Only fires in 1v1 PLAYING; suppressed
      // in TITLE/LOBBY (no snapshot to send pre-game) and in solo.
      if (
        world.gameState === 'PLAYING' &&
        world.gameMode === '1v1' &&
        world.isHost &&
        hostSync !== null &&
        netTransport !== null &&
        world.tick - lastSnapshotTick >= SNAPSHOT_INTERVAL_TICKS
      ) {
        netTransport.send(hostSync.buildSnapshotMessage(world));
        lastSnapshotTick = world.tick;
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
        lastCinematicOwner = null;
        // S31 P0-3 — reset client shake cursor on TITLE transition so re-
        // entering PLAYING doesn't carry forward a stale tick threshold that
        // would suppress shake on the next ARC_FLASH if the new session's
        // host happens to be at a tick < clientLastShakeArcFlashTick.
        clientLastShakeArcFlashTick = -Infinity;
      }
      lastGameState = world.gameState;
      physicsAccumulator -= PHYSICS_DT;
    }
    stats.recordPhysics(performance.now() - physStart);

    // S15 P2 — client interpolation. Runs every render frame to lerp
    // primitive + freeSpark positions between prev + current snapshot.
    if (world.gameMode === '1v1' && !world.isHost && clientSync !== null) {
      clientSync.interpolateInto(world, performance.now(), NET_INTERPOLATION_MS);
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
      && netTransport !== null
      && netTransport.peerCount() === 0;
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
      lastCinematicOwner = null;
    }
    lastConnectionLost = connectionLost;

    // S22 P3 — godly matcher (host-only) + cinematic transition watcher.
    // Matcher scans BOND_FORMED in world.effects before effectsRenderer wipes.
    if (world.gameState === 'PLAYING') {
      runGodlyMatcher();
      startCinematicIfNeeded();
    }

    // S15 P2 — update lobby peer status when waiting.
    if (showLobby && netTransport !== null) {
      lobbyScreen.updatePeerStatus(netTransport.peerCount());
      // S39 P1 — visible-to-user wire diagnostics while joining + connected.
      // Surfaces the three S38-audit silent-drop modes (rejected at parseNetMessage,
      // applyNetSnapshot throw, snapshot never arriving) without requiring
      // `?debug=1` console + live retest. Host pane doesn't show this strip
      // (only the joiner is the one stuck waiting; host knows they pressed Begin).
      if (!world.isHost && netTransport.peerCount() > 0) {
        const td = netTransport.getDiagnostics();
        const errs = clientSync !== null ? clientSync.applyErrors() : 0;
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
        const td = netTransport.getDiagnostics();
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
          `host pc=${netTransport.peerCount()} mode=${ds.mode} ` +
          `hc=${ds.hostConnected} bv=${ds.beginButtonVisible} ` +
          `gm=${world.gameMode} gs=${world.gameState} ` +
          `[${strategySummary}]`,
        );
      } else {
        lobbyScreen.updateHostDiagnostics('');
      }
    }

    // S15 P2 — HUD connection dot.
    hud.setConnectionPeers(netTransport !== null ? netTransport.peerCount() : 0);

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
    structureRenderer.sync(world, controls.state);
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
    hud.sync(world);
    stats.recordWorld(world, effectsRenderer.activeCount);
    stats.recordFrame(world.freeSparks.size + world.primitives.size);
    stats.recordRender(performance.now() - renderStart);
  });
}

function stepPhysics(
  world: Parameters<typeof dispatch>[0],
  spawner: Spawner,
  grid: SpatialGrid,
  controls: Controls,
): void {
  // SPAWN — dispatched as actions for the audit log seam (§ 10.2).
  const spawned: Spark[] = [];
  spawner.tick(PHYSICS_DT, world.tick, spawned);
  for (const s of spawned) dispatch(world, { type: 'SPAWN_SPARK', spark: s });

  enforceFreeSparkCap(world);

  for (const player of world.players.values()) {
    dispatch(world, { type: 'TICK_ENERGY', playerId: player.id, deltaSec: PHYSICS_DT });
  }

  const sparkArr = freeSparkArray(world.freeSparks);
  let bondArr: Bond[] = Array.from(world.bonds.values());

  const attractedId = controls.state.kind === 'AttractDrag' ? controls.state.sparkId : null;

  for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
    controls.applyPerSubstep();
    verletStepAll(sparkArr, SUBSTEP_DT);
    if (bondArr.length > 0) {
      const broken = solveBonds(bondArr);
      if (broken.length > 0) {
        for (const bondId of broken) {
          if (world.bonds.has(bondId)) {
            // S17 P1 — physics-cause overstretch sever bypasses Phase-2
            // §VIII.3 charge gate (this is the constraint solver firing,
            // not a player disruption action). playerId is informational
            // (the dispatch case ignores it for cause='physics').
            // S42 — was `world.currentPlayerId` (turn-based artifact);
            // hardcoded asPlayerId(0) since field is removed and playerId
            // is unused on this dispatch path.
            dispatch(world, {
              type: 'SEVER_BOND',
              bondId,
              playerId: asPlayerId(0),
              cause: 'physics',
            });
          }
        }
        bondArr = Array.from(world.bonds.values());
      }
    }
    // S26 P0 — Voltkin Phase 2B: integrate creatures via Verlet per substep AFTER
    // bond solver (so the constraint solver never sees creatures — phase-through
    // by construction; creatures are NOT in sparkArr or bondArr) and BEFORE
    // enforceSpawnerBounds + resolveCollisions (which operate on sparkArr only).
    // Steering force returns ZERO_ACCEL during SPAWNING / DESPAWNING (Δ4), so
    // creatures appear stationary during the 1s spawn animation + 1s despawn
    // fade. Caller stepPhysics() is host-only-gated at line 509. Empty
    // world.creatures Map iterates zero times — negligible overhead.
    for (const c of world.creatures.values()) {
      creatureVerletStep(c, SUBSTEP_DT, computeSteeringAccel(c));
    }
    enforceSpawnerBounds(sparkArr, undefined, attractedId);
    resolveCollisions(sparkArr, grid);
  }
  world.tick++;
}

function freeSparkArray(map: ReadonlyMap<unknown, Spark>): Spark[] {
  return Array.from(map.values());
}

function enforceFreeSparkCap(world: Parameters<typeof dispatch>[0]): void {
  let freeCount = 0;
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') freeCount++;
  }
  if (freeCount <= FREE_SPARK_SOFT_CAP) return;

  const candidates: Spark[] = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') candidates.push(s);
  }
  candidates.sort((a, b) => a.createdTick - b.createdTick);

  const excess = freeCount - FREE_SPARK_SOFT_CAP;
  for (let i = 0; i < excess; i++) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
  }
}

// Suppress softReset unused-import warning (kept available for future hooks).
void softReset;

bootstrap().catch((err) => {
  console.error('SPARK boot failure:', err);
});
