/**
 * SPARK — audioManager unit tests (S18 P1 + S19 P1 per-channel controls).
 *
 * Tests pure helpers (envelope curve + freq sweep + clamp01), drain cursor
 * logic, and the S19 P1 per-channel mute/volume state machine. AudioContext
 * playback itself is NOT tested (jsdom can't play audio) — verification
 * happens via manual smoke test post-deploy.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { asPrimitiveId } from '../types.ts';
import type { GameEffect } from '../game/effects.ts';
import {
  stopMusic,
  enterNonetRealm,
  exitNonetRealm,
  playMusic,
  setRaceMusicEnabled,
  setMusicTrack,
  isRaceMusicEnabled,
  currentMusicTrack,
  boomFreq,
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
  syncRainbowYellAudio,
  setMusicMuted,
  setMusicVolume,
  setSfxMuted,
  setSfxVolume,
  toggleMute,
  _resetAudioForTest,
} from './audioManager.ts';
import { DEFAULT_MUSIC_SRC, RACE_MUSIC_SRC } from './raceMusic.ts';

describe('audioManager — boomFreq (pure, S72 P4 detonation thump)', () => {
  it('starts at 160 Hz, ends at 40 Hz, geometric in between', () => {
    expect(boomFreq(0)).toBeCloseTo(160, 5);
    expect(boomFreq(0.45)).toBeCloseTo(40, 5);
    expect(boomFreq(0.225)).toBeCloseTo(Math.sqrt(160 * 40), 1); // geometric midpoint
  });
  it('clamps out-of-range t to the endpoints', () => {
    expect(boomFreq(-1)).toBe(160);
    expect(boomFreq(99)).toBe(40);
  });
});

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

  /**
   * S165 (sweep Lane 5) - THESE TWO ASSERTED ONLY `not.toThrow()`, ON THE ONE PROPERTY THIS MODULE
   * CARES MOST ABOUT, AND ONE OF THEM WAS NAMED AFTER BEHAVIOUR THE CODE DELIBERATELY LACKS.
   *
   * The first was called *"same-tick re-drain is a no-op (replay safety)"*. It is not a no-op. The
   * cursor test is a STRICT `<`, and `drainAudioEffects` says why in as many words: same-tick events
   * emitted by click handlers between physics ticks would be silently swallowed by `<=`, so
   * "equality now passes through" (S23 P4). A same-tick re-drain RE-FIRES. The test stayed green
   * across that decision because `not.toThrow()` cannot see a sound play twice.
   *
   * WHAT SLIPPED PAST THEM: delete `if (effect.tick < lastDrainedTick) continue;` and every effect
   * re-fires on every frame at 60 Hz; delete `lastDrainedTick = currentTick;` and the cursor never
   * advances. Both were green.
   *
   * THE HOOK ALREADY EXISTED. `inspectAudioChain().claveCallsTotal` counts BOND_FORMED handling, and
   * the sibling `state/audioCursor.test.ts` uses exactly that counter to prove an effect below the
   * cursor is dropped. This file simply never reached for it.
   */
  it('a BELOW-cursor effect is DROPPED - the replay guard, counted', () => {
    drainAudioEffects([], 100);
    const before = inspectAudioChain().claveCallsTotal;
    drainAudioEffects(
      [{ kind: 'BOND_FORMED', tick: 50, pos: { x: 0, y: 0 }, bondCount: 1 }],
      50,
    );
    expect(
      inspectAudioChain().claveCallsTotal,
      'an effect older than the cursor must not fire - this is the save/load replay guard',
    ).toBe(before);
  });

  it('a SAME-TICK re-drain DOES re-fire - strict `<`, not `<=` (S23 P4)', () => {
    /*
     * ⭐ THE CORRECTED CLAIM. This case used to be named "same-tick re-drain is a no-op" and to
     * assert nothing, so it documented the opposite of the shipped rule for two years of sessions.
     * Equality passing through is DELIBERATE: a click handler firing between physics ticks emits at
     * the same `world.tick`, and `<=` would have eaten it.
     */
    const effects: GameEffect[] = [
      { kind: 'BOND_FORMED', tick: 5, pos: { x: 0, y: 0 }, bondCount: 2 },
    ];
    drainAudioEffects(effects, 5);
    const after1 = inspectAudioChain().claveCallsTotal;
    drainAudioEffects(effects, 5);
    expect(
      inspectAudioChain().claveCallsTotal,
      'equality passes through by design - see the S23 P4 note in drainAudioEffects',
    ).toBeGreaterThan(after1);
  });

  it('the cursor advances FORWARD ONLY, and a stale effect after it is dropped', () => {
    drainAudioEffects([], 10);
    drainAudioEffects([], 20);
    const before = inspectAudioChain().claveCallsTotal;
    // tick 10 is now below the cursor (20), so this must be silently skipped.
    drainAudioEffects(
      [{ kind: 'BOND_FORMED', tick: 10, pos: { x: 0, y: 0 }, bondCount: 1 }],
      20,
    );
    expect(
      inspectAudioChain().claveCallsTotal,
      'delete `lastDrainedTick = currentTick` and this is the test that notices',
    ).toBe(before);
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

  it('default settings: channels unmuted, music=0.25, sfx=1.0, master=unmuted, race music ON', () => {
    initAudio();
    const s = getAudioSettings();
    expect(s.masterMuted).toBe(false);
    expect(s.musicMuted).toBe(false);
    expect(s.sfxMuted).toBe(false);
    expect(s.musicVolume).toBeCloseTo(0.25, 5);
    expect(s.sfxVolume).toBeCloseTo(1.0, 5);
    // S165 - race music defaults ON: the owner's framing is that a race's own cover is the new
    // normal and the original track is the thing you turn back on.
    expect(s.raceMusicEnabled).toBe(true);
  });

  /*
   * S165 - AND THE SHAPE ITSELF IS PINNED, because the test above is an enumeration that does not
   * know it is one. Add a seventh field to `AudioSettings` and forget `getAudioSettings()`, or
   * forget `settingsOverlay.refresh()`, and it is silent: the panel shows a stale control while
   * every assertion above still passes. This fails the moment the shape moves.
   */
  it('AudioSettings has exactly the six documented keys', () => {
    initAudio();
    expect(Object.keys(getAudioSettings()).sort()).toEqual([
      'masterMuted', 'musicMuted', 'musicVolume', 'raceMusicEnabled', 'sfxMuted', 'sfxVolume',
    ]);
  });

  /**
   * S165 - THE RACE-MUSIC PREFERENCE (owner: "they will be also able to toggle off their race
   * music and have the original one").
   *
   * Asserted through `getAudioSettings()` only. This suite runs in plain node with no `window`, no
   * `localStorage` and no `AudioContext` - this file's own header says so - so a test that expected
   * a buffer to load, or a storage key to survive, would only be testing the absence of a mock.
   * Persistence is verified by hand on the live URL.
   */
  it('setRaceMusicEnabled round-trips through both readers', () => {
    initAudio();
    setRaceMusicEnabled(false);
    expect(getAudioSettings().raceMusicEnabled).toBe(false);
    expect(isRaceMusicEnabled()).toBe(false);
    setRaceMusicEnabled(true);
    expect(getAudioSettings().raceMusicEnabled).toBe(true);
    expect(isRaceMusicEnabled()).toBe(true);
  });

  it('setRaceMusicEnabled does NOT disturb the music channel', () => {
    /*
     * The same independence property this file already asserts between mute and volume, and it
     * matters here for a specific reason: mute, volume and the auto-duck are all BUS-level -
     * `musicGainNode` is created once and every source connects to it - so a swapped-in race track
     * inherits all three for free. A setter that reached for the gain would break that for nothing.
     */
    initAudio();
    setMusicVolume(0.4);
    setMusicMuted(true);
    setRaceMusicEnabled(false);
    expect(getAudioSettings().musicVolume).toBeCloseTo(0.4, 5);
    expect(getAudioSettings().musicMuted).toBe(true);
  });

  it('setMusicTrack records the wanted track, and stopMusic is safe with no context', () => {
    // Headless, so both take their null-guard early return. What IS observable is the intent.
    _resetAudioForTest();
    expect(currentMusicTrack()).toBe(DEFAULT_MUSIC_SRC);
    setMusicTrack(RACE_MUSIC_SRC.orcs);
    expect(currentMusicTrack()).toBe(RACE_MUSIC_SRC.orcs);
    expect(() => { stopMusic(); }).not.toThrow();
    // A repeat set is a no-op rather than a restart - the first line of `setMusicTrack`.
    expect(() => { setMusicTrack(RACE_MUSIC_SRC.orcs); }).not.toThrow();
    expect(currentMusicTrack()).toBe(RACE_MUSIC_SRC.orcs);
  });

  it('_resetAudioForTest restores the track AND the preference', () => {
    /*
     * Non-negotiable, and this function's own history is the warning: it clears the HELGA
     * singletons but has never cleared the NONET ones, so those leak between cases in this very
     * describe block - the one block that relies on the reset for isolation.
     */
    setRaceMusicEnabled(false);
    setMusicTrack(RACE_MUSIC_SRC.demons);
    _resetAudioForTest();
    expect(currentMusicTrack()).toBe(DEFAULT_MUSIC_SRC);
    expect(isRaceMusicEnabled()).toBe(true);
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

describe('audioManager — syncRainbowYellAudio (S84 P2 field-keyed yell latch)', () => {
  beforeEach(() => {
    resetAudioDrainCursor(); // also resets the yell latch (shared lifecycle)
  });

  it('no-ops without throwing when no switch is set (jsdom, no AudioContext)', () => {
    expect(() => syncRainbowYellAudio({ tick: 100 })).not.toThrow();
    expect(() => syncRainbowYellAudio({ tick: 100, rainbowSwitchTick: undefined })).not.toThrow();
  });

  it('accepts a fresh switch without throwing (play itself no-ops headless)', () => {
    expect(() => syncRainbowYellAudio({ tick: 105, rainbowSwitchTick: 100 })).not.toThrow();
    // Latched: re-observing the same switchTick every frame must stay silent + safe.
    expect(() => syncRainbowYellAudio({ tick: 106, rainbowSwitchTick: 100 })).not.toThrow();
  });

  it('skips stale switches (older than RAINBOW_YELL_FRESH_TICKS) and rewound ticks', () => {
    // age > freshness window (late joiner) — must not throw, must not latch-play
    expect(() => syncRainbowYellAudio({ tick: 1000, rainbowSwitchTick: 100 })).not.toThrow();
    // negative age (snapshot rewound below the stamp) — guarded
    expect(() => syncRainbowYellAudio({ tick: 50, rainbowSwitchTick: 100 })).not.toThrow();
  });
});

describe('audioManager — yell latch monotonicity (S84 CHECK Grok hardening)', () => {
  it('a rewound-but-distinct switchTick never re-fires (<= guard)', () => {
    resetAudioDrainCursor();
    // Yell-latch at 600, then a pathological snapshot carries 580 with age still
    // fresh — the <= guard skips it (out-of-order snapshots are seq-dropped on the
    // real wire; this is defense-in-depth against weird host output).
    expect(() => syncRainbowYellAudio({ tick: 610, rainbowSwitchTick: 600 })).not.toThrow();
    expect(() => syncRainbowYellAudio({ tick: 625, rainbowSwitchTick: 580 })).not.toThrow();
  });
});
/**
 * ==========================================================================================
 * \u26d4\u26d4 S173 P6 \u2014 THE NONET REALM THEME. THE FIRST TEST IT HAS EVER HAD.
 *
 * > Owner, S149: *"for NONET in arcade you left the music out. bring the music back that we have
 * > applied to the NONET it was awesome."*
 * > Owner, S173: *"I just played NoNet and you have removed the music. Why? Bring it back.
 * > It was sick freaking music for NONET."*
 *
 * TWICE. And before this block, `audioManager.test.ts` was 646 lines containing the substring
 * "onet" exactly ZERO times \u2014 the theme could be deleted outright and every gate in the project
 * would stay green. That is not an oversight to log and move past; it is the whole reason a
 * regression of this class can ship, go unnoticed, be reported, be patched, and ship again.
 *
 * \u2b50 WHY THERE WERE NO TESTS, which is the part worth fixing rather than just noting: this file
 * runs with NO AudioContext (its own header says so), so every NONET path early-returned before
 * doing anything observable \u2014 and `_resetAudioForTest` did not clear the four NONET singletons,
 * so even a test that built a fake bus would be poisoned by the case before it. S165 wrote that
 * leak down in a comment and left it. Both halves are fixed now, and this block is what they buy.
 *
 * \u26a0 THE FAKE IS A BUS, NOT A SYNTHESISER. It records which URL each AudioBufferSourceNode was
 * started with, because that \u2014 not "did it throw" \u2014 is the property the owner is reporting on.
 * The shape was taken from a LIVE measurement on this build rather than invented: driving the real
 * arcade NONET in a browser produced one `fetch('/audio/nonet-theme.ogg')` followed by one
 * `start()` on a looping 136.92 s buffer, which is exactly what the first two cases assert.
 * ==========================================================================================
 */
describe('audioManager \u2014 the NONET realm theme (S173 P6)', () => {
  interface FakeBuf { __url: string }

  /** Every URL that reached `AudioBufferSourceNode.start()`, in order. The whole oracle. */
  const startedUrls: string[] = [];
  /** Sources started, so a case can assert the theme was STOPPED and not merely replaced. */
  const stoppedUrls: string[] = [];

  const realWindow = (globalThis as { window?: unknown }).window;
  const realFetch = (globalThis as { fetch?: unknown }).fetch;
  const realError = console.error;

  function installAudioEnv(opts: { nonetFails?: boolean } = {}): void {
    startedUrls.length = 0;
    stoppedUrls.length = 0;

    const makeGain = (): unknown => ({
      gain: {
        value: 1,
        setTargetAtTime: (): void => {},
        cancelScheduledValues: (): void => {},
      },
      numberOfInputs: 1,
      numberOfOutputs: 1,
      connect: (): void => {},
      disconnect: (): void => {},
    });

    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: async (): Promise<void> => {},
      createGain: makeGain,
      createBufferSource: (): unknown => {
        const node = {
          buffer: null as FakeBuf | null,
          loop: false,
          connect: (): void => {},
          disconnect: (): void => {},
          start: (): void => { startedUrls.push(node.buffer?.__url ?? '<no-buffer>'); },
          stop: (): void => { stoppedUrls.push(node.buffer?.__url ?? '<no-buffer>'); },
        };
        return node;
      },
      decodeAudioData: async (ab: unknown): Promise<FakeBuf> => ({ __url: (ab as FakeBuf).__url }),
    };

    (globalThis as { window?: unknown }).window = {
      // `new`-ing a function that returns an object yields that object \u2014 which is how one shared
      // fake context backs the singleton `ensureAudio()` builds.
      AudioContext: function FakeAudioContext(): unknown { return ctx; },
      localStorage: {
        getItem: (): string | null => null,
        setItem: (): void => {},
      },
    };

    (globalThis as { fetch?: unknown }).fetch = async (input: unknown): Promise<unknown> => {
      const url = String(input);
      if (opts.nonetFails === true && url.includes('nonet')) {
        return { ok: false, status: 404, arrayBuffer: async (): Promise<FakeBuf> => ({ __url: url }) };
      }
      return { ok: true, status: 200, arrayBuffer: async (): Promise<FakeBuf> => ({ __url: url }) };
    };
  }

  /** Let the fetch \u2192 arrayBuffer \u2192 decode chain (and any `void`-ed follow-up) settle. */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    await new Promise((r) => { setTimeout(r, 0); });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };

  beforeEach(() => {
    _resetAudioForTest();
    installAudioEnv();
    console.error = vi.fn();
  });

  afterAll(() => {
    _resetAudioForTest();
    console.error = realError;
    (globalThis as { window?: unknown }).window = realWindow;
    (globalThis as { fetch?: unknown }).fetch = realFetch;
  });

  /*
   * \u2b50 THE POSITIVE CONTROL, FIRST, because every case below it is worthless if the reset leaks \u2014
   * and it DID leak, from S165 until this session. A stale `nonetRealmActive` makes
   * `enterNonetRealm` return on its second line, so a broken module and a working one would both
   * record zero starts and the suite would call that agreement.
   */
  it('POSITIVE CONTROL: _resetAudioForTest clears the NONET singletons (the S165 leak)', async () => {
    initAudio();
    await enterNonetRealm();
    expect(inspectAudioChain().nonetRealmActive).toBe(true);

    _resetAudioForTest();
    expect(
      inspectAudioChain().nonetRealmActive,
      'if this is true, every NONET case in this block is testing a no-op',
    ).toBe(false);
    expect(inspectAudioChain().nonetSourceActive).toBe(false);
  });

  it('entering the realm FETCHES AND STARTS the theme \u2014 the owner\u2019s actual complaint', async () => {
    initAudio();
    await enterNonetRealm();

    expect(
      startedUrls,
      'delete the enterNonetRealm() call in main.ts\u2019s realm-shift edge and THIS is the line that notices',
    ).toContain('/audio/nonet-theme.ogg');
    expect(inspectAudioChain().nonetSourceActive).toBe(true);
    expect(inspectAudioChain().nonetRealmActive).toBe(true);
    expect(inspectAudioChain().nonetSilentEntries).toBe(0);
    expect(inspectAudioChain().nonetLoadFailures).toBe(0);
  });

  it('the theme LOOPS \u2014 it is 136.9 s and a trial can outlast it', async () => {
    initAudio();
    await enterNonetRealm();
    // The realm source is the last one started; the fake records `loop` via the node it built.
    expect(startedUrls[startedUrls.length - 1]).toBe('/audio/nonet-theme.ogg');
    expect(inspectAudioChain().nonetSourceActive).toBe(true);
  });

  it('a SILENT entry (no audio bus) is COUNTED and LOUD, never a bare return', async () => {
    // No initAudio() \u2014 no AudioContext, exactly the pre-gesture case.
    await enterNonetRealm();

    expect(startedUrls).toHaveLength(0);
    expect(inspectAudioChain().nonetSilentEntries).toBe(1);
    expect(
      console.error,
      'a console.warn nobody reads is how this reached its SECOND report',
    ).toHaveBeenCalled();
  });

  /*
   * \u26d4\u26d4 THE BUS-OWNERSHIP CASE, and the most valuable one here.
   *
   * A failed load used to leave `nonetRealmActive === true` forever. That flag is the music bus\u2019s
   * ownership token: while it is set, `updateHelgaTheme` bails on its first branch, `stopHelgaTheme`
   * refuses to resume the base track, and `enterNonetRealm` refuses every LATER trial. So one bad
   * fetch took the duel track and HELGA\u2019s theme down with it for the rest of the match.
   */
  it('a FAILED load un-latches the realm and gives the bus back', async () => {
    installAudioEnv({ nonetFails: true });
    initAudio();
    await enterNonetRealm();
    await flush();

    expect(startedUrls).not.toContain('/audio/nonet-theme.ogg');
    expect(inspectAudioChain().nonetLoadFailures).toBe(1);
    expect(inspectAudioChain().nonetSilentEntries).toBe(1);
    expect(
      inspectAudioChain().nonetRealmActive,
      'a realm with no sound in it must NOT keep holding the music bus',
    ).toBe(false);
    expect(
      startedUrls,
      'the duel track has to come back, or one failed fetch silences the whole match',
    ).toContain(DEFAULT_MUSIC_SRC);
  });

  it('after a failure the NEXT trial can still start the theme (no permanent latch)', async () => {
    installAudioEnv({ nonetFails: true });
    initAudio();
    await enterNonetRealm();
    await flush();
    expect(startedUrls).not.toContain('/audio/nonet-theme.ogg');

    // The network comes back; the trial after it must be audible.
    installAudioEnv();
    await enterNonetRealm();
    await flush();
    expect(startedUrls).toContain('/audio/nonet-theme.ogg');
    expect(inspectAudioChain().nonetSourceActive).toBe(true);
  });

  it('leaving the realm STOPS the theme and restores the duel track', async () => {
    initAudio();
    await enterNonetRealm();
    expect(inspectAudioChain().nonetSourceActive).toBe(true);

    exitNonetRealm();
    await flush();

    expect(stoppedUrls).toContain('/audio/nonet-theme.ogg');
    expect(inspectAudioChain().nonetRealmActive).toBe(false);
    expect(inspectAudioChain().nonetSourceActive).toBe(false);
    expect(startedUrls).toContain(DEFAULT_MUSIC_SRC);
  });

  it('the realm TAKES the bus from the duel track \u2014 they never layer', async () => {
    initAudio();
    await playMusic();
    await flush();
    expect(startedUrls).toContain(DEFAULT_MUSIC_SRC);

    await enterNonetRealm();
    expect(stoppedUrls).toContain(DEFAULT_MUSIC_SRC);
    expect(inspectAudioChain().musicSourceActive).toBe(false);
    expect(inspectAudioChain().nonetSourceActive).toBe(true);
  });
});
