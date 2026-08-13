/**
 * SPARK — S122 P1 (B2 phase d): worker-sim batch-envelope differential (HARD GATE).
 *
 * Proves the `?worker=1` message path adds NOTHING to the sim: a REFERENCE run that
 * hand-executes the direct per-frame semantics (intents → tick drain incl. the NONET-freeze
 * branch → godly matcher core once per frame → tick-domain cinematic scheduler → snapshot)
 * against a BATCH run driven exclusively through the real INIT (JSON save adoption:
 * makeWorkerSim) + applyTickBatch message envelope. Every frame's netSnapshot JSON and
 * hashWorldState must be IDENTICAL across 300 frames of live play: spawner churn, cursor
 * drags through the WorkerControls facade, scripted placements (bond/effect/matcher
 * activity), and a forced mid-run NONET freeze.
 *
 * Companions: hostTick.replay/differential (the tick body itself), stepPhysics replay
 * (S107). This gate covers the ENVELOPE: save adoption, intent ordering, batch cadence,
 * matcher/cinematic scheduling, and the structural-snapshot machinery.
 */

import { describe, expect, it } from 'vitest';
import { BotManager } from '../bots/botManager.ts';
import type { BotDifficulty } from '../bots/botTypes.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { SpatialGrid } from '../physics/spatial.ts';
import { makeGameStateExtras } from './gameState.ts';
import {
  makeWorkerCinematicState,
  runGodlyMatcherCore,
  tickWorkerCinematics,
} from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { applyNetSnapshot, netSnapshot, snapshot } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { mintNonetSeed, startSudoku, tickSudoku } from './sudokuEvent.ts';
import {
  applyPositions,
  applyTickBatch,
  buildPositions,
  makeWorkerSim,
  structuralSignature,
  WorkerControls,
  type WorkerTickBatchMsg,
} from './workerSim.ts';
import { dispatch, makeWorld, type GameAction, type World } from './world.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { applySpawnHunter } from './hunters/hunterLifecycle.ts';
// S143 P3 — SparkType feeds the gatherer order queue seeded below; see scriptInputs.
import { HUNTER_HUNT_TICKS, SparkType } from '../constants.ts';

const P0 = asPlayerId(0);
const SEED = 0x51220042;
const CHURN_RATE = 3; // elevated spawner rate — keeps the field busy across 300 frames

// S123 P1 — the bots scenario: two fast difficulties for maximum acted-path coverage
// (HARD severs/cleans/rainbows; IMBA adds potato + shrink) within the frame budget.
const BOT_DIFFS: readonly BotDifficulty[] = ['HARD', 'IMBA'];
const BOT_SEED = 0x51230001;

/** A deterministic solo-PLAYING world (the worker-mode v1 scope: no bots). */
function buildSoloWorld(): World {
  const world = makeWorld(SEED);
  world.gameState = 'TITLE';
  dispatch(world, { type: 'START_GAME', mode: 'solo', isHost: true });
  return world;
}

/** S123 P1 — a deterministic VS-BOTS PLAYING world (human seat 0 + bots 1..N). */
function buildBotsWorld(): World {
  const world = makeWorld(SEED);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: BOT_DIFFS.length + 1 }, (_, seat) => ({
    seat,
    color: 0x111111 * (seat + 1),
  }));
  const botSeats = BOT_DIFFS.map((_, i) => i + 1);
  dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats });
  return world;
}

interface Rig {
  world: World;
  frame: (batch: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>) => { json: string; hash: number };
}

/** The REFERENCE: hand-rolled direct-path frame semantics over the same primitives.
 *  S123 P1 — `botManager` mirrors main.ts's direct path: ticked INSIDE runHostTick. */
function buildReferenceRig(world: World, botManager: BotManager | null = null): Rig {
  const spawner = new Spawner(
    { ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: CHURN_RATE },
    mulberry32(1),
    mulberry32(2),
    mulberry32(3),
    mulberry32(4),
    mulberry32(5),
  );
  const grid = new SpatialGrid(32);
  const controls = new WorkerControls(world, P0);
  const gameStateExtras = makeGameStateExtras();
  const hostTickState = makeHostTickState(world);
  const matcherCursor = { lastMatcherTick: -1 };
  const cinematics = makeWorkerCinematicState();
  return {
    world,
    frame: (batch) => {
      for (const action of batch.intents) {
        try {
          dispatch(world, action);
        } catch {
          /* mirror applyTickBatch's reducer-reject posture */
        }
      }
      controls.setFrame(batch.control);
      const deps: HostTickDeps = {
        spawner,
        grid,
        controls,
        botManager,
        gameStateExtras,
        alivePeerIds: batch.alivePeerIds !== null ? new Set(batch.alivePeerIds) : null,
        hostSeats: new Map(),
      };
      for (let i = 0; i < batch.ticks; i++) {
        if (world.gameState === 'PLAYING' && world.sudoku !== null) {
          world.tick++;
          tickSudoku(world);
          continue;
        }
        runHostTick(world, deps, hostTickState);
      }
      if (world.gameState === 'PLAYING') runGodlyMatcherCore(world, matcherCursor);
      tickWorkerCinematics(world, cinematics);
      const json = JSON.stringify(netSnapshot(world));
      // S133 P1 — deliberately the NARROW hash here, and it must STAY narrow: the
      // batch rig's counterpart value is `applyTickBatch(...).hash`, computed by
      // PRODUCTION `workerSim.ts`, which the S133 Council ruling keeps narrow (widening
      // it would put a per-entity projection on the main.ts's `hashWorldState(world)` call site hot path). Comparing a
      // wide hash against that prod value would compare two different functions and
      // fail for a reason that is not a divergence — it did, before this comment.
      // The WIDE two-simulation comparison lives in the frame loops below, computed on
      // both Worlds directly, where it is apples-to-apples.
      const hash = hashWorldState(world);
      world.effects.length = 0;
      return { json, hash };
    },
  };
}

/** The BATCH path: the real INIT (JSON save round-trip) + applyTickBatch envelope.
 *  S123 P1 — `bots` rides the real INIT fields + the simWorker.ts factory seam. */
function buildBatchRig(
  sourceWorld: World,
  bots?: { difficulties: readonly BotDifficulty[]; seed: number },
): Rig {
  // The reference rig hasn't ticked yet — snapshot the pristine world exactly like
  // main.ts's INIT does (spawner state omitted here: both spawners start pristine at the
  // same construction seeds? NO — construction seeds differ, so state MUST ride the save).
  const refSpawner = new Spawner(
    { ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: CHURN_RATE },
    mulberry32(1),
    mulberry32(2),
    mulberry32(3),
    mulberry32(4),
    mulberry32(5),
  );
  const saveJson = JSON.stringify(snapshot(sourceWorld, { spawnerState: refSpawner.getState() }));
  const sim = makeWorkerSim(
    {
      type: 'INIT',
      saveJson,
      hostSeats: [],
      localPlayerId: 0,
      ratePerSecond: CHURN_RATE,
      ...(bots !== undefined
        ? { botDifficulties: bots.difficulties, botMatchSeed: bots.seed }
        : {}),
    },
    (difficulties, matchSeed) => new BotManager(difficulties, matchSeed),
  );
  let seq = 0;
  return {
    world: sim.world,
    frame: (batch) => {
      const result = applyTickBatch(
        sim,
        { type: 'TICK_BATCH', batchSeq: ++seq, ...batch },
        { forceSnapshot: true },
      );
      return { json: JSON.stringify(result.snapshot), hash: result.hash! };
    },
  };
}

/** Deterministic per-frame inputs, computed from the REFERENCE world (identical worlds ⇒ identical picks). */
function scriptInputs(
  refWorld: World,
  frameIdx: number,
): Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'> {
  const ticks = 1 + (frameIdx % 3); // the 1..3 drain pattern the 0.05s clamp produces
  const cursor = {
    x: 400 + 500 * Math.abs(Math.sin(frameIdx * 0.05)),
    y: 300 + 300 * Math.abs(Math.cos(frameIdx * 0.037)),
  };
  // Drag the lowest Free spark on a rolling window; Idle otherwise.
  let lowestFree: number | null = null;
  for (const s of refWorld.freeSparks.values()) {
    if (s.state.kind === 'Free' && (lowestFree === null || (s.id as number) < lowestFree)) {
      lowestFree = s.id as number;
    }
  }
  const dragging = lowestFree !== null && frameIdx % 20 < 12;
  const control = {
    state: dragging
      ? ({ kind: 'AttractDrag', sparkId: asSparkId(lowestFree!), cursor } as const)
      : ({ kind: 'Idle' } as const),
    cursor,
  };
  // Every 25th frame: atomic placement of the dragged spark (bond/effect/matcher food).
  const intents: GameAction[] = [];
  if (frameIdx > 0 && frameIdx % 25 === 0 && lowestFree !== null) {
    intents.push({
      type: 'PLACE_FROM_FREE',
      sparkId: asSparkId(lowestFree),
      playerId: P0,
      placementPos: { x: cursor.x, y: cursor.y },
      stiffnessTier: 'MID',
      targetPrimitiveId: null,
    });
  }
  // ⛔ S143 P3 — SEED THE GATHERER ORDER QUEUE (S141 P2, V6-1.4).
  //
  // `gathererOrders` is marked `'hashed'` in FIELD_COVERAGE and IS projected by
  // `hashWorldStateFull`, but MEASURED over all 300 frames of both scenarios it was NEVER
  // non-empty — so its projection loop was dead code in every two-simulation comparison the repo
  // runs, and the wide hash's agreement said nothing whatever about it. That is the worst kind of
  // green: the oracle exists, is wired, and is looking at an empty set.
  //
  // The queue is an authoritative input to `pickGathererTarget`, so two sims holding different
  // queues send their gatherers to different sparks and diverge within a tick — exactly the class
  // this gate exists to catch. Both rigs consume this same `intents` array, so the seeding is
  // symmetric by construction and cannot itself introduce a difference.
  if (frameIdx > 0 && frameIdx % 40 === 0) {
    intents.push({
      type: 'ENQUEUE_GATHERER_ORDER',
      playerId: P0,
      sparkType: frameIdx % 80 === 0 ? SparkType.Square : SparkType.Circle,
    });
  }
  // One CANCEL, late enough that a queue exists to cancel from. This is deliberate coverage of the
  // DELETE-ON-EMPTY branch (`applyCancelGathererOrder` removes the map entry when the last entry
  // goes), which changes `gathererOrders.size` — a term the structural signature only started
  // carrying in this same priority.
  if (frameIdx === 220) {
    intents.push({ type: 'CANCEL_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Circle });
  }
  return { ticks, control, alivePeerIds: null, intents, nowMs: frameIdx * 16 };
}

describe('S122 P1 — worker-sim batch envelope differential (HARD GATE)', () => {
  it('300 live frames: batch path snapshots + hashes are byte-identical to the direct path', () => {
    const refWorld = buildSoloWorld();
    const ref = buildReferenceRig(refWorld);
    const batch = buildBatchRig(refWorld);

    // INIT adoption must be bit-exact BEFORE any tick.
    expect(hashWorldStateFull(batch.world)).toBe(hashWorldStateFull(refWorld));

    for (let f = 0; f < 300; f++) {
      const inputs = scriptInputs(refWorld, f);
      // Mid-run NONET freeze: force the trial identically on both worlds (same minted
      // seed — the worlds are byte-identical at this point) to exercise the freeze branch.
      if (f === 150 && refWorld.sudoku === null) {
        startSudoku(refWorld, P0, mintNonetSeed(refWorld));
        startSudoku(batch.world, P0, mintNonetSeed(batch.world));
      }
      const a = ref.frame(inputs);
      const b = batch.frame(inputs);
      if (a.json !== b.json || a.hash !== b.hash) {
        throw new Error(
          `DIVERGED at frame ${f}: hashRef=${a.hash} hashBatch=${b.hash} ` +
            `(json equal: ${a.json === b.json})`,
        );
      }
      // S133 P1 — WIDE per-frame comparison, computed on both Worlds directly.
      // Neither signal above can see it: `json` is netSnapshot, whose
      // `trimMirrorCreature` STRIPS `hp` and `chewProgress`; and `hash` is the narrow
      // six-field Pick. So before this line, the game's only two damage fields were
      // invisible to this HARD GATE in both of its channels.
      const wideRef = hashWorldStateFull(refWorld);
      const wideBatch = hashWorldStateFull(batch.world);
      if (wideRef !== wideBatch) {
        throw new Error(`WIDE (entity-family) divergence at frame ${f}: ref=${wideRef} batch=${wideBatch}`);
      }
    }
    // The run must have actually exercised the interesting paths.
    expect(refWorld.primitives.size).toBeGreaterThan(3); // placements landed
    expect(refWorld.tick).toBeGreaterThan(500);
  });

  it('S123 P1 — VS-BOTS: 300 live frames with worker-owned bots are byte-identical to the direct path (HARD GATE)', () => {
    const refWorld = buildBotsWorld();
    // Fresh-from-seed equivalence (Council S123 design (A)): BOTH sides construct their
    // OWN BotManager from the identical (difficulties, matchSeed) — exactly what main.ts
    // (direct) and simWorker.ts (worker) each do. Identical mulberry32 streams ⇒
    // identical decisions ⇒ byte-identical worlds, or this gate throws the frame index.
    const ref = buildReferenceRig(refWorld, new BotManager(BOT_DIFFS, BOT_SEED));
    const batch = buildBatchRig(refWorld, { difficulties: BOT_DIFFS, seed: BOT_SEED });

    // INIT adoption must be bit-exact BEFORE any tick (bots included in the roster).
    expect(hashWorldStateFull(batch.world)).toBe(hashWorldStateFull(refWorld));
    expect(batch.world.botSeats.size).toBe(BOT_DIFFS.length);

    // S143 P3 — the PEAK size each entity family reaches across the compared frames. Transient
    // families (rainbow, seagull, bomb, poop) are non-empty only briefly, so a final-frame read
    // reports 0 for a family that WAS in fact compared on every frame it existed.
    const peak = {
      creatures: 0, creatureSpawners: 0, defenders: 0, bombs: 0, hunters: 0,
      potatoes: 0, rainbows: 0, seagulls: 0, poops: 0, fouledPrimitives: 0,
      gatherers: 0, castleBanks: 0, gathererOrders: 0,
    };
    const observePeaks = (w: World): void => {
      for (const key of Object.keys(peak) as Array<keyof typeof peak>) {
        const n = (w[key] as ReadonlyMap<unknown, unknown>).size;
        if (n > peak[key]) peak[key] = n;
      }
    };

    for (let f = 0; f < 300; f++) {
      const inputs = scriptInputs(refWorld, f);
      const a = ref.frame(inputs);
      const b = batch.frame(inputs);
      observePeaks(refWorld);
      if (a.json !== b.json || a.hash !== b.hash) {
        throw new Error(
          `BOTS DIVERGED at frame ${f}: hashRef=${a.hash} hashBatch=${b.hash} ` +
            `(json equal: ${a.json === b.json})`,
        );
      }
      // S133 P1 — WIDE entity-family comparison (see the solo loop above). This is the
      // scenario where it matters most: HARD/IMBA bots sever, clean and spawn creatures,
      // so chewers with live `chewProgress` and damaged `hp` actually exist here.
      const wideRef = hashWorldStateFull(refWorld);
      const wideBatch = hashWorldStateFull(batch.world);
      if (wideRef !== wideBatch) {
        throw new Error(
          `BOTS WIDE (entity-family) divergence at frame ${f}: ref=${wideRef} batch=${wideBatch}`,
        );
      }
    }
    // The run must have actually exercised the bots: at least one BOT-authored primitive
    // (placedBy !== human seat 0) — otherwise this scenario silently tests nothing.
    let botPlaced = 0;
    for (const p of refWorld.primitives.values()) {
      if ((p.placedBy as number) !== 0) botPlaced++;
    }
    expect(botPlaced).toBeGreaterThan(0);
    expect(refWorld.tick).toBeGreaterThan(500);

    // S133 P1 — the WIDE per-frame compare above is only MEANINGFUL if entities in the
    // newly-hashed families actually exist in this run. Asserted rather than assumed: a
    // run with an empty entity world would make the new guard decorative while looking
    // green, which is the failure mode this whole priority exists to remove.
    //
    // ⛔ S143 P3 — THAT ASSERTION WAS A SUM, AND A SUM CANNOT SEE A PER-FAMILY HOLE.
    // It added ten family sizes and compared `> 0`, so ONE poop satisfied it for all ten. Measured
    // on this exact scenario: `defenders` was 0 for all 300 frames while the guard sat green on
    // the strength of poops and fouledPrimitives. The families it was written to protect were
    // precisely the ones it could not check.
    //
    // A family is now either SEEDED (its size is asserted individually) or ACKNOWLEDGED with a
    // written reason — the `FIELD_COVERAGE` contract, one layer down. An UNDOCUMENTED hole is
    // what this replaces; an acknowledged one is a decision on the record.
    // ⚠ PEAK OVER THE RUN, NOT THE FINAL FRAME. The first cut of this table read sizes at frame
    // 300 and immediately failed on `rainbows` — correctly, in the sense that the number was 0,
    // but for the wrong reason: a rainbow SPAWNS AND DESPAWNS mid-run, so it was compared on the
    // frames it existed and was simply gone by the end. The question this guard asks is "was this
    // family ever non-empty on a COMPARED frame", so the peak is the honest observable and a
    // final-frame read would have quietly under-reported every transient family in the game.
    const SEEDING_COVERAGE: ReadonlyArray<
      readonly [name: string, size: number, acknowledged: string | null]
    > = [
      ['creatures', peak.creatures, null],
      ['creatureSpawners', peak.creatureSpawners, null],
      ['bombs', peak.bombs, null],
      ['potatoes', peak.potatoes, null],
      ['rainbows', peak.rainbows, null],
      ['seagulls', peak.seagulls, null],
      ['poops', peak.poops, null],
      ['fouledPrimitives', peak.fouledPrimitives, null],
      ['gatherers', peak.gatherers, null],
      ['castleBanks', peak.castleBanks, null],
      // S143 P3 — seeded for the first time this priority, via ENQUEUE/CANCEL in scriptInputs.
      ['gathererOrders', peak.gathererOrders, null],
      [
        'hunters',
        peak.hunters,
        // The hunter is score-triggered and does not arise inside 300 scripted frames. It has a
        // DEDICATED differential test in this same file (applySpawnHunter + HUNTER_HUNT_TICKS),
        // which is stronger coverage than an incidental spawn would be.
        'covered by the dedicated hunter round-trip test in this file, not by the 300-frame run',
      ],
      [
        'defenders',
        peak.defenders,
        // ⚠ A REAL, OPEN HOLE — acknowledged so it is visible, NOT because it is acceptable.
        // Seeding a defender is not a one-line intent: hostTick re-validates every defender each
        // tick against anchor existence AND `defenderRecipeStillSatisfied`, dispatching
        // REMOVE_DEFENDER on failure, so an injected REGISTER_DEFENDER is torn down within a
        // tick. It needs real recipe geometry built by the scripted placements (the stinkTower —
        // 3 Circles bonded to 1 Square — is the cheapest). Logged as a carry-forward.
        'needs real recipe geometry; an injected defender is torn down within one tick — CARRY-FORWARD',
      ],
    ];

    for (const [name, size, acknowledged] of SEEDING_COVERAGE) {
      if (acknowledged !== null) {
        // Acknowledged families are still REPORTED, so a hole cannot go quiet. If one starts
        // arising naturally, delete its row rather than leaving a stale excuse in place.
        if (size === 0) console.log(`[differential] family '${name}' NOT seeded — ${acknowledged}`);
        continue;
      }
      expect(
        size,
        `family '${name}' is asserted SEEDED but is EMPTY in this run — the wide per-frame ` +
        `compare proves nothing about it. Either seed it in scriptInputs or move it to an ` +
        `acknowledged row WITH a reason.`,
      ).toBeGreaterThan(0);
    }
  });

  it('S143 P3 — structuralSignature SEES the gatherer order queue (both terms)', () => {
    // ⛔ WHY THIS EXISTS: the two terms were added to `structuralSignature` in S143 P3 and a
    // mutation test proved them DECORATIVE — deleting both left the whole differential suite
    // green. That is the exact hazard `structuralSignature`'s own docblock names: it is one of
    // the two UNFORCED serialization sites, where nothing makes tsc fail if a family is omitted.
    // An unforced site needs an explicit forcing test or it is a comment, not a guarantee.
    //
    // The signature decides when the worker attaches a SNAPSHOT to a batch. A queue change the
    // signature cannot see means the mirror is not told the queue moved until the 100 ms floor
    // batch happens to fire — and `gathererOrders` is an authoritative input to
    // `pickGathererTarget`, so in that window the two sims send gatherers to different sparks.
    const w = buildBotsWorld();
    const before = structuralSignature(w);

    // (1) FIRST enqueue: map 0 → 1 entries. Caught by `gathererOrders.size` alone.
    dispatch(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Square });
    const afterFirst = structuralSignature(w);
    expect(afterFirst, 'structuralSignature is blind to a seat opening a queue').not.toBe(before);

    // (2) SECOND enqueue: the map size does NOT change — only the queue's DEPTH does. This is the
    // case `.size` is structurally incapable of seeing, and the only reason `queuedOrderTotal`
    // exists. Deleting that term alone must fail here.
    dispatch(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Circle });
    expect(w.gathererOrders.size, 'precondition: the map size must be UNCHANGED here').toBe(1);
    expect(
      structuralSignature(w),
      'structuralSignature is blind to queue DEPTH — a pop/push is invisible to a size-only term',
    ).not.toBe(afterFirst);
  });

  it('S123 P1 — INIT bot-config round-trip: factory receives the exact difficulties + seed', () => {
    const world = buildBotsWorld();
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
    const saveJson = JSON.stringify(snapshot(world, { spawnerState: spawner.getState() }));
    const calls: Array<{ difficulties: readonly BotDifficulty[]; seed: number }> = [];
    const factory = (difficulties: readonly BotDifficulty[], matchSeed: number): BotManager => {
      calls.push({ difficulties, seed: matchSeed });
      return new BotManager(difficulties, matchSeed);
    };

    // Explicit botMatchSeed wins.
    const sim = makeWorkerSim(
      { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, botDifficulties: BOT_DIFFS, botMatchSeed: 777 },
      factory,
    );
    expect(sim.botManager).not.toBeNull();
    expect(sim.botManager!.debugStates().map((s) => s.difficulty)).toEqual([...BOT_DIFFS]);
    expect(sim.botManager!.debugStates().map((s) => s.seat)).toEqual([1, 2]);
    expect(calls).toEqual([{ difficulties: BOT_DIFFS, seed: 777 }]);

    // Omitted botMatchSeed falls back to the RESTORED world.rngSeed (== matchSeed for a
    // normal bots match — reseedForNewMatch sets both from one draw).
    calls.length = 0;
    makeWorkerSim(
      { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, botDifficulties: BOT_DIFFS },
      factory,
    );
    expect(calls).toEqual([{ difficulties: BOT_DIFFS, seed: SEED }]);

    // No difficulties / empty difficulties / no factory ⇒ no bots.
    calls.length = 0;
    const noBots = makeWorkerSim({ type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0 }, factory);
    expect(noBots.botManager).toBeNull();
    const emptyBots = makeWorkerSim(
      { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, botDifficulties: [] },
      factory,
    );
    expect(emptyBots.botManager).toBeNull();
    expect(calls).toEqual([]);
    const noFactory = makeWorkerSim(
      { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, botDifficulties: BOT_DIFFS },
    );
    expect(noFactory.botManager).toBeNull();
  });

  it('positions payload round-trips onto a mirror', () => {
    const refWorld = buildSoloWorld();
    const ref = buildReferenceRig(refWorld);
    for (let f = 0; f < 60; f++) ref.frame(scriptInputs(refWorld, f));

    const mirror = buildSoloWorld();
    // Give the mirror the entity SET via the real wire path, then zero the positions.
    const wire = netSnapshot(refWorld);
    applyNetSnapshot(JSON.parse(JSON.stringify(wire)) as ReturnType<typeof netSnapshot>, mirror);
    for (const p of mirror.primitives.values()) { p.pos.x = -1; p.pos.y = -1; }
    for (const s of mirror.freeSparks.values()) { s.pos.x = -1; s.pos.y = -1; }

    applyPositions(mirror, buildPositions(refWorld));
    expect(mirror.tick).toBe(refWorld.tick);
    for (const [id, prim] of refWorld.primitives) {
      const m = mirror.primitives.get(id)!;
      expect(m.pos.x).toBe(prim.pos.x);
      expect(m.pos.y).toBe(prim.pos.y);
    }
    for (const [id, s] of refWorld.freeSparks) {
      const m = mirror.freeSparks.get(id)!;
      expect(m.pos.x).toBe(s.pos.x);
      expect(m.pos.y).toBe(s.pos.y);
    }
  });

  it('structural rule: quiet batches skip the snapshot until the 100ms floor', () => {
    const refWorld = buildSoloWorld();
    const refSpawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
    const sim = makeWorkerSim({
      type: 'INIT',
      saveJson: JSON.stringify(snapshot(refWorld, { spawnerState: refSpawner.getState() })),
      hostSeats: [],
      localPlayerId: 0,
    });
    const quiet = (nowMs: number, ticks = 0): ReturnType<typeof applyTickBatch> =>
      applyTickBatch(sim, {
        type: 'TICK_BATCH',
        batchSeq: nowMs,
        ticks,
        control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
        alivePeerIds: null,
        intents: [],
        nowMs,
      });
    // First batch: signature differs from the initial '' ⇒ snapshot rides (baseline).
    expect(quiet(0).snapshot).toBeDefined();
    // Zero-tick, zero-activity batches inside the floor: positions only.
    expect(quiet(16).snapshot).toBeUndefined();
    expect(quiet(32).snapshot).toBeUndefined();
    // Past the 100 ms floor: a fresh snapshot rides even with no activity.
    expect(quiet(150).snapshot).toBeDefined();
    // An intent forces a snapshot regardless of the floor.
    const withIntent = applyTickBatch(sim, {
      type: 'TICK_BATCH',
      batchSeq: 999,
      ticks: 0,
      control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
      alivePeerIds: null,
      intents: [{ type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 10, y: 10 } }],
      nowMs: 151,
    });
    expect(withIntent.snapshot).toBeDefined();
    // NARROW by contract — `withIntent.hash` is produced by production applyTickBatch.
    expect(withIntent.hash).toBe(hashWorldState(sim.world));
    // Signature sanity: the fingerprint reacts to a structural change.
    const sigBefore = structuralSignature(sim.world);
    dispatch(sim.world, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 20, y: 20 } });
    expect(structuralSignature(sim.world)).toBe(sigBefore); // avatar move is NOT structural
  });
});

describe('S135 P0 — hunter lifetime survives the real makeWorkerSim INIT (regression)', () => {
  it('a seeded SEEKING hunter round-trips through the ?worker=1 INIT seam with a byte-exact full-world hash', () => {
    // The empty-world INIT compares above (lines ~236/280) are structurally blind to the
    // hunter serializer because buildSoloWorld/buildBotsWorld spawn no hunter. Seed one and
    // drive the EXACT production main.ts INIT seam (snapshot -> makeWorkerSim INIT).
    const w = buildSoloWorld();
    w.scoreByPlayer.set(P0, 10); // guarantee a leader so applySpawnHunter mints a hunter
    w.tick = 500;
    applySpawnHunter(w, { type: 'SPAWN_HUNTER' });
    w.tick = 700;
    expect(w.hunters.size).toBe(1);
    expect([...w.hunters.values()][0].despawnAtTick).toBe(500 + HUNTER_HUNT_TICKS); // 2300, not 0

    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
    const saveJson = JSON.stringify(snapshot(w, { spawnerState: spawner.getState() }));
    const sim = makeWorkerSim({ type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0 });

    // Pre-fix the hunter rehydrated despawnAtTick 0 + spawnedAtTick 0, so this full-world
    // hash diverged (RED); post-fix every hunter field travels and INIT adoption is bit-exact.
    expect(hashWorldStateFull(sim.world)).toBe(hashWorldStateFull(w));
    const after = [...sim.world.hunters.values()][0];
    expect(after.despawnAtTick).toBe(500 + HUNTER_HUNT_TICKS);
    expect(after.spawnedAtTick).toBe(500);
  });
});
