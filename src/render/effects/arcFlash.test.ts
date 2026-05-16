/**
 * SPARK — arcFlash pure-helper tests (S34 P2-24).
 *
 * The full `drawArcFlash` is DOM-gated (needs Pixi Graphics surface), but
 * the polyline-build algorithm (jitter + endpoint preservation + degenerate-
 * line handling) is pure math. This file locks the algorithmic contract via
 * `buildJitteredPolyline` extracted in S34 P2-24.
 */

import { describe, expect, it } from 'vitest';
import { buildJitteredPolyline } from './arcFlash.ts';

const SEED = 0xdeadbeef | 0;

describe('buildJitteredPolyline (S34 P2-24)', () => {
  it('produces segments+2 vertex pairs (start + interior + end)', () => {
    const r = buildJitteredPolyline(SEED, 0, 0, 100, 0, 5, 10);
    expect(r.xs.length).toBe(7); // 1 start + 5 interior + 1 end
    expect(r.ys.length).toBe(7);
  });

  it('preserves endpoints exactly (no jitter on first or last vertex)', () => {
    const r = buildJitteredPolyline(SEED, 10, 20, 110, 220, 5, 50);
    expect(r.xs[0]).toBe(10);
    expect(r.ys[0]).toBe(20);
    expect(r.xs[r.xs.length - 1]).toBe(110);
    expect(r.ys[r.ys.length - 1]).toBe(220);
  });

  it('zero-length line: all interior vertices coincide with start', () => {
    // Degenerate: sx===ex && sy===ey → perp = (0, 0), no jitter applied.
    const r = buildJitteredPolyline(SEED, 50, 50, 50, 50, 5, 100);
    for (let i = 0; i < r.xs.length; i++) {
      expect(r.xs[i]).toBe(50);
      expect(r.ys[i]).toBe(50);
    }
  });

  it('deterministic: same seed → same output', () => {
    const a = buildJitteredPolyline(SEED, 0, 0, 100, 100, 5, 20);
    const b = buildJitteredPolyline(SEED, 0, 0, 100, 100, 5, 20);
    expect(a.xs).toEqual(b.xs);
    expect(a.ys).toEqual(b.ys);
  });

  it('different seeds → different interior vertices (extremely high probability)', () => {
    const a = buildJitteredPolyline(SEED, 0, 0, 100, 100, 5, 20);
    const b = buildJitteredPolyline((SEED ^ 0x12345678) | 0, 0, 0, 100, 100, 5, 20);
    // Endpoints are identical by construction; at least one interior vertex differs.
    let anyInteriorDiffers = false;
    for (let i = 1; i < a.xs.length - 1; i++) {
      if (a.xs[i] !== b.xs[i] || a.ys[i] !== b.ys[i]) {
        anyInteriorDiffers = true;
        break;
      }
    }
    expect(anyInteriorDiffers).toBe(true);
  });

  it('zero amplitude: interior vertices land on the straight line (no jitter)', () => {
    const r = buildJitteredPolyline(SEED, 0, 0, 100, 0, 5, 0);
    // With ampPx=0, offset is always 0 — every interior vertex lies on
    // the line from (0,0) to (100,0), so all y must be 0 and x evenly spaced.
    for (let i = 0; i < r.xs.length; i++) {
      expect(r.ys[i]).toBeCloseTo(0, 9);
    }
    // x must monotonically increase 0 → 100
    for (let i = 1; i < r.xs.length; i++) {
      expect(r.xs[i]).toBeGreaterThanOrEqual(r.xs[i - 1]);
    }
    expect(r.xs[0]).toBe(0);
    expect(r.xs[r.xs.length - 1]).toBe(100);
  });

  it('amplitude bounds interior jitter to ±ampPx (pseudoRand range)', () => {
    // pseudoRand returns values in [-1, 1] (mulberry32 mapped). Offset =
    // pseudoRand * ampPx ∈ [-ampPx, ampPx]. Interior vertex distance to its
    // unjittered counterpart on the base line is |offset| ≤ ampPx.
    const ampPx = 30;
    const r = buildJitteredPolyline(SEED, 0, 0, 200, 0, 5, ampPx);
    // For a horizontal start→end line, perpX=0, perpY=1 (sign depends on dx,dy),
    // so jitter applies entirely to y. Interior y values bound by ±ampPx.
    for (let i = 1; i < r.ys.length - 1; i++) {
      expect(Math.abs(r.ys[i])).toBeLessThanOrEqual(ampPx);
    }
  });
});
