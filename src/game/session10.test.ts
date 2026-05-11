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
  SparkType,
} from '../constants.ts';
import { stepAttractLerp } from '../input/controls.ts';

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
