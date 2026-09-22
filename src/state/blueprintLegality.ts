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
 * ⛔⛔ **S185 — REASON 2 IS NOT ACTUALLY PREVENTED BY THIS RULE, AND REASON 1 NEVER NEEDED 60 px.**
 * Clearance is now measured against `STAMP_CLEARANCE` (24), not `AUTO_BOND_RADIUS` (60), because:
 *
 *   · reason 1 is an OVERLAP argument, and it is satisfied by an overlap-sized margin. A primitive's
 *     soft-collision radius tops out at 10.8 px, so two of the largest shapes just touch at 21.6 —
 *     24 clears them and the solver never shoves anything. The fresh bonds are not strained.
 *   · reason 2 was never enforced by this arm at all. A LATER hand placement can land anywhere and
 *     welds within `MERGE_REACH_RADIUS` (100), which no stamp-time margin can pre-empt. And the
 *     owner has since RULED that welding structures together is a legitimate mechanic rather than a
 *     hazard (canon §7, R185-B: it buys pool and costs repair, on purpose).
 *
 * The cost of the old margin was measured before it was changed: one built laser turret removed
 * 62,356 px² of legal centres, 7.06× its own art box, and two of them could not stand closer than
 * 148 px while their art is 94 px wide. Owner: *"half of the space on the whole map is unbuildable
 * just because you need to be so far. That doesn't make sense."*
 *
 * ⚠ S182 — AND THE **GEOMETRIC** ARMS (edge, quarry, castle) ARE MEASURED AGAINST THE TRUE
 * FOOTPRINT BOX, NOT A CIRCUMRADIUS. This sentence used to say clearance was measured against
 * `blueprintRadius`; that scalar is the distance to the farthest node and so refused a wide, flat
 * recipe across a band as deep as its longest arm in EVERY direction. See `blueprintExtent`.
 */

import {
  STAMP_CLEARANCE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { FOOTPRINT_MARGIN, blueprintExtent, blueprintPositions } from './blueprints.ts';
import { canBuildAt, castleKeepOutHitsBox, type Box } from './zones.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { World } from './worldTypes.ts';
import type { PlayerId, Vec2 } from '../types.ts';

/**
 * ⭐ S186 (owner playtest #5) — **8 → 0. THIS IS THE PART OF THE DEAD BAND THAT WAS FREE.**
 *
 * He reported that he cannot build in the bottom band. Measured: for a laser turret (footprint
 * 100.21 × 112.00 px) the lowest legal centre was y = 1016, so **64 px of canvas held no legal tower
 * centre**. ⚠ And the bottom is NOT special — the identical rule left 64 px dead at the TOP and
 * ~58 px on each SIDE. It only READS as a bottom problem because `FOOTER_TOP_Y` is 996, so that
 * band lies under the menu while the identical band at the top is empty sky.
 *
 * Of those 64 px, exactly 8 were free to give back and they are given back here. The other 56 are
 * not air: 12 is `FOOTPRINT_MARGIN`, the outermost node's own draw radius (a node is a POINT but
 * draws 8–10.8 px wide), and 44 is the node offset itself — past that a connector is off-screen,
 * which is a ruling, not a constant.
 *
 * ⛔ **THE OLD 8 WAS AN AESTHETIC BORROWED FROM A PANEL, NOT A SAFETY MARGIN** — its own comment said
 * *"matching the panel's 8 px canvas inset"*. The safety argument belongs to `FOOTPRINT_MARGIN`,
 * which is untouched, so a node at the boundary is still drawn in full.
 *
 * ⭐ **AND IT STAYS ATTACKABLE, WHICH IS THE CONSTRAINT THAT ACTUALLY MATTERS.** Verified against the
 * shipped numbers rather than assumed: a creature clamps at `CANVAS_HEIGHT - WORLD_EDGE_MARGIN` =
 * 1040 and `goblinMelee` has a 35 px arm, so the lowest strikeable y is **1075**. At pad 0 a laser
 * turret's lowest centre is 1024 and its lowest NODE is 1024 + (56 − 12) = **1068** — inside the arm
 * with 7 px to spare. A tower nobody can reach would be strictly worse than a band nobody can build
 * in.
 */
const EDGE_PAD = 0;

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

  /*
   * 2. Not in the shared quarry. `enforceSpawnerBounds` rim-snaps any non-escrowed spark out of this
   *    disc every substep, so geometry stamped here would be physically ejected — and the quarry is
   *    common ground, not buildable territory. Tested against the footprint, not just the centre.
   *
   * ⭐ S182 — PER NODE, AGAINST THE QUARRY DISC. Not the circumradius (the defect this session is
   * fixing), and ⛔ NOT THE BOUNDING BOX EITHER — a box-vs-disc test was the first cut and it was
   * WRONG IN THE DIRECTION THIS WHOLE SESSION EXISTS TO FIX. The box's CORNER is farther from the
   * centre than the outermost node is, so on the diagonals it refused MORE ground than the old
   * circumradius did. Measured on this tree before the fix, along the 45° ray, refusal reach:
   * t3 towers 171.0 → 174.6, stinkTower 181.0 → 184.0, pentagram 177.0 → 191.7,
   * lightningHub 181.0 → 196.7, laserTurret/helga 181.0 → 200.0, goblinTower 181.0 → 204.2,
   * the six t9 towers 201.0 → 229.1. Eighteen of nineteen recipes LOST diagonal ground, in a change
   * whose entire purpose was to stop refusing ground the player should be able to build on — and
   * the comment that stood here claimed the exact opposite ("can only ever ACCEPT more ground").
   *
   * ⭐ THE PER-NODE FORM IS MONOTONE, WHICH IS THE PROPERTY THE BOX LACKED. A node is at most
   * `maxNodeDist` from the centre, so refusing here implies the old test refused too:
   *   min_n |n − quarry| ≤ R + MARGIN  ⟹  |centre − quarry| ≤ R + maxNodeDist + MARGIN = R + r_old.
   * So the new arm is a strict subset of the old one in EVERY direction. Re-measured after the fix
   * and pinned on the diagonal in `blueprintLegality.test.ts`, which previously probed the +x axis
   * only — the one direction in which a box and a circumradius happen to agree.
   */
  const quarryR2 = (SPAWNER_RADIUS + FOOTPRINT_MARGIN) * (SPAWNER_RADIUS + FOOTPRINT_MARGIN);
  for (const node of blueprintPositions(blueprintId, centre)) {
    const qdx = node.x - SPAWNER_CENTER_X;
    const qdy = node.y - SPAWNER_CENTER_Y;
    if (qdx * qdx + qdy * qdy <= quarryR2) return 'QUARRY';
  }

  /*
   * 3. ⭐⭐ S182 (owner) — NOT ON TOP OF A CASTLE.
   *
   * > *"You can place any tower over the castle. The castle doesn't read anything. Castle should
   * > have an area around it where you can't place anything. At least in the immediate vicinity."*
   *
   * ⛔ THE RULE ITSELF LIVES IN `zones.canBuildAt`, WHICH THE **REDUCER** READS — see the long note
   * there. This arm exists for the same reason the QUARRY arm above does: it is FOOTPRINT-aware
   * where `canBuildAt`'s castle arm tests the centre only, so it is the stricter test AND it hands
   * the ghost an accurate word instead of the misleading `ENEMY GROUND` (your own keep is not enemy
   * ground). Reaching `canBuildAt`'s own castle arm from here is therefore unreachable-by-
   * construction rather than redundant.
   *
   * ⚠ AND IT IS THE BOUNDING BOX, NOT THE NODES — DELIBERATELY, UNLIKE THE QUARRY ARM ABOVE, and
   * the difference is the SAFETY DIRECTION rather than an inconsistency. A box is CONSERVATIVE: its
   * corner reaches past the outermost node, so it refuses a little more ground than the stamp
   * strictly occupies. Round the quarry that was a REGRESSION (it took back ground this session
   * exists to give), which is why arm 2 is per-node. Round a castle it is the whole point — the
   * owner asked for *"an area around it where you can't place anything"*, so erring outward is the
   * ruling, not a defect. Stated here so the asymmetry reads as a decision, not as a miss.
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

  // 5. Clear of existing geometry, by OVERLAP rather than by bond reach — S185, owner-ruled.
  //    ⛔ THIS USED TO READ AUTO_BOND_RADIUS (60), "because that is the distance at which a future
  //    placement could weld a chord onto the new structure". That rationale did not survive being
  //    checked: a blueprint stamp never auto-bonds (collectHostMergeCandidates is reached only from
  //    placeFromFree and dragPreview), so two stamped structures could not weld to each other at any
  //    distance. Meanwhile it removed ~7x each tower's own art box from the buildable map, which the
  //    owner measured on the pad: "half of the space on the whole map is unbuildable just because you
  //    need to be so far. That doesn't make sense." STAMP_CLEARANCE (24) is derived from what the
  //    rule actually has to guarantee — that shapes do not visually overlap — and puts two laser
  //    turrets at the 112 px he ruled for. See the constant for the full derivation.
  for (const node of blueprintPositions(blueprintId, centre)) {
    for (const prim of world.primitives.values()) {
      const pdx = prim.pos.x - node.x;
      const pdy = prim.pos.y - node.y;
      if (Math.hypot(pdx, pdy) < STAMP_CLEARANCE) return 'BLOCKED';
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
