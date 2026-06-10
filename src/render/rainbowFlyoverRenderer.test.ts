/**
 * SPARK — S84 P2 flyover pose-math unit tests (pure functions only; the
 * renderer class needs a live Pixi Application and is covered by the e2e
 * probe via __SPARK__.rainbowFlyoverActive).
 *
 * Locks: window boundaries (inactive outside [0, duration)), the L→R traverse
 * (offscreen at both ends), the dome apex, the photosensitivity alpha charter
 * (bg ≤ 0.30 everywhere), and determinism (pure function of elapsed).
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, RAINBOW_FLYOVER_DURATION_TICKS } from '../constants.ts';
import { flyoverPose, hsl01ToRgb } from './rainbowFlyoverRenderer.ts';

const D = RAINBOW_FLYOVER_DURATION_TICKS;
const W = CANVAS_WIDTH;
const H = CANVAS_HEIGHT;

describe('flyoverPose — window boundaries', () => {
  it('is inactive before the switch (negative elapsed = tick rewound below birth)', () => {
    expect(flyoverPose(-1, D, W, H).active).toBe(false);
    expect(flyoverPose(Number.NaN, D, W, H).active).toBe(false);
  });

  it('activates at elapsed=0 and deactivates exactly at the duration', () => {
    expect(flyoverPose(0, D, W, H).active).toBe(true);
    expect(flyoverPose(D - 1, D, W, H).active).toBe(true);
    expect(flyoverPose(D, D, W, H).active).toBe(false);
    expect(flyoverPose(D + 1000, D, W, H).active).toBe(false);
  });
});

describe('flyoverPose — the arc itself', () => {
  it('starts fully offscreen left and ends fully offscreen right', () => {
    expect(flyoverPose(0, D, W, H).x).toBeLessThan(0);
    expect(flyoverPose(D - 1, D, W, H).x).toBeGreaterThan(W);
  });

  it('peaks at mid-traverse: centre x, highest y of the dome', () => {
    const mid = flyoverPose(D / 2, D, W, H);
    expect(mid.x).toBeCloseTo(W / 2, 0);
    expect(mid.y).toBeLessThan(flyoverPose(D * 0.1, D, W, H).y);
    expect(mid.y).toBeLessThan(flyoverPose(D * 0.9, D, W, H).y);
    expect(mid.charAlpha).toBe(1);
  });

  it('fades in at the start and out at the end (no hard pop)', () => {
    expect(flyoverPose(0, D, W, H).charAlpha).toBe(0);
    expect(flyoverPose(D - 1, D, W, H).charAlpha).toBeLessThan(0.2);
  });
});

describe('flyoverPose — photosensitivity charter', () => {
  it('background + beam alpha stay ≤ 0.30 across the whole window', () => {
    for (let e = 0; e < D; e++) {
      const p = flyoverPose(e, D, W, H);
      expect(p.bgAlpha).toBeLessThanOrEqual(0.3);
      expect(p.beamAlpha).toBeLessThanOrEqual(0.3);
    }
  });

  it('is deterministic: identical elapsed → identical pose (no RNG, no clock)', () => {
    expect(flyoverPose(97, D, W, H)).toEqual(flyoverPose(97, D, W, H));
  });
});

describe('hsl01ToRgb', () => {
  it('hits the primary anchors', () => {
    expect(hsl01ToRgb(0, 1, 0.5)).toBe(0xff0000);
    expect(hsl01ToRgb(1 / 3, 1, 0.5)).toBe(0x00ff00);
    expect(hsl01ToRgb(2 / 3, 1, 0.5)).toBe(0x0000ff);
    expect(hsl01ToRgb(0, 0, 1)).toBe(0xffffff);
    expect(hsl01ToRgb(0.42, 0, 0)).toBe(0x000000);
  });
});
