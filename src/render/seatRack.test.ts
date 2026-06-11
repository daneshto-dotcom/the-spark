/**
 * SPARK — S82 P5: seat-rack pure-helper tests (the unit-test item the S69 P2 Council
 * REVISED SCOPE DELTA listed but which was never created; rack occupancy logic itself
 * is covered in lobbyStateMachine.test.ts — THIS file locks the Pixi projection's
 * label + style derivation via the extracted pure helpers).
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { seatCellStyle, seatLabelText } from './seatRack.ts';

describe('S82 P5 — seatLabelText', () => {
  it('plain occupied seat: P{n} only', () => {
    expect(seatLabelText(2, false, false)).toBe('P3');
  });

  it('host seat: P1  HOST', () => {
    expect(seatLabelText(0, true, false)).toBe('P1  HOST');
  });

  it('own non-host seat: P{n}  (you)', () => {
    expect(seatLabelText(3, false, true)).toBe('P4  (you)');
  });

  it('host + you (the hosting player): P1  HOST  (you)', () => {
    expect(seatLabelText(0, true, true)).toBe('P1  HOST  (you)');
  });
});

describe('S82 P5 — seatCellStyle (A5 you-emphasis)', () => {
  it('own seat: full alpha + 5px white glow stroke', () => {
    const s = seatCellStyle(PLAYER_COLORS[1], true);
    expect(s.fillAlpha).toBe(1);
    expect(s.strokeWidth).toBe(5);
    expect(s.strokeColor).toBe(0xffffff);
    expect(s.strokeAlpha).toBeCloseTo(0.9, 10);
  });

  it('other occupied seats: dimmed fill + thin self-coloured stroke', () => {
    const s = seatCellStyle(PLAYER_COLORS[4], false);
    expect(s.fillAlpha).toBeCloseTo(0.85, 10);
    expect(s.strokeWidth).toBe(2);
    expect(s.strokeColor).toBe(PLAYER_COLORS[4]);
    expect(s.strokeAlpha).toBe(1);
  });
});

// ===== S85 P4c — D1 join/leave animation pose (pure) =====

import { SEAT_ANIM_IN_MS, SEAT_ANIM_OUT_MS, seatAnimPose } from './seatRack.ts';

describe('seatAnimPose — D1 living-lobby join/leave envelope', () => {
  it('join: starts at alpha 0 / scale 0.92 and resolves to identity by SEAT_ANIM_IN_MS', () => {
    const start = seatAnimPose('in', 0);
    expect(start.alpha).toBe(0);
    expect(start.scale).toBeCloseTo(0.92, 9);
    expect(start.done).toBe(false);
    const end = seatAnimPose('in', SEAT_ANIM_IN_MS);
    expect(end).toEqual({ alpha: 1, scale: 1, done: true });
  });

  it('join: alpha rises monotonically (ease-out, no overshoot)', () => {
    let prev = -1;
    for (let t = 0; t <= SEAT_ANIM_IN_MS; t += 20) {
      const p = seatAnimPose('in', t);
      expect(p.alpha).toBeGreaterThanOrEqual(prev);
      expect(p.alpha).toBeLessThanOrEqual(1);
      prev = p.alpha;
    }
  });

  it('leave: dips to 0.25 at the midpoint, recovers to identity by SEAT_ANIM_OUT_MS', () => {
    expect(seatAnimPose('out', 0).alpha).toBeCloseTo(1, 9);
    expect(seatAnimPose('out', SEAT_ANIM_OUT_MS / 2).alpha).toBeCloseTo(0.25, 9);
    expect(seatAnimPose('out', SEAT_ANIM_OUT_MS)).toEqual({ alpha: 1, scale: 1, done: true });
    // scale never moves on leave (the blink is alpha-only)
    expect(seatAnimPose('out', SEAT_ANIM_OUT_MS / 3).scale).toBe(1);
  });

  it('out-of-range / non-finite elapsed resolves to identity (idempotent)', () => {
    expect(seatAnimPose('in', -5)).toEqual({ alpha: 1, scale: 1, done: true });
    expect(seatAnimPose('in', Number.NaN)).toEqual({ alpha: 1, scale: 1, done: true });
    expect(seatAnimPose('out', 10_000)).toEqual({ alpha: 1, scale: 1, done: true });
  });
});
