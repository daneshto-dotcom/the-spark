import { describe, expect, it } from 'vitest';
import { recordingSink } from './emitter.ts';
import { CASTLE_SHOT_FX_IMPACT_AT, castleShotFx, castleShotHead } from './castleShotFx.ts';

function run(t: number, seat = 1, fireTick = 600) {
  const top = recordingSink();
  castleShotFx(top, 100, 100, 400, 220, t, 0x3bd7ff, seat, fireTick);
  return top.out;
}

describe('S192 V06 — the castle bolt\'s light (`castleShotFx`)', () => {
  it('flies the same straight line the S161 race ammunition flies', () => {
    expect(castleShotHead(100, 100, 400, 220, 0)).toEqual({ x: 100, y: 100 });
    expect(castleShotHead(100, 100, 400, 220, 1)).toEqual({ x: 400, y: 220 });
    expect(castleShotHead(100, 100, 400, 220, 0.5)).toEqual({ x: 250, y: 160 });
  });

  it('draws only across the flight', () => {
    expect(run(-0.01)).toEqual([]);
    expect(run(1)).toEqual([]);
    expect(run(0.4).length).toBeGreaterThan(0);
  });

  it('the core sits on the head; the trail lies BEHIND it, towards the castle', () => {
    const out = run(0.5);
    const core = out.find((e) => e.tex === 'core')!;
    expect(core.x).toBeCloseTo(250, 9);
    const trail = out.filter((e) => e.tex === 'soft' && e.w !== 30);
    expect(trail.length).toBe(6);
    for (const e of trail) expect(e.x).toBeLessThan(250);
  });

  it('the impact (ring + sparks) appears only on arrival, at the target', () => {
    expect(run(0.5).some((e) => e.tex === 'ring')).toBe(false);
    const late = run(CASTLE_SHOT_FX_IMPACT_AT + 0.1);
    const ring = late.find((e) => e.tex === 'ring')!;
    expect([ring.x, ring.y]).toEqual([400, 220]);
  });

  it('⛔ DETERMINISM — same seat and fire tick → identical sparks; another shot differs', () => {
    const t = CASTLE_SHOT_FX_IMPACT_AT + 0.1;
    expect(run(t)).toEqual(run(t));
    expect(run(t, 1, 601)).not.toEqual(run(t));
    expect(run(t, 2, 600)).not.toEqual(run(t));
  });
});
