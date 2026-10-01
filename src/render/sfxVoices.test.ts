/**
 * SPARK — S192 T15 (H2): the pure SFX voice ledger (`sfxVoices.ts`).
 */
import { describe, expect, it } from 'vitest';

import { SFX_KIND_MAX_VOICES, SFX_MAX_VOICES, SFX_UNCAPPED_KINDS, SfxVoiceLedger, type SfxKind } from './sfxVoices.ts';

describe('sfxVoices — the ⚠ MINE caps', () => {
  it('are the numbers the report quotes', () => {
    expect(SFX_MAX_VOICES).toBe(32);
    expect(SFX_KIND_MAX_VOICES).toEqual({
      clave: 4, fart: 4, charge: 4, boom: 4, gnaw: 3, splat: 4, zap: 4, laser: 4, oneShot: 6, crackle: 4,
      ui: Number.POSITIVE_INFINITY, latchedVoice: Number.POSITIVE_INFINITY,
    });
    expect([...SFX_UNCAPPED_KINDS].sort()).toEqual(['latchedVoice', 'ui']);
  });

  it('gnaw matches the chewer renderer’s pre-existing MAX_GNAW_VOICES = 3', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./chewerRenderer.ts', import.meta.url), 'utf8');
    const m = /MAX_GNAW_VOICES\s*=\s*(\d+)/.exec(src);
    expect(Number(m?.[1])).toBe(SFX_KIND_MAX_VOICES.gnaw);
  });
});

describe('sfxVoices — SfxVoiceLedger', () => {
  it('admits up to the per-kind cap at one instant, then refuses and counts', () => {
    const l = new SfxVoiceLedger(32, { ...SFX_KIND_MAX_VOICES, clave: 2 });
    expect(l.admit('clave', 0, 0.03)).toBe(true);
    expect(l.admit('clave', 0, 0.03)).toBe(true);
    expect(l.admit('clave', 0, 0.03)).toBe(false);
    expect(l.admit('boom', 0, 0.45)).toBe(true); // another kind is unaffected
    expect(l.stats()).toMatchObject({ live: 3, admitted: 3, droppedGlobal: 0, droppedByKind: { clave: 1 } });
  });

  it('the GLOBAL cap binds across kinds', () => {
    const l = new SfxVoiceLedger(3);
    const kinds: SfxKind[] = ['clave', 'boom', 'zap', 'laser'];
    const got = kinds.map((k) => l.admit(k, 0, 1));
    expect(got).toEqual([true, true, true, false]);
    expect(l.stats().droppedGlobal).toBe(1);
  });

  it('S192 audit A1/A2 — uncapped kinds are admitted with the global pool FULL, and take no slot', () => {
    const l = new SfxVoiceLedger(2);
    expect(l.admit('boom', 0, 1)).toBe(true);
    expect(l.admit('zap', 0, 1)).toBe(true);
    expect(l.admit('laser', 0, 1)).toBe(false); // full
    for (let i = 0; i < 10; i++) {
      expect(l.admit('ui', 0, 0.08)).toBe(true);
      expect(l.admit('latchedVoice', 0, 2.7)).toBe(true);
    }
    expect(l.liveAt(0)).toBe(2); // they were never booked
  });

  it('a voice frees its slot when it ends (end ≤ now), not before', () => {
    const l = new SfxVoiceLedger(1);
    expect(l.admit('boom', 10, 0.45)).toBe(true);
    expect(l.admit('boom', 10.44, 0.45)).toBe(false);
    expect(l.admit('boom', 10.45, 0.45)).toBe(true);
    expect(l.liveAt(10.5)).toBe(1);
    expect(l.liveAt(11)).toBe(0);
  });

  it('peakLive remembers the worst burst; reset clears everything', () => {
    const l = new SfxVoiceLedger();
    for (let i = 0; i < 5; i++) l.admit('oneShot', 0, 1);
    l.liveAt(5);
    expect(l.stats().live).toBe(0);
    expect(l.stats().peakLive).toBe(5);
    l.reset();
    expect(l.stats()).toEqual({ live: 0, peakLive: 0, admitted: 0, droppedGlobal: 0, droppedByKind: {} });
  });

  it('a non-finite or negative duration books zero length (frees at the same instant’s next tick)', () => {
    const l = new SfxVoiceLedger(1);
    expect(l.admit('oneShot', 0, Number.NaN)).toBe(true);
    expect(l.admit('oneShot', 0.001, 1)).toBe(true);
    expect(l.admit('oneShot', 0.002, -5)).toBe(false); // the 1 s voice holds the only slot
  });

  it('is a pure function of its inputs: the same calls give the same verdicts', () => {
    const run = (): boolean[] => {
      const l = new SfxVoiceLedger();
      const out: boolean[] = [];
      for (let i = 0; i < 100; i++) out.push(l.admit((['clave', 'boom', 'gnaw'] as const)[i % 3]!, i * 0.01, 0.2));
      return out;
    };
    expect(run()).toEqual(run());
  });
});
