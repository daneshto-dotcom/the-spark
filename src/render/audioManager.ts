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
  if (audioContext === null || sfxGainNode === null) return;
  await resumeIfSuspended();
  if (audioContext.state !== 'running') return;

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
}

export async function playFartSFX(): Promise<void> {
  if (audioContext === null || sfxGainNode === null) return;
  await resumeIfSuspended();
  if (audioContext.state !== 'running') return;

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
}

/**
 * Drain effects for audio. Iterates effects, fires SFX for new ticks, advances
 * the cursor. Replay-safe: effects with tick <= cursor are skipped silently.
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
