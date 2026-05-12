/**
 * S14 P1 — unit tests for the avatar pulse alpha calculator.
 *
 * Pure-function tests; do NOT spin up Pixi Application. The pulse calc is
 * extracted from avatarRenderer.sync() exactly so the time-dependent path
 * is testable without a DOM/canvas (S10 #test-via-pure-helper-export pattern).
 */

import { describe, test, expect } from 'vitest';
import { computeAvatarAlphas } from './avatarRenderer.ts';

describe('S14 P1 — computeAvatarAlphas', () => {
  // sin(0) = 0 → no modulation; both alphas exactly at base.
  test('t=0 returns base alphas exactly (phase=0)', () => {
    const { outer, inner } = computeAvatarAlphas(0, 0.35, 0.95, 1.2, 0.20);
    expect(outer).toBeCloseTo(0.35, 6);
    expect(inner).toBeCloseTo(0.95, 6);
  });

  // Quarter-period: t = 1/(4hz) → 2π × hz × t = π/2 → sin = +1.
  // outer = 0.35 + 0.20 = 0.55; inner = 0.95 - 0.10 = 0.85.
  test('quarter-period (phase=+1): outer=base+depth, inner anti-phase=base-depth/2', () => {
    const hz = 1.2;
    const t = 1 / (4 * hz);
    const { outer, inner } = computeAvatarAlphas(t, 0.35, 0.95, hz, 0.20);
    expect(outer).toBeCloseTo(0.55, 4);
    expect(inner).toBeCloseTo(0.85, 4);
  });

  // Three-quarter-period: 3π/2 → sin = -1.
  // outer = 0.35 - 0.20 = 0.15; inner = 0.95 - (0.5*0.20)*(-1) = 0.95 + 0.10 = 1.05.
  // 1.05 must clamp to 1.0.
  test('three-quarter-period (phase=-1): outer=base-depth, inner anti-phase clamped at 1', () => {
    const hz = 1.2;
    const t = 3 / (4 * hz);
    const { outer, inner } = computeAvatarAlphas(t, 0.35, 0.95, hz, 0.20);
    expect(outer).toBeCloseTo(0.15, 4);
    expect(inner).toBeCloseTo(1.0, 4);
  });

  // Boundedness across wide t domain — alpha must stay in [0, 1] always.
  test('outer and inner remain in [0, 1] across wide t range', () => {
    for (const t of [0, 0.05, 0.1, 0.42, 1.0, 100.0, 12345.678, 1e6]) {
      const { outer, inner } = computeAvatarAlphas(t, 0.35, 0.95, 1.2, 0.20);
      expect(outer).toBeGreaterThanOrEqual(0);
      expect(outer).toBeLessThanOrEqual(1);
      expect(inner).toBeGreaterThanOrEqual(0);
      expect(inner).toBeLessThanOrEqual(1);
    }
  });

  // Pathological depth that would push base+depth past 1.0 must clamp safely.
  // base=0.5, depth=0.80 → at phase=+1, outer=1.30 → clamp01 → 1.0.
  // inner=0.5, -0.5*0.80*(+1) = -0.40 → inner = 0.10 (in range).
  test('extreme depth clamps outer to [0,1]', () => {
    const hz = 1.0;
    const t = 1 / (4 * hz);  // phase=+1
    const { outer, inner } = computeAvatarAlphas(t, 0.5, 0.5, hz, 0.80);
    expect(outer).toBeCloseTo(1.0, 6);
    expect(inner).toBeCloseTo(0.10, 6);
  });

  // Negative-going pathological depth: base=0.1, depth=0.5, phase=-1 →
  // outer=0.1-0.5*(-1)=0.6 (in range); phase=+1 → outer=0.1+0.5=0.6 (in range).
  // But at phase=+1 with the same base: 0.1+0.5*1=0.6. OK.
  // Use base=0.1, depth=0.5 at phase=+1 → outer=0.6, inner=0.1-0.25=-0.15 → clamp01 → 0.
  test('extreme depth clamps inner to [0,1] (negative path)', () => {
    const hz = 1.0;
    const t = 1 / (4 * hz);
    const { outer, inner } = computeAvatarAlphas(t, 0.1, 0.1, hz, 0.50);
    expect(outer).toBeCloseTo(0.60, 6);
    expect(inner).toBeCloseTo(0.0, 6);
  });

  // Period closure: at t = 1/hz, sin completes a full cycle → back to base.
  test('full period returns base alphas (closure)', () => {
    const hz = 1.2;
    const t = 1 / hz;
    const { outer, inner } = computeAvatarAlphas(t, 0.35, 0.95, hz, 0.20);
    expect(outer).toBeCloseTo(0.35, 4);
    expect(inner).toBeCloseTo(0.95, 4);
  });
});
