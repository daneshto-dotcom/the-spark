/**
 * SPARK — ⭐⭐ S193 (owner T4) — THE GOBLIN TOWER'S AUTO-BUILD TOGGLES.
 *
 * > *"right click each of the six shapes that build … the goblins … it's like a toggle … I could do
 * > like square toggle and like spiral toggle. And each time I have free space in the goblin tower
 * > because it can hold only 10 goblins … and if you have the shapes in your castle it actually builds
 * > the … shield goblin and … a spiral … bat goblin automatically … You can toggle all the shapes
 * > too … whenever there's a free shape, it builds … those goblins."* — owner, S192 playtest list T4
 *
 * Two halves, and the spec is `.claude/plans/S193_GOBLIN_AUTOBUILD_SPEC.md`:
 *
 *  1. `SET_AUTO_FEED` — a CLIENT INTENT that sets one toggle on one of the seat's OWN goblin towers.
 *     A SET, not a flip (⚠ MINE): idempotent, so a duplicated intent cannot undo itself.
 *  2. `runGoblinAutoFeed` — the host runner. ⛔ IT DISPATCHES `FEED_TOWER`, IT DOES NOT FEED. Every
 *     gate a click passes — ownership, the anchor, the bank, the 10 / 20 cap (THE HORDE GROWS, canon
 *     §3e), the bench, elimination and the endgame lock — therefore applies to an auto-build
 *     unchanged, and it pays exactly what a click pays. A private copy of the reducer would have to
 *     re-implement three policy tables, which is the "four copies of one rule" defect (S158).
 *
 * Determinism: towers in ascending spawner id, shapes in `ALL_SPARK_TYPES` order from a persisted
 * cursor, a poll phase-spread by spawner id off `world.tick`. No `Map` order, no clock, no RNG.
 *
 * ⚠ Side-effect-free imports only: `world.ts` imports this reducer, so pulling a recipe module in here
 * would register every recipe for the whole codebase (the S144 trap — see `goblinKinds.ts`).
 */

import { ALL_SPARK_TYPES, SparkType } from '../constants.ts';
import { bankCountOf } from './castleBank.ts';
import { AUTO_FEED_SHAPE_COUNT, type CreatureSpawner } from './spawners/spawner.ts';
import type { PlayerId, SpawnerId } from '../types.ts';
import { dispatch } from './world.ts';
import type { World } from './worldTypes.ts';

/**
 * ⚠ MINE (owner question Q2) — how often a toggled tower looks for a free slot: every 6 ticks
 * (0.1 s at 60 Hz), at most ONE goblin per tower per look. A freed slot refills within 0.1 s; an empty
 * tower refills ten in 1 s (twenty in 2 s under THE HORDE GROWS). Phase-spread by spawner id, so
 * several towers do not all count the board on the same tick.
 */
export const AUTO_FEED_POLL_TICKS = 6;

export interface SetAutoFeedAction {
  readonly type: 'SET_AUTO_FEED';
  readonly playerId: PlayerId;
  /** Which goblin tower. */
  readonly spawnerId: SpawnerId;
  /** Which of its six shapes (`GOBLIN_FEED_MAP` decides the goblin). */
  readonly sparkType: SparkType;
  /** The state the seat wants — ON or OFF. A set, never a flip. */
  readonly on: boolean;
}

// The pure read lives in the spawner LEAF so the renderer can ask it without importing this reducer.
export { isAutoFed } from './spawners/spawner.ts';

/** PURE — is this a shape index the bitfield has a bit for? Guards the wire (the parser checks only `type`). */
function isShapeIndex(t: unknown): t is SparkType {
  return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < AUTO_FEED_SHAPE_COUNT;
}

/**
 * The `SET_AUTO_FEED` reducer. Host-authoritative, NO-OP-NEVER-THROW: every gate returns before the
 * one mutation, so a stale or hostile intent costs nothing.
 */
export function applySetAutoFeed(world: World, action: SetAutoFeedAction): World {
  const sp = world.creatureSpawners.get(action.spawnerId);
  if (sp === undefined) return world;
  // ⚠ MINE (Q3) — the GOBLIN tower only, his words. A tier-3 race tower eats one shape and is not
  // toggleable; widening this is the one line to change if he wants it.
  if (sp.recipeId !== 'goblinTower') return world;
  if (sp.ownerPlayerId !== action.playerId) return world;
  if (!isShapeIndex(action.sparkType)) return world;
  if (action.on !== true && action.on !== false) return world;
  const bit = 1 << (action.sparkType as number);
  const mask = sp.autoFeedMask ?? 0;
  sp.autoFeedMask = action.on ? mask | bit : mask & ~bit;
  return world;
}

/**
 * PURE — the shape this tower would auto-build right now, or null: the first TOGGLED shape the
 * owner's bank holds, scanning `ALL_SPARK_TYPES` from the cursor and wrapping (⚠ MINE — round-robin,
 * so Square + Spiral alternate shield, bat, shield … while both are banked).
 */
export function autoFeedChoice(world: World, sp: CreatureSpawner): SparkType | null {
  const mask = sp.autoFeedMask ?? 0;
  if (mask === 0) return null;
  const start = sp.autoFeedCursor ?? 0;
  for (let k = 0; k < AUTO_FEED_SHAPE_COUNT; k++) {
    const type = ALL_SPARK_TYPES[(start + k) % AUTO_FEED_SHAPE_COUNT]!;
    if (((mask >> (type as number)) & 1) === 0) continue;
    if (bankCountOf(world.castleBanks, sp.ownerPlayerId, type) > 0) return type;
  }
  return null;
}

/**
 * ⭐ THE HOST RUNNER — called once per host tick from `runHostTick`, after the spawner poll (so a tower
 * that broke this tick has already been removed and cannot be fed).
 *
 * Both phases, while PLAYING: a manual FEED is not phase-gated, so neither is this.
 */
export function runGoblinAutoFeed(world: World): void {
  if (world.gameState !== 'PLAYING' || world.creatureSpawners.size === 0) return;
  let towers: CreatureSpawner[] | null = null;
  for (const sp of world.creatureSpawners.values()) {
    if (sp.recipeId !== 'goblinTower' || !sp.autoFeedMask) continue;
    if ((world.tick + Number(sp.id)) % AUTO_FEED_POLL_TICKS !== 0) continue;
    (towers ??= []).push(sp);
  }
  if (towers === null) return;
  // ⛔ A TOTAL ORDER: two towers of one seat competing for its last Square resolve by spawner id,
  // never by `Map` insertion order (which a peer that rebuilt the map could hold differently).
  towers.sort((a, b) => Number(a.id) - Number(b.id));
  for (const sp of towers) {
    const type = autoFeedChoice(world, sp);
    if (type === null) continue; // nothing toggled is banked — the toggles wait, still lit
    const before = sp.spawnedCount;
    // ⛔ THROUGH `dispatch`, AS THE TOWER'S OWNER — the same action a click sends. See the header.
    dispatch(world, {
      type: 'FEED_TOWER',
      playerId: sp.ownerPlayerId,
      spawnerId: sp.id,
      sparkType: type,
    });
    // The cursor moves only on a goblin actually born (`applyFeedTower` counts it), so a refused feed
    // (full tower, benched seat) keeps the same shape first in line for the next look.
    if (sp.spawnedCount !== before) sp.autoFeedCursor = ((type as number) + 1) % AUTO_FEED_SHAPE_COUNT;
  }
}
