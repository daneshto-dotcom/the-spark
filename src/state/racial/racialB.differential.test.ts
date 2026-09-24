/**
 * SPARK — S188 — Council A5 for `s188/racial-b`: THE RISEN, HELLSPAWN and ENDLESS DYNASTY are
 * BYTE-IDENTICAL between the direct host path and the `?worker=1` mirror, over a full
 * BUILD → FIGHT → BUILD cycle with all three spawning.
 *
 * All three make creatures BECAUSE of an event inside the strike batch — a kill, a death, a castle
 * hit — and `SPARK_RACES_SPEC.md` §9.6 names the trap: a spawn hooked into the wrong side of the
 * `pendingCreatureDeaths` sweep is exactly how host and worker diverge. This is the gate it asks for.
 *
 * The shape is `workerSim.differential.test.ts`'s: a REFERENCE rig that runs `runHostTick` directly,
 * against a BATCH rig adopted through the real worker INIT (JSON save → `makeWorkerSim`) and driven
 * through `applyTickBatch`. Every frame compares the wire snapshot, the narrow production hash AND
 * the wide test-only oracle — the last one being the only channel that sees `hellspawnGen`,
 * `dynastyHpLost`, `maxEhp` and a creature's pool.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { CreatureType } from '../creatures/creature.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from '../godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { castleEmitsOnTick, castleSpawnerId } from '../raceUnitEmit.ts';
import { mulberry32 } from '../rng.ts';
import { netSnapshot, snapshot } from '../save.ts';
import { hashWorldState } from '../stateHash.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from '../workerSim.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { BotManager } from '../../bots/botManager.ts';

const ZOMBIE = asPlayerId(0);
const DEMON = asPlayerId(1);
const MUMMY = asPlayerId(2);
const VAMP = asPlayerId(3);
const RATE = 3;
const SEED = 0x5188b;

function spawn(w: World, owner: PlayerId, type: CreatureType, x: number, y: number, spawner: number): void {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(spawner),
  });
}

/** Four seats, three of them holding this branch's perks, and a fight already set up for each. */
function buildWorld(): World {
  const w = makeWorld(SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: 0x55aa55, raceId: 'zombies' },
      { seat: 1, color: 0xaa2222, raceId: 'demons' },
      { seat: 2, color: 0xddcc44, raceId: 'mummies' },
      { seat: 3, color: 0x992266, raceId: 'vampires' },
    ],
  });
  w.players.get(ZOMBIE)!.draftPicks = ['racial']; // zombies.l0 — THE RISEN
  w.players.get(DEMON)!.draftPicks = ['hp', 'racial']; // demons.l5 — HELLSPAWN
  w.players.get(MUMMY)!.draftPicks = ['hp', 'racial']; // mummies.l5 — ENDLESS DYNASTY
  w.draft = null;
  w.creatures.clear();

  // THE RISEN × HELLSPAWN: a zombie squad and a demon chewer pack, face to face mid-board. A zombie
  // killing a demon chewer fires BOTH on one death (the kill raises a zombie, the corpse splits).
  for (let i = 0; i < 6; i++) spawn(w, ZOMBIE, 'raceUnit', 900 + i * 6, 520 + i * 8, -1);
  spawn(w, ZOMBIE, 't3Hound', 905, 560, 600);
  for (let i = 0; i < 4; i++) spawn(w, DEMON, 'chewer', 930 + i * 7, 525 + i * 9, 601);

  // ENDLESS DYNASTY: an enemy boss parked at the mummy keep, the count just short of a thousand.
  const keep = castleAnchor(2, w.layout);
  spawn(w, VAMP, T9_BOSS_TYPE.vampires, keep.x + (keep.x < 960 ? 60 : -60), keep.y, 602);
  w.players.get(MUMMY)!.dynastyHpLost = 950;

  w.phaseEndsAtTick = w.tick + 20; // the BUILD → FIGHT edge falls inside the compared window
  return w;
}

interface Rig {
  world: World;
  frame: (b: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'>) => { json: string; hash: number };
}

const newSpawner = () =>
  new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: RATE }, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));

function referenceRig(world: World): Rig {
  const spawner = newSpawner();
  const controls = new WorkerControls(world, ZOMBIE);
  const gameStateExtras = makeGameStateExtras();
  const state = makeHostTickState(world);
  const cursor = { lastMatcherTick: -1 };
  const cinematics = makeWorkerCinematicState();
  return {
    world,
    frame: (b) => {
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

describe('S188 racial-b — host vs ?worker=1 over BUILD → FIGHT → BUILD, with all three spawning (A5)', () => {
  it('is byte-identical every frame, and every mechanic genuinely fired inside the window', () => {
    const refWorld = buildWorld();
    const seeded = new Set<CreatureId>(refWorld.creatures.keys());
    const ref = referenceRig(refWorld);
    const batch = batchRig(refWorld);
    expect(hashWorldStateFull(batch.world), 'INIT adoption must be bit-exact').toBe(hashWorldStateFull(refWorld));

    const phases: string[] = [refWorld.matchPhase];
    let fightStart = -1;
    let secondEdgeForced = false;
    const risen = new Set<CreatureId>();
    const splits = new Set<CreatureId>();
    const pharaohs = new Set<CreatureId>();
    let frames = 0;

    for (let f = 0; f < 900; f++) {
      if (refWorld.matchPhase === 'FIGHT' && fightStart < 0) fightStart = refWorld.tick;
      // Force the FIGHT → BUILD edge 900 ticks into the fight, identically on both (the worlds are
      // byte-identical here — the loop throws otherwise — so the injection cannot desync them).
      if (!secondEdgeForced && fightStart >= 0 && refWorld.tick >= fightStart + 900) {
        refWorld.phaseEndsAtTick = refWorld.tick + 5;
        batch.world.phaseEndsAtTick = batch.world.tick + 5;
        secondEdgeForced = true;
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
      const wa = hashWorldStateFull(refWorld);
      const wb = hashWorldStateFull(batch.world);
      if (wa !== wb) throw new Error(`WIDE divergence at frame ${f} (tick ${refWorld.tick})`);
      frames++;

      if (phases.at(-1) !== refWorld.matchPhase) phases.push(refWorld.matchPhase);
      for (const c of refWorld.creatures.values()) {
        if (seeded.has(c.id)) continue;
        if (c.hellspawnGen !== undefined) splits.add(c.id);
        if (c.type === T9_BOSS_TYPE.mummies && c.ownerPlayerId === MUMMY) pharaohs.add(c.id);
        if (c.type === 'raceUnit' && c.ownerPlayerId === ZOMBIE && !castleEmitsOnTick(0, c.spawnedAtTick)) {
          risen.add(c.id);
        }
      }
      if (secondEdgeForced && refWorld.matchPhase === 'BUILD' && phases.length >= 3 && f > 0) {
        // run a few frames into the second BUILD, then stop
        if (refWorld.tick > refWorld.phaseEndsAtTick - 5300) break;
      }
    }

    expect(frames).toBeGreaterThan(100);
    expect(phases.slice(0, 3), 'a full BUILD → FIGHT → BUILD cycle inside the compared window').toEqual(['BUILD', 'FIGHT', 'BUILD']);
    expect(batch.world.matchPhase).toBe(refWorld.matchPhase);
    // ⛔ ANTI-VACUITY — a green differential over a run in which nothing spawned proves nothing.
    expect(risen.size, 'THE RISEN raised at least one zombie').toBeGreaterThan(0);
    expect(splits.size, 'HELLSPAWN split at least one chewer').toBeGreaterThan(0);
    expect(pharaohs.size, 'ENDLESS DYNASTY raised at least one Pharaoh').toBeGreaterThan(0);
    expect(refWorld.players.get(MUMMY)!.dynastyHpLost).toBeGreaterThanOrEqual(1000);
    // …and the castle sentinel really is the zombie seat's own castle spawn path.
    for (const id of risen) {
      const c = refWorld.creatures.get(id);
      if (c !== undefined) expect(c.sourceSpawnerId).toBe(castleSpawnerId(0));
    }
  });
});
