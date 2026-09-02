/**
 * SPARK — S113 Batch C — Lightning-Hub SPAWNER recipe ("5 circles + a dot in the middle").
 *
 * Detects: a connected component that is EXACTLY 1 Dot hub of bond-degree 5 + 5 Circle leaves.
 * Modeled on laserTurret.ts's loosened hub+leaves gate (NOT pentagram's strict all-degree-2 ring):
 * the gate is (a) the hub is a Dot of bond-degree exactly LIGHTNING_HUB_DEGREE (5), (b) its connected
 * component is exactly LIGHTNING_HUB_COMPONENT_SIZE (6) primitives, (c) every non-hub member is a
 * Circle. Those three TOGETHER force the star by pigeonhole — the hub's 5 bonds reach 5 distinct
 * in-component members, and the only members are the 5 Circles, so each Circle bonds the hub. We
 * deliberately DON'T require each leaf to be degree-1: dense AUTO_BOND can bond two adjacent Circle
 * leaves to each other (a leaf of degree 2) WITHOUT changing the hub degree, the component size, or
 * the leaf types — so tolerating inter-leaf bonds fixes a frequent silent no-build (the laserTurret
 * lesson) while a size/degree/type mismatch (an extra shape, a wrong leaf, a missing leaf) rejects.
 *
 *        C   C   C
 *         \  |  /
 *      C --- Dot --- C     (the Dot is degree 5; each C is a Circle leaf)
 *
 * Identity / anchor: the Dot primitive (unique within the component — the only degree-5 node), so
 * the spawner stands on the Dot. This is a SPAWNER recipe (kind:'spawner'): the matcher dispatches
 * REGISTER_SPAWNER (never a cinematic). Registered via side-effect import (pentagram precedent).
 */

import { SparkType, LIGHTNING_HUB_DEGREE } from '../../constants.ts';
import { registerRecipe } from './index.ts';
// S158 B2b — the shared star test that replaced four whole-component tests.
import { isStarAt } from './starShape.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { SpawnerGodlyRecipe, SpawnerRecipePredicate } from './types.ts';

/**
 * Read-only check: is the component anchored at `dotId` a 1-Dot(deg5) + 5-Circle star? Exported so
 * spawnerLifecycle.recipeStillSatisfied can re-validate a live hub's CURRENT component each poll
 * (a chewer/drone eating a Circle leaf drops the size/degree → the hub's spawner tears down).
 */
export function isLightningHubComponent(world: World, dotId: PrimitiveId): boolean {
  // ⭐ S158 B2b — the STAR AT THE ANCHOR, not the island it sits on. The old whole-component
  // test made one friendly shape bonded to one LEAF un-make the tower, and the re-validation
  // poll then removed it silently. See starShape.ts for the measurement and the consequence.
  return isStarAt(world, dotId, SparkType.Dot, SparkType.Circle, LIGHTNING_HUB_DEGREE);
}

/**
 * Enumerate the Dot-hub anchors of ALL valid lightning-hub stars in the world, ascending id
 * (deterministic seed scan). Mirrors findAllPentagramAnchors' contract for the ignition de-dup +
 * lowest-anchor tie-break. Each hub is a distinct Dot (degree 5) and stars are disjoint components,
 * so anchors are unique per component. The anchor is the DOT itself (recipeStillSatisfied expects it).
 */
export function findAllLightningHubAnchors(world: World): PrimitiveId[] {
  const dotIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Dot)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  const anchors: PrimitiveId[] = [];
  for (const id of dotIds) {
    if (isLightningHubComponent(world, id)) anchors.push(id);
  }
  return anchors;
}

/** Owner of the hub = the player whose color placed the Dot (rainbow-safe fallback to first player). */
export function lightningHubOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === hub.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  return owner?.id ?? null;
}

export const lightningHubPredicate: SpawnerRecipePredicate = (world) => {
  const anchors = findAllLightningHubAnchors(world);
  if (anchors.length === 0) return null;
  const anchor = anchors[0]; // lowest Dot id (deterministic)
  const owner = lightningHubOwnerForAnchor(world, anchor);
  if (owner === null) return null;
  return { triggererPlayerId: owner, anchorPrimitiveId: anchor };
};

export const LIGHTNING_HUB_RECIPE: SpawnerGodlyRecipe = {
  kind: 'spawner',
  id: 'lightningHub',
  predicate: lightningHubPredicate,
  // Codex gallery sprite — reuses the matted Voltkin zap art (the drone IS the Voltkin rig @0.5).
  characterSprite: '/godly/voltkin/anim/voltkin-zap.png',
};

// Side-effect registration (pentagram/laserTurret precedent) so the Codex TOWERS & STRUCTURES tab +
// recipeStillSatisfied find it. Ignition uses findAllLightningHubAnchors directly (godlyOrchestration).
registerRecipe(LIGHTNING_HUB_RECIPE);
