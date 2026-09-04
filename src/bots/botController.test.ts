/**
 * SPARK — S87: BotController/BotManager integration tests.
 *
 * These run the REAL loop: a bots-mode world + a BotManager ticked like
 * main.ts does (world.tick advanced manually; no Pixi, no physics needed —
 * every bot effect flows through dispatch()). Proves the user's bar: bots
 * cruise (avatar moves boundedly), claim (PICKUP_SPARK), haul (carried spark
 * rides the avatar), and BUILD real primitives that bond into structures —
 * plus determinism (same seed ⇒ identical world) and bench compliance.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { bankAdd } from '../state/castleBank.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { BotManager } from './botManager.ts';
import type { BotDifficulty } from './botTypes.ts';

function botsWorld(botCount: number, seed = 0xbeef): World {
  const world = makeWorld(seed);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: botCount + 1 }, (_, seat) => ({
    seat,
    color: PLAYER_COLORS[seat],
  }));
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster,
    botSeats: Array.from({ length: botCount }, (_, i) => i + 1),
  });
  return world;
}

/**
 * ⛔ S138 P2 — REWRITTEN. This used to scatter free sparks in a ring around the spawner centre (the
 * shared quarry), because that was where bots reached in with their avatars. That is precisely the
 * behaviour the owner reported as unfair, and `pickTargetSpark` no longer sees the quarry at all.
 *
 * A bot's supply is now its OWN bank, so the fixture fills each bot seat's bank instead — which also
 * makes these tests exercise the real new pipeline end to end: bank → `PULL_FROM_BANK` → own porch →
 * pick up → place. Capped per seat by `CASTLE_BANK_CAP`, so `count` is a request, not a guarantee;
 * shapes that do not fit are simply not seeded (the same wait-at-cap rule the gatherer obeys).
 */
function seedSparks(world: World, count: number): void {
  const botSeats = [...world.players.keys()].filter((id) => (id as unknown as number) !== 0);
  let made = 0;
  for (let i = 0; i < count; i++) {
    const seat = botSeats[i % botSeats.length];
    if (seat === undefined) break;
    const id = asSparkId(1000 + i);
    const home = castleAnchor(seat as unknown as number, world.layout);
    const spark = {
      id,
      type: (i % 6) as SparkType,
      pos: { x: home.x, y: home.y },
      prevPos: { x: home.x, y: home.y },
      radius: 8,
      createdTick: 0,
      state: { kind: 'Free' as const },
    };
    bankAdd(world.castleBanks, seat, spark.type);
    made++;
  }
  // Guard the fixture's own premise: a silently-empty bank would make every bot REST and the
  // assertions below would pass vacuously ("NOOB built 0, IMBA built 0").
  expect(made).toBeGreaterThan(0);
}

/** Drive N host ticks: bots act, then the tick advances (main.ts order). */
function run(world: World, manager: BotManager, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    manager.tick(world);
    world.tick++;
  }
}

describe('S87 BotManager — bots actually play', () => {
  it('an IMBA bot cruises, claims, hauls and places bonded primitives', () => {
    const world = botsWorld(1);
    seedSparks(world, 12);
    const manager = new BotManager(['IMBA'], 0xbeef);
    const seat = asPlayerId(1);
    const startPos = { ...world.players.get(seat)!.avatarPos };

    run(world, manager, 60 * 30); // 30 sim-seconds

    const placed = [...world.primitives.values()].filter((p) => p.placedBy === seat);
    expect(placed.length).toBeGreaterThanOrEqual(3); // builds repeatedly
    // The structure is BONDED (placements chain within AUTO_BOND_RADIUS).
    const bondedPrims = placed.filter((p) => p.bonds.size > 0);
    expect(bondedPrims.length).toBeGreaterThanOrEqual(2);
    // And the avatar genuinely traveled (no teleport-build from spawn).
    const me = world.players.get(seat)!;
    expect(
      Math.hypot(me.avatarPos.x - startPos.x, me.avatarPos.y - startPos.y),
    ).toBeGreaterThan(50);
  });

  it('avatar movement is speed-bounded per tick (cruises, never teleports)', () => {
    const world = botsWorld(1);
    seedSparks(world, 6);
    const manager = new BotManager(['NOOB'], 0xbeef);
    const seat = asPlayerId(1);
    let prev = { ...world.players.get(seat)!.avatarPos };
    let maxStep = 0;
    for (let i = 0; i < 60 * 10; i++) {
      manager.tick(world);
      world.tick++;
      const cur = world.players.get(seat)!.avatarPos;
      maxStep = Math.max(maxStep, Math.hypot(cur.x - prev.x, cur.y - prev.y));
      prev = { ...cur };
    }
    // NOOB cursorSpeed 3.2 + wobble 2.5 — generous ceiling, far below teleport.
    expect(maxStep).toBeLessThanOrEqual(8);
  });

  it('same seed ⇒ identical action stream (deterministic replay)', () => {
    const mkRun = (): string => {
      const world = botsWorld(2, 0x5eed);
      seedSparks(world, 10);
      const manager = new BotManager(['HARD', 'MID'], 0x5eed);
      run(world, manager, 60 * 15);
      return JSON.stringify({
        prims: [...world.primitives.values()].map((p) => ({
          id: p.id,
          x: p.pos.x,
          y: p.pos.y,
          by: p.placedBy,
        })),
        avatars: [...world.players.values()].map((pl) => ({
          id: pl.id,
          x: pl.avatarPos.x,
          y: pl.avatarPos.y,
        })),
        bonds: world.bonds.size,
        sparks: world.freeSparks.size,
      });
    };
    expect(mkRun()).toBe(mkRun());
  });

  it('different difficulties pace differently (NOOB builds less than IMBA)', () => {
    const built = (difficulty: BotDifficulty): number => {
      const world = botsWorld(1, 0xfeed);
      seedSparks(world, 14);
      const manager = new BotManager([difficulty], 0xfeed);
      run(world, manager, 60 * 30);
      return [...world.primitives.values()].filter(
        (p) => p.placedBy === asPlayerId(1),
      ).length;
    };
    const noob = built('NOOB');
    const imba = built('IMBA');
    expect(imba).toBeGreaterThan(noob);
    expect(noob).toBeGreaterThanOrEqual(1); // noob still plays, just slowly
  });

  it('a benched (eaten) bot stops acting and resumes after release', () => {
    const world = botsWorld(1);
    seedSparks(world, 8);
    const manager = new BotManager(['IMBA'], 0xbeef);
    const seat = asPlayerId(1);
    run(world, manager, 60); // get moving
    const me = world.players.get(seat)!;
    me.benchedUntilTick = world.tick + 120;
    const frozen = { ...world.players.get(seat)!.avatarPos };
    const primsAtBench = world.primitives.size;
    run(world, manager, 120); // benched window
    expect(world.players.get(seat)!.avatarPos).toEqual(frozen); // parked
    expect(world.primitives.size).toBe(primsAtBench); // no builds while eaten
    expect(world.diagnostics.rejectReasons.actorBenched).toBe(0); // never even tried
    run(world, manager, 60 * 20); // released
    expect(world.primitives.size).toBeGreaterThan(primsAtBench); // back to work
  });

  it('⭐ S162 (OF-5) — an ELIMINATED bot parks too, not only a benched one', () => {
    // `isBenched` had an early-return here and `isEliminated` had no twin, so a dead bot went on
    // thinking, walking and dispatching. Every verb was refused at the elimination gate, so it was
    // mechanically inert — but it READ as a dead seat still playing, which is the thing owner ruling
    // R127's spectator rule exists to prevent.
    //
    // ⚠ `run` drives ONLY the bot manager, never tickGameState, so razing this castle cannot end the
    // match and make the assertions pass for the wrong reason.
    const world = botsWorld(1);
    seedSparks(world, 8);
    const manager = new BotManager(['IMBA'], 0xbeef);
    const seat = asPlayerId(1);
    run(world, manager, 60); // get it moving first — anti-vacuity
    const movedTo = { ...world.players.get(seat)!.avatarPos };
    world.players.get(seat)!.castleHp = 0; // its castle falls: R127 says it is out
    const primsAtDeath = world.primitives.size;
    run(world, manager, 60 * 5);
    expect(world.players.get(seat)!.avatarPos).toEqual(movedTo); // parked, and permanently
    expect(world.primitives.size).toBe(primsAtDeath); // and it builds nothing more
  });

  it('debugStates exposes seat/difficulty/state for the e2e probe', () => {
    const manager = new BotManager(['NOOB', 'IMBA'], 1);
    const states = manager.debugStates();
    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ seat: 1, difficulty: 'NOOB' });
    expect(states[1]).toMatchObject({ seat: 2, difficulty: 'IMBA' });
  });
});
