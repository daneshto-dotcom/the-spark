/**
 * SPARK — ⭐ S191: DO THE STAT BOARD'S COUNTERS ACTUALLY REACH THE GAME?
 *
 * `matchStats.test.ts` proves the arithmetic and the four sites. It would stay entirely green if no sim
 * path ever called a writer — "done, gates green" and an empty board. This drives the REAL host tick, the
 * REAL damage dispatcher, the REAL reducers and a REAL win, and reads the result off the world.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPAWNER_CONFIG,
  Spawner,
} from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks, winScoreForWave } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import { damageConnector, damageEntity, type DamageAttacker } from './damage.ts';
import { awardSpawnerKillReward } from './gameMode.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { recordUnitBuilt } from './matchStats.ts';
import { mulberry32 } from './rng.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import type { Primitive } from '../game/primitive.ts';
import './godlyRecipes/registerAll.ts';
import { applyNetSnapshot, netSnapshot } from './save.ts';
import { determinismParts } from './stateHashFull.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** A 1v1 host world in FIGHT, no creatures — the castleGuns.test.ts fixture. */
function fightWorld(): World {
  const w = makeWorld(0x5191);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

/** An enemy chewer `dist` px from seat 0's castle, minted through the REAL reducer. */
function chewerNearSeat0(w: World, dist: number): CreatureId {
  const anchor = castleAnchor(0, w.layout);
  const pos = { x: anchor.x + dist, y: anchor.y };
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P1, pos, targetPos: pos,
    sourceSpawnerId: asSpawnerId(1),
  });
  return [...w.creatures.keys()].at(-1)!;
}

const stats = (w: World, seat: PlayerId) => w.matchStats.seats.get(seat);

describe('S191 REACH — the counters through the real host tick', () => {
  it('the castle gun kills an enemy chewer: UNITS for its owner, a KILL + DEALT for the keep, TAKEN for the victim', () => {
    const w = fightWorld();
    const id = chewerNearSeat0(w, 10);
    const pool = w.creatures.get(id)!.ehp;
    expect(stats(w, P1)?.built.get('chewer')).toBe(1); // the mint site

    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 600 && w.creatures.has(id); i++) runHostTick(w, deps, st);
    expect(w.creatures.has(id), 'fixture: the castle must kill it inside 600 ticks').toBe(false);

    const s0 = stats(w, P0)!;
    expect(s0.kills.get('chewer')).toBe(1);
    // ⛔ AS APPLIED, NEVER THE SWING: the keep's shot is bigger than a chewer, and only the pool counts.
    expect(s0.dealtFifths).toBeGreaterThanOrEqual(pool);
    expect(stats(w, P1)!.takenFifths).toBeGreaterThanOrEqual(pool);
    // Conservation: nobody deals more than was taken (taken also holds self-hits and unattributed hits).
    let dealt = 0;
    let taken = 0;
    for (const s of w.matchStats.seats.values()) { dealt += s.dealtFifths; taken += s.takenFifths; }
    expect(dealt).toBeLessThanOrEqual(taken);
  });

  it('the FIGHT→BUILD edge records one graph point for the wave just closed, every seat in it', () => {
    const w = fightWorld();
    const wave = w.waveNumber;
    w.phaseEndsAtTick = w.tick + 1;
    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 3; i++) runHostTick(w, deps, st);
    expect(w.waveNumber).toBe(wave + 1);
    const last = w.matchStats.history.at(-1)!;
    expect(last.wave).toBe(wave);
    expect(last.seats.map((s) => s.seat)).toEqual([...w.players.keys()].sort((a, b) => a - b));
  });
});

describe('S191 REACH — a real WIN keeps the board, and every peer receives it', () => {
  it('a SCORE win: the final point is taken before the teardown, totals survive it, and the net form carries the whole history', () => {
    const w = fightWorld();
    recordUnitBuilt(w, P0, 'raceUnit');
    // A tower that the WIN teardown will clear — which must NOT count as a fall.
    dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(0), recipeId: 'pentagram' });
    w.phaseEndsAtTick = w.tick + 1;
    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 3; i++) runHostTick(w, deps, st); // one real wave edge first
    const bar = winScoreForWave(w.waveNumber);
    w.scoreByPlayer.set(P0, bar + 1);
    w.scoreProgress = bar + 1;
    const extras = makeGameStateExtras();
    tickGameState(w, extras, P0);
    expect(w.gameState).toBe('WIN');
    expect(w.creatureSpawners.size, 'the teardown ran').toBe(0);

    const s0 = stats(w, P0)!;
    expect(s0.built.get('raceUnit')).toBe(1);
    expect(s0.towersBuilt).toBe(1);
    expect(s0.towersFell, 'a teardown clear is not a fall').toBe(0);
    const h = w.matchStats.history;
    expect(h.length).toBe(2);
    expect(h.at(-1)!.wave).toBe(w.waveNumber); // the final, in-progress wave
    expect(h.at(-1)!.seats.find((p) => p.seat === P0)!.score).toBe(bar + 1);

    // Every peer's board is complete at the win, whatever it missed.
    const peer = makeWorld(0x5191);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), peer);
    expect(peer.matchStats.history.map((x) => x.wave)).toEqual(h.map((x) => x.wave));
    expect(peer.matchStats.seats.get(P0)!.built.get('raceUnit')).toBe(1);
  });

  it('a CASTLE win: the fallen seat is stamped with the wave it fell on', () => {
    const w = fightWorld();
    w.waveNumber = 4;
    const victim = w.players.get(P1)!;
    victim.castleHp = 40;
    // The killing blow, as applied: 40 left, a 300 swing takes 40.
    damageEntity(w, { kind: 'castle', seat: P1 }, 300, 'creature', { kind: 'seat', seat: P0 }, 'physical');
    expect(stats(w, P0)!.dealtFifths).toBe(40);
    expect(stats(w, P1)!.takenFifths).toBe(40);
    tickGameState(w, makeGameStateExtras(), P0);
    expect(w.gameState).toBe('WIN');
    expect(stats(w, P1)!.fellOnWave).toBe(4);
    expect(stats(w, P0)?.fellOnWave).toBeUndefined();
  });
});

describe('S191 REACH — the exact rules at the chokepoints', () => {
  it('a kill is counted EXACTLY ONCE under the S155 N1 deferral, and a corpse takes no more damage', () => {
    const w = fightWorld();
    const victim = chewerNearSeat0(w, 400);
    const pool = w.creatures.get(victim)!.ehp;
    w.pendingCreatureDeaths = new Set();
    const by: DamageAttacker = { kind: 'seat', seat: P0 };
    damageEntity(w, { kind: 'creature', id: victim }, pool + 50, 'creature', by, 'physical');
    damageEntity(w, { kind: 'creature', id: victim }, pool + 50, 'creature', by, 'physical'); // a second lethal blow
    w.pendingCreatureDeaths = null;
    expect(stats(w, P0)!.kills.get('chewer')).toBe(1);
    expect(stats(w, P0)!.dealtFifths).toBe(pool);
  });

  it('a connector hit banks in full, and only the remainder a broken last connector throws away is lost', () => {
    const w = fightWorld();
    // Two shapes, one connector, owned by P1: pool(1) = 6 fifths.
    const a = asPrimitiveId(9001);
    const b = asPrimitiveId(9002);
    const mk = (id: typeof a, x: number) => ({
      id, type: 0, placerColor: 0, placedBy: P1, createdTick: 0, pos: { x, y: 300 }, prevPos: { x, y: 300 },
      bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 8, hp: 70, origin: null,
    }) as never;
    w.primitives.set(a, mk(a, 300));
    w.primitives.set(b, mk(b, 330));
    const bondId = 9100 as never;
    const pa = w.primitives.get(a)!;
    const pb = w.primitives.get(b)!;
    w.bonds.set(bondId, { id: bondId, aId: a, bId: b, a: pa, b: pb, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 });
    pa.bonds.add(bondId);
    pb.bonds.add(bondId);
    expect(damageConnector(w, bondId, 4, { kind: 'seat', seat: P0 }, 'physical')).toBe(false);
    expect(stats(w, P0)!.dealtFifths).toBe(4); // banked in full
    expect(damageConnector(w, bondId, 30, { kind: 'seat', seat: P0 }, 'physical')).toBe(true);
    expect(stats(w, P0)!.dealtFifths).toBe(6); // 4 + the 2 that finished it; 28 overkill thrown away
    expect(stats(w, P1)!.takenFifths).toBe(6);
  });

  it('towers: an ignition counts, a destruction counts once, and a second removal of the same id counts nothing', () => {
    const w = fightWorld();
    dispatch(w, { type: 'REGISTER_DEFENDER', defenderKind: 'turret', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(77), recipeId: 'laserTurret', pos: { x: 500, y: 500 } } as never);
    const did = [...w.defenders.keys()][0]!;
    expect(stats(w, P1)!.towersBuilt).toBe(1);
    dispatch(w, { type: 'REMOVE_DEFENDER', defenderId: did });
    dispatch(w, { type: 'REMOVE_DEFENDER', defenderId: did });
    expect(stats(w, P1)!.towersFell).toBe(1);
    dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(78), recipeId: 'pentagram' });
    expect(stats(w, P1)!.towersBuilt).toBe(2);
    const sp = [...w.creatureSpawners.values()][0]!;
    awardSpawnerKillReward(w, sp); // the poll's destruction event
    expect(stats(w, P1)!.towersFell).toBe(2);
  });

  it('⚠ HELGA is a unit her hall re-summons, not a tower: her summon and her death leave TOWERS alone', () => {
    const w = fightWorld();
    dispatch(w, { type: 'REGISTER_DEFENDER', defenderKind: 'princess', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(79), recipeId: 'helga', pos: { x: 600, y: 600 } } as never);
    const helga = [...w.defenders.values()].find((d) => d.kind === 'princess')!;
    expect(stats(w, P1)?.towersBuilt ?? 0).toBe(0);
    damageEntity(w, { kind: 'defender', id: helga.id }, 10_000, 'creature', { kind: 'seat', seat: P0 }, 'physical');
    // ⭐ S192 (merge with weld, R190-J) — she goes DORMANT, her record is KEPT for the edge revive.
    expect(w.defenders.get(helga.id)?.state, 'fixture: she died').toBe('DORMANT');
    expect(w.defenders.get(helga.id)?.ehp).toBeNull();
    expect(stats(w, P1)?.towersBuilt ?? 0).toBe(0);
    expect(stats(w, P1)!.towersFell).toBe(0);
    expect(stats(w, P0)!.dealtFifths, 'her pool, as applied').toBeGreaterThan(0);
  });

  it('⛔ a SEAT attacker is INERT for every rule: the world outside the stat board is identical to a null hit', () => {
    const run = (by: DamageAttacker): string[] => {
      const w = fightWorld();
      const id = chewerNearSeat0(w, 400);
      damageEntity(w, { kind: 'creature', id }, 1, 'defender', by, 'physical'); // survives: retaliation would fire here
      damageEntity(w, { kind: 'castle', seat: P1 }, 25, 'defender', by, 'physical');
      return determinismParts(w).filter((p) => !/^m[sh]\d+:/.test(p));
    };
    expect(run({ kind: 'seat', seat: P0 })).toEqual(run(null));
  });
});

describe('⭐ S192 — the DORMANT Helga (weld R190-J) through the REAL matcher and phase edges', () => {
  function mk(w: World, type: SparkType, x: number, y: number): Primitive {
    const player = w.players.get(P0)!;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const prim: Primitive = {
      id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    w.primitives.set(id, prim);
    return prim;
  }
  function bond(w: World, a: Primitive, b: Primitive): void {
    const bid = asBondId(w.nextBondId++);
    w.bonds.set(bid, { id: bid, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
    a.bonds.add(bid);
    b.bonds.add(bid);
  }
  function tick(w: World, st: ReturnType<typeof makeHostTickState>, n: number): void {
    const d = hostDeps();
    const cursor = { lastMatcherTick: -1 };
    for (let i = 0; i < n; i++) {
      runGodlyMatcherCore(w, cursor);
      runHostTick(w, d, st);
      w.effects.length = 0;
    }
  }
  function crossPhase(w: World, st: ReturnType<typeof makeHostTickState>): void {
    const from = w.matchPhase;
    w.phaseEndsAtTick = w.tick + 1;
    tick(w, st, 3);
    expect(w.matchPhase, `the phase must flip from ${from}`).not.toBe(from);
  }

  it('killed by a seat, revived by the edge: never a tower built, never a tower fell, never a unit kill', () => {
    const w = makeWorld(0x5192);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const st = makeHostTickState(w);
    // Her hall (the weldDormantSeamsS191 fixture): Triangle hub + alternating Spiral/Circle leaves.
    const hub = mk(w, SparkType.Triangle, 500, 300);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bond(w, hub, mk(w, i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40));
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
    tick(w, st, 2);
    const helga = () => [...w.defenders.values()].find((d) => d.kind === 'princess');
    expect(helga(), 'fixture: her hall ignites').toBeDefined();
    crossPhase(w, st); // → FIGHT
    const h = helga()!;
    expect(damageEntity(w, { kind: 'defender', id: h.id }, h.ehp!, 'creature', { kind: 'seat', seat: P1 }, 'physical')).toBe(true);
    expect(helga()?.state).toBe('DORMANT');
    expect(stats(w, P1)!.dealtFifths, 'the damage she took is credited').toBeGreaterThan(0);
    crossPhase(w, st); // → BUILD: the edge revives her
    expect(helga()?.state, 'her hall stood, so the edge revives her').toBe('IDLE');
    expect(stats(w, P0)?.towersBuilt ?? 0, 'neither the summon nor the revive is a tower').toBe(0);
    expect(stats(w, P0)?.towersFell ?? 0, 'her death is not a tower fall').toBe(0);
    expect([...(stats(w, P1)?.kills.values() ?? [])].reduce((a, b) => a + b, 0), 'nor a unit kill').toBe(0);
  });
});

describe('⭐ S194 v2 REACH — the new counters through the REAL dispatcher, host tick and wave edge', () => {
  it('the castle gun\'s kill files a LOSS for the victim and a who-hit-whom entry; the wave edge carries the totals', () => {
    const w = fightWorld();
    const id = chewerNearSeat0(w, 10);
    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 600 && w.creatures.has(id); i++) runHostTick(w, deps, st);
    expect(w.creatures.has(id), 'fixture: the castle must kill it').toBe(false);
    expect(stats(w, P1)!.lost.get('chewer')).toBe(1);
    const s0 = stats(w, P0)!;
    expect(s0.dealtTo.get(P1)).toBe(s0.dealtFifths); // every point of it landed on P1's chewer
    expect([s0.dealtKeep, s0.dealtStruct]).toEqual([0, 0]); // a unit, not a building
    w.phaseEndsAtTick = w.tick + 1;
    for (let i = 0; i < 3; i++) runHostTick(w, deps, st);
    const pt = w.matchStats.history.at(-1)!.seats.find((p) => p.seat === P0)!;
    expect([pt.kills, pt.dealt]).toEqual([1, s0.dealtFifths]);
  });

  it('a keep hit files under KEEP, a connector hit under STRUCTURE — through damageEntity / damageConnector', () => {
    const w = fightWorld();
    damageEntity(w, { kind: 'castle', seat: P1 }, 30, 'creature', { kind: 'seat', seat: P0 }, 'physical');
    const keep = stats(w, P0)!.dealtKeep;
    expect(keep).toBeGreaterThan(0);
    expect(stats(w, P1)!.takenKeep).toBe(keep);
    const a = asPrimitiveId(9201);
    const b = asPrimitiveId(9202);
    const mk = (pid: typeof a, x: number) => ({
      id: pid, type: 0, placerColor: 0, placedBy: P1, createdTick: 0, pos: { x, y: 300 }, prevPos: { x, y: 300 },
      bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 8, hp: 70, origin: null,
    }) as never;
    w.primitives.set(a, mk(a, 300));
    w.primitives.set(b, mk(b, 330));
    const bondId = 9300 as never;
    const pa = w.primitives.get(a)!;
    const pb = w.primitives.get(b)!;
    w.bonds.set(bondId, { id: bondId, aId: a, bId: b, a: pa, b: pb, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 });
    pa.bonds.add(bondId);
    pb.bonds.add(bondId);
    damageConnector(w, bondId, 4, { kind: 'seat', seat: P0 }, 'physical');
    expect(stats(w, P0)!.dealtStruct).toBe(4);
    expect(stats(w, P1)!.takenStruct).toBe(4);
    expect(stats(w, P0)!.dealtTo.get(P1)).toBe(keep + 4);
  });
});
