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
      // DEPOSIT. The shape becomes a BANKED free spark parked beside the keep, which the player
      // grabs with the ordinary pickup path. createdTick is re-stamped for tidiness; the escrow
      // marker is what actually keeps it from being reaped.
      const slot = depositSlot(world, g.ownerPlayerId);
      carried.pos.x = slot.x;
      carried.pos.y = slot.y;
      carried.prevPos.x = slot.x;
      carried.prevPos.y = slot.y;
      carried.createdTick = world.tick;
      carried.escrow = 'banked';
      g.carriedSparkId = null;
      g.state = 'SEEKING';
      g.targetSparkId = null;
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
 * Where the next deposited shape parks: a tidy row beside the keep, so a stack of banked shapes
 * reads as a stockpile rather than one spark on top of another. Deterministic (count-based).
 */
function depositSlot(world: World, ownerPlayerId: PlayerId): Vec2 {
  let banked = 0;
  for (const s of world.freeSparks.values()) {
    if (s.escrow === 'banked' && isNearKeep(s.pos, ownerPlayerId)) banked++;
  }
  const home = castleAnchor(ownerPlayerId as unknown as number);
  return {
    x: home.x - 54 + (banked % 5) * 27,
    y: home.y + GATHERER_DEPOSIT_OFFSET_Y + Math.floor(banked / 5) * 26,
  };
}

/** Is this position within the keep's stockpile footprint? (used only to count a seat's own bank) */
function isNearKeep(p: Vec2, ownerPlayerId: PlayerId): boolean {
  const home = castleAnchor(ownerPlayerId as unknown as number);
  return distSq(p, { x: home.x, y: home.y + GATHERER_DEPOSIT_OFFSET_Y }) <= 200 * 200;
}

/** Clear the gatherer population + reset the mint counter (teardown parity, all sites). */
export function teardownGatherers(world: World): void {
  world.gatherers.clear();
  world.nextGathererId = 0;
}
