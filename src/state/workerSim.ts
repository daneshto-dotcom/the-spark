/**
 * SPARK — S122 P1 (B2 phase d): the worker-sim BATCH CORE + message protocol.
 *
 * This module is the testable heart of the `?worker=1` cutover: everything here is
 * DOM/Pixi/transport-free (state/, physics/, game/, input/controlsCore only), so the
 * differential HARD gate (workerSim.differential.test.ts) drives it directly in vitest and
 * the real Worker entry (src/simWorker.ts) is a thin postMessage shell around it.
 *
 * ARCHITECTURE (S122 Council L1/L2 + the TD-heavy ROI measurement, WORKER_SIM_FOUNDATION.md):
 *   • The worker owns the AUTHORITATIVE World + Spawner + SpatialGrid + HostTickState.
 *   • Main posts one TickBatch per render frame (request/response discipline — main never
 *     posts batch N+1 before result N; the accumulator carries over). ticks = the frames'
 *     drained fixed steps (≤3, the 0.05s clamp), intents = host-local actions + pre-stamped
 *     remote INTENTs since the last batch.
 *   • The worker drains the ticks (NONET-freeze branch included), runs the godly matcher
 *     CORE once per batch (cadence cap preserved — one trigger max), advances the
 *     tick-domain cinematic scheduler, then answers with a BatchResult:
 *       – positions: a flat Float64Array (TRANSFERABLE — zero-copy, zero GC) of every
 *         continuously-moving entity, applied to the main-thread mirror EVERY frame;
 *       – snapshot + hash + full effects: attached ONLY on STRUCTURAL batches (any effects
 *         emitted ∨ intents dispatched ∨ structural signature changed ∨ 100 ms floor) —
 *         the measured 50 KB TD-heavy netSnapshot costs ~5 ms to clone under 6× throttle,
 *         so it must NOT ride every frame (ROI rule v2 verdict); the ≥10 Hz floor batch
 *         doubles as the remote-peer wire snapshot.
 *   • hashWorldState rides every snapshot batch → main cross-checks its mirror after the
 *     full apply (positions of prims/bonds/sparks + tick + scores are all snapshot-borne,
 *     so a faithful apply hashes identically).
 *
 * DETERMINISM: same modules, same order, same tick semantics as the direct path — proven
 * byte-identical by the differential gate. The worker shares the page's V8 isolate
 * semantics (S107 audit #2), and runHostTick/stepPhysics already carry replay HARD gates.
 */

// Type-only (erased at compile time): workerSim.ts is ALSO imported by main.ts
// (applyPositions), so a VALUE import here would drag the S87 lazy bot chunk into the
// entry bundle. The concrete BotManager is INJECTED by the caller: simWorker.ts (worker
// chunk, static import — S123 P1) and the differential/unit tests construct it themselves.
import type { BotManager } from '../bots/botManager.ts';
import type { BotDifficulty } from '../bots/botTypes.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner, type SpawnerConfig } from '../game/spawner.ts';
import type { GameEffect } from '../game/effects.ts';
import {
  applyControlsPerSubstep,
  type ControlsLike,
  type ControlState,
} from '../input/controlsCore.ts';
import { SpatialGrid } from '../physics/spatial.ts';
import { makeGameStateExtras, type GameStateExtras } from './gameState.ts';
import {
  makeWorkerCinematicState,
  runGodlyMatcherCore,
  tickWorkerCinematics,
  type GodlyMatcherCursor,
  type WorkerCinematicState,
} from './godlyMatcherCore.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { netSnapshot, restore, type NetSnapshot, type WorldSnapshot } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { tickSudoku } from './sudokuEvent.ts';
import { dispatch, makeWorld, type GameAction, type World } from './world.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';

// The host grid cell size — mirrors main.ts's module-const SPATIAL_CELL_SIZE (=32, main.ts:164).
const SPATIAL_CELL_SIZE_MIRROR = 32;

// ── Message protocol ────────────────────────────────────────────────────────────────────

export interface WorkerInitMsg {
  readonly type: 'INIT';
  /** Full-fidelity save (snapshot(world, {spawnerState}) JSON) — the S82 bit-exact restore path. */
  readonly saveJson: string;
  /** The host's frozen peerId→seat entries (session.hostSeats). */
  readonly hostSeats: ReadonlyArray<readonly [string, number]>;
  readonly localPlayerId: number;
  /** DEV test-seam spawn-rate override (the e2e __TEST_SPAWN_RATE_PER_SECOND__ seam). */
  readonly ratePerSecond?: number;
  /**
   * S123 P1 — VS-BOTS worker support. One difficulty per bot seat (seats 1..N; the
   * BotManager ctor contract). Present ⇒ the worker owns the bots (fresh-from-seed —
   * Council S123 design (A): the INIT snapshot is taken on the first PLAYING frames,
   * BEFORE any bot's first think tick (min stagger ≥ 6 ticks), so there is no bot
   * decision-state to lose; BotController additionally self-heals IDLE-while-Carrying).
   */
  readonly botDifficulties?: readonly BotDifficulty[];
  /**
   * The matchSeed the main thread constructed ITS BotManager with (reseedForNewMatch's
   * draw). Explicit rather than derived from world.rngSeed so future rngSeed rewrite
   * paths (fallback repair, migration takeover) can never skew the bot streams.
   */
  readonly botMatchSeed?: number;
}

export interface WorkerTickBatchMsg {
  readonly type: 'TICK_BATCH';
  readonly batchSeq: number;
  /** Fixed steps to drain this frame (main's accumulator count; ≤3 by the 0.05 s clamp). */
  readonly ticks: number;
  /** The host player's live gesture FSM + cursor (main's Controls is the pointer authority). */
  readonly control: { readonly state: ControlState; readonly cursor: Vec2 };
  /** Transport-alive peer ids this frame, or null when no transport (solo). */
  readonly alivePeerIds: readonly string[] | null;
  /** Host-local actions + pre-stamped remote INTENT actions received since the last batch. */
  readonly intents: readonly GameAction[];
  /** main-thread performance.now() — the single clock for the 10 Hz snapshot floor. */
  readonly nowMs: number;
}

export interface WorkerBatchResultMsg {
  readonly type: 'BATCH_RESULT';
  readonly batchSeq: number;
  readonly tick: number;
  /** Flat position payload (transferable) — see buildPositions for the layout. */
  readonly positions: Float64Array;
  /** Present on STRUCTURAL batches only (≥10 Hz floor): the full wire/mirror snapshot. */
  readonly snapshot?: NetSnapshot;
  /** hashWorldState(worker world) at snapshot time — main cross-checks its mirror. */
  readonly hash?: number;
  /**
   * The UNTRIMMED effects of the final batch frame (netSnapshot trims host-only creature
   * fields but keeps effects; this rides alongside so the host mirror renders the exact
   * effect set the direct path would have — audio cues + shake + bond pops lose nothing).
   */
  readonly effects?: GameEffect[];
  /** Godly triggers fired this batch (≤1 — the cadence cap), tick-tagged (Council L2). */
  readonly godlyEvents: ReadonlyArray<{ readonly event: GodlyTriggerEvent; readonly tick: number }>;
}

export type WorkerInboundMsg = WorkerInitMsg | WorkerTickBatchMsg;

// ── The worker-side Controls facade ─────────────────────────────────────────────────────

/**
 * ControlsLike over the per-batch-posted gesture frame. Main's DOM-wired Controls remains
 * the pointer/FSM authority (it re-posts its state every frame); the facade runs the
 * byte-identical authoritative per-substep body (attract lerp, bench gesture-kill,
 * carrying hard-snap) INSIDE the sim, exactly where stepPhysics expects it.
 */
export class WorkerControls implements ControlsLike {
  state: ControlState = { kind: 'Idle' };
  readonly cursor: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly world: World,
    private readonly playerId: PlayerId,
  ) {}

  setFrame(control: { readonly state: ControlState; readonly cursor: Vec2 }): void {
    this.state = control.state;
    this.cursor.x = control.cursor.x;
    this.cursor.y = control.cursor.y;
  }

  applyPerSubstep(): void {
    this.state = applyControlsPerSubstep(
      this.world,
      this.playerId,
      this.state,
      this.cursor,
      (action) => { dispatch(this.world, action); },
    );
  }
}

// ── Sim state ───────────────────────────────────────────────────────────────────────────

export interface WorkerSim {
  readonly world: World;
  readonly spawner: Spawner;
  readonly grid: SpatialGrid;
  readonly controls: WorkerControls;
  readonly gameStateExtras: GameStateExtras;
  readonly hostTickState: HostTickState;
  readonly matcherCursor: GodlyMatcherCursor;
  readonly cinematics: WorkerCinematicState;
  readonly hostSeats: Map<string, PlayerId>;
  /** S123 P1 — the worker-authoritative bots (null: not a bots match / no factory). */
  readonly botManager: BotManager | null;
  /** nowMs (main clock) of the last snapshot-bearing batch — the 10 Hz floor anchor. */
  lastSnapshotAtMs: number;
  /** Structural signature at the last snapshot — change ⇒ attach a fresh snapshot. */
  lastStructuralSig: string;
}

/**
 * `makeBotManager` — the injection seam for the S87 lazy bot chunk (see the type-only
 * import note above). The seed-fallback rule lives HERE (tested core): explicit
 * botMatchSeed wins; otherwise the restored world.rngSeed (== matchSeed for a normal
 * bots match — reseedForNewMatch sets both from one draw and rngSeed never mutates
 * during play).
 */
export function makeWorkerSim(
  init: WorkerInitMsg,
  makeBotManager?: (difficulties: readonly BotDifficulty[], matchSeed: number) => BotManager,
): WorkerSim {
  const world = makeWorld(1);
  const snap = JSON.parse(init.saveJson) as WorldSnapshot;
  restore(snap, world);
  world.isHost = true;
  world.localPlayerId = asPlayerId(init.localPlayerId);
  const cfg: SpawnerConfig =
    init.ratePerSecond !== undefined
      ? { ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: init.ratePerSecond }
      : DEFAULT_SPAWNER_CONFIG;
  // Construction seeds are placeholders — restoreState below rewinds every stream word +
  // in-flight countdown to the save's exact values (bit-exact resume, the S82 guarantee).
  // All five streams are non-null to match main.ts's construction shape (a null stream
  // would permanently disable that hazard class regardless of restored state).
  const spawner = new Spawner(
    cfg,
    mulberry32(0x5122_0001),
    mulberry32(0x5122_0002),
    mulberry32(0x5122_0003),
    mulberry32(0x5122_0004),
    mulberry32(0x5122_0005),
  );
  if (snap.spawner !== undefined && snap.spawner !== null) spawner.restoreState(snap.spawner);
  const botManager =
    init.botDifficulties !== undefined &&
    init.botDifficulties.length > 0 &&
    makeBotManager !== undefined
      ? makeBotManager(init.botDifficulties, init.botMatchSeed ?? world.rngSeed)
      : null;
  const sim: WorkerSim = {
    world,
    spawner,
    grid: new SpatialGrid(SPATIAL_CELL_SIZE_MIRROR),
    controls: new WorkerControls(world, asPlayerId(init.localPlayerId)),
    gameStateExtras: makeGameStateExtras(),
    hostTickState: makeHostTickState(world),
    matcherCursor: { lastMatcherTick: -1 },
    cinematics: makeWorkerCinematicState(),
    hostSeats: new Map(init.hostSeats.map(([peer, seat]) => [peer, asPlayerId(seat)])),
    botManager,
    lastSnapshotAtMs: 0,
    lastStructuralSig: '',
  };
  return sim;
}

// ── Structural-change detection (when must a full snapshot ride the result?) ────────────

/**
 * A cheap fingerprint of everything the positions payload does NOT carry. Any change ⇒ the
 * mirror needs a full apply. Collection sizes catch spawn/despawn; the scalar fields catch
 * the state-machine transitions (WIN, NONET, cinematics, benches, foul/discovery counters).
 * Same-batch spawn+despawn pairs that leave a size unchanged are covered by the effects/
 * intents triggers upstream and, worst case, the 100 ms floor (documented known-delta).
 */
export function structuralSignature(world: World): string {
  let benched = 0;
  for (const p of world.players.values()) {
    if (p.benchedUntilTick !== undefined) benched++;
  }
  return [
    world.gameState,
    world.primitives.size,
    world.bonds.size,
    world.freeSparks.size,
    world.players.size,
    world.creatures.size,
    world.creatureSpawners.size,
    world.defenders.size,
    world.bombs.size,
    world.hunters.size,
    world.potatoes.size,
    world.rainbows.size,
    world.seagulls.size,
    world.poops.size,
    world.fouledPrimitives.size,
    world.discoveredCombos.size,
    world.sudoku === null ? 0 : 1,
    world.activeCinematicPlayerId ?? -1,
    world.lastWinnerId ?? -1,
    world.rainbowSwitchTick ?? -1,
    world.hunterSpawned ? 1 : 0,
    benched,
    Math.floor(world.scoreProgress),
  ].join('|');
}

// ── Positions payload (60 Hz, transferable, zero-GC apply) ──────────────────────────────
//
// Layout (all f64; ids are integers ≪ 2^53 so exact):
//   [0] tick   [1] scoreProgress
//   then 8 sections, each: [count, (id, x, y) × count]
//   section order: players(avatarPos), primitives, freeSparks, creatures,
//                  hunters, seagulls, poops, potatoes
// Static-while-alive entities (bonds derive from prims; bombs/rainbows never move) are
// excluded — their spawn/despawn is structural by definition.

const POSITION_SECTIONS = 8;

export function buildPositions(world: World): Float64Array {
  const n =
    world.players.size + world.primitives.size + world.freeSparks.size + world.creatures.size +
    world.hunters.size + world.seagulls.size + world.poops.size + world.potatoes.size;
  const out = new Float64Array(2 + POSITION_SECTIONS + n * 3);
  let o = 0;
  out[o++] = world.tick;
  out[o++] = world.scoreProgress;
  out[o++] = world.players.size;
  for (const p of world.players.values()) {
    out[o++] = p.id as unknown as number;
    out[o++] = p.avatarPos.x;
    out[o++] = p.avatarPos.y;
  }
  const section = (entries: Iterable<{ id: unknown; pos: Vec2 }>, size: number): void => {
    out[o++] = size;
    for (const e of entries) {
      out[o++] = e.id as number;
      out[o++] = e.pos.x;
      out[o++] = e.pos.y;
    }
  };
  section(world.primitives.values(), world.primitives.size);
  section(world.freeSparks.values(), world.freeSparks.size);
  section(world.creatures.values(), world.creatures.size);
  section(world.hunters.values(), world.hunters.size);
  section(world.seagulls.values(), world.seagulls.size);
  section(world.poops.values(), world.poops.size);
  section(world.potatoes.values(), world.potatoes.size);
  return out;
}

/**
 * Apply a positions payload onto the mirror. Entities absent from the mirror (spawned since
 * the last full apply) are skipped — the structural rule guarantees a full snapshot rode the
 * batch that created them. `dragLockedSparkId` shields the host's locally-predicted drag
 * spark exactly like ClientSync.interpolateInto does for a joiner.
 */
export function applyPositions(
  world: World,
  arr: Float64Array,
  dragLockedSparkId?: number,
): void {
  let o = 0;
  world.tick = arr[o++];
  world.scoreProgress = arr[o++];
  const nPlayers = arr[o++];
  for (let i = 0; i < nPlayers; i++) {
    const id = arr[o++], x = arr[o++], y = arr[o++];
    const p = world.players.get(id as unknown as PlayerId);
    if (p !== undefined) { p.avatarPos.x = x; p.avatarPos.y = y; }
  }
  const section = (map: Map<never, { pos: Vec2 }>, skipId?: number): void => {
    const count = arr[o++];
    for (let i = 0; i < count; i++) {
      const id = arr[o++], x = arr[o++], y = arr[o++];
      if (skipId !== undefined && id === skipId) continue;
      const e = map.get(id as never);
      if (e !== undefined) { e.pos.x = x; e.pos.y = y; }
    }
  };
  section(world.primitives as unknown as Map<never, { pos: Vec2 }>);
  section(world.freeSparks as unknown as Map<never, { pos: Vec2 }>, dragLockedSparkId);
  section(world.creatures as unknown as Map<never, { pos: Vec2 }>);
  section(world.hunters as unknown as Map<never, { pos: Vec2 }>);
  section(world.seagulls as unknown as Map<never, { pos: Vec2 }>);
  section(world.poops as unknown as Map<never, { pos: Vec2 }>);
  section(world.potatoes as unknown as Map<never, { pos: Vec2 }>);
}

// ── The batch application (the drain loop, relocated) ───────────────────────────────────

export interface ApplyTickBatchOpts {
  /** Force a snapshot on every batch (the differential gate + debug). */
  readonly forceSnapshot?: boolean;
}

/**
 * One render frame's worth of authoritative sim: intents → tick drain (NONET branch
 * included) → godly matcher core (once — the cadence cap) → cinematic scheduler →
 * structural decision → result. Mirrors main.ts's per-frame order; the snapshot is built
 * AFTER the matcher (a trigger ships in the same batch, one frame sooner than the direct
 * path's send-before-matcher — latency-only, determinism-neutral, documented).
 */
export function applyTickBatch(
  sim: WorkerSim,
  batch: WorkerTickBatchMsg,
  opts: ApplyTickBatchOpts = {},
): WorkerBatchResultMsg {
  const world = sim.world;
  for (const action of batch.intents) {
    // Pre-validated on main (allowlist + seat stamp for remote; local actions are the
    // host's own). A reducer reject must not kill the batch — mirror the reducer-throw
    // posture of the direct dispatch sites.
    try {
      dispatch(world, action);
    } catch (err) {
      console.error('[workerSim] intent dispatch rejected:', err instanceof Error ? err.message : String(err));
    }
  }
  sim.controls.setFrame(batch.control);
  const deps: HostTickDeps = {
    spawner: sim.spawner,
    grid: sim.grid,
    controls: sim.controls,
    // S123 P1 — worker-authoritative bots: ticked inside runHostTick at the exact
    // direct-path site (hostTick.ts), same dispatch-only actuation + gates.
    botManager: sim.botManager,
    gameStateExtras: sim.gameStateExtras,
    alivePeerIds: batch.alivePeerIds !== null ? new Set(batch.alivePeerIds) : null,
    hostSeats: sim.hostSeats,
  };
  for (let i = 0; i < batch.ticks; i++) {
    // S93 NONET freeze — the drain-loop branch, verbatim semantics (main.ts:1095).
    if (world.gameState === 'PLAYING' && world.sudoku !== null) {
      world.tick++;
      tickSudoku(world);
      continue;
    }
    runHostTick(world, deps, sim.hostTickState);
  }
  const godlyEvents: Array<{ event: GodlyTriggerEvent; tick: number }> = [];
  if (world.gameState === 'PLAYING') {
    const fired = runGodlyMatcherCore(world, sim.matcherCursor);
    if (fired !== null) godlyEvents.push({ event: fired, tick: world.tick });
  }
  tickWorkerCinematics(world, sim.cinematics);

  const sig = structuralSignature(world);
  const structural =
    opts.forceSnapshot === true ||
    world.effects.length > 0 ||
    batch.intents.length > 0 ||
    godlyEvents.length > 0 ||
    sig !== sim.lastStructuralSig ||
    batch.nowMs - sim.lastSnapshotAtMs >= 100;

  let snapshot: NetSnapshot | undefined;
  let hash: number | undefined;
  let effects: GameEffect[] | undefined;
  if (structural) {
    snapshot = netSnapshot(world);
    hash = hashWorldState(world);
    effects = world.effects.slice();
    sim.lastSnapshotAtMs = batch.nowMs;
    sim.lastStructuralSig = sig;
  }
  const positions = buildPositions(world);
  // Renderer-equivalent effects wipe (post-matcher, post-snapshot — the exact direct-mode
  // frame lifecycle; effectsRenderer clears the mirror's own copy on main).
  world.effects.length = 0;

  return {
    type: 'BATCH_RESULT',
    batchSeq: batch.batchSeq,
    tick: world.tick,
    positions,
    ...(snapshot !== undefined ? { snapshot } : {}),
    ...(hash !== undefined ? { hash } : {}),
    ...(effects !== undefined ? { effects } : {}),
    godlyEvents,
  };
}
