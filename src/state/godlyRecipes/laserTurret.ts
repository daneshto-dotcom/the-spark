/**
 * SPARK — S103 P3 (#9) — Laser Turret DEFENDER recipe.
 *
 * Detects: a connected component that is EXACTLY 1 Line + 6 Spiral leaves — a star where the Line
 * has bond-degree 6 and each of the 6 Spirals is a pure leaf (degree 1, bonded only to the Line).
 * Every Line↔Spiral bond is the 'Whip' magic combo, so this is "1 Line + 6 Whips".
 *
 *        S   S   S
 *         \  |  /
 *          Line          (the Line is degree 6; each S is a degree-1 leaf)
 *         /  |  \
 *        S   S   S
 *
 * ⚠ S140 P1 — THIS RECIPE WAS SEVEN, AND THE SEVEN WAS LOAD-BEARING COPY. The owner's original spec
 * was "1 Line + 7 Whips"; the Codex punchline was literally "(Seven. Not four.)"; and
 * codexPresentation.test.ts carried an ANTI-DRIFT test whose stated purpose was to stop the emblem and
 * this predicate from ever disagreeing about seven. The owner retuned it to SIX in S140 so the recipe
 * fits under the new CASTLE_BANK_CAP of 7 and both TOWER recipes become directly holdable. All five
 * S140 Council seats advised against this 5-0; the owner ruled it anyway and that ruling is executed
 * here, with every "seven" site moved in the SAME commit — see the hazard note below for why that is
 * not optional.
 *
 * ⛔ "BUILDS AT SIX, DIES AT SEVEN." The gates below are strict `!==` with NO upper tolerance. A
 * player who adds a SEVENTH Spiral — as every stale piece of copy would have told them to — pushes
 * the hub to degree 7 and the component to 8, `stillValid` returns false, and the host's revalidation
 * poll fires REMOVE_DEFENDER within 0.5 s (REVALIDATE_INTERVAL_TICKS = 30). The turret would build,
 * then die in front of them. That is why the retune is a copy migration, not a constant change: if
 * any "seven" survives anywhere a player can read it, it becomes a trap.
 *
 * Strictness (mirrors pentagram.ts's component-isolation predicate): componentOf follows EVERY
 * bond, so an extra attached shape or a leaf that is also bonded elsewhere pushes the size past 7
 * / raises a leaf's degree ⇒ NO match. A single connected graph of {one degree-6 hub + six
 * degree-1 leaves} is exactly this star.
 *
 * ⚠ COLLISION SURFACE, NOW TIGHTER THAN IT WAS. At size 7 + hub degree 6 this recipe shares BOTH
 * numbers with princessHelga (1 Triangle hub deg-6 + 3 Spiral + 3 Circle). They remain disjoint on
 * hub TYPE (Line vs Triangle) and on the leaf multiset, and `laserTurret.test.ts` pins that
 * separation explicitly — but the size ladder now has its first doubly-occupied rung, so a future
 * defender recipe authored at 7 shapes must check BOTH.
 *
 * Identity / anchor: the Line primitive (unique within the component — the only degree-6 node), so
 * the turret stands + fires from the Line. This is a DEFENDER recipe (kind:'defender'): the matcher
 * dispatches REGISTER_DEFENDER (never a cinematic / spawner). Registered via side-effect import.
 */

import { SparkType } from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import type { World } from '../worldTypes.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import type { DefenderGodlyRecipe, DefenderRecipePredicate } from './types.ts';
import { registerRecipe } from './index.ts';

/**
 * S140 P1 — exported so `castleBank.test.ts` can pin the RELATIONSHIP between the bank cap and the
 * recipe ladder instead of pinning the cap's literal value. The standing lesson from S139 is that
 * three hand-synced numbers is not an invariant, it is a wish.
 */
export const TURRET_SIZE = 7; // 1 Line hub + 6 Spiral leaves (was 8 / 7 leaves before S140 P1)
export const TURRET_HUB_DEGREE = 6;
const HUB_DEGREE = TURRET_HUB_DEGREE;

/**
 * Read-only check: is the component anchored at `lineId` a 1-Line(deg6) + 6-Spiral star?
 * Exported so defenderLifecycle.recipeStillSatisfied (via the recipe's `stillValid`) can re-validate
 * a live turret's component each poll without re-walking the whole world.
 *
 * S103 P3 CHECK (Council, Grok+Gemini): the gate is (a) the hub is a Line of bond-degree exactly 6,
 * (b) its connected component is exactly 7 primitives, (c) every non-hub member is a Spiral. Those
 * three TOGETHER force the star by pigeonhole — the hub's 6 bonds reach 6 distinct in-component
 * members, and the only members are the 6 Spirals, so each Spiral bonds the hub (= 6 'Whip' combos).
 * The pigeonhole argument is degree-AGNOSTIC (it needs only size == degree + 1 in a simple graph),
 * which is why it survives the S140 retune unchanged — the same argument already ships at degree 5
 * in lightningHub.ts.
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
