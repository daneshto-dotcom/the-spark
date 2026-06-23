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

// S34 PB-4 (2026-05-16) — removed unused `clearRegistry()` export. Zero importers
// across the whole repo (verified via repo-wide grep). If S35+ tests need
// registry reset, add `__resetRegistryForTests` with explicit @internal JSDoc.

export interface MatchResult {
  readonly recipe: GodlyRecipe;
  readonly match: GodlyMatch;
}

/**
 * Run all registered predicates on a single BOND_FORMED event. Returns the
 * first matching recipe (deterministic by registry insertion order). Skips
 * any recipe whose TYPE has already fired this match (S97 P5 — "1 of each type
 * per match"; replaces the old per-player 60s cooldown gate, which cross-blocked
 * DIFFERENT godly types for 60s). The triggerer must still exist (auth).
 *
 * Host-only — caller must gate (world.isHost).
 */
export function findGodlyMatch(world: World, bondPos: { x: number; y: number }): MatchResult | null {
  for (const recipe of REGISTRY.values()) {
    if (world.godlyFiredThisMatch.has(recipe.id)) continue; // already used this type this match
    const match = recipe.predicate(world, bondPos);
    if (match === null) continue;
    const triggerer = world.players.get(match.triggererPlayerId);
    if (triggerer === undefined) continue;
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

export type { GodlyId, GodlyRecipe, GodlyTriggerEvent } from './types.ts';
