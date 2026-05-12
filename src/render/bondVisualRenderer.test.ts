/**
 * SPARK — Session 7 P2 tests for bondVisualRenderer.
 *
 * Pixi v8's Graphics uses a method-chain API. We don't need a real
 * renderer — only a recording mock that captures stroke counts. This is
 * enough to verify:
 *   1. Each visualEffectId drives the correct draw branch (≥1 stroke).
 *   2. Cable/Capsule/Diamond have the expected number of line segments.
 *   3. Degenerate (zero-length) bonds fall through to default-line, no NaN.
 *   4. Animated combos (wheel/vortex/orbital) produce different output at
 *      different ticks — proving the tick parameter actually drives phase.
 */

import { describe, expect, it } from 'vitest';
import { drawBondVisual, lerpColor, type BondVisualParams } from './bondVisualRenderer.ts';

interface CallRecord {
  readonly op: 'moveTo' | 'lineTo' | 'circle' | 'stroke';
  readonly args: readonly number[];
}

class GraphicsMock {
  readonly calls: CallRecord[] = [];
  moveTo(x: number, y: number): this { this.calls.push({ op: 'moveTo', args: [x, y] }); return this; }
  lineTo(x: number, y: number): this { this.calls.push({ op: 'lineTo', args: [x, y] }); return this; }
  circle(x: number, y: number, r: number): this { this.calls.push({ op: 'circle', args: [x, y, r] }); return this; }
  // S8 P4: capture [width, color, alpha] so alpha-only animations (filament
  // shimmer) show up in serialize-comparison tests. Safe for prior tests:
  // tick-independent silhouettes (cable etc.) emit identical args at any
  // tick, and existing .not.toEqual coord-diff tests still differ in coords.
  stroke(opts: { width?: number; color?: number; alpha?: number }): this {
    const w = opts.width ?? 0;
    const c = opts.color ?? 0;
    const a = opts.alpha ?? 1;
    this.calls.push({ op: 'stroke', args: [w, c, a] });
    return this;
  }
  // Unused but silences "may be missing" if Pixi adds methods we forgot to mock.
  rect(): this { return this; }
  roundRect(): this { return this; }
}

function makeParams(overrides: Partial<BondVisualParams> = {}): BondVisualParams {
  return {
    ax: 100,
    ay: 100,
    bx: 200,
    by: 100,
    visualEffectId: 'fx.bond.default',
    // S17 P2: per-endpoint colors. Defaults equal → solid back-compat (Phase-1
    // single-color path); tests can override one or both for gradient cases.
    colorA: 0xffffff,
    colorB: 0xffffff,
    alpha: 0.85,
    width: 2,
    tick: 0,
    ...overrides,
  };
}

const ALL_VISUAL_EFFECT_IDS = [
  'fx.filament',
  'fx.cable',
  'fx.bracket',
  'fx.diamond',
  'fx.wheel',
  'fx.star',
  'fx.orbital',
  'fx.lattice',
  'fx.capsule',
  'fx.vortex',
  'fx.whip',
  'fx.warped',
  'fx.bond.default',
] as const;

describe('S7 P2 — drawBondVisual dispatches per visualEffectId', () => {
  it.each(ALL_VISUAL_EFFECT_IDS)('%s emits at least one stroke', (visualEffectId) => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId }));
    const strokes = g.calls.filter((c) => c.op === 'stroke').length;
    expect(strokes, `${visualEffectId} must emit ≥1 stroke`).toBeGreaterThan(0);
  });

  it('unknown visualEffectId falls through to default line (1 stroke, 1 moveTo + 1 lineTo)', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.does-not-exist' }));
    expect(g.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(g.calls.filter((c) => c.op === 'lineTo')).toHaveLength(1);
    expect(g.calls.filter((c) => c.op === 'stroke')).toHaveLength(1);
  });

  it('fx.cable produces exactly 2 line segments (twin parallels)', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.cable' }));
    expect(g.calls.filter((c) => c.op === 'moveTo')).toHaveLength(2);
    expect(g.calls.filter((c) => c.op === 'lineTo')).toHaveLength(2);
    expect(g.calls.filter((c) => c.op === 'stroke')).toHaveLength(2);
  });

  it('fx.diamond produces a closed quad (4 lineTo back to start)', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.diamond' }));
    // 1 moveTo + 4 lineTo (back to ax,ay) + 1 stroke
    expect(g.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(g.calls.filter((c) => c.op === 'lineTo')).toHaveLength(4);
    // Final lineTo should return to (ax, ay)
    const lineTos = g.calls.filter((c) => c.op === 'lineTo');
    expect(lineTos[3].args).toEqual([100, 100]);
  });

  it('fx.capsule produces 2 parallel lines + 2 end-cap circles', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.capsule' }));
    expect(g.calls.filter((c) => c.op === 'moveTo')).toHaveLength(2);
    expect(g.calls.filter((c) => c.op === 'lineTo')).toHaveLength(2);
    expect(g.calls.filter((c) => c.op === 'circle')).toHaveLength(2);
    expect(g.calls.filter((c) => c.op === 'stroke')).toHaveLength(4); // 2 lines + 2 caps
  });

  it('fx.filament produces main bond + 6-ray starburst (≥7 strokes)', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.filament' }));
    // 1 main bond + 6 rays = 7 strokes minimum
    expect(g.calls.filter((c) => c.op === 'stroke').length).toBeGreaterThanOrEqual(7);
  });

  it('S8 P2 — fx.lattice emits 3 strokes (outline + 2 cross-hatch lines)', () => {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId: 'fx.lattice' }));
    expect(g.calls.filter((c) => c.op === 'stroke')).toHaveLength(3);
  });
});

describe('S7 P2 — degenerate (zero-length) bonds', () => {
  it.each(ALL_VISUAL_EFFECT_IDS)('%s with ax=bx, ay=by falls through to default line — no NaN, ≥1 stroke', (visualEffectId) => {
    const g = new GraphicsMock();
    drawBondVisual(
      g as unknown as Parameters<typeof drawBondVisual>[0],
      makeParams({ visualEffectId, ax: 500, ay: 500, bx: 500, by: 500 }),
    );
    // Either default branch fires directly (fx.bond.default) or each magic
    // combo's "if (len < 1) drawDefaultLine" guard fires. Either way: 1
    // moveTo + 1 lineTo + 1 stroke is the floor.
    expect(g.calls.filter((c) => c.op === 'moveTo').length).toBeGreaterThanOrEqual(1);
    expect(g.calls.filter((c) => c.op === 'lineTo').length).toBeGreaterThanOrEqual(1);
    // No NaN should leak into call args.
    for (const c of g.calls) {
      for (const a of c.args) {
        expect(Number.isFinite(a), `${visualEffectId} produced non-finite coord`).toBe(true);
      }
    }
  });
});

describe('S7 P2 — tick-driven animation', () => {
  function strokeArgsAt(visualEffectId: string, tick: number): readonly CallRecord[] {
    const g = new GraphicsMock();
    drawBondVisual(g as unknown as Parameters<typeof drawBondVisual>[0], makeParams({ visualEffectId, tick }));
    return [...g.calls];
  }

  function calls(visualEffectId: string, tick: number): readonly CallRecord[] {
    return strokeArgsAt(visualEffectId, tick);
  }

  it('fx.wheel rotates spokes — call output differs at tick=0 vs tick=120', () => {
    const a = calls('fx.wheel', 0);
    const b = calls('fx.wheel', 120);
    // The fixed parts (moveTo/lineTo of the bond, the circle) match;
    // the rotating spoke endpoints differ.
    expect(serialize(a)).not.toEqual(serialize(b));
  });

  it('fx.vortex phase rotates — call output differs at tick=0 vs tick=240', () => {
    const a = calls('fx.vortex', 0);
    const b = calls('fx.vortex', 240);
    expect(serialize(a)).not.toEqual(serialize(b));
  });

  it('fx.orbital pulses radii — circle args differ between tick=0 and tick=45 (peak)', () => {
    const a = calls('fx.orbital', 0);
    const b = calls('fx.orbital', 45); // ~quarter cycle of 0.035 rad/tick
    const aCircles = a.filter((c) => c.op === 'circle');
    const bCircles = b.filter((c) => c.op === 'circle');
    expect(aCircles).toHaveLength(2);
    expect(bCircles).toHaveLength(2);
    expect(aCircles[0].args[2]).not.toEqual(bCircles[0].args[2]); // r1 differs
  });

  it('S8 P1 — fx.whip wave drift — output differs at tick=0 vs tick=120', () => {
    const a = calls('fx.whip', 0);
    const b = calls('fx.whip', 120);
    expect(serialize(a)).not.toEqual(serialize(b));
  });

  it('S8 P3 — fx.warped 3-fold ring rotates + breathes — output differs at tick=0 vs tick=120', () => {
    const a = calls('fx.warped', 0);
    const b = calls('fx.warped', 120);
    expect(serialize(a)).not.toEqual(serialize(b));
  });

  it('S8 P4 — fx.filament starburst shimmer — ray-stroke alpha differs at tick=0 vs tick=40', () => {
    // Filament rays don't move (fixed angles, fixed positions) — only their
    // alpha modulates. With the P4 mock extension capturing stroke args,
    // serialize differs ONLY via the alpha column. Tick=40 ≈ quarter cycle
    // of 0.04 rad/tick → sin(1.6) ≈ 0.9996, near shimmer peak.
    const a = calls('fx.filament', 0);
    const b = calls('fx.filament', 40);
    expect(serialize(a)).not.toEqual(serialize(b));
  });

  // S8 P5 — after P1/P3/P4 the 12 magic silhouettes split 6 animated
  // (wheel, vortex, orbital, whip, warped, filament) + 6 static. This
  // guards the OPPOSITE regression class: a future refactor accidentally
  // wiring p.tick into a silhouette that should stay frame-stable.
  const STATIC_SILHOUETTES = [
    'fx.cable',
    'fx.bracket',
    'fx.diamond',
    'fx.star',
    'fx.lattice',
    'fx.capsule',
  ] as const;
  it.each(STATIC_SILHOUETTES)('S8 P5 — non-animated %s is identical at tick=0 and tick=999', (visualEffectId) => {
    const a = calls(visualEffectId, 0);
    const b = calls(visualEffectId, 999);
    expect(serialize(a)).toEqual(serialize(b));
  });
});

function serialize(calls: readonly CallRecord[]): string {
  return calls.map((c) => `${c.op}(${c.args.map((n) => n.toFixed(3)).join(',')})`).join('|');
}

/* ────────────────── S17 P2 — Phase-2 §VI.4/§X.2 multi-color rendering ──────────────────
 * colorA / colorB sourced from endpoint placerColor (immutable per Gemini #1
 * BLOCKER). Same-color bonds emit a single solid stroke (back-compat path);
 * cross-color bonds emit 4 lerped sub-segments (stroke decomposition because
 * Pixi v8 has no native A→B endpoint gradient stroke API per Council R1
 * Grok #6 + Gemini #5).
 */

describe('S17 P2 — lerpColor pure helper', () => {
  it('returns colorA exactly at t=0', () => {
    expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
  });
  it('returns colorB exactly at t=1', () => {
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
  it('midpoint t=0.5 averages each RGB channel', () => {
    // (0xff + 0x00)/2 = 0x7f or 0x80 (rounding). 0xff/2 = 127.5 → round=128 = 0x80.
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
  it('endpoint-color preservation in pure-green-to-cyan gradient', () => {
    // 0x00ff00 → 0x00ffff. R/G stay 00/ff; B goes 00 → ff. Midpoint = 0x00ff80.
    expect(lerpColor(0x00ff00, 0x00ffff, 0.5)).toBe(0x00ff80);
  });
});

describe("S17 P2 — drawDefaultLine renders solid for same-color (back-compat)", () => {
  it('emits exactly one stroke when colorA === colorB', () => {
    const g = new GraphicsMock();
    drawBondVisual(
      g as unknown as Parameters<typeof drawBondVisual>[0],
      makeParams({ visualEffectId: 'fx.bond.default', colorA: 0xff3b6b, colorB: 0xff3b6b }),
    );
    const strokes = g.calls.filter((c) => c.op === 'stroke');
    expect(strokes.length).toBe(1);
    // Stroke records [width, color, alpha] → confirm color matches colorA.
    expect(strokes[0].args[1]).toBe(0xff3b6b);
  });
});

describe("S17 P2 — drawDefaultLine renders 4-segment gradient when colorA !== colorB", () => {
  it('emits exactly 4 strokes between distinct endpoint colors', () => {
    const g = new GraphicsMock();
    drawBondVisual(
      g as unknown as Parameters<typeof drawBondVisual>[0],
      makeParams({ visualEffectId: 'fx.bond.default', colorA: 0xff0000, colorB: 0x0000ff }),
    );
    const strokes = g.calls.filter((c) => c.op === 'stroke');
    expect(strokes.length).toBe(4);
  });

  it('sub-segment colors progress monotonically (R → B lerp)', () => {
    const g = new GraphicsMock();
    drawBondVisual(
      g as unknown as Parameters<typeof drawBondVisual>[0],
      makeParams({ visualEffectId: 'fx.bond.default', colorA: 0xff0000, colorB: 0x0000ff }),
    );
    const strokes = g.calls.filter((c) => c.op === 'stroke');
    // Each stroke: args[1] = color. R channel decreases, B channel increases
    // monotonically across the 4 sub-segments.
    const rChannels = strokes.map((s) => ((s.args[1] as number) >> 16) & 0xff);
    const bChannels = strokes.map((s) => (s.args[1] as number) & 0xff);
    for (let i = 1; i < rChannels.length; i++) {
      expect(rChannels[i]).toBeLessThan(rChannels[i - 1]);
      expect(bChannels[i]).toBeGreaterThan(bChannels[i - 1]);
    }
  });

  it('sub-segments span the full bond axis (first start = A, last end = B)', () => {
    const g = new GraphicsMock();
    drawBondVisual(
      g as unknown as Parameters<typeof drawBondVisual>[0],
      makeParams({
        ax: 100, ay: 50, bx: 300, by: 150,
        visualEffectId: 'fx.bond.default',
        colorA: 0xff0000, colorB: 0x0000ff,
      }),
    );
    const moves = g.calls.filter((c) => c.op === 'moveTo');
    const lines = g.calls.filter((c) => c.op === 'lineTo');
    // First moveTo should be at (ax, ay) = (100, 50).
    expect(moves[0].args).toEqual([100, 50]);
    // Last lineTo should be at (bx, by) = (300, 150).
    expect(lines[lines.length - 1].args).toEqual([300, 150]);
  });
});
