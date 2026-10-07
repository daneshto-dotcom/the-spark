/**
 * SPARK — S196 (owner playtest P1 item 5) — *"when zombies were killing, they weren't producing other
 * zombies."* VERIFY-FIRST: drive THE RISEN through the REAL host tick in the shapes his match had —
 * a castle soldier against an ENEMY CASTLE SOLDIER (a mutual collision, the S156 initiative roll), the
 * hound and the boss, FFA and 2v2, a perk taken by the wave-1 DRAFT DEADLINE (not hand-set), and the
 * risen soldier crossing a NetSnapshot to a joiner.
 *
 * `theRisen.test.ts` already reaches one shape (soldier vs a pencil chewer, perk hand-set). These are
 * the shapes it did not.
 */
import { describe, expect, it } from 'vitest';
import { phaseDurationTicks } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { CreatureType } from '../creatures/creature.ts';
import { sweepDeferredDeaths } from '../creatures/creatureLifecycle.ts';
import { damageEntity } from '../damage.ts';
import { DRAFT_DEADLINE_TICKS } from '../draftEvent.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { castleEmitsOnTick, castleSpawnerId } from '../raceUnitEmit.ts';
import type { RaceId } from '../races.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { RACE_TOWER_UNIT } from '../raceTowerIds.ts';
import { mulberry32 } from '../rng.ts';
import { applyNetSnapshot, netSnapshot, stripWirePrevPos, wireNumberReplacer } from '../save.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { drainRacialSpawnQueue } from './racialTick.ts';

const P0 = asPlayerId(0); // the zombie seat
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

type Seat = { readonly race: RaceId; readonly team?: number };

/** A networked-shape start: a host roster with races (and teams), then straight into a FIGHT. */
function match(seats: readonly Seat[], zombiePicks: 'racial' | 'hp' | 'draft' = 'racial'): World {
  const w = makeWorld(0x5196);
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: seats.map((s, i) => ({ seat: i, color: i, raceId: s.race, ...(s.team === undefined ? {} : { team: s.team }) })),
  });
  if (zombiePicks !== 'draft') {
    w.draft = null;
    for (const p of w.players.values()) p.draftPicks = [];
    w.players.get(P0)!.draftPicks = [zombiePicks];
  }
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    sourceSpawnerId: type === 'raceUnit' ? castleSpawnerId(owner as unknown as number) : asSpawnerId(40 + Number(owner)),
  });
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

/** P0's castle soldiers born at P0's keep ON `tick` (the cadence is excluded by the caller). */
function risenOn(w: World, tick: number): CreatureId[] {
  const a = castleAnchor(0, w.layout);
  return [...w.creatures.values()]
    .filter((c) => c.type === 'raceUnit' && c.ownerPlayerId === P0 && c.spawnedAtTick === tick
      && Math.hypot(c.pos.x - a.x, c.pos.y - a.y) <= 47)
    .map((c) => c.id);
}

/** Run the REAL host tick until `victim` is gone; returns the kill tick. */
function runUntilGone(w: World, victim: CreatureId, cap = 2400): number {
  const deps = hostDeps();
  const st = makeHostTickState(w);
  for (let i = 0; i < cap; i++) {
    runHostTick(w, deps, st);
    if (!w.creatures.has(victim)) return w.tick;
  }
  throw new Error(`fixture: victim ${victim} survived ${cap} ticks`);
}

/**
 * ⚠ FIXTURE — the S156 initiative roll decides a duel, and a measured first draft LOST two of them (the
 * zombie died, the enemy walked off and vanished at a keep: not a kill, so nothing rose — correctly). A
 * deep pool on the killer makes the duel's outcome the one under test. Its blow is unchanged.
 */
function sturdy(w: World, id: CreatureId): void {
  w.creatures.get(id)!.ehp = 100_000;
}

/** Births on the kill tick, minus the castle cadence if it happened to fire on that tick. */
function raisedAt(w: World, killTick: number): number {
  return risenOn(w, killTick).length - (castleEmitsOnTick(0, killTick) ? 1 : 0);
}

describe('S196 THE RISEN — REACH through runHostTick, the shapes his match had', () => {
  it('a zombie castle soldier kills an ENEMY CASTLE SOLDIER (mutual collision) → one risen', () => {
    const w = match([{ race: 'zombies' }, { race: 'vampires' }]);
    expect(seatHoldsPerk(w.players.get(P0)!, 'zombies.l0')).toBe(true);
    // several duels so at least one is WON by the zombie side (the S156 roll decides who swings)
    const pairs: Array<[CreatureId, CreatureId]> = [];
    for (let k = 0; k < 6; k++) {
      pairs.push([spawnAt(w, P0, 'raceUnit', 700 + k * 90, 540), spawnAt(w, P1, 'raceUnit', 708 + k * 90, 540)]);
    }
    const deps = hostDeps();
    const st = makeHostTickState(w);
    let raised = 0;
    let enemyKilledByZombie = 0;
    for (let i = 0; i < 2400; i++) {
      const enemiesBefore = pairs.filter(([, e]) => w.creatures.has(e)).length;
      runHostTick(w, deps, st);
      const killedNow = enemiesBefore - pairs.filter(([, e]) => w.creatures.has(e)).length;
      enemyKilledByZombie += killedNow;
      raised += raisedAt(w, w.tick);
      if (pairs.every(([z, e]) => !w.creatures.has(z) || !w.creatures.has(e))) break;
    }
    expect(enemyKilledByZombie, 'the zombie side must win some duels').toBeGreaterThan(0);
    expect(raised).toBe(enemyKilledByZombie);
  });

  it.each([
    ['the hound', RACE_TOWER_UNIT.zombies as CreatureType],
    ['the zombie boss', T9_BOSS_TYPE.zombies as CreatureType],
  ])('%s kills an enemy castle soldier → one risen', (_label, type) => {
    const w = match([{ race: 'zombies' }, { race: 'orcs' }]);
    const z = spawnAt(w, P0, type, 960, 540);
    const victim = spawnAt(w, P1, 'raceUnit', 975, 540);
    sturdy(w, z);
    const t = runUntilGone(w, victim);
    expect(w.creatures.has(z), 'the killer is still standing — the victim fell to it').toBe(true);
    expect(raisedAt(w, t)).toBe(1);
  });

  it('⛔ NEGATIVE — a GOBLIN owned by the zombie seat kills the same soldier → nobody rises', () => {
    const w = match([{ race: 'zombies' }, { race: 'orcs' }]);
    const g = spawnAt(w, P0, 'goblinMelee', 960, 540);
    const victim = spawnAt(w, P1, 'raceUnit', 975, 540);
    sturdy(w, g);
    const t = runUntilGone(w, victim);
    expect(w.creatures.has(g)).toBe(true);
    expect(raisedAt(w, t)).toBe(0);
  });

  it('⛔ NEGATIVE — the seat took HP at the wave-1 draft (no perk) → the same soldier kill raises nobody', () => {
    const w = match([{ race: 'zombies' }, { race: 'orcs' }], 'hp');
    const z = spawnAt(w, P0, 'raceUnit', 960, 540);
    const victim = spawnAt(w, P1, 'raceUnit', 968, 540);
    sturdy(w, z);
    const t = runUntilGone(w, victim);
    expect(w.creatures.has(z)).toBe(true);
    expect(raisedAt(w, t)).toBe(0);
  });
});

describe('S196 THE RISEN — 2v2 (teams)', () => {
  const teams: Seat[] = [
    { race: 'zombies', team: 0 }, { race: 'vampires', team: 0 },
    { race: 'orcs', team: 1 }, { race: 'nagas', team: 1 },
  ];

  it('the roster teams land on the world, and an ENEMY-team kill through runHostTick raises one', () => {
    const w = match(teams);
    expect(w.teams).toEqual([0, 0, 1, 1]);
    const z = spawnAt(w, P0, 'raceUnit', 960, 540);
    const victim = spawnAt(w, P2, 'raceUnit', 968, 540);
    sturdy(w, z);
    const t = runUntilGone(w, victim);
    expect(w.creatures.has(z)).toBe(true);
    expect(raisedAt(w, t)).toBe(1);
  });

  it('⛔ NEGATIVE — a TEAMMATE\'s unit dying to a zombie blow raises nobody (R192-T1)', () => {
    const w = match(teams);
    const z = spawnAt(w, P0, 'raceUnit', 960, 540);
    const mate = spawnAt(w, P1, 'raceUnit', 968, 540);
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: mate }, 10_000, 'creature', { kind: 'creature', id: z }, 'physical');
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    expect(w.creatures.has(mate)).toBe(false);
    expect(risenOn(w, w.tick)).toHaveLength(0);
  });
});

describe('S196 THE RISEN — the perk as his match got it: the wave-1 draft, nobody clicking', () => {
  it('START_GAME opens the wave-1 draft; the DEADLINE auto-takes the racial for a zombie seat', () => {
    const w = makeWorld(0x5196);
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: 0, raceId: 'zombies' }, { seat: 1, color: 1, raceId: 'vampires' }],
    });
    expect(w.draft, 'the pre-wave-1 draft opens at the start edge').not.toBeNull();
    expect(seatHoldsPerk(w.players.get(P0)!, 'zombies.l0')).toBe(false);
    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i <= DRAFT_DEADLINE_TICKS + 2 && w.draft !== null; i++) runHostTick(w, deps, st);
    expect(w.draft).toBeNull();
    expect(w.players.get(P0)!.draftPicks).toEqual(['racial']);
    expect(seatHoldsPerk(w.players.get(P0)!, 'zombies.l0')).toBe(true);
  });

  it('a seat that CLICKS the general tile (CHOOSE_DRAFT hp) does not hold THE RISEN', () => {
    const w = makeWorld(0x5196);
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: 0, raceId: 'zombies' }, { seat: 1, color: 1, raceId: 'vampires' }],
    });
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'hp' });
    expect(w.players.get(P0)!.draftPicks).toEqual(['hp']);
    expect(seatHoldsPerk(w.players.get(P0)!, 'zombies.l0')).toBe(false);
  });

  it('a JOINER seat (seat 1) that never answers still gets THE RISEN from the host deadline', () => {
    const w = makeWorld(0x5196);
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: 0, raceId: 'orcs' }, { seat: 1, color: 1, raceId: 'zombies' }],
    });
    const deps = hostDeps();
    const st = makeHostTickState(w);
    for (let i = 0; i <= DRAFT_DEADLINE_TICKS + 2 && w.draft !== null; i++) runHostTick(w, deps, st);
    expect(seatHoldsPerk(w.players.get(P1)!, 'zombies.l0')).toBe(true);
  });
});

describe('S196 THE RISEN — across a NetSnapshot to the joiner', () => {
  it('the risen soldier (and the perk) appear on a joiner that applies the host snapshot', () => {
    const w = match([{ race: 'zombies' }, { race: 'vampires' }]);
    spawnAt(w, P0, 'raceUnit', 960, 540);
    const victim = spawnAt(w, P1, 'chewer', 970, 540);
    const t = runUntilGone(w, victim);
    const risen = risenOn(w, t).filter(() => !castleEmitsOnTick(0, t));
    expect(risen).toHaveLength(1);
    const msg = { kind: 'NETSNAPSHOT' as const, snapshotSeq: 1, snapshot: netSnapshot(w) };
    const wire = JSON.parse(JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer));
    const client = makeWorld(0);
    applyNetSnapshot(wire.snapshot, client);
    const onClient = client.creatures.get(risen[0]!);
    expect(onClient, 'the risen soldier must exist on the joiner').toBeDefined();
    expect(onClient!.type).toBe('raceUnit');
    expect(onClient!.ownerPlayerId).toBe(P0);
    expect(seatHoldsPerk(client.players.get(P0)!, 'zombies.l0')).toBe(true);
  });
});
