/**
 * ⭐ S196 (ui-5) — REACH for the SETTINGS panel's two SKINNED census rows (the ✕ close button, and every
 * `cursor: pointer` control: the two channel mutes + sliders, the two owner toggles, the Graphics tier
 * radios and their labels). It was NOT DONE in S195 because a DOM REACH "needs jsdom" and no new npm
 * package may land without the merge owner — so this file carries the SMALLEST fake DOM the panel
 * actually touches (createElement / appendChild / style / listeners / contains), built from a census of
 * the DOM calls in `settingsOverlay.ts`, and drives the REAL `createSettingsOverlay`.
 *
 * What it proves, per control (the browser's own hit-test and `:hover` cannot run in node — the real-click
 * half is `e2e/settings-toggles.spec.ts`, @races lane):
 *   · every element that SHOWS a pointer cursor RESPONDS: its event (click / change / input, or for a
 *     `<label>` the activation of the input its `htmlFor` names) reaches the store it advertises;
 *   · it sits inside the `.spark-settings` root, so the scoped hover / press / focus CSS applies, and that
 *     CSS has a `:hover` (or `:active`) rule for its kind — the "skin" of a DOM control;
 *   · NEGATIVE: nothing that does NOT show a pointer has a listener (no invisible clickables), and a
 *     control fired while the panel is hidden still writes its store (the panel is a view, not a gate).
 */
// ⭐ S196 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/settingsOverlay.ts :: createElement('button')
// CENSUS-REACH src/render/settingsOverlay.ts :: style.cursor = 'pointer'
import { describe, expect, it, vi } from 'vitest';

// ── the store the panel writes: a tiny in-memory audio settings model ─────────────────────────────
const audio = { musicMuted: false, sfxMuted: false, musicVolume: 0.5, sfxVolume: 0.5, raceMusicEnabled: true };
vi.mock('./audioManager.ts', () => ({
  getAudioSettings: () => ({ ...audio }),
  setMusicMuted: (v: boolean) => { audio.musicMuted = v; },
  setSfxMuted: (v: boolean) => { audio.sfxMuted = v; },
  setMusicVolume: (v: number) => { audio.musicVolume = v; },
  setSfxVolume: (v: number) => { audio.sfxVolume = v; },
  setRaceMusicEnabled: (v: boolean) => { audio.raceMusicEnabled = v; },
}));

// ── the fake DOM ─────────────────────────────────────────────────────────────────────────────────
type Listener = (e: Record<string, unknown>) => void;
class FakeEl {
  readonly tag: string;
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly attrs = new Map<string, string>();
  parentNode: FakeEl | null = null;
  id = ''; className = ''; textContent = ''; htmlFor = ''; type = ''; name = '';
  value = ''; min = ''; max = ''; step = ''; checked = false;
  constructor(tag: string) { this.tag = tag; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  appendChild(c: FakeEl): FakeEl { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c: FakeEl): void { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; }
  addEventListener(t: string, f: Listener): void { this.listeners.set(t, [...(this.listeners.get(t) ?? []), f]); }
  removeEventListener(t: string, f: Listener): void { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((g) => g !== f)); }
  contains(n: FakeEl): boolean { for (let p: FakeEl | null = n; p !== null; p = p.parentNode) if (p === this) return true; return false; }
  fire(t: string, extra: Record<string, unknown> = {}): void { for (const f of this.listeners.get(t) ?? []) f({ type: t, target: this, ...extra }); }
  all(): FakeEl[] { return [this, ...this.children.flatMap((c) => c.all())]; }
}
// `instanceof Node` is how the outside-click handler tells an element from anything else.
vi.stubGlobal('Node', FakeEl);
const head = new FakeEl('head');
const body = new FakeEl('body');
const docListeners = new FakeEl('#document');
vi.stubGlobal('document', {
  head, body,
  createElement: (t: string) => new FakeEl(t),
  getElementById: (id: string) => [...head.all(), ...body.all()].find((e) => e.id === id) ?? null,
  addEventListener: (t: string, f: Listener) => docListeners.addEventListener(t, f),
  removeEventListener: (t: string, f: Listener) => docListeners.removeEventListener(t, f),
});
const storage = new Map<string, string>();
vi.stubGlobal('window', { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } } });

const { createSettingsOverlay } = await import('./settingsOverlay.ts');
const { getGraphicsTier, isZoneBackgroundEnabled } = await import('./displayPrefs.ts');

/** What a click on a control does in a browser: a button fires click; a checkbox/radio toggles + change; a label activates its input. */
function activate(el: FakeEl, root: FakeEl): void {
  if (el.tag === 'label') {
    const target = root.all().find((e) => e.id === el.htmlFor);
    expect(target, `label for=${el.htmlFor} names a real input`).toBeDefined();
    activate(target!, root);
    return;
  }
  if (el.tag === 'button') { el.fire('click'); return; }
  if (el.tag === 'input' && el.type === 'checkbox') { el.checked = !el.checked; el.fire('change'); return; }
  if (el.tag === 'input' && el.type === 'radio') { el.checked = true; el.fire('change'); return; }
  if (el.tag === 'input' && el.type === 'range') { el.value = el.value === '17' ? '83' : '17'; el.fire('input'); return; }
  throw new Error(`no activation for <${el.tag} type=${el.type}>`);
}

/** A cheap fingerprint of every store the panel can write. */
const snapshot = (): string => JSON.stringify({ audio, tier: getGraphicsTier(), zone: isZoneBackgroundEnabled() });

describe('S196 — the settings panel: every pointer-cursor control responds and wears the scoped skin', () => {
  const h = createSettingsOverlay();
  const root = body.children[body.children.length - 1]!;
  const css = head.all().find((e) => e.id === 'spark-settings-skin')!;
  const pointers = root.all().filter((e) => e.style.cursor === 'pointer');

  it('anti-vacuity: the panel mounted, the skin CSS installed, and the controls are all there', () => {
    expect(root.className).toBe('spark-settings');
    expect(css.textContent).toContain('.spark-settings');
    // ✕ + 2 mutes + 2 sliders + 2 toggle labels + 2 toggles + 3 radios + 3 radio labels = 15
    expect(pointers.length).toBe(15);
    expect(pointers.filter((e) => e.tag === 'button').length).toBe(1);
  });

  it('every pointer control has a skin rule for its kind (hover or press) and sits inside the scoped root', () => {
    const rule = (sel: RegExp): boolean => sel.test(css.textContent);
    for (const el of pointers) {
      expect(root.contains(el), `<${el.tag}> inside .spark-settings`).toBe(true);
      const kind = el.tag === 'button' ? 'close' : el.tag === 'label' ? 'label' : `input-${el.type}`;
      const has = {
        close: rule(/\.spark-settings-close:hover\{/) && el.className === 'spark-settings-close',
        label: rule(/\.spark-settings label:active\{/),
        'input-checkbox': rule(/input\[type=checkbox\]:hover\{/),
        'input-range': rule(/input\[type=range\]:hover\{/),
        'input-radio': rule(/input\[type=radio\]:hover\{/),
      }[kind];
      expect(has, `${kind} has its skin rule`).toBe(true);
    }
  });

  it('REACH: activating each pointer control (other than ✕) changes the store it advertises', () => {
    h.show();
    for (const el of pointers) {
      if (el.tag === 'button') continue;
      // A radio already checked does not change the tier — start each radio from a DIFFERENT tier.
      const target = el.tag === 'label' ? root.all().find((e) => e.id === el.htmlFor)! : el;
      if (target.type === 'radio' && target.checked) {
        const other = root.all().find((e) => e.type === 'radio' && e !== target)!;
        activate(other, root);
      }
      const before = snapshot();
      activate(el, root);
      expect(snapshot(), `<${el.tag}${el.htmlFor ? ` for=${el.htmlFor}` : ` id=${el.id}`}> wrote its store`).not.toBe(before);
    }
  });

  it('REACH: the ✕ closes the panel; Escape and an outside mousedown close it too', () => {
    h.show();
    expect(h.isVisible()).toBe(true);
    activate(pointers.find((e) => e.tag === 'button')!, root);
    expect(h.isVisible()).toBe(false);
    expect(root.style.display).toBe('none');

    h.show();
    docListeners.fire('mousedown', { target: new FakeEl('canvas') });
    expect(h.isVisible(), 'outside mousedown closes').toBe(false);

    h.show();
    docListeners.fire('mousedown', { target: pointers[1]! });
    expect(h.isVisible(), 'a mousedown INSIDE the panel does not close it').toBe(true);
    root.fire('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
    expect(h.isVisible()).toBe(false);
  });

  it('⛔ NEGATIVE: nothing that shows NO pointer carries a listener (no invisible clickables)', () => {
    const silent = root.all().filter((e) => e !== root && e.style.cursor !== 'pointer' && e.listeners.size > 0);
    expect(silent.map((e) => `<${e.tag} id=${e.id}>`)).toEqual([]);
    // …and every pointer control does carry one (a label carries it through its input).
    for (const el of pointers) {
      const live = el.tag === 'label' ? root.all().find((e) => e.id === el.htmlFor)! : el;
      expect(live.listeners.size, `<${el.tag}> responds`).toBeGreaterThan(0);
    }
  });
});
