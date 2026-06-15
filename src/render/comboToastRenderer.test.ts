/**
 * SPARK — S88 G3a comboToastPose unit tests (pure-pose determinism + photosensitivity).
 * Mirrors the rainbowFlyoverRenderer.test.ts pattern: assert the pure window logic in
 * isolation (no Pixi Application), incl. the tick-rewind guard + the alpha cap.
 */
import { describe, expect, it } from 'vitest';
import { comboToastPose } from './comboToastRenderer.ts';

const DUR = 150;
const H = 1080;

describe('S88 G3a — comboToastPose (pure transient window)', () => {
  it('is inactive before the window (negative elapsed — tick rewind after load)', () => {
    expect(comboToastPose(-1, DUR, H).active).toBe(false);
    expect(comboToastPose(-1, DUR, H).alpha).toBe(0);
  });

  it('is inactive at/after the window end (no ghost toast)', () => {
    expect(comboToastPose(DUR, DUR, H).active).toBe(false);
    expect(comboToastPose(DUR + 50, DUR, H).active).toBe(false);
  });

  it('is inactive on a non-finite elapsed (NaN guard)', () => {
    expect(comboToastPose(NaN, DUR, H).active).toBe(false);
  });

  it('is active across the open window', () => {
    expect(comboToastPose(0, DUR, H).active).toBe(true);
    expect(comboToastPose(DUR / 2, DUR, H).active).toBe(true);
    expect(comboToastPose(DUR - 1, DUR, H).active).toBe(true);
  });

  it('alpha is a smooth fade-in/hold/fade-out, peak 0.95, never exceeding it', () => {
    let peak = 0;
    for (let e = 0; e < DUR; e++) {
      const a = comboToastPose(e, DUR, H).alpha;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(0.95);
      peak = Math.max(peak, a);
    }
    expect(peak).toBeCloseTo(0.95, 5);
    // fades in from ~0 and out toward ~0
    expect(comboToastPose(0, DUR, H).alpha).toBeCloseTo(0, 5);
    expect(comboToastPose(DUR - 1, DUR, H).alpha).toBeLessThan(0.1);
  });

  it('renders in the upper-center band (clear of the leaderboard + win banner)', () => {
    expect(comboToastPose(DUR / 2, DUR, H).y).toBeCloseTo(H * 0.28, 5);
  });

  it('pops in (scale 0.7 → 1.0 over the first 15%) then holds', () => {
    expect(comboToastPose(0, DUR, H).scale).toBeCloseTo(0.7, 5);
    expect(comboToastPose(DUR * 0.5, DUR, H).scale).toBeCloseTo(1, 5);
  });
});
