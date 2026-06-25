/**
 * SPARK — S103 P4 (#10) — HELGA the princess DEFENDER recipe.
 *
 * Detects: a connected component that is EXACTLY a central Triangle hub + 3 Spiral leaves + 3 Circle
 * leaves — the hub has bond-degree 6, every leaf is a pure leaf (degree 1, bonded only to the hub).
 *   - Each Triangle↔Spiral bond is the 'Warped Anchor' magic combo (the owner's "3 Warped Anchors").
 *   - Each Triangle↔Circle bond is the 'Star' family — detected by the UNORDERED {Triangle,Circle}
 *     type-set (owner spec OC3: do NOT force the Star-vs-Wheel build direction; a hub-Circle bond is
 *     {Triangle,Circle} either way), so 3 Circle leaves = "3 Stars".
 *
 *          Sp   Ci
 *            \  /
 *      Ci — Tri — Sp     (Triangle hub, degree 6; 3 Spirals + 3 Circles, each a degree-1 leaf)
 *            /  \
 *          Sp   Ci
 *
 * Strictness mirrors pentagram/laserTurret (componentOf-isolated): an extra shape or a leaf bonded
 * elsewhere breaks the exact {1 Tri + 3 Spiral + 3 Circle} = 7-prim component ⇒ NO match.
 *
 * Identity / anchor: the Triangle hub (the only Triangle in the component — unique). HELGA stands +
 * slaps from the hub. DEFENDER recipe (kind:'defender'): the matcher dispatches REGISTER_DEFENDER.
 */

import { SparkType } from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { DefenderGodlyRecipe, DefenderRecipePredicate } from './types.ts';
import { registerRecipe } from './index.ts';

const HELGA_SIZE = 7; // 1 Triangle hub + 3 Spiral + 3 Circle leaves
const HUB_DEGREE = 6;
const LEAF_DEGREE = 1;
const SPIRAL_LEAVES = 3; // 3 Warped Anchors
const CIRCLE_LEAVES = 3; // 3 Stars (unordered {Triangle,Circle} type-set)

/**
 * Read-only check: is the component anchored at `hubId` EXACTLY a Triangle hub + 3 Spiral + 3 Circle
 * leaves? Exported so defenderLifecycle.recipeStillSatisfied (via the recipe's `stillValid`) can
 * re-validate a live HELGA's component each poll.
 */
export function isHelgaComponent(world: World, hubId: PrimitiveId): boolean {
  const hub = world.primitives.get(hubId);
  if (hub === undefined) return false;
  if (hub.type !== SparkType.Triangle) return false;
  if (hub.bonds.size !== HUB_DEGREE) return false;
  const comp = componentOf(hub, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== HELGA_SIZE) return false;
  let spirals = 0;
  let circles = 0;
  for (const id of comp.primitiveIds) {
    if (id === hubId) continue;
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    if (p.bonds.size !== LEAF_DEGREE) return false; // pure leaf
    // Defense-in-depth: the leaf's single bond connects back to the hub.
    const bondId = [...p.bonds][0];
    const bond = world.bonds.get(bondId);
    if (bond === undefined) return false;
    const other = bond.aId === id ? bond.bId : bond.aId;
    if (other !== hubId) return false;
    if (p.type === SparkType.Spiral) spirals++; // Triangle↔Spiral = Warped Anchor
    else if (p.type === SparkType.Circle) circles++; // {Triangle,Circle} type-set = Star (dir-agnostic)
    else return false; // any other leaf type ⇒ NO match
  }
  return spirals === SPIRAL_LEAVES && circles === CIRCLE_LEAVES;
}

/** Lowest-id Triangle hub anchoring a valid, NOT-already-live HELGA. Ascending id → deterministic. */
function findBuildableHelgaAnchor(world: World): PrimitiveId | null {
  const live = new Set<PrimitiveId>();
  for (const d of world.defenders.values()) live.add(d.anchorPrimitiveId);
  const triIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Triangle)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  for (const id of triIds) {
    if (live.has(id)) continue;
    if (isHelgaComponent(world, id)) return id;
  }
  return null;
}

/** Owner = the player whose color placed the Triangle hub (rainbow-safe fallback). */
function helgaOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === hub.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  return owner?.id ?? null;
}

export const helgaPredicate: DefenderRecipePredicate = (world) => {
  const anchor = findBuildableHelgaAnchor(world);
  if (anchor === null) return null;
  const owner = helgaOwnerForAnchor(world, anchor);
  if (owner === null) return null;
  const hub = world.primitives.get(anchor)!;
  return { triggererPlayerId: owner, anchorPrimitiveId: anchor, pos: { x: hub.pos.x, y: hub.pos.y } };
};

export const HELGA_RECIPE: DefenderGodlyRecipe = {
  kind: 'defender',
  id: 'helga',
  defenderKind: 'princess',
  predicate: helgaPredicate,
  stillValid: (world, anchorId) => isHelgaComponent(world, anchorId),
  characterSprite: '/godly/voltkin/sprites/voltkin-zap.png', // Codex placeholder until a HELGA art pass
};

// Side-effect registration (laserTurret precedent) — main.ts imports this module for the effect.
registerRecipe(HELGA_RECIPE);
