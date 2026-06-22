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
  blinkPulse,
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

describe('S95 — blinkPulse (living-spirit blink envelope)', () => {
  it('eyes open (0) outside the blink window, fully shut (1) at its centre', () => {
    expect(blinkPulse(0, 0, 3.3, 0.14)).toBe(0); // window start = just opening
    expect(blinkPulse(0.07, 0, 3.3, 0.14)).toBeCloseTo(1, 5); // dur/2 = fully shut
    expect(blinkPulse(1.5, 0, 3.3, 0.14)).toBe(0); // mid-period = open
  });

  it('is bounded to [0,1] for all inputs and repeats each period', () => {
    for (let t = -2; t <= 10; t += 0.013) {
      const v = blinkPulse(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(blinkPulse(3.3 + 0.07)).toBeCloseTo(blinkPulse(0.07), 5); // one period later
  });

  it('phase desyncs two spirits (different value at the same t)', () => {
    // a spirit mid-blink vs one with eyes open at the same instant
    expect(blinkPulse(0.07, 0)).toBeCloseTo(1, 5);
    expect(blinkPulse(0.07, 1.5)).toBe(0);
  });

  it('degenerate period/dur are safe (return 0, no divide-by-zero)', () => {
    expect(blinkPulse(1, 0, 0, 0.1)).toBe(0);
    expect(blinkPulse(1, 0, 3.3, 0)).toBe(0);
  });
});
