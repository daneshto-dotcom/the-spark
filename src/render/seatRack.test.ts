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
