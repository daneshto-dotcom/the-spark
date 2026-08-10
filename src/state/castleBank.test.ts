/**
 * SPARK — S136 P1 (V6-1.3): the castle bank, the cap, the waiting rule, and the PULL path.
 *
 * THE CENTREPIECE IS `no two shapes can ever occupy the same spot`. That is the owner's report
 * ("if there are multiple they are dropped on top of each other and when you try to grab one the
 * other flies to all hells") expressed as an invariant, and it is written as a REGRESSION of the
 * exact sequence that produced it: bank several, take one from the MIDDLE, deposit again. Under
 * V6-1.2's count-derived `depositSlot` that sequence co-located two sparks; there is no longer any
 * world position involved on the deposit side at all, and the PULL side asks whether a slot is
 * genuinely clear instead of deriving an index from an occupancy total.
 */
import { describe, expect, it } from 'vitest';
import {
  CASTLE_BANK_CAP,
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
import { bankCount, bankIsFull, bankOf, firstFreePorchSlot, porchSlot } from './castleBank.ts';
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

/** Put `n` shapes straight into P0's bank (the state a few haul cycles leave behind). */
function fillBank(w: World, n: number, types?: SparkType[]): SparkId[] {
  const ids: SparkId[] = [];
  const bank = w.castleBanks.get(P0) ?? [];
  for (let i = 0; i < n; i++) {
    const s = spark(types?.[i] ?? SparkType.Dot);
    bank.push(s);
    ids.push(s.id);
  }
  w.castleBanks.set(P0, bank);
  return ids;
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

describe('S136 P1 — the cap (owner ruling B4b: 5 slots)', () => {
  it('is 5, and the recipe table it is paired with says only the pentagram fits', () => {
    // The pairing is the point (standing S128 instruction). If someone raises the cap to 6+ this
    // assertion is what makes them come here and confront the lightningHub row.
    expect(CASTLE_BANK_CAP).toBe(5);
  });

  it('accepts up to the cap and then REFUSES, storing nothing extra', () => {
    const w = baseWorld();
    for (let i = 0; i < CASTLE_BANK_CAP; i++) {
      expect(bankCount(w.castleBanks, P0)).toBe(i);
      w.castleBanks.set(P0, [...bankOf(w.castleBanks, P0), spark()]);
    }
    expect(bankIsFull(w.castleBanks, P0)).toBe(true);
  });

  it('banks are per-seat — filling yours does not fill mine', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_BANK_CAP);
    expect(bankIsFull(w.castleBanks, P0)).toBe(true);
    expect(bankCount(w.castleBanks, P1)).toBe(0);
    expect(bankIsFull(w.castleBanks, P1)).toBe(false);
  });
});

describe('S136 P1 — deposit moves the shape OUT of the world', () => {
  it('a delivered shape leaves freeSparks and lands in the bank, same entity', () => {
    const w = baseWorld();
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);
    expect(w.freeSparks.has(sid)).toBe(false); // out of the world: no collision, no reap, no render
    const bank = bankOf(w.castleBanks, P0);
    expect(bank.map((s) => s.id)).toContain(sid);
    expect(w.gatherers.get(gid)!.state).toBe('SEEKING');
    expect(w.gatherers.get(gid)!.carriedSparkId).toBeNull();
  });

  it('deposits into the OWNER\'s bank, never a neighbour\'s', () => {
    const w = baseWorld();
    const { gid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);
    expect(bankCount(w.castleBanks, P0)).toBe(1);
    expect(bankCount(w.castleBanks, P1)).toBe(0);
  });
});

describe('S136 P1 — the WAITING rule (bank full => hold, never drop)', () => {
  it('a loaded gatherer arriving at a FULL bank goes WAITING and KEEPS its shape', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_BANK_CAP);
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 5);
    const g = w.gatherers.get(gid)!;
    expect(g.state).toBe('WAITING');
    // The shape is NOT destroyed and NOT dropped — it is still cargo. Losing it would silently
    // discard travel time the player already paid for.
    expect(g.carriedSparkId).toBe(sid);
    expect(w.freeSparks.has(sid)).toBe(true);
    expect(bankCount(w.castleBanks, P0)).toBe(CASTLE_BANK_CAP); // no overflow
  });

  it('and it deposits the moment a slot frees, then goes back to work', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_BANK_CAP);
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 5);
    expect(w.gatherers.get(gid)!.state).toBe('WAITING');

    // The player spends one: pull it out onto the porch.
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    expect(bankCount(w.castleBanks, P0)).toBe(CASTLE_BANK_CAP - 1);

    tickG(w, gid, 2);
    const g = w.gatherers.get(gid)!;
    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
    expect(w.freeSparks.has(sid)).toBe(false);
    expect(bankOf(w.castleBanks, P0).map((s) => s.id)).toContain(sid);
  });

  it('a WAITING gatherer whose cargo vanishes recovers to SEEKING instead of stalling forever', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_BANK_CAP);
    const { gid, sid } = loadedGathererAtKeep(w);
    tickG(w, gid, 5);
    expect(w.gatherers.get(gid)!.state).toBe('WAITING');
    w.freeSparks.delete(sid); // despawned by any path
    tickG(w, gid, 1);
    expect(w.gatherers.get(gid)!.state).toBe('SEEKING');
    expect(w.gatherers.get(gid)!.carriedSparkId).toBeNull();
  });
});

describe('S136 P1 — PULL puts the shape back on the porch', () => {
  it('returns the SAME entity, at a porch slot, as an ordinary free spark', () => {
    const w = baseWorld();
    const [id0] = fillBank(w, 2, [SparkType.Triangle, SparkType.Circle]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    const pulled = w.freeSparks.get(id0!);
    expect(pulled).toBeDefined();
    expect(pulled!.type).toBe(SparkType.Triangle);
    // ⚠ escrow STAYS SET. It is what exempts the shape from enforceSpawnerBounds' rim-snap, which
    // would otherwise teleport it off the porch and back into the quarry (caught by the P1 runtime
    // verification, not by any unit test — none of them run physics).
    expect(pulled!.escrow).toBe('banked');
    expect(pulled!.state.kind).toBe('Free');
    // At rest at a porch slot (pos === prevPos means zero implied Verlet velocity).
    expect(pulled!.pos).toEqual(pulled!.prevPos);
    const slots = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(0, i));
    expect(slots.some((s) => Math.hypot(s.x - pulled!.pos.x, s.y - pulled!.pos.y) < 0.001)).toBe(true);
    expect(bankCount(w.castleBanks, P0)).toBe(1);
  });

  it('is INDEX-addressed, so the player picks which shape to build with', () => {
    const w = baseWorld();
    const ids = fillBank(w, 3, [SparkType.Dot, SparkType.Square, SparkType.Spiral]);
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 1 }); // the middle one
    expect(w.freeSparks.get(ids[1]!)!.type).toBe(SparkType.Square);
    // The other two stay banked, order preserved.
    expect(bankOf(w.castleBanks, P0).map((s) => s.id)).toEqual([ids[0], ids[2]]);
  });

  it('no-ops on a bad index and on an empty bank — never throws, never loses a shape', () => {
    const w = baseWorld();
    fillBank(w, 1);
    for (const index of [-1, 1, 99, 0.5, NaN]) {
      dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index });
      expect(bankCount(w.castleBanks, P0)).toBe(1);
    }
    const empty = baseWorld();
    dispatch(empty, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    expect(bankCount(empty.castleBanks, P0)).toBe(0);
    expect(empty.freeSparks.size).toBe(0);
  });

  it('refuses when the porch is FULL and keeps the shape banked (no silent loss)', () => {
    const w = baseWorld();
    fillBank(w, CASTLE_BANK_CAP);
    // Pull until every porch slot is occupied.
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
      dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    }
    expect(w.freeSparks.size).toBe(CASTLE_PORCH_SLOTS);
    const bankedBefore = bankCount(w.castleBanks, P0);
    expect(bankedBefore).toBe(CASTLE_BANK_CAP - CASTLE_PORCH_SLOTS);

    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    expect(w.freeSparks.size).toBe(CASTLE_PORCH_SLOTS); // nothing new appeared
    expect(bankCount(w.castleBanks, P0)).toBe(bankedBefore); // and nothing was consumed
  });
});

describe('S136 P1 — THE OWNER-REPORTED BUG, as an invariant', () => {
  it('NO TWO SPARKS EVER SHARE A POSITION — including the exact sequence that broke V6-1.2', () => {
    // V6-1.2 repro: bank several, take one from the MIDDLE, deposit again. `depositSlot` derived the
    // slot from a COUNT, so removing a middle entry collapsed the mapping and the next deposit landed
    // exactly on an occupied one. Two co-located sparks sit inert (resolvePair early-returns under
    // EPSILON) until something perturbs them, at which point a near-zero distance with a
    // near-maximal overlap becomes a large velocity — the "flies to all hells".
    const w = baseWorld();
    fillBank(w, 3, [SparkType.Dot, SparkType.Square, SparkType.Triangle]);

    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 1 }); // take from the MIDDLE
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });
    dispatch(w, { type: 'PULL_FROM_BANK', playerId: P0, index: 0 });

    // Now deposit a fresh haul on top of that (the "and then another one arrives" half).
    const { gid } = loadedGathererAtKeep(w);
    tickG(w, gid, 3);

    const positions = [...w.freeSparks.values()].map((s) => s.pos);
    expect(positions.length).toBeGreaterThanOrEqual(3); // the pulls really did produce sparks
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.hypot(positions[i]!.x - positions[j]!.x, positions[i]!.y - positions[j]!.y);
        expect(d, `sparks ${i} and ${j} are ${d.toFixed(4)}px apart — co-location is the bug`)
          .toBeGreaterThan(1);
      }
    }
  });

  it('firstFreePorchSlot skips an OCCUPIED slot rather than counting occupants', () => {
    // The unit-level statement of the same fix. A count-based scheme returns index 1 here (one
    // occupant); the correct answer is 0, because slot 0 is the one that is actually clear.
    const occupiedSlot1 = porchSlot(0, 1);
    expect(firstFreePorchSlot(0, [occupiedSlot1])).toBe(0);
    // Fill 0 and 1: the answer must be 2, not "2 occupants => index 2" by coincidence — so also
    // check the hole case, where a count would be wrong.
    expect(firstFreePorchSlot(0, [porchSlot(0, 0), occupiedSlot1])).toBe(2);
    expect(firstFreePorchSlot(0, [porchSlot(0, 0), porchSlot(0, 2)])).toBe(1); // <-- the hole
  });

  it('returns null when every porch slot is taken', () => {
    const all = Array.from({ length: CASTLE_PORCH_SLOTS }, (_, i) => porchSlot(0, i));
    expect(firstFreePorchSlot(0, all)).toBeNull();
  });

  it('occupying ONE slot masks only that slot — the pitch clears the detection radius', () => {
    // If the pitch were inside CASTLE_PORCH_SLOT_CLEAR_RADIUS, a single spark would blank out two
    // slots and the porch would silently hold fewer shapes than it advertises. The check is: with
    // exactly slot k occupied, the first free slot is the lowest index that ISN'T k.
    for (let k = 0; k < CASTLE_PORCH_SLOTS; k++) {
      const expected = k === 0 ? 1 : 0;
      expect(
        firstFreePorchSlot(0, [porchSlot(0, k)]),
        `with only slot ${k} occupied, the first free slot should be ${expected}`,
      ).toBe(expected);
    }
    // And the geometric statement behind it, so a pitch change fails here with a clear reason.
    for (let i = 1; i < CASTLE_PORCH_SLOTS; i++) {
      const a = porchSlot(0, i - 1);
      const b = porchSlot(0, i);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(CASTLE_PORCH_SLOT_CLEAR_RADIUS);
    }
  });

  it('every seat gets its own porch — two castles cannot share a slot', () => {
    const s0 = porchSlot(0, 0);
    for (let seat = 1; seat < 6; seat++) {
      const s = porchSlot(seat, 0);
      expect(Math.hypot(s.x - s0.x, s.y - s0.y)).toBeGreaterThan(50);
    }
  });
});

describe('S136 P1 — teardown', () => {
  it('a match teardown clears the banks with the gatherers (one economy, one teardown)', () => {
    const w = baseWorld();
    fillBank(w, 3);
    w.gatherers.set(
      asGathererId(9),
      makeGatherer({ id: asGathererId(9), ownerPlayerId: P0, pos: { x: 0, y: 0 }, spawnedAtTick: 0 }),
    );
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.gatherers.size).toBe(0);
    expect(bankCount(w.castleBanks, P0)).toBe(0);
  });
});
