/**
 * SPARK — audio subsystem (S18 P1 + S19 P1 per-channel controls).
 *
 * Wires the user-supplied Suno background music + 2 procedural SFX:
 *   - Clave-tap SFX on bond-form (ONE per placement, regardless of N bonds)
 *   - Descending pitch sweep on player-cause sever (skipped for physics-cause)
 *
 * Audio graph (S19 P1):
 *   music source ───▶ musicGain ───┐
 *                                  ├──▶ masterGain ──▶ destination
 *   SFX envelope ──▶ sfxGain ──────┘
 *
 *   - masterGain: 'M' global pause target (0/1). Preserves per-channel state.
 *   - musicGain:  per-channel volume + mute. effective = muted ? 0 : volume.
 *   - sfxGain:    per-channel volume + mute. effective = muted ? 0 : volume.
 *
 * Design (Council R1 + S19 PRIME-AUDIT adoptions):
 *   - Singleton AudioContext, lazy-init on first user gesture
 *   - 4 new localStorage keys: audio.musicMuted / audio.sfxMuted /
 *     audio.musicVolume / audio.sfxVolume (defaults: false / false / 0.25 / 1.0
 *     — music defaulted to its previous MUSIC_GAIN constant so existing
 *     playtest experience is preserved)
 *   - Legacy `spark_audio_muted` retained: drives masterGain global pause
 *     ('M' key state). Lets prior users keep their mute preference.
 *   - Music: AudioBufferSourceNode loop (fetched once, decoded once)
 *   - SFX: synthesized via Web Audio oscillators
 *   - Replay-safe via `lastDrainedTick` cursor
 *   - localStorage access wrapped in try/catch (Safari private mode safe)
 *   - AudioContext.resume() on every play call (tab-blur recovery)
 *
 * Pure helpers exported for unit tests:
 *   - claveEnvelope(t, duration)
 *   - fartFreq(t, duration, startHz, endHz)
 *   - clamp01(n)
 */

import type { GameEffect } from '../game/effects.ts';

const MUSIC_URL = '/audio/blue-steppe-orbit.mp3';
const DEFAULT_MUSIC_VOLUME = 0.25;
const DEFAULT_SFX_VOLUME = 1.0;
const CLAVE_GAIN = 0.4;
const FART_GAIN = 0.35;
const CLAVE_DURATION = 0.03;
const FART_DURATION = 0.28;

/**
 * S28 P0 — Voltkin Phase 2D zap audio. Recorded lightning-crackle.ogg (18 KB)
 * deployed from assets-source/godly-voltkin/audio/ at S28 boot (Council scope-Q2
 * USER-LOCKED option-a: recorded SFX over procedural Web Audio synth). Replaces
 * S27 Δ6 carry-forward silent BOND_SEVERED cause='creature'. Routed via the
 * existing playOneShot() → sfxGainNode bus so the M-key master mute + SFX
 * channel mute both respect it.
 */
const LIGHTNING_CRACKLE_URL = '/godly/voltkin/audio/lightning-crackle.ogg';

const STORAGE_KEY_MASTER_MUTED = 'spark_audio_muted';
const STORAGE_KEY_MUSIC_MUTED = 'audio.musicMuted';
const STORAGE_KEY_SFX_MUTED = 'audio.sfxMuted';
const STORAGE_KEY_MUSIC_VOLUME = 'audio.musicVolume';
const STORAGE_KEY_SFX_VOLUME = 'audio.sfxVolume';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGainNode: GainNode | null = null;
let sfxGainNode: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicFetchPromise: Promise<AudioBuffer> | null = null;

let masterMuted = false;
let musicMuted = false;
let sfxMuted = false;
let musicVolume = DEFAULT_MUSIC_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;

let lastDrainedTick = -1;
let initialized = false;

// S23 P3 — diagnostic counters surfaced via inspectAudioChain for the debug
// overlay. Increment at function entry / after gate passes so the overlay can
// distinguish "never called" from "called but gate failed" from "synth ran".
let claveCallsTotal = 0;
let claveCallsSynthed = 0;
let fartCallsTotal = 0;
let fartCallsSynthed = 0;

/** Clamp a number into [0, 1]. NaN and non-finite values become 0. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    const parsed = Number.parseFloat(v);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp01(parsed);
  } catch {
    return fallback;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari private mode / quota / SecurityError → silent
  }
}

function loadSettingsFromStorage(): void {
  masterMuted = readBool(STORAGE_KEY_MASTER_MUTED, false);
  musicMuted = readBool(STORAGE_KEY_MUSIC_MUTED, false);
  sfxMuted = readBool(STORAGE_KEY_SFX_MUTED, false);
  musicVolume = readNumber(STORAGE_KEY_MUSIC_VOLUME, DEFAULT_MUSIC_VOLUME);
  sfxVolume = readNumber(STORAGE_KEY_SFX_VOLUME, DEFAULT_SFX_VOLUME);
  // S23 P2 (Defensive Fix 2 + 3) — surface state on init so debug=1 / DEV can
  // distinguish "user muted intentionally" from "stale localStorage corruption".
  // Always logs (cheap, infrequent — single fire per session). Critical for
  // diagnosing the "music works but SFX silent" path the user reported.
  const debugOn = isDebugRequested();
  if (debugOn) {
    console.log('[audio] loadSettings:', {
      masterMuted, musicMuted, sfxMuted, musicVolume, sfxVolume,
    });
  }
  if (masterMuted) {
    console.warn(
      '[audio] spark_audio_muted=true (legacy M-key master mute) is active — '
      + 'this silences BOTH music and SFX regardless of per-channel toggles. '
      + 'Press M in-game to toggle off, or window.localStorage.removeItem("spark_audio_muted").',
    );
  }
  if (sfxMuted) {
    console.warn('[audio] audio.sfxMuted=true — SFX bus muted via settings overlay.');
  }
  if (sfxVolume === 0 && !sfxMuted) {
    console.warn('[audio] audio.sfxVolume=0 — SFX bus silent despite not being muted.');
  }
}

/** S23 P2 — debug flag read from URL once per page-load. Guards verbose logs. */
function isDebugRequested(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.location !== undefined
      && window.location.search.includes('debug=1');
  } catch {
    return false;
  }
}

function applyMusicGain(): void {
  if (musicGainNode === null || audioContext === null) return;
  const target = musicMuted ? 0 : clamp01(musicVolume);
  musicGainNode.gain.setTargetAtTime(target, audioContext.currentTime, 0.005);
}

function applySfxGain(): void {
  if (sfxGainNode === null || audioContext === null) return;
  const target = sfxMuted ? 0 : clamp01(sfxVolume);
  sfxGainNode.gain.setTargetAtTime(target, audioContext.currentTime, 0.005);
}

function applyMasterGain(): void {
  if (masterGain === null || audioContext === null) return;
  masterGain.gain.setTargetAtTime(masterMuted ? 0 : 1, audioContext.currentTime, 0.005);
}

function ensureAudio(): AudioContext | null {
  if (audioContext !== null) return audioContext;
  try {
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor === undefined) return null;
    audioContext = new AudioContextCtor();

    masterGain = audioContext.createGain();
    masterGain.gain.value = masterMuted ? 0 : 1;
    masterGain.connect(audioContext.destination);

    musicGainNode = audioContext.createGain();
    musicGainNode.gain.value = musicMuted ? 0 : clamp01(musicVolume);
    musicGainNode.connect(masterGain);

    sfxGainNode = audioContext.createGain();
    sfxGainNode.gain.value = sfxMuted ? 0 : clamp01(sfxVolume);
    sfxGainNode.connect(masterGain);

    initialized = true;
  } catch {
    audioContext = null;
    masterGain = null;
    musicGainNode = null;
    sfxGainNode = null;
  }
  return audioContext;
}

async function resumeIfSuspended(): Promise<void> {
  if (audioContext === null) return;
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* ignore */ }
  }
}

async function getMusicBuffer(): Promise<AudioBuffer | null> {
  if (audioContext === null) return null;
  if (musicBuffer !== null) return musicBuffer;
  if (musicFetchPromise !== null) return musicFetchPromise;

  musicFetchPromise = (async () => {
    const response = await fetch(MUSIC_URL);
    if (!response.ok) throw new Error(`music fetch ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = audioContext;
    if (ctx === null) throw new Error('AudioContext lost during decode');
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    musicBuffer = decoded;
    return decoded;
  })();

  try {
    return await musicFetchPromise;
  } catch (err) {
    console.warn('[audio] music load failed', err);
    musicFetchPromise = null;
    return null;
  }
}

/**
 * Initialize audio on first user gesture. Idempotent. Loads localStorage
 * settings, creates AudioContext + 3 GainNodes (master, music, sfx) wired
 * music+sfx → master → destination.
 */
export function initAudio(): void {
  if (audioContext !== null) return;
  loadSettingsFromStorage();
  ensureAudio();
}

/**
 * Start background music loop. Idempotent. Routes through shared
 * musicGainNode so per-channel volume + mute apply automatically.
 */
export async function playMusic(): Promise<void> {
  if (audioContext === null || musicGainNode === null) return;
  if (musicSource !== null) return;
  await resumeIfSuspended();
  const buffer = await getMusicBuffer();
  if (buffer === null || audioContext === null || musicGainNode === null) return;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(musicGainNode);
  source.start();
  musicSource = source;
}

export function stopMusic(): void {
  if (musicSource === null) return;
  try { musicSource.stop(); } catch { /* already stopped */ }
  musicSource.disconnect();
  musicSource = null;
}

/**
 * S22 P4 — one-shot OGG/audio sample playback through the SFX bus. Fetches +
 * decodes + plays once. Caches the AudioBuffer per URL so repeated triggers
 * (e.g. Voltkin voice on each cinematic) skip the fetch. Best-effort: silently
 * no-ops if AudioContext unavailable, fetch fails, or decode throws.
 */
const oneShotBufferCache = new Map<string, AudioBuffer>();
const oneShotInFlight = new Map<string, Promise<AudioBuffer | null>>();

export async function playOneShot(url: string): Promise<void> {
  const ctx = ensureAudio();
  if (ctx === null || sfxGainNode === null) return;
  await resumeIfSuspended();
  let buffer = oneShotBufferCache.get(url) ?? null;
  if (buffer === null) {
    let pending = oneShotInFlight.get(url);
    if (pending === undefined) {
      pending = (async (): Promise<AudioBuffer | null> => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`one-shot fetch ${res.status}`);
          const ab = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(ab);
          oneShotBufferCache.set(url, decoded);
          return decoded;
        } catch (err) {
          console.warn(`[audio] one-shot load failed (${url}):`, err);
          return null;
        } finally {
          oneShotInFlight.delete(url);
        }
      })();
      oneShotInFlight.set(url, pending);
    }
    buffer = await pending;
  }
  if (buffer === null || audioContext === null || sfxGainNode === null) return;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(sfxGainNode);
  source.start();
}

/**
 * Toggle global mute (the 'M' key / legacy mute behavior). Flips masterGain
 * between 0 and 1, preserving per-channel state. Persists to legacy
 * localStorage key.
 */
export function toggleMute(): boolean {
  masterMuted = !masterMuted;
  applyMasterGain();
  writeKey(STORAGE_KEY_MASTER_MUTED, String(masterMuted));
  return masterMuted;
}

export function isMuted(): boolean {
  return masterMuted;
}

export function isInitialized(): boolean {
  return initialized;
}

// ===== S19 P1 per-channel controls =====

export function setMusicMuted(value: boolean): void {
  musicMuted = value;
  applyMusicGain();
  writeKey(STORAGE_KEY_MUSIC_MUTED, String(musicMuted));
}

export function setSfxMuted(value: boolean): void {
  sfxMuted = value;
  applySfxGain();
  writeKey(STORAGE_KEY_SFX_MUTED, String(sfxMuted));
}

export function setMusicVolume(value: number): void {
  musicVolume = clamp01(value);
  applyMusicGain();
  writeKey(STORAGE_KEY_MUSIC_VOLUME, String(musicVolume));
}

export function setSfxVolume(value: number): void {
  sfxVolume = clamp01(value);
  applySfxGain();
  writeKey(STORAGE_KEY_SFX_VOLUME, String(sfxVolume));
}

export interface AudioSettings {
  masterMuted: boolean;
  musicMuted: boolean;
  sfxMuted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export function getAudioSettings(): AudioSettings {
  return { masterMuted, musicMuted, sfxMuted, musicVolume, sfxVolume };
}

/**
 * S23 P2 — diagnostic surface for debug overlay. Returns the live wiring state
 * of the audio graph: context state, gain values, and connection topology
 * (numberOfOutputs / numberOfInputs). If the chain is broken (e.g.,
 * sfxGain.numberOfOutputs===0 means SFX bus has nowhere to go), the overlay
 * will surface it.
 */
export interface AudioChainSnapshot {
  contextState: 'uninit' | 'running' | 'suspended' | 'closed' | 'interrupted';
  masterGainValue: number | null;
  musicGainValue: number | null;
  sfxGainValue: number | null;
  sfxOutputs: number | null;
  masterInputs: number | null;
  musicSourceActive: boolean;
  /** S23 P3 — diagnostic call counters. */
  claveCallsTotal: number;
  claveCallsSynthed: number;
  fartCallsTotal: number;
  fartCallsSynthed: number;
  storageKeys: {
    masterMuted: string | null;
    musicMuted: string | null;
    sfxMuted: string | null;
    musicVolume: string | null;
    sfxVolume: string | null;
  };
}

export function inspectAudioChain(): AudioChainSnapshot {
  let storage: AudioChainSnapshot['storageKeys'] = {
    masterMuted: null, musicMuted: null, sfxMuted: null,
    musicVolume: null, sfxVolume: null,
  };
  try {
    storage = {
      masterMuted: window.localStorage.getItem(STORAGE_KEY_MASTER_MUTED),
      musicMuted: window.localStorage.getItem(STORAGE_KEY_MUSIC_MUTED),
      sfxMuted: window.localStorage.getItem(STORAGE_KEY_SFX_MUTED),
      musicVolume: window.localStorage.getItem(STORAGE_KEY_MUSIC_VOLUME),
      sfxVolume: window.localStorage.getItem(STORAGE_KEY_SFX_VOLUME),
    };
  } catch { /* private mode */ }

  return {
    contextState: audioContext === null
      ? 'uninit'
      : (audioContext.state as AudioChainSnapshot['contextState']),
    masterGainValue: masterGain?.gain.value ?? null,
    musicGainValue: musicGainNode?.gain.value ?? null,
    sfxGainValue: sfxGainNode?.gain.value ?? null,
    sfxOutputs: sfxGainNode?.numberOfOutputs ?? null,
    masterInputs: masterGain?.numberOfInputs ?? null,
    musicSourceActive: musicSource !== null,
    claveCallsTotal,
    claveCallsSynthed,
    fartCallsTotal,
    fartCallsSynthed,
    storageKeys: storage,
  };
}

/**
 * Reset audio module state. Used by tests for clean re-init. Does NOT
 * touch localStorage — call window.localStorage.clear() in tests for that.
 */
export function _resetAudioForTest(): void {
  if (musicSource !== null) {
    try { musicSource.stop(); } catch { /* */ }
    musicSource.disconnect();
  }
  audioContext = null;
  masterGain = null;
  musicGainNode = null;
  sfxGainNode = null;
  musicSource = null;
  musicBuffer = null;
  musicFetchPromise = null;
  masterMuted = false;
  musicMuted = false;
  sfxMuted = false;
  musicVolume = DEFAULT_MUSIC_VOLUME;
  sfxVolume = DEFAULT_SFX_VOLUME;
  lastDrainedTick = -1;
  initialized = false;
}

export async function playClaveSFX(): Promise<void> {
  claveCallsTotal += 1;
  if (audioContext === null || sfxGainNode === null) {
    if (isDebugRequested()) console.warn('[audio] playClaveSFX: ctx/gain null, audio not initialized');
    return;
  }
  // S23 P2 (Defensive Fix 1) — force explicit resume() with logging; previously
  // resumeIfSuspended() silently swallowed errors. Browser autoplay policy
  // requires resume() to be called within a user-gesture window; if SFX fires
  // from rAF after the gesture token expired, resume() throws. Log so debug
  // overlay + user can see the failure mode.
  if (audioContext.state !== 'running') {
    try {
      await audioContext.resume();
    } catch (e) {
      if (isDebugRequested()) console.warn('[audio] playClaveSFX resume() threw:', e);
    }
  }
  if (audioContext.state !== 'running') {
    if (isDebugRequested()) {
      console.warn(`[audio] playClaveSFX skip: ctx state=${audioContext.state} after resume attempt`);
    }
    return;
  }

  const ctx = audioContext;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(CLAVE_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + CLAVE_DURATION);
  gain.connect(sfxGainNode);

  for (const freq of [1200, 2400]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + CLAVE_DURATION);
  }
  claveCallsSynthed += 1;
}

export async function playFartSFX(): Promise<void> {
  fartCallsTotal += 1;
  if (audioContext === null || sfxGainNode === null) {
    if (isDebugRequested()) console.warn('[audio] playFartSFX: ctx/gain null, audio not initialized');
    return;
  }
  // S23 P2 (Defensive Fix 1) — same explicit-resume + log path as playClaveSFX.
  if (audioContext.state !== 'running') {
    try {
      await audioContext.resume();
    } catch (e) {
      if (isDebugRequested()) console.warn('[audio] playFartSFX resume() threw:', e);
    }
  }
  if (audioContext.state !== 'running') {
    if (isDebugRequested()) {
      console.warn(`[audio] playFartSFX skip: ctx state=${audioContext.state} after resume attempt`);
    }
    return;
  }

  const ctx = audioContext;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FART_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + FART_DURATION);
  gain.connect(sfxGainNode);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(120, now + FART_DURATION);
  filter.Q.value = 4;
  filter.connect(gain);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + FART_DURATION);
  osc.connect(filter);
  osc.start(now);
  osc.stop(now + FART_DURATION);
  fartCallsSynthed += 1;
}

/**
 * Drain effects for audio. Iterates effects, fires SFX for new ticks, advances
 * the cursor. Replay-safe: effects with tick <= cursor are skipped silently.
 */
export function drainAudioEffects(effects: ReadonlyArray<GameEffect>, currentTick: number): void {
  // S23 P4 — strict `<` not `<=`. Same-tick events emitted by click handlers
  // between physics ticks (world.tick stable across the dispatch boundary)
  // would otherwise hit `eff.tick === lastDrainedTick` and be silently
  // skipped. The cursor still skips effects with tick BELOW it (replay
  // protection for save/load round-trips); equality now passes through.
  for (const effect of effects) {
    if (effect.tick < lastDrainedTick) continue;

    if (effect.kind === 'BOND_FORMED') {
      void playClaveSFX();
    } else if (effect.kind === 'BOND_SEVERED' && effect.cause === 'player') {
      void playFartSFX();
    } else if (effect.kind === 'BOND_SEVERED' && effect.cause === 'creature') {
      // S28 P0 — Voltkin lightning zap on creature-driven sever (Council scope-Q2
      // USER-LOCKED option-a: recorded lightning-crackle.ogg over procedural Web
      // Audio synth — see LIGHTNING_CRACKLE_URL constant rationale).
      void playOneShot(LIGHTNING_CRACKLE_URL);
    }
  }
  lastDrainedTick = currentTick;
}

/** Reset the drain cursor. Used by tests and on world reset (RETURN_TO_TITLE). */
export function resetAudioDrainCursor(): void {
  lastDrainedTick = -1;
}

// ===== Pure helpers exported for unit tests =====

export function claveEnvelope(t: number, duration: number = CLAVE_DURATION): number {
  if (t < 0 || t > duration) return 0;
  return Math.exp(-(Math.log(1000) / duration) * t);
}

export function fartFreq(
  t: number,
  duration: number = FART_DURATION,
  startHz: number = 600,
  endHz: number = 180,
): number {
  if (t < 0) return startHz;
  if (t >= duration) return endHz;
  const ratio = endHz / startHz;
  return startHz * Math.pow(ratio, t / duration);
}
