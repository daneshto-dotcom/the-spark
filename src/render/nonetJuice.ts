/**
 * SPARK — NONET "juice": anime/kawaii SFX + resolve-flood helpers (S95 P2).
 *
 * Lives in the LAZY sudokuOverlay chunk (imported ONLY by render/sudokuOverlay.ts) so none of this
 * procedural-audio code lands in the eager main bundle (charter). Every SFX synthesizes its own
 * one-shot oscillator graph and routes through audioManager's shared sfxGainNode (via ensureSfxBus)
 * so the 'M' master mute + the SFX-channel mute/volume apply for free. Best-effort: every play fn
 * no-ops silently when the audio bus is unavailable (pre-gesture, or the vitest node env).
 *
 * Pure helpers (arpeggio notes, flood math) are exported for unit tests; the oscillator graphs need
 * a real AudioContext so they are exercised live in the preview harness — the same split as
 * audioManager.ts (pure envelope/freq helpers tested; synth verified in-browser).
 */
import { ensureSfxBus } from './audioManager.ts';

// ───────────────────────── pure helpers (unit-tested) ─────────────────────────

/** Photosensitivity charter cap — the resolve flood never exceeds this alpha (matches rainbow flyover's 0.30). */
export const FLOOD_PEAK_ALPHA = 0.3;
/** Resolve-flood lifetime in ticks (~0.75 s @ 60 Hz) — a flash that fades, not a sustained wash. */
export const FLOOD_DURATION_TICKS = 45;

/** Winner-colour flood alpha over its lifetime: flash to peak, ease-out (quadratic) fade to 0. Pure. */
export function floodAlpha(elapsedTicks: number, durationTicks = FLOOD_DURATION_TICKS, peak = FLOOD_PEAK_ALPHA): number {
  if (elapsedTicks < 0 || elapsedTicks >= durationTicks || durationTicks <= 0) return 0;
  const frac = 1 - elapsedTicks / durationTicks;
  return peak * frac * frac;
}

/** Flood colour: the winner's seat colour, or a neutral slate on a no-solver timeout (winnerColor undefined). Pure. */
export function resolveFloodColor(winnerColor: number | undefined): number {
  return winnerColor ?? 0x7c8694;
}

/** Ascending pentatonic arpeggio (Hz) for the solve fanfare. Pure (deterministic). */
export function solveArpeggio(): readonly number[] {
  return [660, 880, 990, 1320];
}

// ───────────────────────── SFX (best-effort; need a live AudioContext) ─────────────────────────

/**
 * One short anime "blip": an oscillator with a fast exp attack + exp decay envelope, optionally
 * pitch-gliding start→end, scheduled `whenOffset` seconds ahead on the audio clock (lets the
 * appear/solve sequences fire without setTimeout). Routed through the shared SFX bus.
 */
function blip(
  freqStart: number,
  freqEnd: number,
  dur: number,
  type: OscillatorType,
  gainPeak: number,
  whenOffset = 0,
): void {
  const bus = ensureSfxBus();
  if (bus === null) return;
  const { ctx, sfxGain } = bus;
  const t = ctx.currentTime + whenOffset;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + Math.min(0.012, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(sfxGain);

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t);
  if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + dur);
}

/** Cell-place "pip" — bright quick up-chirp on each digit entry. */
export function playNonetPop(): void {
  blip(680, 1040, 0.07, 'triangle', 0.18);
}

/** Wrong full-grid submit — a comedic descending two-tone "bonk". */
export function playNonetWrong(): void {
  blip(440, 230, 0.16, 'square', 0.13);
  blip(330, 175, 0.2, 'square', 0.09);
}

/** Trial appears — a rising shimmer of three ascending sparkle blips (the realm-shift sting). */
export function playNonetAppear(): void {
  blip(660, 990, 0.12, 'sine', 0.12, 0.0);
  blip(880, 1240, 0.12, 'sine', 0.11, 0.08);
  blip(1100, 1500, 0.14, 'sine', 0.1, 0.16);
}

/** Solve (you won) — a kawaii ascending pentatonic bell arpeggio. */
export function playNonetSolve(): void {
  solveArpeggio().forEach((f, i) => blip(f, f, 0.28, 'triangle', 0.16, i * 0.09));
}

/** Someone else solved (your score halved) — a gentle descending "aww". */
export function playNonetLose(): void {
  blip(587, 440, 0.34, 'sine', 0.13);
}

/** No-solver timeout — a soft neutral descending tone (no winner). */
export function playNonetTimeout(): void {
  blip(392, 311, 0.4, 'sine', 0.12);
}
