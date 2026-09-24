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
// S189 C2 — the survival test (contains), distinct from the ignition test (exact).
import { towerStandsAt } from '../towerMembers.ts';

/**
 * S140 P1 — exported so `castleBank.test.ts` can pin the RELATIONSHIP between the bank cap and the
 * recipe ladder rather than the cap's literal value ("pin the relationship, not the value").
 */
export const HELGA_SIZE = 7; // 1 Triangle hub + 3 Spiral + 3 Circle leaves
const HUB_DEGREE = 6;
const SPIRAL_LEAVES = 3; // 3 Warped Anchors
const CIRCLE_LEAVES = 3; // 3 Stars (unordered {Triangle,Circle} type-set)

/**
 * Read-only check: is the component anchored at `hubId` a Triangle hub(deg6) + 3 Spiral + 3 Circle
 * star? Exported so defenderLifecycle.recipeStillSatisfied (via `stillValid`) can re-validate each poll.
 * ⚠ S189 C2 + R190-J — NO LONGER CALLED IN PRODUCTION. Survival (`stillValid`) AND ignition /
 * re-summon (`findBuildableHelgaAnchor`) both ask `towerStandsAt` now. This exact shape test is kept
 * as the definition of a CLEAN hall, which `weldOntoTowerS189.test.ts` stamps against (a clean hall
 * must satisfy both) and `princessHelga.test.ts` pins.
 *
 * S103 P4 CHECK (Council, Grok+Gemini): the gate is (a) the hub is a Triangle of bond-degree exactly
 * 6, (b) its component is exactly 7 primitives, (c) the 6 non-hub members are exactly 3 Spirals + 3
 * Circles. Those force the star by pigeonhole (the hub's 6 bonds reach all 6 leaves → 3 Warped
 * Anchors + 3 Stars). We deliberately DON'T require each leaf degree-1: dense AUTO_BOND can bond two
 * adjacent leaves WITHOUT changing the hub degree / component size / leaf types — so tolerating
 * inter-leaf bonds fixes a frequent silent no-build while a size/degree/type mismatch still rejects.
 * Star is the UNORDERED {Triangle,Circle} type-set (a Circle leaf), direction-agnostic per OC3.
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
    if (p.type === SparkType.Spiral) spirals++; // Triangle↔Spiral = Warped Anchor
    else if (p.type === SparkType.Circle) circles++; // {Triangle,Circle} type-set = Star (dir-agnostic)
    else return false; // any other leaf type ⇒ NO match
  }
  return spirals === SPIRAL_LEAVES && circles === CIRCLE_LEAVES;
}

/**
 * Lowest-id Triangle hub anchoring a valid, NOT-already-live HELGA. Ascending id → deterministic.
 *
 * ⭐⭐ OWNER RULING R190-J (S189) — *"Every fight she should come back as long as the tower is still
 * up."* Helga is the one defender that DIES while her tower stands (S158 P7), and she comes back
 * through THIS predicate on the next BUILD. It used `isHelgaComponent` — the exact whole-component
 * test — so once anything was welded onto her hall she was gone for good while the hall itself stood
 * (S189 C2 made the hall survive welds; re-summon was left behind, and he ruled it wrong).
 *
 * So Helga's hub is found by the SURVIVAL test (`towerStandsAt`: the Triangle hub still holds its
 * own 3 Spiral + 3 Circle arms, whatever else is welded on). ⚠ This is Helga's IGNITION too — there
 * is no record of "this was her hall" once she has died, so first build and re-summon are one
 * predicate. The consequence, stated: a Triangle carrying her six arms plus anything else (a ring
 * node of a pentagram or a Triangle race ring, say) is ALSO a Helga hub. That needs six specific
 * shapes around one Triangle, so it is a deliberate build, not a lattice accident.
 */
function findBuildableHelgaAnchor(world: World): PrimitiveId | null {
  const live = new Set<PrimitiveId>();
  for (const d of world.defenders.values()) live.add(d.anchorPrimitiveId);
  const triIds = Array.from(world.primitives.values())
    .filter((p) => p.type === SparkType.Triangle)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  for (const id of triIds) {
    if (live.has(id)) continue;
    if (towerStandsAt(world, 'helga', id)) return id;
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
  /*
   * ⭐⭐ S189 C2 — SURVIVAL IS "THE RECIPE IS STILL CONTAINED". `isHelgaComponent` was the IGNITION
   * test (R190-J moved ignition onto contains too) — and it is a WHOLE-COMPONENT test (the S158 B2b defect, never fixed for
   * HELGA), so as the survival test ONE shape welded onto ONE leaf tore her hall down. Survival now
   * asks only that the Triangle hub still holds its own 3 Spiral + 3 Circle arms; see
   * `state/towerMembers.ts`. ⭐ R190-J — and her RE-SUMMON after she is killed uses the same test
   * (`findBuildableHelgaAnchor` above), so a welded hall that stands brings her back every fight.
   */
  stillValid: (world, anchorId) => towerStandsAt(world, 'helga', anchorId),
  characterSprite: '/godly/helga/helga.png', // S110 P5 — HELGA's own matted imagen art (dirndl + stein + slap)
};

// Side-effect registration (laserTurret precedent) — main.ts imports this module for the effect.
registerRecipe(HELGA_RECIPE);
