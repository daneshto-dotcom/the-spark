/**
 * SPARK — S79 P2 pooped-building tint tests.
 *
 * foulAwareTint is the single pure helper behind both the fouled-primitive sprite tint
 * and the fouled-bond endpoint colours (structureRenderer.sync). Contract:
 *   - un-fouled → base colour bit-exact (no drift on the hot un-fouled path);
 *   - fouled    → every RGB channel moves toward POOP_FOUL_TINT by POOP_FOUL_TINT_STRENGTH
 *                 (the splat's green-brown core), and the result is stable (pure).
 */

import { describe, expect, it } from 'vitest';
import { POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH } from '../constants.ts';
import { foulAwareTint } from './structureRenderer.ts';

const channels = (c: number): [number, number, number] => [
  (c >> 16) & 0xff,
  (c >> 8) & 0xff,
  c & 0xff,
];

describe('S79 P2 — foulAwareTint (pooped-building visual)', () => {
  it('un-fouled returns the base colour bit-exactly', () => {
    for (const base of [0x000000, 0xffffff, 0x00e5ff, 0xff3030, 0x7f7f7f]) {
      expect(foulAwareTint(base, false)).toBe(base);
    }
  });

  it('fouled moves every channel toward POOP_FOUL_TINT by the configured strength', () => {
    const base = 0x00e5ff; // cyan (player 1) — distinct from the foul tint on all channels
    const out = foulAwareTint(base, true);
    const [br, bg, bb] = channels(base);
    const [fr, fg, fb] = channels(POOP_FOUL_TINT);
    const [or_, og, ob] = channels(out);
    expect(or_).toBe(Math.round(br + (fr - br) * POOP_FOUL_TINT_STRENGTH));
    expect(og).toBe(Math.round(bg + (fg - bg) * POOP_FOUL_TINT_STRENGTH));
    expect(ob).toBe(Math.round(bb + (fb - bb) * POOP_FOUL_TINT_STRENGTH));
  });

  it('fouled output differs from base for every player colour (the cue is visible)', () => {
    // PLAYER_COLORS palette values as of S79 — the assertion is palette-agnostic
    // (any base not already equal to the foul tint must visibly change).
    for (const base of [0xffd24a, 0x00e5ff, 0xff5db1, 0x7CFF6B, 0xff9d3b, 0xb86bff]) {
      expect(foulAwareTint(base, true)).not.toBe(base);
    }
  });

  it('is pure — repeated calls agree (sprite tint sync relies on stable equality)', () => {
    const a = foulAwareTint(0xffd24a, true);
    const b = foulAwareTint(0xffd24a, true);
    expect(a).toBe(b);
  });
});
