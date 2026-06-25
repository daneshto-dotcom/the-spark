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
import type {
  GodlyRecipe,
  CinematicGodlyRecipe,
  SpawnerGodlyRecipe,
  DefenderGodlyRecipe,
  GodlyMatch,
  SpawnerMatch,
  DefenderMatch,
  GodlyId,
  GodlyTriggerEvent,
} from './types.ts';

const REGISTRY = new Map<GodlyId, GodlyRecipe>();

/** P4 / S24 / S25 side-effect registration entry point. Idempotent on id. */
export function registerRecipe(recipe: GodlyRecipe): void {
  REGISTRY.set(recipe.id, recipe);
}

export function getRecipe(id: GodlyId): GodlyRecipe | undefined {
  return REGISTRY.get(id);
}

/**
 * S103 P2 — typed lookup for a DEFENDER recipe (narrows on kind). Used by defenderLifecycle's
 * `recipeStillSatisfied` re-validation. Returns undefined for a missing / non-defender id.
 */
export function getDefenderRecipe(id: GodlyId): DefenderGodlyRecipe | undefined {
  const r = REGISTRY.get(id);
  return r !== undefined && r.kind === 'defender' ? r : undefined;
}

export function listRecipes(): GodlyRecipe[] {
  return Array.from(REGISTRY.values());
}

// S34 PB-4 (2026-05-16) — removed unused `clearRegistry()` export. Zero importers
// across the whole repo (verified via repo-wide grep). If S35+ tests need
// registry reset, add `__resetRegistryForTests` with explicit @internal JSDoc.

export interface MatchResult {
  readonly recipe: CinematicGodlyRecipe;
  readonly match: GodlyMatch;
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — a SPAWNER recipe match. Carries the recipe
 * (for its id) + the SpawnerMatch (owner + anchor). The matcher turns this into a
 * REGISTER_SPAWNER dispatch, NOT a cinematic.
 */
export interface SpawnerMatchResult {
  readonly recipe: SpawnerGodlyRecipe;
  readonly match: SpawnerMatch;
}

/**
 * S103 P2 — a DEFENDER recipe match. The matcher turns this into a REGISTER_DEFENDER dispatch.
 */
export interface DefenderMatchResult {
  readonly recipe: DefenderGodlyRecipe;
  readonly match: DefenderMatch;
}

/**
 * Run all registered CINEMATIC predicates on a single topology-change event.
 * Returns the first matching recipe (deterministic by registry insertion order).
 * Skips any recipe whose TYPE has already fired this match (S97 P5 — "1 of each
 * type per match"; replaces the old per-player 60s cooldown gate, which
 * cross-blocked DIFFERENT godly types for 60s). The triggerer must still exist
 * (auth).
 *
 * S100 P1 (TD Phase 1b, Layer 5) — SPAWNER recipes are NOT scanned here: they are
 * matched separately via `findSpawnerMatch`, dispatch REGISTER_SPAWNER (never a
 * cinematic), and are EXCLUDED from the `godlyFiredThisMatch` per-type gate (a
 * spawner is rebuildable after a raid + multiple players may each have one).
 *
 * Host-only — caller must gate (world.isHost).
 */
export function findGodlyMatch(world: World, bondPos: { x: number; y: number }): MatchResult | null {
  for (const recipe of REGISTRY.values()) {
    if (recipe.kind !== 'cinematic') continue; // spawner recipes handled by findSpawnerMatch
    if (world.godlyFiredThisMatch.has(recipe.id)) continue; // already used this type this match
    const match = recipe.predicate(world, bondPos);
    if (match === null) continue;
    const triggerer = world.players.get(match.triggererPlayerId);
    if (triggerer === undefined) continue;
    return { recipe, match };
  }
  return null;
}

/**
 * S100 P1 (TD Phase 1b, Layer 5) — run all registered SPAWNER predicates on a
 * single topology-change event. Returns the first match (registry insertion
 * order). NO `godlyFiredThisMatch` gate (spawner recipes are excluded by design);
 * the per-`(playerId, anchorPrimitiveId)` de-dup is applied by the caller against
 * the live `world.creatureSpawners` map (godlyOrchestration). The triggerer must
 * still exist (auth). Host-only — caller gates (world.isHost).
 */
export function findSpawnerMatch(world: World, bondPos: { x: number; y: number }): SpawnerMatchResult | null {
  for (const recipe of REGISTRY.values()) {
    if (recipe.kind !== 'spawner') continue;
    const match = recipe.predicate(world, bondPos);
    if (match === null) continue;
    const triggerer = world.players.get(match.triggererPlayerId);
    if (triggerer === undefined) continue;
    return { recipe, match };
  }
  return null;
}

/**
 * S103 P2 — run all registered DEFENDER predicates on a topology-change event. Returns ONE match
 * per recipe that currently has a buildable anchor (the predicate itself skips already-live
 * anchors — see DefenderRecipePredicate), in registry insertion order. runDefenderIgnition
 * registers them (dedup defense-in-depth). The triggerer must still exist (auth). Host-only.
 */
export function findDefenderMatches(world: World, bondPos: { x: number; y: number }): DefenderMatchResult[] {
  const out: DefenderMatchResult[] = [];
  for (const recipe of REGISTRY.values()) {
    if (recipe.kind !== 'defender') continue;
    const match = recipe.predicate(world, bondPos);
    if (match === null) continue;
    if (world.players.get(match.triggererPlayerId) === undefined) continue;
    out.push({ recipe, match });
  }
  return out;
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
