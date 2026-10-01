import { describe, expect, it } from 'vitest';
import {
  clamp01, easeInQuad, easeOutCubic, envelope, forEachLive, fxHash, fxSeed, fxSeedAt, mixColor,
} from './emitter.ts';

describe('S192 fx emitter — fxHash is a deterministic, well-spread [0,1) source', () => {
  it('same inputs → same output, every time', () => {
    for (let i = 0; i < 200; i++) expect(fxHash(1234, i, 7)).toBe(fxHash(1234, i, 7));
  });
  it('stays inside [0, 1)', () => {
    for (let i = 0; i < 5000; i++) {
      const v = fxHash(i * 31, i, i >> 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('neighbouring indices land far apart (no visible banding) and the mean is near ½', () => {
    let sum = 0;
    let adjacentClose = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const a = fxHash(99, i);
      sum += a;
      if (Math.abs(a - fxHash(99, i + 1)) < 0.01) adjacentClose++;
    }
    expect(sum / N).toBeGreaterThan(0.47);
    expect(sum / N).toBeLessThan(0.53);
    expect(adjacentClose / N, 'about 2 % would be chance').toBeLessThan(0.04);
  });
  it('the seed, the index and the salt all change the result', () => {
    expect(fxHash(1, 2, 3)).not.toBe(fxHash(2, 2, 3));
    expect(fxHash(1, 2, 3)).not.toBe(fxHash(1, 3, 3));
    expect(fxHash(1, 2, 3)).not.toBe(fxHash(1, 2, 4));
    expect(fxSeed(5, 1)).not.toBe(fxSeed(5, 2));
    expect(fxSeed(5, 1)).not.toBe(fxSeed(6, 1));
    expect(fxSeedAt(100, 10.2, 20)).toBe(fxSeedAt(100, 9.8, 20)); // rounded position
    expect(fxSeedAt(100, 10, 20)).not.toBe(fxSeedAt(101, 10, 20));
  });
});

describe('S192 fx emitter — forEachLive is the stateless continuous emitter', () => {
  const collect = (now: number, period: number, life: number, per: number, phase: number) => {
    const out: Array<[number, number, number]> = [];
    forEachLive(now, period, life, per, phase, (b, k, t) => out.push([b, k, t]));
    return out;
  };

  it('holds floor..ceil(life / period) × perBirth particles in steady state (exact when period divides life)', () => {
    for (const [period, life] of [[4, 120], [5, 120], [7, 90], [1, 30], [6, 6]] as const) {
      for (let now = 500; now < 520; now++) {
        const n = collect(now, period, life, 2, 3).length;
        expect(n).toBeGreaterThanOrEqual(Math.floor(life / period) * 2);
        expect(n).toBeLessThanOrEqual(Math.ceil(life / period) * 2);
        if (life % period === 0) expect(n).toBe((life / period) * 2);
      }
    }
  });
  it('every particle is born on the phase lattice, inside its life, with t = age / life', () => {
    const now = 1000;
    for (const [b, , t] of collect(now, 6, 100, 1, 4)) {
      expect(((b - 4) % 6 + 6) % 6).toBe(0);
      expect(now - b).toBeGreaterThanOrEqual(0);
      expect(now - b).toBeLessThan(100);
      expect(t).toBeCloseTo((now - b) / 100, 12);
    }
  });
  it('⛔ DETERMINISM — the same tick gives the same particles, regardless of what was asked before', () => {
    const a = collect(777, 5, 120, 3, 11);
    collect(12, 5, 120, 3, 11); // an unrelated call in between: there is no hidden state
    expect(collect(777, 5, 120, 3, 11)).toEqual(a);
  });
  it('a particle keeps its identity from one tick to the next (it ages, it does not re-roll)', () => {
    const t0 = collect(300, 5, 50, 1, 0);
    const t1 = collect(301, 5, 50, 1, 0);
    const born0 = new Set(t0.map(([b]) => b));
    const shared = t1.filter(([b]) => born0.has(b));
    expect(shared.length).toBeGreaterThanOrEqual(t0.length - 1);
  });
  it('phase spreads two sources apart, and a negative phase is handled', () => {
    expect(collect(100, 10, 10, 1, 0)[0]![0]).toBe(100);
    expect(collect(100, 10, 10, 1, 3)[0]![0]).toBe(93);
    expect(collect(100, 10, 10, 1, -7)[0]![0]).toBe(93);
  });
  it('degenerate input emits nothing rather than looping', () => {
    expect(collect(100, 0, 10, 1, 0)).toEqual([]);
    expect(collect(100, 5, 0, 1, 0)).toEqual([]);
    expect(collect(100, 5, 10, 0, 0)).toEqual([]);
  });
});

describe('S192 fx emitter — the curves', () => {
  it('clamp01 / easeOutCubic / easeInQuad hit their ends and are monotone', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeInQuad(0)).toBe(0);
    expect(easeInQuad(1)).toBe(1);
    let pa = -1;
    let pb = -1;
    for (let i = 0; i <= 50; i++) {
      const a = easeOutCubic(i / 50);
      const b = easeInQuad(i / 50);
      expect(a).toBeGreaterThanOrEqual(pa);
      expect(b).toBeGreaterThanOrEqual(pb);
      pa = a;
      pb = b;
    }
    expect(easeOutCubic(0.5), 'fast start').toBeGreaterThan(0.5);
    expect(easeInQuad(0.5), 'slow start').toBeLessThan(0.5);
  });
  it('envelope rises to 1 at its peak and is 0 at both ends', () => {
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
    expect(envelope(0.25, 0.25)).toBeCloseTo(1, 12);
    expect(envelope(0.6, 0.6)).toBeCloseTo(1, 12);
    expect(envelope(0.1, 0.25)).toBeLessThan(envelope(0.2, 0.25));
  });
  it('mixColor blends per channel and returns its ends exactly', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(mixColor(0x123456, 0x654321, 2)).toBe(0x654321);
  });
});
