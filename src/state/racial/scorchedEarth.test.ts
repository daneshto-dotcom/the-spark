/**
 * SPARK — S191 (owner item 1b) — **SCORCHED EARTH: the aimed half of SCORCHED GROUND.**
 *
 * > *"you can click on any quadrant of the enemy … you will be resistant. Everybody else will … receive
 * > damage over time. And your enemy too, and his structures and everything … with the same … amount
 * > of … health lost per … second … you can place it on your own as well. And then you would have
 * > double scorched earth"* — owner, S191. And: *"also enemy structures will take half the damage that
 * > units take."*
 *
 * The arithmetic; the host's REFUSALS (unheld, BUILD, a second cast, every malformed or off-board
 * target); the REACH — through the real `runHostTick`, inside a scorched enemy zone, an enemy creature
 * loses exactly 2 %/s of its pool and an enemy structure exactly 1 %/s of its, an enemy connector banks,
 * breaks and re-forms, a lone shape and a landed bag burn, and the caster's own units lose nothing; the
 * own-zone DOUBLE; the scorch ending with the FIGHT; the castle, Helga and a welded-to-the-caster
 * component untouched; and the wire (save round-trip, the wide hash sees it).
 */
import { describe, expect, it } from 'vitest';
import {
  LONE_PRIMITIVE_POOL_FIFTHS,
  PHYSICS_HZ,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  phaseDurationTicks,
} from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import {
  SCORCHED_EARTH_CAST_PER_MILLE,
  SCORCHED_EARTH_OWN_ZONE_MUL,
  SCORCHED_GROUND_PER_MILLE,
  SCORCHED_STRUCTURE_RATE_DIV,
  runScorchedGround,
  scorchedEarthZones,
  scorchedStructureIntervalTicks,
} from './scorchedGround.ts';
import {
  SCORCHED_EARTH_CHARGES,
  scorchedEarthCastRefusal,
  scorchedEarthFromWire,
  scorchedEarthTargetZone,
} from './scorchedEarthRules.ts';
import { dotIntervalTicks, maxPoolFifths } from '../damageOverTime.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { zoneOf } from '../zones.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { structurePoolFifths } from '../stats.ts';
import { makeStinkCloud } from '../defenders/stinkCloud.ts';
import { restore, snapshot } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import {
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  asStinkCloudId,
  type BondId,
  type PlayerId,
} from '../../types.ts';

const P0 = asPlayerId(0); // the demon caster
const P1 = asPlayerId(1);
/** Deep in seat 1's half — far from both keeps' guns and from the quarry. */
const IN_P1_LAND = { x: 1320, y: 200 };
/** Deep in seat 0's (the caster's own) half. */
const IN_P0_LAND = { x: 600, y: 200 };

function twoSeat(phase: 'FIGHT' | 'BUILD' = 'FIGHT', picks: Array<'racial' | 'hp'> = ['racial']): World {
  const w = makeWorld(0x191b);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + 1_000_000; // no edge unless a test forces one
  w.creatures.clear();
  w.draft = null;
  const pl = w.players.get(P0)!;
  pl.raceId = 'demons';
  pl.draftPicks = [...picks];
  return w;
}

/** A unit held in place by a long stun — a stun stops what it DOES, never what is done to it. */
function heldUnit(w: World, type: CreatureType, owner: PlayerId, at: { x: number; y: number }): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.stunnedUntilTick = w.tick + 10_000_000;
  w.creatures.set(c.id, c);
  if (!fixtureIds.has(w)) fixtureIds.set(w, new Set());
  fixtureIds.get(w)!.add(c.id as unknown as number);
  return c;
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

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const id = w.nextBondId++ as unknown as BondId;
  const len = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b, restLength: len, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A straight chain of `n` connectors (n + 1 shapes) owned by `seat`, starting at `at`. */
function chain(w: World, seat: PlayerId, at: { x: number; y: number }, n: number): BondId[] {
  const prims = Array.from({ length: n + 1 }, (_, i) => addPrim(w, seat, at.x + i * 40, at.y));
  return Array.from({ length: n }, (_, i) => bond(w, prims[i]!, prims[i + 1]!));
}

const banked = (w: World, ids: readonly BondId[]): number =>
  ids.reduce((s, id) => s + (w.bonds.get(id)?.damageFifths ?? 0), 0);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
/**
 * The real host tick, n times. ⚠ Every creature the FIXTURE did not place is removed between ticks:
 * the castles' race-unit emitter keeps minting soldiers in FIGHT, and they walk over and chew the
 * fixture structures (measured: 18 fifths off a tower in 2400 ticks with no cast at all), so only the
 * scorch may touch what these tests measure.
 */
function runner(w: World): (n: number) => void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  return (n) => {
    for (let i = 0; i < n; i++) {
      runHostTick(w, d, st);
      const keep = fixtureIds.get(w);
      for (const id of [...w.creatures.keys()]) if (keep?.has(id as unknown as number) !== true) w.creatures.delete(id);
    }
  };
}
/** Per WORLD — creature ids restart with every `makeWorld`, so one shared set would leak across tests. */
const fixtureIds = new WeakMap<World, Set<number>>();

const cast = (w: World, zoneSeat: unknown, by: PlayerId = P0): void => {
  dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: by, zoneSeat: zoneSeat as PlayerId });
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — the arithmetic, every number derived', () => {
  it('⭐ the cast burns creatures at the passive’s rate — “the same amount” — never a second literal', () => {
    expect(SCORCHED_EARTH_CAST_PER_MILLE).toBe(SCORCHED_GROUND_PER_MILLE);
    expect(SCORCHED_GROUND_PER_MILLE).toBe(20);
  });

  it('⭐ structures at HALF (his S191 answer) = twice the unit interval for the same pool, exactly', () => {
    expect(SCORCHED_STRUCTURE_RATE_DIV).toBe(2);
    for (const n of [1, 2, 3, 4, 5]) {
      const pool = structurePoolFifths(n);
      expect(scorchedStructureIntervalTicks(pool), `n=${n}`).toBe(2 * dotIntervalTicks(pool, SCORCHED_GROUND_PER_MILLE));
    }
    // The table the owner will read (ticks per fifth): 5→120 · 4→166 · 3→250 · 2→428 · 1→1000 · lone→1200.
    expect([5, 4, 3, 2, 1].map((n) => scorchedStructureIntervalTicks(structurePoolFifths(n))))
      .toEqual([120, 166, 250, 428, 1000]);
    expect(scorchedStructureIntervalTicks(LONE_PRIMITIVE_POOL_FIFTHS)).toBe(1200);
  });

  it('⭐ the own-zone “double” is derived from the two rates, and it is 2', () => {
    expect(SCORCHED_EARTH_OWN_ZONE_MUL).toBe(2);
  });

  it('once per FIGHT — his number', () => {
    expect(SCORCHED_EARTH_CHARGES).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — the host refuses, and every refusal is a no-op', () => {
  const fp = (w: World): number => hashWorldStateFull(w);

  it('⭐ a legal cast on an ENEMY zone stores exactly { wave, zoneSeat }', () => {
    const w = twoSeat();
    cast(w, P1);
    expect(w.players.get(P0)!.scorchedEarth).toEqual({ wave: w.waveNumber, zoneSeat: P1 });
    expect(scorchedEarthZones(w)).toEqual([{ caster: P0, zone: zoneOf(IN_P1_LAND, w.layout) }]);
  });

  it('⭐ a legal cast on his OWN zone is accepted — “you can place it on your own as well”', () => {
    const w = twoSeat();
    cast(w, P0);
    expect(w.players.get(P0)!.scorchedEarth).toEqual({ wave: w.waveNumber, zoneSeat: P0 });
  });

  it.each([
    ['a demon seat WITHOUT the pick', (w: World) => { w.players.get(P0)!.draftPicks = ['hp']; }, 'NOT_HELD'],
    ['another race WITH its racial pick', (w: World) => { w.players.get(P0)!.raceId = 'orcs'; }, 'NOT_HELD'],
    ['BUILD', (w: World) => { w.matchPhase = 'BUILD'; }, 'NOT_FIGHT'],
    ['a decided match', (w: World) => { w.gameState = 'WIN'; }, 'NOT_PLAYING'],
    ['a benched caster', (w: World) => { w.players.get(P0)!.benchedUntilTick = w.tick + 1000; }, 'BENCHED'],
    ['an eliminated caster', (w: World) => { w.players.get(P0)!.castleHp = 0; }, 'ELIMINATED'],
  ] as const)('⛔ %s — refused, nothing changes', (_label, arrange, why) => {
    const w = twoSeat();
    arrange(w);
    expect(scorchedEarthCastRefusal(w, P0)).toBe(why);
    const before = fp(w);
    cast(w, P1);
    expect(w.players.get(P0)!.scorchedEarth).toBeNull();
    expect(fp(w)).toBe(before);
  });

  it('⛔ a SECOND cast in the same FIGHT is refused and does not move the first', () => {
    const w = twoSeat();
    cast(w, P1);
    const first = w.players.get(P0)!.scorchedEarth;
    expect(scorchedEarthCastRefusal(w, P0)).toBe('USED');
    const before = fp(w);
    cast(w, P0);
    expect(w.players.get(P0)!.scorchedEarth).toEqual(first);
    expect(fp(w)).toBe(before);
  });

  it.each([
    ['a string', '1'],
    ['a float', 0.5],
    ['null', null],
    ['NaN', Number.NaN],
    ['a seat past the table', 7],
    ['a negative seat', -1],
    ['a seat not in this match', 2],
  ] as const)('⛔ an off-board target — %s — is a no-op, never a throw', (_label, target) => {
    const w = twoSeat();
    expect(scorchedEarthTargetZone(w, target)).toBeNull();
    const before = fp(w);
    expect(() => cast(w, target)).not.toThrow();
    expect(w.players.get(P0)!.scorchedEarth).toBeNull();
    expect(fp(w)).toBe(before);
  });

  it('⛔ a target whose castle has FALLEN is refused (its owner is out)', () => {
    const w = twoSeat();
    w.layout = 'QUADRANTS_4P';
    w.players.get(P1)!.castleHp = 0;
    expect(scorchedEarthTargetZone(w, P1)).toBeNull();
    cast(w, P1);
    expect(w.players.get(P0)!.scorchedEarth).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — ⭐ REACH through the real host tick, inside a scorched ENEMY zone', () => {
  it('⭐⭐ his two rates, side by side: an enemy CREATURE loses 2 %/s of its pool, an enemy STRUCTURE 1 %/s of its', () => {
    const w = twoSeat();
    const step = runner(w);
    const unit = heldUnit(w, 't3Warband', P1, IN_P1_LAND);
    const tower = chain(w, P1, { x: 1200, y: 420 }, 3); // three connectors: pool 24, the same as the unit
    const unitPool = maxPoolFifths(unit.type);
    const towerPool = structurePoolFifths(3);
    expect(zoneOf(unit.pos, w.layout)).toBe(1);
    const window = lcm(dotIntervalTicks(unitPool, SCORCHED_GROUND_PER_MILLE), scorchedStructureIntervalTicks(towerPool));
    expect(window, 'fixture: a window both clocks divide, shorter than a FIGHT').toBeLessThanOrEqual(phaseDurationTicks('FIGHT'));
    const full = unit.ehp;
    cast(w, P1);
    step(window);
    const seconds = window / PHYSICS_HZ;
    const unitLost = full - w.creatures.get(unit.id)!.ehp;
    const towerLost = banked(w, tower);
    expect(unitLost, 'anti-vacuity: the unit burned').toBeGreaterThan(0);
    expect(towerLost, 'anti-vacuity: the structure burned').toBeGreaterThan(0);
    expect((unitLost * 1000) / (unitPool * seconds), 'creature: 2 %/s = 20 per-mille').toBe(20);
    expect((towerLost * 1000) / (towerPool * seconds), 'structure: 1 %/s = 10 per-mille').toBe(10);
  });

  it('⭐ a five-connector enemy tower banks exactly one fifth per 120 ticks, on its LOWEST connector, as ONE structure', () => {
    const w = twoSeat();
    const step = runner(w);
    const tower = chain(w, P1, { x: 1150, y: 700 }, 5);
    cast(w, P1);
    step(1200);
    expect(banked(w, tower), '1200 / 120').toBe(10);
    expect(w.bonds.get(tower[0]!)!.damageFifths, 'all of it on the lowest connector clear of the caster').toBe(10);
  });

  it('⭐ a one-connector enemy structure BREAKS once its pool is spent, through the one sever path', () => {
    const w = twoSeat();
    const step = runner(w);
    const [only] = chain(w, P1, { x: 1300, y: 700 }, 1);
    const interval = scorchedStructureIntervalTicks(structurePoolFifths(1)); // 1000
    cast(w, P1);
    step(interval * structurePoolFifths(1) - 1);
    expect(w.bonds.has(only!), 'one fifth short: it still stands').toBe(true);
    step(1);
    expect(w.bonds.has(only!), 'the sixth fifth severs it').toBe(false);
  });

  it('⭐ a LONE enemy shape (pool 5) and a LANDED enemy stink bag (pool 5) burn at the half rate', () => {
    const w = twoSeat();
    const step = runner(w);
    const lone = addPrim(w, P1, 1500, 300);
    cast(w, P1);
    step(2 * scorchedStructureIntervalTicks(LONE_PRIMITIVE_POOL_FIFTHS));
    expect(LONE_PRIMITIVE_POOL_FIFTHS - w.primitives.get(lone.id)!.hp, 'two fifths off its five').toBe(2);

    // A bag lives five seconds (and its clock ticks once per twenty), so land it FIVE ticks before its
    // clock is due, on the real host tick, and watch that one fifth land.
    const id = asStinkCloudId(w.nextStinkCloudId++);
    const interval = scorchedStructureIntervalTicks(5);
    const dueIn = interval - ((w.tick + (id as unknown as number)) % interval);
    step(dueIn - 5);
    const bag = makeStinkCloud({ id, pos: { x: 1400, y: 900 }, ownerPlayerId: P1, landedAtTick: w.tick, radius: 90 });
    w.stinkClouds.set(id, bag);
    step(4);
    expect(w.stinkClouds.get(id)?.ehp, 'not yet due').toBe(5);
    step(1);
    expect(w.stinkClouds.get(id)?.ehp, 'one fifth off the bag').toBe(4);
  });

  it('⛔ RESISTANCE — the caster’s own units in the scorched zone lose NOTHING, while the enemy beside them burns', () => {
    const w = twoSeat();
    const step = runner(w);
    const mine = heldUnit(w, 't3Warband', P0, IN_P1_LAND);
    const theirs = heldUnit(w, 't3Warband', P1, { x: IN_P1_LAND.x + 30, y: IN_P1_LAND.y });
    const full = mine.ehp;
    cast(w, P1);
    step(dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * 4);
    expect(w.creatures.get(mine.id)!.ehp).toBe(full);
    expect(full - w.creatures.get(theirs.id)!.ehp, 'control: the enemy beside him burned').toBe(4);
  });

  it('⛔ RESISTANCE — on his OWN zone his own structure and his own lone shape take nothing', () => {
    const w = twoSeat();
    const step = runner(w);
    const tower = chain(w, P0, { x: 300, y: 700 }, 5);
    const lone = addPrim(w, P0, 500, 300);
    cast(w, P0);
    step(2400);
    expect(banked(w, tower)).toBe(0);
    expect(w.primitives.get(lone.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('⛔ a component WELDED to the caster with no connector clear of him does not burn', () => {
    const w = twoSeat();
    const step = runner(w);
    const a = addPrim(w, P1, 1300, 800);
    const b = addPrim(w, P0, 1340, 800); // the caster's own shape, welded onto the enemy's
    const welded = bond(w, a, b);
    cast(w, P1);
    step(2400);
    expect(w.bonds.get(welded)!.damageFifths).toBe(0);
  });

  it('⛔ the enemy CASTLE is not burned (his S191 answer)', () => {
    const w = twoSeat();
    const step = runner(w);
    const hp = w.players.get(P1)!.castleHp;
    cast(w, P1);
    step(2400);
    expect(w.players.get(P1)!.castleHp).toBe(hp);
  });

  it('⛔ the neighbouring quarter does not burn (4-seat board)', () => {
    const w = twoSeat();
    w.layout = 'QUADRANTS_4P';
    const step = runner(w);
    const inTarget = heldUnit(w, 't3Warband', P1, { x: 1400, y: 300 }); // zone 1 (top-right)
    const nextDoor = heldUnit(w, 't3Warband', P1, { x: 1400, y: 800 }); // zone 2 (bottom-right)
    expect(zoneOf(inTarget.pos, w.layout)).toBe(1);
    expect(zoneOf(nextDoor.pos, w.layout)).toBe(2);
    const full = inTarget.ehp;
    cast(w, P1);
    step(dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * 2);
    expect(full - w.creatures.get(inTarget.id)!.ehp).toBe(2);
    expect(w.creatures.get(nextDoor.id)!.ehp).toBe(full);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — ⭐ DOUBLE on his own zone', () => {
  it('⭐⭐ an outsider’s creature in the caster’s own zone burns at exactly TWICE the passive', () => {
    const measure = (withCast: boolean): number => {
      const w = twoSeat();
      const step = runner(w);
      const v = heldUnit(w, 't3Warband', P1, IN_P0_LAND);
      const full = v.ehp;
      if (withCast) cast(w, P0);
      step(dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE) * 5);
      return full - w.creatures.get(v.id)!.ehp;
    };
    const passive = measure(false);
    const doubled = measure(true);
    expect(passive, 'the passive alone, unchanged').toBe(5);
    expect(doubled / passive, 'his “double scorched earth”').toBe(SCORCHED_EARTH_OWN_ZONE_MUL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — it lasts until that FIGHT ends, and not a tick longer', () => {
  it('⭐ the real match clock ends it: no burn in BUILD, the record cleared, the next FIGHT can cast again', () => {
    const w = twoSeat();
    const step = runner(w);
    cast(w, P1);
    const castWave = w.waveNumber;
    const v = heldUnit(w, 't3Warband', P1, IN_P1_LAND);
    w.phaseEndsAtTick = w.tick + 3; // end this FIGHT on the real clock
    step(5);
    expect(w.matchPhase).toBe('BUILD');
    expect(w.waveNumber).toBe(castWave + 1);
    expect(w.players.get(P0)!.scorchedEarth, 'cleared at the BUILD edge').toBeNull();
    const buildHp = w.creatures.get(v.id)!.ehp;
    step(dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE) * 3);
    expect(w.creatures.get(v.id)!.ehp, 'nothing burns in BUILD').toBe(buildHp);
    expect(scorchedEarthCastRefusal(w, P0)).toBe('NOT_FIGHT');
    w.phaseEndsAtTick = w.tick + 2;
    step(3);
    expect(w.matchPhase).toBe('FIGHT');
    expect(scorchedEarthCastRefusal(w, P0), 'a new FIGHT, a new cast').toBeNull();
  });

  it('⛔ a stale record from an EARLIER wave burns nothing even if it were never cleared', () => {
    const w = twoSeat();
    w.players.get(P0)!.scorchedEarth = { wave: w.waveNumber - 1, zoneSeat: P1 };
    expect(scorchedEarthZones(w)).toEqual([]);
  });

  it('⚠ MINE — the CASTER falling stops his cast; the ZONE OWNER falling after the cast does not', () => {
    // Four seats, so one castle falling does not decide the match and the FIGHT slot keeps running.
    const w = makeWorld(0x191c);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [0, 1, 2, 3].map((seat) => ({ seat, color: PLAYER_COLORS[seat] })),
    } as never);
    w.gameState = 'PLAYING';
    w.isHost = true;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    w.draft = null;
    w.players.get(P0)!.raceId = 'demons';
    w.players.get(P0)!.draftPicks = ['racial'];
    const step = runner(w);
    const v = heldUnit(w, 't3Warband', asPlayerId(2), { x: 1400, y: 300 }); // a third seat's unit, in zone 1
    const interval = dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE);
    cast(w, P1);
    w.players.get(P1)!.castleHp = 0; // the zone owner falls AFTER the cast
    const full = v.ehp;
    step(interval * 2);
    expect(full - w.creatures.get(v.id)!.ehp, 'still burning').toBe(2);
    w.players.get(P0)!.castleHp = 0; // now the caster falls
    const mid = w.creatures.get(v.id)!.ehp;
    step(interval * 2);
    expect(w.creatures.get(v.id)!.ehp, 'his cast stopped with him').toBe(mid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 SCORCHED EARTH — the wire: four sites', () => {
  it('⭐ a save round-trip keeps the cast, and the rehydrated world hashes identically', () => {
    const w = twoSeat();
    cast(w, P1);
    const back = makeWorld(0);
    restore(JSON.parse(JSON.stringify(snapshot(w))), back);
    expect(back.players.get(P0)!.scorchedEarth).toEqual({ wave: w.waveNumber, zoneSeat: P1 });
    expect(hashWorldStateFull(back)).toBe(hashWorldStateFull(w));
  });

  it('⭐ the wide hash SEES the cast (a host and a mirror disagreeing about it cannot hash alike)', () => {
    const a = twoSeat();
    const b = twoSeat();
    expect(hashWorldStateFull(a)).toBe(hashWorldStateFull(b));
    cast(a, P1);
    expect(hashWorldStateFull(a)).not.toBe(hashWorldStateFull(b));
    b.players.get(P0)!.scorchedEarth = { wave: b.waveNumber, zoneSeat: P0 };
    expect(hashWorldStateFull(a), 'the zone seat is projected, not only presence').not.toBe(hashWorldStateFull(b));
  });

  it('⭐ never cast → nothing emitted (a board where nobody scorched stays byte-identical)', () => {
    const w = twoSeat();
    const pl = snapshot(w).players.find((p) => (p.id as unknown as number) === 0)!;
    expect('scorchedEarth' in pl).toBe(false);
  });

  it('⛔ a malformed wire record rehydrates as never-cast', () => {
    for (const bad of [null, 1, 'x', {}, { wave: 1.5, zoneSeat: 1 }, { wave: 1, zoneSeat: 9 }, { wave: 1, zoneSeat: '1' }]) {
      expect(scorchedEarthFromWire(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(scorchedEarthFromWire({ wave: 3, zoneSeat: 1 })).toEqual({ wave: 3, zoneSeat: P1 });
  });

  it('the direct slot, for completeness: `runScorchedGround` alone lands the cast (no hidden host-tick dependency)', () => {
    const w = twoSeat();
    const v = heldUnit(w, 't3Warband', P1, IN_P1_LAND);
    cast(w, P1);
    const interval = dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE);
    const full = v.ehp;
    for (let i = 0; i < interval; i++) { w.tick++; runScorchedGround(w); }
    expect(full - v.ehp).toBe(1);
  });
});
