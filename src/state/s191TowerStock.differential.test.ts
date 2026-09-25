/**
 * SPARK — S191 (owner item 2) — TOWER STOCK is BYTE-IDENTICAL between the direct host path and the
 * `?worker=1` mirror, over TWO waves: BUILD → FIGHT → BUILD → FIGHT → BUILD, with a pentagram's chewers
 * and a lightning hub's drones carried home across both whistles and released at both bells.
 *
 * Persistence is a rule both sims (and a successor after a host migration) compute — the chewer and
 * the drone no longer age out — so a host and its mirror disagreeing about it would part ways on the
 * first FIGHT tick after a BUILD. The shape is `racialB.differential.test.ts`'s: a REFERENCE rig driving
 * `runHostTick` directly against a BATCH rig adopted through the real worker INIT and driven through
 * `applyTickBatch`; every frame compares the wire snapshot, the narrow hash and the wide oracle.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, runSpawnerIgnition, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { netSnapshot, snapshot } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { BotManager } from '../bots/botManager.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import './godlyRecipes/pentagram.ts';
import './godlyRecipes/lightningHub.ts';

const P0 = asPlayerId(0);
const RATE = 3;
const SEED = 0x5191d;

function stamp(w: World, seat: PlayerId, id: GodlyId): void {
  const bank = w.castleBanks.get(seat) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(seat, bank);
  const home = castleAnchor(seat as unknown as number, w.layout);
  for (let r = 200; r <= 420; r += 20) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const at = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (stampRefusalAt(w, at, seat, id) === null) {
        applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: id, centre: at } as never);
        return;
      }
    }
  }
  throw new Error(`fixture: no legal site for ${id}`);
}

function buildWorld(): World {
  const w = makeWorld(SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]!, raceId: 'demons' }, { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' }],
  } as never);
  w.draft = null;
  w.creatures.clear();
  stamp(w, P0, 'pentagram');
  stamp(w, P0, 'lightningHub');
  runSpawnerIgnition(w);
  /*
   * ⚠ The fixture's funding left seat 0 an ALL-ZERO castle bank. `serializeCastleBanks` omits an empty
   * bank while `stateHashFull` hashes it (`cb0:0.0.0.0.0.0`), so the worker adopted from this world's
   * save would hash differently on frame 0 for a reason unrelated to this test — a pre-existing
   * asymmetry, REPORTED (S191), not fixed here. Dropped, as a world that never funded a bank has none.
   */
  if ((w.castleBanks.get(P0) ?? []).every((n) => n === 0)) w.castleBanks.delete(P0);
  w.phaseEndsAtTick = w.tick + 20; // the first BUILD → FIGHT edge falls inside the window
  return w;
}

interface Rig { world: World; frame: (b: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>) => { json: string; hash: number } }

const newSpawner = () =>
  new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: RATE }, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));

function referenceRig(world: World): Rig {
  const spawner = newSpawner();
  const controls = new WorkerControls(world, P0);
  const gameStateExtras = makeGameStateExtras();
  const state = makeHostTickState(world);
  const cursor = { lastMatcherTick: -1 };
  const cinematics = makeWorkerCinematicState();
  return {
    world,
    frame: (b) => {
      controls.setFrame(b.control);
      const deps: HostTickDeps = { spawner, controls, botManager: null, gameStateExtras, alivePeerIds: null, hostSeats: new Map() };
      for (let i = 0; i < b.ticks; i++) runHostTick(world, deps, state);
      if (world.gameState === 'PLAYING') runGodlyMatcherCore(world, cursor);
      tickWorkerCinematics(world, cinematics);
      const json = JSON.stringify(netSnapshot(world));
      const hash = hashWorldState(world);
      world.effects.length = 0;
      return { json, hash };
    },
  };
}

function batchRig(source: World): Rig {
  const saveJson = JSON.stringify(snapshot(source, { spawnerState: newSpawner().getState() }));
  const sim = makeWorkerSim(
    { type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, ratePerSecond: RATE },
    (d, s) => new BotManager(d, s),
  );
  let seq = 0;
  return {
    world: sim.world,
    frame: (b) => {
      const r = applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...b }, { forceSnapshot: true });
      return { json: JSON.stringify(r.snapshot), hash: r.hash! };
    },
  };
}

describe('S191 item 2 — host vs ?worker=1 over TWO waves, tower stock carried across both BUILDs', () => {
  it('is byte-identical every frame, and stock genuinely crossed both BUILDs', () => {
    const refWorld = buildWorld();
    const ref = referenceRig(refWorld);
    const batch = batchRig(refWorld);
    expect(hashWorldStateFull(batch.world), 'INIT adoption must be bit-exact').toBe(hashWorldStateFull(refWorld));

    const phases: string[] = [refWorld.matchPhase];
    let phaseStart = refWorld.tick;
    /** Per FIGHT start: the tower units alive on the bell (the stock that crossed the BUILD). */
    const stockAtBell: number[] = [];
    let frames = 0;
    for (let f = 0; f < 6000 && phases.length < 6; f++) {
      // Short phases, forced identically on both (the worlds are byte-identical here — the loop throws
      // otherwise — so the injection cannot desync them): a FIGHT long enough to emit, a short BUILD.
      const len = refWorld.tick - phaseStart;
      const cut = refWorld.matchPhase === 'FIGHT' ? 1400 : 400;
      if (len >= cut && refWorld.phaseEndsAtTick - refWorld.tick > 5) {
        refWorld.phaseEndsAtTick = refWorld.tick + 3;
        batch.world.phaseEndsAtTick = batch.world.tick + 3;
      }
      const input = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 960, y: 540 } },
        alivePeerIds: null,
        intents: [],
        nowMs: f * 16,
      };
      const a = ref.frame(input);
      const b = batch.frame(input);
      if (a.json !== b.json || a.hash !== b.hash) {
        throw new Error(`DIVERGED at frame ${f} (tick ${refWorld.tick}): json equal ${a.json === b.json}`);
      }
      if (hashWorldStateFull(refWorld) !== hashWorldStateFull(batch.world)) {
        throw new Error(`WIDE divergence at frame ${f} (tick ${refWorld.tick})`);
      }
      frames++;
      if (phases.at(-1) !== refWorld.matchPhase) {
        phases.push(refWorld.matchPhase);
        phaseStart = refWorld.tick;
        if (refWorld.matchPhase === 'FIGHT') {
          stockAtBell.push([...refWorld.creatures.values()].filter((c) => c.type === 'chewer' || c.type === 'lightningDrone').length);
        }
      }
    }

    expect(frames).toBeGreaterThan(100);
    expect(phases.slice(0, 5), 'two whole waves inside the compared window').toEqual(['BUILD', 'FIGHT', 'BUILD', 'FIGHT', 'BUILD']);
    // ⛔ ANTI-VACUITY — the first bell has no stock yet; the SECOND bell must carry what crossed the BUILD.
    expect(stockAtBell.length).toBeGreaterThanOrEqual(2);
    expect(stockAtBell[1], 'tower units alive on the second bell (they crossed a whole BUILD)').toBeGreaterThan(0);
  });
});
