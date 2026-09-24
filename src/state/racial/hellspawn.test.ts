/**
 * SPARK — S188 — HELLSPAWN (`demons.l5`): the arithmetic, Council A2's termination proof, the four
 * sites of `Creature.hellspawnGen`, the negatives, and the REACH through the real host tick.
 * The host-vs-worker proof lives in `racialB.differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { CHEWER_ATK, CHEWER_PEN, PRIMITIVE_MAX_HP, SPARK_VISUAL_SIZE, SparkType, phaseDurationTicks } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Controls } from '../../input/controls.ts';
import {
  asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type CreatureId, type PlayerId,
} from '../../types.ts';
import { creatureMaxEhp, type CreatureType } from '../creatures/creature.ts';
import { sweepDeferredDeaths } from '../creatures/creatureLifecycle.ts';
import { damageEntity } from '../damage.ts';
import type { DraftPick } from '../draft.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import type { RaceId } from '../races.ts';
import { mulberry32 } from '../rng.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from '../save.ts';
import { attackFifths } from '../stats.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import {
  HELLSPAWN_CHILDREN,
  HELLSPAWN_MAX_GEN,
  HELLSPAWN_PCT_BY_GEN,
  floorAtOnePct,
  hellspawnChildPool,
  hellspawnStrikeFifths,
} from './hellspawn.ts';
import { drainRacialSpawnQueue, pendingRacialSpawns } from './racialTick.ts';

const P0 = asPlayerId(0); // the demon seat
const P1 = asPlayerId(1);
const PENTAGRAM = asSpawnerId(40);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(race: RaceId = 'demons', picks: DraftPick[] = ['hp', 'racial']): World {
  const w = makeWorld(0x5190);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = race;
  w.players.get(P0)!.draftPicks = [...picks];
  w.players.get(P1)!.raceId = 'vampires';
  return w;
}

function spawnAt(w: World, owner: PlayerId, type: CreatureType, x: number, y: number): CreatureId {
  const id = w.nextCreatureId as unknown as CreatureId;
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: PENTAGRAM,
  });
  if (!w.creatures.has(id)) throw new Error(`fixture: ${type} did not spawn`);
  return id;
}

/** One strike batch by hand, in `runHostTick`'s order: open, strike, sweep, drain. */
function killAll(w: World, ids: readonly CreatureId[], blowsEach = 1): void {
  w.pendingCreatureDeaths = new Set();
  for (const id of ids) {
    for (let b = 0; b < blowsEach; b++) damageEntity(w, { kind: 'creature', id }, 999, 'aura', null);
  }
  sweepDeferredDeaths(w, w.pendingCreatureDeaths);
  w.pendingCreatureDeaths = null;
  drainRacialSpawnQueue(w);
}

const chewersOf = (w: World, owner: PlayerId = P0) =>
  [...w.creatures.values()].filter((c) => c.type === 'chewer' && c.ownerPlayerId === owner);

describe('HELLSPAWN — the arithmetic, on the one ladder', () => {
  it('his numbers: two children, 50 % then 25 %, and the chain stops at generation 2', () => {
    expect(HELLSPAWN_CHILDREN).toBe(2);
    expect(HELLSPAWN_PCT_BY_GEN).toEqual({ 0: 100, 1: 50, 2: 25 });
    expect(HELLSPAWN_MAX_GEN).toBe(2);
  });

  it('a pencil chewer’s strike 7 → 3 → 1, and its pool 5 → 2 → 1 (floor-at-one)', () => {
    const strike = attackFifths(CHEWER_ATK, CHEWER_PEN);
    expect(strike).toBe(7);
    expect(hellspawnStrikeFifths({}, strike)).toBe(7);
    expect(hellspawnStrikeFifths({ hellspawnGen: 1 }, strike)).toBe(3);
    expect(hellspawnStrikeFifths({ hellspawnGen: 2 }, strike)).toBe(1);
    expect(hellspawnChildPool(5)).toBe(2);
    expect(hellspawnChildPool(2)).toBe(1);
  });

  it('⛔ A2 — floor-at-one: no pool and no strike can ever be 0', () => {
    for (let base = 1; base <= 40; base++) {
      expect(hellspawnChildPool(base)).toBeGreaterThanOrEqual(1);
      expect(floorAtOnePct(base, 25)).toBeGreaterThanOrEqual(1);
      expect(hellspawnStrikeFifths({ hellspawnGen: 2 }, base)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('HELLSPAWN — one death, two children, and the chain ENDS (Council A2)', () => {
  it('a demon chewer dies: two generation-1 chewers at the death spot, pool ½ of the parent', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    const parentPool = creatureMaxEhp(w.creatures.get(parent)!);
    killAll(w, [parent]);
    const kids = chewersOf(w);
    expect(kids).toHaveLength(2);
    for (const k of kids) {
      expect(k.hellspawnGen).toBe(1);
      expect(creatureMaxEhp(k)).toBe(hellspawnChildPool(parentPool));
      expect(k.ehp).toBe(hellspawnChildPool(parentPool));
      expect(Math.hypot(k.pos.x - 900, k.pos.y - 500)).toBeLessThanOrEqual(18 + 1e-6);
      expect(k.sourceSpawnerId).toBe(PENTAGRAM); // the spawner path, never the null latch
    }
    expect(kids[0]!.pos).not.toEqual(kids[1]!.pos); // spread by id, not stacked on one pixel
  });

  it('⛔ A2 — a generation-2 death spawns NOTHING', () => {
    const w = fightWorld();
    const g2 = spawnAt(w, P0, 'chewer', 900, 500);
    w.creatures.get(g2)!.hellspawnGen = 2;
    killAll(w, [g2]);
    expect(chewersOf(w)).toHaveLength(0);
    expect(pendingRacialSpawns(w)).toBe(0);
  });

  it('⛔ A2 — killing everything, round after round, one chewer yields EXACTLY 6 descendants and stops', () => {
    const w = fightWorld();
    const root = spawnAt(w, P0, 'chewer', 900, 500);
    const seen = new Set<CreatureId>([root]);
    const byGen = { 1: 0, 2: 0 };
    let rounds = 0;
    for (; rounds < 10; rounds++) {
      const live = chewersOf(w);
      if (live.length === 0) break;
      for (const c of live) {
        expect(creatureMaxEhp(c), 'every pool is at least 1').toBeGreaterThanOrEqual(1);
        expect(hellspawnStrikeFifths(c, attackFifths(CHEWER_ATK, CHEWER_PEN)), 'every strike is at least 1')
          .toBeGreaterThanOrEqual(1);
        if (!seen.has(c.id)) {
          seen.add(c.id);
          byGen[c.hellspawnGen as 1 | 2]++;
        }
      }
      killAll(w, live.map((c) => c.id));
    }
    expect(rounds, 'three generations die, then the board is empty').toBe(3);
    expect(seen.size - 1, 'at most 6 descendants from one chewer').toBe(6);
    expect(byGen).toEqual({ 1: 2, 2: 4 });
    expect(pendingRacialSpawns(w)).toBe(0);
  });

  it('⛔ two lethal blows on ONE chewer in one tick split it ONCE (two children, not four)', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    killAll(w, [parent], 2);
    expect(chewersOf(w)).toHaveLength(2);
  });

  it('A5 — the children are QUEUED during the batch and born only after the sweep', () => {
    const w = fightWorld();
    const parent = spawnAt(w, P0, 'chewer', 900, 500);
    w.pendingCreatureDeaths = new Set();
    damageEntity(w, { kind: 'creature', id: parent }, 999, 'aura', null);
    expect(chewersOf(w)).toHaveLength(1); // the corpse-in-waiting, nothing new
    expect(pendingRacialSpawns(w)).toBe(1);
    sweepDeferredDeaths(w, w.pendingCreatureDeaths);
    w.pendingCreatureDeaths = null;
    drainRacialSpawnQueue(w);
    expect(chewersOf(w)).toHaveLength(2);
  });
});

describe('HELLSPAWN — a child hits for its generation, through the real strike', () => {
  /** Two enemy shapes and one connector (structure pool 6) with a demon chewer committed to it. */
  function chewerOnAConnector(gen: 1 | 2 | undefined): { w: World; bond: BondId } {
    const w = fightWorld();
    const pl = w.players.get(P1)!;
    const mk = (x: number) => {
      const id = asPrimitiveId(w.nextPrimitiveId++);
      w.primitives.set(id, {
        id, type: SparkType.Triangle, placerColor: pl.color, placedBy: P1, createdTick: w.tick,
        pos: { x, y: 500 }, prevPos: { x, y: 500 }, bonds: new Set(), ownerColor: pl.color,
        lastOwnershipChange: w.tick, hp: PRIMITIVE_MAX_HP,
        radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Triangle] * 0.45), origin: null,
      });
      return w.primitives.get(id)!;
    };
    const a = mk(1000);
    const b = mk(1040);
    const bond = asBondId(w.nextBondId++);
    w.bonds.set(bond, {
      id: bond, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID',
      createdTick: w.tick, damageFifths: 0,
    });
    a.bonds.add(bond);
    b.bonds.add(bond);
    const id = spawnAt(w, P0, 'chewer', 1020, 510);
    const c = w.creatures.get(id)!;
    if (gen !== undefined) c.hellspawnGen = gen;
    c.state = 'ATTACKING';
    c.targetBondId = bond;
    dispatch(w, { type: 'CREATURE_ATTACK', creatureId: id, bondId: bond });
    return { w, bond };
  }

  it('an ordinary chewer’s 7 fells the 6-pool connector; a generation-1 child’s 3 does not', () => {
    expect(chewerOnAConnector(undefined).w.bonds.size).toBe(0);
    const { w, bond } = chewerOnAConnector(1);
    expect(w.bonds.get(bond)?.damageFifths).toBe(3);
  });

  it('a generation-2 grandchild lands 1', () => {
    const { w, bond } = chewerOnAConnector(2);
    expect(w.bonds.get(bond)?.damageFifths).toBe(1);
  });
});

describe('HELLSPAWN — negatives: nobody else splits', () => {
  const noSplit = (w: World, owner: PlayerId, type: CreatureType = 'chewer'): void => {
    const id = spawnAt(w, owner, type, 900, 500);
    const before = w.creatures.size;
    killAll(w, [id]);
    expect(w.creatures.has(id)).toBe(false);
    expect(w.creatures.size).toBe(before - 1);
    expect(pendingRacialSpawns(w)).toBe(0);
  };

  it('a demon seat WITHOUT the level-5 perk', () => noSplit(fightWorld('demons', ['hp', 'def']), P0));
  it('a demon seat with only the LEVEL-0 racial', () => noSplit(fightWorld('demons', ['racial', 'hp']), P0));
  it('a seat of ANOTHER race holding its level-5 racial', () => noSplit(fightWorld('zombies', ['hp', 'racial']), P0));
  it('the ENEMY seat’s chewer', () => noSplit(fightWorld(), P1));
  it('a demon creature that is not a chewer (its soldier, its soul-eater)', () => {
    noSplit(fightWorld(), P0, 'raceUnit');
    noSplit(fightWorld(), P0, 't3Souleater');
  });
  it('⚠ MINE — a chewer that AGES OUT is not killed and does not split', () => {
    const w = fightWorld();
    const id = spawnAt(w, P0, 'chewer', 900, 500);
    w.tick = w.creatures.get(id)!.despawnAtTick;
    dispatch(w, { type: 'CREATURE_TICK', creatureId: id });
    drainRacialSpawnQueue(w);
    expect(w.creatures.has(id)).toBe(false);
    expect(chewersOf(w)).toHaveLength(0);
  });
});

describe('HELLSPAWN — Creature.hellspawnGen, the four sites', () => {
  const withChild = (gen: 1 | 2): { w: World; id: CreatureId } => {
    const w = fightWorld();
    const id = spawnAt(w, P0, 'chewer', 900, 500);
    const c = w.creatures.get(id)!;
    c.hellspawnGen = gen;
    c.maxEhp = 2;
    c.ehp = 2;
    return { w, id };
  };

  it('HASH: the generation moves the wide hash, and 1 and 2 hash differently', () => {
    const w = fightWorld();
    const id = spawnAt(w, P0, 'chewer', 900, 500);
    const none = hashWorldStateFull(w);
    w.creatures.get(id)!.hellspawnGen = 1;
    const one = hashWorldStateFull(w);
    w.creatures.get(id)!.hellspawnGen = 2;
    const two = hashWorldStateFull(w);
    expect(one).not.toBe(none);
    expect(two).not.toBe(one);
  });

  it('SAVE: generation and pool survive snapshot → restore (worker INIT, host migration)', () => {
    const { w, id } = withChild(1);
    const dst = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), dst);
    const c = dst.creatures.get(id)!;
    expect(c.hellspawnGen).toBe(1);
    expect(creatureMaxEhp(c)).toBe(2);
    expect(c.ehp).toBe(2);
  });

  it('WIRE: survives netSnapshot → applyNetSnapshot (the renderer derives the look from it)', () => {
    const { w, id } = withChild(2);
    const dst = makeWorld(1);
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), dst);
    expect(dst.creatures.get(id)!.hellspawnGen).toBe(2);
  });

  it('WIRE: an ordinary chewer carries no field, and a bogus generation is dropped, never trusted', () => {
    const w = fightWorld();
    const id = spawnAt(w, P0, 'chewer', 900, 500);
    const snap = JSON.parse(JSON.stringify(netSnapshot(w)));
    expect(JSON.stringify(snap)).not.toContain('hellspawnGen');
    snap.creatures.find((c: { id: number }) => c.id === (id as unknown as number)).hellspawnGen = 3;
    const dst = makeWorld(1);
    applyNetSnapshot(snap, dst);
    expect(dst.creatures.get(id)!.hellspawnGen).toBeUndefined();
  });
});

describe('HELLSPAWN — REACH: the enemy castle gun kills a demon chewer in a real host tick', () => {
  it('with the perk: the tick it dies, two generation-1 chewers stand where it fell', () => {
    const w = fightWorld();
    const a = castleAnchor(1, w.layout);
    const dx = 960 - a.x;
    const dy = 540 - a.y;
    const d = Math.hypot(dx, dy);
    const at = { x: a.x + (dx / d) * 120, y: a.y + (dy / d) * 120 };
    const id = spawnAt(w, P0, 'chewer', at.x, at.y);
    const deps = hostDeps();
    const state = makeHostTickState(w);
    let deathTick = -1;
    let deathPos = { x: 0, y: 0 };
    for (let i = 0; i < 1200 && deathTick < 0; i++) {
      const c = w.creatures.get(id);
      if (c !== undefined) deathPos = { x: c.pos.x, y: c.pos.y };
      runHostTick(w, deps, state);
      if (!w.creatures.has(id)) deathTick = w.tick;
    }
    expect(deathTick, 'the castle gun must kill the chewer').toBeGreaterThan(0);
    const kids = chewersOf(w);
    expect(kids).toHaveLength(2);
    for (const k of kids) {
      expect(k.hellspawnGen).toBe(1);
      expect(k.spawnedAtTick).toBe(deathTick);
      expect(Math.hypot(k.pos.x - deathPos.x, k.pos.y - deathPos.y)).toBeLessThanOrEqual(18 + 10);
    }
    // …and the whole chain still ends on the real tick: run on and count every demon chewer ever seen.
    const ever = new Set<CreatureId>([id, ...kids.map((k) => k.id)]);
    for (let i = 0; i < 4000 && chewersOf(w).length > 0; i++) {
      runHostTick(w, deps, state);
      for (const c of chewersOf(w)) ever.add(c.id);
    }
    expect(ever.size - 1, 'never more than 6 descendants').toBeLessThanOrEqual(6);
  });

  it('without the perk: the same shot kills it and nothing takes its place', () => {
    const w = fightWorld('demons', ['hp', 'hp']);
    const a = castleAnchor(1, w.layout);
    const dx = 960 - a.x;
    const dy = 540 - a.y;
    const d = Math.hypot(dx, dy);
    const id = spawnAt(w, P0, 'chewer', a.x + (dx / d) * 120, a.y + (dy / d) * 120);
    const deps = hostDeps();
    const state = makeHostTickState(w);
    for (let i = 0; i < 1200 && w.creatures.has(id); i++) runHostTick(w, deps, state);
    expect(w.creatures.has(id)).toBe(false);
    expect(chewersOf(w)).toHaveLength(0);
  });
});
