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
  SparkType,
  STRUCTURE_GROW_IMPULSE,
} from '../constants.ts';
import { makeFreeSpark } from './spark.ts';
import { componentOf } from './structure.ts';
import { dispatch, makeWorld } from '../state/world.ts';
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
  dispatch(world, { type: 'PICKUP_SPARK', sparkId, playerId: P1_ID });
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

describe('S13 P2 — STRUCTURE_GROW outward impulse on primary pre-existing component', () => {
  it('STRUCTURE_GROW_IMPULSE constant is 0.8 px', () => {
    expect(STRUCTURE_GROW_IMPULSE).toBe(0.8);
  });

  it('2-prim primary (single anchor) + new prim: anchor pushed outward from centroid', () => {
    // Anchor at (200, 200). New prim placed at (300, 200) with primary
    // bond into anchor. Centroid of {anchor, new prim} = (250, 200).
    // Anchor outward direction: (200 - 250, 0) / 50 = (-1, 0). New
    // prevPos.x = pos.x - (-1 × 0.8) = 200 - (-0.8) = wait... prevPos -=
    // (-1) × 0.8 means prevPos.x -= -0.8, i.e., prevPos.x = 200 + 0.8 =
    // 200.8. Velocity = pos - prevPos = 200 - 200.8 = -0.8 (away from
    // centroid at x=250, in -x direction). ✓ outward.
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    expect(aPrim.prevPos.x).toBeCloseTo(200, 1);

    placeAt(world, {
      sparkRawId: 2,
      type: SparkType.Dot,
      pos: { x: 300, y: 200 },
      targetId: a,
    });

    // Anchor's prevPos shifted away from centroid (250, 200) by full
    // STRUCTURE_GROW_IMPULSE.
    expect(aPrim.prevPos.x).toBeCloseTo(200 + STRUCTURE_GROW_IMPULSE, 3);
    // Velocity = pos - prevPos points outward (toward -x, away from centroid).
    expect(aPrim.pos.x - aPrim.prevPos.x).toBeCloseTo(-STRUCTURE_GROW_IMPULSE, 3);
  });

  it('3-prim chain primary: each pre-existing prim pushed outward from full-component centroid', () => {
    // Chain: a(200,200) — b(220,200) — c(240,200). New prim at (260,200)
    // with primary bond into c. Post-bond component = {a,b,c,new}.
    // Centroid = (200+220+240+260)/4 = 230, y=200. Outward directions:
    //   a: (200-230, 0)/30 = (-1, 0)  → prevPos.x += 0.8 → vel=-0.8 (left)
    //   b: (220-230, 0)/10 = (-1, 0)  → prevPos.x += 0.8 → vel=-0.8 (left)
    //   c: (240-230, 0)/10 = (+1, 0)  → prevPos.x -= 0.8 → vel=+0.8 (right)
    //   new prim: NOT in primaryPreExistingPrims → no impulse.
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });
    const c = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 240, y: 200 }, targetId: b });
    const aPrim = world.primitives.get(a)!;
    const bPrim = world.primitives.get(b)!;
    const cPrim = world.primitives.get(c)!;
    // Pre-placement: each prim's prevPos already shifted by prior placements'
    // P2 impulses. Snapshot baseline before the new placement.
    const aPrev = aPrim.prevPos.x;
    const bPrev = bPrim.prevPos.x;
    const cPrev = cPrim.prevPos.x;

    const newP = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Dot,
      pos: { x: 260, y: 200 },
      targetId: c,
    });

    // Centroid for THIS placement = (200+220+240+260)/4 = 230.
    // Outward from centroid:
    //   a at x=200: dx=-30, unit_outward=(-1,0). delta prevPos = -(-1)*0.8 = +0.8.
    //   b at x=220: dx=-10, unit_outward=(-1,0). delta prevPos = +0.8.
    //   c at x=240: dx=+10, unit_outward=(+1,0). delta prevPos = -0.8.
    expect(aPrim.prevPos.x - aPrev).toBeCloseTo(+STRUCTURE_GROW_IMPULSE, 3);
    expect(bPrim.prevPos.x - bPrev).toBeCloseTo(+STRUCTURE_GROW_IMPULSE, 3);
    expect(cPrim.prevPos.x - cPrev).toBeCloseTo(-STRUCTURE_GROW_IMPULSE, 3);

    // New prim itself NOT impulsed (excluded from primaryPreExistingPrims).
    const newPrim = world.primitives.get(newP)!;
    expect(newPrim.prevPos.x).toBeCloseTo(newPrim.pos.x, 3);
    expect(newPrim.prevPos.y).toBeCloseTo(newPrim.pos.y, 3);
  });

  it('anchor placement (no primary target): no STRUCTURE_GROW impulse — primary structure empty', () => {
    // Sole anchor placement has no pre-existing structure to grow.
    // primaryPreExistingPrims is empty; the impulse block is skipped.
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    // Anchor placement: prevPos == pos (no impulse applied).
    expect(aPrim.prevPos.x).toBeCloseTo(200, 3);
    expect(aPrim.prevPos.y).toBeCloseTo(200, 3);
  });

  it('cinematicsEnabled=false suppresses STRUCTURE_GROW outward impulse (paired with visual gate)', () => {
    // Both halves disappear together — cleaner mental model for the
    // C-keybind debug toggle than MERGE_IMPULSE's unconditional pattern.
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const aPrim = world.primitives.get(a)!;
    expect(aPrim.prevPos.x).toBeCloseTo(200, 1);

    world.cinematicsEnabled = false;
    // Snapshot effects length before the second placement so we only
    // check effects emitted under cinematicsEnabled=false (the first
    // anchor placement above ran with cinematicsEnabled=true default).
    const effectsBefore = world.effects.length;
    placeAt(world, {
      sparkRawId: 2,
      type: SparkType.Dot,
      pos: { x: 300, y: 200 },
      targetId: a,
    });

    // Anchor's prevPos unchanged — no P2 outward impulse fired.
    expect(aPrim.prevPos.x).toBeCloseTo(200, 3);
    // No STRUCTURE_GROW effect emitted FROM THIS PLACEMENT.
    const newEffects = world.effects.slice(effectsBefore);
    expect(newEffects.filter((e) => e.kind === 'STRUCTURE_GROW').length).toBe(0);
  });

  it('cand-component prims (in merge sweep) do NOT receive STRUCTURE_GROW outward impulse — only inward MERGE_IMPULSE', () => {
    // Two single-prim anchors. Bridge with primary into a, merge into b.
    // a is in primary's pre-existing component → P2 outward impulse.
    // b is in cand component → P3 inward impulse only, NOT P2 outward.
    // This is the visual signature split: existing puffs out, absorbed
    // snaps in.
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

    // b is in cand component → ONLY P3 inward impulse. Expected shift =
    // +MERGE_IMPULSE_MAGNITUDE (away from bridge at x=250; impulse axis
    // is +x → prevPos.x += MAG → velocity points -x, inward toward bridge).
    // NO P2 outward impulse (b not in primary's pre-existing component).
    expect(bPrim.prevPos.x - 300).toBeCloseTo(MERGE_IMPULSE_MAGNITUDE, 2);

    // a is in primary's pre-existing component → P2 outward impulse only.
    // Centroid of primary post-bond {a, bridge} = (200+250)/2 = 225.
    // a's outward direction: (200-225)/25 = (-1, 0). prevPos.x +=
    // STRUCTURE_GROW_IMPULSE. Expected: 200 + 0.8 = 200.8.
    expect(aPrim.prevPos.x).toBeCloseTo(200 + STRUCTURE_GROW_IMPULSE, 3);
  });
});

describe('S13 P4 — SCORE_TIER center pulse at placement position', () => {
  it('SCORE_TIER effect now carries pos field equal to new prim position', () => {
    // S13 P4 moves the visual from a fixed HUD corner to the placement
    // cursor. emit-site captures prim.pos so the renderer draws there
    // (drawScoreTier reads effect.pos directly).
    const world = makeWorld(0);
    // Pre-bake scoreProgress to just below tier 1 (15) so a single
    // magic bond crosses it.
    world.scoreProgress = 14;
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Line, pos: { x: 250, y: 250 }, targetId: null });
    // Reset scoreProgress to 14 (anchor placements added to it).
    world.scoreProgress = 14;

    const effectsBefore = world.effects.length;
    const newPrim = placeAt(world, {
      sparkRawId: 2,
      type: SparkType.Dot,
      pos: { x: 270, y: 250 }, // Line→Dot direction is carried→target: Dot→Line = Filament magic, +3 → crosses 15.
      targetId: a,
    });
    // Score must have crossed tier 1 boundary.
    expect(world.scoreProgress).toBeGreaterThanOrEqual(15);

    const tierEvents = world.effects.slice(effectsBefore).filter((e) => e.kind === 'SCORE_TIER');
    expect(tierEvents.length).toBe(1);
    if (tierEvents[0].kind !== 'SCORE_TIER') throw new Error('typeguard');
    const newPrimPos = world.primitives.get(newPrim)!.pos;
    expect(tierEvents[0].pos.x).toBe(newPrimPos.x);
    expect(tierEvents[0].pos.y).toBe(newPrimPos.y);
  });

  it('multi-tier crossing fires one SCORE_TIER per band, all pos-tagged at the same new prim', () => {
    // Force scoreProgress to 14 then trigger a multi-bond merge that
    // pushes past 30 (crosses both 15 and 30 boundaries).
    const world = makeWorld(0);
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Line, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Line, pos: { x: 290, y: 200 }, targetId: null });
    const c = placeAt(world, { sparkRawId: 3, type: SparkType.Line, pos: { x: 245, y: 290 }, targetId: null });
    // 3 anchors × SCORE_ANCHOR(1) = 3. Reset to 14 to set up tier crossing.
    world.scoreProgress = 14;

    const effectsBefore = world.effects.length;
    const hub = placeAt(world, {
      sparkRawId: 4,
      type: SparkType.Line,
      pos: { x: 245, y: 200 },
      targetId: a,
      mergeCandidateIds: [a, b, c],
    });
    // Primary Line→Line = Cable (magic, +3) → 17. + 2 magic merges × 3 = +6 → 23.
    // Crossed 15 once. (Not 30 — would need 16 delta; we only get 9 here.)
    const tierEvents = world.effects.slice(effectsBefore).filter((e) => e.kind === 'SCORE_TIER');
    expect(tierEvents.length).toBe(1);
    if (tierEvents[0].kind !== 'SCORE_TIER') throw new Error('typeguard');
    const hubPos = world.primitives.get(hub)!.pos;
    expect(tierEvents[0].pos.x).toBe(hubPos.x);
    expect(tierEvents[0].pos.y).toBe(hubPos.y);
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
