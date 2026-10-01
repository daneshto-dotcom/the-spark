/**
 * SPARK — ⭐ S193 BLAST-2: **AREA DAMAGE IS CREDITED TO THE SEAT THAT CAUSED IT.**
 *
 * Until this, five sources dealt their damage with a `null` attacker, so the end-of-match stat board
 * recorded it as TAKEN by the victim and DEALT by nobody: the lightning hub's ladder blast, SCORCHED
 * GROUND / SCORCHED EARTH, a POWER OF RA column (the perk AND the Pharaoh boss's), and — because
 * `severWithCarry` re-applied the overkill with no attacker — every fifth the carry felled, whoever
 * struck. Each now names `{ kind: 'seat' }`, which turns, heals and raises nobody (retaliation,
 * lifesteal and THE RISEN read `kind === 'creature'`), so the board is the only thing that moves.
 *
 * ⛔ REACH, NOT TEXT: the census tests (`damage.callSites`, `damageConnector.callSites`) prove each
 * site NAMES a seat; these drive the real host tick (or the real reducer, for the raid, which is a
 * dispatched player action) and read the credit off `world.matchStats`. Every case also checks
 * conservation — what the seat was credited equals what its victims lost — so a credit that landed on
 * the wrong seat cannot pass by being non-zero.
 */
import { describe, expect, it } from 'vitest';
import {
  LIGHTNING_HUB_DEGREE,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  RAID_ATK,
  RAID_CONNECTOR_MAX_FIFTHS,
  RAID_PEN,
  STRUCTURE_SELFDESTRUCT_RADIUS,
  SparkType,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import {
  asBondId,
  asCreatureId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  asStinkCloudId,
  type BondId,
  type CreatureId,
  type PlayerId,
} from '../types.ts';
import { raColumnImpactTick, raColumnPos } from './bossSkillsPharaohRitual.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import { makeCreature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { makeStinkCloud } from './defenders/stinkCloud.ts';
import { dotIntervalTicks, maxPoolFifths } from './damageOverTime.ts';
import { generalPickForWave } from './draft.ts';
import { makeGameStateExtras } from './gameState.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { raSplitShares, raStrikeColumnPos, RA_PERK_STRIKE_FIFTHS } from './racial/powerOfRa.ts';
import { planHubBlast, type HubBlastShare } from './potatoLifecycle.ts';
import { planZombieDeathBlast } from './racial/zombieDeathBlast.ts';
import { pendingRacialSpawns } from './racial/spawnQueue.ts';
import { damageEntity } from './damage.ts';
import { SCORCHED_GROUND_PER_MILLE } from './racial/scorchedGround.ts';
import { killCreditOf } from './racial/killCredit.ts';
import { attackFifths, structurePoolFifths } from './stats.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import './godlyRecipes/registerAll.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const FROZEN = 1_000_000_000;

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(seed = 3): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const dealt = (w: World, s: PlayerId): number => w.matchStats.seats.get(s)?.dealtFifths ?? 0;
const taken = (w: World, s: PlayerId): number => w.matchStats.seats.get(s)?.takenFifths ?? 0;
const kills = (w: World, s: PlayerId, t: CreatureType): number => w.matchStats.seats.get(s)?.kills.get(t) ?? 0;

function prim(w: World, seat: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: Math.sqrt(dx * dx + dy * dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

let sentinel = 9300;
/** A creature through the real SPAWN_CREATURE reducer, STUNNED so it cannot act during the run. */
function spawn(w: World, type: string, owner: PlayerId, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type as never, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(sentinel++),
  });
  let newest: CreatureId | null = null;
  for (const c of w.creatures.values()) if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  w.creatures.get(newest!)!.stunnedUntilTick = FROZEN;
  return newest!;
}

/* ───────────────────────────────── 1 · THE LIGHTNING HUB'S LADDER BLAST ───────────────────────────────── */

describe('⭐ S193 BLAST-2 — the lightning hub\'s ladder blast credits the hub OWNER (real spawner poll)', () => {
  const HUB_AT = { x: 600, y: 400 };

  /** The `hubSelfDestructLadder.test.ts` board: a real hub ignited by the real matcher, drones parked. */
  function hubBoard(): { w: World; hub: Primitive; d: HostTickDeps; st: HostTickState } {
    const w = makeWorld(0x191c5);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    const hub = prim(w, P0, SparkType.Dot, HUB_AT.x, HUB_AT.y);
    for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
      const a = (i / LIGHTNING_HUB_DEGREE) * Math.PI * 2;
      link(w, hub, prim(w, P0, SparkType.Circle, HUB_AT.x + Math.cos(a) * 40, HUB_AT.y + Math.sin(a) * 40));
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { ...HUB_AT }, bondCount: 5 });
    const d = deps(1);
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    for (let t = 0; t < 2; t++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); }
    expect(w.creatureSpawners.size, 'fixture: the hub ignited').toBe(1);
    for (const sp of w.creatureSpawners.values()) sp.nextSpawnTick = FROZEN;
    return { w, hub, d, st };
  }

  /** Blows the hub through the real poll; returns the split `planHubBlast` gave on the tick it blew. */
  function blow(w: World, hub: Primitive, d: HostTickDeps, st: HostTickState): HubBlastShare[] {
    // Bank 34 of the star's 50 (below a third — R182-A), without a sever. Not recorded: the
    // fixture's own damage is nobody's, and the measurement is a delta anyway.
    const ids = [...hub.bonds].sort((a, b) => Number(a) - Number(b));
    let left = 34;
    for (const id of ids) { const take = Math.min(left, 9); w.bonds.get(id)!.damageFifths += take; left -= take; }
    let blew = false;
    let plan: HubBlastShare[] = [];
    for (let t = 0; t < 200 && !blew; t++) {
      w.effects.length = 0;
      plan = planHubBlast(w, hub.pos.x, hub.pos.y, STRUCTURE_SELFDESTRUCT_RADIUS, P0);
      runHostTick(w, d, st);
      blew = w.effects.some((e) => e.kind === 'BOMB_EXPLODE' && e.radius === STRUCTURE_SELFDESTRUCT_RADIUS);
    }
    expect(blew, 'anti-vacuity: the real poll fused and blew the hub').toBe(true);
    return plan;
  }

  it('five enemy targets share 120 by distance: the hub owner is credited EXACTLY what they lost — carry included', () => {
    const { w, hub, d, st } = hubBoard();
    const chewer = spawn(w, 'chewer', P1, 720, 400);
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, 600, 560);
    prim(w, P1, SparkType.Triangle, 600, 250); // a lone shape — pool 5 (LONE_PRIMITIVE_POOL_FIFTHS)
    const bag = makeStinkCloud({ id: asStinkCloudId(w.nextStinkCloudId++), pos: { x: 440, y: 400 }, ownerPlayerId: P1, landedAtTick: w.tick, radius: 30 });
    w.stinkClouds.set(bag.id, bag);
    // A 2-connector chain: e12's midpoint inside (230 px), e23's outside (270 px) — the CARRY fells e23.
    const e1 = prim(w, P1, SparkType.Triangle, 810, 400);
    const e2 = prim(w, P1, SparkType.Triangle, 850, 400);
    const e3 = prim(w, P1, SparkType.Triangle, 890, 400);
    const e12 = link(w, e1, e2);
    const e23 = link(w, e2, e3);
    const chewerPool = w.creatures.get(chewer)!.ehp;
    const d0 = dealt(w, P0);
    const t1 = taken(w, P1);

    const bossPool = w.creatures.get(boss)!.ehp;

    const plan = blow(w, hub, d, st);

    /*
     * ⭐ S193 (master R193-B4) — the 120 is split by DISTANCE (`blastFalloff.ts`), not 24 each, so the
     * arithmetic is derived from the split the sim used, target by target, as APPLIED:
     *   creature   min(share, its pool)      · lone shape / bag   min(share, 5)
     *   e12        pool 14: min(share, 14), and anything past 14 CARRIES to e23 (pool 6 once e12 is
     *              gone): min(share − 14, 6) — what is left after that has nothing to land on.
     * A bag's burst spares BOTH seats (`damageStinkCloud`'s hub-owner spare), so it adds nothing.
     */
    expect(plan.map((t) => t.kind).sort(), 'the five planned targets').toEqual(['connector', 'creature', 'creature', 'primitive', 'stinkCloud']);
    expect(plan.reduce((a, t) => a + t.amount, 0), 'the split sums to 120').toBe(120);
    let expected = 0;
    for (const t of plan) {
      if (t.kind === 'creature') expected += Math.min(t.amount, t.id === (chewer as number) ? chewerPool : bossPool);
      else if (t.kind === 'primitive' || t.kind === 'stinkCloud') expected += Math.min(t.amount, 5);
      else if (t.kind === 'connector') {
        expect(t.id).toBe(e12 as unknown as number);
        expected += Math.min(t.amount, structurePoolFifths(2));
        if (t.amount >= structurePoolFifths(2)) expected += Math.min(t.amount - structurePoolFifths(2), structurePoolFifths(1));
      }
    }
    expect(w.creatures.has(chewer)).toBe(false);
    const e12Share = plan.find((t) => t.kind === 'connector')!.amount;
    expect(w.bonds.has(e12), 'the planned connector falls iff its share covers pool 14').toBe(e12Share < structurePoolFifths(2));
    if (plan.some((t) => t.kind === 'connector' && t.amount >= structurePoolFifths(2) + structurePoolFifths(1))) {
      expect(w.bonds.has(e23), 'and the carry felled the one outside the radius').toBe(false);
    }
    expect(dealt(w, P0) - d0, 'the hub OWNER\'s DEALT').toBe(expected);
    expect(taken(w, P1) - t1, 'conservation: exactly what seat 1 lost').toBe(expected);
    expect(kills(w, P0, 'chewer'), 'and the kill is his').toBe(1);
    expect(w.creatures.get(boss)!.ehp).toBeGreaterThan(0);
  });

  it('⛔ negative — the blast spares its owner, so the owner\'s own things cost him nothing on the board', () => {
    const { w, hub, d, st } = hubBoard();
    const own = spawn(w, 'goblinMelee', P0, 600, 280);
    const pool = w.creatures.get(own)!.ehp;
    const t0 = taken(w, P0);
    blow(w, hub, d, st);
    expect(w.creatures.get(own)?.ehp).toBe(pool);
    // The hub's own star is RAZED (a removal, not damage) — so seat 0 takes nothing from its own blast.
    expect(taken(w, P0) - t0).toBe(0);
    expect(dealt(w, P0), 'no enemy in range: nothing dealt').toBe(0);
  });
});

/* ───────────────────────────────── 2 · SCORCHED GROUND / SCORCHED EARTH ───────────────────────────────── */

describe('⭐ S193 BLAST-2 — burning ground credits the seat whose ground it is (real host tick)', () => {
  function demonWorld(): World {
    const w = makeWorld(0x193b2);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
    } as never);
    w.gameState = 'PLAYING';
    w.isHost = true;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    w.draft = null;
    const pl = w.players.get(P0)!;
    pl.raceId = 'demons';
    pl.draftPicks = ['racial'];
    return w;
  }

  function held(w: World, owner: PlayerId, at: { x: number; y: number }, keep: Set<number>): CreatureId {
    const c = makeCreature(getCreatureConfig('t3Warband'), {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
      spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(sentinel++), clock: w,
    });
    c.stunnedUntilTick = FROZEN;
    w.creatures.set(c.id, c);
    keep.add(c.id as unknown as number);
    return c.id;
  }

  /** The real host tick, with anything the fixture did not place swept (the keeps' emitters mint soldiers). */
  function run(w: World, n: number, keep: Set<number>): void {
    const d = deps(7);
    const st = makeHostTickState(w);
    for (let i = 0; i < n; i++) {
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (!keep.has(id as unknown as number)) w.creatures.delete(id);
    }
  }

  it('the PASSIVE: an enemy in the demon\'s land loses 3 fifths in 3 cadences — all 3 are the demon seat\'s DEALT', () => {
    const w = demonWorld();
    const keep = new Set<number>();
    held(w, P1, { x: 600, y: 200 }, keep); // deep in seat 0's half
    run(w, dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * 3, keep);
    expect(taken(w, P1)).toBe(3);
    expect(dealt(w, P0)).toBe(3);
  });

  it('⛔ negative — the demon\'s OWN unit on his land burns nothing, and nobody is credited', () => {
    const w = demonWorld();
    const keep = new Set<number>();
    held(w, P0, { x: 600, y: 200 }, keep);
    run(w, dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * 3, keep);
    expect(taken(w, P0)).toBe(0);
    expect(dealt(w, P0)).toBe(0);
  });

  it('a CAST on the enemy zone: a 5-connector enemy tower banks 10 in 1200 ticks — the caster\'s 10', () => {
    const w = demonWorld();
    const keep = new Set<number>();
    const shapes = Array.from({ length: 6 }, (_, i) => prim(w, P1, SparkType.Square, 1150 + i * 40, 700));
    const tower = Array.from({ length: 5 }, (_, i) => link(w, shapes[i]!, shapes[i + 1]!));
    dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: P1 });
    run(w, 1200, keep);
    const banked = tower.reduce((s, id) => s + (w.bonds.get(id)?.damageFifths ?? 0), 0);
    expect(banked, 'fixture: the canon\'s 1200 / 120').toBe(10);
    expect(dealt(w, P0), 'the CASTER is credited every fifth').toBe(10);
    expect(taken(w, P1)).toBe(10);
  });
});

/* ───────────────────────────────── 3 · A POWER OF RA COLUMN — THE PERK AND THE PHARAOH ───────────────────────────────── */

describe('⭐ S193 BLAST-2 — a Ra column credits its OWNER (real host tick)', () => {
  function raWorld(): World {
    const w = makeWorld(0x5a193);
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
    w.draft = null;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    return w;
  }

  function victim(w: World, owner: PlayerId, at: { x: number; y: number }): CreatureId {
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: owner,
      pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: asSpawnerId(sentinel++),
    });
    const c = w.creatures.get([...w.creatures.keys()].at(-1)!)!;
    c.ehp = 10_000;
    c.maxEhp = 10_000;
    c.pos = { ...at };
    c.prevPos = { ...at };
    c.targetPos = { ...at };
    return c.id;
  }

  function tickTo(w: World, d: HostTickDeps, s: HostTickState, target: number): void {
    for (let g = 0; w.tick < target; g++) {
      runHostTick(w, d, s);
      if (g > 100_000) throw new Error('tickTo ran away');
    }
  }

  it('the PERK: a cast column split 18 / 17 over two enemies — the caster\'s 35', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 960, y: 260 });
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    tickTo(w, d, s, raColumnImpactTick(strike.untilTick, 0) - 1);
    victim(w, P1, spot);
    victim(w, P1, { x: spot.x + 30, y: spot.y });
    const d0 = dealt(w, P0);
    runHostTick(w, d, s);
    expect(raSplitShares(RA_PERK_STRIKE_FIFTHS, 2)).toEqual([18, 17]);
    expect(dealt(w, P0) - d0).toBe(RA_PERK_STRIKE_FIFTHS);
    expect(taken(w, P1)).toBe(RA_PERK_STRIKE_FIFTHS);
  });

  /** A Pharaoh for `owner` in his ritual (the lethal blow starts it), ticked to one before column 0. */
  function pharaohColumn0(w: World, d: HostTickDeps, s: HostTickState, owner: PlayerId): { x: number; y: number } {
    const at = { x: 500, y: 560 };
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 't9BossMummies' as never, ownerPlayerId: owner,
      pos: { ...at }, targetPos: { ...at }, sourceSpawnerId: asSpawnerId(sentinel++),
    });
    const boss = [...w.creatures.values()].find((c) => c.type === 't9BossMummies' && c.ownerPlayerId === owner)!;
    expect(damageCreature(w, boss.id, 100_000), 'the lethal blow starts the ritual').toBe(false);
    tickTo(w, d, s, raColumnImpactTick(boss.raRitualUntilTick!, 0) - 1);
    const b = w.creatures.get(boss.id)!;
    return raColumnPos(boss.id as unknown as number, 0, b.pos.x, b.pos.y);
  }

  it('the PHARAOH: his column over two enemies is his SEAT\'s 35', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    const pos = pharaohColumn0(w, d, s, P0);
    victim(w, P1, pos);
    victim(w, P1, { x: pos.x + 30, y: pos.y });
    const d0 = dealt(w, P0);
    const t1 = taken(w, P1);
    runHostTick(w, d, s);
    expect(dealt(w, P0) - d0).toBe(RA_PERK_STRIKE_FIFTHS);
    expect(taken(w, P1) - t1).toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('⛔ negative — he spares NOBODY, but his share on his OWN seat\'s unit is TAKEN, never DEALT', () => {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    const pos = pharaohColumn0(w, d, s, P0);
    victim(w, P0, pos); // his own seat's unit, nearest — the 18
    victim(w, P1, { x: pos.x + 30, y: pos.y }); // the enemy — the 17
    const d0 = dealt(w, P0);
    const t0 = taken(w, P0);
    runHostTick(w, d, s);
    const [own, enemy] = raSplitShares(RA_PERK_STRIKE_FIFTHS, 2);
    expect(taken(w, P0) - t0, 'his own unit\'s share is a loss for his seat').toBe(own);
    expect(dealt(w, P0) - d0, 'and only the enemy\'s share is credited').toBe(enemy);
  });
});

/* ───────────────────────────────── 4 · THE RAID, AND THE CARRY BEHIND ANY STRIKE ───────────────────────────────── */

describe('⭐ S193 BLAST-2 — the raid (the real reducer) and the overkill CARRY', () => {
  function raidWorld(): World {
    const w = makeWorld(0x8193);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.creatures.clear();
    w.players.get(P0)!.raidPoints = 20;
    return w;
  }

  it('a raid on a creature: the raider is credited the fifths it took', () => {
    const w = raidWorld();
    const v = spawn(w, 'voltkin', P1, 500, 500);
    dispatch(w, { type: 'RAID_TARGET', target: { kind: 'creature', id: v }, playerId: P0 });
    expect(dealt(w, P0)).toBe(attackFifths(RAID_ATK, RAID_PEN));
    expect(taken(w, P1)).toBe(attackFifths(RAID_ATK, RAID_PEN));
  });

  it('⭐ the CARRY is credited to the striker: a raid breaks a connector and its overkill fells the next', () => {
    const w = raidWorld();
    // A 2-connector enemy chain (pool 14) already holding 13 on the struck connector — one fifth short.
    const a = prim(w, P1, SparkType.Square, 1300, 700);
    const b = prim(w, P1, SparkType.Square, 1340, 700);
    const c = prim(w, P1, SparkType.Square, 1380, 700);
    const ab = link(w, a, b);
    const bc = link(w, b, c);
    w.bonds.get(ab)!.damageFifths = structurePoolFifths(2) - 1;
    dispatch(w, { type: 'RAID_TARGET', target: { kind: 'bond', id: ab }, playerId: P0 });
    expect(RAID_CONNECTOR_MAX_FIFTHS).toBe(3);
    // The raid's 3: 1 fills the pool (ab falls), 2 carry to bc (pool 6 now) and bank there.
    expect(w.bonds.has(ab)).toBe(false);
    expect(w.bonds.get(bc)?.damageFifths, 'fixture: the carry landed').toBe(2);
    expect(dealt(w, P0), 'all 3 of the raid\'s fifths are the raider\'s — 1 at the break, 2 by the carry').toBe(3);
    expect(taken(w, P1)).toBe(3);
  });
});

/* ───────────────────────────────── 6 · MASTER'S S193 BLASTS — the zombie boss's 312, the falloff ───────────────────────────────── */

describe('⭐ S193 — the zombie boss\'s death blast and a falloff blast credit the BLASTING seat (real host tick)', () => {
  it('the zombie death blast (312 split by distance): his seat is credited EXACTLY what the enemies lost, and every kill', () => {
    const w = makeWorld(0x5192);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD'; // creatures dormant: nothing walks between the plan and the blast
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.draft = null;
    w.creatures.clear();
    const AT = { x: 960, y: 540 };
    const put = (type: CreatureType, owner: PlayerId, x: number, y: number): CreatureId => {
      const id = asCreatureId(w.nextCreatureId++);
      const c = makeCreature(getCreatureConfig(type), {
        id, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: w.tick, sourceSpawnerId: null,
      });
      c.state = 'SEEKING';
      w.creatures.set(id, c);
      return id;
    };
    const boss = put(T9_BOSS_TYPE.zombies, P0, AT.x, AT.y);
    const enemies: CreatureId[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * 2 * Math.PI) / 8;
      enemies.push(put('goblinMelee', P1, Math.round(AT.x + (40 + i * 35) * Math.cos(a)), Math.round(AT.y + (40 + i * 35) * Math.sin(a))));
    }
    put('t9BossOrcs', P1, AT.x + 20, AT.y - 10); // survives a share — a non-lethal hit is DEALT too
    const d = deps(7);
    const st = makeHostTickState(w);
    runHostTick(w, d, st); // on the roster
    w.pendingCreatureDeaths = null;
    damageEntity(w, { kind: 'creature', id: boss }, 100_000, 'player', null); // he dies to nobody
    let plan: ReturnType<typeof planZombieDeathBlast> = [];
    const pools = new Map<number, number>();
    plan = planZombieDeathBlast(w, AT, P0);
    for (const c of w.creatures.values()) pools.set(c.id as unknown as number, c.ehp);
    const d0 = dealt(w, P0);
    const t1 = taken(w, P1);
    runHostTick(w, d, st); // the roster compare fires the blast

    expect(plan.length, 'fixture: every enemy is a target').toBe(9);
    expect(plan.reduce((a, p) => a + p.share, 0)).toBe(312);
    let expected = 0;
    for (const { target, share } of plan) expected += Math.min(share, pools.get(target.id)!);
    expect(dealt(w, P0) - d0, 'his SEAT\'s DEALT — a dead dealer still counts').toBe(expected);
    expect(taken(w, P1) - t1, 'conservation').toBe(expected);
    const killed = enemies.filter((e) => !w.creatures.has(e)).length;
    expect(killed, 'fixture: the blast killed goblins').toBeGreaterThan(0);
    expect(kills(w, P0, 'goblinMelee'), 'every kill is his seat\'s').toBe(killed);
  });

  it('a SUICIDE GOBLIN (the shared falloff): the bomber\'s seat is credited what its blast took, through the real tick', () => {
    const w = makeWorld(0x5158);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    const bomber = spawn(w, 'goblinSuicide', P0, 500, 500);
    w.creatures.get(bomber)!.stunnedUntilTick = 0; // un-stunned: the real FSM decides when it blows
    const target = prim(w, P1, SparkType.Square, 560, 500);
    const v = spawn(w, 'voltkin', P1, 540, 520); // stunned, ~45 px out — inside the 70 px blast
    const vPool = w.creatures.get(v)!.ehp;
    const hpBefore = target.hp;
    const d = deps(1);
    const st = makeHostTickState(w);
    for (let t = 0; t < 400 && w.creatures.has(bomber); t++) runHostTick(w, d, st);
    expect(w.creatures.has(bomber), 'fixture: it detonated').toBe(false);
    const shapeLost = Math.min(hpBefore, 5) - Math.max(0, w.primitives.get(target.id)?.hp ?? 0);
    const unitLost = vPool - (w.creatures.get(v)?.ehp ?? 0);
    expect(unitLost, 'fixture: the blast reached the unit').toBeGreaterThan(0);
    expect(dealt(w, P0), 'the BOMBER\'s seat').toBe(taken(w, P1));
    expect(taken(w, P1), 'what seat 1 lost').toBe(shapeLost + unitLost);
  });
});

/* ───────────────────────────────── 5 · THE ONE SEAM (`racial/killCredit.ts`) ───────────────────────────────── */

describe('⭐ S193 — killCreditOf: the stat board\'s credit, shaped as KillCredit widened', () => {
  it('a live creature → its seat AND type; a seat → its seat, no type; null / a creature already gone → nobody', () => {
    const w = makeWorld(0x193c);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.creatures.clear();
    const id = spawn(w, 'chewer', P1, 500, 500);
    expect(killCreditOf(w, { kind: 'creature', id })).toEqual({ seat: P1, type: 'chewer' });
    expect(killCreditOf(w, { kind: 'seat', seat: P0 })).toEqual({ seat: P0, type: null });
    expect(killCreditOf(w, null)).toBeNull();
    w.creatures.delete(id);
    expect(killCreditOf(w, { kind: 'creature', id }), 'a dealer gone before the blow credits nobody').toBeNull();
  });

  it('⛔ THE RISEN stays Reading A: a SEAT kill by a zombie seat raises NOBODY; the same kill by his race unit raises one', () => {
    const setup = (): { w: World; victim: CreatureId } => {
      const w = makeWorld(0x193d);
      dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
      w.creatures.clear();
      const pl = w.players.get(P0)!;
      (pl as { raceId: string }).raceId = 'zombies';
      pl.draftPicks.splice(0, pl.draftPicks.length, 'racial'); // zombies.l0 — THE RISEN
      return { w, victim: spawn(w, 'goblinMelee', P1, 500, 500) };
    };
    // A seat (castle gun / raid / Ra / scorch / hub): the board credits it, THE RISEN does not.
    const a = setup();
    damageEntity(a.w, { kind: 'creature', id: a.victim }, 100_000, 'player', { kind: 'seat', seat: P0 });
    expect(a.w.creatures.has(a.victim)).toBe(false);
    expect(kills(a.w, P0, 'goblinMelee'), 'the board credits the seat').toBe(1);
    expect(pendingRacialSpawns(a.w), 'a typeless credit raises nobody').toBe(0);
    // Positive control — the identical kill by his RACE UNIT raises one (the hook is live in this fixture).
    const b = setup();
    const unit = spawn(b.w, 'raceUnit', P0, 520, 500);
    damageEntity(b.w, { kind: 'creature', id: b.victim }, 100_000, 'creature', { kind: 'creature', id: unit });
    expect(pendingRacialSpawns(b.w)).toBe(1);
  });
});
