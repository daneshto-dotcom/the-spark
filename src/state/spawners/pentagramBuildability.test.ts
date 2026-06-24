/**
 * SPARK — REAL pentagram BUILDABILITY integration test (verification task).
 *
 * Question under test: can a player ACTUALLY build a pentagram that ignites a
 * creature-spawner, through the REAL placement + auto-bond pipeline — NOT the
 * synthetic hand-built bonds the existing spawnerLifecycle.test.ts / voltkin.test.ts
 * use?
 *
 * The pentagram predicate (godlyRecipes/pentagram.ts:isPentagramComponent) requires
 * a connected component that is EXACTLY 5 Triangles, EACH with bond-degree EXACTLY 2,
 * forming one closed 5-cycle, no other primitives, every bond endpoint inside the
 * component. Degree-EXACTLY-2 is the load-bearing constraint.
 *
 * The real placement path (controls.ts onUp → PLACE_FROM_FREE → applyPlaceFromFree →
 * placePrimitive) can mint MORE than one bond per placement:
 *   - primary bond: nearest same-color prim within AUTO_BOND_RADIUS=60
 *   - MERGE sweep: one bond per OTHER connected component within MERGE_REACH_RADIUS=100
 *     (deduped by component; skips components already merged via the primary)
 *   - REDUNDANCY bonds (extraBondTargetIds): extra bonds to OTHER prims inside the
 *     primary's component, within AUTO_BOND_RADIUS=60, angularly spread.
 *
 * This test replicates the controls.ts picker logic FAITHFULLY (the pickers
 * pickPrimitiveInRange / allPrimitivesInRange / redundantBondTargetsInSameComponent
 * are PRIVATE methods of the Controls class — they cannot be imported, so they are
 * mirrored here precisely with comments mapping each to its source. The pure
 * redundancy geometry IS imported (pickRedundantBondTargets) exactly as the real
 * wrapper calls it). Then it dispatches real PLACE_FROM_FREE actions, one per
 * triangle, and asks whether findAllPentagramAnchors detects a pentagram and
 * whether runGodlyMatcher's runSpawnerIgnition (via a BOND_FORMED effect) registers
 * a spawner in world.creatureSpawners.
 *
 * Solo mode (gameMode:'solo') ⇒ isNetworked === false ⇒ placePrimitive /
 * applyPlaceFromFree take the LOCAL-origin branch: the action's own
 * targetPrimitiveId / mergeCandidateIds / extraBondTargetIds are used verbatim
 * (no host re-pick). So replicating the controls.ts picker == replicating the
 * exact bond set a real solo click produces.
 *
 * ─── GEOMETRY ───────────────────────────────────────────────────────────────
 * Regular pentagon, circumradius R. side = 2·R·sin(36°) ≈ 1.17557·R.
 * diagonal = side·φ where φ = 1.61803 (golden ratio).
 * We want adjacent vertices < 60 (auto-bond) and diagonals > 60 (no auto-bond
 * between non-adjacent vertices). Multiple R values are tried below; for each the
 * realized side/diagonal are computed and asserted into the documented bands.
 */

import { describe, it, expect } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import {
  AUTO_BOND_RADIUS,
  MERGE_REACH_RADIUS,
  REDUNDANT_BOND_ANGLE_EPSILON,
  REDUNDANT_BOND_K,
  REDUNDANT_BOND_MAX_CANDIDATES,
  REDUNDANT_BOND_MIN_ANGLE_RAD,
  SparkType,
  PLAYER_COLORS,
} from '../../constants.ts';
import { componentOf } from '../../game/structure.ts';
import { lookupCombo } from '../../combos.ts';
import { pickRedundantBondTargets } from '../../input/redundantBondTargets.ts';
import { findAllPentagramAnchors } from '../godlyRecipes/pentagram.ts';
import { computeStiffnessTier } from '../../input/controls.ts';
import { asPlayerId, asSparkId, type PrimitiveId, type Vec2 } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';

const P0 = asPlayerId(0);
const P0_COLOR = PLAYER_COLORS[0];

// Place WELL outside the spawner no-build zone (center 960,540, radius 250). Our
// pentagons live near (200,200) — far from the zone, far from canvas edges.

// ─── MIRROR of controls.ts pickers (private methods — mirrored, not imported) ──

/**
 * Mirror of Controls.pickPrimitiveInRange (controls.ts:748). Nearest same-color
 * primitive within `radius` of `center`. Returns id or null.
 */
function pickPrimitiveInRange(
  world: World,
  radius: number,
  center: Vec2,
  myColor: number,
): PrimitiveId | null {
  let best: Primitive | null = null;
  let bestDistSq = radius * radius;
  for (const p of world.primitives.values()) {
    if (p.placerColor !== myColor) continue;
    const dx = p.pos.x - center.x;
    const dy = p.pos.y - center.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      best = p;
      bestDistSq = d2;
    }
  }
  return best?.id ?? null;
}

/**
 * Mirror of Controls.allPrimitivesInRange (controls.ts:777). Every same-color
 * primitive within `radius` of `center` (the merge-candidate sweep input).
 */
function allPrimitivesInRange(
  world: World,
  radius: number,
  center: Vec2,
  myColor: number,
): PrimitiveId[] {
  const r2 = radius * radius;
  const ids: PrimitiveId[] = [];
  for (const p of world.primitives.values()) {
    if (p.placerColor !== myColor) continue;
    const dx = p.pos.x - center.x;
    const dy = p.pos.y - center.y;
    if (dx * dx + dy * dy <= r2) ids.push(p.id);
  }
  return ids;
}

/**
 * Mirror of Controls.redundantBondTargetsInSameComponent (controls.ts:797) — thin
 * wrapper that builds the primary's component set and delegates to the IMPORTED
 * pure pickRedundantBondTargets with the EXACT same tunables the real wrapper uses.
 */
function redundantBondTargetsInSameComponent(
  world: World,
  primary: Primitive,
  newPrimPos: Vec2,
): PrimitiveId[] {
  if (REDUNDANT_BOND_K <= 1) return [];
  const comp = componentOf(primary, world.primitives, world.bonds);
  if (comp.primitiveIds.size <= 1) return [];
  return pickRedundantBondTargets({
    primary: { id: primary.id, pos: primary.pos },
    componentIds: comp.primitiveIds,
    primitives: world.primitives,
    newPrimPos,
    radius: AUTO_BOND_RADIUS,
    k: REDUNDANT_BOND_K,
    minAngleRad: REDUNDANT_BOND_MIN_ANGLE_RAD,
    angleEpsilon: REDUNDANT_BOND_ANGLE_EPSILON,
    maxCandidates: REDUNDANT_BOND_MAX_CANDIDATES,
  });
}

/**
 * Replicate ONE real player LMB-up that drops a Triangle spark at `pos` and
 * dispatches PLACE_FROM_FREE with target/merge/extra fields EXACTLY as the
 * controls.ts onUp path computes them. Solo mode ⇒ targetRefPos = placementPos
 * (controls.ts:456 isClient=false → spark.pos, which applyPlaceFromFree snaps to
 * placementPos). Returns the bond ids minted by this placement (for diagnostics).
 */
let nextSparkNum = 1000;
function placeTriangleLikeAPlayer(world: World, pos: Vec2): void {
  // A fresh Free spark at the placement point (player has dragged it here).
  const spark = makeFreeSpark({
    id: asSparkId(nextSparkNum++),
    type: SparkType.Triangle,
    pos: { x: pos.x, y: pos.y },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark });

  // controls.ts onUp (solo): targetRefPos === placementPos.
  const targetId = pickPrimitiveInRange(world, AUTO_BOND_RADIUS, pos, P0_COLOR);
  const target = targetId !== null ? world.primitives.get(targetId) ?? null : null;
  const tier = computeStiffnessTier(SparkType.Triangle, target);
  const mergeCandidateIds = allPrimitivesInRange(world, MERGE_REACH_RADIUS, pos, P0_COLOR);
  const extraBondTargetIds: PrimitiveId[] =
    target !== null ? redundantBondTargetsInSameComponent(world, target, pos) : [];

  dispatch(world, {
    type: 'PLACE_FROM_FREE',
    sparkId: spark.id,
    playerId: P0,
    placementPos: { x: pos.x, y: pos.y },
    stiffnessTier: tier,
    targetPrimitiveId: target?.id ?? null,
    mergeCandidateIds,
    extraBondTargetIds,
  });
  // touch lookupCombo so an unused-import lint can't hide a real dependency drift
  void lookupCombo;
}

/** Same as placeTriangleLikeAPlayer but returns how many bonds THIS placement minted
 * and the resulting degree of the new prim — for per-step tracing. */
function placeTriangleTraced(world: World, pos: Vec2): { mintedBonds: number; targetWasNull: boolean; extraCount: number; mergeCandCount: number } {
  const before = world.bonds.size;
  const spark = makeFreeSpark({
    id: asSparkId(nextSparkNum++),
    type: SparkType.Triangle,
    pos: { x: pos.x, y: pos.y },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: world.tick,
  });
  dispatch(world, { type: 'SPAWN_SPARK', spark });
  const targetId = pickPrimitiveInRange(world, AUTO_BOND_RADIUS, pos, P0_COLOR);
  const target = targetId !== null ? world.primitives.get(targetId) ?? null : null;
  const tier = computeStiffnessTier(SparkType.Triangle, target);
  const mergeCandidateIds = allPrimitivesInRange(world, MERGE_REACH_RADIUS, pos, P0_COLOR);
  const extraBondTargetIds: PrimitiveId[] =
    target !== null ? redundantBondTargetsInSameComponent(world, target, pos) : [];
  dispatch(world, {
    type: 'PLACE_FROM_FREE',
    sparkId: spark.id,
    playerId: P0,
    placementPos: { x: pos.x, y: pos.y },
    stiffnessTier: tier,
    targetPrimitiveId: target?.id ?? null,
    mergeCandidateIds,
    extraBondTargetIds,
  });
  return {
    mintedBonds: world.bonds.size - before,
    targetWasNull: target === null,
    extraCount: extraBondTargetIds.length,
    mergeCandCount: mergeCandidateIds.length,
  };
}

/** Regular-pentagon vertex coordinates for circumradius R centered at (cx,cy). */
function pentagonVertices(cx: number, cy: number, R: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < 5; i++) {
    // Start at -90° (top) and step 72°. Order is the natural ring order, which is
    // exactly how a player would click around the perimeter.
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
    verts.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
  }
  return verts;
}

const PHI = (1 + Math.sqrt(5)) / 2;
function pentagonSide(R: number): number {
  return 2 * R * Math.sin(Math.PI / 5); // 36°
}

/** Build a pentagon at circumradius R by 5 real player placements in ring order. */
function buildPentagonRealPath(world: World, cx: number, cy: number, R: number): void {
  const verts = pentagonVertices(cx, cy, R);
  for (const v of verts) placeTriangleLikeAPlayer(world, v);
}

/** Run the host spawner-ignition path the way runGodlyMatcher does, given a
 * BOND_FORMED effect exists in world.effects (placePrimitive pushes one per
 * placement that formed >=1 bond). We invoke the same findAllPentagramAnchors +
 * REGISTER_SPAWNER dispatch sequence runSpawnerIgnition uses. */
function tryIgnite(world: World): void {
  // runSpawnerIgnition gates on a BOND_FORMED (or player BOND_SEVERED) being
  // present this frame. The placements above pushed BOND_FORMED effects. Mirror
  // the exact registration loop.
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;
  const anchors = findAllPentagramAnchors(world);
  for (const anchor of anchors) {
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: P0,
      anchorPrimitiveId: anchor,
      recipeId: 'pentagram',
    });
    return; // single ignition per frame
  }
}

/** Diagnostic: degree (bond count) of every triangle, and component size. */
function describeStructure(world: World): { sizes: number[]; degrees: number[] } {
  const degrees: number[] = [];
  for (const p of world.primitives.values()) degrees.push(p.bonds.size);
  // largest component size
  const seen = new Set<PrimitiveId>();
  const sizes: number[] = [];
  for (const p of world.primitives.values()) {
    if (seen.has(p.id)) continue;
    const comp = componentOf(p, world.primitives, world.bonds);
    for (const id of comp.primitiveIds) seen.add(id);
    sizes.push(comp.primitiveIds.size);
  }
  return { sizes, degrees };
}

describe('pentagram BUILDABILITY via the REAL placement pipeline', () => {
  it('documents side/diagonal bands for the candidate circumradii', () => {
    // R band exploration. AUTO_BOND_RADIUS=60, MERGE_REACH_RADIUS=100.
    // side = 1.17557·R ; diagonal = side·1.618.
    const rows = [40, 42.5, 45, 48, 51].map((R) => {
      const side = pentagonSide(R);
      const diag = side * PHI;
      return { R, side: +side.toFixed(2), diag: +diag.toFixed(2) };
    });
    // For the "adjacent auto-bonds, diagonal does NOT auto-bond" window we need
    // side < 60 < diag. Confirm at least one R satisfies it.
    const good = rows.filter((r) => r.side < AUTO_BOND_RADIUS && r.diag > AUTO_BOND_RADIUS);
    // eslint-disable-next-line no-console
    console.log('[buildability] side/diag bands:', JSON.stringify(rows), 'side<60<diag:', JSON.stringify(good));
    expect(good.length).toBeGreaterThan(0);
    // Also note: for ALL these R the diagonal is < MERGE_REACH_RADIUS=100, so the
    // merge sweep reaches non-adjacent vertices on every placement.
    const diagsUnderMerge = rows.filter((r) => r.diag < MERGE_REACH_RADIUS);
    console.log('[buildability] diagonals < MERGE_REACH_RADIUS=100 (merge sweep reaches them):',
      JSON.stringify(diagsUnderMerge));
  });

  it('builds a pentagon through real placements and reports whether it ignites (R=42.5, side≈50)', () => {
    const world = makeWorld(123);
    // solo + host (makeWorld defaults). gameMode 'solo' ⇒ NOT networked ⇒ local-origin.
    const R = 42.5;
    buildPentagonRealPath(world, 200, 200, R);

    const anchors = findAllPentagramAnchors(world);
    const { sizes, degrees } = describeStructure(world);
    const bondCount = world.bonds.size;
    console.log(`[buildability R=${R} side≈${pentagonSide(R).toFixed(1)}] prims=${world.primitives.size} bonds=${bondCount} compSizes=${JSON.stringify(sizes)} degrees=${JSON.stringify(degrees.sort())} anchors=${JSON.stringify(anchors)}`);

    tryIgnite(world);
    console.log(`[buildability R=${R}] creatureSpawners after ignite attempt: ${world.creatureSpawners.size}`);

    // This is the TRUTH-REPORTING assertion: record actual behavior. We assert the
    // OBSERVED outcome so the test documents reality; if the build does NOT ignite
    // (extra merge/redundancy bonds break degree-2), this captures it.
    // (Expectation set after running — see file footer note.)
    expect({
      ignited: world.creatureSpawners.size > 0,
      anchorsDetected: anchors.length,
      bondCount,
      degrees: degrees.slice().sort(),
    }).toMatchSnapshot();
  });

  it('tries a SPREAD pentagon where diagonals exceed the merge reach (R=46, side≈54, diag≈87) — still < 100', () => {
    const world = makeWorld(7);
    const R = 46;
    buildPentagonRealPath(world, 200, 200, R);
    const anchors = findAllPentagramAnchors(world);
    const { sizes, degrees } = describeStructure(world);
    console.log(`[buildability R=${R} side≈${pentagonSide(R).toFixed(1)} diag≈${(pentagonSide(R)*PHI).toFixed(1)}] bonds=${world.bonds.size} compSizes=${JSON.stringify(sizes)} degrees=${JSON.stringify(degrees.slice().sort())} anchors=${JSON.stringify(anchors)}`);
    tryIgnite(world);
    console.log(`[buildability R=${R}] creatureSpawners: ${world.creatureSpawners.size}`);
    expect({ ignited: world.creatureSpawners.size > 0, anchors: anchors.length }).toMatchSnapshot();
  });

  it('TRACE: per-placement bond count around the ring (R=42.5) — shows WHY degree stays 2', () => {
    const world = makeWorld(99);
    const R = 42.5;
    const verts = pentagonVertices(200, 200, R);
    const trace = verts.map((v, i) => ({ i, ...placeTriangleTraced(world, v) }));
    console.log('[buildability TRACE R=42.5] per-placement:', JSON.stringify(trace, null, 0));
    // OBSERVED MECHANISM (this is the resolution of the degree-2 tension):
    //   placement 0 — anchor, 0 bonds (nothing in range yet).
    //   placements 1,2,3 — exactly 1 bond each (primary to the single adjacent
    //     vertex within AUTO_BOND_RADIUS=60). The MERGE sweep adds nothing: the
    //     growing chain is ONE component and the primary already pulled it in, so
    //     there is no OTHER component left to merge — even though non-adjacent
    //     vertices (diagonal ≈ 80.8 < MERGE_REACH_RADIUS=100) are in merge range.
    //     Redundancy adds nothing here: the new prim has only ONE same-component
    //     neighbour within AUTO_BOND_RADIUS=60 (its one chain end), and that IS
    //     the primary.
    //   placement 4 (the CLOSING triangle) — 2 bonds. Vertex 4 sits between
    //     vertex 3 AND vertex 0, BOTH within AUTO_BOND_RADIUS=60 and BOTH already
    //     in the open 0-1-2-3 chain (one component). Primary bonds to one;
    //     the REDUNDANCY picker (extraCount=1) adds the SECOND — which is exactly
    //     the closing edge of the 5-cycle. So redundancy here is CONSTRUCTIVE,
    //     not destructive: it completes the ring instead of breaking degree-2.
    expect(trace[0].mintedBonds).toBe(0);
    expect(trace[1].mintedBonds).toBe(1);
    expect(trace[2].mintedBonds).toBe(1);
    expect(trace[3].mintedBonds).toBe(1);
    expect(trace[4].mintedBonds).toBe(2); // primary + the closing redundancy edge
    expect(trace[4].extraCount).toBe(1); // the closing edge came from redundancy
    // Total = 5 (4 spokes/chain edges + the closing edge), all degree EXACTLY 2.
    expect(world.bonds.size).toBe(5);
    for (const p of world.primitives.values()) expect(p.bonds.size).toBe(2);
    const anchors = findAllPentagramAnchors(world);
    expect(anchors.length).toBe(1);
  });

  it('tries MULTIPLE circumradii through the real path; records which ignite', () => {
    const results: Array<{ R: number; side: number; diag: number; bonds: number; ignites: boolean }> = [];
    for (const R of [40, 42.5, 45, 48, 51]) {
      const world = makeWorld(1000 + Math.round(R * 10));
      buildPentagonRealPath(world, 200, 200, R);
      const anchors = findAllPentagramAnchors(world);
      results.push({
        R,
        side: +pentagonSide(R).toFixed(1),
        diag: +(pentagonSide(R) * PHI).toFixed(1),
        bonds: world.bonds.size,
        ignites: anchors.length === 1,
      });
    }
    console.log('[buildability MULTI-R]', JSON.stringify(results));
    // Document: which R values yield a clean ignitable pentagram through real play.
    const ignitable = results.filter((r) => r.ignites);
    expect(ignitable.length).toBeGreaterThan(0);
    expect(ignitable).toMatchSnapshot();
  });

  it('TIGHT pentagon (R=30, diagonal≈57 < 60) — diagonals ALSO auto-bond ⇒ degree>2 ⇒ does NOT ignite', () => {
    // The destructive case the predicate's degree-EXACTLY-2 guards against. At
    // R=30, side≈35.3 AND diagonal≈57.1, BOTH < AUTO_BOND_RADIUS=60. Now a new
    // triangle has up to TWO same-component neighbours within 60, so primary +
    // redundancy wire EXTRA chords ⇒ some triangles reach degree 3/4 ⇒ the
    // component is no longer a clean 5-cycle ⇒ predicate (correctly) rejects.
    const world = makeWorld(303);
    const R = 30;
    const side = pentagonSide(R);
    const diag = side * PHI;
    expect(side).toBeLessThan(AUTO_BOND_RADIUS);
    expect(diag).toBeLessThan(AUTO_BOND_RADIUS); // diagonal ALSO bonds — the trap
    buildPentagonRealPath(world, 200, 200, R);
    const { degrees } = describeStructure(world);
    const anchors = findAllPentagramAnchors(world);
    const maxDeg = Math.max(...degrees);
    console.log(`[buildability TIGHT R=30 side≈${side.toFixed(1)} diag≈${diag.toFixed(1)}] bonds=${world.bonds.size} degrees=${JSON.stringify(degrees.slice().sort())} maxDegree=${maxDeg} anchors=${JSON.stringify(anchors)} ignites=${anchors.length === 1}`);
    // Document reality: a too-tight pentagon over-bonds and does NOT ignite. The
    // player must space adjacent vertices < 60 but keep diagonals > 60
    // (circumradius ≈ 32–51 ⇒ side ≈ 38–60, diagonal ≈ 61–97).
    expect(maxDeg).toBeGreaterThan(2);
    expect(anchors.length).toBe(0);
  });

  it('SANITY: a hand-built clean 5-cycle (no merge/redundancy bonds) DOES ignite', () => {
    // Proves the predicate + ignition wiring works when degree-2 is exact — so any
    // failure of the real-path tests above is the PLACEMENT pipeline, not the recipe.
    const world = makeWorld(1);
    // Build 5 triangles with EXACTLY the ring bonds, bypassing the auto-bond sweep:
    // place each FAR apart (anchor, no bond), then we manually wire a clean ring.
    for (let i = 0; i < 5; i++) {
      placeTriangleLikeAPlayer(world, { x: 200 + i * 300, y: 200 }); // 300px apart ⇒ no auto-bond
    }
    const ids = Array.from(world.primitives.keys()).sort((a, b) => a - b);
    expect(ids.length).toBe(5);
    expect(world.bonds.size).toBe(0); // confirm anchors only — no sweep bonds
    // Hand-wire a clean closed 5-cycle directly into world state.
    for (let i = 0; i < 5; i++) {
      const a = world.primitives.get(ids[i])!;
      const b = world.primitives.get(ids[(i + 1) % 5])!;
      const bondId = world.nextBondId++ as unknown as import('../../types.ts').BondId;
      const bond = {
        id: bondId,
        aId: a.id,
        bId: b.id,
        a,
        b,
        restLength: 50,
        stiffnessTier: 'MID' as const,
        createdTick: 0,
      };
      world.bonds.set(bondId, bond);
      a.bonds.add(bondId);
      b.bonds.add(bondId);
    }
    const anchors = findAllPentagramAnchors(world);
    expect(anchors.length).toBe(1);
    // Push a BOND_FORMED so runSpawnerIgnition's gate passes.
    world.effects.push({ kind: 'BOND_FORMED', tick: world.tick, pos: { x: 0, y: 0 }, bondCount: 1 });
    tryIgnite(world);
    expect(world.creatureSpawners.size).toBe(1);
  });
});
