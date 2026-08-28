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
import { bankAdd } from './castleBank.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSparkId, type BondId } from '../types.ts';
import { applySpawnHunter } from './hunters/hunterLifecycle.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
// S143 P3 — SparkType feeds the gatherer order queue seeded below; see scriptInputs.
import {
  HUNTER_HUNT_TICKS,
  PRIMITIVE_MAX_HP,
  SPARK_VISUAL_SIZE,
  STINK_TOWER_HUB_DEGREE,
  SparkType,
} from '../constants.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from './godlyRecipes/stinkTower.ts';

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
  // ⭐ S147 P1 — FORCE A MATCH-PHASE EDGE INSIDE THE COMPARED WINDOW.
  //
  // This is where host-vs-worker phase parity is actually proven. The default deadline is 5400 ticks,
  // which is beyond this rig's ~500+ tick window, so without shortening it the run would never cross
  // an edge and the clock would ride along completely unverified across the worker boundary — passing
  // for the wrong reason. Shortening it here (BEFORE the batch rig adopts this world via its JSON
  // save) puts the flip squarely inside the compared frames, so the existing per-frame netSnapshot +
  // WIDE hash equality does all the work: if the worker flipped on a different tick, or inherited a
  // different deadline, or missed the field in the save round-trip, the run diverges and throws.
  //
  // The edge is also what proves the SCORING GATE crosses the boundary identically, since income
  // starts exactly at the BUILD→FIGHT flip and `scoreProgress` is in the wide hash.
  world.phaseEndsAtTick = world.tick + 200;
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
  // S147 P1 — same forced phase edge as buildSoloWorld; see the comment there.
  world.phaseEndsAtTick = world.tick + 200;
  // ⛔ S148 P1 — SEED THE CASTLE BANK EXPLICITLY. IT USED TO ARRIVE BY ACCIDENT.
  //
  // `castleBanks` was never seeded on purpose: a gatherer simply happened to complete a haul inside
  // the 300-frame window, because the old polar ring put its round trip at ~590 px and 300 frames
  // covered it. The zone partition moves the haul to 800.7 px each way, so the deposit now lands
  // AFTER the compared window closes and the family went silently empty — at which point its
  // projection loop is dead code in the one gate that is supposed to prove it.
  //
  // This was caught by the harness's OWN anti-vacuity assertion (SEEDING_COVERAGE below), which is
  // exactly what that assertion exists for: the run stayed green on every hash while quietly
  // proving nothing about the bank. Seeding it here rather than lengthening the run keeps the
  // coverage independent of how far a gatherer happens to walk.
  //
  // Symmetric by construction: the batch rig adopts THIS world through its JSON save, and INIT
  // adoption is asserted bit-exact before any tick — the same argument the forced phase edge above
  // relies on.
  bankAdd(world.castleBanks, P0, SparkType.Square);
  bankAdd(world.castleBanks, P0, SparkType.Circle);
  // ⛔ S148 P2 — SEED BOT-AUTHORED PRIMITIVES EXPLICITLY, FOR THE SAME REASON AS THE BANK ABOVE.
  //
  // The scenario asserts `botPlaced > 0` so that the wide per-frame compare provably had bot-owned
  // entities to compare. That assertion used to be satisfied by ACCIDENT too: `seedBotSpawners` handed
  // every bot seat a free pentagram, and its five Triangles were the bot-authored primitives. That
  // seeding is deleted (R50 — it was an unfair opening, not a fixture), so the control now has to be
  // provided on purpose. Two shapes per bot seat is enough to keep the per-element projection loops
  // live without re-creating the gameplay unfairness.
  for (const seat of [...world.botSeats].sort((a, b) => (a as number) - (b as number))) {
    const player = world.players.get(seat);
    if (player === undefined) continue;
    for (let i = 0; i < 2; i++) {
      const id = asPrimitiveId(world.nextPrimitiveId++);
      const px = 300 + (seat as number) * 90 + i * 26;
      const py = 300 + (seat as number) * 40;
      world.primitives.set(id, {
        id,
        type: SparkType.Triangle,
        placerColor: player.color,
        placedBy: seat,
        createdTick: world.tick,
        pos: { x: px, y: py },
        prevPos: { x: px, y: py },
        bonds: new Set(),
        ownerColor: player.color,
        lastOwnershipChange: world.tick,
        hp: PRIMITIVE_MAX_HP,
        radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Triangle] * 0.45),
        origin: null,
      });
    }
    // ...and one CREATURE per bot seat, for the third instance of the same story. `creatures` was
    // seeded by the deleted starter grant (and by chewers the free pentagram emitted); with both gone
    // the family is empty and its projection loop — the widest per-element hash surface in the file —
    // stops being compared at all. Spawned through the real reducer so the entity is exactly what
    // production would mint, and a goblin specifically because that is what the goblin TOWER will
    // eventually produce (R18/R24), so this fixture matches where the design is going.
    applySpawnCreature(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: seat,
      pos: { x: 420 + (seat as number) * 70, y: 620 },
      targetPos: { x: 420 + (seat as number) * 70, y: 620 },
      sourceSpawnerId: null,
    });
  }
  seedStinkTower(world);
  return world;
}

/**
 * ⭐ S156 P3 — the stink tower's geometry, and the ONE spark that completes it live.
 *
 * `STINK_LEAF_RADIUS` is 45: inside `AUTO_BOND_RADIUS` (60) so each leaf bonds to the hub, but far
 * enough apart (45·√3 ≈ 78) that the leaves do NOT bond to each other. The recipe tolerates an
 * inter-leaf bond, but keeping them apart keeps the component's shape unambiguous.
 */
const STINK_CENTRE = { x: 760, y: 300 };
const STINK_LEAF_RADIUS = 45;
function stinkLeafPos(i: number): { x: number; y: number } {
  const angle = (i * 2 * Math.PI) / STINK_TOWER_HUB_DEGREE;
  return {
    x: STINK_CENTRE.x + Math.cos(angle) * STINK_LEAF_RADIUS,
    y: STINK_CENTRE.y + Math.sin(angle) * STINK_LEAF_RADIUS,
  };
}

/**
 * ⭐ S156 P3 — SEED A **DEFENDER**, BY BUILDING THE REAL RECIPE GEOMETRY.
 *
 * `defenders` is marked hashed and IS projected by `hashWorldStateFull`, but measured over all 300
 * frames its peak size was **0** — so the guard sat green having compared an empty map. That is the
 * same "the oracle is wired and looking at nothing" failure S143 P3 found for `gathererOrders`, and
 * the SEEDING_COVERAGE row below has carried it as an acknowledged hole ever since.
 *
 * ⛔ THE HOLE COULD NOT BE CLOSED BY INJECTING A DEFENDER, which is why it stayed open: `hostTick`
 * re-validates every defender each tick against anchor existence AND `recipeStillSatisfied`, so a
 * hand-inserted `REGISTER_DEFENDER` is torn down within a tick. The row's own note says what was
 * needed — *"real recipe geometry ... the stinkTower (3 Circles bonded to 1 Square) is the
 * cheapest"* — so that is exactly what this builds. The matcher then registers the defender the way
 * production does, and re-validation keeps it alive because the shape is genuinely there.
 *
 * Geometry (`stinkTower.ts`): ONE Square hub at bond-degree exactly `STINK_TOWER_HUB_DEGREE`, plus
 * that many Circle leaves, in a component of exactly `STINK_TOWER_SIZE`. Leaves are spread on a
 * circle so the component cannot pick up an extra member and fall out of the exact-size gate.
 *
 * Symmetric by construction, the same argument the bank and bot-primitive seeding above rely on: the
 * batch rig adopts THIS world through its JSON save, and INIT adoption is asserted bit-exact before
 * any tick — so the seeding cannot itself be the source of a difference.
 */
function seedStinkTower(world: World): void {
  const player = world.players.get(P0);
  if (player === undefined) return;

  const mk = (type: SparkType, x: number, y: number) => {
    const id = asPrimitiveId(world.nextPrimitiveId++);
    const prim = {
      id,
      type,
      placerColor: player.color,
      placedBy: P0,
      createdTick: world.tick,
      pos: { x, y },
      prevPos: { x, y },
      bonds: new Set<BondId>(),
      ownerColor: player.color,
      lastOwnershipChange: world.tick,
      hp: PRIMITIVE_MAX_HP,
      radius: Math.max(8, SPARK_VISUAL_SIZE[type] * 0.45),
      origin: null,
    };
    world.primitives.set(id, prim);
    return prim;
  };

  const hub = mk(STINK_HUB_TYPE, STINK_CENTRE.x, STINK_CENTRE.y);
  for (let i = 0; i < STINK_TOWER_HUB_DEGREE; i++) {
    const at = stinkLeafPos(i);
    const leaf = mk(STINK_LEAF_TYPE, at.x, at.y);
    const bondId = asBondId(world.nextBondId++);
    world.bonds.set(bondId, {
      id: bondId,
      aId: hub.id,
      bId: leaf.id,
      a: hub,
      b: leaf,
      restLength: STINK_LEAF_RADIUS,
      stiffnessTier: 'MID',
      createdTick: world.tick,
      damageFifths: 0,
    });
    hub.bonds.add(bondId);
    leaf.bonds.add(bondId);
  }

  /*
   * ⛔ AND NOW REGISTER IT, THROUGH THE REAL REDUCER — which the acknowledged row said could not be
   * done. It was right about the mechanism and wrong about the conclusion: re-validation tears down
   * an injected defender because it re-checks `recipeStillSatisfied` every tick, so an injection
   * WITHOUT geometry dies within a tick. With the star above genuinely on the board the predicate
   * passes, and the defender lives for the whole run.
   *
   * The matcher route was tried first and does not work here: `runDefenderIgnition` only scans on a
   * TOPOLOGY CHANGE (a `BOND_FORMED`, or a player-caused `BOND_SEVERED`), and neither a hand-built
   * component nor this rig's scripted placements produce one — measured, over all 300 frames. So the
   * registration is dispatched directly, exactly as the matcher would have dispatched it.
   */
  dispatch(world, {
    type: 'REGISTER_DEFENDER',
    defenderKind: 'stinkTower',
    ownerPlayerId: P0,
    anchorPrimitiveId: hub.id,
    recipeId: 'stinkTower',
    pos: { x: STINK_CENTRE.x, y: STINK_CENTRE.y },
  });
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

    // S147 P1 — latch for the once-only second phase-edge injection below.
    let secondEdgeForced = false;

    for (let f = 0; f < 300; f++) {
      const inputs = scriptInputs(refWorld, f);
      // Mid-run NONET freeze: force the trial identically on both worlds (same minted
      // seed — the worlds are byte-identical at this point) to exercise the freeze branch.
      if (f === 150 && refWorld.sudoku === null) {
        startSudoku(refWorld, P0, mintNonetSeed(refWorld));
        startSudoku(batch.world, P0, mintNonetSeed(batch.world));
      }
      // ⭐ S147 P1 — FORCE THE **SECOND** PHASE EDGE, so this run covers a full BUILD→FIGHT→BUILD
      // cycle host-vs-worker, which is the wording of the session's exit gate.
      //
      // The first edge comes from the short deadline stamped in buildSoloWorld. After it fires, the
      // flip advances the deadline by a full PHASE_DURATION_TICKS (5400) — far beyond this window — so
      // without a second nudge the run would only ever prove ONE direction of the cycle.
      //
      // ⚠ CONDITION-DRIVEN, NOT FRAME-NUMBERED, and that is deliberate: a fixed frame index is
      // fragile here. My first attempt used `f === 230` and silently never fired, because the NONET
      // freeze injected at f=150 halts the sim (the host tick is skipped entirely while
      // `world.sudoku !== null`), so the phase could not flip for the rest of the run. Keying off the
      // actual state instead — first FIGHT frame with no trial active — is robust to the freeze
      // window, to the frames-per-tick ratio, and to anyone re-ordering the injections above.
      // Applied identically to BOTH worlds, exactly like the NONET freeze; they are byte-identical
      // here (the loop throws otherwise), so the injection itself cannot desync them.
      if (!secondEdgeForced && refWorld.matchPhase === 'FIGHT' && refWorld.sudoku === null) {
        refWorld.phaseEndsAtTick = refWorld.tick + 5;
        batch.world.phaseEndsAtTick = batch.world.tick + 5;
        secondEdgeForced = true;
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
    // S147 P1 — and the forced match-phase edge must genuinely have been crossed, on BOTH sides. Without
    // this the phase-parity coverage above could silently become vacuous the day someone lengthens the
    // deadline or shortens the rig, and the failure mode would be invisible: a green test proving nothing.
    // Both forced edges must have fired, giving a full BUILD→FIGHT→BUILD cycle inside the compared
    // window. Landing back in BUILD is the proof that the SECOND edge fired too — if only the first
    // had, this would read FIGHT.
    expect(refWorld.matchPhase, 'a full BUILD→FIGHT→BUILD cycle must have completed on the ref side').toBe('BUILD');
    expect(batch.world.matchPhase, 'and identically on the worker side').toBe('BUILD');
    expect(batch.world.phaseEndsAtTick).toBe(refWorld.phaseEndsAtTick);
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
      [
        'creatureSpawners',
        peak.creatureSpawners,
        // ⚠ S148 P2 — A REAL, OPEN HOLE, ACKNOWLEDGED RATHER THAN PAPERED OVER.
        //
        // This row was satisfied by the free bots-only PENTAGRAM that `seedBotSpawners` handed every
        // bot seat, which registered a real spawner over its Triangle ring. That seeding is deleted
        // (R50) because it was an unfair opening, and the family went empty with it.
        //
        // It cannot be fixed by injecting a spawner: the host re-validation poll re-checks each one
        // against `isPentagramComponent` from its anchor and dispatches removal when the geometry does
        // not hold, so an injected spawner is torn down within a tick — exactly what the `defenders`
        // row below already documents. Doing it properly needs five bonded Triangles built as a test
        // fixture, which is the same ~80 lines of geometry just deleted from production and would
        // drift from it.
        //
        // The right home for this is the GOBLIN TOWER (R18/R24, S153): it is a spawner with real
        // recipe geometry, and once it exists this row seeds itself from the design rather than from
        // scaffolding. Logged as CF-S148-b rather than left as a silent zero.
        'seeded only by the deleted bots-only pentagram (R50); needs real recipe geometry — the goblin tower (S153) is its proper source — CARRY-FORWARD CF-S148-b',
      ],
      // ⭐ S147 P1 Step 0 (R14/R23) — THESE SIX ROWS WENT FROM NATURALLY-SEEDED TO UNREACHABLE, and
      // that is a deliberate design change, not a regression. `HAZARD_SPAWN_ENABLED = false` gates the
      // four hazard DISPATCH sites in physicsLoop, so the spawner still draws its countdowns (the RNG
      // streams are byte-identical by design) but nothing is ever dispatched. `poops` and
      // `fouledPrimitives` fall with them because both are downstream of the seagull.
      //
      // They are ACKNOWLEDGED rather than back-door seeded, on purpose: seeding them here would mean
      // exercising a path production can no longer reach, which is worse than an honest, reported gap.
      // The loop below still console.logs each one every run, so the hole cannot go quiet.
      //
      // ⚠ WHEN HAZARDS COME BACK (flip HAZARD_SPAWN_ENABLED), DELETE THESE SIX REASONS rather than
      // leaving stale excuses — exactly as this block's own instruction above says. They will start
      // arising naturally again the moment the flag flips, because nothing else about the cadence
      // changed. Logged as carry-forward CF-S147-c.
      ['bombs', peak.bombs, 'unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0, R14/R23) — restore this row with the hazards'],
      ['potatoes', peak.potatoes, 'unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0, R14/R23) — restore this row with the hazards'],
      ['rainbows', peak.rainbows, 'unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0, R14/R23) — restore this row with the hazards'],
      ['seagulls', peak.seagulls, 'unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0, R14/R23) — restore this row with the hazards'],
      ['poops', peak.poops, 'downstream of the seagull, so unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0)'],
      ['fouledPrimitives', peak.fouledPrimitives, 'downstream of seagull poop, so unreachable while HAZARD_SPAWN_ENABLED=false (S147 Step 0)'],
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
      // ⭐ S156 P3 — CLOSED. This row was an acknowledged hole from S143 to S156: `defenders` is
      // hashed and projected, but its peak was 0 across all 300 frames, so the guard sat green
      // having compared an empty map. `seedStinkTower` now builds the real recipe geometry and
      // registers the defender, and the row is ASSERTED like any other.
      //
      // ⛔ CLOSING IT IMMEDIATELY CAUGHT A REAL DESYNC, which is the entire argument for why an
      // acknowledged hole is a liability rather than a note: `loadRephaseDefenders` collapsed a
      // freshly-registered defender's `tick + interval` to `tick` on load, so the host and the
      // sim-worker disagreed about the first shot of every new tower. See the fix in
      // `defenderLifecycle.ts`. The guard failed the moment it was given something to compare.
      ['defenders', peak.defenders, null],
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
