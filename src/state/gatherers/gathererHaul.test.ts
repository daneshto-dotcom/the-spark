/**
 * SPARK — V6-1.2 gatherer HAUL CYCLE tests (spawn zone → keep) + speed upgrade + preference.
 *
 * The owner played the V6-1.1 build and reported the decisive defect: the gatherers do not move.
 * These tests exist so that can never silently regress — the first one asserts the unit actually
 * CLOSES DISTANCE, not merely that some state field flipped, and the cycle test follows one shape
 * all the way from the quarry into the owner's castle bank.
 *
 * S136 P1 — the DESTINATION of that cycle changed on the owner's next playtest ("he should just
 * store them within the castle and not outside"): a delivered shape is lifted OUT of `freeSparks`
 * into `world.castleBanks` instead of being parked on the ground beside the keep. See the Phase 3
 * comment for why the replacement assertions are stronger than the ones they retired.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_SPEED_UPGRADE_PRICE,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../../constants.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { nextPreference } from '../../input/controls.ts';
import {
  asGathererId,
  asPlayerId,
  asSparkId,
  type GathererId,
  type SparkId,
  type Vec2,
} from '../../types.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { castleAnchor, gathererSpeed, makeGatherer } from './gatherer.ts';
import { bankCount, bankCountOf } from '../castleBank.ts';
import { pickGathererTarget } from './gathererLifecycle.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function baseWorld(score = 900): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 400;
  w.scoreByPlayer.set(P0, score);
  w.scoreProgress = score;
  return w;
}

/** One gatherer parked at P0's keep + one free spark sitting in the (half-size) spawn zone. */
function haulWorld(sparkType: SparkType = SparkType.Dot, sparkPos?: Vec2): {
  w: World;
  gid: GathererId;
  sid: SparkId;
} {
  const w = baseWorld();
  const anchor = castleAnchor(0);
  const gid = asGathererId(0);
  w.gatherers.set(
    gid,
    makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: anchor.x, y: anchor.y }, spawnedAtTick: 0 }),
  );
  w.nextGathererId = 1;
  const sid = asSparkId(77);
  w.freeSparks.set(
    sid,
    makeFreeSpark({
      id: sid,
      type: sparkType,
      pos: sparkPos ?? { x: SPAWNER_CENTER_X + 20, y: SPAWNER_CENTER_Y },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    }),
  );
  return { w, gid, sid };
}

const tick = (w: World, gid: GathererId, n: number): void => {
  for (let i = 0; i < n; i++) {
    w.tick++;
    dispatch(w, { type: 'GATHERER_TICK', gathererId: gid });
  }
};

/**
 * Tick until `done()` holds, up to a generous bound; returns the ticks taken (-1 if it never did).
 *
 * ⚠ WAIT ON THE EVENT, NEVER ON A TICK COUNT. The first draft of this file asserted "HAULING after
 * 420 ticks" and failed against WORKING code: pickup happens at ~154 and the delivery completes by
 * ~310, so at 420 the unit had already banked its shape and gone back to SEEKING. Hard-coded tick
 * counts make a test that breaks whenever speed, distance or the keep radius is tuned — all three of
 * which this slot changed. Waiting on the observable event is both robust and a stronger claim.
 */
const tickUntil = (w: World, gid: GathererId, done: () => boolean, max = 4000): number => {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    w.tick++;
    dispatch(w, { type: 'GATHERER_TICK', gathererId: gid });
  }
  return done() ? max : -1;
};

describe('V6-1.2 — the haul cycle (spawn zone → keep)', () => {
  it('walks to the spark, picks it up, carries it home, and BANKS it at the keep', () => {
    const { w, gid, sid } = haulWorld();
    const g = w.gatherers.get(gid)!;
    const spark = w.freeSparks.get(sid)!;
    expect(g.state).toBe('SEEKING');

    // Phase 1 — SEEK. It must actually CLOSE DISTANCE. This is the assertion that would have
    // caught the V6-1.1 "gatherers aren't moving" report; a state-flag-only test would not.
    const startD = Math.hypot(g.pos.x - spark.pos.x, g.pos.y - spark.pos.y);
    tick(w, gid, 20);
    expect(Math.hypot(g.pos.x - spark.pos.x, g.pos.y - spark.pos.y)).toBeLessThan(startD);

    // Phase 2 — PICK UP (wait for the event, not a guessed tick count).
    expect(tickUntil(w, gid, () => g.carriedSparkId !== null)).toBeGreaterThan(0);
    expect(g.state).toBe('HAULING');
    expect(g.carriedSparkId).toBe(sid);
    expect(spark.escrow).toBe('hauled');

    // Phase 3 — DELIVER INTO THE CASTLE, then return to work.
    //
    // ⚠ S136 P1 CHANGED THIS CONTRACT ON PURPOSE (owner playtest item 4: "he should just store them
    // within the castle and not outside"). V6-1.2 asserted `spark.escrow === 'banked'` and a world
    // position near the keep — i.e. the shape stayed a physics entity parked on the ground, which is
    // precisely what produced the stacking and fling reports. The delivered shape now leaves the
    // world entirely, so the assertions below are STRICTLY STRONGER than the ones they replace:
    // "not in freeSparks at all" implies "not sitting in the quarry" and cannot be satisfied by a
    // shape that is merely somewhere else on the board.
    expect(tickUntil(w, gid, () => bankCount(w.castleBanks, P0) === 1)).toBeGreaterThan(0);
    expect(g.carriedSparkId).toBeNull();
    expect(g.state).toBe('SEEKING');
    // It is OUT of the world — invisible to collision, the spatial grid, the soft cap and the reap.
    expect(w.freeSparks.has(sid)).toBe(false);
    // ⭐ S146 P2 — the inventory is a per-TYPE TALLY, so what survives a deposit is the TYPE, not
    // the entity. The old assertions checked id-identity because a pull used to hand the very same
    // Spark back; a pull now MINTS one, so identity is no longer a property this can (or should)
    // assert. Exactly one of the hauled type is held, and nothing else is.
    expect(bankCountOf(w.castleBanks, P0, spark.type)).toBe(1);
    expect(bankCount(w.castleBanks, P0)).toBe(1);
  });

  it('a hauled spark rides WITH the gatherer (it is not left behind in the zone)', () => {
    const { w, gid, sid } = haulWorld();
    const g = w.gatherers.get(gid)!;
    const spark = w.freeSparks.get(sid)!;
    tickUntil(w, gid, () => g.carriedSparkId !== null);
    // Advance one more tick so the carry-drag has actually run at least once.
    tick(w, gid, 1);
    expect(g.state).toBe('HAULING');
    expect(spark.pos.x).toBe(g.pos.x);
    expect(spark.pos.y).toBe(g.pos.y);
  });

  it('a faster gatherer covers more ground in the same number of ticks', () => {
    const slow = haulWorld();
    const fast = haulWorld();
    fast.w.gatherers.get(fast.gid)!.speedLevel = GATHERER_MAX_SPEED_LEVEL;
    const startX = slow.w.gatherers.get(slow.gid)!.pos.x;
    tick(slow.w, slow.gid, 10);
    tick(fast.w, fast.gid, 10);
    const slowMoved = Math.abs(slow.w.gatherers.get(slow.gid)!.pos.x - startX);
    const fastMoved = Math.abs(fast.w.gatherers.get(fast.gid)!.pos.x - startX);
    expect(fastMoved).toBeGreaterThan(slowMoved);
  });

  it('PREFERENCE beats distance, but falls back to nearest when that type is absent', () => {
    // NEAR dot (id 77) at centre+10, FAR square (id 88) at centre-100. Distances are measured from
    // the GATHERER, so it is parked at the zone's right edge to make "near" and "far" unambiguous —
    // at its keep (left of the zone) the left-hand spark is the closer one, which is what made the
    // first draft of this assertion wrong. Geometry stated explicitly rather than assumed.
    const { w, gid } = haulWorld(SparkType.Dot, { x: SPAWNER_CENTER_X + 10, y: SPAWNER_CENTER_Y });
    const far = asSparkId(88);
    w.freeSparks.set(
      far,
      makeFreeSpark({
        id: far,
        type: SparkType.Square,
        pos: { x: SPAWNER_CENTER_X - 100, y: SPAWNER_CENTER_Y },
        velocity: { x: 0, y: 0 },
        dt: 1 / 60,
        createdTick: 0,
      }),
    );
    const g = w.gatherers.get(gid)!;
    g.pos.x = SPAWNER_CENTER_X + SPAWNER_RADIUS;
    g.pos.y = SPAWNER_CENTER_Y;
    // Sanity: the dot really IS the nearer one from here, or the test below proves nothing.
    expect(Math.abs(g.pos.x - (SPAWNER_CENTER_X + 10))).toBeLessThan(
      Math.abs(g.pos.x - (SPAWNER_CENTER_X - 100)),
    );

    g.preferredType = SparkType.Square;
    expect(pickGathererTarget(w, g)).toBe(far); // preference wins over the NEARER dot

    g.preferredType = null;
    expect(pickGathererTarget(w, g)).toBe(asSparkId(77)); // plain nearest

    // A preference for a type that is not present must NOT stall the unit — the owner's B4 ruling:
    // a filter is a PRIORITY OVERRIDE, never an on/off switch, so an unattended player keeps earning.
    g.preferredType = SparkType.Spiral;
    expect(pickGathererTarget(w, g)).toBe(asSparkId(77));
  });

  it('only harvests the QUARRY: never a banked shape, never one outside the zone', () => {
    const { w, gid } = haulWorld();
    const outside = asSparkId(99);
    w.freeSparks.set(
      outside,
      makeFreeSpark({
        id: outside,
        type: SparkType.Dot,
        pos: { x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 300, y: SPAWNER_CENTER_Y },
        velocity: { x: 0, y: 0 },
        dt: 1 / 60,
        createdTick: 0,
      }),
    );
    const g = w.gatherers.get(gid)!;
    // Standing right on top of the outside spark, it still goes for the one in the quarry.
    g.pos.x = SPAWNER_CENTER_X + SPAWNER_RADIUS + 300;
    g.pos.y = SPAWNER_CENTER_Y;
    expect(pickGathererTarget(w, g)).toBe(asSparkId(77));

    // A banked shape is never re-harvested — otherwise a gatherer would loop forever carrying its
    // own delivery back to the keep it is already sitting on.
    w.freeSparks.get(asSparkId(77))!.escrow = 'banked';
    expect(pickGathererTarget(w, g)).toBeNull();
  });

  it('survives its TARGET vanishing mid-walk (reaped, or taken by another unit)', () => {
    const { w, gid, sid } = haulWorld();
    tick(w, gid, 5);
    w.freeSparks.delete(sid);
    tick(w, gid, 5);
    const g = w.gatherers.get(gid)!;
    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
    expect(g.targetSparkId).toBeNull();
  });

  it('survives its CARGO vanishing mid-haul (drops the claim, returns to work)', () => {
    const { w, gid, sid } = haulWorld();
    const gg = w.gatherers.get(gid)!;
    tickUntil(w, gid, () => gg.carriedSparkId !== null);
    expect(w.gatherers.get(gid)!.state).toBe('HAULING');
    w.freeSparks.delete(sid);
    tick(w, gid, 1);
    const g = w.gatherers.get(gid)!;
    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
  });

  it('two gatherers never carry the SAME spark', () => {
    const { w, gid, sid } = haulWorld();
    const g2id = asGathererId(1);
    const anchor = castleAnchor(0);
    w.gatherers.set(
      g2id,
      makeGatherer({ id: g2id, ownerPlayerId: P0, pos: { x: anchor.x, y: anchor.y }, spawnedAtTick: 0 }),
    );
    w.nextGathererId = 2;
    for (let i = 0; i < 400; i++) {
      w.tick++;
      dispatch(w, { type: 'GATHERER_TICK', gathererId: gid });
      dispatch(w, { type: 'GATHERER_TICK', gathererId: g2id });
    }
    const carriers = [...w.gatherers.values()].filter((g) => g.carriedSparkId === sid);
    expect(carriers.length).toBeLessThanOrEqual(1);
  });
});

describe('V6-1.2 — speed upgrade', () => {
  it('charges the price, steps EVERY owned gatherer, and is demonstrably faster', () => {
    const w = baseWorld(200);
    const anchor = castleAnchor(0);
    for (const n of [0, 1]) {
      const id = asGathererId(n);
      w.gatherers.set(
        id,
        makeGatherer({ id, ownerPlayerId: P0, pos: { x: anchor.x, y: anchor.y }, spawnedAtTick: 0 }),
      );
    }
    w.nextGathererId = 2;
    dispatch(w, { type: 'UPGRADE_GATHERER_SPEED', playerId: P0 });
    expect(w.scoreByPlayer.get(P0)).toBe(200 - GATHERER_SPEED_UPGRADE_PRICE);
    for (const g of w.gatherers.values()) expect(g.speedLevel).toBe(1);
    expect(gathererSpeed(1)).toBeGreaterThan(gathererSpeed(0));
  });

  it('never charges for nothing: unaffordable, owns none, or already at the cap', () => {
    const anchor = castleAnchor(0);

    const poor = baseWorld(GATHERER_SPEED_UPGRADE_PRICE - 1);
    const pid = asGathererId(0);
    poor.gatherers.set(pid, makeGatherer({ id: pid, ownerPlayerId: P0, pos: anchor, spawnedAtTick: 0 }));
    dispatch(poor, { type: 'UPGRADE_GATHERER_SPEED', playerId: P0 });
    expect(poor.gatherers.get(pid)!.speedLevel).toBe(0);
    expect(poor.scoreByPlayer.get(P0)).toBe(GATHERER_SPEED_UPGRADE_PRICE - 1);

    // Owns nothing → must NOT take the points (there is nothing to upgrade).
    const none = baseWorld(900);
    dispatch(none, { type: 'UPGRADE_GATHERER_SPEED', playerId: P0 });
    expect(none.scoreByPlayer.get(P0)).toBe(900);

    // Already capped → also no charge.
    const capped = baseWorld(900);
    const cid = asGathererId(0);
    capped.gatherers.set(cid, makeGatherer({ id: cid, ownerPlayerId: P0, pos: anchor, spawnedAtTick: 0 }));
    capped.gatherers.get(cid)!.speedLevel = GATHERER_MAX_SPEED_LEVEL;
    dispatch(capped, { type: 'UPGRADE_GATHERER_SPEED', playerId: P0 });
    expect(capped.scoreByPlayer.get(P0)).toBe(900);
    expect(capped.gatherers.get(cid)!.speedLevel).toBe(GATHERER_MAX_SPEED_LEVEL);
  });
});

describe('V6-1.2 — preference cycling + ownership', () => {
  it('nextPreference cycles Any → all six primitives → Any', () => {
    const seen: (SparkType | null)[] = [];
    let cur: SparkType | null = null;
    for (let i = 0; i < 7; i++) {
      cur = nextPreference(cur);
      seen.push(cur);
    }
    expect(seen.slice(0, 6)).toEqual([...ALL_SPARK_TYPES]);
    expect(seen[6]).toBeNull(); // wraps back to "Any"
  });

  it('you cannot re-task ANOTHER player gatherer', () => {
    const w = baseWorld();
    w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!, { x: 900, y: 500 }));
    const id = asGathererId(0);
    w.gatherers.set(
      id,
      makeGatherer({ id, ownerPlayerId: P0, pos: castleAnchor(0), spawnedAtTick: 0 }),
    );
    dispatch(w, {
      type: 'SET_GATHERER_PREFERENCE',
      playerId: P1,
      gathererId: id,
      preferredType: SparkType.Square,
    });
    expect(w.gatherers.get(id)!.preferredType).toBeNull(); // refused — not your unit

    dispatch(w, {
      type: 'SET_GATHERER_PREFERENCE',
      playerId: P0,
      gathererId: id,
      preferredType: SparkType.Square,
    });
    expect(w.gatherers.get(id)!.preferredType).toBe(SparkType.Square); // the owner may
  });
});
