/**
 * SPARK — S161 W1-B. The three procedural race marks, driven through a recording fake `Graphics`
 * (the `bondVisualRenderer.test.ts` / `chewerRenderer.test.ts` idiom — a real Pixi draw path cannot
 * be exercised under vitest, the S130 finding).
 *
 * ⭐ WHAT IS WORTH ASSERTING HERE IS *DISTINGUISHABILITY*, NOT PRETTINESS. W1-B's exit gate is "six
 * castles, three states each, visually distinct in a captured frame". A test cannot judge the frame,
 * but it CAN prove the thing that would make the frame wrong in the boring way: that six races do
 * not all fall through to the same drawing. That is a real failure mode here — every one of these
 * functions is a `switch` over `RaceId` with no `default`, so a race added later draws NOTHING and
 * `tsc` says nothing unless the switch is exhaustive over a union.
 */

import { describe, expect, it } from 'vitest';
import {
  CASTLE_SHOT_VFX_TICKS,
  drawCastleShotVfx,
  drawRaceGathererMark,
  drawRaceKeepFallback,
} from './raceMotifs.ts';
import { ALL_RACES, RACE_COLORS } from '../state/races.ts';
import { KEEP_H, KEEP_W } from '../constants.ts';

type Op = 'rect' | 'circle' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'arc' | 'fill' | 'stroke';

/** Records the shape of the draw, not the pixels: op order plus the numeric arguments. */
class FakeGraphics {
  readonly calls: { op: Op; args: number[] }[] = [];
  private push(op: Op, args: number[]): this {
    this.calls.push({ op, args });
    return this;
  }
  rect(...a: number[]): this { return this.push('rect', a); }
  circle(...a: number[]): this { return this.push('circle', a); }
  moveTo(...a: number[]): this { return this.push('moveTo', a); }
  lineTo(...a: number[]): this { return this.push('lineTo', a); }
  quadraticCurveTo(...a: number[]): this { return this.push('quadraticCurveTo', a); }
  arc(...a: number[]): this { return this.push('arc', a); }
  fill(): this { return this.push('fill', []); }
  stroke(): this { return this.push('stroke', []); }
  /** A stable string for "what was drawn", so two races can be compared for sameness. */
  signature(): string {
    return this.calls.map((c) => `${c.op}(${c.args.map((n) => n.toFixed(2)).join(',')})`).join('|');
  }
}

// The fake stands in for a Pixi Graphics; every function under test only ever chains these ops.
const g = (): FakeGraphics => new FakeGraphics();
const asG = (f: FakeGraphics): Parameters<typeof drawRaceGathererMark>[0] =>
  f as unknown as Parameters<typeof drawRaceGathererMark>[0];

describe('drawRaceKeepFallback', () => {
  const draw = (race: (typeof ALL_RACES)[number]): FakeGraphics => {
    const f = g();
    drawRaceKeepFallback(asG(f), 100, 200, KEEP_W, KEEP_H, 10, 0xff3b6b, race);
    return f;
  };

  it('draws something for every race — no race falls through the switch', () => {
    for (const race of ALL_RACES) {
      expect(draw(race).calls.length, race).toBeGreaterThan(3);
    }
  });

  it('gives all six races a DIFFERENT roofline', () => {
    const sigs = new Map<string, string>();
    for (const race of ALL_RACES) sigs.set(race, draw(race).signature());
    expect(new Set(sigs.values()).size, [...sigs].map(([r, s]) => `${r}:${s.length}`).join(' ')).toBe(
      ALL_RACES.length,
    );
  });

  it('keeps the shared parts shared: every race draws the body band and the gate', () => {
    // The fallback has to stay recognisably the SAME placeholder the player already knows — only
    // the roofline is the race. Both rects are unmistakable by their arguments.
    for (const race of ALL_RACES) {
      const rects = draw(race).calls.filter((c) => c.op === 'rect');
      const body = rects.find((r) => r.args[2] === KEEP_W && r.args[3] === KEEP_H - 10);
      const gate = rects.find((r) => r.args[2] === 18 && r.args[3] === 18);
      expect(body, `${race} body band`).toBeDefined();
      expect(gate, `${race} gate`).toBeDefined();
    }
  });
});

describe('drawRaceGathererMark', () => {
  const R = 11;
  const draw = (race: (typeof ALL_RACES)[number]): FakeGraphics => {
    const f = g();
    drawRaceGathererMark(asG(f), 500, 400, R, 0x3bd7ff, race);
    return f;
  };

  it('marks every race, and marks all six differently', () => {
    const sigs = new Set<string>();
    for (const race of ALL_RACES) {
      const f = draw(race);
      expect(f.calls.length, race).toBeGreaterThan(0);
      sigs.add(f.signature());
    }
    expect(sigs.size).toBe(ALL_RACES.length);
  });

  it('never draws a CIRCLE, because three concentric circles already mean unit STATE', () => {
    /*
     * ⛔ THE ONE HARD CONSTRAINT IN THIS FILE. drawGatherer owns rings at r+7 (hauling), r+10 and
     * r+14 (WAITING — "my haulers have stalled") and r+11 (a standing order). A race mark that
     * added a fourth ring would be read as a status change, which is strictly worse than having no
     * race mark at all.
     */
    for (const race of ALL_RACES) {
      expect(draw(race).calls.filter((c) => c.op === 'circle'), race).toHaveLength(0);
    }
  });

  it('stays within reach of the glyph — no mark strays beyond 2r from the unit', () => {
    for (const race of ALL_RACES) {
      for (const c of draw(race).calls) {
        for (let i = 0; i + 1 < c.args.length; i += 2) {
          const dx = c.args[i]! - 500;
          const dy = c.args[i + 1]! - 400;
          expect(Math.hypot(dx, dy), `${race} ${c.op}`).toBeLessThanOrEqual(R * 2);
        }
      }
    }
  });

  it('scales with the radius rather than hard-coding pixels', () => {
    // Doubling r must move the marks; a hard-coded mark would produce an identical signature.
    for (const race of ALL_RACES) {
      const small = g();
      const big = g();
      drawRaceGathererMark(asG(small), 0, 0, 5, 0xffffff, race);
      drawRaceGathererMark(asG(big), 0, 0, 10, 0xffffff, race);
      expect(small.signature(), race).not.toBe(big.signature());
    }
  });
});

describe('drawCastleShotVfx', () => {
  const draw = (
    race: (typeof ALL_RACES)[number],
    progress: number,
  ): FakeGraphics => {
    const f = g();
    drawCastleShotVfx(asG(f), 100, 100, 300, 220, progress, RACE_COLORS[race], race);
    return f;
  };

  it('draws a distinct projectile for every race', () => {
    const sigs = new Set<string>();
    for (const race of ALL_RACES) {
      const f = draw(race, 0.5);
      expect(f.calls.length, race).toBeGreaterThan(0);
      sigs.add(f.signature());
    }
    expect(sigs.size).toBe(ALL_RACES.length);
  });

  it('every race TRAVELS: the mark at progress 0 is not the mark at progress 1', () => {
    for (const race of ALL_RACES) {
      expect(draw(race, 0).signature(), race).not.toBe(draw(race, 1).signature());
    }
  });

  it('clamps out-of-range progress instead of flying past the target', () => {
    for (const race of ALL_RACES) {
      expect(draw(race, -3).signature(), `${race} under`).toBe(draw(race, 0).signature());
      expect(draw(race, 9).signature(), `${race} over`).toBe(draw(race, 1).signature());
    }
  });

  it('is a pure function of its arguments — same inputs, same drawing', () => {
    // The determinism claim the whole no-wire-field design rests on: two peers on the same tick
    // must produce the same shot. No RNG, no wall clock, nothing captured.
    for (const race of ALL_RACES) {
      expect(draw(race, 0.37).signature()).toBe(draw(race, 0.37).signature());
    }
  });

  it('survives a zero-length flight (castle and target on the same pixel) without NaN', () => {
    for (const race of ALL_RACES) {
      const f = g();
      drawCastleShotVfx(asG(f), 250, 250, 250, 250, 0.5, 0xffffff, race);
      for (const c of f.calls) {
        for (const n of c.args) expect(Number.isFinite(n), `${race} ${c.op}`).toBe(true);
      }
    }
  });

  it('the VFX window is long enough to survive a 10 Hz snapshot', () => {
    // A client samples world state at 10 Hz — six render frames per snapshot. A window shorter than
    // that could land entirely between two samples and the shot would never be seen on a joiner.
    expect(CASTLE_SHOT_VFX_TICKS).toBeGreaterThanOrEqual(12);
  });
});
