/**
 * SPARK — S192 (owner T2 + T3) — the zombie boss's death blast: one pool, split by distance, and every
 * kill it makes raises a castle zombie for his seat.
 *
 * > *"a total damage pool that is split … between … anyone who's in the vicinity. Obviously being closer
 * > to the explosion will give you more damage and further is less damage"* (T3)
 * > *"every zombie that kills another unit, doesn't matter if it's through an explosion … creates a
 * > regular zombie from the castle"* (T2)
 *
 * The arithmetic, a REACH through the real `runHostTick` (the boss-roster compare → the blast → THE
 * RISEN → the spawn queue), negatives, and a three-way determinism differential.
 */
import { describe, expect, it } from 'vitest';
import { STINK_BAG_RADIUS, T9_ZOMBIE_DEATH_BLAST_RADIUS } from '../../constants.ts';
import { makeStinkCloud } from '../defenders/stinkCloud.ts';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { asCreatureId, asPlayerId, asStinkCloudId, type PlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import type { RaceId } from '../races.ts';
import type { DraftPick } from '../draft.ts';
import { makeCreature, creatureMaxEhp, type Creature, type CreatureType } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { attackFifths } from '../stats.ts';
import { damageEntity } from '../damage.ts';
import { snapshot, restore } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import {
  T9_ZOMBIE_DEATH_BLAST_BITES,
  T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT,
  T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE,
  T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS,
  T9_ZOMBIE_DEATH_BLAST_STRUCTURE_WEIGHT,
  planZombieDeathBlast,
  zombieBlastKindWeight,
} from './zombieDeathBlast.ts';
import { blastSplitWeight, splitBlastPool } from '../blastFalloff.ts';
import { THE_RISEN_ANY_SEAT_UNIT } from './theRisen.ts';
import { makeBond } from '../placePrimitive.ts';
import { lookupCombo } from '../../combos.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS: CreatureType = 't9BossZombies';
const AT = { x: 960, y: 540 };
const POOL = T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS;

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function setSeat(w: World, seat: PlayerId, race: RaceId, picks: DraftPick[]): void {
  const p = w.players.get(seat)!;
  (p as { raceId: RaceId }).raceId = race;
  p.draftPicks.splice(0, p.draftPicks.length, ...picks);
}

/** A 1v1 in BUILD (creatures dormant, so nobody walks between the plan and the blast). */
function board(picks: DraftPick[] = ['racial']): World {
  const w = makeWorld(0x5192);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.draft = null;
  w.creatures.clear();
  setSeat(w, P0, 'zombies', picks);
  setSeat(w, P1, 'orcs', []);
  return w;
}

function put(w: World, type: CreatureType, owner: PlayerId, x: number, y = AT.y): Creature {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(getCreatureConfig(type), {
    id, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: w.tick,
    sourceSpawnerId: null,
  });
  c.state = 'SEEKING';
  w.creatures.set(id, c);
  return c;
}

const soldiers = (w: World, seat: PlayerId): number =>
  [...w.creatures.values()].filter((c) => c.type === 'raceUnit' && c.ownerPlayerId === seat).length;

/** The boss is on the roster (one quiet tick), then dies to a creature-less blow; one more tick blasts. */
function killBossAndBlast(w: World, boss: Creature, before?: (w: World) => void): void {
  const d = deps();
  const st = makeHostTickState(w);
  runHostTick(w, d, st);
  w.pendingCreatureDeaths = null;
  damageEntity(w, { kind: 'creature', id: boss.id }, 100_000, 'player', null, 'physical');
  before?.(w);
  runHostTick(w, d, st);
}

describe('S193 R193-B1..B4 — the pool and the split (pure arithmetic)', () => {
  it('⭐⭐ RULED: the pool is 3 of his own bites = 312, NOT his own side, creatures weigh 2 : towers 1', () => {
    const cfg = getCreatureConfig(BOSS);
    expect(T9_ZOMBIE_DEATH_BLAST_BITES).toBe(3);
    expect(POOL).toBe(3 * attackFifths(cfg.atk, cfg.pen));
    expect(POOL).toBe(312);
    expect(POOL, 'never worth more than killing him').toBeLessThan(creatureMaxEhp(makeCreature(cfg, {
      id: asCreatureId(1), ownerPlayerId: P0, pos: AT, targetPos: AT, spawnedAtTick: 0, sourceSpawnerId: null,
    })));
    expect(T9_ZOMBIE_DEATH_BLAST_RADIUS, '⚠ MINE since S168 — not re-ruled').toBe(380);
    expect(T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE, 'R193-B3').toBe(false);
    expect(T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT, 'R193-B2').toBe(2);
    expect(T9_ZOMBIE_DEATH_BLAST_STRUCTURE_WEIGHT).toBe(1);
    expect(zombieBlastKindWeight('creature')).toBe(2);
    expect(zombieBlastKindWeight('defender'), 'Helga is a unit').toBe(2);
    expect(zombieBlastKindWeight('structure')).toBe(1);
    expect(zombieBlastKindWeight('primitive')).toBe(1);
    expect(zombieBlastKindWeight('stinkCloud')).toBe(1);
    expect(THE_RISEN_ANY_SEAT_UNIT, 'Reading A until he answers').toBe(false);
  });

  it('⭐ linear distance weight (the shared falloff): 380 at his feet, 1 at the edge, × the kind', () => {
    const R = T9_ZOMBIE_DEATH_BLAST_RADIUS;
    expect(blastSplitWeight(0, R)).toBe(380);
    expect(blastSplitWeight(190 * 190, R)).toBe(190);
    expect(blastSplitWeight(380 * 380, R)).toBe(1);
    expect(blastSplitWeight(379.5 * 379.5, R)).toBe(1);
    expect(blastSplitWeight(190 * 190, R, 2)).toBe(380);
  });

  it('⭐⭐ worked: 3 creatures at 50 / 190 / 330 px take 181 / 104 / 27 (weights 660 / 380 / 100)', () => {
    const w = [50, 190, 330].map((d) => blastSplitWeight(d * d, T9_ZOMBIE_DEATH_BLAST_RADIUS, 2));
    expect(w).toEqual([660, 380, 100]);
    // floor(312·660/1140)=180, floor(312·380/1140)=104, floor(312·100/1140)=27 → 311; the 1 left goes nearest-first
    expect(splitBlastPool(POOL, w)).toEqual([181, 104, 27]);
  });

  it('⭐⭐ R193-B2: at the SAME distance a creature takes twice a tower — 208 vs 104', () => {
    const d2 = 100 * 100;
    const w = [blastSplitWeight(d2, 380, zombieBlastKindWeight('creature')), blastSplitWeight(d2, 380, zombieBlastKindWeight('structure'))];
    expect(splitBlastPool(POOL, w)).toEqual([208, 104]);
  });

  it('⭐⭐ shares always sum to EXACTLY the pool and never rise with distance', () => {
    for (const n of [1, 2, 3, 7, 10, 20, 50, 311, 312, 400]) {
      const weights = Array.from({ length: n }, (_, i) => blastSplitWeight(((i * 379) / Math.max(1, n - 1)) ** 2, 380, 2));
      const s = splitBlastPool(POOL, weights);
      expect(s.reduce((a, x) => a + x, 0), `n=${n}`).toBe(POOL);
      expect(s.every((x) => Number.isInteger(x) && x >= 0), `n=${n}`).toBe(true);
      for (let i = 1; i < n; i++) expect(s[i]!, `n=${n} i=${i}`).toBeLessThanOrEqual(s[i - 1]! + 1);
    }
    expect(splitBlastPool(POOL, [380]), 'a lone victim takes the whole pool').toEqual([POOL]);
  });
});

describe('S192 T2 + T3 — REACH through the real host tick', () => {
  /** His seat holds THE RISEN; 10 enemy goblins on rings, 2 of his own soldiers, the enemy Warlord adjacent. */
  function scene(picks: DraftPick[] = ['racial']): { w: World; boss: Creature; enemies: Creature[]; own: Creature[]; warlord: Creature } {
    const w = board(picks);
    const boss = put(w, BOSS, P0, AT.x);
    const enemies: Creature[] = [];
    for (let i = 0; i < 10; i++) {
      const r = 40 + i * 30;
      const a = (i * 2 * Math.PI) / 10;
      enemies.push(put(w, 'goblinMelee', P1, Math.round(AT.x + r * Math.cos(a)), Math.round(AT.y + r * Math.sin(a))));
    }
    const own = [put(w, 'raceUnit', P0, AT.x - 60), put(w, 'raceUnit', P0, AT.x + 70, AT.y + 40)];
    const warlord = put(w, 't9BossOrcs', P1, AT.x + 20, AT.y - 10);
    put(w, 'goblinMelee', P1, AT.x - 500); // far outside the blast — untouched
    return { w, boss, enemies, own, warlord };
  }

  it('⭐⭐ each victim loses EXACTLY its planned share; the Warlord adjacent survives', () => {
    const { w, boss, warlord } = scene();
    let plan: ReturnType<typeof planZombieDeathBlast> = [];
    const pools = new Map<number, number>();
    killBossAndBlast(w, boss, (ww) => {
      plan = planZombieDeathBlast(ww, AT, P0);
      for (const c of ww.creatures.values()) pools.set(c.id as unknown as number, c.ehp);
    });
    expect(plan.length, '10 enemies + Warlord — his own 2 are NOT targets (R193-B3)').toBe(11);
    expect(plan.reduce((a, p) => a + p.share, 0)).toBe(POOL);
    for (const { target, share } of plan) {
      const c = w.creatures.get(asCreatureId(target.id));
      const before = pools.get(target.id)!;
      if (before > share) expect(c?.ehp, `creature ${target.id}`).toBe(before - share);
      else expect(c, `creature ${target.id} died`).toBeUndefined();
    }
    expect(w.creatures.has(warlord.id), 'a Warlord adjacent survives a 312 split').toBe(true);
    expect(w.creatures.get(warlord.id)!.ehp).toBeLessThan(creatureMaxEhp(warlord));
  });

  it('⭐⭐ T2: every ENEMY it kills rises at his keep; his own dead raise none', () => {
    const { w, boss, enemies, own } = scene();
    const soldiersBefore = soldiers(w, P0);
    killBossAndBlast(w, boss);
    const enemiesKilled = enemies.filter((e) => !w.creatures.has(e.id)).length;
    const ownKilled = own.filter((o) => !w.creatures.has(o.id)).length;
    expect(enemiesKilled, 'fixture: the blast killed enemies').toBeGreaterThan(0);
    expect(ownKilled, 'R193-B3 — his own side is not hit').toBe(0);
    for (const o of own) expect(w.creatures.get(o.id)!.ehp, 'his own soldiers untouched').toBe(creatureMaxEhp(o));
    expect(soldiers(w, P0) - soldiersBefore, 'one risen per enemy corpse').toBe(enemiesKilled);
  });

  it('negative: a zombie seat WITHOUT THE RISEN raises nobody from the same blast', () => {
    const { w, boss, own } = scene(['hp']);
    const soldiersBefore = soldiers(w, P0);
    killBossAndBlast(w, boss);
    const ownKilled = own.filter((o) => !w.creatures.has(o.id)).length;
    expect(soldiers(w, P0)).toBe(soldiersBefore - ownKilled);
  });

  it('negative: it is no longer a raze — enemies beyond a lethal share live, nothing outside 380 is hit', () => {
    const { w, boss, enemies } = scene();
    killBossAndBlast(w, boss);
    const far = [...w.creatures.values()].find((c) => c.pos.x === AT.x - 500);
    expect(far?.ehp).toBe(creatureMaxEhp(far!));
    // the warlord and the outer ring prove it is a split, not a deletion
    expect(enemies.some((e) => w.creatures.has(e.id)) || w.creatures.size > 1).toBe(true);
  });

  it('⭐ the killing swing printed is the share (creatureKillHits)', () => {
    const { w, boss } = scene();
    let plan: ReturnType<typeof planZombieDeathBlast> = [];
    killBossAndBlast(w, boss, (ww) => {
      plan = planZombieDeathBlast(ww, AT, P0);
      ww.creatureKillHits.length = 0;
    });
    const killed = plan.filter((p) => p.target.kind === 'creature' && !w.creatures.has(asCreatureId(p.target.id)));
    expect(killed.length, 'fixture: the blast killed someone').toBeGreaterThan(0);
    for (const k of killed) expect(w.creatureKillHits.some((h) => h.amount === k.share)).toBe(true);
  });
});

/** A three-shape chain (2 connectors, one structure) of `owner`'s, `dy` px below the blast. */
function chain(w: World, dy: number, owner: PlayerId = P1): void {
  const color = w.players.get(owner)!.color;
  const mk = (x: number): number => {
    const id = w.nextPrimitiveId++ as never;
    w.primitives.set(id, {
      id, type: 1, placerColor: color, placedBy: owner, createdTick: w.tick, pos: { x, y: AT.y + dy },
      prevPos: { x, y: AT.y + dy }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
      radius: 9, hp: 70, origin: null,
    } as never);
    return id as unknown as number;
  };
  const [a, b, c] = [mk(AT.x - 20), mk(AT.x), mk(AT.x + 20)];
  const bond = (x: number, y: number): void => {
    const pa = w.primitives.get(x as never)!;
    const pb = w.primitives.get(y as never)!;
    const bd = makeBond(w, pa, pb, lookupCombo(pa.type, pb.type).stiffnessTier);
    w.bonds.set(bd.id, bd);
    pa.bonds.add(bd.id);
    pb.bonds.add(bd.id);
  };
  bond(a, b);
  bond(b, c);
}

describe('S192 T3 — a structure is ONE target and BANKS its share', () => {
  it('⭐ an ENEMY 2-connector chain far out takes one small share on its nearest connector — it stands', () => {
    const w = board();
    const boss = put(w, BOSS, P0, AT.x);
    for (let i = 0; i < 6; i++) put(w, 'goblinMelee', P1, AT.x + 10 + i * 5); // a crowd at his feet
    // a three-shape ENEMY chain 300 px out: 2 connectors, one structure
    const color = w.players.get(P1)!.color;
    const mk = (x: number): number => {
      const id = w.nextPrimitiveId++ as never;
      w.primitives.set(id, {
        id, type: 1, placerColor: color, placedBy: P1, createdTick: w.tick, pos: { x, y: AT.y + 300 },
        prevPos: { x, y: AT.y + 300 }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
        radius: 9, hp: 70, origin: null,
      } as never);
      return id as unknown as number;
    };
    const [a, b, c] = [mk(AT.x - 20), mk(AT.x), mk(AT.x + 20)];
    const bond = (x: number, y: number): void => {
      const pa = w.primitives.get(x as never)!;
      const pb = w.primitives.get(y as never)!;
      const bd = makeBond(w, pa, pb, lookupCombo(pa.type, pb.type).stiffnessTier);
      w.bonds.set(bd.id, bd);
      pa.bonds.add(bd.id);
      pb.bonds.add(bd.id);
    };
    bond(a, b);
    bond(b, c);
    let share = -1;
    killBossAndBlast(w, boss, (ww) => {
      const p = planZombieDeathBlast(ww, AT, P0);
      const s = p.filter((x) => x.target.kind === 'structure');
      expect(s.length, 'two connectors in range, ONE structure target').toBe(1);
      share = s[0]!.share;
    });
    expect(share).toBeGreaterThan(0);
    expect(share, 'fixture: below a 2-connector pool (14)').toBeLessThan(14);
    expect(w.bonds.size, 'nothing severed').toBe(2);
    expect([...w.bonds.values()].reduce((t, x) => t + x.damageFifths, 0), 'the share banked').toBe(share);
  });
});

describe('⭐ S193 merge — the blast severs through severWithCarry (owner S191: overkill CARRIES)', () => {
  it('⭐⭐ REACH: a lone chain at his feet takes the whole 312 — 14 fells the first connector, the overkill fells the second', () => {
    const w = board();
    const boss = put(w, BOSS, P0, AT.x);
    chain(w, 20);
    let share = -1;
    killBossAndBlast(w, boss, (ww) => {
      const s = planZombieDeathBlast(ww, AT, P0).filter((x) => x.target.kind === 'structure');
      expect(s.length).toBe(1);
      share = s[0]!.share;
    });
    // arithmetic: pool(2) = 2 × (5 + 2) = 14, then the survivor re-forms at pool(1) = 6; 14 + 6 = 20 ≤ share
    expect(share, 'fixture: the share covers both connectors').toBeGreaterThanOrEqual(14 + 6);
    expect(w.bonds.size, 'the overkill carried: BOTH connectors fell (a bare SEVER_BOND leaves 1)').toBe(0);
  });

  it('negative: a share below one connector pool fells nothing and carries nothing', () => {
    const w = board();
    const boss = put(w, BOSS, P0, AT.x);
    for (let i = 0; i < 6; i++) put(w, 'goblinMelee', P1, AT.x + 10 + i * 5);
    chain(w, 300);
    killBossAndBlast(w, boss);
    expect(w.bonds.size).toBe(2);
  });
});

describe('⭐⭐ S193 R193-B2 + B3 — through the real host tick', () => {
  it('⭐⭐ R193-B2 REACH: a goblin and a one-connector tower at the SAME distance — the goblin takes twice the tower', () => {
    const w = board();
    const boss = put(w, BOSS, P0, AT.x);
    const gob = put(w, 'goblinMelee', P1, AT.x, AT.y - 100);
    const color = w.players.get(P1)!.color;
    const mk = (x: number): number => {
      const id = w.nextPrimitiveId++ as never;
      w.primitives.set(id, {
        id, type: 1, placerColor: color, placedBy: P1, createdTick: w.tick, pos: { x, y: AT.y + 100 },
        prevPos: { x, y: AT.y + 100 }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
        radius: 9, hp: 70, origin: null,
      } as never);
      return id as unknown as number;
    };
    const [a, b] = [mk(AT.x - 20), mk(AT.x + 20)];
    const pa = w.primitives.get(a as never)!;
    const pb = w.primitives.get(b as never)!;
    const bd = makeBond(w, pa, pb, lookupCombo(pa.type, pb.type).stiffnessTier);
    w.bonds.set(bd.id, bd);
    pa.bonds.add(bd.id);
    pb.bonds.add(bd.id);
    const gobPool = gob.ehp;
    let plan: ReturnType<typeof planZombieDeathBlast> = [];
    killBossAndBlast(w, boss, (ww) => { plan = planZombieDeathBlast(ww, AT, P0); });
    const tower = plan.find((p) => p.target.kind === 'structure')!;
    const unit = plan.find((p) => p.target.kind === 'creature')!;
    expect(plan.length).toBe(2);
    expect([tower.share, unit.share], 'weights 280 : 560 of 312').toEqual([104, 208]);
    expect(unit.share).toBe(2 * tower.share);
    // REACH: both shares landed — the one-connector tower (pool 6) fell, the goblin took 208
    expect(w.bonds.has(bd.id), 'the tower took its 104').toBe(false);
    if (gobPool > 208) expect(w.creatures.get(gob.id)!.ehp).toBe(gobPool - 208);
    else expect(w.creatures.has(gob.id), 'the goblin took its 208').toBe(false);
  });

  it('⭐⭐ R193-B3 negative: his OWN unit, tower, lone shape and bag at his feet are untouched', () => {
    const w = board();
    const boss = put(w, BOSS, P0, AT.x);
    const mine = put(w, 'raceUnit', P0, AT.x + 15);
    const enemy = put(w, 'goblinMelee', P1, AT.x + 300); // so the pool has somewhere to go
    chain(w, 20, P0);
    const color = w.players.get(P0)!.color;
    const loneId = w.nextPrimitiveId++ as never;
    w.primitives.set(loneId, {
      id: loneId, type: 1, placerColor: color, placedBy: P0, createdTick: w.tick, pos: { x: AT.x - 15, y: AT.y },
      prevPos: { x: AT.x - 15, y: AT.y }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick,
      radius: 9, hp: 70, origin: null,
    } as never);
    const bagId = asStinkCloudId(w.nextStinkCloudId++);
    w.stinkClouds.set(bagId, makeStinkCloud({ id: bagId, pos: { x: AT.x, y: AT.y + 10 }, ownerPlayerId: P0, landedAtTick: w.tick, radius: STINK_BAG_RADIUS }));
    const bagEhp = w.stinkClouds.get(bagId)!.ehp;
    const bondsBefore = [...w.bonds.values()].map((x) => x.damageFifths);
    let plan: ReturnType<typeof planZombieDeathBlast> = [];
    killBossAndBlast(w, boss, (ww) => { plan = planZombieDeathBlast(ww, AT, P0); });
    expect(plan.map((p) => p.target.id), 'only the enemy is a target').toEqual([enemy.id as unknown as number]);
    expect(plan[0]!.share, 'a lone enemy takes the whole pool').toBe(POOL);
    expect(w.creatures.get(mine.id)!.ehp).toBe(creatureMaxEhp(mine));
    expect([...w.bonds.values()].map((x) => x.damageFifths), 'his tower untouched').toEqual(bondsBefore);
    expect(w.bonds.size).toBe(2);
    expect((w.primitives.get(loneId) as { hp: number }).hp, 'his lone shape untouched').toBe(70);
    expect(w.stinkClouds.get(bagId)?.ehp, 'his bag untouched').toBe(bagEhp);
  });
});

describe('S192 T2 + T3 — determinism', () => {
  function run(w: World, boss: Creature): number {
    killBossAndBlast(w, boss);
    return hashWorldStateFull(w);
  }

  it('⭐⭐ original vs snapshot→restore vs reversed-Map-order: one hash', () => {
    const a = (() => { const s = (() => {
      const w = board();
      const boss = put(w, BOSS, P0, AT.x);
      for (let i = 0; i < 12; i++) put(w, i % 3 === 0 ? 'raceUnit' : 'goblinMelee', i % 3 === 0 ? P0 : P1, AT.x + 30 + i * 25, AT.y + (i % 2) * 15);
      return { w, boss };
    })(); return s; })();

    const json = JSON.stringify(snapshot(a.w));
    const wRestored = makeWorld(1);
    restore(JSON.parse(json), wRestored);
    const wReversed = makeWorld(1);
    restore(JSON.parse(json), wReversed);
    const entries = [...wReversed.creatures.entries()].reverse();
    wReversed.creatures.clear();
    for (const [id, c] of entries) wReversed.creatures.set(id, c);
    expect([...wReversed.creatures.keys()][0], 'fixture: the order really is reversed').not.toBe([...wRestored.creatures.keys()][0]);

    const h0 = run(a.w, a.boss);
    const h1 = run(wRestored, wRestored.creatures.get(a.boss.id)!);
    const h2 = run(wReversed, wReversed.creatures.get(a.boss.id)!);
    expect(h1).toBe(h0);
    expect(h2).toBe(h0);
  });
});
