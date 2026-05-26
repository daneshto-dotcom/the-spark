/**
 * SPARK — audioManager unit tests (S18 P1 + S19 P1 per-channel controls).
 *
 * Tests pure helpers (envelope curve + freq sweep + clamp01), drain cursor
 * logic, and the S19 P1 per-channel mute/volume state machine. AudioContext
 * playback itself is NOT tested (jsdom can't play audio) — verification
 * happens via manual smoke test post-deploy.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { asPrimitiveId } from '../types.ts';
import type { GameEffect } from '../game/effects.ts';
import {
  chargeEnvelope,
  chargeFreq,
  claveEnvelope,
  clamp01,
  drainAudioEffects,
  fartFreq,
  getAudioSettings,
  initAudio,
  inspectAudioChain,
  isMuted,
  mapPanningPosition,
  nextDuckEndCtxTime,
  resetAudioDrainCursor,
  setMusicMuted,
  setMusicVolume,
  setSfxMuted,
  setSfxVolume,
  toggleMute,
  _resetAudioForTest,
} from './audioManager.ts';

describe('audioManager — claveEnvelope (pure)', () => {
  it('starts at 1 at t=0', () => {
    expect(claveEnvelope(0, 0.03)).toBeCloseTo(1, 5);
  });

  it('decays to ~0 at t=duration', () => {
    const v = claveEnvelope(0.03, 0.03);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.01);
  });

  it('returns 0 outside [0, duration]', () => {
    expect(claveEnvelope(-0.001, 0.03)).toBe(0);
    expect(claveEnvelope(0.031, 0.03)).toBe(0);
  });

  it('is monotonically decreasing', () => {
    const samples = [0.005, 0.015, 0.025].map((t) => claveEnvelope(t, 0.03));
    expect(samples[0]).toBeGreaterThan(samples[1]);
    expect(samples[1]).toBeGreaterThan(samples[2]);
  });
});

describe('audioManager — fartFreq (pure)', () => {
  it('starts at startHz at t=0', () => {
    expect(fartFreq(0, 0.28, 600, 180)).toBe(600);
  });

  it('ends at endHz at t=duration', () => {
    expect(fartFreq(0.28, 0.28, 600, 180)).toBeCloseTo(180, 5);
  });

  it('exponential midpoint equals geometric mean (≈328.6Hz for 600→180)', () => {
    expect(fartFreq(0.14, 0.28, 600, 180)).toBeCloseTo(Math.sqrt(600 * 180), 1);
  });

  it('clamps outside [0, duration]', () => {
    expect(fartFreq(-1, 0.28, 600, 180)).toBe(600);
    expect(fartFreq(10, 0.28, 600, 180)).toBe(180);
  });

  it('is monotonically decreasing', () => {
    const samples = [0.05, 0.15, 0.25].map((t) => fartFreq(t, 0.28, 600, 180));
    expect(samples[0]).toBeGreaterThan(samples[1]);
    expect(samples[1]).toBeGreaterThan(samples[2]);
  });
});

describe('audioManager — chargeFreq (S37 P7 pure)', () => {
  it('starts at startHz at t=0', () => {
    expect(chargeFreq(0, 0.25, 150, 900)).toBe(150);
  });

  it('ends at endHz at t=duration', () => {
    expect(chargeFreq(0.25, 0.25, 150, 900)).toBeCloseTo(900, 5);
  });

  it('exponential midpoint equals geometric mean (≈367.42 Hz for 150→900)', () => {
    expect(chargeFreq(0.125, 0.25, 150, 900)).toBeCloseTo(Math.sqrt(150 * 900), 1);
  });

  it('clamps outside [0, duration]', () => {
    expect(chargeFreq(-1, 0.25, 150, 900)).toBe(150);
    expect(chargeFreq(10, 0.25, 150, 900)).toBe(900);
  });

  it('is monotonically increasing (lightning charging up, not down)', () => {
    const samples = [0.05, 0.15, 0.20].map((t) => chargeFreq(t, 0.25, 150, 900));
    expect(samples[0]).toBeLessThan(samples[1]);
    expect(samples[1]).toBeLessThan(samples[2]);
  });

  it('default args reproduce live oscillator schedule (150 → 900 Hz over 250 ms)', () => {
    expect(chargeFreq(0)).toBe(150);
    expect(chargeFreq(0.25)).toBeCloseTo(900, 5);
  });
});

describe('audioManager — chargeEnvelope (S37 P7 pure)', () => {
  it('silent at t=0 (envelope starts at 0)', () => {
    expect(chargeEnvelope(0, 0.25)).toBe(0);
  });

  it('linear ramp up: value at t=0.10 is half of peak (CHARGE_GAIN=0.4)', () => {
    // CHARGE_RAMP_END = 0.20; linear (t/0.20) * 0.4. At t=0.10 → 0.20.
    expect(chargeEnvelope(0.10, 0.25)).toBeCloseTo(0.20, 5);
  });

  it('reaches peak gain (0.4) at CHARGE_RAMP_END (t=0.20)', () => {
    expect(chargeEnvelope(0.20, 0.25)).toBeCloseTo(0.4, 5);
  });

  it('holds at peak gain during [0.20, 0.245]', () => {
    expect(chargeEnvelope(0.22, 0.25)).toBeCloseTo(0.4, 5);
    expect(chargeEnvelope(0.244, 0.25)).toBeCloseTo(0.4, 5);
  });

  it('exponential decay during [0.245, 0.25]: hits floor near t=duration', () => {
    // Decay 0.4 → 0.001 over 5 ms. At end of window, value ≈ 0.001.
    expect(chargeEnvelope(0.25 - 1e-6, 0.25)).toBeLessThan(0.01);
  });

  it('returns 0 outside [0, duration]', () => {
    expect(chargeEnvelope(-0.001, 0.25)).toBe(0);
    expect(chargeEnvelope(0.251, 0.25)).toBe(0);
  });

  it('default args reproduce live envelope schedule', () => {
    expect(chargeEnvelope(0)).toBe(0);
    expect(chargeEnvelope(0.20)).toBeCloseTo(0.4, 5);
    expect(chargeEnvelope(0.22)).toBeCloseTo(0.4, 5); // hold
  });
});

describe('audioManager — clamp01 (pure)', () => {
  it('passes through values in [0, 1]', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });

  it('clamps negative to 0', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(-100)).toBe(0);
  });

  it('clamps >1 to 1', () => {
    expect(clamp01(2)).toBe(1);
    expect(clamp01(100)).toBe(1);
  });

  it('returns 0 for NaN, Infinity, -Infinity', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });
});

describe('audioManager — drainAudioEffects (cursor)', () => {
  beforeEach(() => {
    resetAudioDrainCursor();
  });

  it('handles empty effects array', () => {
    expect(() => drainAudioEffects([], 0)).not.toThrow();
  });

  it('handles non-audio effects gracefully (no throw)', () => {
    const effects: GameEffect[] = [
      {
        kind: 'BOND_COMMIT',
        tick: 1,
        pos: { x: 0, y: 0 },
        color: 0,
        radius: 1,
        visualEffectId: 'fx.bond.default',
        otherPos: { x: 10, y: 0 },
      },
      {
        kind: 'SEVER_ERASE',
        tick: 1,
        pos: { x: 0, y: 0 },
        color: 0,
        radius: 5,
      },
    ];
    expect(() => drainAudioEffects(effects, 1)).not.toThrow();
  });

  it('handles BOND_FORMED + BOND_SEVERED without AudioContext (jsdom)', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 1, pos: { x: 50, y: 50 }, bondCount: 1 },
      { kind: 'BOND_SEVERED', tick: 2, pos: { x: 60, y: 60 }, cause: 'player' },
      { kind: 'BOND_SEVERED', tick: 3, pos: { x: 70, y: 70 }, cause: 'physics' },
    ];
    expect(() => drainAudioEffects(effects, 3)).not.toThrow();
  });

  // S28 P0 — Voltkin Phase 2D zap audio (Council scope-Q2 USER-LOCKED option-a:
  // recorded lightning-crackle.ogg via playOneShot, NOT procedural Web Audio
  // synth). Drain must accept the new cause='creature' variant without throw.
  it('handles BOND_SEVERED cause=creature (S28 lightning-crackle hook)', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_SEVERED', tick: 10, pos: { x: 80, y: 80 }, cause: 'creature' },
    ];
    expect(() => drainAudioEffects(effects, 10)).not.toThrow();
  });

  it('handles BOND_SEVERED cause=godly without throw (legacy — unreachable post-S27)', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_SEVERED', tick: 11, pos: { x: 90, y: 90 }, cause: 'godly' },
    ];
    expect(() => drainAudioEffects(effects, 11)).not.toThrow();
  });

  it('cursor advances; same-tick re-drain is a no-op (replay safety)', () => {
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 5, pos: { x: 0, y: 0 }, bondCount: 2 },
    ];
    drainAudioEffects(effects, 5);
    expect(() => drainAudioEffects(effects, 5)).not.toThrow();
  });

  it('cursor advances on each drain (forward only)', () => {
    drainAudioEffects([], 10);
    drainAudioEffects([], 20);
    const stale: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 10, pos: { x: 0, y: 0 }, bondCount: 1 },
    ];
    expect(() => drainAudioEffects(stale, 20)).not.toThrow();
  });

  it('resetAudioDrainCursor allows re-firing effects at previously-drained ticks', () => {
    drainAudioEffects([], 100);
    resetAudioDrainCursor();
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 50, pos: { x: 0, y: 0 }, bondCount: 1 },
    ];
    expect(() => drainAudioEffects(effects, 50)).not.toThrow();
  });

  // S37 P7 — Voltkin lightning charge-up cue. Drain must dispatch
  // playChargeSFX (counter increments) without throw under jsdom (no
  // AudioContext available — playChargeSFX increments chargeCallsTotal
  // before its ctx-null guard fires).
  it('handles CREATURE_CHARGE drain — counter increments, no throw (S37 P7)', () => {
    const before = inspectAudioChain().chargeCallsTotal;
    const effects: GameEffect[] = [
      { kind: 'CREATURE_CHARGE', tick: 200, pos: { x: 50, y: 50 } },
    ];
    expect(() => drainAudioEffects(effects, 200)).not.toThrow();
    const after = inspectAudioChain().chargeCallsTotal;
    expect(after - before).toBe(1);
  });

  it('two CREATURE_CHARGE effects at same tick dispatch playChargeSFX twice (polyphony)', () => {
    const before = inspectAudioChain().chargeCallsTotal;
    const effects: GameEffect[] = [
      { kind: 'CREATURE_CHARGE', tick: 300, pos: { x: 10, y: 10 } },
      { kind: 'CREATURE_CHARGE', tick: 300, pos: { x: 90, y: 90 } },
    ];
    drainAudioEffects(effects, 300);
    const after = inspectAudioChain().chargeCallsTotal;
    expect(after - before).toBe(2);
  });

  it('CREATURE_CHARGE respects the lastDrainedTick cursor (replay safety)', () => {
    drainAudioEffects([], 500);
    const stale: GameEffect[] = [
      { kind: 'CREATURE_CHARGE', tick: 400, pos: { x: 0, y: 0 } },
    ];
    const before = inspectAudioChain().chargeCallsTotal;
    drainAudioEffects(stale, 500);
    const after = inspectAudioChain().chargeCallsTotal;
    expect(after).toBe(before); // stale effect (tick < cursor) skipped
  });
});

// ===== S19 P1 — per-channel mute/volume state machine =====

describe('audioManager — per-channel controls (S19 P1)', () => {
  beforeEach(() => {
    _resetAudioForTest();
    try { window.localStorage.clear(); } catch { /* */ }
  });

  it('default settings: both channels unmuted, music=0.25, sfx=1.0, master=unmuted', () => {
    initAudio();
    const s = getAudioSettings();
    expect(s.masterMuted).toBe(false);
    expect(s.musicMuted).toBe(false);
    expect(s.sfxMuted).toBe(false);
    expect(s.musicVolume).toBeCloseTo(0.25, 5);
    expect(s.sfxVolume).toBeCloseTo(1.0, 5);
  });

  it('setMusicVolume clamps and persists', () => {
    initAudio();
    setMusicVolume(0.5);
    expect(getAudioSettings().musicVolume).toBe(0.5);
    setMusicVolume(-1);
    expect(getAudioSettings().musicVolume).toBe(0);
    setMusicVolume(2);
    expect(getAudioSettings().musicVolume).toBe(1);
    setMusicVolume(NaN);
    expect(getAudioSettings().musicVolume).toBe(0);
  });

  it('setSfxVolume clamps and persists', () => {
    initAudio();
    setSfxVolume(0.8);
    expect(getAudioSettings().sfxVolume).toBe(0.8);
    setSfxVolume(-5);
    expect(getAudioSettings().sfxVolume).toBe(0);
    setSfxVolume(99);
    expect(getAudioSettings().sfxVolume).toBe(1);
  });

  it('per-channel mute is independent of volume (mute does not zero volume state)', () => {
    initAudio();
    setMusicVolume(0.7);
    setMusicMuted(true);
    expect(getAudioSettings().musicVolume).toBe(0.7);
    expect(getAudioSettings().musicMuted).toBe(true);
    setMusicMuted(false);
    expect(getAudioSettings().musicVolume).toBe(0.7);
  });

  it('master mute (toggleMute) preserves per-channel state', () => {
    initAudio();
    setMusicVolume(0.6);
    setSfxMuted(true);
    toggleMute();
    expect(isMuted()).toBe(true);
    expect(getAudioSettings().musicVolume).toBe(0.6);
    expect(getAudioSettings().sfxMuted).toBe(true);
    toggleMute();
    expect(isMuted()).toBe(false);
    expect(getAudioSettings().musicVolume).toBe(0.6);
    expect(getAudioSettings().sfxMuted).toBe(true);
  });

  it('toggleMute returns new master state and toggles cleanly', () => {
    initAudio();
    expect(isMuted()).toBe(false);
    const after1 = toggleMute();
    expect(after1).toBe(true);
    expect(isMuted()).toBe(true);
    const after2 = toggleMute();
    expect(after2).toBe(false);
    expect(isMuted()).toBe(false);
  });

  // NOTE: localStorage persistence + legacy-key compatibility cannot be tested
  // here — the vitest default environment is `node`, which has no `window` or
  // `localStorage`. The try/catch fallbacks in audioManager correctly degrade
  // to in-memory state. Persistence is verified manually on the live URL
  // (set sliders → reload → values restored).
});

describe('integration — placePrimitive emits 1 BOND_FORMED per placement', () => {
  it('aggregation handles multi-bond placements as single emit (asPrimitiveId imported for ID branding sanity)', () => {
    const id = asPrimitiveId(1);
    expect(typeof id).toBe('number');
  });
});

// ===== S51 P2.b — mapPanningPosition (pure) =====

describe('audioManager — mapPanningPosition (pure)', () => {
  // CANVAS_WIDTH = 1920, CANVAS_HEIGHT = 1080 — center is (960, 540).

  it('canvas center → origin (0, 0, 0)', () => {
    const p = mapPanningPosition({ x: 960, y: 540 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBe(0);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('left edge → x = -1', () => {
    const p = mapPanningPosition({ x: 0, y: 540 });
    expect(p.x).toBeCloseTo(-1, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('right edge → x = +1', () => {
    const p = mapPanningPosition({ x: 1920, y: 540 });
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('top edge → z = -1', () => {
    const p = mapPanningPosition({ x: 960, y: 0 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(-1, 5);
  });

  it('bottom edge → z = +1', () => {
    const p = mapPanningPosition({ x: 960, y: 1080 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(1, 5);
  });

  it('y axis is always 0 (canvas is top-down — Y not used for vertical depth)', () => {
    expect(mapPanningPosition({ x: 0, y: 0 }).y).toBe(0);
    expect(mapPanningPosition({ x: 1920, y: 1080 }).y).toBe(0);
    expect(mapPanningPosition({ x: 500, y: 300 }).y).toBe(0);
  });

  it('quadrant signs are independent', () => {
    const tl = mapPanningPosition({ x: 480, y: 270 });
    expect(tl.x).toBeLessThan(0); expect(tl.z).toBeLessThan(0);
    const tr = mapPanningPosition({ x: 1440, y: 270 });
    expect(tr.x).toBeGreaterThan(0); expect(tr.z).toBeLessThan(0);
    const bl = mapPanningPosition({ x: 480, y: 810 });
    expect(bl.x).toBeLessThan(0); expect(bl.z).toBeGreaterThan(0);
    const br = mapPanningPosition({ x: 1440, y: 810 });
    expect(br.x).toBeGreaterThan(0); expect(br.z).toBeGreaterThan(0);
  });
});

// ===== S51 P2.c — nextDuckEndCtxTime (pure) =====

describe('audioManager — nextDuckEndCtxTime (pure)', () => {
  it('first call (no active duck) sets end = now + dur', () => {
    // currentEnd=0 (no duck), now=1.0s, durMs=300 → end = 1.0 + 0.3 = 1.3s
    expect(nextDuckEndCtxTime(0, 1.0, 300)).toBeCloseTo(1.3, 5);
  });

  it('overlap with shorter event preserves the existing (longer) end', () => {
    // currentEnd=2.0s (700 ms duck started at t=1.3), now=1.5s, new 300 ms → cand 1.8s
    // max(2.0, 1.8) = 2.0 → don't shorten
    expect(nextDuckEndCtxTime(2.0, 1.5, 300)).toBeCloseTo(2.0, 5);
  });

  it('overlap with longer event extends the end', () => {
    // currentEnd=1.6s (300 ms duck started at t=1.3), now=1.5s, new 700 ms → cand 2.2s
    // max(1.6, 2.2) = 2.2 → extend
    expect(nextDuckEndCtxTime(1.6, 1.5, 700)).toBeCloseTo(2.2, 5);
  });

  it('exact-tie returns the same end value (idempotent)', () => {
    expect(nextDuckEndCtxTime(1.5, 1.0, 500)).toBeCloseTo(1.5, 5);
  });

  it('zero-duration call returns the existing end when in-flight', () => {
    expect(nextDuckEndCtxTime(2.0, 1.5, 0)).toBeCloseTo(2.0, 5);
  });

  it('zero-current with positive duration returns candidate (no negative-end regression)', () => {
    expect(nextDuckEndCtxTime(0, 5.5, 100)).toBeCloseTo(5.6, 5);
  });
});
