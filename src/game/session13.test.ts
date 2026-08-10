/**
 * SPARK — Session 13 tests:
 *   P1: Multi-structure merge reach (MERGE_REACH_RADIUS=100 separate from
 *       AUTO_BOND_RADIUS=60) + explicit nearest-pick map per component.
 *   P2: STRUCTURE_GROW outward verlet impulse on primary's pre-existing
 *       component (centroid-outward), gated on cinematicsEnabled.
 *   P3: MERGE_IMPULSE_MAGNITUDE bump (1.2 → 3.0) + short-bond clamp at
 *       MIN_BOND_LENGTH_FOR_IMPULSE=25.
 *
 * P4 (SCORE_TIER scale-up + center co-emit) lands in its own commit.
 */

import { describe, expect, it } from 'vitest';
import {
  MERGE_IMPULSE_MAGNITUDE,
  MIN_BOND_LENGTH_FOR_IMPULSE,
  PHYSICS_HZ,
  SCORE_TIER_STEP,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from './spark.ts';
import { componentOf } from './structure.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { tickScoring } from '../state/scoring.ts';
import { asPlayerId, asSparkId, type PrimitiveId } from '../types.ts';

const P1_ID = asPlayerId(0);
const PHYSICS_DT = 1 / PHYSICS_HZ;

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
  const _sp13 = world.freeSparks.get(sparkId);
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1_ID, pos: _sp13 ? { x: _sp13.pos.x, y: _sp13.pos.y } : { x: 0, y: 0 } });
  const beforeIds = new Set([...world.primitives.keys()]);
  dispatch(world, {
    type: 'PLACE_PRIMITIVE',
    playerId: P1_ID,
    targetPrimitiveId: opts.targetId,
    stiffnessTier: 'MID',
    mergeCandidateIds: opts.mergeCandidateIds,
  });
  const placedId = [...world.primitives.keys()].find((id) => !beforeIds.has(id));
  expect(placedId).toBeDefined();
  return placedId!;
}

describe('S13 P1 — multi-structure merge reach (90+ px spacing)', () => {
  it('three structures spaced 90 px from hub all merge into one component', () => {
    // Three single-prim anchors arranged so each is ~90 px from the hub.
    // Outside AUTO_BOND_RADIUS=60 (would have only made the primary target
    // a candidate under S9 P2) but within MERGE_REACH_RADIUS=100 → all
    // three are valid merge candidates after S13 P1. controls.ts is the
    // caller that filters by MERGE_REACH_RADIUS; this test exercises the
    // world.ts merge sweep with the wider candidate set it now receives.
    const world = makeWorld(0);
    const hubPos = { x: 500, y: 500 };
    const sA = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 410, y: 500 }, targetId: null }); // 90 px west
    const sB = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 590, y: 500 }, targetId: null }); // 90 px east
    const sC = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 500, y: 410 }, targetId: null }); // 90 px north

    expect(world.primitives.get(sA)!.bonds.size).toBe(0);
    expect(world.primitives.get(sB)!.bonds.size).toBe(0);
    expect(world.primitives.get(sC)!.bonds.size).toBe(0);

    const hub = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: hubPos,
      targetId: sA,
      mergeCandidateIds: [sA, sB, sC],
    });

    expect(world.primitives.get(hub)!.bonds.size).toBe(3);

    const comp = componentOf(world.primitives.get(sA)!, world.primitives, world.bonds);
    expect(comp.primitiveIds.size).toBe(4);
    expect(comp.primitiveIds.has(sB)).toBe(true);
    expect(comp.primitiveIds.has(sC)).toBe(true);
    expect(comp.primitiveIds.has(hub)).toBe(true);
  });

  it('nearest-pick per component: merge bond endpoint is the closest cand prim in the component', () => {
    // Build a 3-prim chain (one component) with prims at distinct distances
    // from a hub placement. With S13 P1 explicit Map<rootId, {cand, distSq}>
    // grouping, the single merge bond formed should connect to the prim
    // closest to the hub, regardless of mergeCandidateIds iteration order.
    const world = makeWorld(0);
    const c0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 450, y: 500 }, targetId: null });
    const c1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 480, y: 500 }, targetId: c0 });
    const c2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 510, y: 500 }, targetId: c1 });
    // Hub at (530, 580): dist to c0 = sqrt(80²+80²)≈113 (out of range),
    // dist to c1 = sqrt(50²+80²)≈94 (in range), dist to c2 = sqrt(20²+80²)≈82
    // (closest, in range). Use a candidate list that puts c1 first; the
    // explicit map should still pick c2 (the nearest) as the bond endpoint.
    const hub = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 530, y: 580 },
      targetId: null,
      mergeCandidateIds: [c1, c2],
    });

    expect(world.primitives.get(hub)!.bonds.size).toBe(1);
    const hubBondId = [...world.primitives.get(hub)!.bonds][0];
    const hubBond = world.bonds.get(hubBondId)!;
    const otherId = hubBond.aId === hub ? hubBond.bId : hubBond.aId;
    expect(otherId).toBe(c2); // nearest to (530, 580)
  });

  it('separate components within merge reach each get exactly one bond (nearest cand per component)', () => {
    // Two distinct components, each with multiple prims within range.
    // Verify each component gets a single merge bond to its closest prim.
    const world = makeWorld(0);
    // Component α: 2 prims.
    const a0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 410, y: 500 }, targetId: null });
    const a1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 430, y: 500 }, targetId: a0 }); // closer to (500, 500)
    // Component β: 2 prims.
    const b0 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 590, y: 500 }, targetId: null });
    const b1 = placeAt(world, { sparkRawId: 4, type: SparkType.Dot, pos: { x: 570, y: 500 }, targetId: b0 }); // closer to (500, 500)

    const hub = placeAt(world, {
      sparkRawId: 5,
      type: SparkType.Dot,
      pos: { x: 500, y: 500 },
      targetId: null,
      mergeCandidateIds: [a0, a1, b0, b1],
    });

    // Hub should have exactly 2 bonds: one per component.
    expect(world.primitives.get(hub)!.bonds.size).toBe(2);
    // The bond into α should connect to a1 (nearest, 70 px) not a0 (90 px).
    // The bond into β should connect to b1 (nearest, 70 px) not b0 (90 px).
    const hubBondIds = [...world.primitives.get(hub)!.bonds];
    const otherIds = hubBondIds.map((id) => {
      const bond = world.bonds.get(id)!;
      return bond.aId === hub ? bond.bId : bond.aId;
    });
    expect(otherIds.sort()).toEqual([a1, b1].sort());
  });
});

describe('S138 P2 — the STRUCTURE_GROW outward impulse is DELETED (owner playtest)', () => {
  // ⛔ THESE TESTS WERE INVERTED, NOT DELETED. Until S138 P2 this block asserted that every
  // primitive in the primary's pre-existing component got shoved OUTWARD from the component
  // centroid by STRUCTURE_GROW_IMPULSE (0.8 px) on each placement. The owner played the live build
  // and reported it verbatim as "each primitive pushes another primitive away as anti-magnetism.
  // get rid of it" — so the behaviour these tests locked is now a DEFECT, and they lock its absence
  // instead. The constant is gone from constants.ts.
  //
  // The VISUAL half is deliberately retained (the STRUCTURE_GROW effect still emits under
  // cinematicsEnabled) and MERGE_IMPULSE — the opposite sign, INWARD, cross-structure merges only —
  // is untouched. The last test here is what proves that split really happened.

  it('placing into a 1-prim structure does NOT move the existing prim (was: pushed outward)', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    expect(aPrim.prevPos.x).toBeCloseTo(200, 1);

    placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 300, y: 200 }, targetId: a });

    // prevPos === pos ⇒ ZERO implied verlet velocity. Previously this was 200.8, i.e. a 0.8 px/tick
    // outward velocity injected into an already-placed shape.
    expect(aPrim.prevPos.x).toBeCloseTo(aPrim.pos.x, 6);
    expect(aPrim.prevPos.y).toBeCloseTo(aPrim.pos.y, 6);
  });

  it('a 3-prim chain is completely undisturbed by a 4th placement', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });
    const c = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 240, y: 200 }, targetId: b });
    const aPrim = world.primitives.get(a)!;
    const bPrim = world.primitives.get(b)!;
    const cPrim = world.primitives.get(c)!;
    const before = [aPrim.prevPos.x, bPrim.prevPos.x, cPrim.prevPos.x];

    placeAt(world, { sparkRawId: 4, type: SparkType.Dot, pos: { x: 260, y: 200 }, targetId: c });

    // Not one of the three moved. Previously: +0.8 / +0.8 / -0.8.
    expect(aPrim.prevPos.x - before[0]).toBeCloseTo(0, 6);
    expect(bPrim.prevPos.x - before[1]).toBeCloseTo(0, 6);
    expect(cPrim.prevPos.x - before[2]).toBeCloseTo(0, 6);
  });

  it('an anchor placement still lands at rest (prevPos === pos)', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    expect(aPrim.prevPos.x).toBeCloseTo(200, 6);
    expect(aPrim.prevPos.y).toBeCloseTo(200, 6);
  });

  it('the STRUCTURE_GROW VISUAL is KEPT and still gated on cinematicsEnabled', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });

    // ON (default) → the flash still emits. Removing the shove must not have removed the effect.
    let before = world.effects.length;
    placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 300, y: 200 }, targetId: a });
    expect(
      world.effects.slice(before).filter((e) => e.kind === 'STRUCTURE_GROW').length,
    ).toBe(1);

    // OFF → still suppressed.
    world.cinematicsEnabled = false;
    before = world.effects.length;
    placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 340, y: 200 }, targetId: a });
    expect(
      world.effects.slice(before).filter((e) => e.kind === 'STRUCTURE_GROW').length,
    ).toBe(0);
  });

  it('⭐ only the OUTWARD half went: MERGE_IMPULSE (inward) still fires on a cross-structure merge', () => {
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 300, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    const bPrim = world.primitives.get(b)!;
    expect(bPrim.prevPos.x).toBeCloseTo(300, 1);

    placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 250, y: 200 },
      targetId: a,
      mergeCandidateIds: [a, b],
    });

    // b is in the CAND component → the INWARD merge impulse is unchanged and must still be there.
    expect(bPrim.prevPos.x - 300).toBeCloseTo(MERGE_IMPULSE_MAGNITUDE, 2);
    // a is in the primary's pre-existing component → previously 200.8 from the outward puff, now
    // exactly at rest. This assertion is the whole point: the two impulses were separate mechanisms
    // and only the outward one was removed.
    expect(aPrim.prevPos.x).toBeCloseTo(aPrim.pos.x, 6);
  });
});

describe('S13 P4 / S76 — SCORE_TIER pulse fires at the leader avatar as income crosses a tier', () => {
  // S13 P4 tagged the tier pulse at the new prim's position. S76 moved emission from placement
  // to tickScoring (scoreProgress climbs via income), so the crossing has no single placement
  // position — the pulse is tagged at the LEADING player's avatar instead.
  it('SCORE_TIER carries pos = the leading player avatar position', () => {
    const world = makeWorld(0);
    const p1 = world.players.get(P1_ID)!;
    p1.avatarPos.x = 333;
    p1.avatarPos.y = 444;
    // All-magic Line→Line chain (complexity 13) so income crosses tier 1 in bounded ticks.
    let prev = placeAt(world, { sparkRawId: 0, type: SparkType.Line, pos: { x: 250, y: 250 }, targetId: null });
    for (let i = 1; i <= 4; i++) {
      prev = placeAt(world, { sparkRawId: i, type: SparkType.Line, pos: { x: 250 + i * 18, y: 250 }, targetId: prev });
    }
    let tierEvent: { pos: { x: number; y: number }; tier: number } | null = null;
    for (let t = 0; t < 120000 && world.scoreProgress < SCORE_TIER_STEP; t++) {
      const before = world.effects.length;
      tickScoring(world);
      for (const e of world.effects.slice(before)) {
        if (e.kind === 'SCORE_TIER') tierEvent = { pos: { x: e.pos.x, y: e.pos.y }, tier: e.tier };
      }
    }
    expect(world.scoreProgress).toBeGreaterThanOrEqual(SCORE_TIER_STEP);
    expect(tierEvent).not.toBeNull();
    expect(tierEvent!.tier).toBe(1);
    expect(tierEvent!.pos.x).toBe(333);
    expect(tierEvent!.pos.y).toBe(444);
  });

  it('one SCORE_TIER per band crossed (tier 1 then 2), each tagged at the leader avatar', () => {
    const world = makeWorld(0);
    const p1 = world.players.get(P1_ID)!;
    p1.avatarPos.x = 700;
    p1.avatarPos.y = 510;
    let prev = placeAt(world, { sparkRawId: 1, type: SparkType.Line, pos: { x: 250, y: 250 }, targetId: null });
    for (let i = 2; i <= 5; i++) {
      prev = placeAt(world, { sparkRawId: i, type: SparkType.Line, pos: { x: 250 + i * 18, y: 250 }, targetId: prev });
    }
    const tiers: number[] = [];
    for (let t = 0; t < 120000 && world.scoreProgress < 2 * SCORE_TIER_STEP; t++) {
      const before = world.effects.length;
      tickScoring(world);
      for (const e of world.effects.slice(before)) {
        if (e.kind === 'SCORE_TIER') {
          tiers.push(e.tier);
          expect(e.pos.x).toBe(700);
          expect(e.pos.y).toBe(510);
        }
      }
    }
    expect(tiers).toEqual([1, 2]);
  });
});

describe('S13 P3 — MERGE_IMPULSE bump + short-bond clamp', () => {
  it('MERGE_IMPULSE_MAGNITUDE constant is 3.0 (S13 P3 bump)', () => {
    expect(MERGE_IMPULSE_MAGNITUDE).toBe(3.0);
  });

  it('MIN_BOND_LENGTH_FOR_IMPULSE constant is 25 px', () => {
    expect(MIN_BOND_LENGTH_FOR_IMPULSE).toBe(25);
  });

  it('full impulse magnitude when merge bond rest_length >= MIN_BOND_LENGTH_FOR_IMPULSE (no clamp)', () => {
    // b at 40 px from hub → merge bond rest_length=40 → scale=1.0 → effective
    // impulse = 3.0 px (full MERGE_IMPULSE_MAGNITUDE).
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 400, y: 500 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 540, y: 500 }, targetId: null }); // 40 from (500,500)
    const bPrim = world.primitives.get(b)!;
    expect(bPrim.prevPos.x).toBeCloseTo(540, 1);

    placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 500 },
      targetId: a,
      mergeCandidateIds: [a, b],
    });

    // prevPos shifted AWAY from hub by full MERGE_IMPULSE_MAGNITUDE.
    const shift = bPrim.prevPos.x - 540;
    expect(shift).toBeCloseTo(MERGE_IMPULSE_MAGNITUDE, 2);
  });

  it('short-bond clamp scales impulse when merge bond rest_length < MIN_BOND_LENGTH_FOR_IMPULSE', () => {
    // b at 10 px from hub → merge bond rest_length=10 → scale=10/25=0.4 →
    // effective impulse = 3.0 × 0.4 = 1.2 px. Prevents the impulse from
    // exceeding the bond length (which would teleport cand through hub).
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 400, y: 500 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 510, y: 500 }, targetId: null }); // 10 from (500,500)
    const bPrim = world.primitives.get(b)!;

    placeAt(world, {
      sparkRawId: 3,
      type: SparkType.Dot,
      pos: { x: 500, y: 500 },
      targetId: a,
      mergeCandidateIds: [a, b],
    });

    const scale = 10 / MIN_BOND_LENGTH_FOR_IMPULSE;
    const expectedImpulse = MERGE_IMPULSE_MAGNITUDE * scale;
    const shift = bPrim.prevPos.x - 510;
    expect(shift).toBeCloseTo(expectedImpulse, 2);
    // Sanity: effective impulse < bond rest_length → cand cannot teleport
    // through hub on the first substep.
    expect(expectedImpulse).toBeLessThan(10);
  });
});
