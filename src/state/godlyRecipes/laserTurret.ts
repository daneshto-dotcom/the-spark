/**
 * SPARK — S103 P3 (#9) — Laser Turret DEFENDER recipe.
 *
 * Detects: a connected component that is EXACTLY 1 Line + 7 Spiral leaves — a star where the Line
 * has bond-degree 7 and each of the 7 Spirals is a pure leaf (degree 1, bonded only to the Line).
 * Every Line↔Spiral bond is the 'Whip' magic combo, so this is the owner's "1 Line + 7 Whips".
 *
 *        S   S   S
 *         \  |  /
 *      S — Line — S      (the Line is degree 7; each S is a degree-1 leaf)
 *         /  |  \
 *        S   S
 *
 * Strictness (mirrors pentagram.ts's component-isolation predicate): componentOf follows EVERY
 * bond, so an extra attached shape or a leaf that is also bonded elsewhere pushes the size past 8
 * / raises a leaf's degree ⇒ NO match. A single connected graph of {one degree-7 hub + seven
 * degree-1 leaves} is exactly this star.
 *
 * Identity / anchor: the Line primitive (unique within the component — the only degree-7 node), so
 * the turret stands + fires from the Line. This is a DEFENDER recipe (kind:'defender'): the matcher
 * dispatches REGISTER_DEFENDER (never a cinematic / spawner). Registered via side-effect import.
 */

import { SparkType } from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { DefenderGodlyRecipe, DefenderRecipePredicate } from './types.ts';
import { registerRecipe } from './index.ts';

const TURRET_SIZE = 8; // 1 Line hub + 7 Spiral leaves
const HUB_DEGREE = 7;

/**
 * Read-only check: is the component anchored at `lineId` a 1-Line(deg7) + 7-Spiral star?
 * Exported so defenderLifecycle.recipeStillSatisfied (via the recipe's `stillValid`) can re-validate
 * a live turret's component each poll without re-walking the whole world.
 *
 * S103 P3 CHECK (Council, Grok+Gemini): the gate is (a) the hub is a Line of bond-degree exactly 7,
 * (b) its connected component is exactly 8 primitives, (c) every non-hub member is a Spiral. Those
 * three TOGETHER force the star by pigeonhole — the hub's 7 bonds reach 7 distinct in-component
 * members, and the only members are the 7 Spirals, so each Spiral bonds the hub (= 7 'Whip' combos).
 * We deliberately DON'T require each leaf to be degree-1: dense AUTO_BOND can bond two adjacent
 * Spiral leaves to each other (a leaf of degree 2) WITHOUT changing the hub degree, the component
 * size, or the leaf types — so tolerating inter-leaf bonds fixes a frequent silent no-build while a
 * size/degree/type mismatch (an extra shape, a wrong leaf, a missing leaf) still rejects.
 */
export function isLaserTurretComponent(world: World, lineId: PrimitiveId): boolean {
  const hub = world.primitives.get(lineId);
  if (hub === undefined) return false;
  if (hub.type !== SparkType.Line) return false;
  if (hub.bonds.size !== HUB_DEGREE) return false;
  const comp = componentOf(hub, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== TURRET_SIZE) return false;
  for (const id of comp.primitiveIds) {
    if (id === lineId) continue;
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    if (p.type !== SparkType.Spiral) return false; // every non-hub member must be a Spiral
  }
  return true;
}

/**
 * Find the lowest-PrimitiveId Line that anchors a valid laser-turret star AND is not already a live
 * defender (so runDefenderIgnition can build one per frame + a rebuild re-ignites after removal).
 * Ascending id scan → deterministic.
 */
function findBuildableTurretAnchor(world: World): PrimitiveId | null {
  const live = new Set<PrimitiveId>();
  for (const d of world.defenders.values()) live.add(d.anchorPrimitiveId);
  const lineIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Line)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  for (const id of lineIds) {
    if (live.has(id)) continue;
    if (isLaserTurretComponent(world, id)) return id;
  }
  return null;
}

/** Owner of the turret = the player whose color placed the Line hub (rainbow-shuffle-safe fallback
 *  to the first player, mirroring pentagramOwnerForAnchor). */
function turretOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === hub.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  return owner?.id ?? null;
}

export const laserTurretPredicate: DefenderRecipePredicate = (world) => {
  const anchor = findBuildableTurretAnchor(world);
  if (anchor === null) return null;
  const owner = turretOwnerForAnchor(world, anchor);
  if (owner === null) return null;
  const hub = world.primitives.get(anchor)!;
  return { triggererPlayerId: owner, anchorPrimitiveId: anchor, pos: { x: hub.pos.x, y: hub.pos.y } };
};

export const LASER_TURRET_RECIPE: DefenderGodlyRecipe = {
  kind: 'defender',
  id: 'laserTurret',
  defenderKind: 'turret',
  predicate: laserTurretPredicate,
  stillValid: (world, anchorId) => isLaserTurretComponent(world, anchorId),
  // Codex gallery sprite placeholder (reuses the new matted Voltkin zap art until a turret art pass).
  characterSprite: '/godly/voltkin/anim/voltkin-zap.png',
};

// Side-effect registration (voltkin.ts precedent) — main.ts imports this module for the effect.
// runDefenderIgnition (findDefenderMatches) + defenderLifecycle.recipeStillSatisfied both look
// the recipe up in the registry, so it MUST be registered to build + re-validate in-game.
registerRecipe(LASER_TURRET_RECIPE);
