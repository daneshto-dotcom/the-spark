/**
 * SPARK — audio subsystem (S18 P1).
 *
 * Wires the user-supplied Suno background music + 2 procedural SFX:
 *   - Clave-tap SFX on bond-form (ONE per placement, regardless of N bonds)
 *   - Descending pitch sweep on player-cause sever (skipped for physics-cause)
 *
 * Design (Council R1 adoptions):
 *   - Singleton AudioContext, lazy-init on first user gesture (canvas pointerdown)
 *   - Master GainNode controls mute; mute state persists via localStorage
 *   - Music: AudioBufferSourceNode loop (fetched once, decoded once, cached)
 *   - SFX: synthesized via Web Audio oscillators — no external SFX assets
 *   - Replay-safe via `lastDrainedTick` cursor (reducer replays during save/load
 *     + NET reconciliation don't double-fire SFX)
 *   - Multi-bond aggregation (Council Adoption-B): placePrimitive.ts emits ONE
 *     BOND_FORMED per call regardless of N bonds — single clave per placement
 *   - Physics-cause severs are SILENT (Council resolution of Gemini #3): only
 *     player-cause severs (cause==='player') play the fart SFX
 *   - localStorage access wrapped in try/catch (Council Gemini #5: Safari
 *     private mode degrades to session-only mute)
 *   - AudioContext.resume() on every play call (PRIME-AUDIT B: tab-blur recovery)
 *
 * Pure helpers exported for unit tests:
 *   - claveEnvelope(t, duration)
 *   - fartFreq(t, duration, startHz, endHz)
 *
 * Not pure: AudioContext, GainNode lifecycle. Browser-only side effects.
 */

import type { GameEffect } from '../game/effects.ts';

const MUSIC_URL = '/audio/blue-steppe-orbit.mp3';
const MUSIC_GAIN = 0.25;
const CLAVE_GAIN = 0.4;
const FART_GAIN = 0.35;
const CLAVE_DURATION = 0.03;
const FART_DURATION = 0.28;
const STORAGE_KEY = 'spark_audio_muted';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicSource: AudioBufferSourceNode | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicFetchPromise: Promise<AudioBuffer> | null = null;
let muted = false;
let lastDrainedTick = -1;
let initialized = false;

function loadMuteFromStorage(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveMuteToStorage(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Safari private mode / quota / SecurityError → silent fallback to session-only
  }
}

function ensureAudio(): AudioContext | null {
  if (audioContext !== null) return audioContext;
  try {
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor === undefined) return null;
    audioContext = new AudioContextCtor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioContext.destination);
    initialized = true;
  } catch {
    audioContext = null;
    masterGain = null;
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
 * Initialize audio on first user gesture. Idempotent. Call from a click/keydown
 * handler so the browser autoplay policy permits AudioContext creation.
 */
export function initAudio(): void {
  if (audioContext !== null) return;
  muted = loadMuteFromStorage();
  ensureAudio();
}

/**
 * Start background music loop. Idempotent (second call when already playing
 * is a no-op). No-op if AudioContext failed to initialize.
 */
export async function playMusic(): Promise<void> {
  if (audioContext === null || masterGain === null) return;
  if (musicSource !== null) return;
  await resumeIfSuspended();
  const buffer = await getMusicBuffer();
  if (buffer === null || audioContext === null || masterGain === null) return;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const musicGain = audioContext.createGain();
  musicGain.gain.value = MUSIC_GAIN;

  source.connect(musicGain);
  musicGain.connect(masterGain);
  source.start();
  musicSource = source;
}

export function stopMusic(): void {
  if (musicSource === null) return;
  try { musicSource.stop(); } catch { /* already stopped */ }
  musicSource.disconnect();
  musicSource = null;
}

/** Toggle mute. Persists to localStorage. Returns the new mute state. */
export function toggleMute(): boolean {
  muted = !muted;
  if (masterGain !== null && audioContext !== null) {
    const target = muted ? 0 : 1;
    masterGain.gain.setTargetAtTime(target, audioContext.currentTime, 0.005);
  }
  saveMuteToStorage(muted);
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

export function isInitialized(): boolean {
  return initialized;
}

export async function playClaveSFX(): Promise<void> {
  if (audioContext === null || masterGain === null) return;
  await resumeIfSuspended();
  if (audioContext.state !== 'running') return;

  const ctx = audioContext;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(CLAVE_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + CLAVE_DURATION);
  gain.connect(masterGain);

  for (const freq of [1200, 2400]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + CLAVE_DURATION);
  }
}

export async function playFartSFX(): Promise<void> {
  if (audioContext === null || masterGain === null) return;
  await resumeIfSuspended();
  if (audioContext.state !== 'running') return;

  const ctx = audioContext;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FART_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + FART_DURATION);
  gain.connect(masterGain);

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
}

/**
 * Drain effects for audio. Iterates effects, fires SFX for new ticks, advances
 * the cursor. Replay-safe: effects with tick <= cursor are skipped silently
 * (reducer replays during save/load + NET reconciliation produce identical
 * effects but cursor preserved → no double-fire).
 */
export function drainAudioEffects(effects: ReadonlyArray<GameEffect>, currentTick: number): void {
  for (const effect of effects) {
    if (effect.tick <= lastDrainedTick) continue;

    if (effect.kind === 'BOND_FORMED') {
      void playClaveSFX();
    } else if (effect.kind === 'BOND_SEVERED' && effect.cause === 'player') {
      void playFartSFX();
    }
  }
  lastDrainedTick = currentTick;
}

/** Reset the drain cursor. Used by tests and on world reset (RETURN_TO_TITLE). */
export function resetAudioDrainCursor(): void {
  lastDrainedTick = -1;
}

// ===== Pure helpers exported for unit tests =====

/**
 * Clave envelope at time t. Exponential decay from 1 to ~0 over `duration`.
 * Used by playClaveSFX (via Web Audio's exponentialRampToValueAtTime); also
 * exported pure so tests can verify the shape without an AudioContext.
 */
export function claveEnvelope(t: number, duration: number = CLAVE_DURATION): number {
  if (t < 0 || t > duration) return 0;
  // exponentialRampToValueAtTime from 1 to 0.001 over duration: y = exp(-k*t)
  // where k = ln(1/0.001) / duration ≈ 6.908 / duration.
  return Math.exp(-(Math.log(1000) / duration) * t);
}

/**
 * Fart frequency at time t. Exponential ramp from startHz to endHz over
 * `duration`. y = startHz * (endHz/startHz)^(t/duration).
 */
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
