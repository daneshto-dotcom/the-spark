/**
 * SPARK — S156 P2: THE FOG APPLIES TO BOTS, AND BOTS CAN LOOK.
 *
 * ## Two halves of one change
 *
 * Owner, on the fog: *"shouldnt my towers be hidden from him in fog of war during building stage and
 * he has to explore my zone with his cruiser/spark to see whats there? thats how it is for me at
 * least, not fair if bots see evcerything"*.
 *
 * Owner, on scouting: *"a saving bot doesnt need to look passive he can explore the map, see what
 * his neighbors are building and if they are building where."*
 *
 * S155 P7 built the per-seat vision substrate and deliberately shipped it INERT, because blinding a
 * bot without giving it a way to LOOK makes it dumber rather than fairer. These are therefore ONE
 * change: the fog is only fair once the bot has a patrol, and the patrol only matters once the fog
 * is real. Both are asserted here, in that order.
 *
 * ⚠ TWO FIXTURE TRAPS ARE PINNED IN THIS FILE ON PURPOSE, because both cost real time to find:
 *   1. Raiding is a FIGHT verb. A SEVER fixture that never sets a phase runs in BUILD, where the
 *      fog now correctly hides the target — so the test fails for a reason that looks like a bug.
 *   2. `canBuildNow` refuses every placement outside BUILD, so a fixture that builds during FIGHT
 *      leaves the seat stuck `Carrying` and the next pickup throws `carry-1 violation`. S155 flagged
 *      that message as a possible latent product defect; it is not. It is this. Build, then fight.
 */

import { describe, expect, it } from 'vitest';
import { FIGHT_PHASE_TICKS, PLAYER_COLORS, SparkType } from '../constants.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { computeVisionSourcesForSeat, fogActive, isPointVisible } from '../state/vision.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { ownZonePoint } from '../state/zones.fixtures.ts';
import { asPlayerId, asSparkId, type PlayerId } from '../types.ts';
import { BOT_CONFIGS } from './botConfig.ts';
import { chooseGoal, nearestEnemyBond, scoutPoint } from './botBrain.ts';

const L = 'QUADRANTS_4P' as const;
const ME = asPlayerId(1);
const FAR_ENEMY = asPlayerId(3); // the opposite quadrant on a 4-seat board

function board(): World {
  const world = makeWorld(11);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: Array.from({ length: 4 }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] })),
    botSeats: [1, 2, 3],
  });
  world.primitives.clear();
  world.bonds.clear();
  world.creatureSpawners.clear();
  world.nextPrimitiveId = 0;
  world.nextBondId = 0;
  world.nextSpawnerId = 0;
  return world;
}

function placePrim(world: World, seat: PlayerId, x: number, y: number, sparkId: number): void {
  world.freeSparks.set(asSparkId(sparkId), {
    id: asSparkId(sparkId),
    type: SparkType.Dot,
    pos: { x, y },
    prevPos: { x, y },
    radius: 8,
    createdTick: 0,
    state: { kind: 'Free' },
  });
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: seat, pos: { x, y } });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId: asSparkId(sparkId), playerId: seat, pos: { x, y } });
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: seat,
    targetPrimitiveId: null,
    stiffnessTier: 'MID',
    placementPos: { x, y },
  });
}

/** A bonded pair in `seat`'s own quadrant. MUST be called while the world is still in BUILD. */
function buildStructure(world: World, seat: PlayerId, base: number): void {
  const p = ownZonePoint(seat as unknown as number, L);
  placePrim(world, seat, p.x, p.y, base);
  placePrim(world, seat, p.x + 30, p.y, base + 1);
}

/** Park my avatar at home, far from the enemy quadrant, so my cursor reveals nothing of theirs. */
function stayHome(world: World): void {
  const home = ownZonePoint(ME as unknown as number, L);
  dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: ME, pos: home });
}

/**
 * ⭐ Broke, so there is genuinely NOTHING better to do than look around.
 *
 * SCOUT sits at the BOTTOM of `chooseGoal`, below the economy branches, which is correct — a bot
 * with 50 points to spend should upgrade its hauler rather than go sightseeing. So a scouting test
 * that leaves the seat solvent measures the ECONOMY branch and reports `UPGRADE_GATHERER`, which is
 * the bot behaving exactly as designed. Zeroing the score is what makes SCOUT the branch under test.
 */
function broke(world: World): void {
  world.scoreByPlayer.set(ME, 0);
}

describe('S156 P2 — the fog is no longer a human-only mask', () => {
  it('⭐ during BUILD a bot CANNOT see a far enemy connector', () => {
    const world = board();
    buildStructure(world, FAR_ENEMY, 300);
    stayHome(world);
    expect(fogActive(world), 'the fog must actually be up for this test to mean anything').toBe(true);

    const me = world.players.get(ME)!;
    const vision = computeVisionSourcesForSeat(world, ME, me.avatarPos);
    expect(nearestEnemyBond(world, ME, me.avatarPos, vision)).toBeNull();
  });

  it('⛔ ANTI-VACUITY — the same bond IS found with the fog down', () => {
    // Without this, the test above would pass just as well if the enemy had never built anything.
    const world = board();
    buildStructure(world, FAR_ENEMY, 310);
    stayHome(world);
    const me = world.players.get(ME)!;
    expect(nearestEnemyBond(world, ME, me.avatarPos, null)).not.toBeNull();
  });

  it('⭐ a bot in BUILD does not raid what it cannot see (through the real chooseGoal)', () => {
    const world = board();
    buildStructure(world, FAR_ENEMY, 320);
    stayHome(world);
    const me = world.players.get(ME)!;
    me.raidPoints = 2;

    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, () => 0, false);
    expect(goal.kind).not.toBe('SEVER');
  });

  it('⭐ and in FIGHT the fog is DOWN, so combat behaviour is untouched', () => {
    const world = board();
    buildStructure(world, FAR_ENEMY, 330); // built in BUILD — canBuildNow refuses it in FIGHT
    stayHome(world);
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
    expect(fogActive(world)).toBe(false);

    const me = world.players.get(ME)!;
    me.raidPoints = 2;
    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, () => 0, false);
    expect(goal.kind).toBe('SEVER');
  });

  it('the fog binds EVERY seat symmetrically, not just the bots', () => {
    const world = board();
    buildStructure(world, ME, 340);
    const them = world.players.get(FAR_ENEMY)!;
    dispatch(world, {
      type: 'UPDATE_AVATAR_POS',
      playerId: FAR_ENEMY,
      pos: ownZonePoint(FAR_ENEMY as unknown as number, L),
    });
    const vision = computeVisionSourcesForSeat(world, FAR_ENEMY, them.avatarPos);
    expect(nearestEnemyBond(world, FAR_ENEMY, them.avatarPos, vision)).toBeNull();
  });
});

describe('S156 P2 — a bot with nothing to do goes LOOKING', () => {
  it('⭐ HARD and IMBA SCOUT where they used to REST', () => {
    const world = board();
    stayHome(world);
    broke(world);
    for (const tier of ['HARD', 'IMBA'] as const) {
      const goal = chooseGoal(world, ME, BOT_CONFIGS[tier], () => 0.99, false);
      expect(goal.kind, `${tier} should scout rather than loiter`).toBe('SCOUT');
    }
  });

  it('NOOB and MID still REST — scouting is a tier difference, not a global change', () => {
    const world = board();
    stayHome(world);
    broke(world);
    for (const tier of ['NOOB', 'MID'] as const) {
      const goal = chooseGoal(world, ME, BOT_CONFIGS[tier], () => 0.99, false);
      expect(goal.kind, `${tier} should not scout`).toBe('REST');
    }
  });

  it('⭐ the patrol ROTATES over the neighbours rather than staring at one', () => {
    const world = board();
    const seen = new Set<string>();
    for (let tick = 0; tick < 60 * 60 * 2; tick += 300) {
      world.tick = tick;
      const p = scoutPoint(world, ME)!;
      seen.add(`${Math.round(p.x)},${Math.round(p.y)}`);
    }
    // Three other seats on a four-seat board.
    expect(seen.size).toBe(3);
  });

  it('⭐ it walks toward where neighbours BUILD, not at their keep or at nothing', () => {
    const world = board();
    world.tick = 0;
    const p = scoutPoint(world, ME)!;
    // The destination must be nearer some enemy anchor than my own — otherwise it is not scouting.
    const distTo = (seat: number) => {
      const a = castleAnchor(seat, world.layout);
      return Math.hypot(a.x - p.x, a.y - p.y);
    };
    const mine = distTo(ME as unknown as number);
    const nearestEnemy = Math.min(distTo(0), distTo(2), distTo(3));
    expect(nearestEnemy).toBeLessThan(mine);
  });

  it('⭐ standing on the scout point REVEALS the neighbour it was chosen for', () => {
    const world = board();
    world.tick = 0;
    const target = scoutPoint(world, ME)!;
    // Which seat is this patrol leg aimed at? (tick 0 -> the first enemy in players order)
    const enemySeat = asPlayerId(0);
    buildStructure(world, enemySeat, 350);

    const home = ownZonePoint(ME as unknown as number, L);
    const blindAtHome = computeVisionSourcesForSeat(world, ME, home);
    const seeingOnPatrol = computeVisionSourcesForSeat(world, ME, target);
    const theirPrim = [...world.primitives.values()].find((pr) => pr.placedBy === enemySeat)!;

    expect(isPointVisible(blindAtHome, theirPrim.pos.x, theirPrim.pos.y)).toBe(false);
    expect(isPointVisible(seeingOnPatrol, theirPrim.pos.x, theirPrim.pos.y)).toBe(true);
  });

  it('⛔ scouting draws ZERO rng — the seeded stream is untouched', () => {
    const world = board();
    stayHome(world);
    broke(world);
    let draws = 0;
    const counting = (): number => {
      draws += 1;
      return 0.99;
    };
    const goal = chooseGoal(world, ME, BOT_CONFIGS.HARD, counting, false);
    expect(goal.kind).toBe('SCOUT');
    const withScouting = draws;

    // The load-bearing comparison: the SAME tier, once where it scouts and once where it cannot
    // (no neighbours to visit, so it falls through to REST). Identical draw counts prove the scout
    // branch itself consumes nothing from the stream.
    draws = 0;
    const lonely = board();
    lonely.scoreByPlayer.set(ME, 0);
    for (const id of [...lonely.players.keys()]) if (id !== ME) lonely.players.delete(id);
    const restGoal = chooseGoal(lonely, ME, BOT_CONFIGS.HARD, counting, false);
    expect(restGoal.kind).toBe('REST');
    expect(draws, 'the SCOUT branch drew from the seeded stream').toBe(withScouting);

    // And the patrol is a pure function — same tick, same answer, no hidden state.
    expect(scoutPoint(world, ME)).toEqual(scoutPoint(world, ME));
    expect(typeof mulberry32(1)()).toBe('number');
  });
});
