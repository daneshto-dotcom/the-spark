/**
 * SPARK — S185 — the per-race ground marks.
 *
 * ⭐ WHAT CAN ACTUALLY BE PINNED HERE, given no renderer runs under vitest: that every race draws
 * SOMETHING, that no two races draw the SAME thing, that nothing is drawn in a colour the board
 * would swallow, and that the animated ones are a function of `world.tick` and nothing else.
 *
 * ⛔ THE INVISIBILITY ASSERTION IS THE ONE THAT EARNS ITS KEEP. This repo has already shipped a
 * decal nobody could see — `creatureLift.ts` records the measurement, a `0x000000` fill at alpha
 * 0.22 that a pixel sample could not distinguish from the board. The board is PURE BLACK, so a
 * near-black ground stain is not a subtle stain, it is an absent one.
 */

import { describe, expect, it } from 'vitest';
import { ALL_RACES, RACE_COLORS } from '../state/races.ts';
import { ANIMATED_RACES, drawRaceGround, shade, type GroundTarget } from './raceGround.ts';

interface Call { op: string; args: unknown[] }

/** A recording stand-in for Pixi's fluent Graphics. */
function recorder(): { g: GroundTarget; calls: Call[] } {
  const calls: Call[] = [];
  const g: GroundTarget = {
    ellipse: (...a) => { calls.push({ op: 'ellipse', args: a }); return g; },
    poly: (...a) => { calls.push({ op: 'poly', args: a }); return g; },
    fill: (...a) => { calls.push({ op: 'fill', args: a }); return g; },
    moveTo: (...a) => { calls.push({ op: 'moveTo', args: a }); return g; },
    lineTo: (...a) => { calls.push({ op: 'lineTo', args: a }); return g; },
    stroke: (...a) => { calls.push({ op: 'stroke', args: a }); return g; },
  };
  return { g, calls };
}

function draw(race: typeof ALL_RACES[number], tick = 0, id = 7): Call[] {
  const { g, calls } = recorder();
  drawRaceGround(g, race, id, 400, 300, 50, 50, tick);
  return calls;
}

/** Every colour this race paints with, from fills and strokes alike. */
function colours(calls: Call[]): number[] {
  return calls
    .filter((c) => c.op === 'fill' || c.op === 'stroke')
    .map((c) => (c.args[0] as { color: number }).color);
}

/** Rec. 709 relative luminance, 0..255 — the same question a pixel sample would ask. */
function luma(c: number): number {
  return 0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff);
}

describe('S185 — every race gets a ground mark, and they are all different', () => {
  it('all six draw something', () => {
    for (const race of ALL_RACES) {
      expect(draw(race).length, race).toBeGreaterThan(0);
    }
  });

  /**
   * ⛔ The point of the feature is that you can tell whose ground you are looking at. Two races
   * producing an identical call list would be a copy-paste that no screenshot review would catch.
   */
  it('no two races produce the same drawing', () => {
    const sigs = ALL_RACES.map((r) => JSON.stringify(draw(r)));
    expect(new Set(sigs).size).toBe(ALL_RACES.length);
  });

  it('⛔ nothing is drawn near-black — the board is black and would swallow it', () => {
    for (const race of ALL_RACES) {
      for (const c of colours(draw(race))) {
        expect(luma(c), `${race} drew ${c.toString(16)}`).toBeGreaterThan(12);
      }
    }
  });

  it('each race paints in its OWN identity, not a shared palette', () => {
    for (const race of ALL_RACES) {
      const base = RACE_COLORS[race];
      const dominant = (ch: number): number => (base >> ch) & 0xff;
      // the channel that leads the race colour must lead every colour the decal uses
      const lead = [16, 8, 0].reduce((a, b) => (dominant(a) >= dominant(b) ? a : b));
      for (const c of colours(draw(race))) {
        const chans = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
        expect(Math.max(...chans), race).toBe((c >> lead) & 0xff);
      }
    }
  });
});

describe('S185 — animation is tick-driven, and only where the material moves', () => {
  it('⭐ the two animated races change with the tick', () => {
    for (const race of ALL_RACES) {
      const same = JSON.stringify(draw(race, 0)) === JSON.stringify(draw(race, 31));
      expect(!same, `${race} animated?`).toBe(ANIMATED_RACES[race]);
    }
  });

  /**
   * ⛔ DETERMINISM. Two peers must draw the identical ground from the identical tick — the whole
   * reason variation comes from `mix32(id, …)` rather than from `Math.random`.
   */
  it('the same id and tick always draw the same thing', () => {
    for (const race of ALL_RACES) {
      expect(draw(race, 42, 11)).toEqual(draw(race, 42, 11));
    }
  });

  it('different structures of one race differ, so a row of towers is not stamped', () => {
    const a = JSON.stringify(draw('zombies', 0, 1));
    const b = JSON.stringify(draw('zombies', 0, 2));
    expect(a).not.toBe(b);
  });
});

describe('S185 — shade()', () => {
  it('darkens, brightens and clamps', () => {
    expect(shade(0x804020, 0.5)).toBe(0x402010);
    expect(shade(0x102030, 2)).toBe(0x204060);
    expect(shade(0xffffff, 4)).toBe(0xffffff);
    expect(shade(0x000000, 4)).toBe(0x000000);
  });
});
