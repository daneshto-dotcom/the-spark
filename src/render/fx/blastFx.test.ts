import { describe, expect, it } from 'vitest';
import { recordingSink, type FxShockSink } from './emitter.ts';
import { BLAST_FX_RING_REACH, blastEmberAt, blastFx } from './blastFx.ts';

function run(t: number, radius = 100, tick = 50, x = 400, y = 300) {
  const top = recordingSink();
  const ground = recordingSink();
  const shade = recordingSink();
  const sh: FxShockSink & { n: number } = { n: 0, shock() { this.n++; } };
  blastFx(top, shade, ground, sh, tick, x, y, radius, t, Math.round(t * 36));
  return { top: top.out, shade: shade.out, ground: ground.out, shocks: sh.n };
}

describe('S192 V04 — every detonation (`blastFx`)', () => {
  it('draws nothing outside its life, and something across it', () => {
    expect(run(-0.1).top).toEqual([]);
    expect(run(1).top).toEqual([]);
    for (let t = 0; t < 1; t += 0.1) expect(run(t).top.length).toBeGreaterThan(0);
  });

  it('⛔ DETERMINISM — same effect tick + position → identical sprites; another blast differs', () => {
    expect(run(0.3)).toEqual(run(0.3));
    expect(run(0.3, 100, 51).top).not.toEqual(run(0.3).top);
    expect(run(0.3, 100, 50, 401).top).not.toEqual(run(0.3).top);
  });

  it('the flash belongs to the first quarter only', () => {
    const flashes = (t: number) => run(t).top.filter((e) => e.tex === 'core' && e.tint === 0xfff4d6).length;
    expect(flashes(0.05)).toBe(1);
    expect(flashes(0.3)).toBe(0);
  });

  it('⭐ the shock ring stops at the hitbox (1.15 × radius), where the S71 ring ran to 3.2 ×', () => {
    for (const radius of [70, 110, 240, 380]) {
      for (let t = 0; t < 1; t += 0.05) {
        for (const e of run(t, radius).top.filter((s) => s.tex === 'ring')) {
          expect(e.w / 2).toBeLessThanOrEqual(radius * BLAST_FX_RING_REACH + 1e-6);
        }
      }
    }
  });

  it('scales with the radius: a zombie raze is the same explosion as a goblin pop, larger', () => {
    const fire = (r: number) => run(0.2, r).top.find((e) => e.tex === 'soft' && e.blend === 'add')!;
    expect(fire(380).w / fire(70).w).toBeCloseTo(380 / 70, 6);
  });

  it('embers fly OUT, then fall (gravity)', () => {
    let out = 0;
    for (let k = 0; k < 28; k++) {
      const a = blastEmberAt(9, k, 0.1, 100);
      const b = blastEmberAt(9, k, 0.6, 100);
      if (Math.abs(b.dx) > Math.abs(a.dx)) out++;
      const late = blastEmberAt(9, k, 1, 100);
      const mid = blastEmberAt(9, k, 0.5, 100);
      expect(late.dy - mid.dy, 'falling by the end').toBeGreaterThan(0);
    }
    expect(out).toBeGreaterThan(20);
  });

  it('smoke and scorch are normal-blend (they darken); fire, flash, ring and embers are light', () => {
    const r = run(0.3);
    expect(r.ground.every((e) => e.blend === 'normal')).toBe(true);
    // ⛔ S192 audit V-2 — smoke lives ONLY on the non-bloomed shade layer, in normal blend; the bloomed
    // light layer carries no smoke and nothing that is not additive.
    expect(r.shade.length).toBeGreaterThan(0);
    expect(r.shade.every((e) => e.tex === 'smoke' && e.blend === 'normal')).toBe(true);
    expect(r.top.some((e) => e.tex === 'smoke')).toBe(false);
    expect(r.top.every((e) => e.blend === 'add')).toBe(true);
    expect(r.shocks).toBe(1);
  });
});
