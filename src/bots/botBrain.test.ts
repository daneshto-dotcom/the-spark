/**
 * SPARK — S87: bot brain unit tests (pure decision layer on synthetic worlds).
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../constants.ts';
import { makeHunter } from '../state/hunters/hunter.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asHunterId, asPlayerId, asPoopId, asSparkId, type PlayerId } from '../types.ts';
import { BOT_CONFIGS } from './botConfig.ts';
import {
  chooseBuildPos,
  chooseGoal,
  fleePoint,
  isLegalBuildPos,
  nearestEnemyBond,
  pickTargetSpark,
} from './botBrain.ts';

const SEAT = asPlayerId(1);

function botsWorld(botCount = 2): World {
  const world = makeWorld(11);
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
  // S104 P2 — START_GAME(bots) now host-seeds a chewer-spawner pentagram per bot seat. These tests
  // exercise PURE bot-decision logic on hand-built fixtures, so clear the seeded structures to keep
  // the board clean (the seeding itself is covered by spawners/botSpawnerSeed.test.ts).
  world.primitives.clear();
  world.bonds.clear();
  world.creatureSpawners.clear();
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.nextSpawnerId = 0;
  return world;
}

function addFreeSpark(world: World, id: number, x: number, y: number): void {
  world.freeSparks.set(asSparkId(id), {
    id: asSparkId(id),
    type: SparkType.Dot,
    pos: { x, y },
    prevPos: { x, y },
    radius: 8,
    createdTick: 0,
    state: { kind: 'Free' },
  });
}

/** Place a prim for `seat` directly through the real pipeline: teleport the
 *  player's avatar (UPDATE_AVATAR_POS), claim, place. Returns placement pos. */
function placeOwnPrim(world: World, seat: PlayerId, x: number, y: number, sparkId: number): void {
  addFreeSpark(world, sparkId, x, y);
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: seat, pos: { x, y } });
  dispatch(world, {
    type: 'PICKUP_SPARK',
    sparkId: asSparkId(sparkId),
    playerId: seat,
    pos: { x, y },
  });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: seat,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
    placementPos: { x, y },
  });
}

describe('S87 botBrain.chooseGoal — priority arbitration', () => {
  it('default: BUILD when sparks exist and cooldown elapsed', () => {
    const world = botsWorld();
    addFreeSpark(world, 1, SPAWNER_CENTER_X, SPAWNER_CENTER_Y);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), true);
    expect(goal.kind).toBe('BUILD');
  });

  it('RESTs when build is on cooldown and nothing else to do', () => {
    const world = botsWorld();
    addFreeSpark(world, 1, SPAWNER_CENTER_X, SPAWNER_CENTER_Y);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), false);
    expect(goal.kind).toBe('REST');
  });

  it('FLEEs a hunter locked onto this seat (flag-gated)', () => {
    const world = botsWorld();
    const me = world.players.get(SEAT)!;
    world.hunters.set(
      asHunterId(0),
      makeHunter({
        id: asHunterId(0),
        pos: { x: me.avatarPos.x + 50, y: me.avatarPos.y },
        targetPlayerId: SEAT,
        spawnedAtTick: world.tick,
      }),
    );
    expect(chooseGoal(world, SEAT, BOT_CONFIGS.HARD, mulberry32(1), true).kind).toBe('FLEE');
    // NOOB doesn't know to run.
    expect(chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), true).kind).not.toBe('FLEE');
  });

  it('CLEANs its own fouled structure (HARD+), ignores enemy splats', () => {
    const world = botsWorld();
    placeOwnPrim(world, SEAT, SPAWNER_CENTER_X + 400, SPAWNER_CENTER_Y, 50);
    const ownPrim = [...world.primitives.values()].find((p) => p.placedBy === SEAT)!;
    world.poops.set(asPoopId(0), {
      id: asPoopId(0),
      pos: { x: ownPrim.pos.x, y: ownPrim.pos.y },
      state: 'SPLAT_STRUCTURE',
      landedAtTick: 0,
      fouledPrimId: ownPrim.id,
    } as never);
    expect(chooseGoal(world, SEAT, BOT_CONFIGS.HARD, mulberry32(1), true).kind).toBe('CLEAN');
    expect(chooseGoal(world, SEAT, BOT_CONFIGS.MID, mulberry32(1), true).kind).not.toBe('CLEAN');
  });

  it('SEVERs the nearest enemy bond when charged (rng under severChance)', () => {
    const world = botsWorld();
    // Enemy (seat 2) builds two bonded prims.
    const enemy = asPlayerId(2);
    placeOwnPrim(world, enemy, SPAWNER_CENTER_X - 400, SPAWNER_CENTER_Y, 60);
    placeOwnPrim(world, enemy, SPAWNER_CENTER_X - 440, SPAWNER_CENTER_Y, 61);
    expect(world.bonds.size).toBeGreaterThan(0);
    const me = world.players.get(SEAT)!;
    me.disruptionCharges = 1;
    // IMBA severChance 0.9 — first mulberry32(7) draw is < 0.9.
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.IMBA, mulberry32(7), true);
    expect(goal.kind).toBe('SEVER');
  });

  it('never SEVERs without a charge', () => {
    const world = botsWorld();
    const enemy = asPlayerId(2);
    placeOwnPrim(world, enemy, SPAWNER_CENTER_X - 400, SPAWNER_CENTER_Y, 60);
    placeOwnPrim(world, enemy, SPAWNER_CENTER_X - 440, SPAWNER_CENTER_Y, 61);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.IMBA, mulberry32(7), false);
    expect(goal.kind).not.toBe('SEVER');
  });
});

describe('S87 botBrain — build placement', () => {
  it('first placement = home anchor outside the spawner zone, in own sector', () => {
    const world = botsWorld();
    const pos = chooseBuildPos(world, SEAT, 3, BOT_CONFIGS.HARD, mulberry32(2));
    const d = Math.hypot(pos.x - SPAWNER_CENTER_X, pos.y - SPAWNER_CENTER_Y);
    expect(d).toBeGreaterThan(SPAWNER_RADIUS);
    expect(isLegalBuildPos(pos, SEAT, world)).toBe(true);
  });

  it('growth placement lands within bond range of an own prim (smart)', () => {
    const world = botsWorld();
    placeOwnPrim(world, SEAT, SPAWNER_CENTER_X + 420, SPAWNER_CENTER_Y, 70);
    const own = [...world.primitives.values()].find((p) => p.placedBy === SEAT)!;
    const pos = chooseBuildPos(world, SEAT, 3, BOT_CONFIGS.IMBA, mulberry32(3));
    const d = Math.hypot(pos.x - own.pos.x, pos.y - own.pos.y);
    // GROWTH_STEP(48) + IMBA jitter(2) — comfortably inside AUTO_BOND_RADIUS(60).
    expect(d).toBeLessThan(60);
  });

  it('isLegalBuildPos rejects spawner zone, canvas margins kept', () => {
    const world = botsWorld();
    expect(isLegalBuildPos({ x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, SEAT, world)).toBe(false);
    expect(isLegalBuildPos({ x: 5, y: 5 }, SEAT, world)).toBe(false);
    expect(
      isLegalBuildPos({ x: CANVAS_WIDTH - 5, y: CANVAS_HEIGHT - 5 }, SEAT, world),
    ).toBe(false);
  });
});

describe('S87 botBrain — helpers', () => {
  it('pickTargetSpark: smart takes nearest; sloppy stays within the nearest 5', () => {
    const world = botsWorld();
    const me = world.players.get(SEAT)!;
    for (let i = 0; i < 8; i++) {
      addFreeSpark(world, 100 + i, me.avatarPos.x + 30 + i * 40, me.avatarPos.y);
    }
    const smart = pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.IMBA, mulberry32(5));
    expect(smart).toBe(asSparkId(100));
    const sloppy = pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.NOOB, mulberry32(5));
    expect([100, 101, 102, 103, 104].map(asSparkId)).toContain(sloppy);
  });

  it('nearestEnemyBond skips own bonds', () => {
    const world = botsWorld();
    placeOwnPrim(world, SEAT, SPAWNER_CENTER_X + 420, SPAWNER_CENTER_Y, 80);
    placeOwnPrim(world, SEAT, SPAWNER_CENTER_X + 460, SPAWNER_CENTER_Y, 81);
    expect(world.bonds.size).toBeGreaterThan(0);
    expect(nearestEnemyBond(world, SEAT, { x: 0, y: 0 })).toBeNull();
  });

  it('fleePoint runs away and clamps to the canvas', () => {
    const me = { x: 100, y: 100 };
    const hunter = { x: 200, y: 100 };
    const p = fleePoint(me, hunter);
    expect(p.x).toBeLessThan(me.x + 1);
    expect(p.x).toBeGreaterThanOrEqual(50);
    expect(p.y).toBeGreaterThanOrEqual(50);
  });
});
