/**
 * SPARK — S166 — **THE RING TEST. THE THIRD VALIDATOR, AND WHY A RING NEEDED ONE.**
 *
 * The repo had exactly two shapes of structure test before this file, and neither fits a ring:
 *
 *   · `isPentagramComponent` (`pentagram.ts:57`) validates the whole CONNECTED COMPONENT — *"size
 *     exactly 5, every node degree exactly 2"*. That is the **S158 B2b defect**, still live here:
 *     bond one ordinary shape onto one node and the component becomes 6, the predicate returns
 *     false, and the 0.5 s re-validation poll dispatches `REMOVE_SPAWNER`. The tower is dead scenery
 *     for the rest of the match, silently, indistinguishable from one that never worked.
 *   · `isStarAt` (`starShape.ts:98`) fixed exactly that, by walking the HUB'S OWN BONDS instead of
 *     the component. **But a ring has no hub.** Every node is identical, so there is nothing to
 *     anchor a star test on and `isStarAt` cannot be reused.
 *
 * ## ⭐ OWNER RULING R136 — THE RING GETS LEAF SLACK, AND HE WAS SHOWN THE MEASUREMENT FIRST
 *
 * The tier-3 race tower is three of a race's own shape in a closed ring (R119). Written the
 * `pentagram` way — degree EXACTLY 2 at every node — **one friendly shape auto-bonding to any node
 * destroys the tower**, and that was measured true at all 3 nodes for all 6 races before the ruling
 * was asked for. On the cheapest and therefore earliest and most-built structure in the game, on a
 * board where `AUTO_BOND` fires at 60 px, that is not a rare accident.
 *
 * The owner chose the relaxed rule: *"degree >= 2 plus exactly 2 of my neighbours are my own type
 * and they are bonded to each other"*. So:
 *
 *   TOTAL degree is UNCONSTRAINED — a foreign shape may touch any node and the tower lives;
 *   SAME-TYPE degree is EXACTLY 2 at every node — which is what keeps the ring identifiable.
 *
 * ## ⛔ AND THE SAME-TYPE CLAUSE IS NOT COSMETIC — IT IS WHAT KEEPS THE RECIPES DISJOINT
 *
 * A tolerant validator that allowed a third same-type neighbour would ignite a vampire tower INSIDE
 * A PENTAGRAM. Chord a 5-ring of Triangles 1-3 and the cycle 1-2-3 is a closed 3-ring of Triangles;
 * only the "exactly 2 same-type" clause rejects it, because nodes 1 and 3 then have three Triangle
 * neighbours each.
 *
 * ⚠ SO THERE IS A RESIDUAL FRAGILITY AND IT IS DELIBERATE, NOT AN OVERSIGHT: a stray shape **of the
 * ring's own type** still un-makes the tower. A stray of any OTHER type does not. That asymmetry is
 * the price of collision-freedom, it is the rule the owner approved, and it is strictly weaker than
 * the `pentagram` rule it replaces — where a stray of *any* type was fatal.
 *
 * ## Why a walk, and not a component scan
 *
 * `componentOf` answers *"what island is this on"*, which is the question that produced the B2b bug.
 * This walks the RING ITSELF: step to a same-type neighbour, never back the way you came, and
 * require the walk to close on the anchor after exactly `n` steps having seen `n` distinct nodes.
 * A shape five hops away is then irrelevant by construction, which is the whole point.
 */

import type { SparkType } from '../../constants.ts';
import type { PrimitiveId } from '../../types.ts';
import type { World } from '../worldTypes.ts';

/**
 * PURE — every neighbour of `id` that is itself of `type`, ascending id.
 *
 * ⛔ ASCENDING, AND THAT IS NOT DECORATION. `Primitive.bonds` is a `Set` in insertion order, and the
 * project's own rule is that a `Map`/`Set` iteration order must never decide anything — S155 N1 shipped
 * a whole match of mis-targeted melee for exactly that. The walk below picks a direction from this
 * list, so an unordered list would make the ring's traversal order depend on build order, and with it
 * any future tie-break layered on top.
 */
function sameTypeNeighbours(world: World, id: PrimitiveId, type: SparkType): PrimitiveId[] {
  const p = world.primitives.get(id);
  if (p === undefined) return [];
  const out: PrimitiveId[] = [];
  for (const bondId of p.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue; // a dangling bond id — the shape is mid-teardown
    const otherId = bond.aId === id ? bond.bId : bond.aId;
    // A self-bond would pass the type test by accident. The bond factories never make one; reading
    // it as a neighbour would be silently wrong if they ever did.
    if (otherId === id) continue;
    const other = world.primitives.get(otherId);
    if (other === undefined) continue;
    if (other.type === type) out.push(otherId);
  }
  return out.sort((a, b) => a - b);
}

/**
 * PURE — the `n` members of the closed ring `anchorId` sits on, **in walk order**, or `null` if
 * there is no such ring.
 *
 * Total bond degree is deliberately NOT constrained (R136). See the file docblock for the ruling and
 * for why the same-type count must nevertheless be exact.
 *
 * ## ⭐ S167 — WHY THIS RETURNS THE MEMBERS AND `isRingAt` IS NOW ONE LINE OVER IT
 *
 * The tier-9 boss tower CONSUMES its ring when it releases its boss (`hostTick`, the t9 emit arm),
 * and the only shipped self-raze — the lightning hub's, `hostTick.ts:652` — takes
 * `componentOf(...).primitiveIds`. ⛔ **That call is wrong for a ring.** R136 permits foreign shapes
 * to auto-bond onto ring nodes, and they join the COMPONENT; razing the component would delete the
 * player's neighbouring shapes as collateral. The nine nodes the walk actually visited are the only
 * correct set, and this walk already computed them — `isRingAt` built `seen` and threw it away.
 *
 * ⚠ ONE WALK, TWO CONSUMERS, AND THAT IS THE POINT. A separate members-finder would be a second
 * implementation of the same traversal, free to drift from the predicate that decides the tower is
 * alive — so the tower could be validated against one set of nodes and raze a different one.
 *
 * ⚠ WALK ORDER, NOT ASCENDING ID. Ring order is what a renderer wants for a sequential collapse.
 * Callers that need determinism get it either way: the walk is seeded from the anchor and steps to
 * the LOWER id first (`sameTypeNeighbours` sorts), so the sequence is a pure function of the graph.
 */
export function ringMembersAt(
  world: World,
  anchorId: PrimitiveId,
  type: SparkType,
  n: number,
): PrimitiveId[] | null {
  // A ring needs at least three nodes; n < 3 would let a single bonded pair read as a "ring" whose
  // two members are each other's only neighbour, which the walk below would happily close.
  if (n < 3) return null;
  const anchor = world.primitives.get(anchorId);
  if (anchor === undefined) return null;
  if (anchor.type !== type) return null;

  const first = sameTypeNeighbours(world, anchorId, type);
  if (first.length !== 2) return null;

  const seen = new Set<PrimitiveId>([anchorId]);
  const order: PrimitiveId[] = [anchorId];
  let prev: PrimitiveId = anchorId;
  // Either direction closes the same ring, so the lower id is taken purely for determinism.
  let cur: PrimitiveId = first[0]!;

  for (let step = 1; step < n; step++) {
    const nbrs = sameTypeNeighbours(world, cur, type);
    // The exact-2 clause, re-applied at EVERY node rather than only at the anchor. Checking it once
    // would accept a ring with a same-type spur hanging off a non-anchor node, and the anchor a
    // recipe picks is an implementation detail — so the predicate would depend on which node the
    // scan happened to seed from.
    if (nbrs.length !== 2) return null;
    if (seen.has(cur)) return null; // revisited early — a figure-eight, not a ring of n
    seen.add(cur);
    order.push(cur);
    const next = nbrs[0] === prev ? nbrs[1]! : nbrs[0]!;
    prev = cur;
    cur = next;
  }

  // After n steps the walk must be standing back on the anchor, having seen n distinct nodes. Both
  // halves are load-bearing: closure alone would accept a shorter ring walked twice.
  if (cur !== anchorId || seen.size !== n) return null;
  return order;
}

/**
 * PURE — is `anchorId` a member of a closed ring of exactly `n` primitives, all of `type`, each with
 * exactly two same-type neighbours?
 *
 * ⚠ Kept as its own export rather than folded into callers: this is the shape every predicate and
 * every re-validation arm asks for, and `ringMembersAt(...) !== null` at eight call sites would be
 * eight chances to write `=== null`.
 */
export function isRingAt(
  world: World,
  anchorId: PrimitiveId,
  type: SparkType,
  n: number,
): boolean {
  return ringMembersAt(world, anchorId, type, n) !== null;
}

/**
 * PURE — every primitive that seeds a valid `n`-ring of `type`, ascending id.
 *
 * ⛔ THE CALLER MUST TAKE THE LOWEST, NOT THE FIRST IT FINDS. `igniteOneSpawnerRecipe` de-dups on
 * `(anchor, owner)` and does NOT compare recipeIds, so an anchor that shifts between frames reads as
 * a different structure and can double-ignite. Every member of a ring is a valid seed by symmetry,
 * which makes this the one recipe family where "any match will do" is actively wrong.
 */
export function findRingAnchors(world: World, type: SparkType, n: number): PrimitiveId[] {
  const ids = Array.from(world.primitives.values())
    .filter((p) => p.type === type)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  return ids.filter((id) => isRingAt(world, id, type, n));
}
