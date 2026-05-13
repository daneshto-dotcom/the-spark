/**
 * SPARK — godlyCooldown helpers (S22 P3 D7).
 * Pure tick-math tests; no Pixi / no DOM.
 */

import { describe, it, expect } from 'vitest';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import { isOnCooldown, setCooldown, cooldownSecondsRemaining, GODLY_COOLDOWN_TICKS } from './godlyCooldown.ts';

describe('godlyCooldown', () => {
  it('a fresh player is not on cooldown', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff0000);
    expect(isOnCooldown(p, 0)).toBe(false);
    expect(isOnCooldown(p, 99999)).toBe(false);
  });

  it('setCooldown extends 60s @ PHYSICS_HZ ticks forward', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff0000);
    setCooldown(p, 1000);
    expect(p.godlyCooldownEndsAtTick).toBe(1000 + GODLY_COOLDOWN_TICKS);
    expect(isOnCooldown(p, 1000)).toBe(true);
    expect(isOnCooldown(p, 1000 + GODLY_COOLDOWN_TICKS - 1)).toBe(true);
    expect(isOnCooldown(p, 1000 + GODLY_COOLDOWN_TICKS)).toBe(false); // exclusive end
  });

  it('cooldownSecondsRemaining converts ticks → seconds via PHYSICS_HZ', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff0000);
    setCooldown(p, 0);
    // GODLY_COOLDOWN_TICKS = 60 * PHYSICS_HZ → 60 seconds remaining at tick 0.
    expect(cooldownSecondsRemaining(p, 0)).toBe(60);
    // Half-cooldown elapsed.
    expect(cooldownSecondsRemaining(p, GODLY_COOLDOWN_TICKS / 2)).toBe(30);
    // Fully elapsed → 0 (clamped, not negative).
    expect(cooldownSecondsRemaining(p, GODLY_COOLDOWN_TICKS * 2)).toBe(0);
  });

  it('a player who never triggered reports 0 seconds remaining', () => {
    const p = makeIdlePlayer(asPlayerId(0), 0xff0000);
    expect(p.godlyCooldownEndsAtTick).toBe(null);
    expect(cooldownSecondsRemaining(p, 0)).toBe(0);
  });
});
