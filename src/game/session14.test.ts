/**
 * SPARK — Session 14 tests:
 *   P2.1: Multi-endpoint redundant bonding. New placements with a primary
 *         target can create up to REDUNDANT_BOND_K-1 additional bonds to
 *         other primitives in the SAME connected component within
 *         AUTO_BOND_RADIUS, subject to ≥ REDUNDANT_BOND_MIN_ANGLE_RAD
 *         angular separation. Redundancy bonds emit BOND_COMMIT but do
 *         NOT increment scoreProgress (Council R1 G5/G8 adoption).
 *
 *   Test groups:
 *     A · pickRedundantBondTargets pure-function (geometric algorithm)
 *     B · angularDistance helper
 *     C · placePrimitive end-to-end (bond counts, scoring, side effects)
 *     D · severSplit interaction (cycle preserves, non-cycle still amputates)
 *     E · DEV invariant validation (malformed extraBondTargetIds)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PHYSICS_HZ,
  REDUNDANT_BOND_ANGLE_EPSILON,
  REDUNDANT_BOND_K,
  REDUNDANT_BOND_MAX_CANDIDATES,
  REDUNDANT_BOND_MIN_ANGLE_RAD,
  SCORE_ANCHOR,
  SCORE_FUNCTIONAL_BOND,
  SCORE_MAGIC_BOND,
  SparkType,
} from '../constants.ts';
import {
  angularDistance,
  pickRedundantBondTargets,
} from '../input/redundantBondTargets.ts';
import { makeFreeSpark } from './spark.ts';
import { componentOf } from './structure.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { computeComplexity } from '../state/scoring.ts';
import {
  asPlayerId,
  asPrimitiveId,
  asSparkId,
  type PrimitiveId,
  type Vec2,
} from '../types.ts';

// AUTO_BOND_RADIUS is controls.ts-local (S13 #knob-splitting). Mirror its
// value here for tests — if it changes in controls.ts, this constant must
// be updated. 60 px per S13 P1.
const AUTO_BOND_RADIUS = 60;

const P1_ID = asPlayerId(0);
const PHYSICS_DT = 1 / PHYSICS_HZ;

/**
 * Place a primitive at `pos` with optional primary `targetId`, optional
 * merge candidates, and optional `extraBondTargetIds` for redundancy bonds.
 * Returns the new primitive's id.
 */
function placeAt(
  world: ReturnType<typeof makeWorld>,
  opts: {
    sparkRawId: number;
    type: SparkType;
    pos: Vec2;
    targetId: PrimitiveId | null;
    mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
    extraBondTargetIds?: ReadonlyArray<PrimitiveId>;
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
  const _sp14 = world.freeSparks.get(sparkId);
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1_ID, pos: _sp14 ? { x: _sp14.pos.x, y: _sp14.pos.y } : { x: 0, y: 0 } });
  const beforeIds = new Set([...world.primitives.keys()]);
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1_ID,
    targetPrimitiveId: opts.targetId,
    stiffnessTier: 'MID',
    mergeCandidateIds: opts.mergeCandidateIds,
    extraBondTargetIds: opts.extraBondTargetIds,
  });
  const placedId = [...world.primitives.keys()].find((id) => !beforeIds.has(id));
  expect(placedId).toBeDefined();
  return placedId!;
}

// ========================================================================
// A · pickRedundantBondTargets pure function
// ========================================================================

describe('S14 P2.1 — pickRedundantBondTargets', () => {
  // Tiny fixture: primary at (500,500); 3 component prims arranged around it
  // at distances < AUTO_BOND_RADIUS and at varied angles.
  const primary = { id: asPrimitiveId(0), pos: { x: 500, y: 500 } };
  const ids = {
    A: asPrimitiveId(1),  // east of newPrim
    B: asPrimitiveId(2),  // northwest of newPrim
    C: asPrimitiveId(3),  // south of newPrim
    OUT: asPrimitiveId(4), // too far
  };
  const positions = new Map([
    [primary.id, primary.pos],
    [ids.A, { x: 540, y: 500 }],   // 40 px east
    [ids.B, { x: 465, y: 480 }],   // 40 px northwest
    [ids.C, { x: 500, y: 545 }],   // 45 px south
    [ids.OUT, { x: 600, y: 500 }], // 100 px east (out of range)
  ]);
  const componentIds = new Set<PrimitiveId>([
    primary.id, ids.A, ids.B, ids.C, ids.OUT,
  ]);
  const primitives: ReadonlyMap<PrimitiveId, { pos: Vec2 }> = new Map(
    [...positions.entries()].map(([id, pos]) => [id, { pos }]),
  );
  const newPrimPos = { x: 500, y: 500 }; // placement at primary.pos for clarity

  const baseArgs = {
    primary,
    componentIds,
    primitives,
    newPrimPos,
    radius: AUTO_BOND_RADIUS,
    k: REDUNDANT_BOND_K,
    minAngleRad: REDUNDANT_BOND_MIN_ANGLE_RAD,
    angleEpsilon: REDUNDANT_BOND_ANGLE_EPSILON,
    maxCandidates: REDUNDANT_BOND_MAX_CANDIDATES,
  };

  it('K=1 returns empty (no redundancy)', () => {
    const result = pickRedundantBondTargets({ ...baseArgs, k: 1 });
    expect(result).toEqual([]);
  });

  it('K=0 returns empty (defensive boundary)', () => {
    const result = pickRedundantBondTargets({ ...baseArgs, k: 0 });
    expect(result).toEqual([]);
  });

  it('single-prim component (just primary) returns empty', () => {
    const result = pickRedundantBondTargets({
      ...baseArgs,
      componentIds: new Set([primary.id]),
    });
    expect(result).toEqual([]);
  });

  it('no candidate within radius returns empty', () => {
    // Build a component where every non-primary prim is > radius from newPrim
    const farIds = new Set<PrimitiveId>([primary.id, ids.OUT]);
    const result = pickRedundantBondTargets({
      ...baseArgs,
      componentIds: farIds,
    });
    expect(result).toEqual([]);
  });

  it('K=3 with 3 well-spread candidates returns 2 picks (primary + 2 = 3 total bonds)', () => {
    // Use newPrim 30px from primary along a known axis to avoid the
    // degenerate newPrim=primary case (atan2(0,0)=0 makes primaryAngle
    // collide with any candidate at angle 0).
    const args2 = {
      ...baseArgs,
      primary: { id: primary.id, pos: { x: 470, y: 500 } }, // primary is 30 px west of newPrim
      newPrimPos: { x: 500, y: 500 },
    };
    const result2 = pickRedundantBondTargets(args2);
    // primaryAngle = atan2(500-500, 470-500) = atan2(0, -30) = π (west)
    // A at (540,500): angle = atan2(0, 40) = 0  (spread vs π = π, ok)
    // B at (465,480): angle = atan2(-20, -35) = atan2(-20, -35) ≈ -2.62 (spread vs π ≈ 0.52)
    // C at (500,545): angle = atan2(45, 0) = π/2 (spread vs π = π/2)
    // sorted by distance: A(40), B(40), C(45).
    // Pick A first (angle 0, spread π from primary: ok). Add to selectedAngles.
    // Pick B next: angle -2.62, spread from primary(π): π - 2.62 ≈ 0.52
    //   = 30°. 25° threshold OK. Spread from A(0): 2.62 = 150°. OK.
    // Stop at k-1 = 2.
    expect(result2.length).toBe(2);
    expect(result2[0]).toBe(ids.A);
    expect(result2[1]).toBe(ids.B);
  });

  it('K=3 with only 1 candidate in range returns 1 pick', () => {
    const compSparse = new Set<PrimitiveId>([primary.id, ids.A]);
    const result = pickRedundantBondTargets({
      ...baseArgs,
      primary: { id: primary.id, pos: { x: 470, y: 500 } },
      componentIds: compSparse,
    });
    expect(result.length).toBe(1);
    expect(result[0]).toBe(ids.A);
  });

  it('K=3 with 0 candidates (only primary) returns empty', () => {
    const compSolo = new Set<PrimitiveId>([primary.id]);
    const result = pickRedundantBondTargets({
      ...baseArgs,
      componentIds: compSolo,
    });
    expect(result).toEqual([]);
  });

  it('AUTO_BOND_RADIUS boundary: candidate at 59 px IN, at 61 px OUT', () => {
    const pIN = asPrimitiveId(10);
    const pOUT = asPrimitiveId(11);
    const prims = new Map<PrimitiveId, { pos: Vec2 }>([
      [primary.id, { pos: { x: 470, y: 500 } }], // primary 30 px west of newPrim
      [pIN, { pos: { x: 500 + 59, y: 500 } }],   // 59 px east of newPrim
      [pOUT, { pos: { x: 500 + 61, y: 500 } }],  // 61 px east
    ]);
    const compIds = new Set<PrimitiveId>([primary.id, pIN, pOUT]);
    const result = pickRedundantBondTargets({
      ...baseArgs,
      primary: { id: primary.id, pos: { x: 470, y: 500 } },
      componentIds: compIds,
      primitives: prims,
    });
    // pIN (59 east, angle=0, spread π from primary=π — ok). pOUT (out of range).
    expect(result).toEqual([pIN]);
  });

  it('angular-spread filter: 3 colinear candidates → primary + 1 pick (rest fail spread)', () => {
    // All candidates on the SAME LINE through newPrim, on the side opposite
    // primary. primary at west; candidates at east at varying distances.
    // primaryAngle = π (west); candidate angles = 0 (east). Spread = π
    // (passes filter). After picking c1, subsequent c2/c3 at angle=0 vs
    // selected c1 at angle=0 → spread=0 → rejected.
    const c1 = asPrimitiveId(20);
    const c2 = asPrimitiveId(21);
    const c3 = asPrimitiveId(22);
    const prims = new Map<PrimitiveId, { pos: Vec2 }>([
      [primary.id, { pos: { x: 470, y: 500 } }], // west
      [c1, { pos: { x: 520, y: 500 } }],          // 20 px east
      [c2, { pos: { x: 540, y: 500 } }],          // 40 px east (also east, colinear w/ c1)
      [c3, { pos: { x: 555, y: 500 } }],          // 55 px east
    ]);
    const compIds = new Set<PrimitiveId>([primary.id, c1, c2, c3]);
    const result = pickRedundantBondTargets({
      ...baseArgs,
      primary: { id: primary.id, pos: { x: 470, y: 500 } },
      componentIds: compIds,
      primitives: prims,
    });
    // Distance sort: c1(20), c2(40), c3(55). Pick c1 (angle 0, spread π
    // from primary: ok). Try c2: spread vs c1 = 0 → REJECTED. Try c3:
    // spread vs c1 = 0 → REJECTED. Final: 1 pick.
    expect(result).toEqual([c1]);
  });

  it('MAX_CANDIDATES boundary: 17 in-range prims → only first 16 considered, 18th ignored', () => {
    // Build 17 prims arranged in a tight ring around newPrim, all within
    // AUTO_BOND_RADIUS. Map iteration order is insertion order in JS, so
    // the 17th prim added is the one dropped by the maxCandidates break.
    const compIds = new Set<PrimitiveId>([primary.id]);
    const prims = new Map<PrimitiveId, { pos: Vec2 }>([
      [primary.id, { pos: { x: 500, y: 460 } }], // primary 40 px north
    ]);
    // 17 candidates ringing newPrim at 30 px, 17 evenly-spaced angles.
    for (let i = 0; i < 17; i++) {
      const id = asPrimitiveId(100 + i);
      const theta = (i * 2 * Math.PI) / 17;
      prims.set(id, { pos: { x: 500 + 30 * Math.cos(theta), y: 500 + 30 * Math.sin(theta) } });
      compIds.add(id);
    }
    const result = pickRedundantBondTargets({
      ...baseArgs,
      primary: { id: primary.id, pos: { x: 500, y: 460 } },
      componentIds: compIds,
      primitives: prims,
    });
    // The pure picker uses MAX_CANDIDATES=16, so it sees only the first
    // 16 inserted candidates (id 100..115). With K=3 and 25° spread, it
    // picks K-1=2. We don't assert exact ids (depends on angular sort)
    // but we DO assert: no id 116 (the 17th) appears in result.
    expect(result.length).toBeLessThanOrEqual(REDUNDANT_BOND_K - 1);
    expect(result).not.toContain(asPrimitiveId(116));
  });
});

// ========================================================================
// B · angularDistance
// ========================================================================

describe('S14 P2.1 — angularDistance', () => {
  it('zero distance to itself', () => {
    expect(angularDistance(0, 0)).toBeCloseTo(0, 6);
    expect(angularDistance(Math.PI / 4, Math.PI / 4)).toBeCloseTo(0, 6);
    expect(angularDistance(-Math.PI / 2, -Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('quarter-turn = π/2', () => {
    expect(angularDistance(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angularDistance(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('half-turn = π (maximum geometric arc)', () => {
    expect(angularDistance(0, Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(angularDistance(0, -Math.PI)).toBeCloseTo(Math.PI, 6);
  });

  it('wraps across ±π boundary (shorter arc)', () => {
    // a = π - 0.1, b = -(π) + 0.1. Geometric arc = 0.2 rad, NOT 2π - 0.2.
    expect(angularDistance(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 4);
  });

  it('full revolutions reduce modulo 2π', () => {
    // 4π difference = 0 rad geometrically
    expect(angularDistance(0, 4 * Math.PI)).toBeCloseTo(0, 4);
    expect(angularDistance(Math.PI / 3, Math.PI / 3 + 6 * Math.PI)).toBeCloseTo(0, 4);
  });
});

// ========================================================================
// C · placePrimitive end-to-end
// ========================================================================

describe('S14 P2.1 — placePrimitive end-to-end', () => {
  it('K=3 placement: target + 2 in-component prims → 3 bonds on new prim', () => {
    // Build a 4-prim "Y" structure: a hub c0 with 3 spokes c1/c2/c3
    // around it, then place a new prim near c0 with c2 and c3 as extras.
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 500, y: 470 }, targetId: c0 });
    const c3 = placeAt(world, { sparkRawId: 4, type: SparkType.Dot, pos: { x: 530, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const hub = placeAt(world, {
      sparkRawId: 5,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 }, // south of c0, near c1/c2/c3
      targetId: c0,
      extraBondTargetIds: [c1, c3], // both at angle ~ ±90° from primary c0 (north)
    });

    const hubPrim = world.primitives.get(hub)!;
    expect(hubPrim.bonds.size).toBe(3); // primary + 2 redundancy
    expect(world.bonds.size).toBe(beforeBonds + 3);

    // Verify all 4 (c0/c1/c2/c3) + hub are in one component
    const comp = componentOf(hubPrim, world.primitives, world.bonds);
    expect(comp.primitiveIds.size).toBe(5);
    expect(comp.primitiveIds.has(c2)).toBe(true); // c2 reachable via c0
  });

  it('K=3 placement with only 1 valid extra → 2 total bonds (primary + 1 redundancy)', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c1],
    });

    expect(world.primitives.get(newP)!.bonds.size).toBe(2);
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });

  it('anchor placement (targetId=null) with extraBondTargetIds ignored (no primary component)', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 800, y: 800 }, // far from c0/c1
      targetId: null,
      extraBondTargetIds: [c0, c1], // should be ignored — no primary target
    });

    expect(world.primitives.get(newP)!.bonds.size).toBe(0);
    expect(world.bonds.size).toBe(beforeBonds);
  });

  it('redundancy bonds emit BOND_COMMIT (one per bond)', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    world.effects.length = 0; // clear pre-existing effects
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c1],
    });

    const bondCommits = world.effects.filter((e) => e.kind === 'BOND_COMMIT');
    expect(bondCommits.length).toBe(2); // primary + 1 redundancy

    // Each BOND_COMMIT should have `pos` at the new prim
    const newPrim = world.primitives.get(newP)!;
    for (const e of bondCommits) {
      if (e.kind !== 'BOND_COMMIT') throw new Error('unreachable');
      expect(e.pos.x).toBeCloseTo(newPrim.pos.x, 4);
      expect(e.pos.y).toBeCloseTo(newPrim.pos.y, 4);
    }
  });

  it('S76: functional redundancy bonds add ZERO complexity (only the new prim counts)', () => {
    // S14-S75 gave redundancy bonds zero SCORE (per-placement accumulator). S76 scores standing
    // COMPLEXITY; functional bonds are complexity-neutral, so functional redundancy still adds
    // nothing beyond the new primitive itself.
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 530, y: 500 }, targetId: c0 });
    const before = computeComplexity(world, P1_ID);

    placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c1, c2], // 2 functional (Dot→Dot) redundancy bonds
    });

    // +1 new primitive; all bonds (primary + redundancy) are functional → +0 magic premium.
    expect(computeComplexity(world, P1_ID) - before).toBe(SCORE_ANCHOR);
  });

  it('S76: standing MAGIC bonds count toward complexity, including redundancy (design change)', () => {
    // S14-S75 deliberately excluded redundancy bonds from SCORE ("defense, not velocity").
    // S76 scores standing complexity recomputed from live state, which cannot distinguish a
    // primary from a redundancy bond — so EVERY standing magic bond counts. Bounded
    // (REDUNDANT_BOND_K caps redundancy + geometry-gated) and arguably correct (the extra magic
    // bonds are real structure). Here all 3 new bonds are Dot→Spiral (Vortex, magic).
    const MAGIC_PREMIUM = SCORE_MAGIC_BOND - SCORE_FUNCTIONAL_BOND;
    const world = makeWorld(0);
    const seed = placeAt(world, { sparkRawId: 1, type: SparkType.Spiral, pos: { x: 500, y: 500 }, targetId: null });
    const a = placeAt(world, { sparkRawId: 2, type: SparkType.Spiral, pos: { x: 470, y: 500 }, targetId: seed });
    const b = placeAt(world, { sparkRawId: 3, type: SparkType.Spiral, pos: { x: 530, y: 500 }, targetId: seed });
    const before = computeComplexity(world, P1_ID);

    placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot, // Dot → Spiral primary + Dot → Spiral redundancy (all Vortex magic)
      pos: { x: 500, y: 530 },
      targetId: seed,
      extraBondTargetIds: [a, b],
    });

    // +1 new prim; +3 magic bonds (primary + 2 redundancy, all Dot→Spiral) × MAGIC_PREMIUM.
    expect(computeComplexity(world, P1_ID) - before).toBe(SCORE_ANCHOR + 3 * MAGIC_PREMIUM);
  });

  it('cross-component independence: primary + redundancy + cross-component merge all coexist', () => {
    const world = makeWorld(0);
    // Primary component: c0 + c1 within range of newPrim
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });
    // Separate component: c2 (anchor) — passed via mergeCandidateIds.
    // placePrimitive's merge sweep does not gate by distance; the
    // controls.ts caller is responsible for MERGE_REACH_RADIUS filtering.
    // Here we hand-feed c2 to verify all three bond paths fire together.
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 580, y: 600 }, targetId: null });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      mergeCandidateIds: [c2], // cross-component merge bond
      extraBondTargetIds: [c1], // intra-component redundancy bond
    });
    expect(world.primitives.get(newP)!.bonds.size).toBe(3); // primary + redundancy + merge
    expect(world.bonds.size).toBe(beforeBonds + 3);
  });
});

// ========================================================================
// D · severSplit interaction (cycles preserve, non-cycle still amputates)
// ========================================================================

describe('S14 P2.1 — severSplit interaction', () => {
  it('cycle preserves: sever one redundancy bond → structure intact (cycle path)', () => {
    // Build a triangle: c0/c1 already bonded, then place new prim with
    // primary=c0 + redundancy=c1. Triangle has 3 bonds (c0-c1 from build,
    // new-c0, new-c1). Sever new-c1: BFS from new finds c1 via c0 → not
    // amputated.
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c1],
    });

    expect(world.primitives.get(newP)!.bonds.size).toBe(2);

    // Find the redundancy bond (new ↔ c1).
    let bondToSeverId: number | undefined;
    for (const [bondId, bond] of world.bonds.entries()) {
      if ((bond.aId === newP && bond.bId === c1) || (bond.aId === c1 && bond.bId === newP)) {
        bondToSeverId = bondId;
        break;
      }
    }
    expect(bondToSeverId).toBeDefined();

    const primsBefore = world.primitives.size;
    dispatch(world, { type: 'SEVER_BOND', bondId: bondToSeverId! as never, playerId: asPlayerId(0), cause: 'physics' });

    // All 3 primitives should remain — the cut was on a cycle, both sides
    // are still connected via the c0 path. severSplit detects this and
    // returns { del: empty } per structure.ts:131.
    expect(world.primitives.size).toBe(primsBefore);
    const comp = componentOf(world.primitives.get(c0)!, world.primitives, world.bonds);
    expect(comp.primitiveIds.size).toBe(3); // c0, c1, newP all still in one component
  });

  it('non-cycle still amputates: sever a non-redundant chain bond → smaller side erases', () => {
    // Chain c0 - c1 - c2, sever c0-c1. c0 (size 1) loses to c1-c2 (size 2).
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 400, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 440, y: 500 }, targetId: c0 });
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 480, y: 500 }, targetId: c1 });

    let bondC0C1Id: number | undefined;
    for (const [bondId, bond] of world.bonds.entries()) {
      if ((bond.aId === c0 && bond.bId === c1) || (bond.aId === c1 && bond.bId === c0)) {
        bondC0C1Id = bondId;
        break;
      }
    }
    expect(bondC0C1Id).toBeDefined();

    dispatch(world, { type: 'SEVER_BOND', bondId: bondC0C1Id! as never, playerId: asPlayerId(0), cause: 'physics' });

    // c0 (single primitive on the cut side) should be erased.
    expect(world.primitives.has(c0)).toBe(false);
    expect(world.primitives.has(c1)).toBe(true);
    expect(world.primitives.has(c2)).toBe(true);
  });
});

// ========================================================================
// E · DEV invariant validation
// ========================================================================

describe('S14 P2.1 — DEV invariant validation', () => {
  // Silence the DEV invariant console.error logs in this block — we
  // assert on bond-count outcomes; the logs are developer aids.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extraBondTargetIds containing self-id → skipped', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });
    // The next placed primitive id will be c1 + 1 (monotonic). We can't
    // know it exactly until placed, but we can pass an unreachable
    // self-id by introspecting nextPrimitiveId.
    const predictedNewId = asPrimitiveId(world.nextPrimitiveId);
    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [predictedNewId, c1], // self-id then valid c1
    });
    // self-id is skipped; c1 forms a redundancy bond.
    expect(newP).toBe(predictedNewId);
    expect(world.primitives.get(newP)!.bonds.size).toBe(2); // primary + c1
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });

  it('extraBondTargetIds containing primary-target-id → skipped (duplicate)', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c0, c1], // c0 is primary-id → skipped
    });
    expect(world.primitives.get(newP)!.bonds.size).toBe(2); // primary + c1
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });

  it('extraBondTargetIds with duplicate id → second occurrence skipped', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c1, c1], // duplicate
    });
    expect(world.primitives.get(newP)!.bonds.size).toBe(2); // primary + c1 (single)
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });

  it('extraBondTargetIds with missing primitive id → skipped', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });

    const beforeBonds = world.bonds.size;
    const missingId = asPrimitiveId(9999);
    const newP = placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [missingId, c1],
    });
    expect(world.primitives.get(newP)!.bonds.size).toBe(2); // primary + c1
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });

  it('extraBondTargetIds with id NOT in primary component → skipped', () => {
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 500, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 470, y: 500 }, targetId: c0 });
    // c2 is in a SEPARATE component (placed as anchor far away).
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 1000, y: 1000 }, targetId: null });

    const beforeBonds = world.bonds.size;
    const newP = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 500, y: 530 },
      targetId: c0,
      extraBondTargetIds: [c2, c1], // c2 is out-of-component → skipped
    });
    expect(world.primitives.get(newP)!.bonds.size).toBe(2); // primary + c1
    expect(world.bonds.size).toBe(beforeBonds + 2);
  });
});

