/**
 * SPARK — S151 P3 — FEED_TOWER: the goblin tower's whole mechanic.
 *
 * Owner R70: *"its a basic like 4 or 5 shape tower that takes one shape to feed to then spawn a
 * goblin of different kinds."*
 *
 * ## Why this is a NEW intent and not a reuse of anything
 *
 * Every other producing structure in the game decides what it makes at BUILD time and then emits on
 * a cadence: `pentagram` makes chewers, `lightningHub` makes drones, and the host poll fires them
 * with no player involvement. The goblin tower is the first structure whose OUTPUT IS A PLAYER
 * DECISION taken after the building exists — the same tower makes six different units depending on
 * which shape you hand it. There is no existing action with that shape, so `BUILD_BLUEPRINT` (which
 * stamps geometry) and `ENQUEUE_GATHERER_ORDER` (which queues a fetch) both model the wrong thing.
 *
 * ## ⚠ THE ATOMICITY RULE, INHERITED FROM `applyBuildBlueprint`
 *
 * Every gate returns BEFORE the shape is consumed, and the creature is minted synchronously in the
 * same call. That ordering is not stylistic: carry-forward CF1 is a live bug in exactly this shape
 * on the `?worker=1` path — *"primitives ARE stamped and the bank IS debited; only `defenders` stays
 * empty"* — i.e. a player paying and receiving nothing. The only defence against re-creating that is
 * to make "paid but got nothing" unrepresentable, which means never debiting before the last gate.
 *
 * ## Host-authoritative, and why the CLIENT may still send it
 *
 * `FEED_TOWER` is a CLIENT INTENT: a 1v1 joiner must be able to feed their own tower. The host
 * re-checks ownership, the spawner's recipe and affordability, so a modified client can at worst ask
 * for something it already owns and can already pay for.
 */

import { SparkType } from '../constants.ts';
// ⛔ FROM THE LEAF MODULE, NEVER FROM `godlyRecipes/goblinTower.ts`. That module calls
// `registerRecipe` at its tail, and `world.ts` imports THIS file — so importing the map from there
// registers every recipe for anything that touches world.ts, which is essentially the whole
// codebase. That is the documented S144 trap, and in S151 P3 it stopped the ?worker=1 bots match
// from ever leaving TITLE. See `goblinKinds.ts`.
import { GOBLIN_FEED_MAP } from './goblinKinds.ts';
import { bankCountOf, bankRemove } from './castleBank.ts';
import type { PlayerId, SpawnerId, Vec2 } from '../types.ts';
import { dispatch } from './world.ts';
import type { World } from './worldTypes.ts';

export interface FeedTowerAction {
  readonly type: 'FEED_TOWER';
  readonly playerId: PlayerId;
  /** Which goblin tower is being fed. */
  readonly spawnerId: SpawnerId;
  /** The shape handed over — this is what selects the goblin (see `GOBLIN_FEED_MAP`). */
  readonly sparkType: SparkType;
}

/**
 * Where the goblin walks out to. Deterministic and host-computed, like every other spawn target: a
 * fixed offset from the tower rather than anything positional-random, so the host and the worker
 * mirror agree frame-for-frame.
 *
 * ⚠ Derived from the SPAWNER ID, not from `Math.random` or the tick. Two towers fed on the same tick
 * must not stack their goblins on the same pixel, and two peers must place them identically — an
 * id-derived angle satisfies both, and `spawnerRngInvariance.test.ts` is the precedent for why the
 * RNG stream must not be touched here at all.
 */
function walkOutTarget(pos: Vec2, spawnerId: SpawnerId): Vec2 {
  const n = spawnerId as unknown as number;
  const angle = (n % 8) * (Math.PI / 4);
  const r = 46;
  return { x: pos.x + Math.cos(angle) * r, y: pos.y + Math.sin(angle) * r };
}

/**
 * Feed one shape to one goblin tower.
 *
 * @returns the world, mutated in place on success and untouched on any refusal.
 */
export function applyFeedTower(world: World, action: FeedTowerAction): World {
  // ── GATE 1: the tower exists, and it is a GOBLIN TOWER ──────────────────────────────────────
  // The recipe check matters as much as existence: every producing structure is a CreatureSpawner,
  // so without it a player could feed a pentagram and get a goblin out of a chewer nest.
  const spawner = world.creatureSpawners.get(action.spawnerId);
  if (spawner === undefined) return world;
  if (spawner.recipeId !== 'goblinTower') return world;

  // ── GATE 2: it is THEIRS ────────────────────────────────────────────────────────────────────
  if (spawner.ownerPlayerId !== action.playerId) return world;

  // ── GATE 3: the anchor is still standing ────────────────────────────────────────────────────
  // The host poll removes a spawner whose recipe broke, but the poll is throttled
  // (REVALIDATE_INTERVAL_TICKS), so there is a window in which a dead tower is still in the map.
  // Feeding it would mint a goblin from a structure the player can already see has collapsed.
  const anchor = world.primitives.get(spawner.anchorPrimitiveId);
  if (anchor === undefined) return world;

  // ── GATE 4: they actually have the shape ────────────────────────────────────────────────────
  // Checked against the castle bank only — the tower is fed from stores, not from loose shapes on
  // the board, which is what makes it a decision about your inventory rather than about your reach.
  if (bankCountOf(world.castleBanks, action.playerId, action.sparkType) <= 0) return world;

  // ── ALL GATES PASSED — only now does anything change ─────────────────────────────────────────
  bankRemove(world.castleBanks, action.playerId, action.sparkType);

  const pos: Vec2 = { x: anchor.pos.x, y: anchor.pos.y };
  // ⚠ DISPATCHED, NOT QUEUED, AND NOT WRITTEN INTO `world.pendingCreatureSpawn`. That field LOOKS
  // like a spawn queue and is not one — it is a single nullable slot holding the Voltkin cinematic's
  // deferred spawn (`{ fireAtTick, event: GodlyTriggerEvent }`), so pushing to it does not typecheck
  // and hijacking it would break the cinematic. Re-dispatching `SPAWN_CREATURE` from inside a
  // reducer is the established, Council-sanctioned exception — `applyCreatureAttack` re-dispatches
  // `SEVER_BOND` the same way, and JS being single-threaded makes the synchronous re-entry safe.
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: GOBLIN_FEED_MAP[action.sparkType],
    ownerPlayerId: action.playerId,
    pos,
    targetPos: walkOutTarget(pos, action.spawnerId),
    // ⚠ PROVENANCE IS LOAD-BEARING, not bookkeeping. A non-null `sourceSpawnerId` puts this goblin
    // in the SPAWNER-sourced population rather than the Voltkin one, which is what the split
    // population caps count against — and it is also what stops `creatureVerlet` applying the
    // Voltkin-only centre-repulse to it.
    sourceSpawnerId: action.spawnerId,
  });
  spawner.spawnedCount += 1;
  return world;
}
