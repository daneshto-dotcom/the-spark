/**
 * S193 `s193/visuals-combat` (visuals-4) — the four layouts tested as PURE functions: V07 lightning
 * (`lightningFx.ts`), V08 floaters (`floaterFx.ts`), V13 projectiles and V23 bite/slap
 * (`combatFx.ts`). Geometry, windows and determinism; the REACH through the real renderers is
 * `visualsCombatReach.test.ts`, and the look is the screenshots.
 */
import { describe, expect, it } from 'vitest';
import { recordingSink } from './emitter.ts';
import {
  LIGHTNING_FLICKER_MIN, LIGHTNING_FLICKER_TICKS, LIGHTNING_RESTRIKE_TICKS, VOLT_STYLE, boltGlowFx,
  lightningCloudBolt, lightningFlicker, lightningFork, lightningGlowFx, lightningPath, lightningSparksFx,
  lightningStrikeSeed, tvCrackleFx,
} from './lightningFx.ts';
import {
  FLOATER_BIG_HIT_FIFTHS, FLOATER_HEAL_MOTES, FLOATER_SHAKE_FRAMES,
  FLOATER_SHAKE_PX, floaterSeed, floaterShake, healSparkleFx,
} from './floaterFx.ts';
import {
  PROJECTILE_TRAIL, SLAP_FX_TICKS, chewBiteFx, projectileImpactFx, projectileTrailFx, slapImpactFx,
} from './combatFx.ts';

describe('S193 V07 — lightning (`lightningFx`)', () => {
  it('the path lands EXACTLY where the sim struck, with `segments` interior vertices', () => {
    const p = lightningPath(42, 100, 200, 400, 260, 5, 20);
    expect(p.xs.length).toBe(7);
    expect([p.xs[0], p.ys[0]]).toEqual([100, 200]);
    expect([p.xs[6], p.ys[6]]).toEqual([400, 260]);
    // Every interior vertex is within `amp` of the straight line.
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      const bx = 100 + 300 * f; const by = 200 + 60 * f;
      expect(Math.hypot(p.xs[i]! - bx, p.ys[i]! - by)).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it('⛔ DETERMINISM — same seed → identical path; another seed differs', () => {
    expect(lightningPath(7, 0, 0, 300, 0, 5, 20)).toEqual(lightningPath(7, 0, 0, 300, 0, 5, 20));
    expect(lightningPath(8, 0, 0, 300, 0, 5, 20)).not.toEqual(lightningPath(7, 0, 0, 300, 0, 5, 20));
  });

  it('RE-STRIKE: the seed holds inside a window and changes across it', () => {
    const w = LIGHTNING_RESTRIKE_TICKS;
    expect(lightningStrikeSeed(9, 0)).toBe(lightningStrikeSeed(9, w - 1));
    expect(lightningStrikeSeed(9, w)).not.toBe(lightningStrikeSeed(9, w - 1));
  });

  it('FLICKER: in [min, 1], constant across a step, keyed to the tick', () => {
    const vals = new Set<number>();
    for (let t = 0; t < 200; t++) {
      const f = lightningFlicker(5, t);
      expect(f).toBeGreaterThanOrEqual(LIGHTNING_FLICKER_MIN);
      expect(f).toBeLessThanOrEqual(1);
      vals.add(f);
      if (t % LIGHTNING_FLICKER_TICKS !== 0) expect(f).toBe(lightningFlicker(5, t - 1));
    }
    expect(vals.size, 'it actually flickers').toBeGreaterThan(10);
  });

  it('the GLOW is one additive sprite per segment, oriented along it, longer than it (overlap)', () => {
    const sink = recordingSink();
    const p = lightningPath(3, 0, 0, 240, 0, 5, 0);
    lightningGlowFx(sink, p, 20, 0.5, 0x00ffff);
    expect(sink.out.length).toBe(6);
    for (const e of sink.out) {
      expect(e.blend).toBe('add');
      expect(e.h).toBe(20);
      expect(e.w).toBeGreaterThan(240 / 6);
      expect(e.rot).toBeCloseTo(0, 9);
    }
    const none = recordingSink();
    lightningGlowFx(none, p, 20, 0, 0x00ffff);
    expect(none.out, 'a dark bolt draws nothing').toEqual([]);
  });

  it('a bolt is drawn TWICE: a wide outer glow then a narrow hot sheath', () => {
    const sink = recordingSink();
    boltGlowFx(sink, lightningPath(3, 0, 0, 240, 0, 5, 10), VOLT_STYLE, 1);
    expect(sink.out.length).toBe(12);
    expect(sink.out.slice(0, 6).every((e) => e.h === VOLT_STYLE.glowWidth && e.tint === VOLT_STYLE.glow)).toBe(true);
    expect(sink.out.slice(6).every((e) => e.h === VOLT_STYLE.sheathWidth && e.tint === VOLT_STYLE.sheath)).toBe(true);
  });

  it('the fork leaves from an INTERIOR vertex of the bolt', () => {
    const p = lightningPath(11, 0, 0, 300, 40, 5, 20);
    const f = lightningFork(11, p)!;
    const i = p.xs.findIndex((x, k) => x === f.xs[0] && p.ys[k] === f.ys[0]);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(p.xs.length - 1);
    expect(lightningFork(11, { xs: [0, 1], ys: [0, 1] }), 'no interior → no fork').toBeNull();
  });

  it('the endpoint burst: a flash early, sparks throughout, nothing outside [0, 1)', () => {
    const early = recordingSink();
    lightningSparksFx(early, 50, 50, 1, 0.1, 6, 20, 0x99ffff);
    expect(early.out.filter((e) => e.tex === 'core').length).toBe(1);
    expect(early.out.length).toBe(2 + 6);
    const late = recordingSink();
    lightningSparksFx(late, 50, 50, 1, 0.8, 6, 20, 0x99ffff);
    expect(late.out.length, 'the flash is gone late, the sparks remain').toBe(6);
    for (const t of [-0.01, 1]) {
      const s = recordingSink();
      lightningSparksFx(s, 50, 50, 1, t, 6, 20, 0x99ffff);
      expect(s.out).toEqual([]);
    }
  });

  it('a cloud bolt starts at the burst and reaches `reach`; it re-strikes with age', () => {
    const b = lightningCloudBolt(4, 2, 7, 100, 100, 30, 0);
    expect([b.xs[0], b.ys[0]]).toEqual([100, 100]);
    expect(Math.hypot(b.xs[3]! - 100, b.ys[3]! - 100)).toBeCloseTo(30, 6);
    expect(lightningCloudBolt(4, 2, 7, 100, 100, 30, LIGHTNING_RESTRIKE_TICKS)).not.toEqual(b);
    expect(lightningCloudBolt(4, 2, 7, 100, 100, 30, 1)).toEqual(b);
  });

  it('the TV crackle is only additive, deterministic, and silent at zero intensity', () => {
    const a = recordingSink();
    tvCrackleFx(a, 0, 0, 40, 77, 300, 1);
    const b = recordingSink();
    tvCrackleFx(b, 0, 0, 40, 77, 300, 1);
    expect(a.out).toEqual(b.out);
    expect(a.out.every((e) => e.blend === 'add')).toBe(true);
    let any = 0;
    for (let t = 0; t < 60; t++) { const s = recordingSink(); tvCrackleFx(s, 0, 0, 40, 77, t, 1); any += s.out.length; }
    expect(any, 'it crackles across a second').toBeGreaterThan(0);
    const off = recordingSink();
    tvCrackleFx(off, 0, 0, 40, 77, 300, 0);
    expect(off.out).toEqual([]);
  });
});

describe('S193 V08 — damage and heal numbers (`floaterFx`)', () => {
  it('a BIG hit judders within ±2 px and settles; a small hit and a heal never move', () => {
    const o = { dx: 0, dy: 0 };
    const seed = floaterSeed(300, 200, 120);
    let moved = 0;
    for (let a = 0; a < FLOATER_SHAKE_FRAMES; a++) {
      floaterShake(o, a, FLOATER_BIG_HIT_FIFTHS, false, seed);
      expect(Math.abs(o.dx)).toBeLessThanOrEqual(FLOATER_SHAKE_PX);
      expect(Math.abs(o.dy)).toBeLessThanOrEqual(FLOATER_SHAKE_PX);
      if (o.dx !== 0 || o.dy !== 0) moved++;
    }
    expect(moved).toBeGreaterThan(FLOATER_SHAKE_FRAMES / 2);
    expect(floaterShake(o, FLOATER_SHAKE_FRAMES, 999, false, seed)).toEqual({ dx: 0, dy: 0 });
    expect(floaterShake(o, 2, FLOATER_BIG_HIT_FIFTHS - 1, false, seed)).toEqual({ dx: 0, dy: 0 });
    expect(floaterShake(o, 2, 999, true, seed), 'a heal never shakes').toEqual({ dx: 0, dy: 0 });
  });

  it('a heal sparkles with three motes (glow + core each), additive, deterministic', () => {
    const run = (age: number) => { const s = recordingSink(); healSparkleFx(s, 100, 100, age, 45, 1, 9); return s.out; };
    expect(run(30).length).toBe(FLOATER_HEAL_MOTES * 2);
    expect(run(30)).toEqual(run(30));
    expect(run(30).every((e) => e.blend === 'add')).toBe(true);
    expect(run(0), 'nothing on the birth frame').toEqual([]);
    const dark = recordingSink();
    healSparkleFx(dark, 100, 100, 30, 45, 0, 9);
    expect(dark.out, 'faded with the number').toEqual([]);
  });
});

describe('S193 V13 — arrows and harpoons (`combatFx`)', () => {
  it('the trail is FOUR streaks, all BEHIND the tip, along the flight', () => {
    const s = recordingSink();
    projectileTrailFx(s, 0, 0, 300, 0, 0.6, false, false);
    expect(s.out.length).toBe(PROJECTILE_TRAIL);
    for (const e of s.out) { expect(e.x).toBeLessThan(180); expect(e.rot).toBeCloseTo(0, 9); expect(e.blend).toBe('add'); }
    const fire = recordingSink();
    projectileTrailFx(fire, 0, 0, 300, 0, 0.6, true, false);
    expect(fire.out.length, 'a flaming shot adds a head glow').toBe(PROJECTILE_TRAIL + 1);
    const none = recordingSink();
    projectileTrailFx(none, 0, 0, 300, 0, 0, false, false);
    expect(none.out, 'nothing at release').toEqual([]);
  });

  it('the impact: dust and grit on the SHADE sink (normal), light on top; embers for fire', () => {
    const top = recordingSink(); const shade = recordingSink();
    projectileImpactFx(top, shade, 50, 60, 0.2, false, 3);
    expect(shade.out.length).toBe(6);
    expect(shade.out.every((e) => e.blend === 'normal')).toBe(true);
    expect(top.out.every((e) => e.blend === 'add')).toBe(true);
    const ft = recordingSink(); const fs = recordingSink();
    projectileImpactFx(ft, fs, 50, 60, 0.2, true, 3);
    expect(fs.out).toEqual([]);
    expect(ft.out.length).toBe(2 + 7);
    const after = recordingSink();
    projectileImpactFx(after, after, 50, 60, 1, true, 3);
    expect(after.out).toEqual([]);
  });
});

describe('S193 V23 — chew bite and Helga slap (`combatFx`)', () => {
  it('the bite throws chips that FALL (later frames sit lower)', () => {
    const at = (t: number) => { const top = recordingSink(); const shade = recordingSink(); chewBiteFx(top, shade, 0, 0, t, 5); return shade.out; };
    const early = at(0.3).filter((e) => e.tex === 'soft');
    const late = at(0.9).filter((e) => e.tex === 'soft');
    expect(early.length).toBe(7);
    const meanY = (a: typeof early) => a.reduce((p, e) => p + e.y, 0) / a.length;
    expect(meanY(late)).toBeGreaterThan(meanY(early));
    expect(at(0.3).every((e) => e.blend === 'normal')).toBe(true);
  });

  it('the slap lights for SLAP_FX_TICKS of her FIRE window and is deterministic', () => {
    const at = (k: number, seed = 1) => { const s = recordingSink(); slapImpactFx(s, 10, 10, k, seed); return s.out; };
    expect(at(0).length).toBe(3 + 8);
    expect(at(SLAP_FX_TICKS)).toEqual([]);
    expect(at(3)).toEqual(at(3));
    expect(at(3, 2)).not.toEqual(at(3, 1));
    expect(at(3).every((e) => e.blend === 'add')).toBe(true);
  });
});
