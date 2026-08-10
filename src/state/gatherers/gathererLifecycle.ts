/**
 * SPARK — V6-1.1 gatherer lifecycle reducers.
 *
 * Mirrors the creature/hunter/defender lifecycle shape: pure case-body helpers consumed by
 * world.ts dispatch. ONE action in V6-1.1:
 *   BUY_GATHERER — a CLIENT INTENT. Spends GATHERER_PRICE victory points from the buyer's own
 *                  scoreByPlayer (ONE POOL — spending sets you back) and mints one gatherer at
 *                  the buyer's keep. Host-authoritative: a joiner's intent routes here on the host.
 *
 * The gatherer is static in V6-1.1 (parked at the keep, cosmetically shapeshifting via a
 * renderer-only pure fn of (tick, gathererId)). Roaming/hauling + the bank are later slots.
 */

import {
  GATHERER_DEPOSIT_OFFSET_Y,
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
import { bankPush, bankTake, firstFreePorchSlot, porchSlot } from '../castleBank.ts';
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
 * S136 P1 (V6-1.3) — pull one stored shape out of the castle onto the porch, so the player can
 * build with it. Owner item 5: "you can either pull them and build them one by one".
 *
 * Index-addressed, not FIFO: the castle panel lists what is held and the player picks. `index` is a
 * position in the owner's bank at the moment the host applies the action.
 */
export interface PullFromBankAction {
  readonly type: 'PULL_FROM_BANK';
  readonly playerId: PlayerId;
  readonly index: number;
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
 * S136 P1 — move one hauled spark OUT of the world and into the owner's castle bank.
 *
 * Returns false when the bank is at cap, having changed nothing — the caller leaves the gatherer
 * holding its cargo and WAITING. Deleting from `freeSparks` is what makes the shape genuinely
 * out-of-world: collision, the spatial grid, the renderer, the soft cap and the TTL reap all iterate
 * that map, so one delete exempts the shape from every one of them at once.
 */
function depositIntoCastle(world: World, seat: PlayerId, carried: Spark): boolean {
  if (!bankPush(world.castleBanks, seat, carried)) return false;
  world.freeSparks.delete(carried.id);
  // Held, not hauled: the escrow marker described a spark in transit and would otherwise make a
  // banked shape look mid-haul to anything that inspects the bank.
  carried.escrow = undefined;
  return true;
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
  if (slotIndex === null) return world; // porch full → the shape stays banked
  const spark = bankTake(world.castleBanks, action.playerId, action.index);
  if (spark === null) return world; // nothing at that index
  const at = porchSlot(seat, slotIndex);
  // The SAME spark returns to the world, keeping its id. Reset the Verlet pair to the slot with ZERO
  // implied velocity (pos === prevPos) so it appears at rest rather than inheriting whatever motion
  // it had when the gatherer grabbed it — and clear the escrow so it is an ordinary free spark again,
  // subject to the normal soft cap and TTL reap.
  spark.pos.x = at.x;
  spark.pos.y = at.y;
  spark.prevPos.x = at.x;
  spark.prevPos.y = at.y;
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
  spark.state = { kind: 'Free' };
  spark.createdTick = world.tick;
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
 * Choose what to fetch: the NEAREST harvestable spark of the gatherer's preferred type, falling back
 * to the nearest of ANY type when the preference is unset or currently unavailable. That fall-back is
 * the owner's B4 ruling made concrete — the filter is a PRIORITY OVERRIDE, never an on/off switch, so
 * an unattended player keeps earning. Deterministic: pure distance math with a lowest-id tie-break
 * (never RNG), so host, worker and replay all pick the same spark.
 */
export function pickGathererTarget(world: World, g: Gatherer): SparkId | null {
  let best: SparkId | null = null;
  let bestD = Infinity;
  let bestPreferred = false;
  for (const s of world.freeSparks.values()) {
    if (!isHarvestable(s)) continue;
    const preferred = g.preferredType !== null && s.type === g.preferredType;
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
      // The shape's TYPE is stored in the owner's bank and the spark entity is DESTROYED. This is
      // owner playtest item 4 ("he should just store them within the castle and not outside"), and
      // it is what structurally deletes items 3's two defects: V6-1.2 parked the shape as a real
      // physics entity at a count-derived slot, which co-located shapes whenever the player took one
      // from the middle, and a co-located pair converts into a large velocity the instant it is
      // perturbed. A type in a list has no position to collide at. See castleBank.ts.
      if (depositIntoCastle(world, g.ownerPlayerId, carried)) {
        g.carriedSparkId = null;
        g.state = 'SEEKING';
        g.targetSparkId = null;
      } else {
        // BANK FULL => WAIT HOLDING IT (owner ruling, V6-1.3). The shape is NOT dropped and NOT
        // destroyed — the unit stands at its keep still carrying, and deposits the moment a slot
        // frees. Holding rather than discarding is what makes the cap a strategic pressure (your
        // haulers stall until you spend) instead of a silent leak of the player's work.
        g.state = 'WAITING';
      }
    }
    return world;
  }

  if (g.state === 'WAITING') {
    // Still holding cargo, parked at the keep, waiting for a bank slot. Re-validate the cargo (it
    // can still be despawned by any path) and retry the deposit every tick.
    const carried = g.carriedSparkId !== null ? world.freeSparks.get(g.carriedSparkId) : undefined;
    if (carried === undefined || carried.escrow !== 'hauled') {
      g.carriedSparkId = null;
      g.state = 'SEEKING';
      return world;
    }
    // Keep the cargo pinned to the unit so it cannot be flung by the physics substeps.
    carried.pos.x = g.pos.x;
    carried.pos.y = g.pos.y;
    carried.prevPos.x = g.pos.x;
    carried.prevPos.y = g.pos.y;
    if (depositIntoCastle(world, g.ownerPlayerId, carried)) {
      g.carriedSparkId = null;
      g.targetSparkId = null;
      g.state = 'SEEKING';
    }
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
 * a deposit writes a TYPE into `world.castleBanks` and destroys the spark (see the DEPOSIT branch
 * above and the castleBank.ts docblock). The count-based slot arithmetic that produced the owner's
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
}
