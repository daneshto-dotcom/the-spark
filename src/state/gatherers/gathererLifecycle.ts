/**
 * SPARK — gatherer lifecycle reducers (V6-1.1 → V6-1.4).
 *
 * ⚠ S141 P2 — THIS HEADER WAS WRONG IN TWO WAYS AND IS CORRECTED HERE. It said "ONE action in
 * V6-1.1" while the module declared five, and it said "the gatherer is static … parked at the keep"
 * fifty lines above a full three-state haul FSM. Both statements had been false since V6-1.2. A
 * reader scoping a change from this header would have concluded the file was a stub.
 *
 * Mirrors the creature/hunter/defender lifecycle shape: pure case-body helpers consumed by world.ts
 * dispatch. SEVEN actions today:
 *   BUY_GATHERER            — CLIENT INTENT. Spends GATHERER_PRICE victory points from the buyer's own
 *                             scoreByPlayer (ONE POOL — spending sets you back) and mints one unit.
 *   UPGRADE_GATHERER_SPEED  — CLIENT INTENT. Steps every unit the player owns (no unit-selection UI).
 *   SET_GATHERER_PREFERENCE — CLIENT INTENT. The V6-1.2 per-unit type filter. ⚠ Superseded in
 *                             precedence by the order queue below; retained as its fallback.
 *   PULL_FROM_BANK          — CLIENT INTENT. Moves one stored shape onto the porch to build with.
 *   ENQUEUE/CANCEL_GATHERER_ORDER — CLIENT INTENTs. The V6-1.4 ordered build queue (owner ruling B4).
 *   GATHERER_TICK           — host-internal. The SEEKING → HAULING → WAITING haul FSM.
 *
 * Host-authoritative throughout: a joiner's intent routes here on the host, and no reducer trusts the
 * client's view of price, ownership, bank contents or queue contents.
 */

import {
  GATHERER_DEPOSIT_OFFSET_Y,
  GATHERER_ORDER_QUEUE_MAX,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_PRICE,
  GATHERER_REACH,
  GATHERER_SPEED_UPGRADE_PRICE,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  type SparkType,
} from '../../constants.ts';
import type { Spark } from '../../game/spark.ts';
import { asGathererId, type GathererId, type PlayerId, type SparkId, type Vec2 } from '../../types.ts';
import { bankAdd, bankRemove, firstFreePorchSlot, porchSlot } from '../castleBank.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { asSparkId } from '../../types.ts';
import { spendScore } from '../gameMode.ts';
import type { World } from '../worldTypes.ts';
import { castleAnchor, gathererSpeed, makeGatherer, type Gatherer } from './gatherer.ts';

export interface BuyGathererAction {
  readonly type: 'BUY_GATHERER';
  readonly playerId: PlayerId;
}
export interface GathererTickAction {
  readonly type: 'GATHERER_TICK';
  readonly gathererId: GathererId;
}
export interface UpgradeGathererSpeedAction {
  readonly type: 'UPGRADE_GATHERER_SPEED';
  readonly playerId: PlayerId;
}
export interface SetGathererPreferenceAction {
  readonly type: 'SET_GATHERER_PREFERENCE';
  readonly playerId: PlayerId;
  readonly gathererId: GathererId;
  readonly preferredType: SparkType | null;
}
/**
 * S141 P2 (V6-1.4) — append ONE primitive type to the player's order queue. Owner ruling B4:
 * "click a shape N times ⇒ N queued". N clicks are N dispatches; the panel COALESCES them into one
 * `×N` chip for display, but the queue itself stays a flat ordered list because that is what makes
 * "leftmost is next" true without a second concept.
 */
export interface EnqueueGathererOrderAction {
  readonly type: 'ENQUEUE_GATHERER_ORDER';
  readonly playerId: PlayerId;
  readonly sparkType: SparkType;
}
/**
 * S141 P2 — remove ONE queued entry of `sparkType` (the LAST one, so cancelling undoes the most
 * recent click — the RTS convention, and the only one that makes repeated click/cancel symmetric).
 */
export interface CancelGathererOrderAction {
  readonly type: 'CANCEL_GATHERER_ORDER';
  readonly playerId: PlayerId;
  readonly sparkType: SparkType;
}

/**
 * S136 P1 (V6-1.3) — pull one stored shape out of the castle onto the porch, so the player can
 * build with it. Owner item 5: "you can either pull them and build them one by one".
 *
 * ⭐ S146 P2 — TYPE-ADDRESSED, NOT INDEX-ADDRESSED. The inventory is a per-type tally now, so there
 * are no slots to index into; the caller names the SHAPE it wants back. The castle panel's row for
 * that type is the click target, which is the same gesture the player already had.
 */
export interface PullFromBankAction {
  readonly type: 'PULL_FROM_BANK';
  readonly playerId: PlayerId;
  readonly sparkType: SparkType;
}

/**
 * Buy one gatherer from the placeholder keep. No-op (NOT an error) when the player is missing or
 * cannot afford it — the affordability guard is load-bearing: nothing downstream clamps a negative
 * score, and the buy button already dims when unaffordable. New gatherers fan out beside the keep
 * (deterministic, count-based) so they do not perfectly overlap.
 */
export function applyBuyGatherer(world: World, action: BuyGathererAction): World {
  const buyer = world.players.get(action.playerId);
  if (buyer === undefined) return world;
  const score = world.scoreByPlayer.get(action.playerId) ?? 0;
  if (score < GATHERER_PRICE) return world; // cannot afford → no-op, never a negative score
  spendScore(world, action.playerId, GATHERER_PRICE);

  let owned = 0;
  for (const g of world.gatherers.values()) if (g.ownerPlayerId === action.playerId) owned++;
  const anchor = castleAnchor(action.playerId as unknown as number);
  const id = asGathererId(world.nextGathererId++);
  world.gatherers.set(
    id,
    makeGatherer({
      id,
      ownerPlayerId: action.playerId,
      pos: {
        x: anchor.x + ((owned % 4) * 26 - 39),
        y: anchor.y + 38 + Math.floor(owned / 4) * 26,
      },
      spawnedAtTick: world.tick,
    }),
  );
  return world;
}

/**
 * V6-1.2 — buy ONE speed upgrade. It steps EVERY gatherer the player owns rather than a single unit:
 * V6-1.1/1.2 deliberately has no unit-selection UI (that is V6-1.4), so a per-unit upgrade would be
 * unspendable. No-op when unaffordable, when the player owns no gatherer (nothing to upgrade — do
 * not take the points), or when every owned gatherer is already at the cap.
 */
export function applyUpgradeGathererSpeed(world: World, action: UpgradeGathererSpeedAction): World {
  const buyer = world.players.get(action.playerId);
  if (buyer === undefined) return world;
  const owned = [...world.gatherers.values()].filter((g) => g.ownerPlayerId === action.playerId);
  // ⚠ THIS LINE IS REDUNDANT, AND THAT IS RECORDED ON PURPOSE. `[].every(...)` is vacuously TRUE,
  // so the cap guard below ALREADY returns early when the player owns nothing. The S135 mutation
  // matrix flagged this: deleting this line alone leaves the suite green. That is not weak
  // coverage — deleting BOTH guards DOES go red (verified). Kept for legibility, documented so a
  // future reader does not "fix" a phantom test gap that isn't one.
  if (owned.length === 0) return world;
  if (owned.every((g) => g.speedLevel >= GATHERER_MAX_SPEED_LEVEL)) return world;
  const score = world.scoreByPlayer.get(action.playerId) ?? 0;
  if (score < GATHERER_SPEED_UPGRADE_PRICE) return world;
  spendScore(world, action.playerId, GATHERER_SPEED_UPGRADE_PRICE);
  for (const g of owned) {
    if (g.speedLevel < GATHERER_MAX_SPEED_LEVEL) g.speedLevel++;
  }
  return world;
}

/**
 * S136 P1 / S146 P2 — move one hauled spark OUT of the world and into the owner's castle inventory.
 *
 * ⭐ THIS CAN NO LONGER FAIL. It used to return false at `CASTLE_BANK_CAP`, and the caller left the
 * gatherer standing there holding its cargo in WAITING. That branch WAS the deadlock the owner
 * played: measured twice in a real browser, the inventory filled in ~46 s and its composition then
 * froze for 11,449 further ticks with every build tile reading "NEED n MORE" forever. With a
 * limitless inventory there is no cap to refuse at, so the function returns void — the type system
 * now prevents a caller from growing a failure branch back.
 *
 * Deleting from `freeSparks` is what makes the shape genuinely out-of-world: the renderer, the soft
 * cap and the TTL reap all iterate that map, so one delete exempts the shape from every one at once.
 * Only the TYPE is retained; the entity itself is discarded (a pull MINTS a fresh one).
 */
function depositIntoCastle(world: World, seat: PlayerId, carried: Spark): void {
  bankAdd(world.castleBanks, seat, carried.type);
  // S141 P2 — a DELIVERY consumes one matching order (owner ruling B4: "each delivery POPS one").
  consumeGathererOrder(world, seat, carried.type);
  world.freeSparks.delete(carried.id);
}

/**
 * S136 P1 (V6-1.3) — PULL a stored shape out of the castle onto the porch.
 *
 * The stored spark RETURNS to the world as an ORDINARY Free spark, which is the whole point: the
 * shipped drag-and-place flow (AttractDrag → PLACE_FROM_FREE → placePrimitive) then handles it with
 * zero new code, and because PLACE_FROM_FREE delegates to `placePrimitive` the player keeps earning
 * disruption charges through the single `tickBuildAction` call site (R8 — verified in S136 A.0 to be
 * the only one). A bespoke build-from-bank placement path would have silently dropped SEVER and
 * SHRINK_TERRITORY.
 *
 * ⚠ NO-OP, NEVER AN ERROR, on: missing player, empty/short bank, or a FULL PORCH. The porch limit is
 * the anti-stacking guarantee — `firstFreePorchSlot` returns the first slot with nothing actually
 * sitting in it, so a pulled shape can never land on top of another one. If every slot is occupied
 * the shape STAYS BANKED (the player must place what they already pulled): the bank is read before
 * the porch check would discard anything, so a refused pull loses nothing.
 *
 * `escrow` is KEPT on the way out — see the comment at the assignment for why clearing it silently
 * teleports the shape back into the quarry.
 */
export function applyPullFromBank(world: World, action: PullFromBankAction): World {
  if (world.players.get(action.playerId) === undefined) return world;
  const seat = action.playerId as unknown as number;
  // Occupancy is tested against EVERY spark, not just this seat's — a stray spark that drifted onto
  // the porch still physically occupies the spot, and minting into it is the bug being prevented.
  const occupied = [...world.freeSparks.values()].map((s) => s.pos);
  const slotIndex = firstFreePorchSlot(seat, occupied);
  if (slotIndex === null) return world; // porch full → the shape stays in the inventory
  // Spend FIRST: if the seat holds none of this type there is nothing to mint and nothing changed.
  if (!bankRemove(world.castleBanks, action.playerId, action.sparkType)) return world;
  const at = porchSlot(seat, slotIndex);
  // ⭐ S146 P2 — the shape is MINTED, not returned. A counted inventory holds no entities, so the
  // spark that comes out is a NEW one drawn from the descending negative allocator. See the
  // `nextPulledSparkId` docblock (worldTypes.ts) for why the sign makes a collision with the
  // Spawner's ascending ids arithmetically impossible rather than merely unlikely.
  const spark = makeFreeSpark({
    id: asSparkId(world.nextPulledSparkId),
    type: action.sparkType,
    pos: { x: at.x, y: at.y },
    // Zero implied velocity (pos === prevPos) so it appears at rest on the porch.
    velocity: { x: 0, y: 0 },
    dt: 1,
    createdTick: world.tick,
  });
  world.nextPulledSparkId -= 1;
  // ⚠ THE ESCROW MARKER MUST STAY SET, AND THIS IS NOT OPTIONAL — it is what keeps the shape ON the
  // porch. `enforceSpawnerBounds` (spawner.ts) rim-snaps every Free spark with `escrow === undefined`
  // back inside the spawn disc, every substep. The first cut of this function cleared the escrow "so
  // it is an ordinary spark again", and the runtime verification caught the result immediately: the
  // pulled shape was teleported from the porch (685,614) toward the quarry rim (888,569), which also
  // registered as a ~194 px per-sample jump — i.e. clearing it reproduced a *worse* version of the
  // very fling the owner reported. Unit tests could not see this because none of them run physics.
  //
  // 'banked' is reused rather than adding a 'porch' literal: escrow means exactly "deliberately
  // outside the quarry, do not rim-snap me", which is precisely the porch's requirement, and a new
  // value would be a new serialized literal on the wire (the S110 'WALK' bump class) for no
  // behavioural gain. It also means a pre-S136 save's stray `escrow:'banked'` free spark degrades
  // gracefully — it simply behaves as a porch shape.
  //
  // Consequence, stated rather than discovered later: the escrow also exempts the shape from the
  // free-spark soft cap and the 10 s TTL reap (physicsLoop tests `escrow === undefined` for both). A
  // pulled shape therefore WAITS for the player instead of evaporating, which is the correct
  // behaviour — a gatherer already paid travel time for it — and the litter is bounded by
  // CASTLE_PORCH_SLOTS regardless.
  spark.escrow = 'banked';
  world.freeSparks.set(spark.id, spark);
  return world;
}

/**
 * V6-1.2 — set (or clear) one gatherer's preferred shape. The owner-facing gesture is a CLICK on the
 * gatherer, which cycles Any → the six primitives → Any; the reducer takes the resolved value so the
 * same action can serve a future picker UI without a second code path. Ownership is enforced: you
 * cannot re-task another player's unit.
 */
export function applySetGathererPreference(world: World, action: SetGathererPreferenceAction): World {
  const g = world.gatherers.get(action.gathererId);
  if (g === undefined) return world;
  if (g.ownerPlayerId !== action.playerId) return world;
  g.preferredType = action.preferredType;
  return world;
}

/**
 * S141 P2 — the ORDER QUEUE reducers. Both follow `applyPullFromBank`'s NO-OP-NEVER-AN-ERROR shape,
 * NOT `placePrimitive`'s throw-on-guard: `placePrimitive` is the only reducer family that throws, and
 * a stale client index reaching a throwing reducer would kill the host's dispatch loop.
 */
export function applyEnqueueGathererOrder(world: World, action: EnqueueGathererOrderAction): World {
  if (world.players.get(action.playerId) === undefined) return world;
  const q = world.gathererOrders.get(action.playerId);
  if (q === undefined) {
    world.gathererOrders.set(action.playerId, [action.sparkType]);
    return world;
  }
  // ⚠ BOUNDED. Without a cap a player can hold the mouse down and grow an unbounded array that is
  // SERIALIZED AND HASHED — i.e. a self-inflicted wire and hash cost with no gameplay meaning. The
  // cap is generous enough that no real queue reaches it and small enough that a stuck button cannot
  // hurt the match. Hitting it is a silent no-op, exactly like a full porch refusing a pull.
  if (q.length >= GATHERER_ORDER_QUEUE_MAX) return world;
  q.push(action.sparkType);
  return world;
}

export function applyCancelGathererOrder(world: World, action: CancelGathererOrderAction): World {
  const q = world.gathererOrders.get(action.playerId);
  if (q === undefined) return world;
  // LAST matching entry, so click-then-cancel is symmetric.
  for (let i = q.length - 1; i >= 0; i--) {
    if (q[i] === action.sparkType) {
      q.splice(i, 1);
      break;
    }
  }
  // Drop the empty array rather than leaving it: an empty queue and no queue must be the SAME state,
  // or two functionally identical worlds would hash differently.
  if (q.length === 0) world.gathererOrders.delete(action.playerId);
  return world;
}

/**
 * PURE — the order this gatherer should be working on, or null when the queue cannot supply one.
 *
 * ⭐ THE RANK IS TAKEN OVER **ALL** OF THE OWNER'S GATHERERS, NOT THE SEEKING SUBSET, AND THAT IS A
 * COUNCIL FIX. Both external seats independently rejected the first design, which ranked over the
 * currently-SEEKING units: that set changes every time ANY of the player's gatherers claims a spark
 * or deposits, so a unit that was rank 0 becomes rank 1 next tick, retargets, and can thrash
 * indefinitely without ever completing a haul. Ranking over the full owned set — a set that only
 * changes when a gatherer is bought — makes each unit's slot STABLE for the life of the match.
 *
 * (Both seats also missed that `pickGathererTarget` is only called when the current target has become
 * invalid, so mid-walk thrash was already bounded. The stable rank is still strictly better, and it
 * is free.)
 *
 * Parallelism is the point: three gatherers against [Square, Square, Triangle] fetch all three at
 * once, which is the RTS feel the ruling describes. A gatherer whose rank exceeds the queue length
 * gets null and falls through to nearest-of-any-type, so extra units are never idled by a short queue.
 */
export function orderForGatherer(world: World, g: Gatherer): SparkType | null {
  const q = world.gathererOrders.get(g.ownerPlayerId);
  if (q === undefined || q.length === 0) return null;
  let rank = 0;
  for (const other of world.gatherers.values()) {
    if (other.ownerPlayerId !== g.ownerPlayerId) continue;
    // Deterministic: ids are unique and totally ordered, so this is the same on host, worker and replay.
    if ((other.id as unknown as number) < (g.id as unknown as number)) rank++;
  }
  return rank < q.length ? q[rank] : null;
}

/**
 * S141 P2 — CONSUME one order on DELIVERY. Owner ruling: "each delivery POPS one".
 *
 * Pops the FIRST entry matching the delivered type. A delivery that matches nothing pops nothing —
 * that was an opportunistic nearest-fetch (the empty-queue or rank-overflow fall-through), and it did
 * not fulfil an order.
 *
 * ⚠ ON DEPOSIT, NOT ON CLAIM, and the difference is real: popping at claim time would consume an
 * order for cargo that can still be lost mid-haul (the carrier can be despawned, the shape reaped),
 * leaving the player's queue silently shorter than the work actually done.
 */
export function consumeGathererOrder(world: World, seat: PlayerId, delivered: SparkType): boolean {
  const q = world.gathererOrders.get(seat);
  if (q === undefined) return false;
  const i = q.indexOf(delivered);
  if (i === -1) return false;
  q.splice(i, 1);
  if (q.length === 0) world.gathererOrders.delete(seat);
  return true;
}





/** Squared distance — the per-tick target scan is sqrt-free. */
const distSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/** True iff this spark is a legal quarry: Free, not already escrowed, and inside the spawn zone. */
function isHarvestable(s: Spark): boolean {
  if (s.state.kind !== 'Free' || s.escrow !== undefined) return false;
  return (
    distSq(s.pos, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }) <= SPAWNER_RADIUS * SPAWNER_RADIUS
  );
}

/**
 * Choose what to fetch: the NEAREST harvestable spark of the WANTED type, falling back to the nearest
 * of ANY type when nothing is wanted or none is available. That fall-back is the owner's B4 ruling
 * made concrete — a want is a PRIORITY OVERRIDE, never an on/off switch, so an unattended player keeps
 * earning. Deterministic: pure distance math with a lowest-id tie-break (never RNG), so host, worker
 * and replay all pick the same spark.
 *
 * S141 P2 — WHAT "WANTED" MEANS, AND THE PRECEDENCE THAT RESOLVES A CONTRADICTION IN THE RECORD.
 * Two mechanics now exist for the same job and the owner ruled against one of them:
 *   1. `world.gathererOrders` — the per-player ORDERED QUEUE (owner ruling B4). WINS.
 *   2. `Gatherer.preferredType` — a per-unit standing FILTER shipped in V6-1.2, which is precisely the
 *      "predicate/filter" B4 forbids in bold.
 * The queue takes precedence and the filter survives only as the fallback when the queue has nothing
 * for this unit. The filter is RETAINED rather than deleted because B6 ruled the phase additive-only
 * and it is a serialized + hashed field — removing it is a wire change with no gameplay upside, and
 * keeping it means the whole priority reverts in one line if the owner dislikes the queue.
 */
export function pickGathererTarget(world: World, g: Gatherer): SparkId | null {
  let best: SparkId | null = null;
  let bestD = Infinity;
  let bestPreferred = false;
  const ordered = orderForGatherer(world, g);
  const wanted = ordered ?? g.preferredType;
  // ⭐ S146 P2 — THE S145 SCARCITY SUSPENSION IS GONE WITH THE CAP.
  //
  // It existed because a full bank made every opportunistic haul cost an ORDERED shape its slot: the
  // measured run spent 3 of 4 freed slots on a Triangle, a Line and a Dot nobody asked for, and the
  // bank re-locked at 7/7. With a limitless inventory an opportunistic haul costs an ordered one
  // nothing, so the trade-off that justified suspending B4 no longer exists and the ruling applies
  // unconditionally again — *"a want is a PRIORITY OVERRIDE, never an on/off switch, so an unattended
  // player keeps earning"*. The loop below is that ruling: preferred type wins at any distance,
  // nearest-of-any otherwise.
  for (const s of world.freeSparks.values()) {
    if (!isHarvestable(s)) continue;
    const preferred = wanted !== null && s.type === wanted;
    const d = distSq(s.pos, g.pos);
    // A preferred-type spark always beats a non-preferred one, regardless of distance.
    const better =
      best === null ||
      (preferred && !bestPreferred) ||
      (preferred === bestPreferred &&
        (d < bestD || (d === bestD && (s.id as unknown as number) < (best as unknown as number))));
    if (better) {
      best = s.id;
      bestD = d;
      bestPreferred = preferred;
    }
  }
  return best;
}

/** Move `g` toward `to`, capped at its speed. Returns true once it has ARRIVED (within reach). */
function stepToward(g: Gatherer, to: Vec2, reach: number): boolean {
  const dx = to.x - g.pos.x;
  const dy = to.y - g.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= reach) return true;
  const step = gathererSpeed(g.speedLevel);
  if (d <= step) {
    g.pos.x = to.x;
    g.pos.y = to.y;
    return true;
  }
  g.pos.x += (dx / d) * step;
  g.pos.y += (dy / d) * step;
  return false;
}

/**
 * V6-1.2 — advance ONE gatherer one tick. Host-only, deterministic (pure float math; no RNG, no
 * wall-clock), fanned out from runHostTick like the creature/hunter ticks.
 *
 * SEEKING  → (re)acquire a target, walk to it, and on arrival take it into escrow ('hauled').
 * HAULING  → drag the escrowed spark to the owner's keep, then deposit it ('banked') and re-seek.
 *
 * ⚠ THE TARGET IS RE-VALIDATED EVERY TICK. A spark can be reaped, capped, grabbed by the player, or
 * claimed by another gatherer between ticks, so a stale target must degrade to "pick again" rather
 * than to a crash or a phantom haul — the same discipline botController.ts uses.
 */
export function applyGathererTick(world: World, action: GathererTickAction): World {
  const g = world.gatherers.get(action.gathererId);
  if (g === undefined) return world;

  if (g.state === 'HAULING') {
    const carried = g.carriedSparkId !== null ? world.freeSparks.get(g.carriedSparkId) : undefined;
    // The cargo vanished (despawned by any path) — drop the claim and go back to work.
    if (carried === undefined || carried.escrow !== 'hauled') {
      g.carriedSparkId = null;
      g.state = 'SEEKING';
      return world;
    }
    const home = castleAnchor(g.ownerPlayerId as unknown as number);
    const arrived = stepToward(g, { x: home.x, y: home.y + GATHERER_DEPOSIT_OFFSET_Y }, GATHERER_REACH);
    // The cargo rides the gatherer (pos slaved, prevPos kept equal so the physics substeps do not
    // fling it — it is escrowed and therefore skipped by the spawner bounds/reap anyway).
    carried.pos.x = g.pos.x;
    carried.pos.y = g.pos.y;
    carried.prevPos.x = g.pos.x;
    carried.prevPos.y = g.pos.y;
    if (arrived) {
      // S136 P1 (V6-1.3) — DEPOSIT INTO THE CASTLE, not onto the ground beside it.
      //
      // ⚠ S141 P2 CORRECTION: this used to say "the shape's TYPE is stored and the spark entity is
      // DESTROYED". Both halves are false and always were — `bankPush` stores the WHOLE live Spark
      // and `depositIntoCastle` merely removes it from `freeSparks`. The distinction matters: the
      // pull path depends on the SAME entity coming back out with its original id, which is exactly
      // why the bank holds entities rather than types (see castleBank.ts). This is
      // owner playtest item 4 ("he should just store them within the castle and not outside"), and
      // it is what structurally deletes items 3's two defects: V6-1.2 parked the shape as a real
      // physics entity at a count-derived slot, which co-located shapes whenever the player took one
      // from the middle, and a co-located pair converts into a large velocity the instant it is
      // perturbed. A type in a list has no position to collide at. See castleBank.ts.
      depositIntoCastle(world, g.ownerPlayerId, carried);
      g.carriedSparkId = null;
      g.state = 'SEEKING';
      g.targetSparkId = null;
    }
    return world;
  }

  if (g.state === 'WAITING') {
    // ⭐ S146 P2 — THIS STATE IS NOW UNREACHABLE GOING FORWARD, AND THE HANDLER STAYS ANYWAY.
    //
    // Nothing enters WAITING any more: it existed only for "the bank is full", and the inventory is
    // limitless. But `state` is SERIALIZED on both the disk save and the wire, so a gatherer can
    // still ARRIVE here — from a v21 save, or from a snapshot a peer sent before the upgrade.
    // Deleting the branch would strand that unit forever in a state with no exit, holding cargo, in
    // a world where nothing can ever free it. (GEMINI-AUDITOR flagged exactly this in Council and
    // was right.) So the handler is retained and drains unconditionally into SEEKING.
    const carried = g.carriedSparkId !== null ? world.freeSparks.get(g.carriedSparkId) : undefined;
    if (carried === undefined || carried.escrow !== 'hauled') {
      g.carriedSparkId = null;
      g.state = 'SEEKING';
      return world;
    }
    depositIntoCastle(world, g.ownerPlayerId, carried);
    g.carriedSparkId = null;
    g.targetSparkId = null;
    g.state = 'SEEKING';
    return world;
  }

  // SEEKING — re-validate, then (re)acquire.
  const current = g.targetSparkId !== null ? world.freeSparks.get(g.targetSparkId) : undefined;
  if (current === undefined || !isHarvestable(current)) {
    g.targetSparkId = pickGathererTarget(world, g);
  }
  if (g.targetSparkId === null) return world; // nothing to fetch this tick — hold position
  const target = world.freeSparks.get(g.targetSparkId);
  if (target === undefined) {
    g.targetSparkId = null;
    return world;
  }
  if (stepToward(g, target.pos, GATHERER_REACH)) {
    // CLAIM IT. Escrow is set BEFORE anything else so no second gatherer can take the same spark on
    // the same tick (isHarvestable rejects an escrowed spark) — the fan-out is sequential per tick.
    target.escrow = 'hauled';
    g.carriedSparkId = target.id;
    g.targetSparkId = null;
    g.state = 'HAULING';
  }
  return world;
}

/**
 * S136 P1 — `depositSlot` and `isNearKeep` ARE DELETED, not fixed.
 *
 * They existed to place a banked shape in world space. Nothing is placed in world space any more:
 * a deposit LIFTS THE WHOLE SPARK out of `world.freeSparks` and holds it in `world.castleBanks`
 * (see the DEPOSIT branch above and the castleBank.ts docblock). ⚠ S141 P2 — this sentence used to
 * say a deposit "writes a TYPE … and destroys the spark", which is false in both halves; the entity
 * survives, which is what lets a pull return the same id. The count-based slot arithmetic that produced the owner's
 * stacking report has no replacement here BY DESIGN — its corrected form lives in
 * `firstFreePorchSlot`, which asks whether a spot is actually clear instead of deriving an index
 * from an occupancy total, and it governs the PULL path where exactly one shape appears at a time.
 */

/** Clear the gatherer population + reset the mint counter (teardown parity, all sites). */
export function teardownGatherers(world: World): void {
  world.gatherers.clear();
  world.nextGathererId = 0;
  // S136 P1 — the castle banks tear down WITH the gatherer family: they are one economy, since a
  // bank only ever fills because a gatherer hauled into it.
  //
  // ⚠ THIS IS NOT THE ONLY SITE, and the first draft of this comment wrongly claimed it was. There
  // are FIVE gatherer-teardown sites and only two of them route through this function: the other
  // three clear `world.gatherers` INLINE (gameMode.applyStartGame, gameMode.applyReturnToTitle,
  // godlyActions' abort cascade) and each needed its own `castleBanks.clear()`. The teardown test in
  // castleBank.test.ts caught the omission via RETURN_TO_TITLE — which is the whole reason to assert
  // teardown through a real dispatched action rather than by calling this helper directly.
  world.castleBanks.clear();
  // S141 P2 — the order queues tear down with the units they instruct. A queue that outlived its
  // gatherers would be a standing instruction to nobody, and would leak across matches.
  world.gathererOrders.clear();
}
