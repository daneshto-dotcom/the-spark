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

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  HUNTER_TRIGGER_SCORE,
  NET_RENDER_DELAY_MS,
  NET_SNAPSHOT_HZ,
  PEER_DROP_BENCH_TICKS,
  PEER_DROP_GRACE_TICKS,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  PLAYER_COLORS,
  REVALIDATE_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from './constants.ts';
// S87 — VS-BOTS mode. BOTH the setup overlay AND the BotManager are LAZY
// chunks (the overlay alone pushed the index chunk over the 550 kB charter —
// measured 566.9 on the eager build): the overlay loads on first VS-BOTS
// click, the manager on match start. Type-only imports are erased at compile.
import type { BotSetupOverlay } from './render/botSetupOverlay.ts';
import type { BotManager } from './bots/botManager.ts';
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
import { selfId, type NetTransport } from './net/transport.ts';
import type { RosterEntry } from './net/protocol.ts';
import { makeNetSession, teardownNet } from './net/session.ts';
import { createHostStartHandler, createBeginMatchHandler } from './net/hostHandlers.ts';
import { connectAsClient, createJoinAttemptHandler } from './net/clientHandlers.ts';
// S87 P4 — QUICK MATCH. The ready-gate/presence helpers are eager-safe (no
// Trystero import); the QuickmatchDiscovery class is the LAZY half, imported on
// the first "Quick Match" click so the index chunk stays under charter.
import { broadcastQmPresence, maybeQmAutoBegin } from './net/quickmatchGate.ts';
import type { QuickmatchDiscovery } from './net/quickmatch.ts';
import { generateHostIdentity } from './net/hostIdentity.ts';
import { formatStrategySummary } from './net/strategySummary.ts';
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
import { bondMidpoint, findNearestBondTarget, findNearestEnemyCreature } from './state/creatures/creatureAI.ts';
// S100 P1 (TD Phase 1a, Layer 4) — the post-CREATURE_TICK attack-fire gate reads the
// FIRE tick from each creature's config (was the Voltkin-only module const) so a chewer
// fires its SEVER_BOND on the FINAL chew (config.attackFireTick = chewHits×interval) while
// Voltkin still fires at tick 30. getCreatureConfig is the documented per-type seam.
import { getCreatureConfig } from './state/creatures/voltkin-config.ts';
// S100 P1 (TD Phase 1a, Layer 4) — host re-validation poll: a spawner is torn down when
// its anchor primitive is gone OR its component no longer satisfies the recipe shape.
import { recipeStillSatisfied } from './state/spawners/spawnerLifecycle.ts';
// S103 P2 — host re-validation poll for generic defenders (aliased — same name as the spawner one).
import { recipeStillSatisfied as defenderRecipeStillSatisfied } from './state/defenders/defenderLifecycle.ts';
// S100 P1 (TD Phase 1a, Layer 6) — one-shot raid reward split across enemies on the
// destruction branch of the re-validation poll (NOT a per-tick accrual loop).
import { awardSpawnerKillReward } from './state/gameMode.ts';
// S100 P1 (TD Phase 1a, Layer 4) — cap gate for the spawner emit poll. The reducer
// (applySpawnCreature) re-checks it authoritatively; the poll calls it first so it can
// skip the dispatch (and a future birth VFX) when the swarm is already at its ceiling.
import { underChewerCaps } from './state/creatures/creatureLifecycle.ts';
import { AvatarRenderer, shouldHideOsCursor } from './render/avatarRenderer.ts';
import { drainAudioEffects, enterNonetRealm, exitNonetRealm, initAudio, isMuted, playMusic, syncRainbowYellAudio, toggleMute } from './render/audioManager.ts';
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
import { DragPreviewRenderer } from './render/dragPreviewRenderer.ts';
import { TitleScreen } from './render/titleScreen.ts';
import { HUD } from './render/ui.ts';
import { CutsceneOverlay } from './render/cutsceneOverlay.ts';
import type { SudokuOverlay } from './render/sudokuOverlay.ts';
// S97 G3b / S104 P3 — the Magic-14 combos are now a TAB inside the unified CodexOverlay (the
// separate ComboCodexOverlay was deleted). The tiny Pixi-free store stays eager (the render loop
// persists discoveries through it every match; the codex's COMBOS tab reads it).
import { mergeDiscoveredCombos } from './render/comboCodexStore.ts';
import { makeCinematicVignette } from './render/cinematicVignette.ts';
// S87 P4 — CodexOverlay is LAZY (shown only on a Codex click). Lazy-loading it
// frees ~index-chunk headroom for the quickmatch UI (the heavy Pixi overlay was
// only eager because godlyOrchestration imported unlockGodly from it — now split
// to codexStore.ts). Type-only import is erased; the class loads on demand.
import type { CodexOverlay } from './render/codexOverlay.ts';
import { CreatureRenderer } from './render/creatureRenderer.ts';
import { ChewerRenderer } from './render/chewerRenderer.ts';
import { TurretRenderer } from './render/turretRenderer.ts';
import { PrincessRenderer } from './render/princessRenderer.ts';
import { SpawnerZoneRenderer } from './render/spawnerZoneRenderer.ts';
import { BombRenderer } from './render/bombRenderer.ts';
import { HunterRenderer } from './render/hunterRenderer.ts';
import { PotatoRenderer } from './render/potatoRenderer.ts';
import { RainbowRenderer } from './render/rainbowRenderer.ts';
import { RainbowFlyoverRenderer } from './render/rainbowFlyoverRenderer.ts';
import { ComboToastRenderer } from './render/comboToastRenderer.ts';
import { SeagullRenderer } from './render/seagullRenderer.ts';
import { PoopRenderer } from './render/poopRenderer.ts';
import { ScreenShake, shouldTriggerNonetResolveShake, shouldTriggerShakeForArcFlash } from './render/screenShake.ts';
// S23 P2 — debug overlay (toggleable via ?debug=1 URL param). Surfaces runtime
// gates + audio chain + chain progress for in-vivo diagnosis when offline tests
// pass but live trigger doesn't fire.
// S85 bundle-charter remediation — debugOverlay is CODE-SPLIT (dynamic import
// below): it only ever runs under ?debug=1, so its ~5 kB has no business in
// the production index chunk. Type-only imports are erased at compile.
import type { DebugOverlayHandle, RuntimeProbes } from './render/debugOverlay.ts';
import { listRecipes } from './state/godlyRecipes/index.ts';
import type { GodlyId } from './state/godlyRecipes/types.ts';
import { unlockGodly } from './render/codexStore.ts';
// S22 P4 — side-effect import registers Voltkin recipe in the registry.
import './state/godlyRecipes/voltkin.ts';
// S100 P1 (TD Phase 1b, Layer 5) — side-effect import registers the pentagram
// SPAWNER recipe (a non-cinematic recipe → REGISTER_SPAWNER, not GODLY_TRIGGER).
import './state/godlyRecipes/pentagram.ts';
// S103 P3 — side-effect import registers the LASER TURRET defender recipe (calls registerRecipe at
// module tail) so runDefenderIgnition + recipeStillSatisfied find it. (#9 — 1 Line + 7 Spiral Whips.)
import './state/godlyRecipes/laserTurret.ts';
// S103 P4 — side-effect import registers the HELGA princess defender recipe (#10 — Triangle hub +
// 3 Warped Anchors + 3 Stars).
import './state/godlyRecipes/princessHelga.ts';
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
import { shouldCookOffInHand } from './state/potatoLifecycle.ts';
import { mulberry32 } from './state/rng.ts';
import { canAvatarCleanSplat } from './state/seagulls/seagullLifecycle.ts';
import { dispatch, isNetworked, makeWorld, type GameAction, type GameState } from './state/world.ts';
// S82 P2 — DEV-only save/load seams (__SPARK__.snapshotWorld/restoreWorld); the spawner
// state finally rides WorldSnapshot through these (S79 P5 capability wired).
import { restore, snapshot, type WorldSnapshot } from './state/save.ts';
import { makeGameStateExtras, softReset, tickGameState } from './state/gameState.ts';
import { tickScoring } from './state/scoring.ts';
import { detectNonet, mintNonetSeed, startSudoku, submitSudokuSolve, tickSudoku } from './state/sudokuEvent.ts';
import { asPlayerId } from './types.ts';

// S50 P2 — PHYSICS_DT / SUBSTEP_DT extracted to physicsLoop.ts; PHYSICS_DT
// re-imported (above) for the outer ticker accumulator.
const SPATIAL_CELL_SIZE = 32;
const P1 = asPlayerId(0);

// S100 P1 (TD Phase 1a, Layer 4) — mandatory perf mitigation (§3.4 R7): a CHEWER
// re-selects its SEEKING target only every K ticks, phase-spread across the swarm by
// `world.tick % K === creature.id % K` so the O(creatures×bonds) target scans don't all
// land on the same tick. Tick-deterministic (pure fn of world.tick + creature.id — NO
// wall-clock, NO RNG), so the replay byte-equivalence holds. VOLTKIN is unaffected: it
// keeps its every-tick re-selection (Council R1 Q3 UNANIMOUS A) byte-for-byte — the
// throttle is gated on `sourceSpawnerId != null` only. K=6 ≈ the 10 Hz snapshot cadence,
// so a chewer re-aims at most ~once per emitted snapshot frame (imperceptible in transit).
const CHEWER_SEEK_RESELECT_TICKS = 6;
const SNAPSHOT_INTERVAL_TICKS = Math.max(1, Math.round(PHYSICS_HZ / NET_SNAPSHOT_HZ));

// S94 — NONET appears in the Codex as a "super-combo". It is NOT a godly recipe (no recipe
// predicate/cinematic), so it's a synthetic CodexEntry, unlocked the first time a trial fires.
// The sprite points at the Phase-2 illustrated kami; until that asset lands, makeTile's catch
// leaves the tile image-less (the NONET name + hint still render).
const NONET_CODEX_ID = 'nonet' as GodlyId;
const NONET_CODEX_ENTRY = {
  id: NONET_CODEX_ID,
  displayName: 'NONET',
  recipeHint:
    'Connect 9 of ONE shape (and nothing else) → a Sudoku trial freezes the duel. First to solve DOUBLES their score; everyone else is HALVED.',
  characterSprite: '/art/nonet/kami.webp',
};

async function bootstrap(): Promise<void> {
  // S82 P4(a) — page-session host identity: ECDSA P-256 keypair whose pubkey fingerprint
  // IS the room code (net/hostIdentity.ts). Generated once at boot (~10-50ms, parallel
  // with Pixi init below) so the lobby's "Host New Room" handler stays synchronous.
  const hostIdentityPromise = generateHostIdentity();
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
  // S81 P5 — legend/betaBadge/muteIndicator/settingsIcon are CREATED here but staged AFTER
  // the fog + aboveFogLayer (below): they were added before FogRenderer existed, so the fog
  // container sat above them and swallowed the whole top HUD row in 1v1 PLAYING (user round-3:
  // 'stuff in the top (like where it says beta or shows primitives) is hidden within the
  // fog'). spawnerRing stays here — it is a BOARD element and should be fogged.

  // S16 P3.a — persistent BETA badge top-right of canvas. Added directly to
  // app.stage (not inside any screen container) so it's never hidden by
  // TITLE/LOBBY/WIN overlays. Cyan accent at low alpha for non-obtrusive
  // signaling that the build is not yet 1.0.
  const betaBadge = new Text({
    // S17 P3 — Phase-2 Tier-1 LIVE (Sever-as-disruption + multi-color bond
    // rendering). Badge text signals the build is past Phase-1 minimal.
    // S89 P2 — fontSize 14->12 + letterSpacing 4->3: smaller footprint so the
    // version chrome competes less with gameplay (paired with the backing plate
    // below — Council synthesis: de-emphasize the text AND mask the conflict).
    text: 'BETA · S17 PHASE-2',
    style: new TextStyle({
      fontFamily: 'monospace',
      fontSize: 12,
      fill: 0x3bd7ff,
      letterSpacing: 3,
    }),
  });
  betaBadge.anchor.set(1, 0);
  betaBadge.position.set(CANVAS_WIDTH - 12, 12);
  betaBadge.alpha = 0.6;

  // S89 P2 — subtle dark backing plate behind the badge. The badge sits on the
  // post-fog HUD layer ABOVE the world, so a semi-transparent version string
  // overprinted gameplay primitives that drift into the top-right corner and
  // read as a glitch (user playtest). A small dark rounded chip establishes a
  // clean screen-space-chrome boundary: the plate masks whatever world content
  // is behind it, so the badge always reads as UI, never as a clash. Sized from
  // the measured badge bounds (Pixi v8 Text measures synchronously); staged
  // immediately BELOW betaBadge (see addChild order) so it backs the text but
  // stays on the same fog-surviving HUD layer.
  const BADGE_PLATE_PAD_X = 9;
  const BADGE_PLATE_PAD_Y = 4;
  const betaBadgePlate = new Graphics();
  betaBadgePlate
    .roundRect(
      CANVAS_WIDTH - 12 - betaBadge.width - BADGE_PLATE_PAD_X,
      12 - BADGE_PLATE_PAD_Y,
      betaBadge.width + BADGE_PLATE_PAD_X * 2,
      betaBadge.height + BADGE_PLATE_PAD_Y * 2,
      7,
    )
    .fill({ color: 0x05070a, alpha: 0.5 });

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

  const SEED = 0xc0ffee;
  const world = makeWorld(SEED);
  // S15 P2 — boot at TITLE (not 'PLAYING' which is the default for tests).
  world.gameState = 'TITLE';
  const rng = mulberry32(SEED);
  // S71 P1 — bombs draw from a SEPARATE seeded stream (deterministic, host-only) so
  // the spark RNG sequence is byte-identical to pre-S71 (zero existing-test drift).
  const bombRng = mulberry32((SEED ^ 0x9e3779b9) >>> 0);
  // S72 P3 — potatoes draw from a THIRD seeded stream (distinct xor constant from bombRng)
  // so the spark AND bomb sequences both stay byte-identical (zero existing-test drift).
  const potatoRng = mulberry32((SEED ^ 0x85ebca6b) >>> 0);
  // S75 P3 — rainbows draw from a FOURTH seeded stream (distinct xor constant) so the spark,
  // bomb AND potato sequences all stay byte-identical (zero existing-test drift).
  const rainbowRng = mulberry32((SEED ^ 0xc2b2ae35) >>> 0);
  // S77 P3 — seagulls draw from a FIFTH seeded stream (distinct xor constant) so the spark,
  // bomb, potato AND rainbow sequences all stay byte-identical (zero existing-test drift).
  const seagullRng = mulberry32((SEED ^ 0x5a4e28b8) >>> 0);
  const spawner = new Spawner(
    DEFAULT_SPAWNER_CONFIG,
    rng,
    bombRng,
    potatoRng,
    rainbowRng,
    seagullRng,
  );

  // S105 P1 — FULLY-RANDOM spawns. The boot SEED above (0xc0ffee) is fixed, so without this every
  // match replayed the IDENTICAL spawn sequence (the owner's "they always come in the same order
  // square/triangle/square"). At each match start the HOST draws a fresh random base seed and reseeds
  // the spawner (+ world.rngSeed, which feeds the host-only rainbow-shuffle / NONET RNG and the
  // replay-capture field). This is match-SETUP randomness (drawn ONCE when a match begins, never in
  // the sim loop) — the seeded streams stay fully deterministic afterward, so replay byte-identity is
  // preserved. Host-only by construction: the spawner runs only on the host (the joiner mirrors sparks
  // via NetSnapshot), so no wire change / PROTOCOL bump / desync. Called at every host begin (solo /
  // vs-bots / networked host); the joiner's local START_GAME never calls it.
  const reseedForNewMatch = (): number => {
    const seed = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
    spawner.reseed(seed);
    world.rngSeed = seed;
    return seed;
  };

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
      isNetworked(world) &&
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
  // S98 P3 — drag-time connection preview. Constructed right after the board
  // layers so its Graphics sits ABOVE the bonds/prims but BELOW effects/avatar/
  // fog/HUD + aboveFogLayer (added later). Render-only; pulses while dragging.
  const dragPreviewRenderer = new DragPreviewRenderer(app);
  // S77 P2 — global-reach hazards (potato/rainbow/hunter/Voltkin) render THROUGH the fog to ALL
  // players: they draw into aboveFogLayer, staged after the FogRenderer (below) so it sits ABOVE
  // the fog + memory ghosts but BELOW the HUD. Rule: visible-to-all iff can-affect-all. Bomb is
  // EXCLUDED (severs only the picker's OWN bonds — single-owner). The board BEHIND these sprites
  // stays fogged; own-unit vision sources still reveal the board, so the scouting asymmetry holds.
  // Created here (before the 4 renderers) so each can target it at construction.
  const aboveFogLayer = new Container();
  aboveFogLayer.eventMode = 'none';
  // S100 P1 (TD Phase 1a) — spawner-zone aura. Constructed BEFORE creatureRenderer so its
  // radiating aura + 'alive' bond overlay sit UNDER the chewers/Voltkin on the aboveFogLayer.
  // Cross-player landmark (everyone must see the high-value target to raid it) → aboveFogLayer,
  // same fog rule as the other global-reach visuals. Cheap no-op when no spawner is live.
  const spawnerZoneRenderer = new SpawnerZoneRenderer(app, aboveFogLayer);
  // S25 P0 — creatureRenderer renders ABOVE prims; S77 P2 reparented to aboveFogLayer (a Voltkin
  // attacks ANY player's bonds — cross-player reach — so it must be visible to all through fog).
  const creatureRenderer = new CreatureRenderer(app, aboveFogLayer);
  // S100 P1 (TD Phase 1a) — chewerRenderer draws the persistent 'chewer' creatures (original
  // pencil sketch + physics-driven hop); creatureRenderer keeps Voltkin. Both drain world.creatures
  // partitioned by creature.type. aboveFogLayer for the same cross-player-reach fog rule.
  const chewerRenderer = new ChewerRenderer(app, aboveFogLayer);
  // S103 P3/P4 — turret + (P4) HELGA defenders render above the fog (cross-player reach, like chewers).
  const turretRenderer = new TurretRenderer(app, aboveFogLayer);
  const princessRenderer = new PrincessRenderer(app, aboveFogLayer);
  // S71 P1 — bomb renderer stays on app.stage (BELOW the fog): single-owner, NOT fog-exempt.
  // Below effects so BOMB_EXPLODE stacks over the orb. Cheap no-op when world.bombs is empty.
  const bombRenderer = new BombRenderer(app);
  // S72 P2 — Pac-Man hunter; S77 P2 -> aboveFogLayer (a board-wide chaser, visible to all).
  // Pure Pixi vector (no assets); renders host + client. Cheap no-op when world.hunters is empty.
  const hunterRenderer = new HunterRenderer(app, aboveFogLayer);
  // S72 P3 — potato (FREE/CARRIED/ARMED + fuse VFX); S77 P2 -> aboveFogLayer (owner-agnostic AoE,
  // visible to all). Pure Pixi vector; renders host + client. Cheap no-op when world.potatoes empty.
  const potatoRenderer = new PotatoRenderer(app, aboveFogLayer);
  // S75 P3 — rainbow (dumb arc + tooth + bob); S77 P2 -> aboveFogLayer (global colour-shuffle,
  // visible to all so any player can find + click it). Pure Pixi vector; host + client.
  const rainbowRenderer = new RainbowRenderer(app, aboveFogLayer);
  // S84 P2 — flyover celebration on the colour-switch (synced rainbowSwitchTick window).
  // Backdrop goes to app.stage index 0 (true background); wash/beams/character ride
  // aboveFogLayer (global-reach, same visibility rule as the rainbow pickup).
  const rainbowFlyoverRenderer = new RainbowFlyoverRenderer(app, aboveFogLayer);
  // S77 P3 — seagull + poop; S77 -> aboveFogLayer (a global-reach hazard — it can poop on any
  // player — so it renders through the fog to all). Poops render above the gull's body layer.
  const seagullRenderer = new SeagullRenderer(app, aboveFogLayer);
  const poopRenderer = new PoopRenderer(app, aboveFogLayer);
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
  // S77 P2 — stage the global-reach layer ABOVE the fog (+ memory ghosts) but BELOW the HUD, so
  // potato/rainbow/hunter/Voltkin punch through the fog as bare threat sprites for ALL players.
  app.stage.addChild(aboveFogLayer);
  // S81 P5 — the persistent top HUD row, staged ABOVE the fog (created back at bootstrap top;
  // see the comment there). Relative order preserved: legend, beta, ♪ (after beta — S18 P1
  // child-add-order note), ⚙. The HUD/stats classes below add their containers after these,
  // which is fine — none of the corner elements overlap them.
  app.stage.addChild(legend);
  app.stage.addChild(betaBadgePlate); // S89 P2 — backs the badge text (below it, above fog)
  app.stage.addChild(betaBadge);
  app.stage.addChild(muteIndicator);
  app.stage.addChild(settingsIcon);
  const hud = new HUD(app);
  const stats = new StatsOverlay(app);
  // S88 G3a — in-match discovery toast. Constructed AFTER the HUD so its main-stage
  // container renders ABOVE the board/fog (HUD/main-stage layer, NOT aboveFogLayer —
  // a screen-space notification keeps the fog.spec children contract untouched).
  const comboToastRenderer = new ComboToastRenderer(app);
  const grid = new SpatialGrid(SPATIAL_CELL_SIZE);

  // ===== S22 P3 — godly cinematic overlay + counter-window vignette + Codex =====
  // S104 P3 — "how to build" text per recipe id. Cinematic godlies stay purposefully cryptic
  // (the brother-surprise easter-egg convention); the TOWERS & STRUCTURES recipes get PRECISE
  // build instructions — this is the direct fix for the owner's "couldn't build the turret".
  // S105 P2 — EXACT build recipes for EVERY godly/tower (the owner: "add exact recipes so we can
  // check the requirements"). Voltkin was the lone cryptic hint ("lightning meets a screen") — now
  // precise like the rest. The codex shows these even on LOCKED tiles so requirements are checkable
  // BEFORE building (the direct fix for "Line + 4 spirals made no laser torrent" — it needs 7).
  const recipeHint = (id: string): string => {
    switch (id) {
      case 'voltkin': return 'GODLY: 4 Squares then 4 Triangles bonded in ONE straight line — 8 in a chain, ends free, nothing else attached. Summons Voltkin.';
      case 'pentagram': return 'SPAWNER: 5 Triangles bonded in a closed ring — each Triangle bonded to exactly 2 others (a pentagon). Mints chewers.';
      case 'laserTurret': return 'TOWER: 1 Line + 7 Spirals, every Spiral bonded to the Line — 8 shapes, a star. Beams enemy chewers. (7 spirals, not 4.)';
      case 'helga': return 'TOWER: 1 Triangle hub + 3 Spirals + 3 Circles, all 6 bonded to the hub — 7 shapes. Princess HELGA slaps chewers.';
      default: return '???';
    }
  };
  const cutsceneOverlay = new CutsceneOverlay(app);
  const vignette = makeCinematicVignette(app);
  // S87 P4 — CodexOverlay is created lazily on first open (the botSetupOverlay
  // pattern). recipeHint + listRecipes are cheap + already eager; the heavy
  // Pixi overlay class + its Assets/ColorMatrixFilter usage load on demand.
  // S104 P3 — ONE unified CODEX (3 tabs: GODLY COMBOS / COMBOS / TOWERS & STRUCTURES). Lazy on first
  // open (the botSetupOverlay pattern — Pixi weight off the entry chunk). Opened from the title-screen
  // CODEX button AND in-game via the G+C chord (openCodex('towers') etc.). Godly = cinematic recipes
  // (+ the synthetic NONET); towers = spawner + defender recipes. Combos read comboCodexStore directly.
  let codexOverlay: CodexOverlay | null = null;
  const openCodex = (tab: 'godly' | 'combos' | 'towers' = 'godly'): void => {
    void (async () => {
      if (codexOverlay === null) {
        const mod = await import('./render/codexOverlay.ts');
        const godly = [
          ...listRecipes()
            .filter((r) => r.kind === 'cinematic')
            .map((r) => mod.entryFromRecipe(r, r.id.toUpperCase(), recipeHint(r.id))),
          NONET_CODEX_ENTRY, // S94 — NONET super-combo (synthetic, non-recipe entry)
        ];
        const towers = listRecipes()
          .filter((r) => r.kind === 'spawner' || r.kind === 'defender')
          .map((r) => mod.entryFromRecipe(r, r.id.toUpperCase(), recipeHint(r.id)));
        codexOverlay = new mod.CodexOverlay(app, { godly, towers }, () => {
          codexOverlay?.setVisible(false);
        });
      }
      codexOverlay.open(tab);
    })();
  };

  // S104 P3 — G+C key CHORD opens the unified Codex IN-GAME (the owner's "G + C at the same time").
  // Pure UI: it dispatches NOTHING to the sim, so it lives here (main.ts owns the overlays) and NOT
  // in controls.ts (the per-player world-mutating sim-input FSM whose lock-guards could swallow it).
  // Edge-triggered (open once on the transition into both-down; ignore OS key-repeat); the pressed
  // set clears on blur + tab-hide so an alt-tab with G held can't spuriously fire on the next C.
  // Guarded against typing into a field, the NONET trial, and an active cinematic. Opens on the
  // TOWERS tab — the in-game "how do I build this?" is the chord's reason for existing.
  const chordKeys = new Set<string>();
  let codexChordFired = false;
  const chordBlocked = (): boolean => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (world.sudoku !== null) return true;
    if (world.activeCinematicPlayerId !== null) return true;
    return false;
  };
  const resetChord = (key?: string): void => {
    if (key === undefined) chordKeys.clear();
    else chordKeys.delete(key);
    if (!chordKeys.has('g') || !chordKeys.has('c')) codexChordFired = false;
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k !== 'g' && k !== 'c') return;
    chordKeys.add(k);
    if (chordKeys.has('g') && chordKeys.has('c') && !codexChordFired) {
      codexChordFired = true; // latch until a keyup breaks the chord (no re-open on key-repeat)
      // S109 P0 — TOGGLE: if the codex is already open when G+C fires, close it (don't re-open on
      // top of itself). chordBlocked() still gates OPENING (typing field / NONET / active cinematic),
      // but a close is always allowed so the chord can never trap the player with the overlay up.
      if (codexOverlay !== null && codexOverlay.isVisible()) {
        codexOverlay.setVisible(false);
      } else if (!chordBlocked()) {
        openCodex('towers');
      }
    }
  });
  window.addEventListener('keyup', (e) => resetChord(e.key.toLowerCase()));
  window.addEventListener('blur', () => resetChord());
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetChord(); });

  // S109 P0 — Escape closes the Codex (the owner got trapped: the in-game G+C codex had no key-exit,
  // only the on-screen CLOSE button). Guarded on the codex being visible so this never swallows an
  // Escape meant for another overlay; returns immediately after closing so it can't double-handle
  // (settingsOverlay owns its own Escape on its DOM root — mirror of botSetupOverlay.ts / settingsOverlay.ts).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && codexOverlay !== null && codexOverlay.isVisible()) {
      codexOverlay.setVisible(false);
      return;
    }
  });

  // ===== S87 — VS-BOTS: lazy overlay + lazy manager =====
  // The manager exists ONLY during a bots match (armed on START MATCH, dropped
  // on the *→TITLE transition watcher below). Pure decision state — no Pixi /
  // DOM resources to free. The overlay is created once on first open (lazy
  // chunk — the eager build breached the 550 kB index charter at 566.9).
  let botManager: BotManager | null = null;
  let botSetupOverlay: BotSetupOverlay | null = null;
  const openBotSetup = (): void => {
    void (async () => {
      if (botSetupOverlay === null) {
        const ui = await import('./render/botSetupOverlay.ts');
        botSetupOverlay = new ui.BotSetupOverlay(app, {
          onStart: (difficulties) => {
            void (async () => {
              // Await BEFORE dispatch so the first PLAYING tick already has a
              // live manager (no dead-bot frames).
              const mod = await import('./bots/botManager.ts');
              const totalSeats = difficulties.length + 1;
              const roster = Array.from({ length: totalSeats }, (_, seat) => ({
                seat,
                color: PLAYER_COLORS[seat],
              }));
              const botSeats = difficulties.map((_, i) => i + 1);
              // S105 P1 — fresh random base seed per vs-bots match: reseeds the spawn sequence AND
              // seeds the bot AI streams from the same draw, so both the shapes you get and the bots'
              // play vary each match (was the fixed boot SEED → identical every time).
              const matchSeed = reseedForNewMatch();
              botManager = new mod.BotManager(difficulties, matchSeed);
              botSetupOverlay?.setVisible(false);
              dispatch(world, {
                type: 'START_GAME',
                mode: 'bots',
                isHost: true,
                roster,
                botSeats,
              });
            })();
          },
          onClose: () => {
            botSetupOverlay?.setVisible(false);
          },
        });
      }
      botSetupOverlay.setVisible(true);
    })();
  };

  // ===== S15 P2 — title + lobby screens =====
  const titleScreen = new TitleScreen(app, {
    onSoloSelected: () => {
      reseedForNewMatch(); // S105 P1 — fresh random spawn sequence each solo match
      dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
    },
    on1v1Selected: () => {
      // S87 P4 — guarantee a clean SELECT state on entry (clears any stale
      // quickmatch shell flag / mode from a prior aborted session).
      lobbyScreen.reset();
      world.gameState = 'LOBBY';
    },
    onVsBotsSelected: () => {
      openBotSetup();
    },
    onCodexSelected: () => {
      openCodex();
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
  // S70 P1 — digest the net seat roster (the host on each peer join/leave; the
  // joiner on each LOBBY_PRESENCE beacon) into the render-local SeatPresence shape
  // at this composition root, computing isYou via peerId === selfId. This keeps
  // BOTH the pure reducer AND lobbyScreen free of net/ imports (Council Fork C).
  // Late-bound like onLobbyError so it can reference lobbyScreen before it exists.
  const onPresence = (roster: readonly RosterEntry[]): void => {
    lobbyScreen.updatePresence(
      // S87 P4 — carry the quickmatch ready flag through to the seat presence
      // (undefined in friends lobbies → no UI change there).
      roster.map((e) => ({ seat: e.seat, color: e.color, isYou: e.peerId === selfId, ready: e.ready })),
    );
  };
  // S82 P4(a) — resolve the boot-time identity (started before Pixi init; in practice
  // already settled long before a human can click "Host New Room").
  const hostIdentity = await hostIdentityPromise;
  // S87 P4 — onBeginMatch is built FIRST so the quickmatch auto-begin gate (passed
  // into the host-start handler below) can reference it.
  // S105 P1 — wrap the networked-host begin so it reseeds the spawn sequence with a fresh random base
  // seed before dispatching START_GAME (host-only; the joiner mirrors sparks via snapshot so it must NOT
  // reseed — its local START_GAME path stays untouched).
  const baseBeginMatch = createBeginMatchHandler({ session, world });
  const onBeginMatch = (): void => {
    reseedForNewMatch();
    baseBeginMatch();
  };
  // S87 P4 — QUICK MATCH discovery orchestration. The discovery instance is the
  // LAZY chunk (imported on first click); main.ts owns the host/client wiring it
  // drives. stopQuickmatch is idempotent (covers match-begin, back-to-title,
  // peer-drop). qmDiscovery!==null ⇔ a discovery is live.
  let qmDiscovery: QuickmatchDiscovery | null = null;
  const stopQuickmatch = (): void => {
    if (qmDiscovery !== null) {
      qmDiscovery.stop();
      qmDiscovery = null;
    }
  };
  // The all-ready gate fires this; ignore it once the match has left LOBBY so a
  // late LOBBY_READY can't re-dispatch START_GAME (idempotency, Council F4).
  const onAutoBegin = (): void => {
    if (world.gameState !== 'LOBBY') return;
    stopQuickmatch();
    onBeginMatch();
  };
  const onHostStart = createHostStartHandler({
    session, world, hostIdentity, onLobbyError, onPresence, onAutoBegin,
  });
  const clientJoinDeps = {
    session,
    world,
    controls,
    onLobbyError,
    onPresence,
  };
  const onJoinAttempt = createJoinAttemptHandler(clientJoinDeps);

  // S87 P4 — start QUICK MATCH: spin up the discovery (lazy), which elects this
  // peer as host or joins an advertised room, then the all-ready gate begins the
  // match. session.quickmatch is (re)asserted on every become-host/join so it
  // survives the demote teardown (teardownNet clears it).
  const startQuickmatch = (): void => {
    if (qmDiscovery !== null) return; // already searching
    session.quickmatch = true;
    lobbyScreen.setQuickmatch(true);
    void import('./net/quickmatch.ts').then((qm) => {
      if (!session.quickmatch) return; // user backed out before the chunk loaded
      qmDiscovery = new qm.QuickmatchDiscovery({
        becomeHost: () => {
          session.quickmatch = true;
          const code = onHostStart();
          lobbyScreen.applyQuickmatchHosting(code);
          return code;
        },
        joinCode: (code) => {
          session.quickmatch = true;
          connectAsClient(clientJoinDeps, code);
          lobbyScreen.applyQuickmatchJoining(code);
        },
        teardownHost: () => {
          teardownNet(session, world, controls, P1);
        },
        hostPeerCount: () =>
          session.netTransport !== null ? session.netTransport.peerCount() : 0,
      });
      qmDiscovery.start();
    });
  };
  // S87 P4 — READY toggle (host + client). `ready` is the post-flip UI state
  // (single source of truth — lobbyScreen owns the button, passes the value).
  const onToggleReady = (ready: boolean): void => {
    session.qmSelfReady = ready;
    if (world.isHost && session.netTransport !== null) {
      broadcastQmPresence(session, session.netTransport, onPresence);
      maybeQmAutoBegin(session, onAutoBegin);
    } else if (session.netTransport !== null) {
      session.netTransport.send({ kind: 'LOBBY_READY', ready });
    }
  };

  lobbyScreen = new LobbyScreen(app, {
    // Friends-lobby Host/Join: stop any in-flight quickmatch discovery + clear
    // the flag so a deliberate friends room never inherits quickmatch gating.
    onHostStart: () => {
      stopQuickmatch();
      session.quickmatch = false;
      return onHostStart();
    },
    onJoinAttempt: (code: string) => {
      stopQuickmatch();
      session.quickmatch = false;
      onJoinAttempt(code);
    },
    onBeginMatch,
    onQuickMatch: startQuickmatch,
    onToggleReady,
    onBackToTitle: () => {
      // S31 P0-2 (PRIME-AUDIT Δ5 scope amendment) — route through reducer
      // dispatch so the new applyReturnToTitle cinematic-state-clear cleanup
      // applies on the lobby-back path too. Pre-S31 this set gameState
      // directly which bypassed the reducer cleanup entirely.
      stopQuickmatch();
      teardownNet(session, world, controls, P1);
      dispatch(world, { type: 'RETURN_TO_TITLE' });
    },
    onReturnFromConnectionLost: () => {
      stopQuickmatch();
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
      // S87 — VS-BOTS e2e probes: setup-overlay geometry/state + live manager.
      get botSetupOverlay() { return botSetupOverlay; },
      get botManager() { return botManager; },
      get fogRenderer() { return fogRenderer; },
      // S77 P2 — fog-exemption e2e: sync a global-reach entity + assert it renders
      // through the fog (aboveFogLayer sits above the fog container).
      get potatoRenderer() { return potatoRenderer; },
      get aboveFogLayer() { return aboveFogLayer; },
      // S84 P2 — flyover e2e probe: active-window flag for rainbow.spec assertions.
      get rainbowFlyoverActive() { return rainbowFlyoverRenderer.isActive(); },
      // S82 P2 — full-fidelity save/load seams (DEV-only, tree-shaken from prod). The
      // ONLY call sites that pass spawner state into snapshot() — netSnapshot() never
      // does, keeping the stream words off the wire by construction. restoreWorld
      // resumes the spawn sequence bit-exactly when the save carried spawner state
      // (and degrades to from-seed when it did not — pre-S82 saves still load).
      snapshotWorld(): string {
        return JSON.stringify(snapshot(world, { spawnerState: spawner.getState() }));
      },
      restoreWorld(json: string): void {
        const snap = JSON.parse(json) as WorldSnapshot;
        restore(snap, world);
        if (snap.spawner !== undefined) spawner.restoreState(snap.spawner);
      },
      // S95 — DEV-only NONET trigger for repro + future overlay e2e (tree-shaken
      // from prod). Mints + starts a trial host-side exactly like the detector path.
      forceNonet(): void { startSudoku(world, world.localPlayerId, mintNonetSeed(world)); },
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

  // S95 P0 — stale-deploy / transient chunk recovery. Every code-split dynamic import() (NONET
  // overlay, codex, bots, debug, quickmatch…) fetches a hashed chunk at runtime. When a fresh
  // deploy rotates those hashes while a tab still holds the OLD index.html, the next import() 404s
  // and Vite fires `vite:preloadError` on window. A NONET trial then froze the duel with no board
  // (the live bug). Reload ONCE to pull the new chunk graph; the in-memory + sessionStorage latches
  // prevent a reload loop if a chunk is genuinely, permanently missing.
  let preloadReloadFired = false;
  window.addEventListener('vite:preloadError', () => {
    if (preloadReloadFired) return;
    preloadReloadFired = true;
    try {
      if (sessionStorage.getItem('spark:preloadReloaded') === '1') return; // already retried this tab
      sessionStorage.setItem('spark:preloadReloaded', '1');
    } catch { /* private mode — the in-memory latch still bounds us to one reload per load */ }
    window.location.reload();
  });

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
  // S105 P3 (smooth-regardless-of-host, step 1) — the host's 10Hz full-world snapshot
  // serialize+JSON.stringify is the single dominant host-only per-frame cost (the profiler's
  // finding). It used to fire INSIDE the physics catch-up while-loop; a slow/behind host could
  // serialize mid-drain on the very frames it was already over budget. We now send ONCE per render
  // frame on a WALL-CLOCK cadence (after the loop), so the send rate stays a steady ~10Hz tied to
  // real time rather than to the sim-tick drain — the client's render-delay jitter buffer (sync.ts)
  // already absorbs arrival jitter. Determinism-NEUTRAL: this changes only WHEN we serialize, not
  // the snapshot CONTENT, no reducer/RNG touched. This single isolated send gate is also the relay
  // seam the worker-sim milestone will reuse.
  const NET_SNAPSHOT_INTERVAL_MS = 1000 / NET_SNAPSHOT_HZ;
  let lastSnapshotSentMs = -Infinity;

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
  // S85 — lazy chunk; the render loop's `debugOverlay !== null` guard makes
  // the async arrival benign (overlay appears a few frames into the session).
  // The ?debug=1 check is inlined (importing isDebugMode statically would pull
  // the whole module back into the index chunk and defeat the split).
  if (window.location.search.includes('debug=1')) {
    void import('./render/debugOverlay.ts').then((m) => {
      debugOverlay = m.createDebugOverlay();
      console.log('[debug] overlay enabled via ?debug=1 — copy snapshot by clicking panel');
    });
  }
  // S50 P2 — lastCinematicOwner migrated to godlyState (above).
  // S31 P0-4 — `cinematicTimer` REMOVED. Previously this main.ts-scoped
  // setTimeout fired GODLY_COMPLETE at `cinematicMs + sustainedEffectMs`;
  // cutsceneOverlay.completeTimer ALSO fires GODLY_COMPLETE via its
  // onComplete callback at the same offset + FADE_MS. Single dispatch path
  // now goes through `cutsceneOverlay.onComplete` (set inside
  // `startCinematicIfNeeded` in godlyOrchestration.ts).
  let lastConnectionLost = false;
  // S82 P4(b) — auto-reconnect grace state. reconnectUntilMs===0 ⇔ no loss in progress.
  // Wall-clock (performance.now) is correct here: this is transport orchestration, not
  // sim state — determinism is untouched. FIRST_RETRY short-delays so a sub-second blip
  // (the common case) recovers almost immediately; subsequent retries pace at RETRY_MS.
  let reconnectUntilMs = 0;
  let reconnectNextRetryMs = 0;
  const RECONNECT_GRACE_MS = 15_000;
  const RECONNECT_RETRY_MS = 4_000;
  const RECONNECT_FIRST_RETRY_DELAY_MS = 1_000;
  // S82 P4(c) — host-side absence tracker for the mid-game drop-bench sweep (peerId →
  // first tick seen absent). Orchestration-local; reset whenever the sweep is inactive.
  const peerAbsentSinceTick = new Map<string, number>();
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
  // S86 P4 — change-gated mirror of the canvas cursor style (the spark IS
  // the pointer during PLAYING; see the render-section comment below).
  let osCursorHidden = false;
  // S93 — track world.sudoku active-state edges to drive the realm-shift audio swap.
  let prevNonetActive = false;
  // S97 G3b — last-seen in-match combo-discovery count, to persist NEW discoveries into the
  // cross-match Combo Codex store only on the rising edge of the set's size (cheap: a localStorage
  // touch only when a combo is actually discovered, never per frame).
  let lastDiscoveredComboSize = 0;
  // S95 — last-seen NONET resolvedTick, to fire a one-shot celebration shake on the resolve edge.
  let prevNonetResolvedTick: number | null = null;

  // S93 — NONET Sudoku overlay. LAZY (code-split like the codex/bot/debug overlays): the Pixi
  // board + spirits only load on the FIRST trial, keeping it out of the main bundle (charter
  // < 550 KiB). Built on demand (so it sits on top of the play-field) + rendered each frame after.
  let nonetOverlay: SudokuOverlay | null = null;
  let nonetOverlayLoading = false;
  // S95 P0 — last load attempt wall-clock; throttles retries to ≤1 per 500 ms so a sustained
  // chunk-fetch outage self-heals (loads the instant the network recovers) without per-frame spam.
  let nonetOverlayLastLoadAttemptMs = 0;
  const ensureNonetOverlay = (): void => {
    if (nonetOverlay !== null || nonetOverlayLoading) return;
    // S95 P0 — back off between retries (the catch un-latches `nonetOverlayLoading`, and this fn is
    // called every frame a trial is active, so without the gate a hard-down chunk would retry 60×/s).
    const nowMs = performance.now();
    if (nowMs - nonetOverlayLastLoadAttemptMs < 500) return;
    nonetOverlayLastLoadAttemptMs = nowMs;
    nonetOverlayLoading = true;
    import('./render/sudokuOverlay.ts')
      .then((mod) => {
        nonetOverlay = new mod.SudokuOverlay(app, (grid) => {
          // Host/solo/bots resolve locally (immediate, so the overlay can flash a wrong grid). A 1v1
          // CLIENT instead sends a SUDOKU_SOLVED intent — the host validates first-valid-wins and the
          // result returns via NetSnapshot (no optimistic local resolve → no score desync).
          if (isNetworked(world) && !world.isHost) {
            dispatchFn({ type: 'SUDOKU_SOLVED', playerId: world.localPlayerId, grid: grid.slice() });
            return false;
          }
          return submitSudokuSolve(world, world.localPlayerId, grid);
        });
      })
      .catch((err: unknown) => {
        // S95 P0 — THE live bug: a failed overlay load (transient blip OR a stale-deploy chunk-hash
        // 404) used to leave `nonetOverlayLoading=true` forever with no .catch, so the duel froze for
        // the full ~180 s NONET timeout with no board. Now we log + un-latch so the 500 ms-throttled
        // retry above can recover; the stale-deploy case also triggers the vite:preloadError reload.
        console.error('[nonet] Sudoku overlay failed to load; will retry', err);
        nonetOverlayLoading = false;
      });
  };

  app.ticker.add((tickerObj) => {
    const dtSec = Math.min(tickerObj.deltaMS / 1000, 0.05);
    physicsAccumulator += dtSec;

    const physStart = performance.now();
    while (physicsAccumulator >= PHYSICS_DT) {
      const isClient = isNetworked(world) && !world.isHost;
      // S93 — NONET freeze: while a Sudoku trial is active the host pauses the ENTIRE duel
      // sim (physics, building, income, win-check, hazard polls) — the "different realm". The
      // tick clock still advances so tickSudoku's timeout + resume window elapse; tickSudoku
      // drives the lifecycle (timeout / resume) and clears world.sudoku to resume play.
      if (world.gameState === 'PLAYING' && !isClient && world.sudoku !== null) {
        world.tick++;
        tickSudoku(world);
        // S105 P3 — the snapshot send moved OUT of this loop to a single wall-clock-gated send AFTER
        // the loop. It still covers the freeze: gameState stays PLAYING during a NONET trial and
        // world.tick advanced just above, so the post-loop send broadcasts the sudoku field +
        // resolution at ~10Hz regardless of this `continue` (no per-branch in-loop send needed).
        physicsAccumulator -= PHYSICS_DT;
        continue;
      }
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
      // S76 P3 — host-only complexity-income accrual. Runs BEFORE the WIN check
      // (tickGameState) and the hunter 75% trigger below so both observe this tick's
      // freshly-accrued scoreProgress. The client never accrues (host-authoritative); it
      // reads scoreProgress from the NetSnapshot. Gated on PLAYING + !isClient.
      if (world.gameState === 'PLAYING' && !isClient) {
        tickScoring(world);
      }
      tickGameState(world, gameStateExtras, P1);

      // S94 — NONET trigger sweep (host-only, once/match): a connected component of EXACTLY 9
      // shapes of ONE type summons the trial. Per-tick sweep (cheap — comparable to tickScoring's
      // own per-tick prim/bond walk; the once-per-match guard skips it after firing) so it catches
      // the structure forming by PLACEMENT or by ERASING down to 9 of a single type (user tactic).
      if (
        world.gameState === 'PLAYING' &&
        !isClient &&
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

      // S71 P1 — bomb dissipation poll (host-only, tick-deterministic). An
      // un-grabbed bomb is removed HARMLESSLY when its TTL elapses (no detonation).
      // Snapshot the entries first (DISSIPATE_BOMB deletes from the Map). Cheap
      // no-op when no bombs. Runs after the creature poll, before the creature
      // fan-out — order-independent (idempotent delete + skip-if-missing detonate).
      if (world.gameState === 'PLAYING' && !isClient && world.bombs.size > 0) {
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
      if (world.gameState === 'PLAYING' && !isClient && world.creatureSpawners.size > 0) {
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
          if (world.tick >= sp.nextSpawnTick && underChewerCaps(world, spawnerId)) {
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
      if (world.gameState === 'PLAYING' && !isClient && world.defenders.size > 0) {
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
          if (creature !== undefined && creature.state === 'SEEKING') {
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

      // S87 — VS-BOTS: bots think + act (host-only by construction — bots mode
      // has no client). Runs BEFORE the hunter/hazard polls so a bot's
      // UPDATE_AVATAR_POS lands this tick and the hunter chases fresh
      // positions, mirroring the human input path (controls write the cursor
      // before stepPhysics). Every bot action flows through dispatch(), so
      // bench/poop/reach/territory gates bind bots exactly like remote humans.
      if (world.gameState === 'PLAYING' && !isClient && botManager !== null) {
        botManager.tick(world);
      }

      // S72 P2 — Pac-Man hunter orchestration (host-only). (a) Trigger ONCE when the
      // leader first reaches 75% (HUNTER_TRIGGER_SCORE); applySpawnHunter sets
      // world.hunterSpawned so it never re-fires this game. (b) Fan out HUNTER_TICK
      // per hunter (after the creature loop) — applyHunterTick steers + runs the FSM
      // + catches inline. Snapshot the keys first (a tick may delete on escape /
      // chomp-end). (c) Bench-expiry sweep: clear benchedUntilTick once world.tick
      // passes it (tidiness; isInputLocked + avatarRenderer already self-heal on the
      // tick compare — Council R5).
      if (world.gameState === 'PLAYING' && !isClient) {
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
      if (world.gameState === 'PLAYING' && !isClient && world.potatoes.size > 0) {
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
      if (world.gameState === 'PLAYING' && !isClient && world.rainbows.size > 0) {
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
      if (world.gameState === 'PLAYING' && !isClient && world.seagulls.size > 0) {
        for (const sid of Array.from(world.seagulls.keys())) {
          dispatch(world, { type: 'SEAGULL_TICK', seagullId: sid });
        }
      }
      if (world.gameState === 'PLAYING' && !isClient && world.poops.size > 0) {
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
        !isClient &&
        isNetworked(world) &&
        session.hostSeats.size > 0 &&
        session.netTransport !== null
      ) {
        const present = new Set(session.netTransport.peerIds());
        for (const [peerId, seat] of session.hostSeats) {
          if (present.has(peerId)) {
            peerAbsentSinceTick.delete(peerId);
            continue;
          }
          const since = peerAbsentSinceTick.get(peerId);
          if (since === undefined) {
            peerAbsentSinceTick.set(peerId, world.tick);
          } else if (world.tick - since >= PEER_DROP_GRACE_TICKS) {
            dispatch(world, {
              type: 'BENCH_OFFLINE_PLAYER',
              playerId: seat,
              untilTick: world.tick + PEER_DROP_BENCH_TICKS,
            });
          }
        }
      } else if (peerAbsentSinceTick.size > 0) {
        peerAbsentSinceTick.clear();
      }

      // S105 P3 — host snapshot send relocated OUT of this physics drain loop to a single
      // wall-clock-gated send AFTER the loop (see below), so the heavy serialize+stringify runs at
      // most once per render frame on a steady ~10Hz real-time cadence instead of inside the
      // per-tick catch-up drain. Gate semantics (PLAYING|WIN|POSTGAME, host, ≥SNAPSHOT_INTERVAL_TICKS
      // of fresh state) are preserved at the new site.

      if (import.meta.env.DEV && world.gameState === 'PLAYING' && !isClient) {
        const violations = verifyInvariants(world.primitives, world.freeSparks, invariantSnap);
        if (violations.length > 0 && world.tick - lastViolationLogTick > 60) {
          console.error('[SPARK] invariant violation tick=' + world.tick, violations);
          lastViolationLogTick = world.tick;
        }
        invariantSnap = snapshotInvariants(world.primitives);
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
        isNetworked(world) &&
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
        // S95 P0 — preload the NONET overlay chunk at match start so the trial appears INSTANTLY
        // when it fires (no mid-duel chunk fetch) AND so any load failure surfaces + starts its
        // retry window early — never as the silent ~180 s freeze the live playtest hit. Idempotent.
        ensureNonetOverlay();
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
        // S87 — drop the bot manager with the match (pure decision state; the
        // reducer's RETURN_TO_TITLE already cleared world.botSeats + players).
        botManager = null;
        cutsceneOverlay.abort();
        screenShake.reset();
        // S34 P2-16 — explicit sprite cleanup. The reducer-side
        // applyReturnToTitle clears world.creatures, but creatureRenderer's
        // internal sprite Map is orchestration state; its sync() prune runs
        // AFTER this transition watcher on the next render frame. clear()
        // closes the one-frame orphan-sprite window (PRIME-AUDIT Δ3).
        // Container preserved — next PLAYING entry can re-mount sprites.
        creatureRenderer.clear();
        // S100 P1 (TD Phase 1a) — drop chewer graphics + per-chewer hop state on
        // title-return (reducer teardownSpawners clears creatureSpawners and the
        // chewers; this closes the one-frame orphan window + resets the hop phase).
        chewerRenderer.clear();
        // S103 P3 — drop turret graphics + per-turret SFX-edge state on title-return.
        turretRenderer.clear();
        // S103 P4 — drop HELGA graphics + per-princess facing/SFX state on title-return.
        princessRenderer.clear();
        // S100 P1 — drop the spawner-zone aura on title-return.
        spawnerZoneRenderer.clear();
        // S71 P1 — drop bomb sprites on title-return (the reducer applyReturnToTitle
        // clears world.bombs; this closes the one-frame orphan-sprite window).
        bombRenderer.clear();
        // S72 P2 — drop the hunter graphic on title-return (reducer clears world.hunters).
        hunterRenderer.clear();
        // S72 P3 — drop the potato graphic on title-return (reducer clears world.potatoes).
        potatoRenderer.clear();
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

    // S105 P3 (step 1) — host NetSnapshot send, ONCE per render frame on a WALL-CLOCK ~10Hz cadence.
    // Relocated here from inside the physics drain loop (above) so the dominant serialize+JSON.stringify
    // cost never runs mid-catch-up on a frame the host is already over budget. The wall-clock gate keeps
    // the joiner's update cadence steady at real-time 10Hz even when the host's sim falls behind, while
    // the ≥SNAPSHOT_INTERVAL_TICKS floor skips a re-send when no fresh state accrued. Same gate as before
    // (PLAYING|WIN|POSTGAME, host, networked). Covers the NONET-freeze path too (gameState stays PLAYING).
    // Determinism-neutral: changes only WHEN we serialize, never the snapshot content. (sync.ts's
    // render-delay jitter buffer already absorbs arrival jitter on the client.)
    {
      const nowMs = performance.now();
      if (
        (world.gameState === 'PLAYING' ||
          world.gameState === 'WIN' ||
          world.gameState === 'POSTGAME') &&
        isNetworked(world) &&
        world.isHost &&
        session.hostSync !== null &&
        session.netTransport !== null &&
        nowMs - lastSnapshotSentMs >= NET_SNAPSHOT_INTERVAL_MS &&
        world.tick - session.lastSnapshotTick >= SNAPSHOT_INTERVAL_TICKS
      ) {
        session.netTransport.send(session.hostSync.buildSnapshotMessage(world));
        session.lastSnapshotTick = world.tick;
        lastSnapshotSentMs = nowMs;
      }
    }

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
    if (isNetworked(world) && !world.isHost && session.clientSync !== null) {
      session.clientSync.interpolateInto(
        world,
        performance.now(),
        NET_RENDER_DELAY_MS,
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

    // S15 P2 — connection-lost overlay (networked, PLAYING, no peers).
    // S62 — generalized gameMode==='1v1' → isNetworked() but DELIBERATELY keeps
    // peerCount()===0 (Council/PRIME-AUDIT: NOT a blanket swap). Correct for the
    // host (all clients gone) and for 2-player.
    // S79 P4 — the S62 KNOWN GAP is closed: a 3+-player CLIENT that loses only the
    // HOST (other clients still connected → peerCount>0) previously sat in limbo with
    // a frozen world and no exit. The hostPeerId latched for sender-auth doubles as
    // host-presence: latched but no longer in peerIds() → the host is gone → overlay.
    // Host-side (isHost) keeps the pure peerCount gate; no host-migration yet (#4).
    const hostLost = !world.isHost
      && session.hostPeerId !== null
      && session.netTransport !== null
      && !session.netTransport.peerIds().includes(session.hostPeerId);
    const peersGone = isNetworked(world)
      && world.gameState === 'PLAYING'
      && session.netTransport !== null
      && (session.netTransport.peerCount() === 0 || hostLost);
    // S82 P4(b) — AUTO-RECONNECT grace (amends LOCKED §13.7 "no reconnect", user-
    // authorized). On loss, a RECONNECT_GRACE_MS window opens: the CLIENT periodically
    // tears the dead transport and re-runs the join path with the same room code —
    // the page never reloaded, so Trystero's selfId is unchanged and the host's frozen
    // peerId→seat map re-binds us; the TOFU/crypto latch survives (teardownNet is NOT
    // called) and the next 10Hz snapshot restores state. The HOST side keeps its
    // transport (clients rejoin to it) and simply waits out the same grace. Only after
    // the window expires does the terminal CONNECTION LOST overlay take over.
    const nowMs = performance.now();
    let connectionLost = false;
    if (peersGone) {
      if (reconnectUntilMs === 0) {
        reconnectUntilMs = nowMs + RECONNECT_GRACE_MS;
        reconnectNextRetryMs = nowMs + RECONNECT_FIRST_RETRY_DELAY_MS;
      }
      if (nowMs < reconnectUntilMs) {
        if (!world.isHost && session.roomCode !== null && nowMs >= reconnectNextRetryMs) {
          reconnectNextRetryMs = nowMs + RECONNECT_RETRY_MS;
          console.warn('[net] reconnect attempt — rejoining room', session.roomCode);
          if (session.netTransport !== null) session.netTransport.disconnect();
          connectAsClient(clientJoinDeps, session.roomCode);
        }
        lobbyScreen.setConnectionLostReconnecting(true, (reconnectUntilMs - nowMs) / 1000);
        lobbyScreen.setConnectionLostVisible(true);
      } else {
        lobbyScreen.setConnectionLostReconnecting(false);
        lobbyScreen.setConnectionLostVisible(true);
        connectionLost = true; // terminal — drives the cinematic-abort edge below
      }
    } else {
      reconnectUntilMs = 0;
      lobbyScreen.setConnectionLostVisible(false);
    }
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
        const strategySummary = formatStrategySummary(td.strategies);
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
        const strategySummary = formatStrategySummary(td.strategies);
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
    // controls.ts).
    // S72 P2 — gate widened from `PLAYING && isNetworked` to just `PLAYING`: the
    // Pac-Man hunter (host sim) chases world.players[target].avatarPos, so a SOLO
    // player's avatarPos must now track the cursor too (pre-S72 nothing consumed a
    // solo avatarPos so it was networked-only). The 10Hz + 2px throttle is unchanged;
    // in solo the dispatch is local-only (no wire traffic). Networked behaviour is
    // identical to before.
    if (world.gameState === 'PLAYING') {
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
    // S97 G3b — persist newly-discovered combos to the cross-match Combo Codex store. world.
    // discoveredCombos is per-match (cleared on START_GAME/RETURN_TO_TITLE), so mirror its GROWTH
    // into localStorage on the rising size edge → the title-screen Combo Codex remembers across
    // matches + survives an abrupt quit. Host + the 1v1 client (which mirrors the host's set via the
    // snapshot) each persist their own witnessed view. On clear the size drops → tracker resets, no
    // write. mergeDiscoveredCombos itself no-ops the write when nothing new lands.
    if (world.discoveredCombos.size !== lastDiscoveredComboSize) {
      if (world.discoveredCombos.size > lastDiscoveredComboSize) {
        mergeDiscoveredCombos(world.discoveredCombos);
      }
      lastDiscoveredComboSize = world.discoveredCombos.size;
    }
    // S104 P3 — unlock-on-build for the TOWERS & STRUCTURES Codex tab. runSpawnerIgnition /
    // runDefenderIgnition only DISPATCH (they never call unlockGodly), so those tiles could never
    // reveal. A spawner/defender LIVE in the synced world unlocks its tile — uniform on host AND the
    // 1v1 client (both hold the synced maps; the combo-mirror precedent above). unlockGodly is
    // idempotent pure-localStorage (zero sim coupling); the maps are tiny so the per-frame scan is free.
    if (world.creatureSpawners.size > 0 || world.defenders.size > 0) {
      for (const sp of world.creatureSpawners.values()) unlockGodly(sp.recipeId);
      for (const d of world.defenders.values()) unlockGodly(d.recipeId);
    }
    // S93 — draw the NONET trial overlay on top (hidden when world.sudoku is null).
    if (world.sudoku !== null) ensureNonetOverlay();
    nonetOverlay?.render(world);
    // S93 — realm-shift audio: rising edge → swap to the trial theme; falling edge → restore the
    // duel track. Edge-driven (the audio fns are idempotent). All modes: the host sets world.sudoku
    // locally; a 1v1 client receives it via NetSnapshot, so both peers hear the realm theme.
    const nonetActiveNow = world.sudoku !== null;
    if (nonetActiveNow !== prevNonetActive) {
      if (nonetActiveNow) {
        void enterNonetRealm();
        unlockGodly(NONET_CODEX_ID); // S94 — reveal the NONET Codex entry on first trial
      } else {
        exitNonetRealm();
      }
      prevNonetActive = nonetActiveNow;
    }
    // S95 — resolve juice: a bigger one-shot shake the moment the trial is decided (solve OR timeout),
    // pairing with the overlay's winner-colour flood. Edge-driven off the synced resolvedTick so host
    // + client jolt together; reset to null when the trial clears so the next trial can fire again.
    const curNonetResolvedTick = world.sudoku?.resolvedTick ?? null;
    if (shouldTriggerNonetResolveShake(prevNonetResolvedTick, curNonetResolvedTick)) {
      screenShake.trigger(world.tick, 5, 20);
    }
    prevNonetResolvedTick = curNonetResolvedTick;
    const freeSparkArr = freeSparkArray(world.freeSparks);
    // S45 Sym C(a) — pass world for per-frame carrier-color tint resolution
    // of Carried-state sparks. SparkRenderer falls back to FREE_SPARK_TINT
    // defensively when world omitted or carrier missing (Battle Ledger C4).
    sparkRenderer.sync(freeSparkArr, world);
    structureRenderer.sync(world);
    // S100 P1 (TD Phase 1a) — spawner-zone aura. After structureRenderer (so the
    // 'alive' bond overlay traces over the just-drawn bonds) and before the
    // creatures (so chewers/Voltkin draw on top of the aura). Cheap no-op when
    // world.creatureSpawners is empty.
    spawnerZoneRenderer.sync(world);
    // S25 P0 — creature sprite sync. After structureRenderer (z-order: above
    // prims, blueprint Q1) and before effectsRenderer (so ARC_FLASH effects
    // can stack above creatures in S27). Cheap when world.creatures empty.
    // S100 P1 — creatureRenderer now draws VOLTKIN only; chewerRenderer (below)
    // draws the persistent chewers from the same world.creatures map.
    creatureRenderer.sync(world);
    // S100 P1 (TD Phase 1a) — chewer pencil-sketch + physics hop. Cheap when no chewer is live.
    chewerRenderer.sync(world);
    // S103 P3 — laser-turret defenders (charge/beam off synced state). Cheap when none live.
    turretRenderer.sync(world);
    // S103 P4 — HELGA princess defenders (articulated slap rig off synced state). Cheap when none live.
    princessRenderer.sync(world);
    // S71 P1 — bomb sprites (after creatures, before the effects wipe).
    bombRenderer.sync(world);
    // S72 P2 — hunter wedge (after bombs, before the effects wipe). Faces the chased
    // player's avatar; chomp + catch-burst + escape-fade are FSM-driven from state.
    hunterRenderer.sync(world);
    // S72 P3 — potato (FREE/CARRIED/ARMED + fuse-countdown VFX), before the effects wipe.
    potatoRenderer.sync(world);
    // S75 P3 — rainbow (dumb arc + tooth + bob), before the effects wipe.
    rainbowRenderer.sync(world);
    // S84 P2 — flyover celebration window + its yell (both keyed off the synced
    // rainbowSwitchTick field, not world.effects — see renderer docblock).
    rainbowFlyoverRenderer.sync(world);
    syncRainbowYellAudio(world);
    // S77 P3 — seagull (flapping gull + shadow) + poop (falling/splat), before the effects wipe.
    seagullRenderer.sync(world);
    poopRenderer.sync(world);
    // S18 P1 — drain audio effects BEFORE effectsRenderer (which wipes
    // world.effects). Cursor-gated; replay-safe.
    drainAudioEffects(world.effects, world.tick);
    // S23 P2 — debug overlay sync runs BEFORE effects wipe so chain-progress
    // sees this frame's bonds. Cheap when null (no-op).
    if (debugOverlay !== null) debugOverlay.sync(world, debugProbes);
    effectsRenderer.sync(world);
    avatarRenderer.sync(world, controls);
    // S98 P3 — pulsating preview of the bond(s) the dragged spark would form.
    dragPreviewRenderer.sync(world, controls);
    // S86 P4 — the spark IS the pointer: hide the OS cursor over the canvas
    // while the board is live (round-6 user ask). Title/lobby/win/postgame
    // restore the native pointer (UI surfaces); DOM overlays (settings,
    // debug) sit above the canvas and keep their own cursors. While the
    // avatar can't track the mouse (pooped chase / benched), the
    // avatarRenderer draws a faint local ghost ring at the real cursor.
    //
    // IMPORTANT: Pixi's EventSystem owns canvas.style.cursor — it re-applies
    // cursorStyles[mode] on every pointer interaction (hover over a Pixi
    // button → 'pointer', anything else → cursorStyles.default). A direct
    // one-shot style write gets clobbered on the next pointermove (caught
    // live in the S86 preview pass: the title button's hover left 'pointer'
    // stuck over the live board). So the durable switch is Pixi's OWN
    // default mode; the direct style write below only makes the transition
    // instant instead of waiting for the next pointer event.
    const hideOsCursor = shouldHideOsCursor(world.gameState);
    if (hideOsCursor !== osCursorHidden) {
      osCursorHidden = hideOsCursor;
      const cursorMode = hideOsCursor ? 'none' : 'inherit';
      app.renderer.events.cursorStyles.default = cursorMode;
      app.canvas.style.cursor = cursorMode;
    }
    // S57 P1 — fog mask. Live cursor = personal-vision centre (lag-free);
    // ticker.deltaMS drives the win-lift fade. Cheap no-op in solo / once lifted.
    fogRenderer.sync(world, controls.cursor, app.ticker.deltaMS / 1000);
    hud.sync(world);
    // S88 G3a — discovery toast window (keyed off the synced comboToastTick, like the
    // rainbow flyover — see comboToastRenderer docblock). HUD-tier, after hud.sync.
    comboToastRenderer.sync(world);
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
