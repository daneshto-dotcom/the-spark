/**
 * SPARK — S185 — **THE STINK TOWER HIDES ITS OWN SHAPES, AND STAYS CLICKABLE WHILE IT DOES.**
 *
 * Owner, S185, approving it in as many words: *"Connector hiding for stink tower — yes, definitely
 * implement that. That's I think the one tower you forgot [to hide] the connectors for."* And from
 * the same playtest: *"it was [the] stink tower shapes in the background, it looks stupid."*
 *
 * ⭐⭐ **HE WAS RIGHT AND THE HANDOFF WAS WRONG, WHICH IS WHY THIS FILE IS SMALL.** The standing
 * belief was that the stink tower plus "twelve race/tier-9 towers" all needed hiding and that hiding
 * was gated on having a 24-frame damage ramp — i.e. on ART HE WOULD HAVE TO PAY FOR. Neither half
 * held up:
 *
 *  · `markTowerCover(primIds, bondIds, anchorTick)` takes **ids and a tick**. No atlas, no frames,
 *    no ramp. Cover is published by whoever COMMITS A SPRITE, and the stink tower already commits
 *    one from its own veo sheet. So this cost **no art at all**.
 *  · the twelve race/tier-9 towers have been covered by `towerRenderer` since S175. The stink tower
 *    is the ONLY structure in the tree with a drawn sprite and no publish site — `structureRampRenderer`
 *    says so in a comment at its defender loop, and the cover census names this renderer in its
 *    must-publish-nothing list.
 *
 * ## ⛔ THE TRAP IN THIS LANE, AND IT IS NOT THE HIDING
 *
 * The canon is explicit that **a tower you cannot click is a tower you cannot repair**, which is
 * *strictly worse* than the mess he asked to remove. The click target for a built tower transfers
 * to the building (*"you click on the tower, ANYWHERE on the tower"*), and the two existing
 * hit-tests — `towerAnchorAtPoint` (race towers) and `rampAnchorAtPoint` (the five RAMP_SPECS
 * towers) — reach neither this defender nor its shapes. Hiding without adding a hit test would have
 * made the stink tower permanently unrepairable. Both halves therefore live in this one file.
 *
 * ## ⚠ THE HIT BOX IS MEASURED FROM ALL TWELVE IDLE CELLS, AND THE OBVIOUS SHORTCUT IS WRONG
 *
 * A prior measurement of this sheet read frame 0 alone and reported the subject as 152 px wide and
 * centred. Decoding all twelve cells (alpha > 24) says otherwise:
 *
 * ```
 *   idle[0]  x  51-202  (w 152)   <- the frame the shortcut sampled
 *   idle[2]  x  22-206  (w 185)   <- the widest
 *   union    x  22-206  (W 185)   y 15-239  (H 225)
 *   subject centre x = 114.0, cell centre x = 127.5  ->  offset -13.5 px
 * ```
 *
 * ⛔ **SO THE ART STRADDLES ITS ANCHOR RATHER THAN STANDING ON IT.** A symmetric box would leave
 * ~13 px of the tower's left side dead and ~13 px of empty ground on its right live — which is
 * exactly the defect `rampAnchorAtPoint` shipped in S183 ("the box assumed it stood on the
 * centroid"). The offsets below are asymmetric on purpose.
 *
 * ⚠ IDLE ROW ONLY, DELIBERATELY. Row 1 (attack) spans x 1-253 — nearly the whole cell — because of
 * the gas plume. A hit box sized to the plume would let a player click empty sky whenever the tower
 * fired. The BODY is the clickable thing.
 */

import { asBondId, type BondId, type PrimitiveId } from '../types.ts';
import type { World } from '../state/world.ts';
import { STINK_TOWER_SPRITE_BASE_SCALE } from '../constants.ts';

/**
 * The cover set for a stink tower: its Square hub, the three Circle leaves bonded to it, and the
 * three bonds between them.
 *
 * ⚠ THE SIBLING IS `rampMembersAt`'s `'star'` branch in `structureRamp.ts`, and this is deliberately
 * NOT a call into it. That function's only use of its `RampSpec` argument on the star path is
 * `spec.shape`, so reuse would mean fabricating a spec for a tower that is not in `RAMP_SPECS` and
 * has no ramp art — coupling this to a five-tower registry it is not a member of. Eight lines of
 * walk is the cheaper dependency. If a third caller ever wants it, lift it then.
 *
 * ⭐ NO TOPOLOGY CHECK HERE ON PURPOSE. The sim already decided this defender exists, which means
 * `isStinkTowerComponent` passed at build time and the 0.5 s revalidation poll has not torn it down.
 * Re-deriving the predicate in the renderer would be a second source of truth that can disagree.
 */
export function stinkTowerMembers(
  world: World,
  hubId: PrimitiveId,
): { readonly prims: PrimitiveId[]; readonly bonds: BondId[]; readonly newestTick: number } | null {
  const hub = world.primitives.get(hubId);
  if (hub === undefined) return null;
  const prims: PrimitiveId[] = [hubId];
  const bonds: BondId[] = [];
  let newestTick = 0;
  for (const bondId of hub.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue;
    bonds.push(asBondId(bondId as unknown as number));
    if (bond.createdTick > newestTick) newestTick = bond.createdTick;
    prims.push(bond.aId === hubId ? bond.bId : bond.aId);
  }
  return { prims, bonds, newestTick };
}

/**
 * The drawn body's extent relative to the defender's `pos`, in world px.
 *
 * Derivation, from the numbers in the file docblock and the renderer's own draw call
 * (`sp.anchor.set(footAnchor.x, footAnchor.y)`, `sp.position.set(d.pos.x, d.pos.y)`,
 * `sp.scale.set(STINK_TOWER_SPRITE_BASE_SCALE)`), with cellW 255, cellH 240 and
 * footAnchor (0.5, 0.9958):
 *
 * ```
 *   anchor in cell space = (0.5 * 255, 0.9958 * 240) = (127.5, 239.0)
 *   dxMin = (22  - 127.5) * 0.42 = -44.3
 *   dxMax = (206 - 127.5) * 0.42 = +33.0
 *   dyMin = (15  - 239.0) * 0.42 = -94.1
 *   dyMax = (239 - 239.0) * 0.42 =   0.0   <- it stands ON its anchor, feet at pos.y
 * ```
 *
 * ⚠ ROUNDED OUTWARD to whole pixels. A hit box that is a pixel generous is invisible to the player;
 * one that is a pixel short is a click that does nothing, and he has already lost a tower to a dead
 * click once.
 */
export const STINK_TOWER_HIT_DX_MIN = -45;
export const STINK_TOWER_HIT_DX_MAX = 33;
export const STINK_TOWER_HIT_DY_MIN = -95;
export const STINK_TOWER_HIT_DY_MAX = 0;

/**
 * Which stink tower, if any, the player just clicked.
 *
 * ⭐ RETURNS THE ANCHOR PRIMITIVE, not the `DefenderId`, so it drops straight into the existing
 * hit-test chain in `controls.ts` — which selects `{ kind: 'structure', primitiveId }` and is what
 * opens the sheet carrying REPAIR. That is the whole reason this function exists: the canon says a
 * tower you cannot click is a tower you cannot repair, and hiding the shapes removes the only
 * thing that was clickable before.
 *
 * ⭐ NEAREST-THEN-LOWEST-ID, not first-hit. `world.defenders` is a `Map` and its iteration is
 * insertion order, so letting it decide which of two overlapping towers answers a click would make
 * the outcome depend on build order. This project has shipped that bug before in the sim; it is not
 * going to ship it in the input layer. Distance is measured to the BODY CENTRE, not to `pos`, since
 * the art straddles the anchor.
 */
export function stinkTowerAt(world: World, x: number, y: number): PrimitiveId | null {
  const cx = (STINK_TOWER_HIT_DX_MIN + STINK_TOWER_HIT_DX_MAX) / 2;
  const cy = (STINK_TOWER_HIT_DY_MIN + STINK_TOWER_HIT_DY_MAX) / 2;
  let best: PrimitiveId | null = null;
  let bestD = Infinity;
  let bestId = Infinity;
  for (const d of world.defenders.values()) {
    if (d.kind !== 'stinkTower') continue;
    const dx = x - d.pos.x;
    const dy = y - d.pos.y;
    if (dx < STINK_TOWER_HIT_DX_MIN || dx > STINK_TOWER_HIT_DX_MAX) continue;
    if (dy < STINK_TOWER_HIT_DY_MIN || dy > STINK_TOWER_HIT_DY_MAX) continue;
    const ddx = dx - cx;
    const ddy = dy - cy;
    const dsq = ddx * ddx + ddy * ddy;
    const n = d.id as unknown as number;
    if (dsq < bestD || (dsq === bestD && n < bestId)) {
      bestD = dsq;
      bestId = n;
      best = d.anchorPrimitiveId;
    }
  }
  return best;
}

/** Re-exported so the hit box and the scale it derives from cannot drift apart unnoticed. */
export const STINK_TOWER_HIT_SCALE = STINK_TOWER_SPRITE_BASE_SCALE;
