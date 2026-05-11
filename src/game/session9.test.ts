/**
 * SPARK — Session 9 tests:
 *   - P2: cross-structure auto-merge on PLACE_PRIMITIVE.
 *     Placing a new primitive within AUTO_BOND_RADIUS of two distinct
 *     connected components creates one bond per component, merging them.
 *
 * P1 is covered in session7.test.ts (rewritten in S9 P1).
 * P3 scoring tests live alongside the existing world.test.ts /
 * gameState.test.ts changes.
 */

import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from './spark.ts';
import { componentOf } from './structure.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import {
  asPlayerId,
  asSparkId,
  type PrimitiveId,
} from '../types.ts';

const P1 = asPlayerId(0);
const PHYSICS_DT = 1 / PHYSICS_HZ;

/**
 * Spawn a Free spark of type `type` at `pos`, then PICKUP + PLACE it with
 * the given target / merge candidates. Spark position is set before
 * PICKUP so placePrimitive uses it as the placement coord. Returns the
 * resulting Primitive's id.
 */
function placeAt(
  world: ReturnType<typeof makeWorld>,
  opts: {
    sparkRawId: number;
    type: SparkType;
    pos: { x: number; y: number };
    targetId: PrimitiveId | null;
    mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
  },
): PrimitiveId {
  const sparkId = asSparkId(opts.sparkRawId);
  dispatch(world, {
    type: 'SPAWN_SPARK',
    spark: makeFreeSpark({
      id: sparkId,
      type: opts.type,
      pos: opts.pos,
      velocity: { x: 0, y: 0 },
      dt: PHYSICS_DT,
      createdTick: world.tick,
    }),
  });
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1 });
  // PICKUP_SPARK zero-velocity-snaps prevPos but keeps pos. Placement coord
  // = spark.pos = opts.pos. (S9 P1 no longer snaps to cursor.)
  const beforeIds = new Set([...world.primitives.keys()]);
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1,
    targetPrimitiveId: opts.targetId,
    stiffnessTier: 'MID',
    mergeCandidateIds: opts.mergeCandidateIds,
  });
  const placedId = [...world.primitives.keys()].find((id) => !beforeIds.has(id));
  expect(placedId).toBeDefined();
  return placedId!;
}

describe('S9 P2 — cross-structure auto-merge on PLACE_PRIMITIVE', () => {
  it('placing within range of two distinct components merges them into one structure', () => {
    const world = makeWorld(0);

    // Structure α: prim 0 at (200, 200), prim 1 at (230, 200) bonded to prim 0.
    const a0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot,    pos: { x: 200, y: 200 }, targetId: null });
    const a1 = placeAt(world, { sparkRawId: 2, type: SparkType.Line,   pos: { x: 230, y: 200 }, targetId: a0 });

    // Structure β: prim 2 at (310, 200), prim 3 at (340, 200) bonded to prim 2.
    // Separated from α by 80px (prim 1 ↔ prim 2) — wider than AUTO_BOND_RADIUS=60
    // so a placement at prim 1's position can't accidentally reach β yet.
    const b0 = placeAt(world, { sparkRawId: 3, type: SparkType.Triangle, pos: { x: 310, y: 200 }, targetId: null });
    const b1 = placeAt(world, { sparkRawId: 4, type: SparkType.Square,   pos: { x: 340, y: 200 }, targetId: b0 });

    // Sanity: pre-merge, α and β are independent components.
    const aComp0 = componentOf(world.primitives.get(a0)!, world.primitives, world.bonds);
    expect(aComp0.primitiveIds.has(b0)).toBe(false);
    expect(aComp0.primitiveIds.size).toBe(2);

    // Place a bridging primitive at (270, 200): 40px from prim 1 (in α), 40px
    // from prim 2 (in β). Both within AUTO_BOND_RADIUS=60. Pass both as
    // merge candidates.
    const bridge = placeAt(world, {
      sparkRawId: 5,
      type: SparkType.Circle,
      pos: { x: 270, y: 200 },
      targetId: a1,                              // primary bond into α
      mergeCandidateIds: [a1, b0],               // a1 already in primary's component → dedups; b0 triggers merge
    });

    // The bridge primitive should have exactly 2 bonds: primary (to a1) + merge (to b0).
    const bridgePrim = world.primitives.get(bridge)!;
    expect(bridgePrim.bonds.size).toBe(2);

    // After merge, prim 0 (α anchor) and prim 3 (β tip) share a component.
    const mergedComp = componentOf(world.primitives.get(a0)!, world.primitives, world.bonds);
    expect(mergedComp.primitiveIds.has(b1)).toBe(true);
    expect(mergedComp.primitiveIds.size).toBe(5);
  });

  it('three structures placed in a Y-junction merge to one with three merge bonds', () => {
    const world = makeWorld(0);

    // Three single-primitive anchors arranged ~50px from a central placement.
    // Each at distance 50 from (270, 200), pairwise > AUTO_BOND_RADIUS apart.
    const sA = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: null });
    const sB = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 320, y: 200 }, targetId: null });
    const sC = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 270, y: 250 }, targetId: null });

    // None of the three anchors are bonded to each other (each is its own component).
    expect(world.primitives.get(sA)!.bonds.size).toBe(0);
    expect(world.primitives.get(sB)!.bonds.size).toBe(0);
    expect(world.primitives.get(sC)!.bonds.size).toBe(0);

    // Place bridging primitive at (270, 200). Pick targetId = sA, pass all three
    // as merge candidates.
    const hub = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 270, y: 200 },
      targetId: sA,
      mergeCandidateIds: [sA, sB, sC],
    });

    // Hub should have 3 bonds: 1 primary (to sA) + 2 merge (to sB, sC).
    expect(world.primitives.get(hub)!.bonds.size).toBe(3);
    // All four primitives now in one component.
    const comp = componentOf(world.primitives.get(sA)!, world.primitives, world.bonds);
    expect(comp.primitiveIds.size).toBe(4);
    expect(comp.primitiveIds.has(sB)).toBe(true);
    expect(comp.primitiveIds.has(sC)).toBe(true);
  });

  it('merge candidates already in primary target component are silently deduped', () => {
    const world = makeWorld(0);

    // Build a 3-primitive chain: a → b → c (all bonded).
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot,  pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot,  pos: { x: 220, y: 200 }, targetId: a });
    const c = placeAt(world, { sparkRawId: 3, type: SparkType.Dot,  pos: { x: 240, y: 200 }, targetId: b });

    // Place new primitive bonded to c, with a and b in merge candidates.
    // a and b are already in c's component, so the sweep should add zero
    // merge bonds. Final bond count for the new primitive = 1 (primary only).
    const d = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 260, y: 200 },
      targetId: c,
      mergeCandidateIds: [a, b, c],  // c is also redundant (id === targetId effectively)
    });

    expect(world.primitives.get(d)!.bonds.size).toBe(1);
  });

  it('mergeCandidateIds=undefined preserves S6/S7/S8 behavior (no extra bonds)', () => {
    const world = makeWorld(0);

    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    // No mergeCandidateIds — undefined defaults to no sweep.
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });

    expect(world.primitives.get(b)!.bonds.size).toBe(1);
    expect(world.bonds.size).toBe(1);
  });

  it('merge bonds emit BOND_COMMIT effects so the visual reads', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 320, y: 200 }, targetId: null });

    // Clear effects from the two anchor placements (no bonds = no BOND_COMMIT,
    // but be defensive).
    const effectsBefore = world.effects.length;

    const bridge = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 260, y: 200 },
      targetId: a,
      mergeCandidateIds: [a, b],
    });

    void bridge;
    const newEffects = world.effects.slice(effectsBefore);
    const bondCommits = newEffects.filter((e) => e.kind === 'BOND_COMMIT');
    // Primary bond + merge bond = 2 BOND_COMMIT effects.
    expect(bondCommits.length).toBe(2);
  });
});

describe('S9 P3 — complexity-weighted scoreProgress', () => {
  it('anchor placement increments scoreProgress by SCORE_ANCHOR', () => {
    const world = makeWorld(0);
    expect(world.scoreProgress).toBe(0);
    placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    expect(world.scoreProgress).toBe(SCORE_ANCHOR);
    placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 240, y: 200 }, targetId: null });
    expect(world.scoreProgress).toBe(SCORE_ANCHOR * 2);
  });

  it('Functional combo bond increments by SCORE_FUNCTIONAL_BOND', () => {
    const world = makeWorld(0);
    // Dot.Dot is NOT in the Magic-12 → Functional placeholder.
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });
    // Anchor (1) + functional bond (1) = 2.
    expect(world.scoreProgress).toBe(SCORE_ANCHOR + SCORE_FUNCTIONAL_BOND);
  });

  it('Magic combo bond increments by SCORE_MAGIC_BOND (Dot→Line = Filament)', () => {
    const world = makeWorld(0);
    // Dot anchor + Line bonded to it → Dot→Line = Filament (magical).
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Line, pos: { x: 200, y: 200 }, targetId: null });
    placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });
    // Note: order is carried→target, so prim2 (Dot) → prim1 (Line) ⇒ key Dot.Line → Filament magic.
    expect(world.scoreProgress).toBe(SCORE_ANCHOR + SCORE_MAGIC_BOND);
  });

  it('all-magic chain accrues 3x per bond — Magic > Functional at same length', () => {
    // Build two chains side by side: one all-magic (Dot→Line repeating), one
    // all-functional (Dot→Dot repeating). 1 anchor + 4 bonds in each = 5 prims.
    const wMagic = makeWorld(0);
    // anchor Line, then 4 Dots each bonded to the prior (Dot→Line / Dot→Dot...
    // wait, target is the previous primitive). Let me make a strict chain:
    // each new prim of type Dot bonded to a Line anchor — only first bond is
    // magic. So switch: anchor + 4 alternations.
    //
    // Simpler: anchor Spiral, then 4 Lines each bonded to previous-Line ...
    // no, simpler still: use Magic combo Line→Line (Cable, isMagical=true).
    // Anchor: Line. Then each next prim is Line bonded to last Line.
    // Bond direction = carried→target = Line→Line = Cable (magic).
    const aMagic = placeAt(wMagic, { sparkRawId: 0, type: SparkType.Line, pos: { x: 200, y: 200 }, targetId: null });
    let prevMagic = aMagic;
    for (let i = 1; i <= 4; i++) {
      prevMagic = placeAt(wMagic, {
        sparkRawId: i,
        type: SparkType.Line,
        pos: { x: 200 + i * 20, y: 200 },
        targetId: prevMagic,
      });
    }
    // Anchor 1 + 4 Magic bonds = 1 + 12 = 13.
    expect(wMagic.scoreProgress).toBe(SCORE_ANCHOR + 4 * SCORE_MAGIC_BOND);

    const wFunc = makeWorld(0);
    // Dot→Dot is functional (not in Magic-12).
    const aFunc = placeAt(wFunc, { sparkRawId: 0, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    let prevFunc = aFunc;
    for (let i = 1; i <= 4; i++) {
      prevFunc = placeAt(wFunc, {
        sparkRawId: i,
        type: SparkType.Dot,
        pos: { x: 200 + i * 20, y: 200 },
        targetId: prevFunc,
      });
    }
    // Anchor 1 + 4 Functional bonds = 1 + 4 = 5.
    expect(wFunc.scoreProgress).toBe(SCORE_ANCHOR + 4 * SCORE_FUNCTIONAL_BOND);

    // Magic structure scores meaningfully more per equal length.
    expect(wMagic.scoreProgress).toBeGreaterThan(wFunc.scoreProgress);
  });

  it('P2 merge bonds also contribute to scoreProgress', () => {
    const world = makeWorld(0);
    // Two single-primitive Line anchors. Bridge with Line; primary + merge
    // bonds are both Line→Line = Cable (magic).
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Line, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Line, pos: { x: 280, y: 200 }, targetId: null });
    expect(world.scoreProgress).toBe(SCORE_ANCHOR * 2);

    placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Line,
      pos: { x: 240, y: 200 },
      targetId: a,
      mergeCandidateIds: [a, b],
    });
    // 2 anchors (2) + 1 primary magic bond (3) + 1 merge magic bond (3) = 8.
    expect(world.scoreProgress).toBe(SCORE_ANCHOR * 2 + SCORE_MAGIC_BOND * 2);
  });
});
