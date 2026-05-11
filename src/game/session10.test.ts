/**
 * SPARK — Session 10 tests:
 *   - P1: AttractDrag position-lerp follow (replaces S5 impulse model).
 *   - P2: STRUCTURE_GROW outward pulse emission + BFS hop maps.
 *   - P3: STRUCTURE_MERGE emission + verlet impulse on candidate component.
 *   - P4: SCORE_TIER corner-pulse emission at every-15 boundary crossings.
 *   - P5: world.cinematicsEnabled gates STRUCTURE_* + SCORE_TIER, leaves
 *         BOND_COMMIT / SEVER_ERASE unconditional.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRACT_FOLLOW_RATE,
  PHYSICS_HZ,
  SparkType,
} from '../constants.ts';
import { stepAttractLerp } from '../input/controls.ts';
import { makeFreeSpark } from './spark.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import {
  asPlayerId,
  asSparkId,
  type PrimitiveId,
} from '../types.ts';

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

describe('S10 P1 — AttractDrag position-lerp follow', () => {
  it('one lerp step closes ATTRACT_FOLLOW_RATE × dist of the gap toward cursor', () => {
    const pos = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    const cursor = { x: 100, y: 0 };

    stepAttractLerp(pos, prevPos, cursor, ATTRACT_FOLLOW_RATE);

    // Per-step closure = rate × initial distance.
    expect(pos.x).toBeCloseTo(100 * ATTRACT_FOLLOW_RATE, 5);
    expect(pos.y).toBeCloseTo(0, 5);
  });

  it('prevPos restored to the pre-lerp pos (residual velocity = lerp delta, not impulse-accumulated)', () => {
    const pos = { x: 50, y: 50 };
    const prevPos = { x: 999, y: -999 }; // junk to confirm it gets overwritten
    const cursor = { x: 80, y: 80 };

    stepAttractLerp(pos, prevPos, cursor, 0.1);

    // prevPos should be the pos BEFORE the lerp, not the cursor and not the
    // old prevPos garbage. The verlet implication: instantaneous velocity =
    // (pos - prevPos) = 0.1 × (cursor - oldPos), bounded by the lerp rate
    // rather than free to accumulate.
    expect(prevPos.x).toBeCloseTo(50, 5);
    expect(prevPos.y).toBeCloseTo(50, 5);
    // And residual velocity in x = 53 - 50 = 3, which equals 0.1 × (80-50).
    expect(pos.x - prevPos.x).toBeCloseTo(0.1 * (80 - 50), 5);
  });

  it('4 successive lerp steps at static cursor close ~22% of original distance (geometric closure)', () => {
    // Math: (1 - r)^N residual after N steps. r=0.06, N=4 → 0.94^4 ≈ 0.7807.
    // Remaining = 0.7807 × original. Closed = 1 - 0.7807 ≈ 0.2193.
    // At cursor=(100,0) starting from (0,0): pos.x after 4 steps ≈ 21.93.
    const pos = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    const cursor = { x: 100, y: 0 };

    for (let i = 0; i < 4; i++) {
      stepAttractLerp(pos, prevPos, cursor, ATTRACT_FOLLOW_RATE);
    }

    const expected = 100 * (1 - Math.pow(1 - ATTRACT_FOLLOW_RATE, 4));
    expect(pos.x).toBeCloseTo(expected, 4);
    expect(pos.x).toBeGreaterThan(21);
    expect(pos.x).toBeLessThan(23);
  });

  it('does not overshoot — pos stays on the segment between original and cursor', () => {
    // Lerp by rate < 1 is non-overshooting by construction. Verify: 50 steps
    // of lerp toward a fixed cursor never exceed the cursor on either axis.
    const pos = { x: -20, y: 30 };
    const prevPos = { x: 0, y: 0 };
    const cursor = { x: 50, y: -10 };

    for (let i = 0; i < 50; i++) {
      stepAttractLerp(pos, prevPos, cursor, ATTRACT_FOLLOW_RATE);
      // pos.x must be in [-20, 50] (initial → cursor); pos.y in [-10, 30].
      expect(pos.x).toBeGreaterThanOrEqual(-20);
      expect(pos.x).toBeLessThanOrEqual(50);
      expect(pos.y).toBeGreaterThanOrEqual(-10);
      expect(pos.y).toBeLessThanOrEqual(30);
    }
    // Asymptotic: after 50 substeps at rate 0.06, residual = 0.94^50 ≈ 0.045.
    // Distance to cursor < 5% of initial separation.
    const dx = cursor.x - pos.x;
    const dy = cursor.y - pos.y;
    const initialDist = Math.hypot(50 - -20, -10 - 30); // ≈ 80.6
    expect(Math.hypot(dx, dy)).toBeLessThan(initialDist * 0.05);
  });

  // Sanity: keep an explicit reference to a known SparkType so the test file
  // doesn't accidentally drop the constants import in future trims.
  it('SparkType.Dot exists (sentinel import probe)', () => {
    expect(SparkType.Dot).toBe(0);
  });
});

describe('S10 P2 — STRUCTURE_GROW outward pulse emission', () => {
  it('single-anchor placement emits STRUCTURE_GROW with origin only (hop 0)', () => {
    const world = makeWorld(0);
    placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });

    const grow = world.effects.find((e) => e.kind === 'STRUCTURE_GROW');
    expect(grow).toBeDefined();
    if (grow?.kind !== 'STRUCTURE_GROW') throw new Error('typeguard');
    expect(grow.hopByPrimId.size).toBe(1);
    expect([...grow.hopByPrimId.values()][0]).toBe(0);
    expect(grow.hopByBondId.size).toBe(0);
    expect(grow.maxHop).toBe(0);
  });

  it('4-prim chain placement emits STRUCTURE_GROW spanning hops 0..3 with all bonds mapped', () => {
    const world = makeWorld(0);
    // Build chain: a (anchor) — b — c — d, each bonded to the prior.
    const a = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const b = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a });
    const c = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 240, y: 200 }, targetId: b });
    // Snapshot effects length to find the d placement's STRUCTURE_GROW.
    const effectsBefore = world.effects.length;
    const d = placeAt(world, { sparkRawId: 4, type: SparkType.Dot, pos: { x: 260, y: 200 }, targetId: c });

    const grow = world.effects.slice(effectsBefore).find((e) => e.kind === 'STRUCTURE_GROW');
    expect(grow).toBeDefined();
    if (grow?.kind !== 'STRUCTURE_GROW') throw new Error('typeguard');
    expect(grow.originPrimId).toBe(d);

    // hopByPrimId: d=0, c=1, b=2, a=3.
    expect(grow.hopByPrimId.size).toBe(4);
    expect(grow.hopByPrimId.get(d)).toBe(0);
    expect(grow.hopByPrimId.get(c)).toBe(1);
    expect(grow.hopByPrimId.get(b)).toBe(2);
    expect(grow.hopByPrimId.get(a)).toBe(3);
    expect(grow.maxHop).toBe(3);

    // hopByBondId: 3 bonds total. Each bond's hop = max(hop a, hop b).
    expect(grow.hopByBondId.size).toBe(3);
    // d↔c bond (between hop 0 and hop 1) should be 1.
    // c↔b bond (between hop 1 and hop 2) should be 2.
    // b↔a bond (between hop 2 and hop 3) should be 3.
    const sortedBondHops = [...grow.hopByBondId.values()].sort((x, y) => x - y);
    expect(sortedBondHops).toEqual([1, 2, 3]);
  });

  it('STRUCTURE_GROW for a place that triggers cross-structure merge covers the union component', () => {
    const world = makeWorld(0);
    // Two separate components: alpha (3 prims) and beta (2 prims).
    const a0 = placeAt(world, { sparkRawId: 1, type: SparkType.Dot, pos: { x: 200, y: 200 }, targetId: null });
    const a1 = placeAt(world, { sparkRawId: 2, type: SparkType.Dot, pos: { x: 220, y: 200 }, targetId: a0 });
    const a2 = placeAt(world, { sparkRawId: 3, type: SparkType.Dot, pos: { x: 240, y: 200 }, targetId: a1 });
    const b0 = placeAt(world, { sparkRawId: 4, type: SparkType.Dot, pos: { x: 320, y: 200 }, targetId: null });
    const b1 = placeAt(world, { sparkRawId: 5, type: SparkType.Dot, pos: { x: 340, y: 200 }, targetId: b0 });

    const effectsBefore = world.effects.length;
    // Bridge: primary into a2, merge candidate b0 → merges β into α via the
    // new bridge primitive.
    const bridge = placeAt(world, {
      sparkRawId: 6,
      type: SparkType.Dot,
      pos: { x: 280, y: 200 },
      targetId: a2,
      mergeCandidateIds: [a2, b0],
    });
    void bridge;

    const grow = world.effects.slice(effectsBefore).find((e) => e.kind === 'STRUCTURE_GROW');
    expect(grow).toBeDefined();
    if (grow?.kind !== 'STRUCTURE_GROW') throw new Error('typeguard');
    // Union: bridge + alpha (3) + beta (2) = 6 primitives in hop map.
    expect(grow.hopByPrimId.size).toBe(6);
    // All originally-disjoint primitives must be reachable.
    expect(grow.hopByPrimId.has(a0)).toBe(true);
    expect(grow.hopByPrimId.has(b1)).toBe(true);
    // Bond count: 5 bonds (3 alpha pre-existing + 2 beta pre-existing... wait
    // beta = b0 + b1 = 1 bond pre-existing). Pre-existing: 2 in α + 1 in β = 3.
    // New: primary bridge↔a2 + merge bridge↔b0 = 2. Total = 5 bonds in union.
    expect(grow.hopByBondId.size).toBe(5);
  });
});
