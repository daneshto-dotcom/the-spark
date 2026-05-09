import { describe, expect, it } from 'vitest';
import { SparkType } from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asSparkId } from '../types.ts';
import { getVelocity, setVelocity, verletStep, verletStepAll } from './verlet.ts';

const DT = 1 / 480; // 60 Hz / 8 substeps

function makeStubSpark(opts: { vx: number; vy: number; x?: number; y?: number }) {
  return makeFreeSpark({
    id: asSparkId(0),
    type: SparkType.Dot,
    pos: { x: opts.x ?? 0, y: opts.y ?? 0 },
    velocity: { x: opts.vx, y: opts.vy },
    dt: DT,
    createdTick: 0,
  });
}

describe('verletStep', () => {
  it('coasts at near-constant velocity with no acceleration (damping is gentle)', () => {
    const s = makeStubSpark({ vx: 100, vy: 0 });
    const v0 = getVelocity(s, DT);
    for (let i = 0; i < 100; i++) verletStep(s, DT);
    const v1 = getVelocity(s, DT);
    // 100 substeps * 0.998 damping ≈ 0.818
    expect(v1.x).toBeGreaterThan(80);
    expect(v1.x).toBeLessThan(v0.x);
    expect(Math.abs(v1.y)).toBeLessThan(1e-6);
  });

  it('updates prevPos to previous pos exactly', () => {
    const s = makeStubSpark({ vx: 50, vy: 25 });
    const before = { x: s.pos.x, y: s.pos.y };
    verletStep(s, DT);
    expect(s.prevPos.x).toBeCloseTo(before.x, 12);
    expect(s.prevPos.y).toBeCloseTo(before.y, 12);
  });

  it('produces no NaN over 60 sec of integration (28800 substeps × 50 sparks)', () => {
    const sparks = Array.from({ length: 50 }, (_, i) =>
      makeFreeSpark({
        id: asSparkId(i),
        type: SparkType.Dot,
        pos: { x: 100 + i, y: 100 },
        velocity: { x: 50, y: 50 },
        dt: DT,
        createdTick: 0,
      }),
    );
    for (let step = 0; step < 28800; step++) {
      verletStepAll(sparks, DT);
    }
    for (const s of sparks) {
      expect(Number.isFinite(s.pos.x)).toBe(true);
      expect(Number.isFinite(s.pos.y)).toBe(true);
      expect(Number.isFinite(s.prevPos.x)).toBe(true);
      expect(Number.isFinite(s.prevPos.y)).toBe(true);
    }
  });

  it('applies acceleration in the right direction', () => {
    const s = makeStubSpark({ vx: 0, vy: 0 });
    verletStep(s, DT, { x: 1000, y: 0 });
    expect(s.pos.x).toBeGreaterThan(0);
    expect(s.pos.y).toBeCloseTo(0, 12);
  });
});

describe('setVelocity / getVelocity', () => {
  it('roundtrips through setVelocity', () => {
    const s = makeStubSpark({ vx: 0, vy: 0 });
    setVelocity(s, { x: 42, y: -17 }, DT);
    const v = getVelocity(s, DT);
    expect(v.x).toBeCloseTo(42, 6);
    expect(v.y).toBeCloseTo(-17, 6);
  });
});
