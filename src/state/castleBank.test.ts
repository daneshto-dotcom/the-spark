/**
 * SPARK — S146 P2 (V6-1.5): the LIMITLESS castle inventory, and the PULL path that mints from it.
 *
 * REPLACES the S136 cap/WAITING suite. Those tests pinned `CASTLE_BANK_CAP` to the recipe ladder,
 * asserted that a deposit REFUSES at cap, and asserted that a pull returns the SAME entity by index.
 * All three properties were deleted by the owner ruling — *"giving the castle limitless primitive
 * place in the inventory... just hold the 6 shape parts and show how many you have of each"* — so
 * keeping them would have pinned the bug rather than the behaviour.
 *
 * WHAT IS STILL PINNED, AND WHY IT MATTERS MORE NOW:
 *   • the PORCH geometry suite is unchanged. It encodes the original owner report (*"if there are
 *     multiple they are dropped on top of each other and when you try to grab one the other flies to
 *     all hells"*) as an invariant, and the porch is still where a pulled shape lands.
 *   • the MINT's id space. A pull no longer hands back a stored entity — it creates one — so the
 *     disjointness of the negative allocator from the Spawner's ascending ids is now load-bearing,
 *     and is asserted directly rather than argued in a comment.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  CASTLE_PORCH_SLOTS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asGathererId, asPlayerId, asSparkId, type GathererId, type SparkId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import {
  bankAdd,
  bankCount,
  bankCountOf,
  bankOf,
  firstFreePorchSlot,
  porchSlot,
} from './castleBank.ts';
import { castleAnchor, makeGatherer } from './gatherers/gatherer.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function baseWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 400;
  w.localPlayerId = P0;
  w.players.set(P0, makeIdlePlayer(P0, 0x3bd7ff, { x: 0, y: 0 }));
  w.scoreByPlayer.set(P0, 900);
  return w;
}

let nextId = 500;
const spark = (type: SparkType = SparkType.Dot) => {
  const id = asSparkId(nextId++);
  return makeFreeSpark({
    id,
    type,
    pos: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
};

/** Put `n` shapes straight into P0's inventory (the state a few haul cycles leave behind). */
function fillBank(w: World, n: number, types?: SparkType[]): void {
  for (let i = 0; i < n; i++) bankAdd(w.castleBanks, P0, types?.[i] ?? SparkType.Dot);
}

/** A gatherer standing at its keep, HAULING a shape (about to try to deposit). */
function loadedGathererAtKeep(w: World): { gid: GathererId; sid: SparkId } {
  const anchor = castleAnchor(0);
  const gid = asGathererId(0);
  const g = makeGatherer({
    id: gid,
    ownerPlayerId: P0,
    pos: { x: anchor.x, y: anchor.y + 74 },
    spawnedAtTick: 0,
  });
  const s = spark(SparkType.Square);
  s.escrow = 'hauled';
  s.pos = { x: g.pos.x, y: g.pos.y };
  s.prevPos = { x: g.pos.x, y: g.pos.y };
  w.freeSparks.set(s.id, s);
  g.state = 'HAULING';
  g.carriedSparkId = s.id;
  w.gatherers.set(gid, g);
  w.nextGathererId = 1;
  return { gid, sid: s.id };
}

const tickG = (w: World, gid: GathererId, n = 1): void => {
  for (let i = 0; i < n; i++) {
    w.tick++;
    dispatch(w, { type: 'GATHERER_TICK', gathererId: gid });
  }
};

describe('S146 P2 — the inventory is LIMITLESS and counted by type', () => {
  it('accepts far more than the old cap and never refuses', () => {
    const w = baseWorld();
    // 500 is arbitrary and that is the point: there is no number at which this starts failing.
    fillBank(w, 500);
    expect(bankCount(w.castleBanks, P0)).toBe(500);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Dot)).toBe(500);
  });

  it('tallies PER TYPE, and an untouched type reads zero rather than absent', () => {
    const w = baseWorld();
    fillBank(w, 6, [
      SparkType.Spiral, SparkType.Spiral, SparkType.Spiral,
      SparkType.Spiral, SparkType.Spiral, SparkType.Square,
    ]);
    // The owner's own example: "spiral x 6, square x 2, etc..."
    expect(bankCountOf(w.castleBanks, P0, SparkType.Spiral)).toBe(5);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(1);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(0);
    // A tally is a TOTAL function over the type space — six entries, always, never a hole.
    expect(bankOf(w.castleBanks, P0)).toHaveLength(ALL_SPARK_TYPES.length);
  });

  it('a seat that has banked nothing reads as all-zero, and that read cannot corrupt it', () => {
    const w = baseWorld();
    const empty = bankOf(w.castleBanks, P1);
    expect(empty).toHaveLength(ALL_SPARK_TYPES.length);
    expect(bankCount(w.castleBanks, P1)).toBe(0);
    // The shared EMPTY_BANK must not be writable through a read — otherwise one seat's deposit
    // would silently appear in every other seat's inventory.
    expect(() => {
      (empty as number[])[0] = 99;
    }).toThrow();
    expect(bankCount(w.castleBanks, P1)).toBe(0);
  });

  it('inventories are per-seat — filling yours does not fill mine', () => {
    const w = baseWorld();
    fillBank(w, 20);
    expect(bankCount(w.castleBanks, P0)).toBe(20);
    expect(bankCount(w.castleBanks, P1)).toBe(0);
  });
});

describe('S146 P2 — deposit moves the shape OUT of the world and can never fail', () => {
  it('a delivered shape leaves freeSparks and is counted by type', () => {
    const w = baseWorld();
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);
    expect(w.freeSparks.has(sid)).toBe(false);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(1);
  });

  it('⭐ deposits even when the inventory is already enormous — no WAITING, ever', () => {
    const w = baseWorld();
    fillBank(w, 400); // far past any cap that ever existed
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);
    const g = w.gatherers.get(gid)!;
    // The measured S145 deadlock was exactly this: a full bank parked the unit in WAITING holding
    // its cargo, and nothing could ever free it. It must go straight back to work instead.
    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
    expect(w.freeSparks.has(sid)).toBe(false);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Square)).toBe(1);
  });

  it("deposits into the OWNER's inventory, never a neighbour's", () => {
    const w = baseWorld();
    w.players.set(P1, makeIdlePlayer(P1, 0xff3b3b, { x: 0, y: 0 }));
    const { gid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);
    expect(bankCount(w.castleBanks, P0)).toBe(1);
    expect(bankCount(w.castleBanks, P1)).toBe(0);
  });
});

describe('S146 P2 — PULL is type-addressed and MINTS the shape', () => {
  it('puts a spark of the requested type on a porch slot and spends exactly one', () => {
    const w = baseWorld();
    fillBank(w, 3, [SparkType.Circle, SparkType.Circle, SparkType.Triangle]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Triangle });

    expect(bankCountOf(w.castleBanks, P0, SparkType.Triangle)).toBe(0);
    expect(bankCountOf(w.castleBanks, P0, SparkType.Circle)).toBe(2);
    const out = [...w.freeSparks.values()];
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe(SparkType.Triangle);
    expect(out[0]!.state.kind).toBe('Free');
    // The escrow marker is what stops `enforceSpawnerBounds` rim-snapping it back to the quarry.
    expect(out[0]!.escrow).toBe('banked');
    const slot = porchSlot(0, 0);
    expect(Math.hypot(out[0]!.pos.x - slot.x, out[0]!.pos.y - slot.y)).toBeLessThan(
      CASTLE_PORCH_SLOT_CLEAR_RADIUS,
    );
  });

  it('⭐ mints from a NEGATIVE id space, provably disjoint from the Spawner allocator', () => {
    const w = baseWorld();
    fillBank(w, 3, [SparkType.Dot, SparkType.Dot, SparkType.Dot]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Dot });
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Dot });

    const ids = [...w.freeSparks.keys()].map((k) => k as unknown as number);
    expect(ids).toHaveLength(2);
    // The Spawner only ever mints ascending NON-NEGATIVE ids, so a negative id cannot collide with
    // one no matter how long the match runs. This is the property that let the inventory stop
    // storing entities at all.
    for (const id of ids) expect(id).toBeLessThan(0);
    expect(new Set(ids).size).toBe(2); // and the allocator does not repeat itself
    expect(w.nextPulledSparkId).toBe(-3);
  });

  it('no-ops on a type the seat holds none of — never throws, never mints', () => {
    const w = baseWorld();
    fillBank(w, 2, [SparkType.Circle, SparkType.Circle]);
    expect(() =>
      dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Line }),
    ).not.toThrow();
    expect(w.freeSparks.size).toBe(0);
    expect(bankCount(w.castleBanks, P0)).toBe(2);
  });

  it('refuses when the porch is FULL and keeps the count (no silent loss)', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_PORCH_SLOTS + 3);
    for (let i = 0; i < CASTLE_PORCH_SLOTS + 1; i++) {
      dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Dot });
    }
    // One pull per slot landed; the extra one found no clear slot and spent nothing.
    expect(w.freeSparks.size).toBe(CASTLE_PORCH_SLOTS);
    expect(bankCount(w.castleBanks, P0)).toBe(3);
  });
});

describe('S136 P1 — THE OWNER-REPORTED BUG, as an invariant', () => {
  it('NO TWO SPARKS EVER SHARE A POSITION across a pull/place/pull sequence', () => {
    const w = baseWorld();
    fillBank(w, 8);
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
      dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Dot });
    }
    // Take one out of the MIDDLE — the exact sequence that co-located shapes under V6-1.2, because
    // its slot index was derived from an occupancy COUNT rather than from actual clearance.
    const all = [...w.freeSparks.values()];
    const middle = all[Math.floor(all.length / 2)]!;
    w.freeSparks.delete(middle.id);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, sparkType: SparkType.Dot });

    const positions = [...w.freeSparks.values()].map((s) => `${s.pos.x.toFixed(2)},${s.pos.y.toFixed(2)}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('firstFreePorchSlot skips an OCCUPIED slot rather than counting occupants', () => {
    const occupied = [porchSlot(0, 0)];
    expect(firstFreePorchSlot(0, occupied)).toBe(1);
  });

  it('returns null when every porch slot is taken', () => {
    const occupied = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(0, i));
    expect(firstFreePorchSlot(0, occupied)).toBeNull();
  });

  it('occupying ONE slot masks only that slot — the pitch clears the detection radius', () => {
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
      expect(firstFreePorchSlot(0, [porchSlot(0, i)])).toBe(i === 0 ? 1 : 0);
    }
  });

  it('every seat gets its own porch — two castles cannot share a slot', () => {
    const a = porchSlot(0, 0);
    const b = porchSlot(1, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(CASTLE_PORCH_SLOT_CLEAR_RADIUS * 2);
  });
});

describe('S136 P1 — teardown', () => {
  it('a match teardown clears the inventories with the gatherers (one economy, one teardown)', () => {
    const w = baseWorld();
    fillBank(w, 5);
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.castleBanks.size).toBe(0);
  });
});
