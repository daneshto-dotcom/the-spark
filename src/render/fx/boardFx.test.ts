/**
 * S193 `s193/visuals-board` — V16 stink, V20 build juice, V23 raided, V25 spark glow.
 *
 * Three kinds of test, per the S193 rules: the ARITHMETIC of each pure layout, a REACH test through
 * the real drawer with the fx hooks installed (a source line that exists but is never reached is the
 * S182 tripwire hole), and the NEGATIVE — with `?fx=legacy` the drawer emits nothing and draws its
 * old Graphics exactly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { recordingSink, type FxEmitRecord } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import {
  COMMIT_FX_SPARKS, RAIDED_FX_DEBRIS, TIER_FX_SPARKS,
  bondCommitFx, raidedFx, scoreTierFx, severEraseFx,
} from './buildFx.ts';
import { STINK_FX_PUFFS, stinkCloudFx, stinkLobFx, stinkLobPoint, stinkPuffAt } from './stinkFx.ts';
import { SPARK_GLOW_PERIOD_TICKS, sparkGlowFx, sparkGlowPulse } from './sparkFx.ts';
import { drawBondCommit } from '../effects/bondCommit.ts';
import { drawSeverErase } from '../effects/severErase.ts';
import { drawScoreTier } from '../effects/scoreTier.ts';
import { drawRaided } from '../effects/raided.ts';
import type { GameEffect } from '../../game/effects.ts';

/** A chainable Graphics stand-in that counts every call. */
function fakeGraphics(): { g: Graphics; calls: string[] } {
  const calls: string[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (..._a: unknown[]) => { calls.push(String(k)); return g; },
  });
  return { g: g as Graphics, calls };
}

function install(): { top: FxEmitRecord[]; shade: FxEmitRecord[]; ground: FxEmitRecord[] } {
  const top = recordingSink();
  const shade = recordingSink();
  const ground = recordingSink();
  setFxHooks({ top, shade, ground, shock: { shock() { /* none */ } } });
  setFxLegacyFlag(false);
  return { top: top.out, shade: shade.out, ground: ground.out };
}

afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

const commit: Extract<GameEffect, { kind: 'BOND_COMMIT' }> = {
  kind: 'BOND_COMMIT', tick: 500, pos: { x: 400, y: 300 }, color: 0xff3344, radius: 12, visualEffectId: 'fx.bond.default',
} as Extract<GameEffect, { kind: 'BOND_COMMIT' }>;
const raided: Extract<GameEffect, { kind: 'RAIDED' }> = {
  kind: 'RAIDED', tick: 900, pos: { x: 700, y: 520 }, color: 0x33aaff, killed: true,
};

describe('V20 build juice — arithmetic', () => {
  it('a commit throws exactly 8 sparks, all in the owner colour family, and the ring reaches 3.5 × radius', () => {
    const s = recordingSink();
    bondCommitFx(s, 7, 0, 0, 12, 0xff0000, 0.999);
    const ring = s.out.find((e) => e.tex === 'ring')!;
    expect(ring.w).toBeCloseTo(12 * 2 * 3.5, 0);
    const sparks = s.out.filter((e) => e.tex === 'soft' && e.h === 2.6);
    expect(sparks).toHaveLength(COMMIT_FX_SPARKS);
    expect(s.out.every((e) => e.blend === 'add')).toBe(true);
  });

  it('nothing is drawn outside the life, and the life ends dark', () => {
    for (const t of [-0.1, 1, 1.5]) {
      const s = recordingSink();
      bondCommitFx(s, 1, 0, 0, 12, 0xffffff, t);
      severEraseFx(s, 1, 0, 0, 12, 0xffffff, t);
      expect(s.out, `t=${t}`).toHaveLength(0);
    }
    const late = recordingSink();
    severEraseFx(late, 1, 0, 0, 12, 0xffffff, 0.99);
    for (const e of late.out) expect(e.alpha).toBeLessThan(0.05);
  });

  it('a score tier fans 12 sparks and its bloom spans the S13 60 → 100 px', () => {
    const s = recordingSink();
    scoreTierFx(s, 3, 0, 0, 0x00ff00, 0.5);
    expect(s.out.filter((e) => e.tex === 'soft' && e.h === 3)).toHaveLength(TIER_FX_SPARKS);
    expect(s.out.find((e) => e.tex === 'soft' && e.h !== 3)!.w).toBeCloseTo(160, 5);
  });

  it('⛔ DETERMINISM — same seed and t → identical; a different seed differs', () => {
    const a = recordingSink(); const b = recordingSink(); const c = recordingSink();
    bondCommitFx(a, 11, 5, 5, 12, 0xabcdef, 0.4);
    bondCommitFx(b, 11, 5, 5, 12, 0xabcdef, 0.4);
    bondCommitFx(c, 12, 5, 5, 12, 0xabcdef, 0.4);
    expect(a.out).toEqual(b.out);
    expect(c.out).not.toEqual(a.out);
  });
});

describe('V23 raided — arithmetic', () => {
  it('the cloud is SMOKE on the shade layer (normal blend) in the RAIDER colour, never on the bloomed layer', () => {
    const top = recordingSink(); const shade = recordingSink();
    raidedFx(top, shade, 5, 0, 0, 0x33aaff, true, 0.3);
    expect(shade.out.length).toBe(5);
    for (const e of shade.out) { expect(e.blend).toBe('normal'); expect(e.tint).toBe(0x33aaff); }
    for (const e of top.out) expect(e.blend).toBe('add');
  });

  it('holds near-full strength for the first 55 % (an attribution message must be found late)', () => {
    const at = (t: number) => { const top = recordingSink(); const shade = recordingSink(); raidedFx(top, shade, 5, 0, 0, 1, true, t); return shade.out[0]!.alpha; };
    expect(at(0.5)).toBeCloseTo(at(0.1), 6);
    expect(at(0.9)).toBeLessThan(at(0.5) * 0.3);
  });

  it('a kill throws 8 debris; a survived hit throws 4 and a smaller cloud', () => {
    const run = (killed: boolean) => { const top = recordingSink(); const shade = recordingSink(); raidedFx(top, shade, 5, 0, 0, 1, killed, 0.2); return { top: top.out, shade: shade.out }; };
    const kill = run(true); const hit = run(false);
    expect(kill.top.filter((e) => e.w === 5)).toHaveLength(RAIDED_FX_DEBRIS);
    expect(hit.top.filter((e) => e.w === 5)).toHaveLength(RAIDED_FX_DEBRIS / 2);
    expect(hit.shade[0]!.w).toBeLessThan(kill.shade[0]!.w);
  });
});

describe('V16 stink — arithmetic', () => {
  it('⛔ every puff stays INSIDE the true damage radius at every tick (the haze edge is the readout)', () => {
    for (const radius of [60, 90, 140]) {
      for (let k = 0; k < STINK_FX_PUFFS; k++) {
        for (let age = 0; age < 2000; age += 37) {
          const p = stinkPuffAt(99, k, age, radius);
          expect(Math.hypot(p.dx, p.dy / 0.8) + 0.42 * p.size).toBeLessThanOrEqual(radius + 1e-9);
        }
      }
    }
  });

  it('the cloud is smoke (normal blend), it turns, and the fade scales it', () => {
    const run = (tick: number, fade = 1) => { const s = recordingSink(); stinkCloudFx(s, 4, 100, tick, 300, 300, 90, fade); return s.out; };
    const a = run(400);
    expect(a.length).toBeGreaterThanOrEqual(STINK_FX_PUFFS);
    expect(a.every((e) => e.tex === 'smoke' && e.blend === 'normal')).toBe(true);
    expect(run(460)).not.toEqual(a);
    expect(run(400)).toEqual(a);
    expect(run(400, 0.5)[0]!.alpha).toBeCloseTo(a[0]!.alpha * 0.5, 9);
    expect(run(400, 0)).toHaveLength(0);
  });

  it('the lob contrail lies ON the S141 arc and dissolves from the tower end first', () => {
    const p0 = stinkLobPoint(0, 0, 200, 0, 0); const p1 = stinkLobPoint(0, 0, 200, 0, 1);
    expect(p0).toEqual({ x: 0, y: 0 }); expect(p1).toEqual({ x: 200, y: 0 });
    expect(stinkLobPoint(0, 0, 200, 0, 0.5).y).toBeLessThan(-40); // a HIGH throw
    const at = (t: number) => { const top = recordingSink(); const shade = recordingSink(); stinkLobFx(top, shade, 3, 0, 0, 200, 0, t); return shade.out.filter((e) => e.w <= 20 + 14 * t + 1e-9 && e.alpha > 0); };
    const late = at(0.6);
    // At 60 % of the hold the tower half has gone and only the landing half remains.
    expect(late.length).toBeGreaterThan(0);
    for (const e of late) expect(e.x).toBeGreaterThan(70);
  });
});

describe('V25 spark glow — arithmetic', () => {
  it('breathes once a period, in [0, 1], phase-spread by id', () => {
    for (let t = 0; t < SPARK_GLOW_PERIOD_TICKS; t++) {
      const p = sparkGlowPulse(7, t);
      expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
      expect(sparkGlowPulse(7, t + SPARK_GLOW_PERIOD_TICKS)).toBeCloseTo(p, 9);
    }
    expect(sparkGlowPulse(1, 40)).not.toBeCloseTo(sparkGlowPulse(2, 40), 3);
  });

  it('one additive sprite a spark; a carried spark glows brighter', () => {
    const free = recordingSink(); const carried = recordingSink();
    sparkGlowFx(free, 3, 100, 0, 0, 0xffffff, false);
    sparkGlowFx(carried, 3, 100, 0, 0, 0xff0000, true);
    expect(free.out).toHaveLength(1);
    expect(free.out[0]!.blend).toBe('add');
    expect(carried.out[0]!.alpha).toBeGreaterThan(free.out[0]!.alpha);
  });
});

describe('REACH — the real drawers feed the fx layers when they are live', () => {
  it('drawBondCommit: soft light on TOP, and the flat flash + default ring are gone', () => {
    const fx = install();
    const { g, calls } = fakeGraphics();
    drawBondCommit(g, commit, 0.1);
    expect(fx.top.length).toBeGreaterThan(COMMIT_FX_SPARKS);
    expect(calls).not.toContain('circle');
  });

  it('drawSeverErase / drawScoreTier: fx only, no Graphics', () => {
    const fx = install();
    const { g, calls } = fakeGraphics();
    drawSeverErase(g, { kind: 'SEVER_ERASE', tick: 1, pos: { x: 1, y: 2 }, color: 0xffffff, radius: 12 }, 0.3);
    drawScoreTier(g, { kind: 'SCORE_TIER', tick: 1, tier: 2, color: 0xffffff, pos: { x: 1, y: 2 } }, 10);
    expect(fx.top.length).toBeGreaterThan(SEVER_FX_MIN);
    expect(calls).toHaveLength(0);
  });

  it('drawRaided: smoke on SHADE, and the pointing ring + ticks STILL draw', () => {
    const fx = install();
    const { g, calls } = fakeGraphics();
    drawRaided(g, raided, 0.2);
    expect(fx.shade).toHaveLength(5);
    expect(calls.filter((c) => c === 'circle')).toHaveLength(1); // the crisp ring, not the 5 puffs
    expect(calls.filter((c) => c === 'moveTo')).toHaveLength(2); // the two ticks
  });
});

const SEVER_FX_MIN = 2;

describe('NEGATIVE — `?fx=legacy` (and no install) draws the old Graphics and emits nothing', () => {
  it('legacy commit / raided / tier / sever', () => {
    const fx = install();
    setFxLegacyFlag(true);
    const { g, calls } = fakeGraphics();
    drawBondCommit(g, commit, 0.1);
    drawRaided(g, raided, 0.2);
    drawScoreTier(g, { kind: 'SCORE_TIER', tick: 1, tier: 2, color: 0xffffff, pos: { x: 1, y: 2 } }, 10);
    drawSeverErase(g, { kind: 'SEVER_ERASE', tick: 1, pos: { x: 1, y: 2 }, color: 0xffffff, radius: 12 }, 0.3);
    expect(fx.top).toHaveLength(0);
    expect(fx.shade).toHaveLength(0);
    // commit: flash + default ring (2) · raided: 5 puffs + ring (6) · tier: 2 · sever: 2
    expect(calls.filter((c) => c === 'circle')).toHaveLength(12);
  });

  it('nothing installed (the unit-suite default) is the legacy path too', () => {
    const { g, calls } = fakeGraphics();
    drawRaided(g, raided, 0.2);
    expect(calls.filter((c) => c === 'circle')).toHaveLength(6);
  });
});
