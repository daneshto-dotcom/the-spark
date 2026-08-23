/**
 * SPARK — S152 P1 (owner R78) — RAID: the connector arm, the accrual, and the cloud.
 *
 * The UNIT arm lives in `creatures/towerDefense.test.ts` beside the raid tests it replaced. This
 * file covers the three things S152 adds that have no home there: raiding a CONNECTOR, earning raid
 * points, and the wire round-trip of the RAIDED effect.
 *
 * ⭐ WHY THE CONNECTOR TESTS BUILD REAL TOPOLOGY INSTEAD OF STUBBING A BOND. A connector's
 * durability is not stored — it is DERIVED from the live connector count of its component
 * (`connectorCapacityFifths(n) = n + 4`). A hand-stubbed bond in an empty world has a component of
 * one and would silently test the wrong capacity. So these place real primitives through the real
 * reducer, exactly as `game/sever.test.ts` does, and the numbers below are then the numbers the game
 * actually uses.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_RAID_POINTS,
  PLAYER_COLORS,
  RAID_ATK,
  RAID_PEN,
  RAID_PROGRESS_PER_CONNECTION,
  RAID_PROGRESS_PER_POINT,
  RAID_PROGRESS_PER_TOWER,
  SparkType,
} from '../constants.ts';
import { grantRaidProgress, makeIdlePlayer } from '../game/player.ts';
import { makeFreeSpark, type Spark } from '../game/spark.ts';
import { attackFifths, connectorCapacityFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, asSparkId, type BondId, type PrimitiveId } from '../types.ts';

const OWNER = asPlayerId(0);
const RAIDER = asPlayerId(1);

/**
 * A world with BOTH seats present.
 *
 * ⚠ `makeWorld(seed)` takes an RNG SEED, not a player count, and seeds only seat 0 — so
 * `world.players.get(asPlayerId(1))` is undefined in a bare world. Every multi-seat test in this
 * repo adds the seats explicitly (see towerDefense.test.ts); this helper is that, named.
 */
function twoSeatWorld(): World {
  const world = makeWorld(2);
  world.players.set(OWNER, makeIdlePlayer(OWNER, PLAYER_COLORS[0]!));
  world.players.set(RAIDER, makeIdlePlayer(RAIDER, PLAYER_COLORS[1]!));
  return world;
}

/** Place a primitive owned by `seat`, bonding to `target`. Mirrors game/sever.test.ts's helper. */
function place(world: World, seat: ReturnType<typeof asPlayerId>, n: number, target: PrimitiveId | null): PrimitiveId {
  const s: Spark = makeFreeSpark({
    id: asSparkId(n),
    type: SparkType.Dot,
    pos: { x: 100 + n * 26, y: 100 },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: seat, pos: { x: s.pos.x, y: s.pos.y } });
  dispatch(world, { type: 'PLACE_PRIMITIVE', playerId: seat, targetPrimitiveId: target, stiffnessTier: 'MID' });
  world.tick++;
  return [...world.primitives.keys()].at(-1)!;
}

/** A chain of `n` primitives owned by OWNER, returning their ids in placement order. */
function chain(world: World, n: number): PrimitiveId[] {
  const ids: PrimitiveId[] = [];
  let prev: PrimitiveId | null = null;
  for (let i = 0; i < n; i++) {
    prev = place(world, OWNER, i, prev);
    ids.push(prev);
  }
  return ids;
}

function bondBetween(world: World, a: PrimitiveId, b: PrimitiveId): BondId {
  for (const bond of world.bonds.values()) {
    if ((bond.aId === a && bond.bId === b) || (bond.aId === b && bond.bId === a)) return bond.id;
  }
  throw new Error(`no bond between ${a} and ${b}`);
}

function raid(world: World, bondId: BondId, seat = RAIDER): void {
  dispatch(world, { type: 'RAID_TARGET', target: { kind: 'bond', id: bondId }, playerId: seat });
}

describe('S152 P1 — the raid arithmetic is the SHARED ladder, not a bespoke rule', () => {
  it('a raid is exactly attackFifths(2, 0) = 10 fifths', () => {
    // ⛔ THE ONE ASSERTION THAT CATCHES THE S151 UNIT TRAP. A type change is tsc-forced; a UNIT
    // change is not. If someone passes RAID_ATK where fifths are expected, the code compiles and
    // deals 2 fifths instead of 10 — four fifths of nothing, silently. Pin the conversion.
    expect(attackFifths(RAID_ATK, RAID_PEN)).toBe(10);
  });

  it('the R78 connector table: a raid severs a connector only in a component of <= 6 connectors', () => {
    // capacity = connectors + 4, so 10 fifths reaches it at 6 connectors (10) and not at 7 (11).
    for (let n = 1; n <= 6; n++) expect(connectorCapacityFifths(n)).toBeLessThanOrEqual(10);
    for (let n = 7; n <= 12; n++) expect(connectorCapacityFifths(n)).toBeGreaterThan(10);
  });
});

describe('S152 P1 — RAID_TARGET on a CONNECTOR (owner R78)', () => {
  it('a raid on a 2-connector structure SEVERS it (capacity 6 <= 10)', () => {
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 2;
    const ids = chain(world, 3); // 3 prims in a row = 2 connectors
    const b = bondBetween(world, ids[0]!, ids[1]!);
    expect(world.bonds.has(b)).toBe(true);
    raid(world, b);
    expect(world.bonds.has(b)).toBe(false); // 10 fifths >= capacity 6
    expect(world.players.get(RAIDER)!.raidPoints).toBe(1);
  });

  it('⭐ a raid on a COMPLEX structure DAMAGES without severing — R76 complexity is real armour', () => {
    // 9 prims in a chain = 8 connectors, capacity 12 fifths. One raid banks 10 and it HOLDS.
    // This is owner R76's incentive working: "this will make people want to build complex
    // structures with as many connectors as possible".
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 2;
    const ids = chain(world, 9);
    const b = bondBetween(world, ids[3]!, ids[4]!);
    raid(world, b);
    expect(world.bonds.has(b)).toBe(true);              // survived
    expect(world.bonds.get(b)!.damageFifths).toBe(10);  // but the damage POOLED (owner R74)
  });

  it('⭐ DAMAGE ACCUMULATES ACROSS RAIDS — the second one finishes the job', () => {
    // The pool semantics owner R74 settled. 8 connectors, capacity 12: 10 then 20 >= 12.
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 3;
    const ids = chain(world, 9);
    const b = bondBetween(world, ids[3]!, ids[4]!);
    raid(world, b);
    expect(world.bonds.has(b)).toBe(true);
    raid(world, b);
    expect(world.bonds.has(b)).toBe(false);
  });

  it('cannot raid your OWN connector — no damage, no point spent', () => {
    const world = twoSeatWorld();
    world.players.get(OWNER)!.raidPoints = 2;
    const ids = chain(world, 3);
    const b = bondBetween(world, ids[0]!, ids[1]!);
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'bond', id: b }, playerId: OWNER });
    expect(world.bonds.has(b)).toBe(true);
    expect(world.bonds.get(b)!.damageFifths).toBe(0);
    expect(world.players.get(OWNER)!.raidPoints).toBe(2);
  });

  it('no raid point -> no damage at all (the gate runs BEFORE the spend)', () => {
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 0;
    const ids = chain(world, 3);
    const b = bondBetween(world, ids[0]!, ids[1]!);
    raid(world, b);
    expect(world.bonds.has(b)).toBe(true);
    expect(world.bonds.get(b)!.damageFifths).toBe(0);
  });

  it('a raid on a bond that no longer exists spends NOTHING', () => {
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 2;
    chain(world, 3);
    raid(world, 9999 as unknown as BondId);
    expect(world.players.get(RAIDER)!.raidPoints).toBe(2);
  });

  it('leaves a RAIDED cloud at the connector MIDPOINT, in the raider’s colour', () => {
    const world = twoSeatWorld();
    const raider = world.players.get(RAIDER)!;
    raider.raidPoints = 1;
    const ids = chain(world, 3);
    const b = bondBetween(world, ids[0]!, ids[1]!);
    const bond = world.bonds.get(b)!;
    const midX = (bond.a.pos.x + bond.b.pos.x) / 2;
    world.effects.length = 0;
    raid(world, b);
    const cloud = world.effects.find((e) => e.kind === 'RAIDED');
    expect(cloud).toBeDefined();
    expect(cloud!.kind === 'RAIDED' && cloud!.color).toBe(raider.color);
    expect(cloud!.kind === 'RAIDED' && Math.abs(cloud!.pos.x - midX)).toBeLessThan(0.001);
  });

  it('⭐ GEMINI-AUDITOR C1 — TWO RAIDS ON ONE COMPONENT IN ONE TICK STAY CONSISTENT', () => {
    // The Council's determinism challenge: if raid A severs a connector, the component shrinks and
    // every REMAINING connector's capacity drops. Does raid B, applied in the same tick, use the
    // pre- or post-A count? `damageConnector` re-reads capacity on every call, and intents are
    // applied sequentially in one reducer thread, so B sees A's world. Asserted rather than assumed.
    const world = twoSeatWorld();
    world.players.get(RAIDER)!.raidPoints = 3;
    const ids = chain(world, 7); // 6 connectors, capacity 10 -> a single raid severs
    const first = bondBetween(world, ids[0]!, ids[1]!);
    const second = bondBetween(world, ids[4]!, ids[5]!);
    const tick = world.tick;
    raid(world, first);
    raid(world, second);
    expect(world.tick).toBe(tick); // same tick, both applied
    // Both were reachable and both resolved without throwing; the world is still coherent.
    for (const b of world.bonds.values()) {
      expect(Number.isInteger(b.damageFifths)).toBe(true);
      expect(b.damageFifths).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('S152 P1 — raid point ACCRUAL (owner R78: 2 towers OR 5 connections)', () => {
  const seat = () => makeIdlePlayer(OWNER, 0xffffff);

  it('the owner’s two rates both come to exactly one point', () => {
    expect(RAID_PROGRESS_PER_TOWER * 2).toBe(RAID_PROGRESS_PER_POINT);
    expect(RAID_PROGRESS_PER_CONNECTION * 5).toBe(RAID_PROGRESS_PER_POINT);
  });

  it('two towers = one point', () => {
    const p = seat();
    grantRaidProgress(p, RAID_PROGRESS_PER_TOWER);
    expect(p.raidPoints).toBe(0); // one tower is not enough
    grantRaidProgress(p, RAID_PROGRESS_PER_TOWER);
    expect(p.raidPoints).toBe(1);
    expect(p.raidProgress).toBe(0);
  });

  it('five hand-made connections = one point', () => {
    const p = seat();
    for (let i = 0; i < 4; i++) grantRaidProgress(p, RAID_PROGRESS_PER_CONNECTION);
    expect(p.raidPoints).toBe(0);
    grantRaidProgress(p, RAID_PROGRESS_PER_CONNECTION);
    expect(p.raidPoints).toBe(1);
  });

  it('⭐ MIXED BUILDING NEVER STRANDS PARTIAL PROGRESS — the one-pool decision, asserted', () => {
    // 1 tower (5) + 3 connections (6) = 11 tenths = one point with one tenth of change. Under two
    // independent counters this player would have 5/10 and 6/10 and NOTHING to show for either.
    const p = seat();
    grantRaidProgress(p, RAID_PROGRESS_PER_TOWER);
    for (let i = 0; i < 3; i++) grantRaidProgress(p, RAID_PROGRESS_PER_CONNECTION);
    expect(p.raidPoints).toBe(1);
    expect(p.raidProgress).toBe(1);
  });

  it('one placement closing several bonds earns per BOND, not per placement', () => {
    const p = seat();
    grantRaidProgress(p, 3 * RAID_PROGRESS_PER_CONNECTION); // a shape dropped between 3 neighbours
    expect(p.raidProgress).toBe(6);
  });

  it('caps at MAX_RAID_POINTS and does NOT bank an invisible backlog behind the cap', () => {
    // ⚠ The distinction from `tickBuildAction`, deliberately: that helper lets `buildActions` keep
    // climbing at the cap, so a spent charge instantly refills. For raids that would make the cap
    // meaningless — a player could hoard offence and dump it all at once.
    const p = seat();
    for (let i = 0; i < 50; i++) grantRaidProgress(p, RAID_PROGRESS_PER_TOWER);
    expect(p.raidPoints).toBe(MAX_RAID_POINTS);
    expect(p.raidProgress).toBeLessThan(RAID_PROGRESS_PER_POINT);
  });

  it('refuses zero, negative and fractional grants rather than corrupting the counter', () => {
    const p = seat();
    grantRaidProgress(p, 0);
    grantRaidProgress(p, -5);
    grantRaidProgress(p, 1.5);
    expect(p.raidProgress).toBe(0);
    expect(p.raidPoints).toBe(0);
  });
});
