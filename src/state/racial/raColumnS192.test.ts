/**
 * SPARK — S192 (owner) — **THE PHARAOH BOSS'S COLUMN IS THE PERK'S COLUMN, AND WRATH OF RA RAISES BOTH TO 75.**
 *
 * > *"the [Ra] column, Pharaoh boss should not keep … his 300. That's ridiculous. He goes down to 35 per
 * > column, just like a regular column attack. And once we have Ra's Wrath at … level 10, once we have
 * > that ability, then each column goes … up to 75. And also Pharaoh's become 75. Okay? If the player
 * > chose that ability."* — owner, S192
 *
 * Pinned here, through the REAL host tick:
 *   1. arithmetic — 75 on the ladder; `raColumnPoolFor` is 35 / 75 by the OWNER seat's picks;
 *   2. a Pharaoh boss of a non-WRATH seat lands 35 split, and still spares NOBODY (his own seat included);
 *   3. a WRATH seat's Pharaoh lands 75 split, and its POWER OF RA cast lands 75 split;
 *   4. NEGATIVE — the number follows the column's OWNER, never the victim or a neighbouring WRATH seat;
 *   5. host vs `?worker=1` stay byte-identical through a WRATH seat's cast AND its Pharaoh's ritual.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  RA_COLUMN_ATK,
  RA_COLUMN_COUNT,
  RA_COLUMN_PEN,
  RA_WRATH_COLUMN_ATK,
  RA_WRATH_COLUMN_PEN,
  SparkType,
} from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type CreatureId, type PlayerId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../hostTick.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { attackFifths } from '../stats.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import { damageCreature } from '../creatures/creatureLifecycle.ts';
import { generalPickForWave } from '../draft.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { hashWorldState } from '../stateHash.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { netSnapshot, snapshot } from '../save.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from '../workerSim.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from '../godlyMatcherCore.ts';
import { BotManager } from '../../bots/botManager.ts';
import {
  raColumnPoolFor,
  raSplitShares,
  raStrikeColumnPos,
  RA_PERK_STRIKE_FIFTHS,
  RA_WRATH_STRIKE_FIFTHS,
} from './powerOfRa.ts';

const P0 = asPlayerId(0); // MUMMIES — POWER OF RA, and WRATH OF RA when `wrath`
const P1 = asPlayerId(1); // ORCS
const AIM = { x: 960, y: 260 };

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A 1v1 in FIGHT: seat 0 mummies with POWER OF RA (and WRATH OF RA when `wrath`), seat 1 orcs. */
function raWorld(wrath: boolean): World {
  const w = makeWorld(0x5a192);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P1, pick: generalPickForWave(1) });
  // WRATH OF RA is the racial pick at the level-10 slot on top of POWER OF RA (`seatHoldsPerk`).
  if (wrath) w.players.get(P0)!.draftPicks.splice(0, Infinity, 'racial', 'hp', 'racial');
  w.draft = null;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

let nextSentinel = 9700;
function victim(w: World, owner: PlayerId, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(nextSentinel++),
  });
  const id = [...w.creatures.keys()].at(-1)!;
  const c = w.creatures.get(id)!;
  c.ehp = 10_000;
  c.maxEhp = 10_000;
  return id;
}

function place(w: World, id: CreatureId, at: { x: number; y: number }): void {
  const c = w.creatures.get(id)!;
  c.pos = { x: at.x, y: at.y };
  c.prevPos = { x: at.x, y: at.y };
  c.targetPos = { x: at.x, y: at.y };
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

/** A 5-connector hub (pool 50) centred at `at`. */
function hub(w: World, seat: PlayerId, at: { x: number; y: number }): BondId[] {
  const centre = addPrim(w, seat, at.x, at.y);
  const ids: BondId[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i * 2 * Math.PI) / 5;
    const leaf = addPrim(w, seat, at.x + Math.round(Math.cos(ang) * 30), at.y + Math.round(Math.sin(ang) * 30));
    const id = w.nextBondId++ as unknown as BondId;
    w.bonds.set(id, { id, aId: centre.id, bId: leaf.id, a: centre, b: leaf, restLength: Math.hypot(centre.pos.x - leaf.pos.x, centre.pos.y - leaf.pos.y), stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    centre.bonds.add(id);
    leaf.bonds.add(id);
    ids.push(id);
  }
  return ids;
}
const banked = (w: World, ids: readonly BondId[]): number => ids.reduce((s, id) => s + (w.bonds.get(id)?.damageFifths ?? 0), 0);

function tickTo(w: World, d: HostTickDeps, s: HostTickState, target: number): void {
  let guard = 0;
  while (w.tick < target) {
    runHostTick(w, d, s);
    if (++guard > 100_000) throw new Error('tickTo ran away');
  }
}

/** Spawn a Pharaoh for `owner` and start his ritual the way the game does (a lethal blow). */
function pharaohInRitual(w: World, owner: PlayerId, at = { x: 500, y: 560 }): { id: CreatureId; until: number } {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 't9BossMummies' as never, ownerPlayerId: owner,
    pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: asSpawnerId(nextSentinel++),
  });
  const boss = [...w.creatures.values()].find((c) => c.type === 't9BossMummies' && c.ownerPlayerId === owner)!;
  expect(damageCreature(w, boss.id, 100_000), 'the lethal blow starts the ritual').toBe(false);
  expect(boss.raRitualUntilTick).toBeDefined();
  return { id: boss.id, until: boss.raRitualUntilTick! };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — the arithmetic: 35, or 75 with WRATH OF RA, decided by the column OWNER', () => {
  it('75 is HIS number, on the one ladder (pair ⚠ MINE); 300 is nobody\'s any more', () => {
    expect(RA_WRATH_STRIKE_FIFTHS).toBe(attackFifths(RA_WRATH_COLUMN_ATK, RA_WRATH_COLUMN_PEN));
    expect(RA_WRATH_STRIKE_FIFTHS).toBe(75);
    expect(RA_PERK_STRIKE_FIFTHS).toBe(35);
    expect([RA_PERK_STRIKE_FIFTHS, RA_WRATH_STRIKE_FIFTHS]).not.toContain(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
    expect(raSplitShares(RA_WRATH_STRIKE_FIFTHS, 2)).toEqual([38, 37]);
  });

  it('raColumnPoolFor reads the seat\'s picks: WRATH 75, POWER OF RA only 35, another race 35, no seat 35', () => {
    const plain = raWorld(false);
    expect(seatHoldsPerk(plain.players.get(P0)!, 'mummies.l10')).toBe(false);
    expect(raColumnPoolFor(plain, P0)).toBe(RA_PERK_STRIKE_FIFTHS);
    const wrath = raWorld(true);
    expect(seatHoldsPerk(wrath.players.get(P0)!, 'mummies.l10')).toBe(true);
    expect(raColumnPoolFor(wrath, P0)).toBe(RA_WRATH_STRIKE_FIFTHS);
    expect(raColumnPoolFor(wrath, P1), 'the orc seat next to a WRATH seat').toBe(RA_PERK_STRIKE_FIFTHS);
    expect(raColumnPoolFor(wrath, asPlayerId(3)), 'a seat that does not exist').toBe(RA_PERK_STRIKE_FIFTHS);
    expect(raColumnPoolFor(wrath, null)).toBe(RA_PERK_STRIKE_FIFTHS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — ⭐⭐ REACH: the Pharaoh BOSS\'s column, through the real host tick', () => {
  function bossColumn0(wrath: boolean, owner: PlayerId) {
    const w = raWorld(wrath);
    const d = deps();
    const s = makeHostTickState(w);
    const { id, until } = pharaohInRitual(w, owner);
    const impact = raColumnImpactTick(until, 0);
    tickTo(w, d, s, impact - 1);
    const boss = w.creatures.get(id)!;
    const pos = raColumnPos(id as unknown as number, 0, boss.pos.x, boss.pos.y);
    return { w, d, s, pos, impact };
  }

  it('⭐⭐ a non-WRATH seat\'s Pharaoh: 35 IN TOTAL, split 18 / 17 — not 300 to each', () => {
    const { w, d, s, pos, impact } = bossColumn0(false, P0);
    const a = victim(w, P1, pos.x, pos.y);
    const b = victim(w, P1, pos.x + 30, pos.y);
    place(w, a, pos);
    place(w, b, { x: pos.x + 30, y: pos.y });
    runHostTick(w, d, s);
    expect(w.tick).toBe(impact);
    expect(10_000 - w.creatures.get(a)!.ehp, 'the nearer gets the remainder').toBe(18);
    expect(10_000 - w.creatures.get(b)!.ehp).toBe(17);
  });

  it('⭐ he still spares NOBODY — his own seat\'s unit takes a share, and a structure is ONE target', () => {
    const { w, d, s, pos } = bossColumn0(false, P0);
    const own = victim(w, P0, pos.x, pos.y);
    place(w, own, pos);
    const tower = hub(w, P1, { x: pos.x + 40, y: pos.y });
    runHostTick(w, d, s);
    const shares = raSplitShares(RA_PERK_STRIKE_FIFTHS, 2);
    expect(10_000 - w.creatures.get(own)!.ehp, 'his OWN seat\'s unit is hit (spares nobody, unchanged)').toBe(shares[0]);
    expect(banked(w, tower), 'the enemy hub: one share, on one connector').toBe(shares[1]);
    expect(tower.every((id) => w.bonds.has(id)), 'a 50-pool hub stands').toBe(true);
  });

  it('⭐⭐ a WRATH seat\'s Pharaoh: 75 IN TOTAL — 38 / 37 between two victims', () => {
    const { w, d, s, pos } = bossColumn0(true, P0);
    const a = victim(w, P1, pos.x, pos.y);
    const b = victim(w, P1, pos.x + 30, pos.y);
    place(w, a, pos);
    place(w, b, { x: pos.x + 30, y: pos.y });
    runHostTick(w, d, s);
    expect(10_000 - w.creatures.get(a)!.ehp).toBe(38);
    expect(10_000 - w.creatures.get(b)!.ehp).toBe(37);
  });

  it('⛔ NEGATIVE — an ORC seat\'s Pharaoh on a board WITH a WRATH seat is still 35: the OWNER decides', () => {
    const { w, d, s, pos } = bossColumn0(true, P1);
    const e = victim(w, P0, pos.x, pos.y); // the victim is the WRATH seat's — irrelevant to the number
    place(w, e, pos);
    runHostTick(w, d, s);
    expect(10_000 - w.creatures.get(e)!.ehp).toBe(RA_PERK_STRIKE_FIFTHS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — ⭐⭐ REACH: a WRATH seat\'s POWER OF RA cast is 75, a plain seat\'s is 35', () => {
  it.each([[true, 38, 37], [false, 18, 17]] as const)('wrath=%s → %i / %i between two enemies', (wrath, near, far) => {
    const w = raWorld(wrath);
    const d = deps();
    const s = makeHostTickState(w);
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: AIM.x, y: AIM.y });
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    tickTo(w, d, s, raColumnImpactTick(strike.untilTick, 0) - 1);
    const a = victim(w, P1, spot.x, spot.y);
    const b = victim(w, P1, spot.x + 30, spot.y);
    place(w, a, spot);
    place(w, b, { x: spot.x + 30, y: spot.y });
    runHostTick(w, d, s);
    expect(10_000 - w.creatures.get(a)!.ehp).toBe(near);
    expect(10_000 - w.creatures.get(b)!.ehp).toBe(far);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — host vs ?worker=1: a WRATH seat\'s cast AND its Pharaoh\'s ritual (wide hash)', () => {
  it('is byte-identical every frame through every column of both, and both really landed', () => {
    const w = raWorld(true);
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: AIM.x, y: AIM.y });
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    const tower = hub(w, P1, spot);
    const { id: bossId, until } = pharaohInRitual(w, P0, { x: 600, y: 700 });
    const boss = w.creatures.get(bossId)!;
    const bpos = raColumnPos(bossId as unknown as number, 0, boss.pos.x, boss.pos.y);
    // Structures, not creatures: a creature's AI walks it off its spot over the 2 s before a column.
    const bossTower = hub(w, P1, bpos);

    const newSpawner = () => new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));
    const saveJson = JSON.stringify(snapshot(w, { spawnerState: newSpawner().getState() }));
    const sim = makeWorkerSim({ type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, ratePerSecond: 1 }, (dd, ss) => new BotManager(dd, ss));
    expect(hashWorldStateFull(sim.world), 'INIT adoption is bit-exact').toBe(hashWorldStateFull(w));

    const spawner = newSpawner();
    const controls = new WorkerControls(w, P0);
    const extras = makeGameStateExtras();
    const state = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    const cin = makeWorkerCinematicState();
    let seq = 0;
    const end = Math.max(raColumnImpactTick(strike.untilTick, RA_COLUMN_COUNT - 1), until) + 3;
    let f = 0;
    while (w.tick < end) {
      const input: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'> = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 960, y: 540 } },
        alivePeerIds: null,
        intents: [],
        nowMs: f * 16,
      };
      controls.setFrame(input.control);
      const dd: HostTickDeps = { spawner, controls, botManager: null, gameStateExtras: extras, alivePeerIds: null, hostSeats: new Map() };
      for (let i = 0; i < input.ticks; i++) runHostTick(w, dd, state);
      if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
      tickWorkerCinematics(w, cin);
      const aJson = JSON.stringify(netSnapshot(w));
      const aHash = hashWorldState(w);
      w.effects.length = 0;
      const r = applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...input }, { forceSnapshot: true });
      if (aJson !== JSON.stringify(r.snapshot) || aHash !== r.hash) throw new Error(`DIVERGED at frame ${f} (tick ${w.tick})`);
      if (hashWorldStateFull(w) !== hashWorldStateFull(sim.world)) throw new Error(`WIDE divergence at frame ${f}`);
      f++;
    }
    // ⛔ ANTI-VACUITY — both the cast and the Pharaoh's ritual landed damage inside the window.
    const hit = (ids: readonly BondId[]) => banked(w, ids) > 0 || ids.some((id) => !w.bonds.has(id));
    expect(hit(tower), 'the cast column 0 hit its hub').toBe(true);
    expect(hit(bossTower), 'the Pharaoh column 0 hit his').toBe(true);
    expect(w.creatures.has(bossId), 'the ritual ran to its end — he is gone').toBe(false);
  });
});
