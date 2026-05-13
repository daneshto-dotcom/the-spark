/**
 * SPARK — godly-recipe registry + matcher (S22 P3 barrel).
 *
 * v1 ships an empty registry — P4 registers Voltkin via a side-effect import.
 * S24+ Anvil, S25+ Pac-Predator will register the same way.
 *
 * Matcher is host-only (caller gates with world.isHost). Iterates registered
 * recipes' predicates against the world + emitted BOND_FORMED pos; returns
 * the first match or null. Predicate purity contract: MUST NOT mutate world.
 */

import type { World } from '../world.ts';
import type { GodlyRecipe, GodlyMatch, GodlyId, GodlyTriggerEvent } from './types.ts';
import { isOnCooldown } from '../godlyCooldown.ts';

const REGISTRY = new Map<GodlyId, GodlyRecipe>();

/** P4 / S24 / S25 side-effect registration entry point. Idempotent on id. */
export function registerRecipe(recipe: GodlyRecipe): void {
  REGISTRY.set(recipe.id, recipe);
}

export function getRecipe(id: GodlyId): GodlyRecipe | undefined {
  return REGISTRY.get(id);
}

export function listRecipes(): GodlyRecipe[] {
  return Array.from(REGISTRY.values());
}

export function clearRegistry(): void {
  REGISTRY.clear();
}

export interface MatchResult {
  readonly recipe: GodlyRecipe;
  readonly match: GodlyMatch;
}

/**
 * Run all registered predicates on a single BOND_FORMED event. Returns the
 * first matching recipe (deterministic by registry insertion order). Skips
 * any recipe whose triggerer is on cooldown — caller's burden to verify a
 * candidate match's triggerer is also the active player for game-mode auth,
 * but this barrel does not assume that auth model.
 *
 * Host-only — caller must gate (world.isHost).
 */
export function findGodlyMatch(world: World, bondPos: { x: number; y: number }): MatchResult | null {
  for (const recipe of REGISTRY.values()) {
    const match = recipe.predicate(world, bondPos);
    if (match === null) continue;
    const triggerer = world.players.get(match.triggererPlayerId);
    if (triggerer === undefined) continue;
    if (isOnCooldown(triggerer, world.tick)) continue;
    return { recipe, match };
  }
  return null;
}

/** Build a GodlyTriggerEvent from a match + the host's current tick. */
export function makeTriggerEvent(result: MatchResult, currentTick: number): GodlyTriggerEvent {
  return {
    godlyId: result.recipe.id,
    triggererPlayerId: result.match.triggererPlayerId,
    targetComponentPrimitiveIds: result.match.targetComponentPrimitiveIds,
    targetPos: result.match.targetPos,
    triggerTick: currentTick,
  };
}

export type { GodlyId, GodlyRecipe, GodlyMatch, GodlyTriggerEvent, RecipePredicate } from './types.ts';
