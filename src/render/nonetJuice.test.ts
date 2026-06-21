/**
 * SPARK — S95 P2: pure-helper coverage for NONET juice (flood math + arpeggio).
 *
 * The SFX oscillator graphs need a live AudioContext (verified in the preview harness, like the
 * audioManager synth), so the unit surface is the pure helpers: the flood alpha curve (incl. the
 * photosensitivity charter cap), the winner-vs-timeout colour selection, and the arpeggio shape.
 */
import { describe, expect, it } from 'vitest';
import {
  FLOOD_DURATION_TICKS,
  FLOOD_PEAK_ALPHA,
  floodAlpha,
  resolveFloodColor,
  solveArpeggio,
} from './nonetJuice.ts';

describe('S95 — floodAlpha', () => {
  it('peaks at t=0 and is exactly the charter cap', () => {
    expect(floodAlpha(0)).toBeCloseTo(FLOOD_PEAK_ALPHA, 6);
  });

  it('is 0 before the flood, at the end, and after', () => {
    expect(floodAlpha(-1)).toBe(0);
    expect(floodAlpha(FLOOD_DURATION_TICKS)).toBe(0);
    expect(floodAlpha(FLOOD_DURATION_TICKS + 10)).toBe(0);
    expect(floodAlpha(5, 0)).toBe(0); // zero-duration guard
  });

  it('decreases monotonically across its lifetime', () => {
    let prev = Infinity;
    for (let t = 0; t < FLOOD_DURATION_TICKS; t++) {
      const a = floodAlpha(t);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('NEVER exceeds the photosensitivity charter cap for any input', () => {
    for (let t = -5; t <= FLOOD_DURATION_TICKS + 5; t += 0.5) {
      expect(floodAlpha(t)).toBeLessThanOrEqual(FLOOD_PEAK_ALPHA + 1e-9);
    }
    // even with an over-large requested peak, the curve is bounded by what's passed (caller passes the cap)
    expect(floodAlpha(0, FLOOD_DURATION_TICKS, FLOOD_PEAK_ALPHA)).toBeLessThanOrEqual(FLOOD_PEAK_ALPHA + 1e-9);
  });

  it('ease-out: midpoint alpha is a quarter of peak (quadratic falloff)', () => {
    expect(floodAlpha(FLOOD_DURATION_TICKS / 2)).toBeCloseTo(FLOOD_PEAK_ALPHA * 0.25, 6);
  });
});

describe('S95 — resolveFloodColor', () => {
  it("uses the winner's colour when there is a winner", () => {
    expect(resolveFloodColor(0xff3b6b)).toBe(0xff3b6b);
    expect(resolveFloodColor(0x3bd7ff)).toBe(0x3bd7ff);
    expect(resolveFloodColor(0)).toBe(0); // a 0x000000 winner colour is still a winner colour
  });

  it('falls back to a neutral slate on a no-solver timeout (undefined)', () => {
    expect(resolveFloodColor(undefined)).toBe(0x7c8694);
  });
});

describe('S95 — solveArpeggio', () => {
  it('is a strictly ascending 4-note run', () => {
    const notes = solveArpeggio();
    expect(notes).toHaveLength(4);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
  });
});
