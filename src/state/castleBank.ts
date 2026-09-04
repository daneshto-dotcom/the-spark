/**
 * SPARK — S146 P2 (V6-1.5): THE CASTLE INVENTORY — LIMITLESS, AND COUNTED BY TYPE.
 *
 * ## THE OWNER RULING THAT REPLACED THE SLOT BANK
 *
 * *"we will continue developing this by giving the castle limitless primitive place in the inventory.
 * and instead of putting them in their own boxes within the castle just hold the 6 shape parts and
 * show how many you have of each as the gatherer collects them by showing for example spiral x 6,
 * square x 2, etc... seeing how it is more of a tower defence we need to allow for that so that you
 * can actually use the codex library to build your shapes."*
 *
 * This closes the long-open `CASTLE_BANK_CAP` question (7 vs 12–13) by deleting the cap rather than
 * retuning it. Everything the cap existed to create — the full-bank stall, the WAITING-on-full
 * gatherer, the decant-to-make-room click, the "NEED n MORE" that could never be satisfied because
 * the composition was frozen — goes with it.
 *
 * ## WHY A FIXED 6-SLOT COUNT ARRAY AND NOT A `Map<SparkType, number>`
 *
 * `SparkType` is a contiguous numeric enum, `Dot = 0 … Spiral = 5`, so a plain array indexed BY the
 * enum is a total function over the type space: every seat's inventory has exactly
 * `ALL_SPARK_TYPES.length` entries, always, with no absent-vs-zero distinction to get wrong.
 *
 * That is not a style preference — it removes a determinism hazard. A `Map` iterates in INSERTION
 * order, so a host that banked a Square before a Circle and a client that received them the other way
 * round would hash the same inventory differently and desync, for free, with no incorrect logic
 * anywhere. (GEMINI-AUDITOR raised exactly this in Council; the fixed array makes the question
 * unaskable rather than answering it with a sort at every hash site.)
 *
 * ## WHAT THIS REPLACED, AND THE ONE THING THAT GOT HARDER
 *
 * The V6-1.3 bank stored WHOLE `Spark` ENTITIES, capped at 7. Its docblock argued that a count-only
 * bank was not viable, because `PULL_FROM_BANK` would then have to MINT a spark, and spark ids come
 * from the `Spawner`'s private `nextId`, which no reducer can reach — so a reducer-side mint would
 * need a second id space plus an argument for why the two can never collide.
 *
 * That argument was correct, and it is discharged rather than dodged: pulled shapes are minted from a
 * **descending NEGATIVE id space** (`world.nextPulledSparkId`, −1, −2, −3 …) while the Spawner only
 * ever mints ascending non-negatives. Disjointness is therefore structural — not a range agreement
 * two allocators have to keep honouring, but two number lines that cannot meet.
 *
 * ⭐ AND IT DELETED A HAZARD CLASS. `rebuildAuthorityAllocators` (migrationClaim.ts) used to have to
 * scan `castleBanks` for spark ids, because a banked entity was live-but-outside `freeSparks` — an
 * S141 P3 bug fix whose absence silently corrupted a promoted host's world. A counted inventory holds
 * NO ids at all, so that scan is not merely fixed, it is unnecessary.
 */

import { ALL_SPARK_TYPES, SparkType } from '../constants.ts';
import {
  CASTLE_PORCH_OFFSET_Y,
  CASTLE_PORCH_PITCH_X,
  CASTLE_PORCH_SLOT_CLEAR_RADIUS,
  CASTLE_PORCH_SLOTS,
} from '../constants.ts';
import type { PlayerId, Vec2 } from '../types.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import type { ZoneLayout } from './zones.ts';

/**
 * A seat's stored shapes as a tally indexed by `SparkType`. Length is always
 * `ALL_SPARK_TYPES.length` (6). **Uncapped** — any entry may grow without bound.
 */
export type CastleBank = number[];

/** A fresh, empty tally. Never share one instance between seats — each seat mutates its own. */
export function makeCastleBank(): CastleBank {
  return new Array<number>(ALL_SPARK_TYPES.length).fill(0);
}

/** Shared read-only zero tally for the "seat has banked nothing yet" read path. */
const EMPTY_BANK: readonly number[] = Object.freeze(
  new Array<number>(ALL_SPARK_TYPES.length).fill(0),
);

/** The tally for `seat`, or an all-zero tally. Never mutates the map (read path). */
export function bankOf(
  banks: ReadonlyMap<PlayerId, CastleBank>,
  seat: PlayerId,
): readonly number[] {
  return banks.get(seat) ?? EMPTY_BANK;
}

/** How many of ONE type `seat` is holding. */
export function bankCountOf(
  banks: ReadonlyMap<PlayerId, CastleBank>,
  seat: PlayerId,
  type: SparkType,
): number {
  return bankOf(banks, seat)[type as number] ?? 0;
}

/** TOTAL shapes held by `seat`, across all six types. */
export function bankCount(banks: ReadonlyMap<PlayerId, CastleBank>, seat: PlayerId): number {
  let total = 0;
  for (const n of bankOf(banks, seat)) total += n;
  return total;
}

/**
 * Store one shape of `type`.
 *
 * ⛔ THIS CANNOT FAIL, AND CALLERS MUST NOT REINTRODUCE A FAILURE PATH. The predecessor returned
 * `false` at cap and every caller grew a branch for it — the gatherer's WAITING-on-full stall, the
 * decant-to-make-room click, the free-slot arithmetic. Those branches are the deadlock the owner
 * played. A `void` return is the guarantee, in the type system, that no such branch can come back.
 */
export function bankAdd(
  banks: Map<PlayerId, CastleBank>,
  seat: PlayerId,
  type: SparkType,
): void {
  let cur = banks.get(seat);
  if (cur === undefined) {
    cur = makeCastleBank();
    banks.set(seat, cur);
  }
  cur[type as number] = (cur[type as number] ?? 0) + 1;
}

/**
 * Spend one shape of `type`. Returns false (and spends nothing) when the seat holds none.
 *
 * Used by both `PULL_FROM_BANK` (which then mints the entity) and `blueprintBuild`'s payment. Never
 * decrements below zero, so a raced double-spend degrades to a refused build rather than a negative
 * inventory that renders as `SQUARE x -1`.
 */
export function bankRemove(
  banks: Map<PlayerId, CastleBank>,
  seat: PlayerId,
  type: SparkType,
): boolean {
  const cur = banks.get(seat);
  if (cur === undefined) return false;
  const have = cur[type as number] ?? 0;
  if (have <= 0) return false;
  cur[type as number] = have - 1;
  return true;
}

/** PURE — the world position of porch slot `i` for `seat`. Deterministic; hashed-state safe. */
export function porchSlot(seat: number, i: number, layout: ZoneLayout): Vec2 {
  const home = castleAnchor(seat, layout);
  // Centre the row on the gate: slots fan symmetrically either side.
  const offset = (i - (CASTLE_PORCH_SLOTS - 1) / 2) * CASTLE_PORCH_PITCH_X;
  return { x: home.x + offset, y: home.y + CASTLE_PORCH_OFFSET_Y };
}

/**
 * S138 P2 — PURE: is `pos` sitting in one of `seat`'s own porch slots?
 *
 * Exists because of an owner playtest report: *"the bots in vs bots mode can still grab primitives
 * with their cruisers (original sparks and not with their gatherers which is not fair)"*. A bot used
 * to run TWO income channels — its gatherer hauling into its bank AND its avatar reaching into the
 * shared quarry via `PICKUP_SPARK`. This predicate is what narrows a bot's reach to shapes its OWN
 * gatherer paid for, so the quarry is off-limits to a bot cruiser.
 *
 * Uses the same `CASTLE_PORCH_SLOT_CLEAR_RADIUS` tolerance as `firstFreePorchSlot`, so "occupies a
 * slot" and "is a shape I may collect" are the same question asked from opposite sides — they cannot
 * drift apart.
 */
export function isOwnPorchSpark(seat: number, pos: Vec2, layout: ZoneLayout): boolean {
  const r2 = CASTLE_PORCH_SLOT_CLEAR_RADIUS * CASTLE_PORCH_SLOT_CLEAR_RADIUS;
  for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
    const s = porchSlot(seat, i, layout);
    const dx = pos.x - s.x;
    const dy = pos.y - s.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
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
  layout: ZoneLayout,
): number | null {
  const r2 = CASTLE_PORCH_SLOT_CLEAR_RADIUS * CASTLE_PORCH_SLOT_CLEAR_RADIUS;
  for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) {
    const s = porchSlot(seat, i, layout);
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

/*
 * ⛔ S163 P5 — `teardownCastleBanks` DELETED. One grep hit repo-wide: its own definition. Its
 * docblock claimed "teardown parity with the other entity families" and delivered none — neither
 * teardown orchestrator called it. No coverage gap: both reach the banks transitively via
 * `teardownGatherers`. If a named helper is ever wanted here, it must take `world` the way
 * `teardownGatherers` does — taking a bare Map is why nothing adopted this one; all five real
 * sites already hold `world`.
 */
