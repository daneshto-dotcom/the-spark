/**
 * S14 P1 — unit tests for the avatar pulse alpha calculator.
 *
 * Pure-function tests; do NOT spin up Pixi Application. The pulse calc is
 * extracted from avatarRenderer.sync() exactly so the time-dependent path
 * is testable without a DOM/canvas (S10 #test-via-pure-helper-export pattern).
 */

import { describe, test, expect } from 'vitest';
import { computeAvatarAlphas, shouldHideOsCursor, shouldShowCrown, shouldShowPointerGhost, smoothTowards } from './avatarRenderer.ts';

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

describe('S81 P4 — smoothTowards (remote-avatar display smoothing)', () => {
  const TAU = 60;
  const SNAP = 300;

  test('converges toward the target without overshoot, dt-aware', () => {
    const cur = { x: 0, y: 0 };
    const tgt = { x: 100, y: 0 };
    const one = smoothTowards(cur, tgt, 16, TAU, SNAP);
    expect(one.x).toBeGreaterThan(0);
    expect(one.x).toBeLessThan(100); // never overshoots (k < 1)
    // larger dt closes more of the gap in a single step
    const big = smoothTowards(cur, tgt, 64, TAU, SNAP);
    expect(big.x).toBeGreaterThan(one.x);
    expect(big.x).toBeLessThan(100);
  });

  test('frame-rate independence: two 8ms steps ≈ one 16ms step', () => {
    const tgt = { x: 100, y: 50 };
    const twice8 = smoothTowards(smoothTowards({ x: 0, y: 0 }, tgt, 8, TAU, SNAP), tgt, 8, TAU, SNAP);
    const once16 = smoothTowards({ x: 0, y: 0 }, tgt, 16, TAU, SNAP);
    expect(twice8.x).toBeCloseTo(once16.x, 6);
    expect(twice8.y).toBeCloseTo(once16.y, 6);
  });

  test('a ~100ms network step at τ=60 closes most of the gap (smooth but not laggy)', () => {
    const out = smoothTowards({ x: 0, y: 0 }, { x: 100, y: 0 }, 100, TAU, SNAP);
    expect(out.x).toBeGreaterThan(75); // 1 − e^(−100/60) ≈ 0.81
  });

  test('already at the target stays exactly at the target', () => {
    const out = smoothTowards({ x: 42, y: 24 }, { x: 42, y: 24 }, 16, TAU, SNAP);
    expect(out).toEqual({ x: 42, y: 24 });
  });

  test('beyond snapDist jumps instantly (teleport guard: respawn/bench-return)', () => {
    const out = smoothTowards({ x: 0, y: 0 }, { x: 0, y: SNAP + 1 }, 16, TAU, SNAP);
    expect(out).toEqual({ x: 0, y: SNAP + 1 });
  });

  test('dt<=0 returns current unchanged (first frame / clock hiccup)', () => {
    const out = smoothTowards({ x: 10, y: 20 }, { x: 100, y: 200 }, 0, TAU, SNAP);
    expect(out).toEqual({ x: 10, y: 20 });
  });
});

describe('S86 P4 — pointer-as-spark cursor helpers', () => {
  test('shouldHideOsCursor: hidden ONLY while the board is live', () => {
    expect(shouldHideOsCursor('PLAYING')).toBe(true);
    expect(shouldHideOsCursor('TITLE')).toBe(false);
    expect(shouldHideOsCursor('LOBBY')).toBe(false);
    expect(shouldHideOsCursor('WIN')).toBe(false);
    expect(shouldHideOsCursor('POSTGAME')).toBe(false);
  });

  test('ghost hidden for a healthy player (avatar IS the pointer)', () => {
    expect(shouldShowPointerGhost({}, 100, 'PLAYING')).toBe(false);
  });

  test('ghost shown while pooped (avatar chasing the mouse)', () => {
    expect(shouldShowPointerGhost({ poopedUntilTick: 200 }, 100, 'PLAYING')).toBe(true);
  });

  test('ghost shown during the residual post-expiry chase (target still set)', () => {
    expect(
      shouldShowPointerGhost(
        { poopedUntilTick: 90, poopedCursorTarget: { x: 1, y: 2 } },
        100,
        'PLAYING',
      ),
    ).toBe(true);
  });

  test('ghost shown while benched (avatar hidden — the mouse is all you have)', () => {
    expect(shouldShowPointerGhost({ benchedUntilTick: 500 }, 100, 'PLAYING')).toBe(true);
  });

  test('ghost self-heals at expiry boundaries (strict tick compare)', () => {
    expect(shouldShowPointerGhost({ benchedUntilTick: 100 }, 100, 'PLAYING')).toBe(false);
    expect(shouldShowPointerGhost({ poopedUntilTick: 100 }, 100, 'PLAYING')).toBe(false);
  });

  test('ghost never shows outside PLAYING or without a seated player', () => {
    expect(shouldShowPointerGhost({ benchedUntilTick: 500 }, 100, 'TITLE')).toBe(false);
    expect(shouldShowPointerGhost(undefined, 100, 'PLAYING')).toBe(false);
  });
});

describe('S114 G4 — shouldShowCrown (in-world leader crown gate)', () => {
  test('the leader gets a crown while networked + PLAYING + not benched', () => {
    expect(shouldShowCrown(true, 2, false, 'PLAYING')).toBe(true);
  });

  test('a non-leader never gets a crown', () => {
    expect(shouldShowCrown(false, 2, false, 'PLAYING')).toBe(false);
  });

  test('no crown in solo (players.size === 1 — mirrors the nameplate gate)', () => {
    expect(shouldShowCrown(true, 1, false, 'PLAYING')).toBe(false);
  });

  test('no crown for a benched/eaten leader (its avatar is hidden, so the crown must be too)', () => {
    expect(shouldShowCrown(true, 2, true, 'PLAYING')).toBe(false);
  });

  test('no crown outside PLAYING (LOBBY/WIN/POSTGAME/TITLE)', () => {
    for (const gs of ['TITLE', 'LOBBY', 'WIN', 'POSTGAME'] as const) {
      expect(shouldShowCrown(true, 2, false, gs)).toBe(false);
    }
  });
});
