/**
 * SPARK — S82 P3 fuzzy-edge fog brush + CVD nameplate pure-helper tests.
 *
 * Locks the safety envelope that keeps e2e/fog.spec.ts's pixel contracts valid:
 *   - the full-alpha plateau (r ≤ 0.72) is untouched (source-center alpha<10 asserts);
 *   - the wobble only pulls the edge INWARD (never paints outside the pre-S82 brush
 *     footprint → fogged probe points stay EXACT RGB(0,0,0));
 *   - deterministic: fixed harmonics, no Math.random/time (same texture every boot).
 */

import { describe, expect, it } from 'vitest';
import { brushAlphaAt, fogEdgeWobble } from './fogRenderer.ts';
import { avatarNameplateText } from './avatarRenderer.ts';

describe('S82 P3 — fogEdgeWobble', () => {
  it('is bounded to [0, 1] across the full circle', () => {
    for (let i = 0; i < 720; i++) {
      const w = fogEdgeWobble((i / 720) * 2 * Math.PI);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and actually varies with angle (not a constant)', () => {
    expect(fogEdgeWobble(1.234)).toBe(fogEdgeWobble(1.234));
    const samples = new Set<number>();
    for (let i = 0; i < 32; i++) samples.add(fogEdgeWobble((i / 32) * 2 * Math.PI));
    expect(samples.size).toBeGreaterThan(16); // genuinely angle-dependent
  });
});

describe('S82 P3 — brushAlphaAt (fuzzy brush profile)', () => {
  it('plateau stays FULLY opaque at every angle (fog.spec source-center contract)', () => {
    for (let i = 0; i < 64; i++) {
      const theta = (i / 64) * 2 * Math.PI;
      expect(brushAlphaAt(0, theta)).toBe(1);
      expect(brushAlphaAt(0.5, theta)).toBe(1);
      expect(brushAlphaAt(0.72, theta)).toBe(1);
    }
  });

  it('is fully transparent at the texture rim at every angle (never paints outside)', () => {
    for (let i = 0; i < 64; i++) {
      expect(brushAlphaAt(1.0, (i / 64) * 2 * Math.PI)).toBe(0);
      expect(brushAlphaAt(1.2, (i / 64) * 2 * Math.PI)).toBe(0);
    }
  });

  it('fades monotonically (non-increasing) in r at a fixed angle', () => {
    const theta = 0.9;
    let prev = 1;
    for (let r = 0.72; r <= 1.001; r += 0.01) {
      const a = brushAlphaAt(r, theta);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
  });

  it('the edge is fuzzy: alpha inside the fade band varies with angle', () => {
    const r = 0.93; // mid-band — inside [1-FUZZ_AMP, 1] wobble territory
    const samples = new Set<number>();
    for (let i = 0; i < 32; i++) samples.add(brushAlphaAt(r, (i / 32) * 2 * Math.PI));
    expect(samples.size).toBeGreaterThan(8); // irregular rim, not a circle
  });
});

describe('S82 P3 — CVD avatar nameplate', () => {
  it('maps seat index to P{n}', () => {
    expect(avatarNameplateText(0)).toBe('P1');
    expect(avatarNameplateText(5)).toBe('P6');
  });
});
