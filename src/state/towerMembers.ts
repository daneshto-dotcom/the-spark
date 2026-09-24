/**
 * SPARK — S189 C2 — **WHAT A LIVE TOWER STANDS ON. ONE ANSWER, FOR THE SIM AND FOR THE SCREEN.**
 *
 * Owner, S189 playtest: *"If you connect shapes … to existing towers, like to a laser tower, my
 * brother connected like two triangles … it got his tower disappeared … that's like a regression …
 * we changed it that you can connect towers together … to get them have more HP … as long as the
 * existing tower, the shape is there … it still has a pentagram, but you can connect to it."*
 *
 * ## The defect, measured (`weldOntoTowerS189.test.ts`)
 *
 * Every tower predicate did TWO jobs — IGNITION (is a new tower here?) and SURVIVAL (does the live
 * tower still stand?) — and both used EQUALS-the-blueprint semantics:
 *
 *   · the four `isStarAt` stars (laser turret, lightning hub, goblin tower, stink tower) demand the
 *     hub's degree be EXACT, so a shape welded onto the HUB un-makes the tower. A drop on a tower's
 *     art bonds to the hub, because the hub is the nearest shape and the K=3 redundancy pass adds
 *     more of the star — which is precisely what the owner's brother did.
 *   · the pentagram and HELGA's hall demand the whole CONNECTED COMPONENT equal the blueprint, so
 *     ANY weld anywhere un-makes them (the S158 B2b defect, never fixed for those two).
 *
 * ## ⭐ The fix is HYSTERESIS: exact to BUILD, contains to SURVIVE
 *
 * ⛔ **IGNITION IS UNTOUCHED, AND MUST STAY EXACT.** Its exactness is what keeps the recipes
 * disjoint: a "contains" ignition would make every Circle in a dense Circle lattice with four
 * Circle neighbours a goblin tower — a lattice sprouting towers nobody built. So the recipe modules'
 * `is…Component` predicates still decide where a tower is BORN.
 *
 * This module decides whether a tower that already exists still STANDS: **its own recipe members and
 * connectors are intact, whatever else is welded on.** And the SAME walk tells the renderer which
 * shapes the building covers (R185-A — a welded shape is not a member, so it draws at full opacity)
 * and tells the lightning hub's fuse which arms are its own star (R182-B). One walk, three consumers,
 * so the tower cannot be judged alive on one set of shapes and drawn or detonated on another.
 *
 * ⚠ THE SHAPE IS DERIVED FROM THE BLUEPRINT, NOT COPIED. `blueprints.ts` is the side-effect-free
 * table every recipe's geometry already lives in, and `blueprints.test.ts` stamps each blueprint
 * against the live ignition predicate — so a retune moves the survival shape with it.
 *
 * ⚠ SIDE-EFFECT-FREE, and it must stay so: `spawnerLifecycle.ts` and `goblinKinds.ts` import it, and
 * `world.ts` reaches both. Importing a recipe module here would fire `registerRecipe` for the whole
 * codebase — the S144 trap `blueprints.ts` documents at length.
 *
 * ## ⭐ S189 C2 item 2 — THE RACE RINGS TOO
 *
 * The twelve tier-3 / tier-9 RACE rings were first left on R136 (`isRingAt`) for survival, where a
 * stray of the ring's OWN type un-made them. The merge owner put them in scope because that is the
 * owner's own bat-tower case. R136's collision-freedom was always an IGNITION property, and ignition
 * still uses `isRingAt`; survival now uses the ring's own cycle (`ringCycleAt`), and so do the three
 * race-tower renderers, so the building, its centroid and its "does it stand" agree.
 *
 * The only recipe this module does not govern is the Voltkin — a cinematic, not a standing tower.
 */
import type { SparkType } from '../constants.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import type { World } from './worldTypes.ts';
import { blueprintFor } from './blueprints.ts';
import { componentOf } from '../game/structure.ts';
import { starArmsAt, type StarArmSpec } from './godlyRecipes/starShape.ts';
import { ringCycleAt, ringRemainsAt } from './godlyRecipes/ringShape.ts';

/** The shape a live tower must still CONTAIN to stand. */
export type TowerShape =
  | { readonly kind: 'star'; readonly hub: SparkType; readonly arms: readonly StarArmSpec[] }
  | { readonly kind: 'ring'; readonly type: SparkType; readonly n: number };

/** What a live tower stands on: its OWN shapes and connectors, never a weld. */
export interface TowerMembers {
  readonly prims: readonly PrimitiveId[];
  readonly bonds: readonly BondId[];
  /** `true` iff the recipe is still wholly contained — the tower STANDS. */
  readonly whole: boolean;
}

/**
 * PURE — a star blueprint read back as a hub type and arm counts.
 *
 * ⚠ ASSERTS THE STAR LAYOUT rather than trusting it: node 0 is the hub and every bond is `[0, i]`.
 * A future blueprint re-drawn as anything else would otherwise be read as a star silently; this
 * throws at module use instead, and `towerMembers.test.ts` drives it for every star recipe.
 */
function starShapeFromBlueprint(id: GodlyId): TowerShape {
  const bp = blueprintFor(id);
  const hub = bp.nodes[0];
  if (hub === undefined) throw new Error(`towerMembers: blueprint ${id} has no hub`);
  for (const [a, b] of bp.bonds) {
    if (a !== 0 || b === 0) throw new Error(`towerMembers: blueprint ${id} is not a star`);
  }
  if (bp.bonds.length !== bp.nodes.length - 1) {
    throw new Error(`towerMembers: blueprint ${id} is not a star`);
  }
  const counts = new Map<SparkType, number>();
  for (let i = 1; i < bp.nodes.length; i++) {
    const t = bp.nodes[i]!.type;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Ascending SparkType, so the spec is a pure function of the blueprint, not of node order.
  const arms = [...counts.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([leafType, count]) => ({ leafType, count }));
  return { kind: 'star', hub: hub.type, arms };
}

/** PURE — a ring blueprint read back as its node type and size. Same assertion discipline. */
function ringShapeFromBlueprint(id: GodlyId): TowerShape {
  const bp = blueprintFor(id);
  const first = bp.nodes[0];
  if (first === undefined) throw new Error(`towerMembers: blueprint ${id} has no nodes`);
  for (const node of bp.nodes) {
    if (node.type !== first.type) throw new Error(`towerMembers: blueprint ${id} is not a one-type ring`);
  }
  if (bp.bonds.length !== bp.nodes.length) throw new Error(`towerMembers: blueprint ${id} is not a ring`);
  return { kind: 'ring', type: first.type, n: bp.nodes.length };
}

const SHAPE_CACHE = new Map<GodlyId, TowerShape | null>();

/**
 * PURE — the survival shape for `recipeId`, or `null` for a recipe this module does not govern.
 *
 * ⛔ EXHAUSTIVE OVER `GodlyId`, NOT A TOLERANT `default:`. A tolerant default is where a new recipe
 * hides: it would silently get no survival rule here while its revalidation arm assumed one. The
 * `never` at the foot makes `tsc` refuse a new id until someone decides which side of this line it
 * is on.
 */
export function towerShapeFor(recipeId: GodlyId): TowerShape | null {
  const hit = SHAPE_CACHE.get(recipeId);
  if (hit !== undefined) return hit;
  let shape: TowerShape | null;
  switch (recipeId) {
    case 'laserTurret':
    case 'lightningHub':
    case 'goblinTower':
    case 'stinkTower':
    case 'helga':
      shape = starShapeFromBlueprint(recipeId);
      break;
    case 'pentagram':
    /*
     * ⭐⭐ S189 C2 item 2 — THE TWELVE RACE RINGS ARE ON THE SAME RULE NOW. R136's exact same-type-2
     * clause still decides IGNITION (`findRingAnchors` → `isRingAt`), which is what it exists for —
     * keeping a chorded pentagram from igniting a tier-3 ring inside itself. As a SURVIVAL test it
     * dissolved a live bat tower the moment a Triangle was welded on, which is the owner's own
     * R185-B example: *"a bat tower … welding it through many connectors to another bat tower"*.
     */
    case 't3TowerVampires':
    case 't3TowerNagas':
    case 't3TowerMummies':
    case 't3TowerZombies':
    case 't3TowerOrcs':
    case 't3TowerDemons':
    case 't9TowerVampires':
    case 't9TowerNagas':
    case 't9TowerMummies':
    case 't9TowerZombies':
    case 't9TowerOrcs':
    case 't9TowerDemons':
      shape = ringShapeFromBlueprint(recipeId);
      break;
    // A cinematic, not a standing tower — its chain is consumed by the cinematic.
    case 'voltkin':
      shape = null;
      break;
    default: {
      const unhandled: never = recipeId;
      throw new Error(`towerShapeFor: unclassified recipe ${String(unhandled)}`);
    }
  }
  SHAPE_CACHE.set(recipeId, shape);
  return shape;
}

/**
 * PURE — the shapes and connectors the live tower `recipeId` at `anchorId` stands on, or `null` when
 * the anchor is gone, is the wrong type, or the recipe has no survival shape here.
 *
 * A tower that has lost part of its own recipe returns what is LEFT with `whole: false` — never
 * `null` — because the renderer still draws it crumbling during the ≤ 30 ticks before the
 * revalidation poll removes it, and that crumble needs a centroid and a connector count below the
 * recipe's own (the S183 crumble rule: `rampHealthFrac` reads 0 below `spec.connectors`).
 */
export function towerMembersAt(world: World, recipeId: GodlyId, anchorId: PrimitiveId): TowerMembers | null {
  const shape = towerShapeFor(recipeId);
  if (shape === null) return null;
  if (shape.kind === 'star') {
    const arms = starArmsAt(world, anchorId, shape.hub, shape.arms);
    if (arms === null) return null;
    return { prims: [anchorId, ...arms.leaves], bonds: arms.bonds, whole: arms.whole };
  }
  const cycle = ringCycleAt(world, anchorId, shape.type, shape.n);
  if (cycle !== null) {
    return { prims: cycle, bonds: cycleBonds(world, cycle), whole: true };
  }
  const remains = ringRemainsAt(world, anchorId, shape.type, shape.n);
  if (remains === null) return null;
  const inside = bondsWhollyInside(world, remains);
  // ⚠ Fewer than `n` by construction, so a broken ring can never read as whole on the ramp — the
  // wreck's shapes may carry more same-type bonds than the ring had (a weld of the ring's own type).
  return { prims: remains, bonds: inside.slice(0, shape.n - 1), whole: false };
}

/**
 * S189 C2 (audit W2-1 / W5) — PURE — the shapes and connectors a tower's GROUND ZONE and AURA are
 * drawn over: its OWN members when it has a survival shape, otherwise (a recipe this module does not
 * govern) its connected component, which is what those renderers walked before. `null` when the
 * anchor is gone.
 *
 * ⛔ WHY IT EXISTS. `spawnerZoneRenderer` drew a charged "cut here" stroke over every bond of the
 * anchor's COMPONENT, skipping the covered ones — so on a welded tower the only strokes left were
 * over the WELDS, the connectors whose cut kills nothing, and two welded towers drew them twice.
 * `groundDecalRenderer` centred a non-race tower's ground zone on the whole welded lattice. One
 * walk — the one the sim uses to decide the tower stands — for both.
 */
export function towerFootprintAt(
  world: World,
  recipeId: GodlyId,
  anchorId: PrimitiveId,
): { readonly prims: readonly PrimitiveId[]; readonly bonds: readonly BondId[] } | null {
  const own = towerMembersAt(world, recipeId, anchorId);
  if (own !== null) return own;
  const anchor = world.primitives.get(anchorId);
  if (anchor === undefined) return null;
  const comp = componentOf(anchor, world.primitives, world.bonds);
  return { prims: [...comp.primitiveIds], bonds: [...comp.bondIds] };
}

/** PURE — does the live tower `recipeId` at `anchorId` still stand? */
export function towerStandsAt(world: World, recipeId: GodlyId, anchorId: PrimitiveId): boolean {
  return towerMembersAt(world, recipeId, anchorId)?.whole === true;
}

/**
 * PURE — the recipe of the live tower (spawner or defender) anchored at `anchorId`, or `null`.
 *
 * ⚠ TOTAL ORDER: lowest spawner id, then lowest defender id. Both maps de-dup on anchor, so a clash
 * would need a spawner and a defender on one primitive, which no pair of recipes can produce (their
 * hub types differ and ignition is exact) — but `Map` order must never decide it if it ever did.
 */
export function liveTowerRecipeAt(world: World, anchorId: PrimitiveId): GodlyId | null {
  let best: { id: number; recipeId: GodlyId } | null = null;
  for (const sp of world.creatureSpawners.values()) {
    if (sp.anchorPrimitiveId !== anchorId) continue;
    const id = Number(sp.id);
    if (best === null || id < best.id) best = { id, recipeId: sp.recipeId };
  }
  if (best !== null) return best.recipeId;
  for (const d of world.defenders.values()) {
    if (d.anchorPrimitiveId !== anchorId) continue;
    const id = Number(d.id);
    if (best === null || id < best.id) best = { id, recipeId: d.recipeId };
  }
  return best?.recipeId ?? null;
}

/** The bond joining each consecutive pair of a closed cycle, in cycle order. */
function cycleBonds(world: World, cycle: readonly PrimitiveId[]): BondId[] {
  const out: BondId[] = [];
  for (let i = 0; i < cycle.length; i++) {
    const a = cycle[i]!;
    const b = cycle[(i + 1) % cycle.length]!;
    const bid = lowestBondBetween(world, a, b);
    if (bid !== null) out.push(bid);
  }
  return out;
}

/** The lowest-id bond between `a` and `b`, or `null`. */
function lowestBondBetween(world: World, a: PrimitiveId, b: PrimitiveId): BondId | null {
  const pa = world.primitives.get(a);
  if (pa === undefined) return null;
  let best: BondId | null = null;
  for (const bid of pa.bonds) {
    const bond = world.bonds.get(bid);
    if (bond === undefined) continue;
    const other = bond.aId === a ? bond.bId : bond.aId;
    if (other !== b) continue;
    if (best === null || Number(bid) < Number(best)) best = bid;
  }
  return best;
}

/** Every bond with BOTH ends in `ids`, ascending bond id. */
function bondsWhollyInside(world: World, ids: readonly PrimitiveId[]): BondId[] {
  const set = new Set(ids);
  const out = new Set<BondId>();
  for (const id of ids) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    for (const bid of p.bonds) {
      const bond = world.bonds.get(bid);
      if (bond === undefined) continue;
      if (set.has(bond.aId) && set.has(bond.bId)) out.add(bid);
    }
  }
  return [...out].sort((x, y) => Number(x) - Number(y));
}

