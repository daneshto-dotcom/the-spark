/**
 * SPARK — S87: bot brain unit tests (pure decision layer on synthetic worlds).
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CASTLE_PORCH_SLOTS,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../constants.ts';
import { bankAdd, porchSlot } from '../state/castleBank.ts';
import { zoneCount } from '../state/zones.ts';
import { nearOwnZonePoint, ownZonePoint } from '../state/zones.fixtures.ts';
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
// S148 P1 - bots play the quadrant board (a bots match seats 1 human + up to 3 bots).
const L = 'QUADRANTS_4P' as const;

// ⭐ S149 P1 — PLACEMENTS MUST SIT ON THE PLACING SEAT'S OWN GROUND. These fixtures used
// `SPAWNER_CENTER ± N` offsets, which the old influence-bubble legality allowed for anybody. Under
// the zone partition those points land in zone 2 (bottom-right) or zone 3 (bottom-left) regardless
// of who is placing — note `SPAWNER_CENTER_Y` is exactly the split, and the border convention gives
// a point ON a split line to the HIGHER-indexed side, so y=540 is always "bottom". SEAT 1 owns the
// TOP-right quadrant, so every one of its placements was enemy ground. None of these tests is about
// territory; the offsets were only ever "somewhere outside the quarry".
const SEAT_GROUND = ownZonePoint(SEAT, L);
/** The enemy these fixtures use — seat 2, the bottom-right quadrant. */
const ENEMY_SEAT = asPlayerId(2);
const ENEMY_GROUND = ownZonePoint(ENEMY_SEAT, L);

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
  // ⚠ S148 P2 — NOTHING IS SEEDED ANY MORE. START_GAME used to hand every bot seat a free pentagram
  // (deleted with seedBotSpawners: it was an unfair opening, R50). These clears are therefore no-ops
  // today, and are RETAINED only so these fixtures stay independent of whatever START_GAME does next.
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
  // ⛔ S138 P2 — the spark now has to be on the bot's OWN PORCH. Seeded in the quarry (as this test
  // did before) the bot correctly REFUSES to build, which is the point of the change.
  it('default: BUILD when a shape sits on my own porch and cooldown elapsed', () => {
    const world = botsWorld();
    const slot = porchSlot(SEAT as unknown as number, 0, L);
    addFreeSpark(world, 1, slot.x, slot.y);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), true);
    expect(goal.kind).toBe('BUILD');
  });

  it('⭐ a quarry spark alone does NOT produce BUILD — the bot has no claim on it', () => {
    const world = botsWorld();
    addFreeSpark(world, 1, SPAWNER_CENTER_X, SPAWNER_CENTER_Y);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), true);
    expect(goal.kind).toBe('REST'); // empty bank + empty porch ⇒ nothing legitimate to do
  });

  it('⭐ PULLs from its own bank when the porch is empty but the bank has stock', () => {
    const world = botsWorld();
    bankAdd(world.castleBanks, SEAT, SparkType.Dot);
    const goal = chooseGoal(world, SEAT, BOT_CONFIGS.NOOB, mulberry32(1), true);
    expect(goal.kind).toBe('PULL');
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
    placeOwnPrim(world, SEAT, SEAT_GROUND.x, SEAT_GROUND.y, 50);
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
    placeOwnPrim(world, enemy, ENEMY_GROUND.x, ENEMY_GROUND.y, 60);
    placeOwnPrim(world, enemy, ENEMY_GROUND.x - 40, ENEMY_GROUND.y, 61);
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
    placeOwnPrim(world, enemy, ENEMY_GROUND.x, ENEMY_GROUND.y, 60);
    placeOwnPrim(world, enemy, ENEMY_GROUND.x - 40, ENEMY_GROUND.y, 61);
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
    placeOwnPrim(world, SEAT, SEAT_GROUND.x, SEAT_GROUND.y, 70);
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
  // ⛔ S138 P2 — REWRITTEN, and the premise changed. This test used to scatter free sparks around the
  // bot's avatar (i.e. in the shared quarry) and assert the bot picked one. That behaviour is the
  // owner-reported defect: "the bots in vs bots mode can still grab primitives with their cruisers
  // ... which is not fair". A bot may now only collect from its OWN porch, so the fixture places
  // shapes in real porch slots and a companion test asserts the quarry is ignored.
  it('pickTargetSpark: smart takes nearest OWN-PORCH shape; sloppy stays within the nearest few', () => {
    const world = botsWorld();
    const me = world.players.get(SEAT)!;
    const seatIndex = SEAT as unknown as number;
    // One shape per porch slot, nearest-slot-first relative to the bot.
    const slots = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(seatIndex, i, L));
    const ordered = slots
      .map((p, i) => ({ i, d: (p.x - me.avatarPos.x) ** 2 + (p.y - me.avatarPos.y) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < slots.length; i++) addFreeSpark(world, 100 + i, slots[i].x, slots[i].y);

    const smart = pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.IMBA, mulberry32(5), SEAT);
    expect(smart).toBe(asSparkId(100 + ordered[0].i));

    const sloppy = pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.NOOB, mulberry32(5), SEAT);
    expect(slots.map((_, i) => asSparkId(100 + i))).toContain(sloppy);
  });

  it('⭐ pickTargetSpark IGNORES the shared quarry — a bot cruiser cannot take a loose spark', () => {
    const world = botsWorld();
    const me = world.players.get(SEAT)!;
    // Sparks right next to the bot AND in the middle of the quarry: all off-limits now.
    addFreeSpark(world, 200, me.avatarPos.x + 20, me.avatarPos.y);
    addFreeSpark(world, 201, SPAWNER_CENTER_X, SPAWNER_CENTER_Y);
    expect(pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.IMBA, mulberry32(5), SEAT)).toBeNull();
    expect(pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.NOOB, mulberry32(5), SEAT)).toBeNull();
  });

  it("pickTargetSpark will not take a shape off ANOTHER seat's porch", () => {
    const world = botsWorld();
    const me = world.players.get(SEAT)!;
    // Derived from the board, not from a retired ring constant.
    const other = ((SEAT as unknown as number) + 1) % zoneCount(L);
    const theirs = porchSlot(other, 0, L);
    addFreeSpark(world, 300, theirs.x, theirs.y);
    expect(pickTargetSpark(world, me.avatarPos, BOT_CONFIGS.IMBA, mulberry32(5), SEAT)).toBeNull();
  });

  it('nearestEnemyBond skips own bonds', () => {
    const world = botsWorld();
    placeOwnPrim(world, SEAT, SEAT_GROUND.x, SEAT_GROUND.y, 80);
    placeOwnPrim(world, SEAT, nearOwnZonePoint(SEAT, L, 40, 0).x, SEAT_GROUND.y, 81);
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
