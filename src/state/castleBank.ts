/**
 * SPARK — S136 P1 (V6-1.3): THE CASTLE BANK.
 *
 * WHY THIS REPLACES THE V6-1.2 STOCKPILE. The owner played the haul build and reported:
 *
 *   "when the gatherer brings primitives and drops them near base if there are multiple they are
 *    dropped on top of each other and when you try to grab one the other flies to all hells"
 *   "he should just store them within the castle and not outside"
 *
 * V6-1.2 stored a hauled shape as a REAL `freeSparks` physics entity parked at a computed world
 * position with `escrow:'banked'`. Two independent defects came out of that:
 *
 *  1. STACKING. `depositSlot` chose its slot by COUNTING currently-banked sparks
 *     (`x = home.x - 54 + (banked % 5) * 27`). A count is an occupancy total, not a high-water
 *     index, so any hole collapsed the mapping: bank 3, grab the 1st, the count falls 3 -> 2, and
 *     the next deposit is written to index 2 — exactly on top of the shape already sitting there.
 *
 *  2. THE FLING. Not a divide-by-zero. `resolvePair` early-returns when `distSq < EPSILON`, so an
 *     EXACT stack is inert — which is why it looked fine until touched. The moment a grab perturbs
 *     the pair off exact-zero, `dist` is ~0 while `overlap` is ~`minDist/2`, so one substep applies
 *     a near-maximal positional correction, and the collision module's own docblock notes that
 *     momentum "is recovered implicitly by Verlet on the next substep" — which turns that jab into
 *     a large velocity. Banked sparks were never exempt from collision; the `escrow === undefined`
 *     tests in physicsLoop exempt them only from the soft cap and the TTL reap.
 *
 * THE FIX IS STRUCTURAL, NOT A PATCH. A banked shape stops being IN THE WORLD at all: it is lifted
 * out of `world.freeSparks` and held in the owner's bank, INSIDE the castle. Nothing to co-locate,
 * nothing for the collision solver to see, nothing for the reap to find. Both defects cease to have
 * a surface — which is why this is the owner's fix (item 4) and not merely a slot-index correction.
 *
 * The player gets a shape back by PULLING it onto the castle porch (owner item 5, "pull them and
 * build them one by one"): the SAME spark is put back into `freeSparks` at the first genuinely
 * UNOCCUPIED porch slot, and the shipped drag-and-place flow takes it from there. That occupancy
 * test — rather than a count — is the actual lesson of defect 1, applied.
 */

import {
  CASTLE_BANK_CAP,
  CASTLE_PORCH_OFFSET_Y,
  CASTLE_PORCH_PITCH_X,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  CASTLE_PORCH_SLOTS,
} from '../constants.ts';
import type { Spark } from '../game/spark.ts';
import type { PlayerId, Vec2 } from '../types.ts';
import { castleAnchor } from './gatherers/gatherer.ts';

/**
 * A seat's stored shapes, oldest first. Length is capped at CASTLE_BANK_CAP.
 *
 * ⚠ WHY THIS HOLDS THE WHOLE `Spark` AND NOT JUST ITS `SparkType`. A type-only bank would force the
 * PULL path to MINT a new spark, and spark ids are minted by the Spawner's own `nextId` counter
 * (spawner.ts) which no reducer can reach — so a reducer-side mint would need a second, disjoint id
 * space and an argument about why the two can never collide. Storing the entity sidesteps that
 * entirely: the shape the gatherer carried home is the SAME object that comes back out, keeping its
 * original id, and serialization reuses the shipped serializeSpark/deserializeSpark pair rather than
 * inventing a parallel wire shape.
 *
 * A banked spark is REMOVED from `world.freeSparks`, which is what makes it genuinely out-of-world:
 * collision, the spatial grid, the renderer, the soft cap and the TTL reap all iterate `freeSparks`,
 * so a stored shape is invisible to every one of them by construction. That is strictly stronger
 * than V6-1.2's `escrow` marker, which had to be checked at each site and was honoured by the cap
 * and the reap but NOT by the collision solver — the omission behind the owner's fling report.
 */
export type CastleBank = Spark[];

/** The bank for `seat`, or an empty list. Never mutates the map (read path). */
export function bankOf(
  banks: ReadonlyMap<PlayerId, CastleBank>,
  seat: PlayerId,
): readonly Spark[] {
  return banks.get(seat) ?? [];
}

export function bankCount(banks: ReadonlyMap<PlayerId, CastleBank>, seat: PlayerId): number {
  return bankOf(banks, seat).length;
}

export function bankIsFull(banks: ReadonlyMap<PlayerId, CastleBank>, seat: PlayerId): boolean {
  return bankCount(banks, seat) >= CASTLE_BANK_CAP;
}

/**
 * Store one shape. Returns false (and stores nothing) when the bank is at cap — the caller is
 * expected to leave the gatherer holding its cargo and WAIT, which is the owner's ruled behaviour
 * rather than dropping or destroying the shape.
 */
export function bankPush(
  banks: Map<PlayerId, CastleBank>,
  seat: PlayerId,
  spark: Spark,
): boolean {
  const cur = banks.get(seat);
  if (cur === undefined) {
    banks.set(seat, [spark]);
    return true;
  }
  if (cur.length >= CASTLE_BANK_CAP) return false;
  cur.push(spark);
  return true;
}

/**
 * Remove and return the shape at `index`, or null when the index is out of range. Index-addressed
 * (not FIFO) because the castle panel shows the held shapes and the player picks the one they want
 * — the whole point of a bank over a queue is choosing what to build next.
 */
export function bankTake(
  banks: Map<PlayerId, CastleBank>,
  seat: PlayerId,
  index: number,
): Spark | null {
  const cur = banks.get(seat);
  if (cur === undefined) return null;
  if (!Number.isInteger(index) || index < 0 || index >= cur.length) return null;
  const [taken] = cur.splice(index, 1);
  return taken ?? null;
}

/** PURE — the world position of porch slot `i` for `seat`. Deterministic; hashed-state safe. */
export function porchSlot(seat: number, i: number): Vec2 {
  const home = castleAnchor(seat);
  // Centre the row on the gate: slots fan symmetrically either side.
  const offset = (i - (CASTLE_PORCH_SLOTS - 1) / 2) * CASTLE_PORCH_PITCH_X;
  return { x: home.x + offset, y: home.y + CASTLE_PORCH_OFFSET_Y };
}

/**
 * PURE — the index of the first porch slot with nothing sitting in it, or null when the porch is
 * full.
 *
 * ⚠ THIS IS THE CORRECTED FORM OF THE V6-1.2 BUG. The old code derived a slot from a COUNT; this
 * one asks the actual question ("is this spot clear?") against real positions, so it cannot hand
 * back an occupied slot no matter what the player picks up, in what order, or how many holes the
 * sequence has. Occupancy is tested against every spark position the caller passes in, so a pulled
 * shape the player has not moved yet also blocks its own slot.
 */
export function firstFreePorchSlot(
  seat: number,
  occupied: readonly Vec2[],
): number | null {
  const r2 = CASTLE_PORCH_SLOT_CLEAR_RADIUS * CASTLE_PORCH_SLOT_CLEAR_RADIUS;
  for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
    const s = porchSlot(seat, i);
    let clear = true;
    for (const p of occupied) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (dx * dx + dy * dy <= r2) {
        clear = false;
        break;
      }
    }
    if (clear) return i;
  }
  return null;
}

/** Clear every seat's bank (teardown parity with the other entity families). */
export function teardownCastleBanks(banks: Map<PlayerId, CastleBank>): void {
  banks.clear();
}
