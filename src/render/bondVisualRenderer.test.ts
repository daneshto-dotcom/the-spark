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
import { drawBondVisual, type BondVisualParams } from './bondVisualRenderer.ts';

interface CallRecord {
  readonly op: 'moveTo' | 'lineTo' | 'circle' | 'stroke';
  readonly args: readonly number[];
}

class GraphicsMock {
  readonly calls: CallRecord[] = [];
  moveTo(x: number, y: number): this { this.calls.push({ op: 'moveTo', args: [x, y] }); return this; }
  lineTo(x: number, y: number): this { this.calls.push({ op: 'lineTo', args: [x, y] }); return this; }
  circle(x: number, y: number, r: number): this { this.calls.push({ op: 'circle', args: [x, y, r] }); return this; }
  stroke(_opts: unknown): this { this.calls.push({ op: 'stroke', args: [] }); return this; }
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
    color: 0xffffff,
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

  it('non-animated fx.cable is identical at tick=0 and tick=999', () => {
    const a = calls('fx.cable', 0);
    const b = calls('fx.cable', 999);
    expect(serialize(a)).toEqual(serialize(b));
  });
});

function serialize(calls: readonly CallRecord[]): string {
  return calls.map((c) => `${c.op}(${c.args.map((n) => n.toFixed(3)).join(',')})`).join('|');
}
