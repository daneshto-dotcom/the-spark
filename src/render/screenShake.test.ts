/**
 * S30 P0e — ScreenShake unit tests. Verifies the pure decay math + tick
 * determinism without instantiating Pixi. The applyToStage method takes a
 * Container so it's not unit-tested directly here (DOM-gated, browser smoke).
 */

import { describe, expect, it } from 'vitest';
import type { GameEffect } from '../game/effects.ts';
import { ScreenShake, shouldTriggerNonetResolveShake, shouldTriggerShakeForArcFlash } from './screenShake.ts';

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

// S33 P1-6 — phantom-shake gate predicate. Pre-S33 main.ts gated shake on
// `!world.bonds.has(bondId)` after CREATURE_ATTACK; the new gate ties
// directly to the ARC_FLASH-this-tick invariant, forward-defending Anvil
// cleave/AOE creatures that may sever without ARC_FLASH or flash without
// severing.
describe('shouldTriggerShakeForArcFlash (S33 P1-6 — explicit ARC_FLASH gate)', () => {
  it('returns false on empty effects array', () => {
    expect(shouldTriggerShakeForArcFlash([], 42)).toBe(false);
  });

  it('returns true when ARC_FLASH at currentTick is present', () => {
    const effects: GameEffect[] = [
      { kind: 'ARC_FLASH', tick: 42, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    ];
    expect(shouldTriggerShakeForArcFlash(effects, 42)).toBe(true);
  });

  it('returns false when ARC_FLASH tick !== currentTick (stale effect from prior tick)', () => {
    const effects: GameEffect[] = [
      { kind: 'ARC_FLASH', tick: 41, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    ];
    expect(shouldTriggerShakeForArcFlash(effects, 42)).toBe(false);
  });

  it('ignores non-ARC_FLASH effects (BOND_FORMED, BOND_SEVERED, etc.)', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 42, pos: { x: 0, y: 0 }, bondCount: 1 },
      { kind: 'BOND_SEVERED', tick: 42, pos: { x: 0, y: 0 }, cause: 'creature' },
    ];
    expect(shouldTriggerShakeForArcFlash(effects, 42)).toBe(false);
  });

  it('returns true when one of multiple effects is ARC_FLASH at currentTick', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 42, pos: { x: 0, y: 0 }, bondCount: 1 },
      { kind: 'ARC_FLASH', tick: 42, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      { kind: 'BOND_SEVERED', tick: 42, pos: { x: 0, y: 0 }, cause: 'creature' },
    ];
    expect(shouldTriggerShakeForArcFlash(effects, 42)).toBe(true);
  });

  it('forward-defense: BOND_SEVERED without ARC_FLASH at currentTick does NOT trigger shake (Anvil-style cleave)', () => {
    // Simulates a future Anvil/AOE creature that severs without ARC_FLASH —
    // pre-S33 the `!bonds.has(bondId)` gate would have triggered shake here
    // anyway; new gate correctly suppresses (no visual impact to "feel").
    const effects: GameEffect[] = [
      { kind: 'BOND_SEVERED', tick: 42, pos: { x: 0, y: 0 }, cause: 'creature' },
    ];
    expect(shouldTriggerShakeForArcFlash(effects, 42)).toBe(false);
  });
});

// S95 P2 — NONET resolve celebration shake gate. Fires once on the resolvedTick null→non-null edge.
describe('shouldTriggerNonetResolveShake (S95 P2 — resolve juice)', () => {
  it('fires on the resolve rising edge (null → a tick)', () => {
    expect(shouldTriggerNonetResolveShake(null, 4351)).toBe(true);
  });

  it('does not fire while the trial is still live (null → null)', () => {
    expect(shouldTriggerNonetResolveShake(null, null)).toBe(false);
  });

  it('does not re-fire on subsequent frames after resolve (tick → same tick)', () => {
    expect(shouldTriggerNonetResolveShake(4351, 4351)).toBe(false);
  });

  it('does not fire when the trial clears after resolve (tick → null)', () => {
    expect(shouldTriggerNonetResolveShake(4351, null)).toBe(false);
  });

  it('fires again for a fresh trial after a clear (null → new tick)', () => {
    // caller resets prev to null when world.sudoku clears, so the next trial can fire.
    expect(shouldTriggerNonetResolveShake(null, 9000)).toBe(true);
  });

  it('fires on a timeout resolve too (tick 0 is a valid resolvedTick, not "unresolved")', () => {
    expect(shouldTriggerNonetResolveShake(null, 0)).toBe(true);
  });
});
