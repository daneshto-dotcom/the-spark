/**
 * SPARK — S103 P2 generic DEFENDER lifecycle reducers.
 *
 * Mirrors spawnerLifecycle.ts: pure case-body helpers consumed by world.ts dispatch. THREE
 * HOST-INTERNAL actions (none is a client INTENT — defenders auto-build from geometry, are
 * host-authored + snapshot-replicated, so they ride KNOWN_GAME_ACTION_TYPES_RECORD only):
 *   REGISTER_DEFENDER — runDefenderIgnition dispatches this when a player completes a defender
 *                       recipe (laser turret / HELGA). Mints a DefenderId, seeds the cadence.
 *   REMOVE_DEFENDER   — the host re-validation poll dispatches this when the anchor is gone OR
 *                       the recipe no longer holds (a chewer ate the structure) — the defender
 *                       dies. THIS is the v1 counterplay (no direct-attack path yet, Council MF8).
 *   DEFENDER_TICK     — advances ONE defender's FSM: acquire nearest enemy creature in range →
 *                       windup → FIRE (deal damage via the unified `damageCreature`) → recover.
 *
 * Determinism: the whole FSM is a pure fn of `world.tick` (no wall-clock, no Math.random); target
 * acquisition uses `findNearestEnemyCreatureFrom` (lowest-CreatureId tie-break). Host-authoritative;
 * clients receive the result via the additive-optional `defenders[]` snapshot + never simulate.
 */

import {
  CREATURE_HIT_DAMAGE,
  DEFENDER_FIRE_HOLD_TICKS,
  DEFENDER_REACQUIRE_TICKS,
  DEFENDER_RECOVER_TICKS,
} from '../../constants.ts';
import {
  asDefenderId,
  type DefenderId,
  type PlayerId,
  type PrimitiveId,
  type Vec2,
} from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
import { getDefenderRecipe } from '../godlyRecipes/index.ts';
import { findNearestEnemyCreatureFrom } from '../creatures/creatureAI.ts';
import { damageCreature } from '../creatures/creatureLifecycle.ts';
import type { World } from '../worldTypes.ts';
import { getDefenderConfig, makeDefender, type Defender, type DefenderConfig, type DefenderKind } from './defender.ts';

/** Action shapes — exported so world.ts can compose GameAction. */
export interface RegisterDefenderAction {
  readonly type: 'REGISTER_DEFENDER';
  readonly defenderKind: DefenderKind;
  readonly ownerPlayerId: PlayerId;
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  readonly pos: Vec2;
}
export interface RemoveDefenderAction {
  readonly type: 'REMOVE_DEFENDER';
  readonly defenderId: DefenderId;
}
export interface DefenderTickAction {
  readonly type: 'DEFENDER_TICK';
  readonly defenderId: DefenderId;
}

/**
 * Host-only: register a new defender over a freshly-completed recipe. De-dup per-anchor (you
 * can't double-register one anchor; you CAN rebuild after the prior defender was removed) — the
 * ignition gate is the primary guard, this reducer is defense-in-depth.
 */
export function applyRegisterDefender(world: World, action: RegisterDefenderAction): World {
  for (const d of world.defenders.values()) {
    if (d.anchorPrimitiveId === action.anchorPrimitiveId) return world;
  }
  const id = asDefenderId(world.nextDefenderId++);
  world.defenders.set(
    id,
    makeDefender({
      id,
      kind: action.defenderKind,
      ownerPlayerId: action.ownerPlayerId,
      anchorPrimitiveId: action.anchorPrimitiveId,
      recipeId: action.recipeId,
      pos: action.pos,
      registeredAtTick: world.tick,
    }),
  );
  return world;
}

/**
 * Host-only: remove a defender (its auto-attack stops instantly). Dispatched by the re-validation
 * poll when the structure is broken, and by teardown. No-op on a missing id (stale fan-out guard).
 */
export function applyRemoveDefender(world: World, action: RemoveDefenderAction): World {
  world.defenders.delete(action.defenderId);
  return world;
}

/** Is the defender's current target still a valid, in-range enemy creature? */
function targetValid(world: World, d: Defender, config: DefenderConfig): boolean {
  if (d.targetCreatureId === null) return false;
  const victim = world.creatures.get(d.targetCreatureId);
  if (victim === undefined) return false;
  if (victim.ownerPlayerId === d.ownerPlayerId) return false; // (shouldn't happen — defense-in-depth)
  const dx = victim.pos.x - d.pos.x;
  const dy = victim.pos.y - d.pos.y;
  return dx * dx + dy * dy <= config.attackRange * config.attackRange;
}

/**
 * Host-only: advance ONE defender's FSM. The strike DEALS DAMAGE at FIRE entry via the unified
 * `damageCreature` path (chewer dies in 1, Voltkin in 2 → the render death-watchers pop goo /
 * lightning-cloud). The FIRE state is then held DEFENDER_FIRE_HOLD_TICKS so the 1v1 client
 * reliably observes it + renders the beam/slap (Council MF1 — state IS the event bus). All
 * transitions tick-deterministic; no wall-clock, no RNG. No-op on a missing id.
 */
export function applyDefenderTick(world: World, action: DefenderTickAction): World {
  const d = world.defenders.get(action.defenderId);
  if (d === undefined) return world;
  const config = getDefenderConfig(d.kind);
  // Keep the defender pinned to its (verlet-mobile) anchor primitive so it renders + targets from
  // the right spot. Deterministic (reads the synced primitive pos). If the anchor is gone, hold the
  // last pos — the host re-validation poll will REMOVE_DEFENDER on its next throttle slot.
  const anchor = world.primitives.get(d.anchorPrimitiveId);
  if (anchor !== undefined) {
    d.pos.x = anchor.pos.x;
    d.pos.y = anchor.pos.y;
  }
  d.ticksInState++;

  switch (d.state) {
    case 'IDLE': {
      if (world.tick >= d.nextFireTick) {
        const target = findNearestEnemyCreatureFrom(
          world, d.pos, d.ownerPlayerId, config.attackRange * config.attackRange,
        );
        if (target !== null) {
          d.targetCreatureId = target;
          d.state = 'WINDUP';
          d.ticksInState = 0;
        } else {
          // Nothing in range — retry shortly rather than fire into the void.
          d.targetCreatureId = null;
          d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
        }
      }
      break;
    }
    case 'WINDUP': {
      // Abort if the target slipped away mid-windup (died / left range) — re-acquire from IDLE.
      if (!targetValid(world, d, config)) {
        d.state = 'IDLE';
        d.ticksInState = 0;
        d.targetCreatureId = null;
        d.nextFireTick = world.tick + DEFENDER_REACQUIRE_TICKS;
        break;
      }
      if (d.ticksInState >= config.windupTicks) {
        // FIRE: the strike lands NOW. Capture the endpoint BEFORE the victim can vanish, then deal
        // the unified single-target hit. The FIRE state (+ lastStrikePos) is what the client renders.
        const victim = d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId) : undefined;
        if (victim !== undefined) {
          d.lastStrikePos = { x: victim.pos.x, y: victim.pos.y };
          damageCreature(world, victim.id, CREATURE_HIT_DAMAGE);
        }
        d.state = 'FIRE';
        d.ticksInState = 0;
      }
      break;
    }
    case 'FIRE': {
      if (d.ticksInState >= DEFENDER_FIRE_HOLD_TICKS) {
        d.state = 'RECOVER';
        d.ticksInState = 0;
      }
      break;
    }
    case 'RECOVER': {
      if (d.ticksInState >= DEFENDER_RECOVER_TICKS) {
        d.state = 'IDLE';
        d.ticksInState = 0;
        d.targetCreatureId = null;
        d.lastStrikePos = null; // stop riding the wire once the strike VFX window closed
        d.nextFireTick = world.tick + config.fireIntervalTicks;
      }
      break;
    }
  }
  return world;
}

/**
 * S103 P2 — re-validation predicate. The defender survives ONLY while its recipe still holds at
 * its anchor (a chewer eating the structure's bonds breaks the shape → REMOVE_DEFENDER → the
 * defender dies — the v1 counterplay). Delegates to the registered recipe's `stillValid`; falls
 * back to "anchor primitive exists" for a recipe with no rule (none ships without one). The host
 * poll also short-circuits on `!world.primitives.has(anchor)` as defense-in-depth.
 */
export function recipeStillSatisfied(world: World, defender: Defender): boolean {
  const recipe = getDefenderRecipe(defender.recipeId);
  if (recipe !== undefined) return recipe.stillValid(world, defender.anchorPrimitiveId);
  return world.primitives.has(defender.anchorPrimitiveId);
}

/**
 * S103 P2 (Council MF5) — re-phase every defender's `nextFireTick` relative to the loaded
 * `world.tick`. A saved `nextFireTick` is an absolute tick; after a load it is almost always in
 * the PAST, which would make every defender fire on the first post-load tick (the despawnAtTick=0
 * insta-fire bug class). Preserve each defender's relative phase within its interval instead.
 * Called by the save deserializer AFTER defenders are loaded.
 */
export function loadRephaseDefenders(world: World): void {
  for (const d of world.defenders.values()) {
    const interval = getDefenderConfig(d.kind).fireIntervalTicks;
    const rem = ((d.nextFireTick - world.tick) % interval + interval) % interval;
    d.nextFireTick = world.tick + rem;
  }
}

/**
 * Teardown — clear all defender state. Wired into all FOUR teardown sites (world.ts WIN_TRIGGER,
 * gameMode.ts START_GAME + RETURN_TO_TITLE, godlyActions.ts applyGodlyAbort) so a defender never
 * persists onto the win screen or into the next match. `nextDefenderId` reset so a fresh match
 * mints ids from scratch.
 */
export function teardownDefenders(world: World): void {
  world.defenders.clear();
  world.nextDefenderId = 0;
}
