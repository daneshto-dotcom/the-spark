/**
 * S193 `s193/visuals-racial` (visuals-3) — the PURE layouts in `perkFx.ts`: arithmetic, geometry,
 * determinism and the negatives. The REACH half (each layout driven by its real renderer off synced
 * state) is `src/render/perkFxReach.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordingSink } from './emitter.ts';
import {
  BURN_FLICKER_LIFE, BURN_FLICKER_PERIOD, CORPSE_FEED_LIFE, CORPSE_FEED_PERIOD, CORPSE_FEED_RAMP,
  DEEP_CURRENT_FX_DROPLETS, HELLSPAWN_FX_FRAMES, HELLSPAWN_FX_SPARKS, LIFESTEAL_FX_COLOR, LIFESTEAL_FX_FLIGHT,
  LIFESTEAL_FX_FRAMES, RAGE_FX_COLOR, RAGE_SPARK_LIFE, RAGE_SPARK_PERIOD, SCORCH_EMBER_LIFE, SCORCH_EMBER_PERIOD,
  SCORCH_POOL_LIFE, SCORCH_POOL_PERIOD, burnFlickerFx, corpseFeedFx, corpseFeedIntensity, eliteGlowFx,
  hellspawnBurstFx, lifestealFx, lifestealMoteCount, rageFx, scorchZoneFx, vortexFx,
} from './perkFx.ts';

const QUARRY = { cx: 960, cy: 540, r: 120 };

describe('V11 lifesteal motes', () => {
  it('arithmetic: 3 motes at the floor-at-one heal, +1 per 4 fifths, capped at 6; none for no heal', () => {
    expect(lifestealMoteCount(0)).toBe(0);
    expect(lifestealMoteCount(-3)).toBe(0);
    expect(lifestealMoteCount(1)).toBe(3); // the race unit's 6 × 20 % → 1
    expect(lifestealMoteCount(2)).toBe(3); // a goblin's 12 × 20 % → 2
    expect(lifestealMoteCount(4)).toBe(4); // BLOOD DEBT's own example: 20 → 4
    expect(lifestealMoteCount(10)).toBe(5); // CRIMSON TIDE on the same 20 → 10
    expect(lifestealMoteCount(66)).toBe(6); // the swarm's 132 × 50 % — capped
  });

  it('the first mote leaves the VICTIM and the motes end on the ATTACKER', () => {
    const early = recordingSink();
    lifestealFx(early, 100, 100, 300, 100, 1, 4, 77);
    const firstMote = early.out[0]!;
    expect(Math.abs(firstMote.x - 100)).toBeLessThan(20);
    const late = recordingSink();
    lifestealFx(late, 100, 100, 300, 100, LIFESTEAL_FX_FLIGHT + 2, 4, 77);
    const flash = late.out[late.out.length - 1]!;
    expect([flash.x, flash.y]).toEqual([300, 100]);
    expect(flash.tint).toBe(LIFESTEAL_FX_COLOR);
  });

  it('⛔ negative: nothing before birth, nothing after the burst, nothing for a zero heal', () => {
    for (const age of [-1, LIFESTEAL_FX_FRAMES, LIFESTEAL_FX_FRAMES + 5]) {
      const s = recordingSink();
      lifestealFx(s, 0, 0, 100, 0, age, 4, 1);
      expect(s.out).toEqual([]);
    }
    const z = recordingSink();
    lifestealFx(z, 0, 0, 100, 0, 5, 0, 1);
    expect(z.out).toEqual([]);
  });

  it('⛔ determinism: same seed → identical arcs; another heal (seed) → different arcs', () => {
    const run = (seed: number) => { const s = recordingSink(); lifestealFx(s, 10, 10, 200, 80, 8, 6, seed); return s.out; };
    expect(run(5)).toEqual(run(5));
    expect(run(6)).not.toEqual(run(5));
  });
});

describe('V12 scorched ground', () => {
  const zone = { x: 0, y: 0, w: 960, h: 540 };
  const scorch = (tick: number, seed = 3) => {
    const top = recordingSink(); const ground = recordingSink();
    scorchZoneFx(top, ground, zone.x, zone.y, zone.w, zone.h, tick, seed, QUARRY);
    return { top: top.out, ground: ground.out };
  };

  it('arithmetic: at most LIFE / PERIOD embers (30) and pools (6) live in one zone', () => {
    expect(SCORCH_EMBER_LIFE / SCORCH_EMBER_PERIOD).toBe(30);
    expect(SCORCH_POOL_LIFE / SCORCH_POOL_PERIOD).toBe(6);
    for (const tick of [600, 601, 777, 1234]) {
      const { top, ground } = scorch(tick);
      expect(top.length).toBeLessThanOrEqual(30);
      expect(top.length).toBeGreaterThan(22); // the quarry (a corner of this quadrant) takes a few
      expect(ground.length).toBeLessThanOrEqual(6);
    }
  });

  it('⛔ negative: the quarry NEVER burns — no ember or pool inside its disc', () => {
    for (let tick = 500; tick < 740; tick += 7) {
      const { top, ground } = scorch(tick);
      for (const e of [...top, ...ground]) {
        expect(Math.hypot(e.x - QUARRY.cx, e.y - QUARRY.cy)).toBeGreaterThan(QUARRY.r);
      }
    }
  });

  it('every ember is light (additive) and the field is deterministic per zone seed', () => {
    const a = scorch(900);
    expect(a.top.every((e) => e.blend === 'add')).toBe(true);
    expect(scorch(900)).toEqual(a);
    expect(scorch(900, 4)).not.toEqual(a);
  });

  it('a burning creature carries LIFE / PERIOD (3) small flames at its feet, plus one fire glow', () => {
    expect(BURN_FLICKER_LIFE / BURN_FLICKER_PERIOD).toBe(2);
    const s = recordingSink();
    burnFlickerFx(s, 400, 300, 1000, 17, 1);
    expect(s.out).toHaveLength(3);
    for (const e of s.out) { expect(e.y).toBeLessThanOrEqual(300); expect(Math.abs(e.x - 400)).toBeLessThan(10); }
  });
});

describe('V14 rage', () => {
  it('one red ember pool on the ground and LIFE / PERIOD (6) heat sparks rising', () => {
    expect(RAGE_SPARK_LIFE / RAGE_SPARK_PERIOD).toBe(3);
    const g = recordingSink(); const t = recordingSink();
    rageFx(g, t, 500, 500, 1200, 9, 1);
    expect(g.out).toHaveLength(1);
    expect(g.out[0]!.tint).toBe(RAGE_FX_COLOR);
    expect(t.out).toHaveLength(3);
    for (const e of t.out) expect(e.y).toBeLessThan(510);
  });

  it('it scales with the unit (a boss pool is wider)', () => {
    const a = recordingSink(); const b = recordingSink();
    rageFx(a, recordingSink(), 0, 0, 1, 1, 1);
    rageFx(b, recordingSink(), 0, 0, 1, 1, 1.6);
    expect(b.out[0]!.w).toBeCloseTo(a.out[0]!.w * 1.6, 9);
  });
});

describe('V18 corpse eater feed', () => {
  it('arithmetic: the stream swells over 30 ticks, runs at 1, dies over the last 30', () => {
    expect(corpseFeedIntensity(-1, 480)).toBe(0);
    expect(corpseFeedIntensity(0, 480)).toBe(0);
    expect(corpseFeedIntensity(15, 480)).toBeCloseTo(0.5, 9);
    expect(corpseFeedIntensity(CORPSE_FEED_RAMP, 480)).toBe(1);
    expect(corpseFeedIntensity(240, 480)).toBe(1);
    expect(corpseFeedIntensity(465, 480)).toBeCloseTo(0.5, 9);
    expect(corpseFeedIntensity(480, 480)).toBe(0);
  });

  it('LIFE / PERIOD (20) motes + a glow at the maw; the motes close in on him', () => {
    expect(CORPSE_FEED_LIFE / CORPSE_FEED_PERIOD).toBe(20);
    const s = recordingSink();
    corpseFeedFx(s, 600, 600, 560, 74, 2000, 3, 1);
    expect(s.out).toHaveLength(21);
    const glow = s.out[20]!;
    expect([glow.x, glow.y]).toEqual([600, 560]);
    for (const e of s.out) expect(Math.hypot(e.x - 600, e.y - 600)).toBeLessThan(74 * 1.3 + 50);
  });

  it('⛔ negative: zero intensity (no feed) draws nothing', () => {
    const s = recordingSink();
    corpseFeedFx(s, 600, 600, 560, 74, 2000, 3, 0);
    expect(s.out).toEqual([]);
  });
});

describe('V19 deep current vortex', () => {
  it('16 droplets, a ground splash ring and an eye glow; nothing once it has closed', () => {
    const top = recordingSink(); const ground = recordingSink();
    vortexFx(top, ground, 300, 300, 0.3, 11, 0x3fd7ff);
    expect(top.out).toHaveLength(DEEP_CURRENT_FX_DROPLETS + 1);
    expect(ground.out).toHaveLength(1);
    expect(ground.out[0]!.tex).toBe('ring');
    const done = recordingSink();
    vortexFx(done, done, 300, 300, 1, 11, 0x3fd7ff);
    expect(done.out).toEqual([]);
  });

  it('⛔ the vortex source holds no Pixi path at all (canon §7c has nothing to apply to)', () => {
    const src = readFileSync(join(__dirname, 'perkFx.ts'), 'utf8');
    expect(src).not.toMatch(/\.arc\(|\.lineTo\(|\.moveTo\(/);
  });
});

describe('V21 elite glow · V22 hellspawn burst', () => {
  it('an elite carries exactly ONE under-glow sprite, in the colour it is given', () => {
    const s = recordingSink();
    eliteGlowFx(s, 100, 100, 0xff3b6b, 2, 50, 4);
    expect(s.out).toHaveLength(1);
    expect(s.out[0]!.tint).toBe(0xff3b6b);
    expect(s.out[0]!.blend).toBe('add');
  });

  it('a split child: a flash, a ring and 6 sparks, for 18 frames; deterministic', () => {
    const run = (age: number, seed = 8) => { const s = recordingSink(); hellspawnBurstFx(s, 50, 50, age, seed); return s.out; };
    expect(run(3)).toHaveLength(HELLSPAWN_FX_SPARKS + 2);
    expect(run(HELLSPAWN_FX_FRAMES)).toEqual([]);
    expect(run(-1)).toEqual([]);
    expect(run(5)).toEqual(run(5));
    expect(run(5, 9)).not.toEqual(run(5));
  });
});

describe('⛔ S192 audit V-2, for this file — every perk emit is LIGHT', () => {
  it('no `normal` blend anywhere in perkFx.ts (it writes only the light layers)', () => {
    const src = readFileSync(join(__dirname, 'perkFx.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const emits = [...src.matchAll(/\.emit\(([^;]*)\);/g)].map((m) => m[1]!);
    expect(emits.length, 'anti-vacuity').toBeGreaterThanOrEqual(15);
    for (const e of emits) expect(e).toMatch(/'add'\s*\)?\s*$/);
  });
});
