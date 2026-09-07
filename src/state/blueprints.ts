/**
 * SPARK — S144 P1: BLUEPRINTS — the declarative geometry behind click-to-build.
 *
 * ## WHY THIS EXISTS (owner playtest ruling, 2026-08-13)
 *
 *   *"the gatherers gather ur items and you have a place to click on the tower (you dont even need to
 *    build it physically) and it builds it for you. then the spark (your cruiser) just drags it to
 *    where you want it to be!"* — *"like a classical TD (more or less)"*
 *
 * So a tower must be obtainable by CLICKING it in the castle panel, not by hand-assembling its shape.
 *
 * ## ⚠ WHY THIS STAMPS REAL GEOMETRY INSTEAD OF MINTING A TOWER RECORD
 *
 * The obvious implementation — "register a defender at the drop point" — **self-destructs within half
 * a second**, and that is not a tuning problem, it is the defender lifecycle working as designed.
 * Every live defender is re-validated every `REVALIDATE_INTERVAL_TICKS` (30 ticks = 0.5 s) against its
 * recipe's `stillValid`; a defender whose recipe geometry does not hold is REMOVED. A tower with no
 * primitives under it fails that check on the very first poll.
 *
 * Therefore a blueprint lays down the RECIPE'S ACTUAL PRIMITIVES AND BONDS, and the existing
 * structural matcher ignites the tower exactly as if the player had built it by hand. The player never
 * sees this — they click, it appears, they drag it. But it is what makes the tower PERSIST, and it is
 * why this feature needs zero per-kind special-casing: defender, spawner and cinematic recipes all
 * ignite through the one mechanism they already use.
 *
 * ## THE BILLS MUST NEVER DRIFT FROM THE PREDICATES
 *
 * A blueprint whose bill disagrees with its recipe fails SILENTLY — the shapes land, look right, and
 * simply never ignite. Counts that live in `constants.ts` are imported directly; the four that live
 * inside recipe modules are MIRRORED here instead, for the import-side-effect reason documented
 * below. Both kinds are protected the same way: `blueprints.test.ts` cross-checks every mirrored
 * number against the recipe module's real export, and additionally stamps each blueprint through the
 * live reducer and matcher to prove it actually ignites and survives re-validation. That is the S140
 * anti-drift lesson honoured by TEST rather than by import.
 *
 * ## SPACING — why these radii and not tighter ones
 *
 * A bond is minted at `restLength = the actual stamped distance`, and every node is stamped at rest
 * (`prevPos === pos`), so a fresh blueprint carries ZERO strain. That matters because a bond breaks at
 * `STRAIN_BREAK_BY_TIER` (1.25× for HIGH) and a broken bond drops the component's degree → the recipe
 * stops holding → the tower is torn down. Primitive radii are all 8–10.8 px
 * (`max(8, SPARK_VISUAL_SIZE * 0.45)`), so a sum-of-radii of ~22 px is the floor below which
 * soft-collision would shove neighbours apart and strain the bonds. Every distance here is ≥ 40 px,
 * comfortably clear of that, and ≤ `AUTO_BOND_RADIUS` (60) so a stamped structure is spaced like a
 * hand-built one rather than reading as an oddly inflated diagram.
 *
 * ⚠ Non-adjacent node distances are deliberately NOT constrained. Bonds here are written EXPLICITLY
 * and the stamp bypasses auto-bond entirely, so nothing infers adjacency from proximity — unlike
 * hand placement, where `computePreviewBonds` would add redundancy and cross-component merge bonds
 * that break pentagram's exact-degree ring and voltkin's chain-isolation check.
 *
 * Pixi-free, DOM-free, World-free — and, critically, **SIDE-EFFECT-FREE**: the ghost renderer (P3)
 * and the reducer (P1) share this one source of truth so the preview cannot disagree with what the
 * release commits, and importing it changes no global state.
 *
 * ## ⚠ WHY THIS FILE DOES NOT IMPORT THE RECIPE MODULES (learned the hard way, S144 P1)
 *
 * The obvious way to keep these counts honest is to import each recipe's own exported constant
 * (`TURRET_SIZE`, `HELGA_SIZE`, `VOLTKIN_SIZE`, …). **Do not.** Every recipe module calls
 * `registerRecipe` at its tail, so a value import fires that registration — and because
 * `world.ts` imports the blueprint reducer, which imports this file, the registry would end up
 * populated for EVERY module in the codebase that touches `world.ts`. That is essentially all of it.
 *
 * The measured consequence: it silently rewired `recipeStillSatisfied`, whose documented fallback is
 * "no recipe registered → just check the anchor exists". With `laserTurret` globally registered that
 * branch became unreachable and `defenderLifecycle.test.ts` failed — a shipped test, broken by an
 * import in a geometry module. The first version of this file claimed the blast radius was "anything
 * that can stamp a blueprint"; it was the whole repo.
 *
 * So the counts below are declared LOCALLY, and `blueprints.test.ts` cross-checks every one of them
 * against the recipe modules' real exports (side effects confined to that one test file) *and*
 * stamps each blueprint against the live predicate. Two independent guards, zero global state. That
 * satisfies the S140 anti-drift lesson — which is about copy drifting UNNOTICED, not about copies
 * existing — without letting a constant import reach across the codebase.
 *
 * Anything that actually needs recipes REGISTERED must import them itself, exactly as `main.ts` does.
 */

import {
  SparkType,
  LIGHTNING_HUB_COMPONENT_SIZE,
  LIGHTNING_HUB_DEGREE,
  STINK_TOWER_HUB_DEGREE,
  STINK_TOWER_SIZE,
  GOBLIN_TOWER_HUB_DEGREE,
  GOBLIN_TOWER_SIZE,
} from '../constants.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
/*
 * ⛔ BOTH OF THESE ARE SIDE-EFFECT-FREE LEAVES, WHICH IS THE ONLY REASON THEY MAY BE IMPORTED HERE.
 * See the "WHY THIS FILE DOES NOT IMPORT THE RECIPE MODULES" note above: `godlyRecipes/raceTower.ts`
 * calls `registerRecipe` at its tail, so importing the ids FROM THERE would fire six registrations
 * as a side effect of loading this module. `raceTowerIds.ts` exists to be importable.
 */
import { RACE_FEED_SHAPE, type RaceId } from './races.ts';
import { RACE_TOWER_IDS, RACE_TOWER_LABELS, RACE_TOWER_SIZE } from './raceTowerIds.ts';
// S167 — the tier-9 leaf, side-effect-free by the same contract as the line above.
import { T9_TOWER_IDS, T9_TOWER_SIZE, t9TowerLabel } from './t9BossIds.ts';
import type { Vec2 } from '../types.ts';

/* ── Recipe shape counts, MIRRORED not imported (see the docblock) ──────────────────────────────── *
 * `blueprints.test.ts` asserts each of these equals the recipe module's own exported constant, so a
 * retune that forgets this file fails the suite instead of shipping a tower that never ignites.
 * STINK_* and LIGHTNING_* are absent here because they already live in `constants.ts`, which has no
 * registration side effect and is therefore safe to import directly.                              */

/** Mirrors `laserTurret.ts` TURRET_HUB_DEGREE — the Line hub's exact bond degree (= leaf count). */
const TURRET_LEAVES = 6;
/** Mirrors `princessHelga.ts` HELGA_SIZE: 1 Triangle hub + this many Spiral/Circle leaf PAIRS. */
const HELGA_LEAF_PAIRS = 3;
/** Mirrors `voltkin.ts` VOLTKIN_SIZE: this many Squares followed by this many Triangles. */
const VOLTKIN_HALF = 4;
/** Mirrors `pentagram.ts` PENTAGRAM_SIZE — a closed ring of this many Triangles, each degree 2. */
const PENTAGRAM_RING = 5;

/** One stamped node: a primitive type at an offset from the blueprint's centre. */
export interface BlueprintNode {
  readonly type: SparkType;
  /** Offset from the stamp centre, in world px. */
  readonly dx: number;
  readonly dy: number;
}

/**
 * A buildable structure: an index-addressable node list plus the EXACT bond list to mint between
 * them. `bonds` holds index pairs into `nodes`, so the topology is data rather than derived — which
 * is the whole point (see the spacing note in the file docblock).
 */
export interface Blueprint {
  readonly id: GodlyId;
  /** Player-facing name for the panel row. */
  readonly label: string;
  readonly nodes: readonly BlueprintNode[];
  readonly bonds: readonly (readonly [number, number])[];
}

/** Hub→leaf distance for the four STAR recipes. */
const STAR_R = 44;
/** Circumradius for the pentagram ring (side = 2·R·sin36° ≈ 47 px). */
const RING_R = 40;
/**
 * ⛔ CIRCUMRADIUS FOR A **THREE**-NODE RING, AND IT IS NOT `RING_R`. S166, measured.
 *
 * A ring's side is `2 · R · sin(π/n)`, so one radius gives different SIDES at different n. At n=5
 * `RING_R = 40` yields ~47 px, comfortably inside this file's stated spacing invariant
 * (*"≤ `AUTO_BOND_RADIUS` (60) so a stamped structure is spaced like a hand-built one"*). **At n=3
 * the same radius yields 40·√3 ≈ 69.3 px, which BREAKS it** — the tower would stamp fine and be
 * UN-BUILDABLE BY HAND, because auto-bond never fires between nodes more than 60 px apart.
 *
 * Solving `2 · R · sin(60°) ≤ 60` gives `R ≤ 34.64`; the floor from the same docblock (side ≥ ~40 px,
 * clear of the ~22 px sum-of-radii where soft-collision would strain the bonds) gives `R ≥ 23.1`.
 * **R = 34 → side 58.9 px**, just inside the ceiling and generous over the floor.
 *
 * ⚠ THIS IS THE CHEAPEST STRUCTURE IN THE GAME AND SO THE MOST HAND-BUILT ONE, which makes the
 * hand-buildability half of that invariant matter more here than anywhere else it applies.
 */
const TRI_RING_R = 34;
/**
 * ⛔ CIRCUMRADIUS FOR THE **NINE**-NODE TIER-9 RING, AND IT IS A THIRD VALUE FOR A THIRD `n`. S167,
 * measured — the S166 B12 defect is one radius reused at a different `n`, and this is the third `n`.
 *
 * `side = 2 · R · sin(π/9) = 0.684 · R`. Reusing `TRI_RING_R` (34) would give **23.3 px** and
 * `RING_R` (40) **27.4 px**, both under the ~40 px floor and both close enough to the ~22 px
 * sum-of-radii to strain soft-collision. Solving the same two bounds this file states everywhere:
 *   · ceiling `side ≤ AUTO_BOND_RADIUS (60)` → `R ≤ 87.7`
 *   · floor `side ≥ 40` → `R ≥ 58.5`
 * **R = 64 → side 43.8 px**, comfortably inside both.
 *
 * ## ⭐ AND A HAZARD THAT DOES NOT EXIST AT n=3 OR n=5: THE SELF-WELDING CHORD
 *
 * At nine nodes the ring is wide enough that NON-ADJACENT nodes could fall within `AUTO_BOND_RADIUS`
 * of each other. If they did, a chord would weld itself the instant the ring closed, giving two
 * nodes a THIRD same-type neighbour — and `isRingAt`'s exact-2 clause would reject the ring
 * permanently. The tower would stamp perfectly and be dead on arrival, every time, for every race.
 *
 * The closest non-adjacent pair is the skip-one pair at `2 · R · sin(2π/9) = 1.286 · R`, so the
 * chord is safe iff `1.286 · R > 60`, i.e. `R > 46.7`. **The existing floor already guarantees it**:
 * `R ≥ 58.5` forces the skip-one distance to ≥ 75.2 px. At `R = 64` it is 82.3 px.
 *
 * ⚠ THIS IS PROVED BY THE RATIO, NOT BY THE CHOSEN NUMBER, which is what makes it durable: the
 * skip-one distance is always `1.879 ×` the side, so ANY nine-ring whose side clears 31.9 px is
 * chord-free. Every side this file would ever accept (≥ 40) clears it. `t9BossTower.test.ts` asserts
 * the chord clearance directly rather than trusting this paragraph — `raceTower.test.ts`'s own
 * geometry check iterates `bp.bonds` and is therefore structurally blind to a NON-bonded pair.
 */
const NINE_RING_R = 64;

/** Node-to-node spacing along the voltkin chain. */
const CHAIN_STEP = 40;

/**
 * PURE — a hub-and-leaves star: the hub at the centre, `leafTypes.length` leaves evenly spaced on a
 * circle of radius `STAR_R`, every leaf bonded to the hub and to nothing else.
 *
 * ⚠ Leaf↔leaf bonds are deliberately ABSENT even though all four star predicates tolerate them.
 * Tolerating them is not the same as needing them: the minimum bond set that satisfies a predicate is
 * also the set with the fewest ways to break, and `laserTurret.ts` documents that requiring leaf
 * degree-1 caused "a frequent silent no-build" — the predicates loosened, so the *builder* should
 * stay minimal. The stamped hub degree is exactly `leafTypes.length`, which is what every star gate
 * actually tests.
 *
 * The first leaf sits at -90° (straight up) so a stamped tower reads as deliberately oriented rather
 * than arbitrarily rotated.
 */
function star(
  id: GodlyId,
  label: string,
  hubType: SparkType,
  leafTypes: readonly SparkType[],
): Blueprint {
  const n = leafTypes.length;
  const nodes: BlueprintNode[] = [{ type: hubType, dx: 0, dy: 0 }];
  const bonds: Array<readonly [number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    nodes.push({
      type: leafTypes[i],
      dx: Math.cos(a) * STAR_R,
      dy: Math.sin(a) * STAR_R,
    });
    bonds.push([0, i + 1]);
  }
  return { id, label, nodes, bonds };
}

/** PURE — repeat a type `n` times, so a bill reads as its recipe constant rather than a literal run. */
function times(type: SparkType, n: number): SparkType[] {
  return Array.from({ length: n }, () => type);
}

/**
 * ⚠ EVERY COUNT BELOW IS DERIVED. `STINK_TOWER_HUB_DEGREE` leaves for the stink tower,
 * `TURRET_HUB_DEGREE` for the turret, `LIGHTNING_HUB_DEGREE` for the hub, `HELGA_SIZE - 1` split in
 * half for HELGA, `VOLTKIN_SIZE / 2` per half-chain. A retune of any recipe constant moves its
 * blueprint with it; `blueprints.test.ts` pins the relationship AND stamps each one against the live
 * predicate, because a desync here produces shapes that land and never ignite — with no error.
 */
const BLUEPRINTS: Readonly<Record<GodlyId, Blueprint>> = {
  // 1 Square hub (deg 3) + 3 Circle leaves. Every Square↔Circle bond is the 'Capsule' combo.
  stinkTower: star(
    'stinkTower',
    'STINK TOWER',
    SparkType.Square,
    times(SparkType.Circle, STINK_TOWER_HUB_DEGREE),
  ),

  // ⭐ S151 P3 — THE GOBLIN TOWER (owner R70): 1 Circle hub (deg 4) + 4 Circle leaves. The only
  // ALL-ONE-TYPE recipe in the registry, which is deliberate — Circle is the one primitive with no
  // competing hub role, so committing five of them costs the player nothing else.
  goblinTower: star(
    'goblinTower',
    'GOBLIN TOWER',
    SparkType.Circle,
    times(SparkType.Circle, GOBLIN_TOWER_HUB_DEGREE),
  ),

  // 1 Dot hub (deg 5) + 5 Circle leaves → the suicide-drone emitter.
  lightningHub: star(
    'lightningHub',
    'LIGHTNING HUB',
    SparkType.Dot,
    times(SparkType.Circle, LIGHTNING_HUB_DEGREE),
  ),

  // 1 Line hub (deg 6) + 6 Spiral 'Whip' leaves.
  laserTurret: star(
    'laserTurret',
    'LASER TURRET',
    SparkType.Line,
    times(SparkType.Spiral, TURRET_LEAVES),
  ),

  // 1 Triangle hub (deg 6) + 3 Spiral 'Warped Anchor' + 3 Circle 'Star' leaves. The predicate COUNTS
  // spirals and circles rather than checking positions, so the interleave below is purely cosmetic —
  // alternating them makes the stamped princess read as symmetric instead of lopsided.
  helga: star(
    'helga',
    'PRINCESS HELGA',
    SparkType.Triangle,
    (() => {
      const out: SparkType[] = [];
      for (let i = 0; i < HELGA_LEAF_PAIRS; i++) out.push(SparkType.Spiral, SparkType.Circle);
      return out;
    })(),
  ),

  /**
   * 5 Triangles in a closed ring, each of degree EXACTLY 2 — the one recipe where an extra bond is
   * fatal rather than tolerated, which is precisely why the stamp writes the 5 ring edges explicitly
   * and never lets auto-bond near it (a chord would make two vertices degree 3).
   */
  /*
   * ⭐ S166 — THE SIX TIER-3 RACE TOWERS (R119): three of the race's OWN feed shape, closed in a
   * ring. Six explicit entries over one builder, so `tsc` sees all six keys AND the geometry cannot
   * drift between them.
   *
   * ⚠ THE RING EDGES ARE EXPLICIT, as the pentagram's are, and for a sharper reason here:
   * `isRingAt` requires every node to have exactly TWO same-type neighbours, so a stamp that left
   * one pair unbonded would produce a structure the predicate refuses — a tower that builds and then
   * never ignites, with nothing red anywhere. Auto-bond must never be relied on to close it.
   */
  t3TowerVampires: raceTowerBlueprint('vampires'),
  t3TowerNagas: raceTowerBlueprint('nagas'),
  t3TowerMummies: raceTowerBlueprint('mummies'),
  t3TowerZombies: raceTowerBlueprint('zombies'),
  t3TowerOrcs: raceTowerBlueprint('orcs'),
  t3TowerDemons: raceTowerBlueprint('demons'),
  // S167 — the six TIER-9 boss towers. tsc forces these six: `BLUEPRINTS` is a full
  // `Record<GodlyId, Blueprint>`, which is the one table in this file that cannot be silently missed.
  t9TowerVampires: t9TowerBlueprint('vampires'),
  t9TowerNagas: t9TowerBlueprint('nagas'),
  t9TowerMummies: t9TowerBlueprint('mummies'),
  t9TowerZombies: t9TowerBlueprint('zombies'),
  t9TowerOrcs: t9TowerBlueprint('orcs'),
  t9TowerDemons: t9TowerBlueprint('demons'),

  pentagram: (() => {
    const n = PENTAGRAM_RING;
    const nodes: BlueprintNode[] = [];
    const bonds: Array<readonly [number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      nodes.push({ type: SparkType.Triangle, dx: Math.cos(a) * RING_R, dy: Math.sin(a) * RING_R });
      bonds.push([i, (i + 1) % n]);
    }
    return { id: 'pentagram' as GodlyId, label: 'PENTAGRAM', nodes, bonds };
  })(),

  /**
   * A straight chain of 4 Squares then 4 Triangles, degrees 1,2,2,2,2,2,2,1.
   *
   * ⚠ Straight, and centred on the stamp point, on purpose. `voltkinPredicate` enforces STRICT CHAIN
   * ISOLATION: every chain primitive's degree must equal its in-chain expectation AND every one of
   * its bonds must land on an in-chain neighbour. A curved or zig-zag chain risks nothing in the
   * stamp itself (bonds are explicit) but brings non-adjacent nodes physically closer, which makes a
   * later player placement far more likely to auto-bond a chord onto the chain and silently kill it.
   */
  voltkin: (() => {
    const size = VOLTKIN_HALF * 2;
    const types = [
      ...times(SparkType.Square, VOLTKIN_HALF),
      ...times(SparkType.Triangle, VOLTKIN_HALF),
    ];
    const span = (size - 1) * CHAIN_STEP;
    const nodes: BlueprintNode[] = types.map((type, i) => ({
      type,
      dx: i * CHAIN_STEP - span / 2,
      dy: 0,
    }));
    const bonds: Array<readonly [number, number]> = [];
    for (let i = 0; i < size - 1; i++) bonds.push([i, i + 1]);
    return { id: 'voltkin' as GodlyId, label: 'VOLTKIN', nodes, bonds };
  })(),
};

/**
 * Panel display order: cheapest first, so the list reads as a progression the player can climb and
 * the affordable rows cluster at the top.
 */
// ⚠ HAND-WRITTEN AND NOT DERIVED FROM `BLUEPRINTS`, WHICH IS A TRAP THIS LIST HAS ALREADY SPRUNG.
// S151 P3 added `goblinTower` to `BLUEPRINTS` (so `blueprintFor` resolved it, and every test passed)
// while this list still had six entries — so the tower was fully implemented, ignitable and
// tear-downable, and simply NEVER APPEARED IN THE BUILD PANEL. A `Record<GodlyId, …>` is
// exhaustiveness-checked by tsc; an array literal of the same ids is not.
export const ALL_BLUEPRINT_IDS: readonly GodlyId[] = [
  /*
   * ⛔ S166 — THE SIX RACE TOWERS MUST BE HERE AT ALL, AND THIS LIST'S OWN HISTORY IS THE WARNING.
   * It is HAND-WRITTEN: the goblin tower was fully implemented, registered and working, and simply
   * never appeared in the build panel because it was missing from this array. `tsc` cannot catch
   * that — the type is `readonly GodlyId[]`, not a `Record`, so an omission is SILENT.
   *
   * ⚠ Order is cosmetic (the panel and the bots both sort by `blueprintCost`), but cheapest-first
   * matches what a player sees.
   */
  't3TowerVampires', 't3TowerNagas', 't3TowerMummies',
  't3TowerZombies', 't3TowerOrcs', 't3TowerDemons',
  'stinkTower', 'goblinTower', 'pentagram', 'lightningHub', 'laserTurret', 'helga', 'voltkin',
  /*
   * ⛔ S167 — AND THE SIX TIER-9 TOWERS, WHICH THE COMPILER CANNOT DEMAND EITHER. Omitting them
   * would leave the boss tower fully implemented, ignitable, and INVISIBLE in the build panel —
   * verbatim the goblin-tower defect this array's own warning above describes.
   *
   * ⚠ AND A SECOND, QUIETER COST THAT THE GOBLIN TOWER DID NOT PAY: `blueprints.test.ts` drives
   * five geometry contracts with `it.each(ALL_BLUEPRINT_IDS)`, so an id missing here does not merely
   * hide the tower — it silently SKIPS its own geometry checks, and the new nine-ring radius would
   * ship unverified with a green suite.
   *
   * Last, not cheapest-first: these are the most expensive builds in the game.
   */
  't9TowerVampires', 't9TowerNagas', 't9TowerMummies',
  't9TowerZombies', 't9TowerOrcs', 't9TowerDemons',
];

/** PURE — the blueprint for `id`. */
export function blueprintFor(id: GodlyId): Blueprint {
  return BLUEPRINTS[id];
}

/**
 * PURE — the bill of materials: how many of each `SparkType` the build consumes. Drives both the
 * panel's have/need readout and the reducer's affordability check, so the two can never disagree.
 */
export function blueprintBill(id: GodlyId): Map<SparkType, number> {
  const bill = new Map<SparkType, number>();
  for (const node of BLUEPRINTS[id].nodes) bill.set(node.type, (bill.get(node.type) ?? 0) + 1);
  return bill;
}

/** PURE — total shapes a blueprint costs (its component size). */
export function blueprintCost(id: GodlyId): number {
  return BLUEPRINTS[id].nodes.length;
}

/** PURE — absolute world positions for a stamp centred at `centre`. */
export function blueprintPositions(id: GodlyId, centre: Vec2): Vec2[] {
  return BLUEPRINTS[id].nodes.map((n) => ({ x: centre.x + n.dx, y: centre.y + n.dy }));
}

/**
 * PURE — the blueprint's footprint radius: the furthest node from the centre, plus a small margin.
 * Consumed by the legality check so a stamp cannot be dropped overlapping existing geometry, and by
 * the ghost so the preview outline matches the space the build will actually occupy.
 */
export function blueprintRadius(id: GodlyId): number {
  let max = 0;
  for (const n of BLUEPRINTS[id].nodes) max = Math.max(max, Math.hypot(n.dx, n.dy));
  return max + 12;
}

/**
 * The component sizes each predicate demands, kept here ONLY so `blueprints.test.ts` can assert the
 * node count matches without re-importing six recipe modules. Not read at runtime — a second copy
 * that drifted would be worse than useless, so the test that consumes it also stamps every blueprint
 * against the LIVE predicate.
 */
/**
 * PURE — one race's tier-3 tower: `RACE_TOWER_SIZE` nodes of its own feed shape on a circle of
 * `TRI_RING_R`, with the ring edges written explicitly.
 *
 * ⛔ BUILT FROM `races.ts` AND `raceTowerIds.ts`, WHICH ARE SIDE-EFFECT-FREE LEAVES — never from
 * `godlyRecipes/raceTower.ts`. That module calls `registerRecipe` at its tail, and this file's own
 * docblock records exactly what a value import of a recipe module costs (S144 P1).
 */
function raceTowerBlueprint(race: RaceId): Blueprint {
  const n = RACE_TOWER_SIZE;
  const type = RACE_FEED_SHAPE[race];
  const nodes: BlueprintNode[] = [];
  const bonds: Array<readonly [number, number]> = [];
  for (let i = 0; i < n; i++) {
    // First node straight up, matching the pentagram, so a stamped tower reads as oriented.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    nodes.push({ type, dx: Math.cos(a) * TRI_RING_R, dy: Math.sin(a) * TRI_RING_R });
    bonds.push([i, (i + 1) % n]);
  }
  return { id: RACE_TOWER_IDS[race], label: RACE_TOWER_LABELS[race], nodes, bonds };
}

/**
 * PURE — one race's TIER-9 BOSS tower: `T9_TOWER_SIZE` nodes of its own feed shape on a circle of
 * `NINE_RING_R`, ring edges written explicitly.
 *
 * ⚠ IDENTICAL IN SHAPE TO `raceTowerBlueprint` AND DELIBERATELY NOT MERGED WITH IT. A shared
 * `ringBlueprint(race, n, r, id, label)` would be three lines shorter and would put the RADIUS
 * behind a parameter — and choosing the wrong radius for an `n` is the exact defect (S166 B12) that
 * both docblocks above exist to prevent. Two callers, two named constants, each documented against
 * its own `n`.
 *
 * ⛔ BUILT FROM THE SIDE-EFFECT-FREE LEAVES (`races.ts`, `t9BossIds.ts`), never from
 * `godlyRecipes/t9BossTower.ts`, which calls `registerRecipe` at its tail.
 */
function t9TowerBlueprint(race: RaceId): Blueprint {
  const n = T9_TOWER_SIZE;
  const type = RACE_FEED_SHAPE[race];
  const nodes: BlueprintNode[] = [];
  const bonds: Array<readonly [number, number]> = [];
  for (let i = 0; i < n; i++) {
    // First node straight up, matching the pentagram and the tier-3 ring, so a stamped tower reads
    // as oriented rather than arbitrarily rotated.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    nodes.push({ type, dx: Math.cos(a) * NINE_RING_R, dy: Math.sin(a) * NINE_RING_R });
    bonds.push([i, (i + 1) % n]);
  }
  return { id: T9_TOWER_IDS[race], label: t9TowerLabel(race), nodes, bonds };
}

export const EXPECTED_COMPONENT_SIZE: Readonly<Record<GodlyId, number>> = {
  stinkTower: STINK_TOWER_SIZE,
  goblinTower: GOBLIN_TOWER_SIZE,
  pentagram: PENTAGRAM_RING,
  lightningHub: LIGHTNING_HUB_COMPONENT_SIZE,
  laserTurret: TURRET_LEAVES + 1,
  helga: HELGA_LEAF_PAIRS * 2 + 1,
  voltkin: VOLTKIN_HALF * 2,
  // S166 — all six race towers are the same three-node ring (R119).
  t3TowerVampires: RACE_TOWER_SIZE,
  t3TowerNagas: RACE_TOWER_SIZE,
  t3TowerMummies: RACE_TOWER_SIZE,
  t3TowerZombies: RACE_TOWER_SIZE,
  t3TowerOrcs: RACE_TOWER_SIZE,
  t3TowerDemons: RACE_TOWER_SIZE,
  t9TowerVampires: T9_TOWER_SIZE,
  t9TowerNagas: T9_TOWER_SIZE,
  t9TowerMummies: T9_TOWER_SIZE,
  t9TowerZombies: T9_TOWER_SIZE,
  t9TowerOrcs: T9_TOWER_SIZE,
  t9TowerDemons: T9_TOWER_SIZE,
};
