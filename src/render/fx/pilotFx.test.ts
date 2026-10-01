/**
 * S192 `s192/visuals` — the two PILOT layouts (Vlad's siphon, the building aura), tested as pure
 * functions. No renderer runs under vitest; these pin the geometry and the determinism, and the
 * screenshots in `.claude/plans/visuals/` are the visual proof.
 */
import { describe, expect, it } from 'vitest';
import { VLAD_SAP_FLASH_TICKS } from '../../constants.ts';
import { recordingSink, type FxShockSink } from './emitter.ts';
import {
  SAP_FX_CHEST_DY, SAP_FX_LAND_AT, SAP_FX_MOTES, SAP_FX_SPAWN_R, sapFx, sapMoteAt, sapProgress,
} from './sapFx.ts';
import { AURA_EMBER_LIFE, auraEmberAt, auraEmberCount, auraEmberPeriod, auraFx } from './auraFx.ts';

function shocks(): FxShockSink & { out: number[][] } {
  const out: number[][] = [];
  return { out, shock(x, y, age, r, a) { out.push([x, y, age, r, a]); } };
}

function runSap(id: number, tick: number, until: number | undefined) {
  const top = recordingSink();
  const ground = recordingSink();
  const sh = shocks();
  sapFx(top, ground, sh, id, 500, 400, tick, until);
  return { top: top.out, ground: ground.out, shock: sh.out };
}

describe("S192 PILOT 1 — Vlad's siphon (`sapFx`)", () => {
  it('draws only while the synced flash stamp is live — the SAME window as the S170 drawing', () => {
    expect(runSap(1, 100, undefined).top).toEqual([]);
    expect(runSap(1, 100, 100).top, 'expired on its own tick').toEqual([]);
    expect(runSap(1, 100, 99).top).toEqual([]);
    expect(runSap(1, 100, 101).top.length).toBeGreaterThan(0);
    expect(runSap(1, 100, 100 + VLAD_SAP_FLASH_TICKS).top.length).toBeGreaterThan(0);
    expect(sapProgress(100, 100 + VLAD_SAP_FLASH_TICKS + 5), 'a stamp from the future draws nothing').toBeNull();
  });

  it('⛔ DETERMINISM — same boss, same tick, same stamp → byte-identical sprites; another boss differs', () => {
    const until = 1000 + 20;
    const a = runSap(7, 1000, until);
    expect(runSap(7, 1000, until)).toEqual(a);
    expect(runSap(8, 1000, until).top).not.toEqual(a.top);
  });

  it('it ANIMATES: consecutive ticks differ', () => {
    expect(runSap(7, 1001, 1020).top).not.toEqual(runSap(7, 1002, 1020).top);
  });

  it('every mote converges INWARD on the chest, and it spirals (its bearing turns as it closes)', () => {
    let checked = 0;
    for (let k = 0; k < SAP_FX_MOTES; k++) {
      const samples: Array<{ d: number; a: number }> = [];
      for (let t = 0; t < 1; t += 0.02) {
        const m = sapMoteAt(3, k, t);
        if (m !== null) samples.push({ d: Math.hypot(m.dx, m.dy / 0.62), a: Math.atan2(m.dy / 0.62, m.dx) });
      }
      if (samples.length < 3) continue;
      for (let i = 1; i < samples.length; i++) expect(samples[i]!.d).toBeLessThanOrEqual(samples[i - 1]!.d + 1e-9);
      expect(samples[0]!.d).toBeLessThanOrEqual(SAP_FX_SPAWN_R * 1.2);
      const first = samples[0]!.a;
      const last = samples[samples.length - 1]!.a;
      const turned = Math.abs(Math.atan2(Math.sin(last - first), Math.cos(last - first)));
      expect(turned, 'the curl').toBeGreaterThan(0.3);
      checked++;
    }
    expect(checked, 'anti-vacuity: most motes were sampled').toBeGreaterThan(SAP_FX_MOTES * 0.8);
  });

  it('the stream is additive light; the ground stain is a darkening normal-blend sprite under his feet', () => {
    const r = runSap(2, 500, 520);
    expect(r.top.every((e) => e.blend === 'add')).toBe(true);
    expect(r.ground.length).toBe(1);
    expect(r.ground[0]!.blend).toBe('normal');
    expect(r.ground[0]!.y).toBeGreaterThan(400); // at the feet, not the chest
  });

  it('the core sits at the chest', () => {
    const r = runSap(2, 500, 520);
    const cores = r.top.filter((e) => e.tex === 'core' && e.x === 500 && e.y === 400 + SAP_FX_CHEST_DY);
    expect(cores.length).toBe(1);
  });

  it('the landing (ring + sparks + one ground ripple) appears only in the last stretch of the flash', () => {
    const tickAt = (frac: number) => 1000 + Math.ceil(frac * VLAD_SAP_FLASH_TICKS);
    const until = 1000 + VLAD_SAP_FLASH_TICKS;
    const early = runSap(4, tickAt(0.5), until);
    expect(early.top.some((e) => e.tex === 'ring')).toBe(false);
    expect(early.shock).toEqual([]);
    const late = runSap(4, tickAt(SAP_FX_LAND_AT + 0.1), until);
    expect(late.top.filter((e) => e.tex === 'ring').length).toBe(1);
    expect(late.shock.length).toBe(1);
    expect(late.shock[0]![2], 'the ripple age is in ticks since the landing began').toBeGreaterThan(0);
  });

  it('it stays bounded: never more than ~2 sprites per mote plus the core, burst and sparks', () => {
    for (let tick = 1000; tick < 1000 + VLAD_SAP_FLASH_TICKS; tick++) {
      expect(runSap(9, tick, 1000 + VLAD_SAP_FLASH_TICKS).top.length).toBeLessThanOrEqual(SAP_FX_MOTES * (4 / 3) + 2 + 1 + 20);
    }
  });
});

describe('S192 PILOT 2 — the building aura (`auraFx`)', () => {
  function runAura(id: number, tick: number, radius = 60, cover = 1) {
    const top = recordingSink();
    const ground = recordingSink();
    auraFx(ground, top, id, 300, 300, radius, 0x3bd7ff, tick, cover);
    return { top: top.out, ground: ground.out };
  }

  it('the pool is two additive ground ellipses, squashed to the board, centred on the footprint', () => {
    const r = runAura(1, 100);
    expect(r.ground.length).toBe(2);
    for (const e of r.ground) {
      expect(e.blend).toBe('add');
      expect(e.h).toBeLessThan(e.w);
      expect(Math.abs(e.x - 300)).toBeLessThan(1e-9);
    }
  });

  it('⛔ it draws NO rings — the piece the owner objected to (S183) — on either layer', () => {
    for (let tick = 0; tick < 300; tick += 7) {
      const r = runAura(3, tick);
      expect([...r.top, ...r.ground].some((e) => e.tex === 'ring')).toBe(false);
    }
  });

  it('holds a steady ember count that scales with the footprint (12 small … 28 large)', () => {
    expect(auraEmberCount(10)).toBe(12);
    expect(auraEmberCount(500)).toBe(28);
    for (const radius of [28, 60, 90, 140]) {
      const period = auraEmberPeriod(radius);
      for (let tick = 1000; tick < 1010; tick++) {
        const live = runAura(5, tick, radius).top.length;
        expect(live).toBeGreaterThanOrEqual(Math.floor(AURA_EMBER_LIFE / period));
        expect(live).toBeLessThanOrEqual(Math.ceil(AURA_EMBER_LIFE / period));
        expect(live).toBeLessThanOrEqual(28);
      }
    }
  });

  it('one ember RISES through its life and fades in and out', () => {
    // rise ≥ 40 px over a life; the sway is ±6 px, so a whole life must lift it at least 28 px.
    expect(auraEmberAt(6, 2000, 0, 1, 300, 300, 60).y).toBeLessThan(auraEmberAt(6, 2000, 0, 0, 300, 300, 60).y - 25);
    expect(auraEmberAt(6, 2000, 0, 0, 300, 300, 60).alpha).toBe(0);
    expect(auraEmberAt(6, 2000, 0, 0.2, 300, 300, 60).alpha).toBeGreaterThan(0.5);
  });

  it('⛔ S192 audit V-1 — cover alpha 0 (a finished building) → no pool and no embers at all', () => {
    for (let tick = 0; tick < 240; tick += 11) {
      const r = runAura(4, tick, 60, 0);
      expect([...r.top, ...r.ground]).toEqual([]);
    }
  });

  it('⛔ S192 audit V-1 — every pool and ember alpha scales LINEARLY with the cover alpha', () => {
    const full = runAura(4, 700, 60, 1);
    const half = runAura(4, 700, 60, 0.5);
    expect(half.ground.length).toBe(full.ground.length);
    expect(half.top.length).toBe(full.top.length);
    full.ground.forEach((e, i) => expect(half.ground[i]!.alpha).toBeCloseTo(e.alpha * 0.5, 12));
    full.top.forEach((e, i) => expect(half.top[i]!.alpha).toBeCloseTo(e.alpha * 0.5, 12));
  });

  it('⛔ DETERMINISM, and two towers do not breathe in step', () => {
    expect(runAura(7, 444)).toEqual(runAura(7, 444));
    const alphaA = runAura(1, 444).ground[0]!.alpha;
    const alphaB = runAura(2, 444).ground[0]!.alpha;
    expect(alphaA).not.toBe(alphaB);
  });
});
