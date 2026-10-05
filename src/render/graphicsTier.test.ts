/**
 * SPARK — S195 N17 — the graphics tier: the store, the runtime switch, the fx half, the hint, and the keystone
 * telegraph's MINIMAL draw. The connector cache has its own file (`structureRenderer.tiers.test.ts`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
let storageThrows = false;
// A minimal DOM for the hint line (tierAdvisor builds one <div> on document.body).
interface FakeEl { style: Record<string, string>; textContent: string; id: string; setAttribute(): void }
const bodyChildren: FakeEl[] = [];
(globalThis as unknown as { document: unknown }).document = {
  createElement: (): FakeEl => ({ style: {}, textContent: '', id: '', setAttribute: () => undefined }),
  body: { appendChild: (e: FakeEl) => { bodyChildren.push(e); return e; } },
};
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => { if (storageThrows) throw new Error('blocked'); return store.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (storageThrows) throw new Error('blocked'); store.set(k, v); },
  },
};

import { getGraphicsTier, setGraphicsTier, isFxHighQuality, setFxHighQuality, resetGraphicsTierSessionForTests } from './displayPrefs.ts';
import { applyGraphicsTier, graphicsTier, resetGraphicsTierForTests, syncGraphicsTier } from './graphicsTier.ts';
import { fxHighQuality, setFxLegacy, setFxTierLegacy } from './fx/fxRuntime.ts';
import { fxLegacy } from './fx/fxState.ts';
import {
  TierAdvisor, TIER_HINT_SLOW_FRAME_MS, TIER_HINT_WINDOW_MS, tierHintText, noteFrameForTierHint,
} from './tierAdvisor.ts';
import { GRAPHICS_TIER_HINT } from './settingsOverlay.ts';

beforeEach(() => {
  store.clear();
  storageThrows = false;
  resetGraphicsTierSessionForTests();
  resetGraphicsTierForTests();
  setFxLegacy(false);
  setFxTierLegacy(false);
});

describe('S195 N17 — the tier store (displayPrefs)', () => {
  it('defaults to HIGH; remembers a choice; ignores garbage', () => {
    expect(getGraphicsTier()).toBe('HIGH');
    setGraphicsTier('MINIMAL');
    expect(getGraphicsTier()).toBe('MINIMAL');
    store.set('display.graphicsTier', 'ULTRA');
    expect(getGraphicsTier()).toBe('HIGH');
  });

  it('a viewer who had switched the OLD box off arrives on LOW (what that box meant)', () => {
    store.set('display.fxHighQuality', 'false');
    expect(getGraphicsTier()).toBe('LOW');
    expect(isFxHighQuality()).toBe(false);
  });

  it('the fx lab switch maps onto the tiers', () => {
    setFxHighQuality(false);
    expect(getGraphicsTier()).toBe('LOW');
    setFxHighQuality(true);
    expect(getGraphicsTier()).toBe('HIGH');
  });

  it('⛔ S195 audit — blocked storage: choosing MINIMAL in Settings survives the next frame poll', () => {
    storageThrows = true;
    syncGraphicsTier();
    setGraphicsTier('MINIMAL'); // what the Settings radio does
    syncGraphicsTier();          // next frame (main.ts)
    expect(graphicsTier()).toBe('MINIMAL');
    for (let i = 0; i < 5; i++) syncGraphicsTier();
    expect(graphicsTier()).toBe('MINIMAL');
    expect(getGraphicsTier()).toBe('MINIMAL');
  });

  it('a store that READS but cannot WRITE (quota) also keeps the session choice', () => {
    store.set('display.graphicsTier', 'HIGH');
    const real = (window as unknown as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage;
    const keep = real.setItem;
    real.setItem = () => { throw new Error('quota'); };
    try {
      setGraphicsTier('LOW');
      syncGraphicsTier();
      expect(graphicsTier()).toBe('LOW');
    } finally { real.setItem = keep; }
  });

  it('blocked storage still yields a usable tier', () => {
    storageThrows = true;
    expect(getGraphicsTier()).toBe('HIGH');
    expect(() => setGraphicsTier('LOW')).not.toThrow();
  });
});

describe('S195 N17 — the runtime switch (what main.ts polls every frame)', () => {
  it('syncGraphicsTier applies the STORED tier, live, and each tier sets the fx half', () => {
    syncGraphicsTier();
    expect(graphicsTier()).toBe('HIGH');
    expect(fxHighQuality()).toBe(true);
    expect(fxLegacy()).toBe(false);

    setGraphicsTier('LOW');
    syncGraphicsTier();
    expect(graphicsTier()).toBe('LOW');
    expect(fxHighQuality(), 'LOW drops bloom + ripples').toBe(false);
    expect(fxLegacy(), 'LOW keeps the new particles').toBe(false);

    setGraphicsTier('MINIMAL');
    syncGraphicsTier();
    expect(graphicsTier()).toBe('MINIMAL');
    expect(fxHighQuality()).toBe(false);
    expect(fxLegacy(), 'MINIMAL = the pre-S192 effects').toBe(true);

    setGraphicsTier('HIGH');
    syncGraphicsTier();
    expect(fxHighQuality()).toBe(true);
    expect(fxLegacy()).toBe(false);
  });

  it('⛔ legacy has three owners and they do not fight: lab / URL legacy survives a tier change, and vice versa', () => {
    setFxLegacy(true); // the fx lab's side-by-side switch
    applyGraphicsTier('MINIMAL');
    applyGraphicsTier('HIGH');
    expect(fxLegacy(), 'HIGH must not undo the lab').toBe(true);
    setFxLegacy(false);
    expect(fxLegacy()).toBe(false);
    applyGraphicsTier('MINIMAL');
    setFxLegacy(false);
    expect(fxLegacy(), 'the lab turning off must not undo MINIMAL').toBe(true);
  });
});

describe('S195 N17 — the "try a lower tier" hint (⚠ MINE): one line, never a switch', () => {
  const run = (a: TierAdvisor, ms: number, dt: number, playing = true, tier: 'HIGH' | 'LOW' | 'MINIMAL' = 'HIGH'): Array<string | null> => {
    const out: Array<string | null> = [];
    for (let t = 0; t < ms; t += dt) out.push(a.note(dt, playing, tier));
    return out;
  };
  it('a match slow for the whole window suggests the NEXT tier down, exactly once', () => {
    const a = new TierAdvisor();
    const out = run(a, TIER_HINT_WINDOW_MS * 3, TIER_HINT_SLOW_FRAME_MS + 20);
    expect(out.filter((x) => x !== null)).toEqual(['LOW']);
    const b = new TierAdvisor();
    expect(run(b, TIER_HINT_WINDOW_MS * 2, 80, true, 'LOW').filter((x) => x !== null)).toEqual(['MINIMAL']);
  });
  it('fast frames, the menus, and MINIMAL itself never suggest anything', () => {
    expect(run(new TierAdvisor(), TIER_HINT_WINDOW_MS * 3, 16).every((x) => x === null)).toBe(true);
    expect(run(new TierAdvisor(), TIER_HINT_WINDOW_MS * 3, 80, false).every((x) => x === null)).toBe(true);
    expect(run(new TierAdvisor(), TIER_HINT_WINDOW_MS * 3, 80, true, 'MINIMAL').every((x) => x === null)).toBe(true);
  });
  it('a hidden-tab gap resets the window instead of counting as slowness', () => {
    const a = new TierAdvisor();
    run(a, TIER_HINT_WINDOW_MS * 0.9, 80);
    expect(a.note(5000, true, 'HIGH')).toBeNull();
    expect(run(a, TIER_HINT_WINDOW_MS * 0.5, 80).every((x) => x === null)).toBe(true);
  });
  it('the line names the tier and where to change it; the module never writes the store', () => {
    expect(tierHintText('LOW')).toMatch(/Graphics: LOW in Settings/);
    const SRC = readFileSync(new URL('./tierAdvisor.ts', import.meta.url), 'utf8');
    expect(SRC).not.toMatch(/setGraphicsTier|applyGraphicsTier|localStorage/);
  });
  it('every tier has a one-line description in Settings', () => {
    for (const t of ['HIGH', 'LOW', 'MINIMAL'] as const) expect(GRAPHICS_TIER_HINT[t].length).toBeGreaterThan(10);
  });
});

describe('⛔ S195 audit — the hint goes away the moment the match is not what is on screen', () => {
  it('shown after a slow stretch of play; hidden on the very next non-playing frame (WIN board, title, NONET, cinematic)', () => {
    let t = 1_000_000;
    for (let i = 0; i < 200; i++) { t += 80; noteFrameForTierHint(t, true, 'HIGH'); }
    const el = bodyChildren.find((e) => e.id === 'tier-hint');
    expect(el, 'the slow stretch built and showed the line').toBeDefined();
    expect(el!.style.display).toBe('block');
    t += 16;
    noteFrameForTierHint(t, false, 'HIGH'); // main passes false off PLAYING or while chordBlocked()
    expect(el!.style.display).toBe('none');
  });
});

describe('S195 — the Settings skin CSS covers the tier radios, a dragged slider and a pressed label', () => {
  const SRC = readFileSync(new URL('./settingsOverlay.ts', import.meta.url), 'utf8');
  it('hover + press on the radios; press on sliders and labels', () => {
    expect(SRC).toContain("'.spark-settings input[type=radio]:hover{filter:drop-shadow(0 0 4px #3bd7ff)}'");
    expect(SRC).toContain("'.spark-settings input[type=radio]:active{transform:scale(.9)}'");
    expect(SRC).toContain("'.spark-settings input[type=range]:active{filter:drop-shadow(0 0 6px #3bd7ff) brightness(1.2)}'");
    expect(SRC).toContain("'.spark-settings label:active{color:#3bd7ff}'");
    // inside the one installed <style>, not a stray string elsewhere
    const body = SRC.slice(SRC.indexOf('function installSettingsSkinCss'), SRC.indexOf('export function createSettingsOverlay'));
    expect(body).toContain('input[type=radio]:active');
    expect(body).toContain('label:active');
  });
});
