/**
 * SPARK — S141 P1 — the STINK TOWER recipe. The first NON-GODLY buildable in the game.
 *
 * Detects: a connected component that is EXACTLY 1 Square hub of bond-degree 3 + 3 Circle leaves.
 * Every Square↔Circle bond is the 'Capsule' magic combo (combos.ts — *"hard corners learn to roll,
 * leave glow trails"*), so this reads as **"1 Square + 3 Capsules"** — the same combo-named form as
 * the laser turret's "1 Line + 6 Whips" and HELGA's "3 Warped Anchors + 3 Stars". A rolling capsule
 * is also, conveniently, exactly what a thrown bag is.
 *
 *          C
 *          |
 *      C — S — C        (the Square is degree 3; each C is a Circle leaf)
 *
 * ## ⚠ THE SHAPES ARE A CLAUDE RULING, NOT AN OWNER RULING
 *
 * The S139 spec explicitly forbade guessing them. The owner then pre-approved a full autonomous run
 * and went to sleep, so they were chosen on measured evidence rather than left unbuilt. **Retune
 * freely**: `STINK_TOWER_SIZE` / `STINK_TOWER_HUB_DEGREE` and the two `SparkType` constants below are
 * the only inputs, every test pins the RELATIONSHIP rather than a literal, and no player-facing copy
 * restates the numbers. That is the S140 lesson applied BEFORE the fact — the laserTurret retune
 * became a copy migration precisely because "seven" had been written into prose in six places.
 *
 * ## THE COLLISION SWEEP — why Square/Circle and not anything else
 *
 * A recipe fires the instant its component matches, so it must not match a PARTIAL build of an
 * existing recipe. Read off the five shipped predicates:
 *
 * | recipe       | size | topology     | hub      | hub deg | leaves               |
 * |--------------|------|--------------|----------|---------|----------------------|
 * | pentagram    | 5    | closed cycle | —        | —       | 5x Triangle (all d2) |
 * | lightningHub | 6    | star         | Dot      | 5       | 5x Circle            |
 * | princessHelga| 7    | star         | Triangle | 6       | 3x Spiral + 3x Circle|
 * | laserTurret  | 7    | star         | Line     | 6       | 6x Spiral            |
 * | voltkin      | 8    | linear chain | —        | —       | 4x Square → 4x Triangle |
 *
 * ⇒ **Square is the ONLY primitive never used as a hub. Size 4 and hub-degree 3 are both free rungs.**
 *
 * Every partial build that reaches component size 4, checked individually:
 *   • Voltkin's first four Squares → 4x Square. REJECTED: the leaves must be Circles. ⭐ This is the
 *     one that kills the obvious alternative — a 4-SQUARE RING would have matched here, which is
 *     exactly why the ring form was rejected in favour of a Square/Circle star.
 *   • lightningHub mid-build, Dot + 3 Circles → REJECTED: the hub must be a Square, not a Dot.
 *   • princessHelga mid-build, Triangle + 3 Circles → REJECTED: hub must be a Square.
 *   • laserTurret mid-build, Line + 3 Spirals → REJECTED: hub and leaves both wrong.
 *   • pentagram mid-build, 4 Triangles → REJECTED: hub must be a Square.
 *
 * ## ⚠ AND IT IS STILL THE EASIEST RECIPE IN THE GAME TO BUILD BY ACCIDENT — SAY SO, DON'T HIDE IT
 *
 * Degree 3 with three leaves is far easier to hit than the shipped degree-5/6 stars. Drop a Square
 * within `AUTO_BOND_RADIUS` of three loose Circles — which is a completely ordinary board state while
 * someone is assembling a lightningHub — and auto-bond builds you a Stink Tower you did not ask for.
 * That is a genuine consequence of a 4-shape recipe, not an oversight, and TWO properties keep it
 * benign rather than a bug:
 *
 *   1. **It self-heals.** The component-size gate is EXACT and `stillValid` is re-checked every
 *      `REVALIDATE_INTERVAL_TICKS` (0.5 s). Bond a fourth shape on and the tower removes itself.
 *   2. **It cannot punish you for it.** The death blast is gated in `destroyDefender` on the ANCHOR
 *      BEING GONE, so a tower that removes itself because you kept building never detonates. Without
 *      that discriminator, continuing your own build would blast your own structure — which is the
 *      single most important interaction in this whole feature, and it is enforced there, not here.
 *
 * Flag it at playtest: it is the most likely thing about this tower to feel wrong.
 *
 * ## Strictness
 *
 * The gate is (a) the hub is a Square of bond-degree exactly `STINK_TOWER_HUB_DEGREE`, (b) its
 * connected component is exactly `STINK_TOWER_SIZE` primitives, (c) every non-hub member is a Circle.
 * Those three TOGETHER force the star by pigeonhole — the hub's 3 bonds reach 3 distinct in-component
 * members, and the only members are the 3 Circles, so each Circle bonds the hub. The argument is
 * degree-AGNOSTIC (it needs only `size === degree + 1` in a simple graph), which is the same argument
 * already shipping at degree 5 in `lightningHub.ts` and degree 6 in `laserTurret.ts`.
 *
 * ⚠ Leaves are deliberately NOT required to be degree-1, matching both shipped stars. Dense auto-bond
 * routinely bonds two adjacent leaves to each other WITHOUT changing the hub degree, the component
 * size or the leaf types — and requiring degree-1 caused "a frequent silent no-build" that
 * `laserTurret.ts` documents as the reason it loosened the gate. A Council seat proposed re-adding
 * that requirement here as the fix for accidental construction; it was rejected because it trades a
 * benign, self-healing accident for a build that mysteriously refuses to fire.
 *
 * Identity / anchor: the Square hub (unique within the component — the only non-Circle). The tower
 * stands and throws from it. DEFENDER recipe (kind:'defender'): the matcher dispatches
 * REGISTER_DEFENDER. Registered via side-effect import.
 */

import { SparkType, STINK_TOWER_HUB_DEGREE, STINK_TOWER_SIZE } from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { DefenderGodlyRecipe, DefenderRecipePredicate } from './types.ts';
import { registerRecipe } from './index.ts';

/**
 * The two shape choices, named so a retune is one edit and so tests can assert the RELATIONSHIP
 * (e.g. "the hub type is never used as a hub by any other recipe") rather than the literal.
 */
export const STINK_HUB_TYPE = SparkType.Square;
export const STINK_LEAF_TYPE = SparkType.Circle;

/**
 * Read-only check: is the component anchored at `squareId` a 1-Square(deg3) + 3-Circle star?
 * Exported so `defenderLifecycle.recipeStillSatisfied` (via the recipe's `stillValid`) can
 * re-validate a live tower's CURRENT component each poll — a chewer eating a Circle leaf, or the
 * player bonding a fourth shape on, drops the size/degree and the tower tears down.
 */
export function isStinkTowerComponent(world: World, squareId: PrimitiveId): boolean {
  const hub = world.primitives.get(squareId);
  if (hub === undefined) return false;
  if (hub.type !== STINK_HUB_TYPE) return false;
  if (hub.bonds.size !== STINK_TOWER_HUB_DEGREE) return false;
  const comp = componentOf(hub, world.primitives, world.bonds);
  if (comp.primitiveIds.size !== STINK_TOWER_SIZE) return false;
  for (const id of comp.primitiveIds) {
    if (id === squareId) continue;
    const p = world.primitives.get(id);
    if (p === undefined) return false;
    if (p.type !== STINK_LEAF_TYPE) return false; // every non-hub member must be a Circle
  }
  return true;
}

/**
 * Find the lowest-PrimitiveId Square that anchors a valid stink-tower star AND is not already a live
 * defender (so `runDefenderIgnition` can build one per frame, and a rebuild re-ignites after removal).
 * Ascending id scan → deterministic.
 *
 * ⚠ The live-anchor skip must test ALL defenders, not just stink towers: `applyRegisterDefender`
 * de-dups by `anchorPrimitiveId` across every kind with no kind comparison, so returning an anchor
 * another kind already owns would produce a REGISTER_DEFENDER the reducer silently drops — a recipe
 * that "does nothing" with no error anywhere.
 */
function findBuildableStinkAnchor(world: World): PrimitiveId | null {
  const live = new Set<PrimitiveId>();
  for (const d of world.defenders.values()) live.add(d.anchorPrimitiveId);
  const squareIds = Array.from(world.primitives.values())
    .filter((p) => p.type === STINK_HUB_TYPE)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  for (const id of squareIds) {
    if (live.has(id)) continue;
    if (isStinkTowerComponent(world, id)) return id;
  }
  return null;
}

/** Owner = the player whose colour placed the Square hub (rainbow-shuffle-safe fallback to the
 *  first player, mirroring turretOwnerForAnchor / pentagramOwnerForAnchor). */
function stinkOwnerForAnchor(world: World, anchorId: PrimitiveId): PlayerId | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  let owner = Array.from(world.players.values()).find((p) => p.color === hub.placerColor);
  if (owner === undefined) owner = Array.from(world.players.values())[0];
  return owner?.id ?? null;
}

export const stinkTowerPredicate: DefenderRecipePredicate = (world) => {
  const anchor = findBuildableStinkAnchor(world);
  if (anchor === null) return null;
  const owner = stinkOwnerForAnchor(world, anchor);
  if (owner === null) return null;
  const hub = world.primitives.get(anchor)!;
  return { triggererPlayerId: owner, anchorPrimitiveId: anchor, pos: { x: hub.pos.x, y: hub.pos.y } };
};

export const STINK_TOWER_RECIPE: DefenderGodlyRecipe = {
  kind: 'defender',
  id: 'stinkTower',
  defenderKind: 'stinkTower',
  predicate: stinkTowerPredicate,
  stillValid: (world, anchorId) => isStinkTowerComponent(world, anchorId),
  // Codex gallery sprite placeholder, matching the laserTurret precedent (the in-world tower is fully
  // procedural — see render/stinkTowerRenderer.ts — so no atlas ships for this).
  characterSprite: '/godly/voltkin/anim/voltkin-zap.png',
};

// Side-effect registration (laserTurret precedent) — main.ts imports this module for the effect.
// runDefenderIgnition (findDefenderMatches) + defenderLifecycle.recipeStillSatisfied both look the
// recipe up in the registry, so it MUST be registered to build + re-validate in-game. A recipe module
// that is never imported fails SILENTLY: no match, no error, and `recipeStillSatisfied` falls back to
// the weaker "anchor primitive exists" rule.
registerRecipe(STINK_TOWER_RECIPE);
