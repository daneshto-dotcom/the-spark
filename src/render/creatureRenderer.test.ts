/**
 * SPARK — pure transform-helper unit tests for the S28 P0 Voltkin Phase 2D
 * polish (Council Q5 UNANIMOUS A pure exported helpers + Q3 COMPROMISE B
 * ease-in tint curve). The renderer class itself is not unit-tested here
 * (needs Pixi Application + Container — DOM-gated, lives in browser smoke).
 *
 * Coverage:
 *   - lerpHex: t=0/1/0.5 + clamp t<0 and t>1
 *   - computeCreatureTint: SPAWNING / SEEKING / ATTACKING wind-up + fire +
 *     recovery / DESPAWNING — boundaries at t-1 / t / t+1 per S27 reflexion #6
 *   - computeCreatureScale: SPAWNING peak/start/end, SEEKING bob bounds,
 *     ATTACKING wind-up/fire/recovery boundaries, DESPAWNING shrink curve
 */

import { describe, expect, it } from 'vitest';
import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
} from '../state/creatures/creature.ts';
import {
  WINDUP_TINT_EASE,
  computeCreatureRotation,
  computeCreatureScale,
  computeCreatureTint,
  lerpHex,
} from './creatureRenderer.ts';

const WHITE = 0xffffff;
const YELLOW_CHARGED = 0xffee66;

describe('lerpHex (24-bit RGB linear interpolation)', () => {
  it('returns the start color at t=0', () => {
    expect(lerpHex(WHITE, YELLOW_CHARGED, 0)).toBe(WHITE);
  });

  it('returns the end color at t=1', () => {
    expect(lerpHex(WHITE, YELLOW_CHARGED, 1)).toBe(YELLOW_CHARGED);
  });

  it('returns mid-channel-averaged color at t=0.5', () => {
    // white = (0xFF, 0xFF, 0xFF) = (255, 255, 255)
    // yellow-charged = (0xFF, 0xEE, 0x66) = (255, 238, 102)
    // mid = (255, round((255+238)/2), round((255+102)/2)) = (255, 247, 179)
    expect(lerpHex(WHITE, YELLOW_CHARGED, 0.5)).toBe((255 << 16) | (247 << 8) | 179);
  });

  it('clamps t > 1 to 1 (no extrapolation past end color)', () => {
    expect(lerpHex(WHITE, YELLOW_CHARGED, 2.5)).toBe(YELLOW_CHARGED);
  });

  it('clamps t < 0 to 0 (no extrapolation past start color)', () => {
    expect(lerpHex(WHITE, YELLOW_CHARGED, -1)).toBe(WHITE);
  });
});

describe('WINDUP_TINT_EASE (Council Q3 COMPROMISE B ease-in t² curve)', () => {
  it('returns 0 at t=0 (no charge yet)', () => {
    expect(WINDUP_TINT_EASE(0)).toBe(0);
  });

  it('returns 1 at t=1 (fully charged at fire-tick edge)', () => {
    expect(WINDUP_TINT_EASE(1)).toBe(1);
  });

  it('returns 0.25 at t=0.5 (slower charge in first half — ease-in feel)', () => {
    expect(WINDUP_TINT_EASE(0.5)).toBe(0.25);
  });
});

describe('computeCreatureTint (per-state tint, Q3 ease-in wind-up only)', () => {
  it('SPAWNING is always neutral white (no tint applied)', () => {
    expect(computeCreatureTint('SPAWNING', 0)).toBe(WHITE);
    expect(computeCreatureTint('SPAWNING', 30)).toBe(WHITE);
    expect(computeCreatureTint('SPAWNING', CREATURE_SPAWN_TICKS)).toBe(WHITE);
  });

  it('SEEKING is always neutral white (drift-and-seek has no tint)', () => {
    expect(computeCreatureTint('SEEKING', 0)).toBe(WHITE);
    expect(computeCreatureTint('SEEKING', 100)).toBe(WHITE);
    expect(computeCreatureTint('SEEKING', 1000)).toBe(WHITE);
  });

  it('ATTACKING wind-up at t=0 starts at neutral white (ease-in t²=0)', () => {
    expect(computeCreatureTint('ATTACKING', 0)).toBe(WHITE);
  });

  it('ATTACKING wind-up mid-curve t=15 yields mid-charged tint (t²=0.25)', () => {
    // progress = 15/30 = 0.5; eased = 0.25; lerpHex(white, yellow, 0.25)
    const expected = lerpHex(WHITE, YELLOW_CHARGED, 0.25);
    expect(computeCreatureTint('ATTACKING', 15)).toBe(expected);
  });

  it('ATTACKING wind-up at t=FIRE_TICK-1 (=29) is near-fully-charged yellow', () => {
    // progress = 29/30 ≈ 0.9667; eased ≈ 0.9344
    const expected = lerpHex(WHITE, YELLOW_CHARGED, (29 / 30) ** 2);
    expect(computeCreatureTint('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK - 1)).toBe(expected);
  });

  it('ATTACKING at t=FIRE_TICK reverts to neutral white (PRIME-AUDIT Δ8 boundary)', () => {
    expect(computeCreatureTint('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK)).toBe(WHITE);
  });

  it('ATTACKING recovery (t > FIRE_TICK) is neutral white', () => {
    expect(computeCreatureTint('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK + 5)).toBe(WHITE);
    expect(computeCreatureTint('ATTACKING', VOLTKIN_ATTACK_CADENCE_TICKS - 1)).toBe(WHITE);
  });

  it('DESPAWNING is always neutral white (alpha fade carries the despawn cue)', () => {
    expect(computeCreatureTint('DESPAWNING', 0)).toBe(WHITE);
    expect(computeCreatureTint('DESPAWNING', CREATURE_DESPAWNING_TICKS - 1)).toBe(WHITE);
  });
});

describe('computeCreatureScale (per-state procedural scale multiplier)', () => {
  it('SPAWNING at t=0 returns 1.0 (sin(0)=0)', () => {
    expect(computeCreatureScale('SPAWNING', 0)).toBeCloseTo(1.0, 6);
  });

  it('SPAWNING peaks at t=CREATURE_SPAWN_TICKS/2 returns 1.15 (sin(π/2)=1)', () => {
    expect(computeCreatureScale('SPAWNING', CREATURE_SPAWN_TICKS / 2)).toBeCloseTo(1.15, 6);
  });

  it('SPAWNING at t=CREATURE_SPAWN_TICKS returns 1.0 (sin(π)=0 — clean SEEKING handoff)', () => {
    expect(computeCreatureScale('SPAWNING', CREATURE_SPAWN_TICKS)).toBeCloseTo(1.0, 6);
  });

  it('SEEKING at t=0 returns 1.0 (sin(0)=0 — bob starts at base)', () => {
    expect(computeCreatureScale('SEEKING', 0)).toBeCloseTo(1.0, 6);
  });

  it('SEEKING bob stays within ±2.5% of base (amplitude bound check)', () => {
    for (let t = 0; t < 600; t++) {
      const s = computeCreatureScale('SEEKING', t);
      expect(s).toBeGreaterThanOrEqual(0.975 - 1e-9);
      expect(s).toBeLessThanOrEqual(1.025 + 1e-9);
    }
  });

  it('ATTACKING wind-up (t < FIRE_TICK) returns 1.0', () => {
    expect(computeCreatureScale('ATTACKING', 0)).toBe(1.0);
    expect(computeCreatureScale('ATTACKING', 15)).toBe(1.0);
    expect(computeCreatureScale('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK - 1)).toBe(1.0);
  });

  it('ATTACKING fire window (t=FIRE_TICK and t=FIRE_TICK+1) returns 1.20 punch', () => {
    expect(computeCreatureScale('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK)).toBe(1.20);
    expect(computeCreatureScale('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK + 1)).toBe(1.20);
  });

  it('ATTACKING recovery (t=FIRE_TICK+2) starts near the fire-spike (1.20)', () => {
    // First recovery tick has progress=0 → still 1.20
    expect(computeCreatureScale('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK + 2)).toBeCloseTo(1.20, 6);
  });

  it('ATTACKING recovery (t=CADENCE-1) is EXACTLY 1.0 (CHECK C2/G4 fix — denom is span-1)', () => {
    const tip = VOLTKIN_ATTACK_CADENCE_TICKS - 1;
    const s = computeCreatureScale('ATTACKING', tip);
    // CHECK Triumvirate cross-Council UNANIMOUS Grok-C2 + Gemini-G4 fix locked
    // here: denominator is (CADENCE-1 - recoveryStart) so the last visible
    // ATTACKING tick maps to scale=1.0 exactly. No SEEKING-handoff scale pop.
    expect(s).toBeCloseTo(1.0, 6);
  });

  it('DESPAWNING (t < fadeStart) returns 1.0 (pre-fade window)', () => {
    const fadeStart = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
    expect(computeCreatureScale('DESPAWNING', 0)).toBe(1.0);
    expect(computeCreatureScale('DESPAWNING', fadeStart - 1)).toBe(1.0);
    expect(computeCreatureScale('DESPAWNING', fadeStart)).toBeCloseTo(1.0, 6);
  });

  it('DESPAWNING (t = fadeStart + FADE_TICKS) returns DESPAWNING_SHRINK_TARGET = 0.8', () => {
    const fadeStart = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
    expect(computeCreatureScale('DESPAWNING', fadeStart + CREATURE_FADE_TICKS)).toBeCloseTo(0.8, 6);
  });

  it('DESPAWNING beyond despawn boundary clamps at 0.8 (no over-shrink)', () => {
    expect(computeCreatureScale('DESPAWNING', CREATURE_DESPAWNING_TICKS + 100)).toBeCloseTo(0.8, 6);
  });
});

describe('computeCreatureRotation (S30 P0d procedural lean toward target)', () => {
  const creaturePos = { x: 100, y: 100 };
  const targetRight = { x: 200, y: 100 }; // pure +x
  const targetLeft = { x: 0, y: 100 }; // pure -x
  const targetAbove = { x: 100, y: 0 }; // pure -y (directly above)
  const targetBelow = { x: 100, y: 200 }; // pure +y (directly below)

  it('SPAWNING returns 0 regardless of target direction (rotation conflicts with scale-pulse)', () => {
    expect(computeCreatureRotation('SPAWNING', 0, creaturePos, targetRight)).toBe(0);
    expect(computeCreatureRotation('SPAWNING', 30, creaturePos, targetLeft)).toBe(0);
    expect(computeCreatureRotation('SPAWNING', 59, creaturePos, targetBelow)).toBe(0);
  });

  it('DESPAWNING returns 0 regardless of target direction (sprite in shrink-fade)', () => {
    expect(computeCreatureRotation('DESPAWNING', 0, creaturePos, targetRight)).toBe(0);
    expect(computeCreatureRotation('DESPAWNING', 30, creaturePos, targetLeft)).toBe(0);
  });

  it('SEEKING with target straight right → +SEEKING_LEAN_MAX_RAD (~0.262 rad / 15° clockwise)', () => {
    expect(computeCreatureRotation('SEEKING', 0, creaturePos, targetRight)).toBeCloseTo(0.262, 3);
  });

  it('SEEKING with target straight left → -SEEKING_LEAN_MAX_RAD (~-0.262 rad)', () => {
    expect(computeCreatureRotation('SEEKING', 0, creaturePos, targetLeft)).toBeCloseTo(-0.262, 3);
  });

  it('SEEKING with target directly above → 0 (leanFactor=dx/dist=0 since dx=0)', () => {
    expect(computeCreatureRotation('SEEKING', 0, creaturePos, targetAbove)).toBeCloseTo(0, 6);
  });

  it('SEEKING with target directly below → 0 (leanFactor=0)', () => {
    expect(computeCreatureRotation('SEEKING', 0, creaturePos, targetBelow)).toBeCloseTo(0, 6);
  });

  it('SEEKING with degenerate target == creature.pos → 0 (no direction, no lean)', () => {
    expect(computeCreatureRotation('SEEKING', 0, creaturePos, creaturePos)).toBe(0);
  });

  it('ATTACKING wind-up at ticksInState=0 returns SEEKING-lean (smooth handoff from SEEKING)', () => {
    expect(computeCreatureRotation('ATTACKING', 0, creaturePos, targetRight)).toBeCloseTo(0.262, 3);
  });

  it('ATTACKING wind-up at FIRE_TICK reaches peak lean ~0.436 rad (25°)', () => {
    expect(computeCreatureRotation('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, creaturePos, targetRight)).toBeCloseTo(0.436, 3);
  });

  it('ATTACKING wind-up halfway (FIRE_TICK/2) lerps to midpoint between SEEKING and peak lean', () => {
    const halfway = Math.floor(VOLTKIN_ATTACK_FIRE_TICK / 2);
    const r = computeCreatureRotation('ATTACKING', halfway, creaturePos, targetRight);
    // Linear interp: 0.262 + (0.436 - 0.262) * (15/30) = 0.262 + 0.087 = 0.349
    expect(r).toBeCloseTo(0.349, 2);
  });

  it('ATTACKING last visible tick (CADENCE-1) returns SEEKING-lean (clean handoff back to SEEKING)', () => {
    const r = computeCreatureRotation('ATTACKING', VOLTKIN_ATTACK_CADENCE_TICKS - 1, creaturePos, targetRight);
    expect(r).toBeCloseTo(0.262, 3);
  });

  it('rotation is sign-symmetric — target on opposite side mirrors rotation', () => {
    const r = computeCreatureRotation('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, creaturePos, targetRight);
    const rMirror = computeCreatureRotation('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, creaturePos, targetLeft);
    expect(rMirror).toBeCloseTo(-r, 6);
  });

  it('determinism: same inputs always produce same output (replay-safe / 1v1-safe)', () => {
    const a = computeCreatureRotation('ATTACKING', 15, creaturePos, { x: 167, y: 142 });
    const b = computeCreatureRotation('ATTACKING', 15, creaturePos, { x: 167, y: 142 });
    expect(a).toBe(b);
  });
});
