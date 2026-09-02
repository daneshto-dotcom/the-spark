/**
 * SPARK — S158 B2b: **THE ONE STAR TEST, AND WHY IT REPLACED FOUR COMPONENT TESTS.**
 *
 * ## The bug, measured
 *
 * Owner, twice: *"the lighning drone tower is not producing or spawning suicide drones"*, and then,
 * when I reported that it produces: *"drone tower was NOT producing. maybe he was on the chewers
 * clock but no drones were actually being produced."* They were right and my fixture was wrong.
 *
 * Every tower recipe used to validate its whole CONNECTED COMPONENT:
 *
 *   hub is the right type · hub has exactly N bonds · **the component is exactly N+1 primitives** ·
 *   every non-hub member is the right leaf type
 *
 * The third clause is the defect. MEASURED: build a lightning hub, then bond **one** ordinary shape
 * onto **one of its leaves** — the component becomes 7, `isLightningHubComponent` returns false, and
 * the re-validation poll (every 0.5 s) dispatches `REMOVE_SPAWNER`. The tower is dead scenery for the
 * rest of the match, silently, with no feedback and no way to tell it from a tower that never worked.
 *
 * In an empty test world a hub emits drones perfectly — which is exactly what my first two probes
 * showed, and exactly why they proved nothing about a real board. **On a real board you build things
 * next to each other**, and one shape touching one leaf was enough.
 *
 * ## What the test is now
 *
 * The STAR AT THE ANCHOR, not the island it sits on:
 *
 *   hub is the right type · hub has exactly N bonds · **all N of its neighbours are the leaf type**
 *
 * A tower now dies when its OWN star is broken — a leaf eaten, a bond cut — which is the counterplay
 * the design always wanted. It no longer dies because a friendly shape touched it.
 *
 * ⚠ **THE HUB DEGREE STAYS EXACT, DELIBERATELY.** Loosening it to `>=` would collide the recipes with
 * each other: the laser turret is a degree-6 hub and the lightning hub degree-5, and identity here is
 * `(hub type, degree)`. A sixth shape bonded to the HUB itself does change the shape you built, so it
 * still un-makes the tower. Only the LEAVES are now allowed to have a life of their own.
 *
 * ⚠ **AND ONE CONSEQUENCE THE OWNER SHOULD RULE ON, FLAGGED RATHER THAN ABSORBED.** Dropping the
 * component-size clause means recipes may now OVERLAP: a Circle that is a leaf of a lightning hub can
 * simultaneously be the hub of a goblin tower if it has three Circle neighbours of its own. Before,
 * the size gate made that impossible. It reads as a reward for dense building — *"build the shape,
 * get the tower"* taken literally — but it also means a big lattice can sprout towers nobody planned.
 * Say the word and the leaves can be required to belong to exactly one star.
 */

import type { SparkType } from '../../constants.ts';
import type { PrimitiveId } from '../../types.ts';
import type { World } from '../worldTypes.ts';

/**
 * PURE — is `anchorId` the hub of a `degree`-armed star whose every arm is `leafType`?
 *
 * Walks the hub's own bonds rather than the component, so the answer depends only on the shape the
 * player built and not on whatever else happens to be attached to its arms.
 */
export function isStarAt(
  world: World,
  anchorId: PrimitiveId,
  hubType: SparkType,
  leafType: SparkType,
  degree: number,
): boolean {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return false;
  if (hub.type !== hubType) return false;
  if (hub.bonds.size !== degree) return false;
  for (const bondId of hub.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) return false; // a dangling bond id — the shape is mid-teardown
    const otherId = bond.aId === anchorId ? bond.bId : bond.aId;
    // A self-bond would make `otherId === anchorId` and pass the type test by accident; the bond
    // factories never produce one, and reading it as a leaf would be silently wrong if they ever did.
    if (otherId === anchorId) return false;
    const leaf = world.primitives.get(otherId);
    if (leaf === undefined) return false;
    if (leaf.type !== leafType) return false;
  }
  return true;
}
