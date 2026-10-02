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
import type { BondId, PrimitiveId } from '../../types.ts';
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

/** One arm type of a star and how many of it the recipe has. */
export interface StarArmSpec {
  readonly leafType: SparkType;
  readonly count: number;
}

/** The arms a LIVE star stands on — its hub's OWN connectors, never anything welded on. */
export interface StarArms {
  /** The leaves those arms reach, in the same order as `bonds`. */
  readonly leaves: readonly PrimitiveId[];
  /** The hub's own arm bonds, ascending bond id. */
  readonly bonds: readonly BondId[];
  /** `true` iff every arm type reached its full count — the star STANDS. */
  readonly whole: boolean;
}

/**
 * ⭐⭐ S189 C2 — PURE — **THE ARMS A LIVE STAR WAS BUILT WITH, WHATEVER ELSE IS WELDED TO ITS HUB.**
 *
 * Owner, S189: *"If you connect shapes … to existing towers, like to a laser tower, my brother
 * connected like two triangles … it got his tower disappeared … as long as the existing tower, the
 * shape is there … you can connect to it."* And R185-B: *"once the enemy does manage to destroy it,
 * it destroys the connectors that he's attacking."*
 *
 * `isStarAt` above answers IGNITION and is deliberately exact. As the SURVIVAL test it was the
 * defect: a triangle dropped on a laser turret's art bonds to the HUB, the hub reads degree 8, and
 * the turret vanished within half a second. Survival asks this instead: **are the connectors this
 * star was BUILT with still there?**
 *
 * ⛔⛔ AUDIT W1 — "BUILT WITH", NOT "LOWEST ID AT THE TIME OF ASKING". The first version took the
 * lowest-id arms of each type, which is the original arm only while every original is intact: once
 * one is cut, the lowest remaining same-type bond can be a WELD, which then "stood in" and kept the
 * tower alive. Nobody ruled that — the brief and R185-B say a cut own connector levels it. So:
 *
 *   `own` (the tower's `ownPrimitiveIds`, recorded at registration — ignition is exact, so the hub's
 *   neighbours then WERE its leaves) marks the shapes it was built with: an arm is a hub bond to one
 *   of THOSE leaves, whatever the bond's id. A weld is never an own shape and is never counted, of
 *   ANY type — and a connector FIX re-welds to an own leaf (a NEW bond id) counts again, which a
 *   bond-id watermark could not do (S191, audit W-FR4). The star stands iff all `count` arms of every
 *   type are still there.
 *
 *   `own === null` (a pre-S189 save, a hand-built fixture, a structure that is not a live tower): the
 *   exact pre-S189 reading — every hub bond is an arm of the right type and the degree is exact.
 *
 * ⛔ **TOTAL ORDER, NEVER `Set` ORDER.** Candidates are sorted by bond id before any is taken.
 * ⚠ DISTINCT LEAVES: an arm is counted once per leaf.
 *
 * Returns `null` when the anchor is gone or is not `hubType`. A star missing arms returns what is
 * LEFT with `whole: false`, because the renderer still draws it crumbling during the ≤ 30 ticks
 * before the poll removes it.
 */
export function starArmsAt(
  world: World,
  anchorId: PrimitiveId,
  hubType: SparkType,
  arms: readonly StarArmSpec[],
  own: ReadonlySet<PrimitiveId> | null = null,
): StarArms | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  if (hub.type !== hubType) return null;
  const want = new Map<SparkType, number>();
  let total = 0;
  for (const a of arms) {
    want.set(a.leafType, (want.get(a.leafType) ?? 0) + a.count);
    total += a.count;
  }

  let liveHubBonds = 0;
  const candidates: { bondId: BondId; leafId: PrimitiveId; type: SparkType }[] = [];
  for (const bondId of hub.bonds) {
    const bond = world.bonds.get(bondId);
    if (bond === undefined) continue; // a dangling bond id — the shape is mid-teardown
    liveHubBonds++;
    const otherId = bond.aId === anchorId ? bond.bId : bond.aId;
    // A shape the tower was not built with is a weld — never an arm, whatever its type.
    if (own !== null && !own.has(otherId)) continue;
    if (otherId === anchorId) continue; // a self-bond is never an arm (see `isStarAt`)
    const leaf = world.primitives.get(otherId);
    if (leaf === undefined) continue;
    if (!want.has(leaf.type)) continue;
    candidates.push({ bondId, leafId: otherId, type: leaf.type });
  }
  candidates.sort((x, y) => Number(x.bondId) - Number(y.bondId));

  const taken = new Map<SparkType, number>();
  const seenLeaves = new Set<PrimitiveId>();
  const leaves: PrimitiveId[] = [];
  const bonds: BondId[] = [];
  for (const c of candidates) {
    const have = taken.get(c.type) ?? 0;
    if (have >= (want.get(c.type) ?? 0)) continue;
    if (seenLeaves.has(c.leafId)) continue;
    seenLeaves.add(c.leafId);
    taken.set(c.type, have + 1);
    leaves.push(c.leafId);
    bonds.push(c.bondId);
  }
  let whole = true;
  for (const [type, count] of want) if ((taken.get(type) ?? 0) < count) whole = false;
  // Unknown build (no own set): the exact reading — nothing else may be bonded to the hub.
  if (own === null && liveHubBonds !== total) whole = false;
  return { leaves, bonds, whole };
}
