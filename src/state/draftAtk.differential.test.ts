/**
 * SPARK — S190 (s188/draft-atk) — the WORKER site of `Creature.atkFifths`: a drafted seat's baked
 * strike is BYTE-IDENTICAL between the direct host path and the `?worker=1` mirror.
 *
 * The field is a birth property. Two ways it can reach the worker, and both are exercised here:
 *   · creatures alive BEFORE the INIT cross the JSON save (`snapshot` → `makeWorkerSim` → `restore`);
 *   · creatures born AFTER it are baked independently by each sim from the seat's `draftPicks`.
 * A mirror that lost the field on INIT, or baked it from a different pick list, would strike for a
 * different number on the next hit — and the wide oracle (`:ak` projection) is the channel that sees it.
 *
 * Harness: `racial/racialB.differential.test.ts`'s REFERENCE rig (`runHostTick` directly) against a
 * BATCH rig adopted through the real worker INIT and driven through `applyTickBatch`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { BotManager } from '../bots/botManager.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { netSnapshot, snapshot } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const DRAFTED = asPlayerId(0);
const PLAIN = asPlayerId(1);
const RATE = 3;
const SEED = 0x5190a;

function spawn(w: World, owner: PlayerId, type: CreatureType, x: number, y: number, spawner: number): void {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(spawner),
  });
}

function buildWorld(): World {
  const w = makeWorld(SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: 0xaa2222, raceId: 'orcs' },
      { seat: 1, color: 0x55aa55, raceId: 'zombies' },
    ],
  });
  // HP → DEF → ATK → PEN: two pool picks AND two damage picks, so both baked fields ride.
  w.players.get(DRAFTED)!.draftPicks = ['hp', 'def', 'atk', 'pen'];
  w.players.get(PLAIN)!.draftPicks = [];
  w.draft = null;
  w.creatures.clear();
  // Seeded BEFORE the INIT — these cross the save. Face to face mid-board, far from both keeps.
  for (let i = 0; i < 5; i++) spawn(w, DRAFTED, 'raceUnit', 900 + i * 6, 520 + i * 8, 700);
  spawn(w, DRAFTED, 'goblinMelee', 905, 470, 701);
  for (let i = 0; i < 5; i++) spawn(w, PLAIN, 'raceUnit', 940 + i * 6, 525 + i * 8, 702);
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
  const controls = new WorkerControls(world, DRAFTED);
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

describe('S190 draft-atk — host vs ?worker=1 with a drafted seat striking (the worker site)', () => {
  it('is byte-identical every frame, and the baked strike genuinely crossed the INIT and was re-baked after it', () => {
    const refWorld = buildWorld();
    const seeded = new Set<CreatureId>(refWorld.creatures.keys());
    const seededBaked = [...refWorld.creatures.values()].filter((c) => c.atkFifths !== undefined);
    const ref = referenceRig(refWorld);
    const batch = batchRig(refWorld);
    expect(hashWorldStateFull(batch.world), 'INIT adoption must be bit-exact').toBe(hashWorldStateFull(refWorld));
    // ⛔ ANTI-VACUITY (INIT half): the seeded drafted creatures carry the field, and so does the mirror.
    expect(seededBaked.length).toBeGreaterThan(0);
    for (const c of seededBaked) expect(batch.world.creatures.get(c.id)?.atkFifths).toBe(c.atkFifths);

    const bornBaked = new Set<CreatureId>();
    let plainPoolLost = 0;
    let frames = 0;
    let fightSeen = false;
    // Runs until the REAL castle emitter (every RACE_UNIT_EMIT_INTERVAL_TICKS = 1800 ticks, phase-spread
    // by seat) has minted a drafted unit on both sims, then 60 frames more so it gets to fight.
    let stopAt = Number.POSITIVE_INFINITY;
    for (let f = 0; f < 2600 && f < stopAt; f++) {
      const before = new Map([...refWorld.creatures.values()]
        .filter((c) => c.ownerPlayerId === PLAIN).map((c) => [c.id, c.ehp] as const));
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
      if (refWorld.matchPhase === 'FIGHT') fightSeen = true;
      for (const [id, ehp] of before) {
        // A drafted 8 one-shots a 6-pool race unit, so most hits show as the victim VANISHING (swept
        // the same tick) rather than as a smaller pool — both count. (Race units do not age out.)
        const now = refWorld.creatures.get(id)?.ehp;
        if (now === undefined) plainPoolLost += Math.max(1, ehp);
        else if (now < ehp) plainPoolLost += ehp - now;
      }
      for (const c of refWorld.creatures.values()) {
        if (!seeded.has(c.id) && c.ownerPlayerId === DRAFTED && c.atkFifths !== undefined) bornBaked.add(c.id);
      }
      if (bornBaked.size > 0 && stopAt === Number.POSITIVE_INFINITY) stopAt = f + 60;
    }
    expect(frames).toBeGreaterThan(100);
    expect(fightSeen, 'the run crossed into FIGHT').toBe(true);
    // ⛔ ANTI-VACUITY (born-after half, and the fight itself): a green differential over a run in
    // which no drafted creature was born and nobody was hit proves nothing.
    expect(bornBaked.size, 'a drafted creature was born AFTER the INIT, on both sims').toBeGreaterThan(0);
    for (const id of bornBaked) {
      const m = batch.world.creatures.get(id);
      if (m !== undefined) expect(m.atkFifths).toBe(refWorld.creatures.get(id)!.atkFifths);
    }
    expect(plainPoolLost, 'the undrafted seat took hits inside the window').toBeGreaterThan(0);
  });
});
