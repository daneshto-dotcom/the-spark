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
import { AvatarRenderer } from './render/avatarRenderer.ts';
import { drainAudioEffects, initAudio, isMuted, playMusic, toggleMute } from './render/audioManager.ts';
import { EffectsRenderer } from './render/effectsRenderer.ts';
import { LobbyScreen } from './render/lobbyScreen.ts';
import { SparkRenderer, makeLegend, makeSpawnerRing } from './render/renderer.ts';
import { StatsOverlay } from './render/statsOverlay.ts';
import { StructureRenderer } from './render/structureRenderer.ts';
import { TitleScreen } from './render/titleScreen.ts';
import { HUD } from './render/ui.ts';
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
  const effectsRenderer = new EffectsRenderer(app);
  const avatarRenderer = new AvatarRenderer(app, P1);
  const hud = new HUD(app);
  const stats = new StatsOverlay(app);
  const grid = new SpatialGrid(SPATIAL_CELL_SIZE);

  // ===== S15 P2 — title + lobby screens =====
  const titleScreen = new TitleScreen(app, {
    onSoloSelected: () => {
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    },
    on1v1Selected: () => {
      world.gameState = 'LOBBY';
    },
  });

  const lobbyScreen = new LobbyScreen(app, {
    onHostStart: () => {
      const code = generateRoomCode();
      netTransport = new NetTransport();
      hostSync = new HostSync();
      world.isHost = true;
      netTransport.connect(code);
      netTransport.on((msg) => {
        if (msg.kind === 'INTENT' && hostSync !== null) {
          // S15 P2 — host applies client intent authoritatively. The
          // reducer's per-action gate (gameMode=='1v1' + action.playerId
          // === currentPlayerId) rejects intents from the inactive
          // player silently — defense-in-depth even when client controls
          // should not have sent them.
          dispatch(world, msg.action);
        }
      });
      return code;
    },
    onJoinAttempt: (code) => {
      netTransport = new NetTransport();
      clientSync = new ClientSync();
      world.isHost = false;
      controls.setPlayerId(asPlayerId(1));
      netTransport.connect(code);
      netTransport.on((msg) => {
        if (msg.kind === 'NETSNAPSHOT' && clientSync !== null) {
          clientSync.receive(msg, performance.now());
        }
      });
    },
    onBeginMatch: () => {
      // Host triggers START_GAME. The first snapshot will carry
      // gameState='PLAYING' + gameMode='1v1' to the client.
      dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true });
    },
    onBackToTitle: () => {
      teardownNet();
      world.gameState = 'TITLE';
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
  }

  const hint = new Text({
    text: 'LMB drag spark out of zone → carry · RMB drag onto a primitive → bond · ~ stats · C cinematics · SPACE end turn (1v1)',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x444444 }),
  });
  hint.position.set(10, CANVAS_HEIGHT - 22);
  app.stage.addChild(hint);

  if (import.meta.env.DEV) {
    (globalThis as { __SPARK__?: unknown }).__SPARK__ = {
      get world() { return world; },
      get controls() { return controls; },
      get netTransport() { return netTransport; },
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
      lastGameState = world.gameState;
      physicsAccumulator -= PHYSICS_DT;
    }
    stats.recordPhysics(performance.now() - physStart);

    // S15 P2 — client interpolation. Runs every render frame to lerp
    // primitive + freeSpark positions between prev + current snapshot.
    if (world.gameMode === '1v1' && !world.isHost && clientSync !== null) {
      clientSync.interpolateInto(world, performance.now(), NET_INTERPOLATION_MS);
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

    // S15 P2 — update lobby peer status when waiting.
    if (showLobby && netTransport !== null) {
      lobbyScreen.updatePeerStatus(netTransport.peerCount());
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

    const renderStart = performance.now();
    const freeSparkArr = freeSparkArray(world.freeSparks);
    sparkRenderer.sync(freeSparkArr);
    structureRenderer.sync(world, controls.state);
    // S18 P1 — drain audio effects BEFORE effectsRenderer (which wipes
    // world.effects). Cursor-gated; replay-safe.
    drainAudioEffects(world.effects, world.tick);
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
            // (the active player at the time of the overstrain) but the
            // dispatch case ignores it for cause='physics'.
            dispatch(world, {
              type: 'SEVER_BOND',
              bondId,
              playerId: world.currentPlayerId,
              cause: 'physics',
            });
          }
        }
        bondArr = Array.from(world.bonds.values());
      }
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
