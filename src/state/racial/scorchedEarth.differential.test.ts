/**
 * SPARK — S191 (owner item 1b) — SCORCHED EARTH is BYTE-IDENTICAL between the direct host path and the
 * `?worker=1` mirror, over BUILD → FIGHT (the cast lands as a real INTENT mid-fight) → BUILD.
 *
 * The cast is a new client intent and a new Player field, and the burn severs connectors through the
 * one sever path — three places a host and its mirror could part ways. The shape is
 * `racialB.differential.test.ts`'s: a REFERENCE rig driving `runHostTick` directly against a BATCH rig
 * adopted through the real worker INIT (JSON save → `makeWorkerSim`) and driven by `applyTickBatch`,
 * which applies the SAME intent at the same frame. Every frame compares the wire snapshot, the narrow
 * production hash and the wide test-only oracle (the only one that sees `Player.scorchedEarth`).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import { PRIMITIVE_MAX_HP, SparkType } from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { CreatureType } from '../creatures/creature.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from '../godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { mulberry32 } from '../rng.ts';
import { netSnapshot, snapshot } from '../save.ts';
import { hashWorldState } from '../stateHash.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from '../workerSim.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../world.ts';
import { BotManager } from '../../bots/botManager.ts';

const DEMON = asPlayerId(0);
const P1 = asPlayerId(1);
const RATE = 3;
const SEED = 0x5191e;

function spawn(w: World, owner: PlayerId, type: CreatureType, x: number, y: number, spawner: number): void {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(spawner),
  });
}

function addPrim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

/** Seat 0 = demons holding SCORCHED GROUND; seat 1 has a small army, a one-connector hut and a lone shape. */
function buildWorld(): { w: World; hut: BondId } {
  const w = makeWorld(SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: 0xaa2222, raceId: 'demons' },
      { seat: 1, color: 0x55aa55, raceId: 'zombies' },
    ],
  });
  w.players.get(DEMON)!.draftPicks = ['racial'];
  w.draft = null;
  w.creatures.clear();
  for (let i = 0; i < 5; i++) spawn(w, P1, 'raceUnit', 1400 + i * 9, 250 + i * 11, -1);
  spawn(w, P1, 't3Hound', 1450, 420, 700);
  // A one-connector hut (pool 6, 1000 ticks a fifth at the half rate) — it must BANK inside the window.
  const a = addPrim(w, P1, 1500, 800);
  const b = addPrim(w, P1, 1540, 800);
  const hut = w.nextBondId++ as unknown as BondId;
  w.bonds.set(hut, { id: hut, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
  a.bonds.add(hut);
  b.bonds.add(hut);
  addPrim(w, P1, 1650, 300); // a lone shape
  w.phaseEndsAtTick = w.tick + 20; // the BUILD → FIGHT edge falls inside the compared window
  return { w, hut };
}

interface Rig {
  world: World;
  frame: (b: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>) => { json: string; hash: number };
}

const newSpawner = () =>
  new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: RATE }, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));

function referenceRig(world: World): Rig {
  const spawner = newSpawner();
  const controls = new WorkerControls(world, DEMON);
  const gameStateExtras = makeGameStateExtras();
  const state = makeHostTickState(world);
  const cursor = { lastMatcherTick: -1 };
  const cinematics = makeWorkerCinematicState();
  return {
    world,
    frame: (b) => {
      // applyTickBatch's order: intents first, then the tick drain.
      for (const a of b.intents) dispatch(world, a);
      controls.setFrame(b.control);
      const deps: HostTickDeps = {
        spawner, controls, botManager: null, gameStateExtras, alivePeerIds: null, hostSeats: new Map(),
      };
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

describe('S191 SCORCHED EARTH — host vs ?worker=1 over BUILD → FIGHT (cast as an intent) → BUILD', () => {
  it('is byte-identical every frame, and the scorch genuinely burned and genuinely ended inside the window', () => {
    const { w: refWorld, hut } = buildWorld();
    const ref = referenceRig(refWorld);
    const batch = batchRig(refWorld);
    expect(hashWorldStateFull(batch.world), 'INIT adoption must be bit-exact').toBe(hashWorldStateFull(refWorld));

    const phases: string[] = [refWorld.matchPhase];
    let fightStart = -1;
    let cast = false;
    let edgeForced = false;
    let maxHutBank = 0;
    let sawRecord = false;
    let frames = 0;

    for (let f = 0; f < 1600; f++) {
      if (refWorld.matchPhase === 'FIGHT' && fightStart < 0) fightStart = refWorld.tick;
      const intents: GameAction[] = [];
      if (!cast && fightStart >= 0 && refWorld.tick >= fightStart + 30) {
        intents.push({ type: 'CAST_SCORCHED_EARTH', playerId: DEMON, zoneSeat: P1 });
        cast = true;
      }
      // End the FIGHT 1500 ticks in, identically on both (the worlds are byte-identical here).
      if (!edgeForced && fightStart >= 0 && refWorld.tick >= fightStart + 1500) {
        refWorld.phaseEndsAtTick = refWorld.tick + 5;
        batch.world.phaseEndsAtTick = batch.world.tick + 5;
        edgeForced = true;
      }
      const input = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 960, y: 540 } },
        alivePeerIds: null,
        intents,
        nowMs: f * 16,
      };
      const a = ref.frame(input);
      const b = batch.frame(input);
      if (a.json !== b.json || a.hash !== b.hash) {
        throw new Error(`DIVERGED at frame ${f} (tick ${refWorld.tick}): json equal ${a.json === b.json}`);
      }
      const wa = hashWorldStateFull(refWorld);
      const wb = hashWorldStateFull(batch.world);
      if (wa !== wb) throw new Error(`WIDE divergence at frame ${f} (tick ${refWorld.tick})`);
      frames++;
      if (refWorld.players.get(DEMON)!.scorchedEarth !== null) sawRecord = true;
      maxHutBank = Math.max(maxHutBank, refWorld.bonds.get(hut)?.damageFifths ?? 0);
      if (phases.at(-1) !== refWorld.matchPhase) phases.push(refWorld.matchPhase);
      if (edgeForced && refWorld.matchPhase === 'BUILD' && phases.length >= 3) {
        if (refWorld.tick > refWorld.phaseEndsAtTick - 5300) break;
      }
    }

    expect(frames).toBeGreaterThan(100);
    expect(phases.slice(0, 3), 'a full BUILD → FIGHT → BUILD cycle inside the compared window').toEqual(['BUILD', 'FIGHT', 'BUILD']);
    // ⛔ ANTI-VACUITY — a green differential over a window in which nothing was scorched proves nothing.
    expect(sawRecord, 'the cast was ACCEPTED by both sims (a refused intent would compare two idle boards)').toBe(true);
    expect(maxHutBank, 'the hut really banked scorch damage inside the window').toBeGreaterThan(0);
    expect(refWorld.players.get(DEMON)!.scorchedEarth, 'and the record was cleared at the BUILD edge').toBeNull();
    expect(batch.world.players.get(DEMON)!.scorchedEarth).toBeNull();
  });
});
