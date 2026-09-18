/**
 * SPARK — S144 P1: is this a legal place to stamp a blueprint?
 *
 * ONE predicate, consumed by BOTH the drag ghost (P3, to tint the preview) and the host reducer
 * (P1, to authorise the build). That sharing is the point, and it is the contract `dragPreview.ts`
 * already established for single-primitive placement: *"the preview is the same set the release
 * commits"*. A ghost that tints green over a spot the reducer then refuses is worse than no ghost —
 * the player learns to distrust it.
 *
 * PURE and Pixi-free so both callers can use it and vitest can drive it headlessly.
 *
 * ⚠ WHY A CLEARANCE CHECK AT ALL, given the stamp writes its bonds explicitly and never consults
 * auto-bond. Two distinct reasons, neither cosmetic:
 *   1. **Physics.** Primitives soft-collide. Stamping a 4–8 node structure on top of existing
 *      geometry makes the solver shove both apart, which STRAINS the fresh bonds. A bond breaks at
 *      `STRAIN_BREAK_BY_TIER` (1.25× rest length for HIGH), a broken bond drops the component's
 *      degree, the recipe stops holding, and the tower is torn down within 0.5 s — a tower that
 *      "built and then vanished" with nothing in the logs.
 *   2. **Later placements.** A structure born inside `AUTO_BOND_RADIUS` of the player's other shapes
 *      is one ordinary placement away from having a chord auto-bonded onto it, which kills the
 *      exact-degree recipes (pentagram's deg-2 ring, voltkin's chain isolation).
 * So clearance from existing geometry is measured node-by-node against `AUTO_BOND_RADIUS`, not
 * merely against literal overlap.
 *
 * ⚠ S182 — AND THE **GEOMETRIC** ARMS (edge, quarry, castle) ARE MEASURED AGAINST THE TRUE
 * FOOTPRINT BOX, NOT A CIRCUMRADIUS. This sentence used to say clearance was measured against
 * `blueprintRadius`; that scalar is the distance to the farthest node and so refused a wide, flat
 * recipe across a band as deep as its longest arm in EVERY direction. See `blueprintExtent`.
 */

import {
  AUTO_BOND_RADIUS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { blueprintExtent, blueprintPositions } from './blueprints.ts';
import { boxPointDistSq, canBuildAt, castleKeepOutHitsBox, type Box } from './zones.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { World } from './worldTypes.ts';
import type { PlayerId, Vec2 } from '../types.ts';

/** Keep the whole footprint on-screen with a little air, matching the panel's 8 px canvas inset. */
const EDGE_PAD = 8;

/**
 * Why a stamp is refused. Returned rather than a bare boolean so the panel/ghost can SAY why —
 * the castle panel's standing contract is that a disabled affordance always names its blocker
 * (`castlePanel.ts`: *"A DISABLED CONTROL MUST SAY WHY"*), and a silently-red ghost is the same
 * defect in a different costume.
 */
export type StampRefusal = 'OFF SCREEN' | 'QUARRY' | 'CASTLE' | 'ENEMY GROUND' | 'BLOCKED' | 'FIGHT';

/**
 * ⭐ S182 — PURE — the blueprint's footprint as a world-space box, centred at `centre`.
 *
 * ONE derivation, consumed by all three footprint-aware arms below. `blueprintExtent` already
 * carries the margin, so this is pure translation and nothing here may add a second one.
 */
export function stampFootprintBox(centre: Vec2, blueprintId: GodlyId): Box {
  const e = blueprintExtent(blueprintId);
  return {
    minX: centre.x + e.minDx,
    maxX: centre.x + e.maxDx,
    minY: centre.y + e.minDy,
    maxY: centre.y + e.maxDy,
  };
}

/**
 * PURE — null when a stamp of `blueprintId` centred at `centre` is legal for `playerId`, otherwise
 * the reason it is refused.
 *
 * Checks run cheapest-first and in the order the player is most likely to trip them.
 */
export function stampRefusalAt(
  world: World,
  centre: Vec2,
  playerId: PlayerId,
  blueprintId: GodlyId,
): StampRefusal | null {
  /*
   * ⭐⭐ S182 (owner) — THE FOOTPRINT IS A BOX, NOT A DISC, AND EVERY GEOMETRIC ARM BELOW READS IT.
   *
   * > *"Where the queue is with all the shapes — in that area you can't place towers. That's weird.
   * > You should be able to place them out there."*
   *
   * This line used to be `const r = blueprintRadius(blueprintId)` — the distance to the FARTHEST
   * node — used as the margin in EVERY direction. VOLTKIN is 280 px wide and 0 px tall, so its
   * circumradius of 140 refused it across a 152 px band along the bottom of the board: the footer
   * band (84 px) plus 68 px of clear ground above it, for a shape with no vertical extent at all.
   * That band is exactly where the queue HUD sits, and exactly the ground his report is about.
   *
   * ⚠ THE REFUSAL WAS AT **VALIDATION**, NOT AT INPUT, AND THAT IS WHY THE FIX IS HERE. Proved in
   * `controls.ts`: `handleFooterChipClick` swallows a press only over a CHIP / palette / queue
   * RECTANGLE (`isOverChip` is emphatic that *"the empty stretches of the band stay fully clickable
   * board"*), so a click on the empty band reached the stamp arm and was refused by this predicate.
   * Had it been swallowed at input, no change here could have helped.
   */
  const box = stampFootprintBox(centre, blueprintId);

  // 0. ⭐ S149 P2 — BUILDING STOPS WHEN THE FIGHT STARTS. Cheapest check of all (one field read),
  //    and first because it is true of the WHOLE BOARD at once — no point measuring geometry when
  //    nowhere is legal.
  //
  //    ⚠ THIS IS THE ONE GATE THAT DOES **NOT** USE `canBuildNow`, and deliberately so. The other
  //    five only need a boolean, but this one owes the player a WORD: the panel's standing contract
  //    is that a disabled affordance always names its blocker, and answering "ENEMY GROUND" when
  //    the real reason is "the fight has started" would be a lie on your own territory. So the two
  //    halves of legality are asked separately HERE and composed everywhere else.
  if (world.matchPhase !== 'BUILD') return 'FIGHT';

  // 1. The whole footprint must be on canvas — a partially off-screen tower is unclickable and
  //    un-defendable, and the arena edge is not a legal build site in any TD.
  //    ⭐ S182 — PER-SIDE, from the true box. This is the arm that cost the owner the ground near
  //    the queue, and it is the only arm whose verdict a flat shape can differ on by 140 px.
  if (
    box.minX < EDGE_PAD || box.maxX > CANVAS_WIDTH - EDGE_PAD
    || box.minY < EDGE_PAD || box.maxY > CANVAS_HEIGHT - EDGE_PAD
  ) {
    return 'OFF SCREEN';
  }

  // 2. Not in the shared quarry. `enforceSpawnerBounds` rim-snaps any non-escrowed spark out of this
  //    disc every substep, so geometry stamped here would be physically ejected — and the quarry is
  //    common ground, not buildable territory. Tested against the footprint, not just the centre.
  //    ⭐ S182 — and against the footprint EXACTLY, `box` vs the quarry disc, where this was
  //    `hypot(centre − quarry) <= SPAWNER_RADIUS + circumradius`: the same disc-guarding-a-non-disc
  //    defect as arm 1, in the middle of the board instead of at its edge. The exact test can only
  //    ever ACCEPT more ground, never less, because the box is the stamp's real occupancy.
  if (
    boxPointDistSq(box, SPAWNER_CENTER_X, SPAWNER_CENTER_Y) <= SPAWNER_RADIUS * SPAWNER_RADIUS
  ) {
    return 'QUARRY';
  }

  /*
   * 3. ⭐⭐ S182 (owner) — NOT ON TOP OF A CASTLE.
   *
   * > *"You can place any tower over the castle. The castle doesn't read anything. Castle should
   * > have an area around it where you can't place anything. At least in the immediate vicinity."*
   *
   * ⛔ THE RULE ITSELF LIVES IN `zones.canBuildAt`, WHICH THE **REDUCER** READS — see the long note
   * there. This arm exists for the same reason the QUARRY arm above does and reads word for word
   * the same way: it is FOOTPRINT-aware where `canBuildAt`'s castle arm tests the centre only, so
   * it is the strictly stricter test AND it hands the ghost an accurate word instead of the
   * misleading `ENEMY GROUND` (your own keep is not enemy ground). Reaching `canBuildAt`'s own
   * castle arm from here is therefore unreachable-by-construction rather than redundant.
   */
  if (castleKeepOutHitsBox(box, world.layout)) return 'CASTLE';

  // 4. Not inside an opponent's territory — the same gate single-primitive placement enforces
  //    (`computePreviewBonds` returns EMPTY there), so click-to-build cannot become a way to plant
  //    structures somewhere hand-building cannot reach.
  // ⭐ S149 P1 — zone partition, not influence bubble (see placePrimitive.ts). The QUARRY arm above
  // deliberately stays and stays FIRST: it is footprint-aware (the `box`, S182) where
  // `canBuildAt` tests the centre only, so it is the stricter test AND it gives the player the
  // accurate refusal word. Reaching `canBuildAt`'s own quarry arm from here is therefore
  // unreachable-by-construction rather than redundant. ⭐ S182 — and arm 3 now stands in exactly
  // the same relation to `canBuildAt`'s castle arm.
  // ⭐ S149 P2 — the WHEN half is answered by step 0 above, so this is the WHERE half alone.
  if (!canBuildAt(centre, playerId, world.layout)) return 'ENEMY GROUND';

  // 5. Clear of existing geometry, by bond reach rather than by overlap — see the file docblock.
  //    AUTO_BOND_RADIUS is the margin because that is the distance at which a future placement could
  //    weld a chord onto the new structure.
  for (const node of blueprintPositions(blueprintId, centre)) {
    for (const prim of world.primitives.values()) {
      const pdx = prim.pos.x - node.x;
      const pdy = prim.pos.y - node.y;
      if (Math.hypot(pdx, pdy) < AUTO_BOND_RADIUS) return 'BLOCKED';
    }
  }

  return null;
}

/** PURE — convenience boolean for the ghost tint. */
export function canStampAt(
  world: World,
  centre: Vec2,
  playerId: PlayerId,
  blueprintId: GodlyId,
): boolean {
  return stampRefusalAt(world, centre, playerId, blueprintId) === null;
}
