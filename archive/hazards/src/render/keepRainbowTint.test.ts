/**
 * SPARK — S136 P3: the castle's rainbow celebration (owner playtest item 6).
 *
 * The load-bearing test is the LAST one: all seats must stay visually DISTINCT for the whole window.
 * A naive palette cycle gives every castle the same hue on the same tick, so for four seconds you
 * cannot tell your keep from an enemy's — the identical ownership-legibility failure the S135 audit
 * fixed elsewhere in gathererRenderer. The per-seat offset exists for that reason, so it gets a test
 * rather than a comment.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, RAINBOW_FLYOVER_DURATION_TICKS } from '../constants.ts';
import { keepRainbowTint } from './gathererRenderer.ts';

const OWN = 0x123456;

describe('S136 P3 — keepRainbowTint', () => {
  it('returns the seat colour untouched when no rainbow has ever fired', () => {
    expect(keepRainbowTint(500, undefined, 0, OWN)).toBe(OWN);
  });

  it('cycles the palette during the window, then settles back on the seat colour', () => {
    const sw = 1000;
    expect(keepRainbowTint(sw, sw, 0, OWN)).not.toBe(OWN); // first tick of the party
    expect(keepRainbowTint(sw + RAINBOW_FLYOVER_DURATION_TICKS - 1, sw, 0, OWN)).not.toBe(OWN);
    // Exactly at the end it is over — the window is half-open, matching rainbowFlyoverRenderer.
    expect(keepRainbowTint(sw + RAINBOW_FLYOVER_DURATION_TICKS, sw, 0, OWN)).toBe(OWN);
    expect(keepRainbowTint(sw + 10_000, sw, 0, OWN)).toBe(OWN);
  });

  it('ignores a switch tick in the FUTURE rather than partying early', () => {
    // A joiner can apply a snapshot whose rainbowSwitchTick is ahead of its own mirror tick.
    expect(keepRainbowTint(900, 1000, 0, OWN)).toBe(OWN);
  });

  it('actually changes hue over time (it is a cycle, not one flat override)', () => {
    const sw = 0;
    const seen = new Set<number>();
    for (let t = 0; t < RAINBOW_FLYOVER_DURATION_TICKS; t++) seen.add(keepRainbowTint(t, sw, 0, OWN));
    expect(seen.size).toBe(PLAYER_COLORS.length);
  });

  it('holds each hue for ~10 ticks so it reads as a cycle and does not strobe', () => {
    const sw = 0;
    for (let t = 0; t < 10; t++) {
      expect(keepRainbowTint(t, sw, 0, OWN)).toBe(keepRainbowTint(0, sw, 0, OWN));
    }
    expect(keepRainbowTint(10, sw, 0, OWN)).not.toBe(keepRainbowTint(0, sw, 0, OWN));
  });

  it('is PURE — same inputs, same output, no hidden clock', () => {
    expect(keepRainbowTint(37, 0, 3, OWN)).toBe(keepRainbowTint(37, 0, 3, OWN));
  });

  it('EVERY SEAT STAYS A DIFFERENT COLOUR AT EVERY TICK OF THE WINDOW', () => {
    // Without the per-seat offset this fails immediately: all seats would share one hue.
    const sw = 0;
    for (let t = 0; t < RAINBOW_FLYOVER_DURATION_TICKS; t++) {
      const hues = new Set<number>();
      for (let seat = 0; seat < PLAYER_COLORS.length; seat++) {
        hues.add(keepRainbowTint(t, sw, seat, OWN));
      }
      expect(hues.size, `tick ${t}: seats must all differ, got ${hues.size} distinct hues`).toBe(
        PLAYER_COLORS.length,
      );
    }
  });

  it('a negative seat index cannot produce undefined (modulo is normalised)', () => {
    expect(keepRainbowTint(5, 0, -1, OWN)).toBeTypeOf('number');
  });
});
