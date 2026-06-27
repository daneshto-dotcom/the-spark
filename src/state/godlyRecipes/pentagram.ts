/**
 * SPARK — S100 P1 (TD Phase 1b, Layer 5) — Pentagram SPAWNER recipe.
 *
 * Detects: a connected component that is EXACTLY 5 Triangle primitives forming
 * one closed 5-cycle — a ring in which each of the 5 triangles is directly bonded
 * to exactly 2 others, and the component contains NO other primitives.
 *
 *     T — T
 *    /     \
 *   T       T
 *    \     /
 *     \   /
 *      T (closed back to the top)
 *
 * Strictness (modeled on voltkin.ts's degree/cycle isolation predicate):
 *   - component size MUST be exactly 5 (an extra attached shape ⇒ NO match —
 *     componentOf follows EVERY bond, so an attached square lands in the component
 *     and pushes size past 5 / makes a non-triangle present);
 *   - every component primitive MUST be a Triangle;
 *   - every component primitive MUST have bond-degree exactly 2 (a missing/severed
 *     triangle drops the degree or the size below the ring ⇒ NO match; an extra
 *     bond raises it ⇒ NO match);
 *   - defense-in-depth: every bond's other endpoint MUST be inside the component
 *     set (guards the bizarre degree-happens-to-match-but-points-off-component case,
 *     exactly as voltkin.ts does).
 * A connected graph in which every vertex has degree exactly 2 is necessarily a
 * single cycle, so size-5 + all-degree-2 + connected ⇒ one closed 5-cycle.
 *
 * Identity / anchor: the LOWEST PrimitiveId in that exact component — the stable
 * handle the spawner re-validates against (spawners/spawner.ts). Multi-component
 * frames are tie-broken by the matcher (lowest anchorPrimitiveId), so this predicate
 * deterministically returns the FIRST qualifying component in id-ascending seed order.
 *
 * This is a SPAWNER recipe (kind:'spawner'): the matcher dispatches REGISTER_SPAWNER,
 * never a cinematic. Registered via side-effect import in index.ts.
 */

import { SparkType } from '../../constants.ts';
import { registerRecipe } from './index.ts';
import { componentOf } from '../../game/structure.ts';
// Type-only World import from the leaf worldTypes (NOT world.ts) so
// spawnerLifecycle.ts can import isPentagramComponent without a runtime
// spawnerLifecycle → pentagram → world.ts → spawnerLifecycle cycle.
import type { World } from '../worldTypes.ts';
import type { PrimitiveId } from '../../types.ts';
import type { PlayerId } from '../../types.ts';
import type { SpawnerGodlyRecipe, SpawnerRecipePredicate } from './types.ts';

const PENTAGRAM_SIZE = 5;
const RING_DEGREE = 2;

/**
 * Read-only check: is the connected component of `anchor` EXACTLY a 5-triangle
 * closed ring? Exported so spawnerLifecycle.recipeStillSatisfied can re-validate
 * the CURRENT component of a live spawner's anchor without re-walking every prim.
 */
export function isPentagramComponent(world: World, anchorId: PrimitiveId): boolean {
  const anchor = world.primitives.get(anchorId);
  if (anchor === undefined) return false;
  if (anchor.type !== SparkType.Triangle) return false;
  const comp = componentOf(anchor, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== PENTAGRAM_SIZE) return false;
  for (const id of comp.primitiveIds) {
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    if (p.type !== SparkType.Triangle) return false;
    if (p.bonds.size !== RING_DEGREE) return false;
    // Defense-in-depth: every bond endpoint must stay inside the component set.
    for (const bondId of p.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) return false;
      const otherEnd = bond.aId === id ? bond.bId : bond.aId;
      if (!comp.primitiveIds.has(otherEnd)) return false;
    }
  }
  return true;
}

/**
 * Find the lowest-PrimitiveId triangle that seeds an EXACT pentagram component,
 * and return that component's anchor (the lowest PrimitiveId WITHIN it). Returns
 * null when no exact pentagram exists. Seeds are scanned in id-ascending order so
 * the result is deterministic; the anchor itself is the min id of the matched ring.
 */
export function findPentagramAnchor(world: World): PrimitiveId | null {
  // Ascending id order → deterministic seed scan (V8 Map iteration is insertion
  // order, which is NOT id order after deletes/rehydrate, so sort explicitly).
  const triIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Triangle)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  for (const seedId of triIds) {
    if (!isPentagramComponent(world, seedId)) continue;
    const seed = world.primitives.get(seedId)!;
    const comp = componentOf(seed, world.primitives, world.bonds);
    let anchor = seedId;
    for (const id of comp.primitiveIds) if (id < anchor) anchor = id;
    return anchor;
  }
  return null;
}

/**
 * Enumerate the anchors of ALL exact pentagram components currently in the world,
 * in ascending anchor-id order (deterministic). Used by the matcher to apply the
 * per-`(playerId, anchorPrimitiveId)` live-spawner de-dup + the lowest-anchor
 * tie-break across multiple pentagrams completed in the same frame: the matcher
 * picks the LOWEST anchor that is not already a live spawner. Each anchor is the
 * min PrimitiveId of its own ring, and rings are disjoint components, so anchors
 * are unique per component.
 */
export function findAllPentagramAnchors(world: World): PrimitiveId[] {
  const triIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Triangle)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  const anchors: PrimitiveId[] = [];
  const seen = new Set<PrimitiveId>();
  for (const seedId of triIds) {
    if (seen.has(seedId)) continue;
    if (!isPentagramComponent(world, seedId)) continue;
    const seed = world.primitives.get(seedId)!;
    const comp = componentOf(seed, world.primitives, world.bonds);
    let anchor = seedId;
    for (const id of comp.primitiveIds) {
      seen.add(id); // never re-seed a member of an already-matched ring
      if (id < anchor) anchor = id;
    }
    anchors.push(anchor);
  }
  return anchors.sort((a, b) => a - b);
}

/**
 * Resolve the owner (triggerer) of a pentagram anchored at `anchorId`. Uses the
 * anchor primitive's placerColor → matching player (mirroring the voltkin
 * color→player map); falls back to the first player in iteration order
 * (deterministic via Map) so a post-placement color mutation (rainbow shuffle)
 * can't silently drop the match. Returns null when no player exists.
 */
export function pentagramOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const anchorPrim = world.primitives.get(anchorId);
  if (anchorPrim === undefined) return null;
  let triggerer = Array.from(world.players.values()).find(
    (p) => p.color === anchorPrim.placerColor,
  );
  if (triggerer === undefined) triggerer = Array.from(world.players.values())[0];
  if (triggerer === undefined) return null;
  return triggerer.id;
}

export const pentagramPredicate: SpawnerRecipePredicate = (world) => {
  const anchor = findPentagramAnchor(world);
  if (anchor === null) return null;
  const owner = pentagramOwnerForAnchor(world, anchor);
  if (owner === null) return null;
  return { triggererPlayerId: owner, anchorPrimitiveId: anchor };
};

export const PENTAGRAM_RECIPE: SpawnerGodlyRecipe = {
  kind: 'spawner',
  id: 'pentagram',
  predicate: pentagramPredicate,
  // Codex gallery sprite only (entryFromRecipe). Reuses the new matted Voltkin sprite as a
  // placeholder until the pencil-drawn chewer/spawner art pass (Phase 4).
  characterSprite: '/godly/voltkin/anim/voltkin-zap.png',
};

// S104 P4 (Council M8) — register the (previously orphaned) pentagram SPAWNER recipe so it appears
// in the unified Codex's TOWERS & STRUCTURES tab + unlock-on-build can reveal it. This does NOT
// change ignition: runSpawnerIgnition uses findAllPentagramAnchors directly, and findSpawnerMatch
// (the registry consumer) is currently dead code, so there is no double-register / double-ignition.
// findGodlyMatch skips it (kind !== 'cinematic'). Side-effect import in main.ts triggers this.
registerRecipe(PENTAGRAM_RECIPE);
