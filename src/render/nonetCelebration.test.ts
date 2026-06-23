import { describe, it, expect } from 'vitest';
import {
  hslToHex,
  makeFireworks,
  fireworkParticles,
  bannerPose,
  jackpotGlowAlpha,
  CELEBRATION_DURATION_TICKS,
  FW_RISE_TICKS,
  FW_BURST_TICKS,
  FW_PARTICLES,
  JACKPOT_GLOW_PEAK_ALPHA,
} from './nonetCelebration.ts';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('nonetCelebration — hslToHex', () => {
  it('maps the RGB primaries', () => {
    expect(hslToHex(0, 1, 0.5)).toBe(0xff0000);
    expect(hslToHex(120, 1, 0.5)).toBe(0x00ff00);
    expect(hslToHex(240, 1, 0.5)).toBe(0x0000ff);
  });
  it('wraps/normalises hue without throwing', () => {
    expect(hslToHex(360, 1, 0.5)).toBe(0xff0000);
    expect(() => hslToHex(-30, 1, 0.5)).not.toThrow();
  });
});

describe('nonetCelebration — fireworks', () => {
  it('makeFireworks: count, staggered launches, in-bounds (seeded → reproducible)', () => {
    const fws = makeFireworks(8, 1920, 1080, seeded(42));
    expect(fws).toHaveLength(8);
    for (const fw of fws) {
      expect(fw.x).toBeGreaterThan(0);
      expect(fw.x).toBeLessThan(1920);
      expect(fw.burstY).toBeGreaterThan(0);
      expect(fw.burstY).toBeLessThan(1080);
      expect(fw.startTick).toBeGreaterThanOrEqual(0);
      expect(fw.hue).toBeGreaterThanOrEqual(0);
      expect(fw.hue).toBeLessThan(360);
    }
    expect(new Set(fws.map((f) => f.startTick)).size).toBeGreaterThan(1); // not all at once
  });

  it('fireworkParticles: empty before launch + after death; rising = 1 dot; burst = FW_PARTICLES that fade', () => {
    const fw = { x: 500, burstY: 300, startTick: 0, hue: 30 };
    expect(fireworkParticles(fw, -1, 1080)).toHaveLength(0);
    expect(fireworkParticles(fw, FW_RISE_TICKS + FW_BURST_TICKS, 1080)).toHaveLength(0);
    expect(fireworkParticles(fw, 5, 1080)).toHaveLength(1); // rising rocket
    const early = fireworkParticles(fw, FW_RISE_TICKS + 2, 1080);
    const late = fireworkParticles(fw, FW_RISE_TICKS + FW_BURST_TICKS - 2, 1080);
    expect(early).toHaveLength(FW_PARTICLES);
    expect(late).toHaveLength(FW_PARTICLES);
    expect(late[0].alpha).toBeLessThan(early[0].alpha); // particles fade out over the burst
  });

  it('honours the per-firework startTick stagger', () => {
    const fw = { x: 500, burstY: 300, startTick: 50, hue: 30 };
    expect(fireworkParticles(fw, 40, 1080)).toHaveLength(0); // not launched yet
    expect(fireworkParticles(fw, 55, 1080)).toHaveLength(1); // rising
  });
});

describe('nonetCelebration — pose helpers', () => {
  it('bannerPose: hidden before, popped-in mid, tail-faded at the end', () => {
    expect(bannerPose(-1).alpha).toBe(0);
    expect(bannerPose(12).alpha).toBeGreaterThan(0.5);
    expect(bannerPose(12).scale).toBeGreaterThan(0.9);
    expect(bannerPose(CELEBRATION_DURATION_TICKS - 1).alpha).toBeLessThan(0.2);
  });

  it('jackpotGlowAlpha: 0 outside the window, never exceeds the charter cap inside', () => {
    expect(jackpotGlowAlpha(-1)).toBe(0);
    expect(jackpotGlowAlpha(CELEBRATION_DURATION_TICKS)).toBe(0);
    for (let e = 0; e < CELEBRATION_DURATION_TICKS; e += 5) {
      const a = jackpotGlowAlpha(e);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(JACKPOT_GLOW_PEAK_ALPHA + 1e-9);
    }
    expect(jackpotGlowAlpha(30)).toBeGreaterThan(0);
  });
});
