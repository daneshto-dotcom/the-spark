/**
 * SPARK — S85 P4b above-fog hazard identity ring tests.
 *
 * The pure geometry/alpha helpers behind drawHazardRing (hunter + potato
 * renderers). Contracts: 6 dashed segments with the dash-fill duty cycle,
 * rotation drifts with time (motion cue), alpha pulse stays inside its
 * photosensitivity-safe band and never reaches 0 (the ring must not blink
 * fully off — it is an identity cue, not an effect).
 */

import { describe, expect, it } from 'vitest';
import { hazardRingAlpha, hazardRingSegments } from './hazardRing.ts';

describe('hazardRingSegments', () => {
  it('emits 6 segments with the dash duty cycle', () => {
    const segs = hazardRingSegments(0);
    expect(segs.length).toBe(6);
    const slot = (Math.PI * 2) / 6;
    for (const s of segs) {
      expect(s.end - s.start).toBeCloseTo(slot * 0.62, 9);
    }
  });

  it('rotates over time (motion cue) at a slow, non-strobing rate', () => {
    const a = hazardRingSegments(0)[0].start;
    const b = hazardRingSegments(1)[0].start;
    // 0.15 Hz → 0.3π per second
    expect(b - a).toBeCloseTo(0.15 * Math.PI * 2, 9);
  });
});

describe('hazardRingAlpha', () => {
  it('pulses inside [0.11, 0.45] and never fully disappears', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 5; t += 0.01) {
      const v = hazardRingAlpha(t);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThan(0.1);
    expect(max).toBeLessThan(0.46);
  });
});
