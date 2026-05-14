/**
 * S30 P0e — ScreenShake unit tests. Verifies the pure decay math + tick
 * determinism without instantiating Pixi. The applyToStage method takes a
 * Container so it's not unit-tested directly here (DOM-gated, browser smoke).
 */

import { describe, expect, it } from 'vitest';
import { ScreenShake } from './screenShake.ts';

describe('ScreenShake (S30 P0e — global tick-decayed screen-shake)', () => {
  it('inactive shake — isActive returns false before any trigger', () => {
    const ss = new ScreenShake();
    expect(ss.isActive(100)).toBe(false);
  });

  it('isActive returns true within duration window after trigger', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 2, 6);
    expect(ss.isActive(100)).toBe(true); // start
    expect(ss.isActive(102)).toBe(true); // mid
    expect(ss.isActive(105)).toBe(true); // last visible
  });

  it('isActive returns false at exactly duration ticks past startTick (exclusive)', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 2, 6);
    expect(ss.isActive(106)).toBe(false); // expired (elapsed=6 >= duration=6)
  });

  it('isActive returns false BEFORE startTick (no time-travel shake)', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 2, 6);
    expect(ss.isActive(99)).toBe(false);
  });

  it('computeOffset at elapsed=0 has full amplitude magnitude', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 4, 6);
    const off = ss.computeOffset(100, 0);
    // fraction=1, amp=4*1=4; offset components are in [-4, 4]
    expect(Math.abs(off.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(off.y)).toBeLessThanOrEqual(4);
    // At least one component is non-zero with high probability (tick-seeded).
    expect(Math.abs(off.x) + Math.abs(off.y)).toBeGreaterThan(0);
  });

  it('computeOffset at elapsed=duration/2 has half amplitude', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 4, 6);
    const off = ss.computeOffset(103, 3);
    // fraction=1-3/6=0.5, amp=4*0.5=2; offset in [-2, 2]
    expect(Math.abs(off.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(off.y)).toBeLessThanOrEqual(2);
  });

  it('determinism — same tick produces same offset across instances', () => {
    const ss1 = new ScreenShake();
    const ss2 = new ScreenShake();
    ss1.trigger(100, 4, 6);
    ss2.trigger(100, 4, 6);
    const off1 = ss1.computeOffset(102, 2);
    const off2 = ss2.computeOffset(102, 2);
    expect(off1.x).toBe(off2.x);
    expect(off1.y).toBe(off2.y);
  });

  it('different ticks produce different offsets (chaotic-feel, not constant)', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 4, 6);
    const off1 = ss.computeOffset(101, 1);
    const off2 = ss.computeOffset(102, 2);
    // Different ticks should not produce identical offsets.
    expect(off1.x !== off2.x || off1.y !== off2.y).toBe(true);
  });

  it('trigger replaces existing shake — no stacking', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 2, 6);
    ss.trigger(105, 4, 8);
    // Second trigger should be authoritative.
    expect(ss.isActive(105)).toBe(true);
    expect(ss.isActive(112)).toBe(true); // within new duration
    expect(ss.isActive(113)).toBe(false); // expired (105 + 8 = 113)
  });

  it('reset clears shake state — isActive returns false everywhere after reset', () => {
    const ss = new ScreenShake();
    ss.trigger(100, 2, 6);
    ss.reset();
    expect(ss.isActive(100)).toBe(false);
    expect(ss.isActive(102)).toBe(false);
  });
});
