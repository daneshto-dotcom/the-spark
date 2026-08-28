/**
 * SPARK — S156 P1: THE RAID LADDER.
 *
 * Owner ruling, given twice: *"bots should target 'the leader OR the nearest enemy whose score sits
 * closest above their own' — i.e. each bot punches one rung up the ladder!"*
 *
 * Before this, a bot raided whatever connector was NEAREST, so who absorbed the pressure was decided
 * by geometry: a runaway leader on the far side of the board was structurally safe. These tests pin
 * the ladder itself as a pure function, then prove through the real `chooseGoal` that the chosen
 * SEVER target follows the ladder rather than the distance — and, just as importantly, that the
 * pre-S156 nearest-enemy fallback still fires when the ladder has nothing to offer, so a charge is
 * never stranded.
 *
 * ⛔ THE LAST TEST IS THE LOAD-BEARING ONE. `chooseGoal` feeds a single seeded rng stream whose DRAW
 * ORDER `hostTick.replay`, `workerSim.differential` and `botController`'s same-seed test all depend
 * on. A targeting rule that consumed a draw would trade a balance fix for a desync, so the draw
 * COUNT is asserted to be identical with and without a ladder target.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { ownZonePoint } from '../state/zones.fixtures.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, asSparkId, type PlayerId } from '../types.ts';
import { BOT_CONFIGS } from './botConfig.ts';
import { chooseGoal, ladderTargetSeat, nearestEnemyBond } from './botBrain.ts';

const L = 'QUADRANTS_4P' as const;
/** The bot under test. Seat 0 is the human seat on a bots board. */
const ME = asPlayerId(1);

/** A 4-seat bots board (1 human + 3 bots), stripped to an empty field like botBrain.test.ts. */
function board(): World {
  const world = makeWorld(11);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: 4 }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] }));
  dispatch(world, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster,
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

/** Score the board directly — the ladder reads `scoreByPlayer` and nothing else. */
function score(world: World, pairs: Record<number, number>): void {
  for (const [seat, value] of Object.entries(pairs)) {
    world.scoreByPlayer.set(asPlayerId(Number(seat)), value);
  }
}

/** Place one prim for `seat` through the real dispatch pipeline (claim → place). */
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

/** Give `seat` a bonded pair inside its own zone, so it owns at least one raidable connector. */
function buildStructure(world: World, seat: PlayerId, sparkIdBase: number): void {
  const p = ownZonePoint(seat as unknown as number, L);
  placePrim(world, seat, p.x, p.y, sparkIdBase);
  placePrim(world, seat, p.x + 30, p.y, sparkIdBase + 1);
}

/** Who owns the bond a SEVER goal points at? */
function bondOwner(world: World, bondId: unknown): PlayerId | undefined {
  const bond = world.bonds.get(bondId as never);
  if (bond === undefined) return undefined;
  return world.primitives.get(bond.aId)?.placedBy;
}

describe('S156 P1 — ladderTargetSeat (pure)', () => {
  it('punches ONE RUNG UP: the lowest score strictly above mine, not the leader', () => {
    const world = board();
    score(world, { 0: 5, 1: 10, 2: 50, 3: 20 });
    // Above me (10): seat 3 at 20 and seat 2 at 50. The rung is 20, NOT the 50-point leader.
    expect(ladderTargetSeat(world, ME)).toBe(asPlayerId(3));
  });

  it('an enemy scoring EXACTLY my score is not "above" me', () => {
    const world = board();
    score(world, { 0: 0, 1: 10, 2: 10, 3: 40 });
    expect(ladderTargetSeat(world, ME)).toBe(asPlayerId(3));
  });

  it('when I lead, it suppresses the closest challenger BELOW instead of the weakest seat', () => {
    const world = board();
    score(world, { 0: 5, 1: 100, 2: 60, 3: 20 });
    expect(ladderTargetSeat(world, ME)).toBe(asPlayerId(2));
  });

  it('a flat 0–0 board has no ladder → null, so the caller keeps the pre-S156 behaviour', () => {
    const world = board();
    expect(ladderTargetSeat(world, ME)).toBeNull();
  });

  it('an all-equal board also has no ladder', () => {
    const world = board();
    score(world, { 0: 30, 1: 30, 2: 30, 3: 30 });
    expect(ladderTargetSeat(world, ME)).toBeNull();
  });

  it('ties above break by players insertion order (keep-first), never by rng', () => {
    const world = board();
    score(world, { 0: 25, 1: 10, 2: 25, 3: 25 });
    // Seats 0, 2 and 3 all sit at 25. Insertion order is roster order, so seat 0 wins.
    expect(ladderTargetSeat(world, ME)).toBe(asPlayerId(0));
    // And it is stable: the answer cannot move between calls.
    expect(ladderTargetSeat(world, ME)).toBe(asPlayerId(0));
  });
});

describe('S156 P1 — chooseGoal raids the ladder, not the neighbour', () => {
  /** IMBA severs at 0.9, so a 0-returning rng always clears the gate. */
  const alwaysSever = () => 0;

  it('⭐ severs the RUNG-UP seat even when another enemy is nearer', () => {
    const world = board();
    buildStructure(world, asPlayerId(2), 200);
    buildStructure(world, asPlayerId(3), 210);
    score(world, { 0: 0, 1: 10, 2: 90, 3: 20 }); // rung above 10 is seat 3
    const me = world.players.get(ME)!;
    me.disruptionCharges = 2;
    // Stand ON seat 2's structure, so seat 2 is unambiguously the NEAREST enemy.
    const near = ownZonePoint(2, L);
    dispatch(world, { type: 'UPDATE_AVATAR_POS', playerId: ME, pos: near });

    // ⛔ THE FIXTURE MUST DISCRIMINATE. If seat 3 were the nearer enemy, this test would pass with
    // the ladder ripped out and would be certifying nothing — the exact failure mode that cost S155
    // three rounds (measuring a NOOB at seat 2 while asserting about seat 1). So prove, through the
    // UNFILTERED helper, that geometry alone would have chosen seat 2. The assertion below is
    // therefore the ladder overriding distance, not distance agreeing with the ladder.
    const geometric = nearestEnemyBond(world, ME, near);
    expect(bondOwner(world, geometric?.bondId)).toBe(asPlayerId(2));

    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, alwaysSever, false);
    expect(goal.kind).toBe('SEVER');
    expect(bondOwner(world, (goal as { bondId: unknown }).bondId)).toBe(asPlayerId(3));
  });

  it('falls back to the nearest enemy when the rung has nothing raidable — a charge is never stranded', () => {
    const world = board();
    // Only seat 2 has built. The ladder still names seat 3, which owns nothing.
    buildStructure(world, asPlayerId(2), 220);
    score(world, { 0: 0, 1: 10, 2: 90, 3: 20 });
    const me = world.players.get(ME)!;
    me.disruptionCharges = 2;

    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, alwaysSever, false);
    expect(goal.kind).toBe('SEVER');
    expect(bondOwner(world, (goal as { bondId: unknown }).bondId)).toBe(asPlayerId(2));
  });

  it('a flat board still severs — the opening minutes are byte-identical to pre-S156', () => {
    const world = board();
    buildStructure(world, asPlayerId(2), 230);
    const me = world.players.get(ME)!;
    me.disruptionCharges = 2;

    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, alwaysSever, false);
    expect(goal.kind).toBe('SEVER');
    expect(bondOwner(world, (goal as { bondId: unknown }).bondId)).toBe(asPlayerId(2));
  });

  it('⛔ DETERMINISM — the ladder consumes ZERO extra rng draws', () => {
    function draws(scored: boolean): number {
      const world = board();
      buildStructure(world, asPlayerId(2), 240);
      buildStructure(world, asPlayerId(3), 250);
      if (scored) score(world, { 0: 0, 1: 10, 2: 90, 3: 20 });
      const me = world.players.get(ME)!;
      me.disruptionCharges = 2;
      let n = 0;
      const counting = (): number => {
        n += 1;
        return 0;
      };
      chooseGoal(world, ME, BOT_CONFIGS.IMBA, counting, false);
      return n;
    }
    // Flat board (no ladder) vs scored board (ladder active) — the same number of draws, so the
    // seeded stream's draw ORDER is unchanged and no replay/differential baseline moves.
    expect(draws(true)).toBe(draws(false));
  });

  it('the raid BUDGET is untouched — no charges means no SEVER, ladder or not', () => {
    const world = board();
    buildStructure(world, asPlayerId(3), 260);
    score(world, { 0: 0, 1: 10, 2: 90, 3: 20 });
    const me = world.players.get(ME)!;
    me.disruptionCharges = 0;

    const goal = chooseGoal(world, ME, BOT_CONFIGS.IMBA, alwaysSever, false);
    expect(goal.kind).not.toBe('SEVER');
  });

  it('a tier that cannot sever never raids, ladder or not', () => {
    const world = board();
    buildStructure(world, asPlayerId(3), 270);
    score(world, { 0: 0, 1: 10, 2: 90, 3: 20 });
    const me = world.players.get(ME)!;
    me.disruptionCharges = 2;

    const goal = chooseGoal(world, ME, BOT_CONFIGS.NOOB, alwaysSever, false);
    expect(goal.kind).not.toBe('SEVER');
  });
});

/** Guard against a silent config drift that would make `alwaysSever` a no-op above. */
describe('S156 P1 — fixture assumptions', () => {
  it('IMBA can sever and mulberry32(1) is a real stream (the fixtures depend on both)', () => {
    expect(BOT_CONFIGS.IMBA.canSever).toBe(true);
    expect(BOT_CONFIGS.IMBA.severChance).toBeGreaterThan(0);
    expect(BOT_CONFIGS.NOOB.canSever).toBe(false);
    expect(typeof mulberry32(1)()).toBe('number');
  });
});
