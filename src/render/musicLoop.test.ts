/**
 * SPARK — S192 T15: the seamless-loop math (`musicLoop.ts`), on synthetic PCM.
 *
 * The real tracks were measured with ffmpeg + this same `computeLoopRegion` over their decoded PCM
 * (table in `.claude/plans/S192_PROGRESS_audio.md`); these cases pin the arithmetic so the behaviour
 * cannot drift without a red test.
 */
import { describe, expect, it } from 'vitest';

import {
  computeLoopRegion,
  dbToAmplitude,
  findAudibleBounds,
  MUSIC_LOOP_MIN_TRIM_S,
  MUSIC_LOOP_SILENCE_DB,
  seamSilenceSeconds,
  type PcmSource,
} from './musicLoop.ts';

const SR = 1000; // 1 kHz keeps the arithmetic exact and the arrays small

/** A stereo buffer: `head` s of silence, `body` s of a 0.5-amplitude square, `tail` s of silence. */
function track(head: number, body: number, tail: number, opts: { rightOnly?: boolean; floor?: number } = {}): PcmSource {
  const n = Math.round((head + body + tail) * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const h = Math.round(head * SR);
  const b = Math.round(body * SR);
  for (let i = 0; i < n; i++) {
    const inBody = i >= h && i < h + b;
    const v = inBody ? (i % 2 === 0 ? 0.5 : -0.5) : (opts.floor ?? 0);
    R[i] = v;
    L[i] = opts.rightOnly === true && inBody ? 0 : v;
  }
  return { numberOfChannels: 2, sampleRate: SR, length: n, getChannelData: (c) => (c === 0 ? L : R) };
}

describe('musicLoop — dbToAmplitude / findAudibleBounds', () => {
  it('−40 dBFS is 0.01 full scale (the ⚠ MINE threshold)', () => {
    expect(MUSIC_LOOP_SILENCE_DB).toBe(-40);
    expect(dbToAmplitude(-40)).toBeCloseTo(0.01, 10);
    expect(dbToAmplitude(0)).toBe(1);
  });

  it('finds the first and last loud sample on ANY channel, inclusive', () => {
    const a = new Float32Array([0, 0, 0.2, 0, -0.3, 0, 0]);
    const b = new Float32Array([0, 0.05, 0, 0, 0, 0, 0]);
    expect(findAudibleBounds([a], 0.01)).toEqual({ first: 2, last: 4 });
    expect(findAudibleBounds([a, b], 0.01)).toEqual({ first: 1, last: 4 });
  });

  it('a negative excursion counts as loud (|v|, not v)', () => {
    expect(findAudibleBounds([new Float32Array([0, -0.5, 0])], 0.01)).toEqual({ first: 1, last: 1 });
  });

  it('all-silence and no-channel inputs answer null', () => {
    expect(findAudibleBounds([new Float32Array(10)], 0.01)).toBeNull();
    expect(findAudibleBounds([], 0.01)).toBeNull();
  });
});

describe('musicLoop — computeLoopRegion', () => {
  it('trims a SILENT TAIL — the default track / demons / orcs / zombies shape', () => {
    const r = computeLoopRegion(track(0, 100, 2.62));
    expect(r).not.toBeNull();
    expect(r!.loopStart).toBe(0);
    expect(r!.loopEnd).toBeCloseTo(100, 6);
  });

  it('trims a SILENT HEAD — the nagas shape — and the region starts on the first loud sample', () => {
    const r = computeLoopRegion(track(1.5, 100, 0));
    expect(r!.loopStart).toBeCloseTo(1.5, 6);
    expect(r!.loopEnd).toBeCloseTo(101.5, 6);
  });

  it('trims BOTH edges — the vampires shape (1.33 s head + 1.74 s tail across the seam)', () => {
    const r = computeLoopRegion(track(1.33, 100, 1.74));
    expect(r!.loopStart).toBeCloseTo(1.33, 6);
    expect(r!.loopEnd).toBeCloseTo(101.33, 6);
  });

  it('the seam silence per lap goes from the measured gap to ZERO', () => {
    const buf = track(1.33, 100, 1.74);
    expect(seamSilenceSeconds(buf, null)).toBeCloseTo(3.07, 2);
    expect(seamSilenceSeconds(buf, computeLoopRegion(buf))).toBe(0);
  });

  it('an edge under the minimum trim is left at its natural bound; a clean track answers null', () => {
    const tiny = MUSIC_LOOP_MIN_TRIM_S / 2;
    expect(computeLoopRegion(track(tiny, 100, tiny))).toBeNull();
    const oneSided = computeLoopRegion(track(tiny, 100, 2));
    expect(oneSided!.loopStart).toBe(0); // the 50 ms head is NOT trimmed
    expect(oneSided!.loopEnd).toBeCloseTo(100 + tiny, 6);
  });

  it('a quiet floor UNDER the threshold is silence; one OVER it is music', () => {
    expect(computeLoopRegion(track(0, 100, 2, { floor: 0.005 }))!.loopEnd).toBeCloseTo(100, 6);
    expect(computeLoopRegion(track(0, 100, 2, { floor: 0.02 }))).toBeNull();
  });

  it('reads EVERY channel — music only on the right still bounds the region', () => {
    const r = computeLoopRegion(track(1, 100, 1, { rightOnly: true }));
    expect(r!.loopStart).toBeCloseTo(1, 6);
    expect(r!.loopEnd).toBeCloseTo(101, 6);
  });

  it('refuses to loop a sliver: mostly-silent / all-silent buffers loop whole (null)', () => {
    expect(computeLoopRegion(track(10, 5, 10))).toBeNull(); // 5 of 25 s kept < 50 %
    expect(computeLoopRegion(track(0.4, 0.5, 0.4))).toBeNull(); // < 1 s kept
    expect(computeLoopRegion(track(0, 0, 10))).toBeNull(); // all silence
  });

  it('a buffer with no PCM accessor (the test fakes, a broken decode) loops whole, never throws', () => {
    expect(computeLoopRegion(null)).toBeNull();
    expect(computeLoopRegion(undefined)).toBeNull();
    expect(computeLoopRegion({ duration: 3 } as unknown as PcmSource)).toBeNull();
    expect(computeLoopRegion({ numberOfChannels: 0, sampleRate: 48000, length: 10, getChannelData: () => new Float32Array(10) })).toBeNull();
  });

  it('MUTATION: a region that ignored the tail would leave the seam gap in (the guard bites)', () => {
    const buf = track(0, 100, 2.62);
    const wrong = { loopStart: 0, loopEnd: buf.length / SR };
    expect(seamSilenceSeconds(buf, wrong)).toBeGreaterThan(2.5);
  });
});
