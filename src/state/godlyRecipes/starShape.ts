/**
 * SPARK — S158 B2b: **THE ONE STAR TEST, AND WHY IT REPLACED THE COMPONENT TESTS.**
 *
 * ⚠ S159 P6 — THIS TITLE SAID *"FOUR"* AND IT REPLACED **THREE**. B2b's own commit message names
 * them: *"the goblin tower, the laser turret and the lightning hub"*. The **stink tower** — the
 * first tower a player builds, per `constants.ts` — was still on the component test for a further
 * session, so the bug the owner reported twice was still live in the recipe most likely to hit it.
 * It joined at S159 P6. Counting the sites you fixed is not the same as counting the sites.
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
 * ⚠ **AND ONE CONSEQUENCE THE OWNER SHOULD RULE ON — RE-MEASURED IN S159 P7, BECAUSE THE VERSION OF
 * THIS PARAGRAPH THAT ASKED FOR THE RULING DESCRIBED SOMETHING THAT CANNOT HAPPEN.**
 *
 * It said: *"a Circle that is a leaf of a lightning hub can simultaneously be the hub of a goblin
 * tower if it has three Circle neighbours of its own"*. It cannot. A goblin-tower hub requires EVERY
 * neighbour to be a Circle, and a leaf of a lightning hub is bonded to that hub — a **Dot** — so the
 * all-Circle test fails on that arm. (The degree was wrong too: the goblin hub is 4, not 3.)
 * `starOverlap.test.ts` constructs that exact lattice and asserts the refusal.
 *
 * The overlaps that ARE real come from **shared LEAVES**, and they are these, each one constructed
 * and costed in that test file:
 *
 *   · **two goblin towers chained hub-to-hub** — each hub is the other's leaf, since they share the
 *     Circle leaf type: **8 Circles for two towers** instead of 10;
 *   · **a stink tower and a lightning hub sharing Circle leaves** — one Circle can be a leaf of both,
 *     because a leaf's other bonds are unconstrained.
 *     ⛔ S160 P3 — THE MECHANISM SENTENCE AND THE PRICE DESCRIBED TWO DIFFERENT LATTICES, one shape
 *     apart. Sharing **one** Circle (what the sentence says) costs 1 Square + 1 Dot + (3+5−1) = **9**,
 *     a 10 % discount. **7 shapes** is real but needs ALL THREE stink leaves shared — the maximal
 *     lattice, a 30 % discount. Both are true of different builds; only one was true of the sentence.
 *     The honest single figure is the range already stated at the foot of this docblock.
 *     ⚠ This one is NEW as of S159 P6: the stink tower was the fourth site of the B2b bug and its
 *     component clause had been forbidding every overlap involving it;
 *   · **not the laser turret, ever** — Spiral leaves share no type with the Circle-leaved stars, so
 *     two of the four recipes cannot participate at all.
 *
 * ⭐ AND THE ARGUMENT FOR LEAVING IT ALONE, which the first version of this flag did not have: the
 * saving is PAID FOR. A shared leaf is a shared weakness — eat one Circle and BOTH towers fall.
 * Dense building buys a discount and a single point of failure at the same time, and that is a trade
 * a player can see and an opponent can aim at. It reads as the game rewarding a good build rather
 * than as an exploit.
 *
 * ⚠ S160 P3 — "IN THE SAME TICK" WAS A CLAIM ABOUT THE PREDICATES, WORDED AS A CLAIM ABOUT THE GAME.
 * `starOverlap.test.ts` deletes a shared Circle and both component predicates flip in the eating
 * tick — that part is exact. But the TEARDOWN is throttled on two UNALIGNED schedules: the spawner
 * poll compares `world.tick - sp.lastValidatedTick`, seeded to each hub's OWN ignition tick, while
 * the defender poll uses `world.tick % REVALIDATE_INTERVAL_TICKS`. Both towers do fall, within
 * **≤ 30 ticks (0.5 s)**, but on slots that coincide only by accident. The design argument survives
 * untouched; the timing sentence was the half a balance discussion would have leaned on.
 *
 * Say the word and the leaves can be required to belong to exactly one star — but the number to weigh
 * is a 20-30 % shape discount on the second tower, not "a lattice sprouting towers nobody planned".
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
