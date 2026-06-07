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

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { GameEffect } from '../game/effects.ts';
import type { Vec2 } from '../types.ts';
// Audit Pass 2 fix 622a7c7f — register the cursor-reset handler with the
// state-layer publisher. Replaces the pre-Pass-2 pattern where save.ts
// directly imported `resetAudioDrainCursor` from this file (a state→render
// dep edge). This file is already render-layer; importing audioCursor from
// state/ stays inside the conventional render→state direction.
import { registerResetHandler } from '../state/audioCursor.ts';

/**
 * S51 P2.a — switched from blue-steppe-orbit.mp3 (10.0 MB) to .ogg (3.5 MB,
 * Opus 64k VBR, peaks ~73 kb/s). 65% smaller for mobile/cold-load with
 * near-transparent quality for instrumental music. The .mp3 is retained on
 * disk and in git as the Safari pre-17 fallback (decodeAudioData would
 * silently fail there and the music-fetch try/catch already handles graceful
 * silent-music). Council Battle Ledger C5 ADOPT A — keep both. If mobile
 * cold-load is the priority over Safari pre-17 compat, swap MUSIC_URL back
 * to .mp3 in <1 LOC. ffmpeg encode: -c:a libopus -b:a 64k -application audio.
 */
const MUSIC_URL = '/audio/blue-steppe-orbit.ogg';
const DEFAULT_MUSIC_VOLUME = 0.25;
const DEFAULT_SFX_VOLUME = 1.0;
const CLAVE_GAIN = 0.4;
const FART_GAIN = 0.35;
const CLAVE_DURATION = 0.03;
const FART_DURATION = 0.28;

/**
 * S37 P7 — procedural Voltkin lightning charge-up SFX, fired via `playChargeSFX`
 * when `drainAudioEffects` sees a `CREATURE_CHARGE` effect (emitted by
 * `applyCreatureTick` at ATTACKING.ticksInState===VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK).
 *
 *   Duration         250 ms total
 *   Waveform         sawtooth (electrical/buzzy character, matches lightning)
 *   Freq sweep       150 Hz → 900 Hz exponential over 250 ms (2.6-octave rise)
 *   Filter sweep     biquad lowpass cutoff 600 Hz → 4000 Hz exp, Q=1 (smooth)
 *   Gain envelope    0 → 0.4 linear ramp over [0, 0.20] (swell), 0.4 hold over
 *                    [0.20, 0.245] (peak), exp decay 0.4 → 0.001 over
 *                    [0.245, 0.250] (5 ms click-free termination, clean
 *                    baton-pass into lightning-crackle.ogg at FIRE tick).
 *
 * Council R1 D2 + PRIME-AUDIT Δ5: parameters are starting defaults; user
 * playtest informs subjective tuning. Rollback ladder if grating: waveform
 * swap (sine/triangle/square), reduce peak gain 0.4→0.25, or replace with
 * recorded sample via playOneShot. See session-state.json
 * `carry_forward_general` for the full S37 D9 ladder.
 */
const CHARGE_GAIN = 0.4;
const CHARGE_DURATION = 0.25;
const CHARGE_RAMP_END = 0.20;
const CHARGE_DECAY_START = 0.245;
const CHARGE_FREQ_START = 150;
const CHARGE_FREQ_END = 900;
const CHARGE_FILTER_START = 600;
const CHARGE_FILTER_END = 4000;
const CHARGE_FILTER_Q = 1;
const CHARGE_DECAY_FLOOR = 0.001;

// S72 P4 — bomb/potato detonation BOOM. A short punchy low-frequency thump fired when
// drainAudioEffects sees a BOMB_EXPLODE effect (emitted by BOTH applyTriggerBomb (S71
// bomb) AND applyPotatoDetonate (S72 P3 potato) — one SFX covers both). Detonation was
// SILENT visual-only in v1 (S71 deferred-polish carry-forward). Procedural sine sub-bass
// (160 Hz → 40 Hz exp drop) through a lowpass with a punchy fast-attack/exp-decay gain.
const BOOM_GAIN = 0.5;
const BOOM_DURATION = 0.45;
const BOOM_FREQ_START = 160;
const BOOM_FREQ_END = 40;

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

// S51 P2.c — auto-duck state. `duckEndCtxTime` tracks the AudioContext time
// at which music should restore (extended by overlapping ducks per Council
// PRIME-AUDIT Δ2 ADOPT REFINEMENT: max(currentEnd, candidate) so a 300 ms
// CREATURE_CHARGE duck mid-flight through a 700 ms BOND_SEVERED-creature
// duck never truncates the longer one). 0 = no active duck.
//
// S52 P3 (Gemini CHECK #1 carry-forward fix) — `duckTimeout` REMOVED. The
// pre-S52 implementation used setTimeout to fire restoreFn at wall-clock
// (now + durationMs); when the AudioContext suspended (tab blur) the
// setTimeout fired at wall-time but ctx.currentTime had frozen, producing
// an abrupt restore at a stale ctx-time. Replaced with a Web Audio
// scheduled setTargetAtTime(target, newEnd, 0.150) call inside duckMusic
// — the automation queue is ctx-time relative and survives suspend/resume
// correctly per W3C Web Audio spec §4.3.2.
let duckEndCtxTime = 0;

// S23 P3 — diagnostic counters surfaced via inspectAudioChain for the debug
// overlay. Increment at function entry / after gate passes so the overlay can
// distinguish "never called" from "called but gate failed" from "synth ran".
let claveCallsTotal = 0;
let claveCallsSynthed = 0;
let fartCallsTotal = 0;
let fartCallsSynthed = 0;
// S37 P7 — diagnostic counters surfaced via inspectAudioChain for the debug
// overlay. Same semantic as clave/fart counters: total = function entered,
// synthed = oscillator+envelope actually scheduled (ctx running, gain wired).
let chargeCallsTotal = 0;
let chargeCallsSynthed = 0;

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

// ===== S51 P2.b — positional audio (PannerNode) =====

/**
 * Map a 2D canvas-space position to a Web Audio 3D PannerNode position.
 * Canvas is top-down (no Y depth); we use X for left/right stereo and Z
 * for "front/back" virtual depth so the equalpower panner still hears
 * vertical-axis movement (subtle). Listener implicit at origin (0,0,0).
 *
 * Mapping is [-1, +1] for both axes relative to canvas center. Pure for
 * unit testability. Center → (0,0,0); left edge → x=-1; right edge → x=+1;
 * top → z=-1; bottom → z=+1.
 *
 * Exported for unit tests. The internal `createPanner` helper inserts the
 * node between an osc/buffer-source's gain stage and the shared sfxGainNode,
 * preserving the per-channel SFX mute/volume gate.
 */
export interface PanningPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function mapPanningPosition(pos: Vec2): PanningPosition {
  return {
    x: (pos.x - CANVAS_WIDTH / 2) / (CANVAS_WIDTH / 2),
    y: 0,
    z: (pos.y - CANVAS_HEIGHT / 2) / (CANVAS_HEIGHT / 2),
  };
}

function createPanner(pos: Vec2): PannerNode | null {
  if (audioContext === null) return null;
  const ctx = audioContext;
  const panner = ctx.createPanner();
  panner.panningModel = 'equalpower';
  panner.distanceModel = 'linear';
  panner.refDistance = 1;
  panner.maxDistance = 2;
  panner.rolloffFactor = 1;
  const mapped = mapPanningPosition(pos);
  panner.positionX.value = mapped.x;
  panner.positionY.value = mapped.y;
  panner.positionZ.value = mapped.z;
  return panner;
}

// ===== S51 P2.c — music auto-duck =====

/**
 * Compute the new "duck end time" (in AudioContext seconds) given the
 * currently-pending end + a new duck request's nowCtxTime + durationMs.
 * Council PRIME-AUDIT Δ2 ADOPT REFINEMENT: max(currentEnd, candidate) so
 * an overlapping shorter duck never truncates a longer one already active.
 * Pure helper exported for unit tests.
 */
export function nextDuckEndCtxTime(
  currentEndCtxTime: number,
  nowCtxTime: number,
  durationMs: number,
): number {
  const candidate = nowCtxTime + durationMs / 1000;
  return Math.max(currentEndCtxTime, candidate);
}

/**
 * Temporarily duck music volume by `depth` factor for `durationMs`. Used by
 * the audio drain on CREATURE_CHARGE (300 ms wind-up duck) and BOND_SEVERED
 * cause='creature' (700 ms duck overlapping the lightning-crackle.ogg
 * playback). Overlapping calls extend the end-time via `nextDuckEndCtxTime`
 * so a short event mid-flight through a long one never restores prematurely.
 *
 * Idempotent under no audio context (silent no-op pre-init / Safari private).
 * Respects musicMuted (if music is muted, no audible change; gain stays 0).
 *
 * S52 P3 — Gemini CHECK #1 carry-forward fix. Restore is now scheduled via
 * Web Audio `setTargetAtTime(target, newEnd, 0.150)` at the CALL site
 * instead of setTimeout(restoreFn, durationMs). The setTimeout approach was
 * wall-clock and read audioContext.currentTime at TIMEOUT-FIRE time — if the
 * tab blurred mid-duck the timeout fired while ctx.currentTime had frozen,
 * producing an abrupt restore at a stale ctx-time. Web Audio automation
 * lands at `newEnd` (ctx-time, not wall-time) and the queue pauses with
 * ctx suspend then resumes naturally. W3C spec §4.3.2 confirms the
 * preserved automation semantic (Gemini AUDITOR #6 LOW with citation).
 */
function duckMusic(durationMs: number, depth: number = 0.25): void {
  if (audioContext === null || musicGainNode === null) return;
  const ctx = audioContext;
  const now = ctx.currentTime;
  const newEnd = nextDuckEndCtxTime(duckEndCtxTime, now, durationMs);

  // Always apply (or re-apply) the ducked gain at call time. setTargetAtTime
  // is idempotent; re-calling at the same target is a no-op in audible terms.
  // cancelScheduledValues clears any prior queued restore (so the new
  // schedule below replaces it cleanly).
  const target = clamp01(musicVolume) * clamp01(depth);
  musicGainNode.gain.cancelScheduledValues(now);
  musicGainNode.gain.setTargetAtTime(musicMuted ? 0 : target, now, 0.030);

  // Only extend the restore schedule when the new end is strictly later than
  // the current pending end. Otherwise an in-flight long duck stays in
  // charge of the restore moment (Δ2 idempotence, Council PRIME-AUDIT).
  if (newEnd <= duckEndCtxTime) return;
  duckEndCtxTime = newEnd;

  // S52 P3 — Web Audio scheduled restore. setTargetAtTime queues an
  // exponential approach to `restoreTarget` starting at ctx-time `newEnd`
  // with a 150 ms time-constant. Survives tab-blur suspend correctly: the
  // automation pauses with the AudioContext clock and resumes from the
  // suspend point — no stale-ctx-time abrupt cut. If the music gets muted
  // between the duck schedule and the restore moment, the queued target
  // stays at the captured `musicVolume` (matches prior setTimeout behavior).
  musicGainNode.gain.setTargetAtTime(
    musicMuted ? 0 : clamp01(musicVolume),
    newEnd,
    0.150,
  );
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

/**
 * S22 P4 — one-shot OGG/audio sample playback through the SFX bus. Fetches +
 * decodes + plays once. Caches the AudioBuffer per URL so repeated triggers
 * (e.g. Voltkin voice on each cinematic) skip the fetch. Best-effort: silently
 * no-ops if AudioContext unavailable, fetch fails, or decode throws.
 */
const oneShotBufferCache = new Map<string, AudioBuffer>();
const oneShotInFlight = new Map<string, Promise<AudioBuffer | null>>();

export async function playOneShot(url: string, pos?: Vec2): Promise<void> {
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
  // S51 P2.b — optional spatial routing via PannerNode. When pos absent,
  // direct source → sfxGain (preserves byte-identical pre-S51 behavior).
  const panner = pos !== undefined ? createPanner(pos) : null;
  if (panner !== null) {
    source.connect(panner);
    panner.connect(sfxGainNode);
  } else {
    source.connect(sfxGainNode);
  }
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
  /** S37 P7 — Voltkin lightning charge-up SFX diagnostic counters. */
  chargeCallsTotal: number;
  chargeCallsSynthed: number;
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
    chargeCallsTotal,
    chargeCallsSynthed,
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
  // S52 P3 — clear duck schedule state. No setTimeout to clear post-S52
  // (Web Audio automation queue is dropped when audioContext goes null).
  duckEndCtxTime = 0;
}

async function playClaveSFX(pos?: Vec2): Promise<void> {
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
  // S51 P2.b — optional spatial routing; gain → panner → sfxGain when pos given.
  const panner = pos !== undefined ? createPanner(pos) : null;
  if (panner !== null) {
    gain.connect(panner);
    panner.connect(sfxGainNode);
  } else {
    gain.connect(sfxGainNode);
  }

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

async function playFartSFX(pos?: Vec2): Promise<void> {
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
  // S51 P2.b — optional spatial routing; gain → panner → sfxGain when pos given.
  const panner = pos !== undefined ? createPanner(pos) : null;
  if (panner !== null) {
    gain.connect(panner);
    panner.connect(sfxGainNode);
  } else {
    gain.connect(sfxGainNode);
  }

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
 * S37 P7 — Voltkin lightning charge-up SFX. 250 ms procedural rising tone
 * fired when `applyCreatureTick` emits `CREATURE_CHARGE` at
 * ATTACKING.ticksInState===VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK (=15). Climaxes
 * just before the FIRE tick where the recorded `lightning-crackle.ogg`
 * plays — sharp 5 ms exp decay tail ensures click-free baton-pass into the
 * crackle.
 *
 * Audio graph: oscillator(sawtooth) → biquad lowpass → gain envelope →
 * sfxGainNode → masterGain → destination.
 *
 * Defense-in-depth (mirrors playClaveSFX/playFartSFX S23 P2 pattern): explicit
 * `ctx.resume()` with debug-only logging; skips synth if ctx unrunnable after
 * resume attempt (tab-blur / autoplay-policy guard).
 */
async function playChargeSFX(pos?: Vec2): Promise<void> {
  chargeCallsTotal += 1;
  if (audioContext === null || sfxGainNode === null) {
    if (isDebugRequested()) console.warn('[audio] playChargeSFX: ctx/gain null, audio not initialized');
    return;
  }
  if (audioContext.state !== 'running') {
    try {
      await audioContext.resume();
    } catch (e) {
      if (isDebugRequested()) console.warn('[audio] playChargeSFX resume() threw:', e);
    }
  }
  if (audioContext.state !== 'running') {
    if (isDebugRequested()) {
      console.warn(`[audio] playChargeSFX skip: ctx state=${audioContext.state} after resume attempt`);
    }
    return;
  }

  const ctx = audioContext;
  const now = ctx.currentTime;

  // Gain envelope: 0 → peak (linear swell), hold at peak, exp decay tail.
  // linearRampToValueAtTime to the same value = "hold" segment in Web Audio.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(CHARGE_GAIN, now + CHARGE_RAMP_END);
  gain.gain.linearRampToValueAtTime(CHARGE_GAIN, now + CHARGE_DECAY_START);
  gain.gain.exponentialRampToValueAtTime(CHARGE_DECAY_FLOOR, now + CHARGE_DURATION);
  // S51 P2.b — optional spatial routing; gain → panner → sfxGain when pos given.
  const panner = pos !== undefined ? createPanner(pos) : null;
  if (panner !== null) {
    gain.connect(panner);
    panner.connect(sfxGainNode);
  } else {
    gain.connect(sfxGainNode);
  }

  // Biquad lowpass cutoff exp sweep — opens up the high harmonics from a
  // muffled-buzz to a piercing-arc feel by the end of the wind-up.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(CHARGE_FILTER_START, now);
  filter.frequency.exponentialRampToValueAtTime(CHARGE_FILTER_END, now + CHARGE_DURATION);
  filter.Q.value = CHARGE_FILTER_Q;
  filter.connect(gain);

  // Sawtooth oscillator (electrical/buzzy harmonics suit lightning) with
  // exp pitch rise — feels like energy gathering toward the strike.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(CHARGE_FREQ_START, now);
  osc.frequency.exponentialRampToValueAtTime(CHARGE_FREQ_END, now + CHARGE_DURATION);
  osc.connect(filter);
  osc.start(now);
  osc.stop(now + CHARGE_DURATION);
  chargeCallsSynthed += 1;
}

/**
 * S72 P4 — bomb/potato detonation BOOM. Procedural deep thump: a sine sub-bass with an
 * exponential pitch drop (160 Hz → 40 Hz) through a lowpass, with a punchy fast-attack /
 * exp-decay gain envelope. Fired on BOMB_EXPLODE (the S71 bomb AND the S72 potato).
 * Defense-in-depth resume guard mirrors playClaveSFX/playChargeSFX (tab-blur /
 * autoplay-policy safe). Routed via sfxGainNode so master + SFX-channel mute both apply.
 */
async function playBoomSFX(pos?: Vec2): Promise<void> {
  if (audioContext === null || sfxGainNode === null) return;
  if (audioContext.state !== 'running') {
    try {
      await audioContext.resume();
    } catch (e) {
      if (isDebugRequested()) console.warn('[audio] playBoomSFX resume() threw:', e);
    }
  }
  if (audioContext.state !== 'running') return;

  const ctx = audioContext;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(BOOM_GAIN, now); // punchy attack
  gain.gain.exponentialRampToValueAtTime(0.001, now + BOOM_DURATION);
  const panner = pos !== undefined ? createPanner(pos) : null;
  if (panner !== null) {
    gain.connect(panner);
    panner.connect(sfxGainNode);
  } else {
    gain.connect(sfxGainNode);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + BOOM_DURATION);
  filter.Q.value = 2;
  filter.connect(gain);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(BOOM_FREQ_START, now);
  osc.frequency.exponentialRampToValueAtTime(BOOM_FREQ_END, now + BOOM_DURATION);
  osc.connect(filter);
  osc.start(now);
  osc.stop(now + BOOM_DURATION);
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
      // S51 P2.b — pass pos for spatial routing through PannerNode.
      void playClaveSFX(effect.pos);
    } else if (effect.kind === 'BOND_SEVERED' && effect.cause === 'player') {
      void playFartSFX(effect.pos);
    } else if (effect.kind === 'BOND_SEVERED' && effect.cause === 'creature') {
      // S28 P0 — Voltkin lightning zap on creature-driven sever (Council scope-Q2
      // USER-LOCKED option-a: recorded lightning-crackle.ogg over procedural Web
      // Audio synth — see LIGHTNING_CRACKLE_URL constant rationale).
      // S51 P2.b — positional; S51 P2.c — duck music for the ~700 ms crackle.
      void playOneShot(LIGHTNING_CRACKLE_URL, effect.pos);
      duckMusic(700);
    } else if (effect.kind === 'CREATURE_CHARGE') {
      // S37 P7 — Voltkin lightning charge-up rising tone, 250 ms procedural
      // synth (sawtooth + biquad lowpass sweep + exp gain envelope). Climaxes
      // just before lightning-crackle.ogg fires at the FIRE tick. Multi-creature
      // concurrent calls are safe (each oscillator graph is one-shot
      // independent; Web Audio is polyphonic by construction).
      // S51 P2.b — positional; S51 P2.c — duck music for the 300 ms wind-up
      // so the rising tone reads through the music bed. Overlaps with the
      // subsequent BOND_SEVERED-creature 700 ms duck via Δ2 max-end-time.
      void playChargeSFX(effect.pos);
      duckMusic(300);
    } else if (effect.kind === 'BOMB_EXPLODE') {
      // S72 P4 — detonation boom (the S71 bomb + the S72 potato both emit BOMB_EXPLODE).
      // Positional; duck the music ~450 ms so the thump reads through the bed.
      void playBoomSFX(effect.pos);
      duckMusic(450);
    }
  }
  lastDrainedTick = currentTick;
}

/** Reset the drain cursor. Used by tests and on world reset (RETURN_TO_TITLE). */
export function resetAudioDrainCursor(): void {
  lastDrainedTick = -1;
}

// Audit Pass 2 fix 622a7c7f — register with the state-layer publisher at
// module-init. State callers fire `triggerReset()` from `src/state/audioCursor`
// on save-load tick-discontinuity (save.ts:restore) and on the RTT lifecycle
// path (main.ts:teardownNet). Single-handler is intentional — there is only
// ever one audio drain cursor in the codebase.
registerResetHandler(resetAudioDrainCursor);

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

/**
 * S37 P7 — exponential frequency interpolation for the Voltkin charge SFX.
 * Mirrors `fartFreq` shape (out-of-range clamp + exp interp) so the helper
 * patterns stay symmetric. Pure; trivially unit-testable.
 *
 *   t            time within the 250 ms wind-up (seconds)
 *   duration     total wind-up duration; default CHARGE_DURATION
 *   startHz      starting pitch; default CHARGE_FREQ_START
 *   endHz        ending pitch (at FIRE moment); default CHARGE_FREQ_END
 *
 * Default trajectory matches the live oscillator schedule:
 *   chargeFreq(0)      === 150
 *   chargeFreq(0.25)   === 900
 *   chargeFreq(0.125)  ≈ 367.42  (geometric midpoint)
 */
export function chargeFreq(
  t: number,
  duration: number = CHARGE_DURATION,
  startHz: number = CHARGE_FREQ_START,
  endHz: number = CHARGE_FREQ_END,
): number {
  if (t < 0) return startHz;
  if (t >= duration) return endHz;
  const ratio = endHz / startHz;
  return startHz * Math.pow(ratio, t / duration);
}

/**
 * S37 P7 — gain envelope for the Voltkin charge SFX. Piecewise:
 *   - silent before t<0 and after t>=duration (returns 0)
 *   - linear ramp 0 → CHARGE_GAIN over [0, CHARGE_RAMP_END]
 *   - hold at CHARGE_GAIN over [CHARGE_RAMP_END, CHARGE_DECAY_START]
 *   - exponential decay CHARGE_GAIN → CHARGE_DECAY_FLOOR over
 *     [CHARGE_DECAY_START, duration] (5 ms click-free tail)
 *
 * Matches the live `gain.gain` schedule in `playChargeSFX` analytically so
 * unit tests can assert the envelope without running Web Audio. Pure.
 */
export function chargeEnvelope(
  t: number,
  duration: number = CHARGE_DURATION,
): number {
  if (t < 0 || t >= duration) return 0;
  if (t < CHARGE_RAMP_END) {
    return (t / CHARGE_RAMP_END) * CHARGE_GAIN;
  }
  if (t < CHARGE_DECAY_START) {
    return CHARGE_GAIN;
  }
  // Exponential decay segment, mirroring `gain.exponentialRampToValueAtTime`.
  // Formula: v(s) = v0 * (v1/v0)^(s/dt), where s = t - CHARGE_DECAY_START.
  const decayElapsed = t - CHARGE_DECAY_START;
  const decayDuration = duration - CHARGE_DECAY_START;
  return CHARGE_GAIN * Math.pow(CHARGE_DECAY_FLOOR / CHARGE_GAIN, decayElapsed / decayDuration);
}

/**
 * S72 P4 — exponential pitch trajectory for the detonation boom (mirrors fartFreq /
 * chargeFreq shape: out-of-range clamp + geometric interp). Pure; unit-testable.
 *   boomFreq(0) === 160, boomFreq(BOOM_DURATION) === 40, geometric in between.
 */
export function boomFreq(
  t: number,
  duration: number = BOOM_DURATION,
  startHz: number = BOOM_FREQ_START,
  endHz: number = BOOM_FREQ_END,
): number {
  if (t < 0) return startHz;
  if (t >= duration) return endHz;
  const ratio = endHz / startHz;
  return startHz * Math.pow(ratio, t / duration);
}
