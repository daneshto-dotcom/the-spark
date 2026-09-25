/**
 * SPARK — S191 A-2 (owner, R190 add-on) — **ALT DROPS THE FOOTER WHILE A TOWER IS ARMED, ALT AGAIN RAISES IT.**
 *
 * > *"hold/press Alt to drop the footer so you can place where it was, Alt again to raise it."*
 *
 * Driven through the REAL `Controls` (its `onKeyDown` / `onKeyUp` / `onDown`) and the REAL `FooterBand`
 * after a real `sync`, so the plate that refuses the stamp is the plate that was drawn. The stamp point
 * is DERIVED — a pixel inside the band that the expanded band covers opaquely AND that `canStampAt`
 * accepts — never a literal, so a retuned chip, card or edge rule moves the test with it.
 *
 * ⛔ S187's lesson is the thing under test: teaching only the cursor hides the menu while still
 * refusing every placement under it. So the assertion is the STAMP, through the armed-stamp arm's own
 * `isPointerOverFooterSurface` gate — not a predicate called on its own.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container } from 'pixi.js';
import { ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y, PLAYER_COLORS } from '../constants.ts';
import { asPlayerId, type Vec2 } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { bankAdd } from '../state/castleBank.ts';
import { canStampAt } from '../state/blueprintLegality.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { Controls, type CastlePanelLike } from './controls.ts';
import { FooterBand, collapseTabRect } from '../render/footerBand.ts';

class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}

/** ⭐ S191 R2 (INPUT-5) — the stubs RECORD what `Controls` registers, so a test can fire the real listener. */
const winListeners = new Map<string, Array<(e: unknown) => void>>();
const docListeners = new Map<string, Array<(e: unknown) => void>>();
const record = (m: Map<string, Array<(e: unknown) => void>>) => (type: string, fn: (e: unknown) => void): void => {
  m.set(type, [...(m.get(type) ?? []), fn]);
};
const doc = {
  activeElement: null as { tagName: string } | null,
  visibilityState: 'visible' as 'visible' | 'hidden',
  addEventListener: record(docListeners),
  removeEventListener() {},
};
beforeAll(() => {
  vi.stubGlobal('window', { addEventListener: record(winListeners), removeEventListener() {} });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const P0 = asPlayerId(0);

function castleStub(): CastlePanelLike & { armed: GodlyId | null } {
  const s = {
    armed: null as GodlyId | null,
    isOpen: () => false,
    toggle() {},
    close() {},
    isOverPanel: () => false,
    armedBlueprint: () => s.armed,
    disarm() { s.armed = null; },
    armExternal(id: GodlyId | null) { s.armed = id; },
    requestShapesFor() {},
  };
  return s;
}

interface Rig {
  w: World;
  c: Controls;
  band: FooterBand;
  castle: ReturnType<typeof castleStub>;
  built: Array<{ id: GodlyId; at: Vec2 }>;
}

function rig(): Rig {
  const w = makeWorld(0x191b);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1],
  });
  for (const t of ALL_SPARK_TYPES) for (let i = 0; i < 40; i++) bankAdd(w.castleBanks, w.localPlayerId, t);
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0 }),
  };
  const c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  const castle = castleStub();
  const built: Array<{ id: GodlyId; at: Vec2 }> = [];
  c.setFooterBand(band);
  c.setCastlePanel(castle);
  c.setBuildBlueprintHandler((id, at) => built.push({ id, at: { ...at } }));
  frame({ w, c, band, castle, built });
  return { w, c, band, castle, built };
}

/** What `main.ts` does every frame for the band: mirror the hand, then draw. */
function frame(r: Rig): void {
  r.band.setArmed(r.castle.armedBlueprint());
  r.band.sync(r.w);
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: Vec2, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: Vec2, button = 0): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });

interface KeyEv { key: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; prevented: boolean; preventDefault(): void }
function key(k: string, over: Partial<KeyEv> = {}): KeyEv {
  const e: KeyEv = {
    key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: k === 'Alt', prevented: false,
    preventDefault() { e.prevented = true; },
    ...over,
  };
  return e;
}
const keyDown = (c: Controls, e: KeyEv): KeyEv => {
  (c as unknown as { onKeyDown(e: KeyEv): void }).onKeyDown(e);
  return e;
};
const keyUp = (c: Controls, e: KeyEv): KeyEv => {
  (c as unknown as { onKeyUp(e: KeyEv): void }).onKeyUp(e);
  return e;
};

/**
 * A tower and a pixel for it: inside the band (y ≥ FOOTER_TOP_Y), covered by an opaque plate of the
 * EXPANDED band with that tower armed (so the carry readout is drawn too), legal for the edge rule
 * and for every other `canStampAt` gate — and off the collapsed tab and the Ra square, which stay
 * opaque in both states on purpose.
 */
function findBandStamp(r: Rig, under: (x: number, y: number) => boolean = () => true): { id: GodlyId; at: Vec2 } {
  const ids = [...new Set(r.band.getUiPoints().chips.map((k) => k.complexity))];
  expect(ids.length, 'fixture: the bar has chips').toBeGreaterThan(0);
  const back = collapseTabRect(true);
  const candidates: GodlyId[] = [];
  for (const tier of ids) {
    r.band.select(tier);
    r.band.sync(r.w);
    for (const card of r.band.getUiPoints().cards) if (!candidates.includes(card.id)) candidates.push(card.id);
    r.band.select(tier); // close it again
  }
  r.band.sync(r.w);
  for (const id of candidates) {
    r.castle.armed = id;
    frame(r);
    for (let y = FOOTER_TOP_Y + 2; y < CANVAS_HEIGHT; y += 4) {
      for (let x = 4; x < CANVAS_WIDTH; x += 6) {
        if (!r.band.isOverBandSurface(x, y) || !under(x, y)) continue;
        if (x >= back.x - 2 && x <= back.x + back.w + 2 && y >= back.y - 2) continue;
        if (r.band.isOverRaButton(x, y)) continue;
        if (!canStampAt(r.w, { x, y }, P0, id)) continue;
        r.castle.armed = null;
        frame(r);
        return { id, at: { x, y } };
      }
    }
  }
  r.castle.armed = null;
  frame(r);
  throw new Error('fixture: no legal stamp under an opaque footer plate on this board');
}

describe('⭐⭐ S191 A-2 — REACH: Alt with a tower in hand gives back the ground under the footer', () => {
  /*
   * Two of the band's opaque plates, each found on the live geometry: the CARRY READOUT (drawn only
   * while a tower is armed — the very gesture this is for; the S182 surface) and a TIER CHIP. The shape
   * strip is not included because on this board it lies outside the seat's buildable ground, so no
   * tower can be stamped there with or without the band.
   */
  const PLATES: Array<[string, (band: FooterBand, x: number, y: number) => boolean]> = [
    ['the carry readout', (band, x, y) => band.isOverCarryBill(x, y)],
    ['a tier chip', (band, x, y) => band.chipAt(x, y) !== null],
  ];
  it.each(PLATES)('⭐ armed + Alt → a stamp under %s is accepted; Alt again → refused', (_name, under) => {
    const r = rig();
    const { id, at } = findBandStamp(r, (x, y) => under(r.band, x, y));
    expect(at.y, 'the point is in the band').toBeGreaterThanOrEqual(FOOTER_TOP_Y);


    // The baseline the add-on exists for: with the band up, that pixel is a plate and the stamp is refused.
    r.castle.armExternal(id);
    frame(r);
    expect(r.band.isOverBandSurface(at.x, at.y), 'fixture: a plate covers it').toBe(true);
    down(r.c, at);
    expect(r.built, 'band up: the plate swallows the stamp').toHaveLength(0);
    expect(r.castle.armed, 'and the tower stays in hand').toBe(id);

    const e = keyDown(r.c, key('Alt'));
    expect(e.prevented, 'the browser must not take Alt to its menu bar').toBe(true);
    frame(r);
    expect(r.band.isCollapsed(), 'Alt drops it').toBe(true);
    expect(r.band.isOverBandSurface(at.x, at.y), 'and the plate no longer covers that pixel').toBe(false);
    down(r.c, at);
    up(r.c, at);
    expect(r.built, 'band down: the SAME pixel builds').toEqual([{ id, at }]);
    expect(r.castle.armed, 'one pick = one tower').toBeNull();
    frame(r);
    expect(r.band.isCollapsed(), '⚠ MINE: placing the tower raises the band Alt lowered').toBe(false);

    // Alt again → refused: lower, raise, and the stamp is swallowed again.
    r.castle.armExternal(id);
    frame(r);
    keyDown(r.c, key('Alt'));
    frame(r);
    expect(r.band.isCollapsed()).toBe(true);
    keyDown(r.c, key('Alt'));
    frame(r);
    expect(r.band.isCollapsed(), 'Alt again raises it').toBe(false);
    down(r.c, at);
    expect(r.built, 'band up again: refused').toHaveLength(1);
    expect(r.castle.armed).toBe(id);
  });

  it('⭐ putting the tower BACK (Escape, right-click) raises the band Alt lowered', () => {
    for (const putBack of ['escape', 'rmb'] as const) {
      const r = rig();
      const { id, at } = findBandStamp(r);
      r.castle.armExternal(id);
      frame(r);
      keyDown(r.c, key('Alt'));
      frame(r);
      expect(r.band.isCollapsed(), putBack).toBe(true);
      if (putBack === 'escape') keyDown(r.c, key('Escape'));
      else down(r.c, at, 2);
      expect(r.castle.armed, `${putBack} put it back`).toBeNull();
      frame(r);
      expect(r.band.isCollapsed(), `${putBack}: the band comes back up`).toBe(false);
      expect(r.built).toHaveLength(0);
    }
  });
});

describe('⛔ S191 A-2 — what Alt must NOT do', () => {
  it('⛔ unarmed Alt → NOTHING: the band stays up and the browser keeps its own Alt', () => {
    const r = rig();
    const e = keyDown(r.c, key('Alt'));
    frame(r);
    expect(r.band.isCollapsed()).toBe(false);
    expect(e.prevented, 'not even preventDefault').toBe(false);
    expect(keyUp(r.c, key('Alt')).prevented, 'nor on the way up').toBe(false);
  });

  it('⛔ a band lowered with the TAB is never raised by a disarm — only Alt\'s own drop is undone', () => {
    const r = rig();
    const { id, at } = findBandStamp(r);
    r.castle.armExternal(id);
    frame(r);
    r.band.toggleCollapsed(); // the tab's own action
    frame(r);
    expect(r.band.isAltLowered()).toBe(false);
    down(r.c, at);
    expect(r.built, 'the tab-lowered band releases the ground too (S187)').toHaveLength(1);
    frame(r);
    expect(r.band.isCollapsed(), 'he lowered it himself, so it stays down').toBe(true);
  });

  it('⛔ Alt lowered, then the TAB raised and lowered it again → the disarm leaves it down', () => {
    const r = rig();
    const { id } = findBandStamp(r);
    r.castle.armExternal(id);
    frame(r);
    keyDown(r.c, key('Alt'));
    r.band.toggleCollapsed(); // tab up
    r.band.toggleCollapsed(); // tab down
    r.castle.disarm();
    frame(r);
    expect(r.band.isCollapsed(), 'the last hand on it was the tab').toBe(true);
  });

  it('⛔ an auto-repeat, Ctrl+Alt, Meta+Alt and a focused text field are ignored', () => {
    const cases: Array<[string, Partial<KeyEv>, { tagName: string } | null]> = [
      ['auto-repeat', { repeat: true }, null],
      ['Ctrl+Alt (AltGr)', { ctrlKey: true }, null],
      ['Meta+Alt', { metaKey: true }, null],
      ['typing in an INPUT', {}, { tagName: 'INPUT' }],
      ['typing in a TEXTAREA', {}, { tagName: 'TEXTAREA' }],
    ];
    for (const [name, over, focused] of cases) {
      const r = rig();
      const { id } = findBandStamp(r);
      r.castle.armExternal(id);
      frame(r);
      doc.activeElement = focused;
      const e = keyDown(r.c, key('Alt', over));
      doc.activeElement = null;
      frame(r);
      expect(r.band.isCollapsed(), name).toBe(false);
      expect(e.prevented, `${name}: left to the browser`).toBe(false);
    }
  });

  /*
   * ⛔ S191 R2 (INPUT-5) — AND A CONSUMED ALT WHOSE KEYUP NEVER ARRIVES IS FORGOTTEN. Alt+Tab away (or the
   * tab going hidden) means the release lands in another window: the latch stayed set, and the NEXT Alt
   * keyup here — one the player meant for the browser, with nothing armed — was swallowed. Fired through
   * the listeners `Controls` really registered (the stubs record them).
   */
  it.each(['window blur (Alt+Tab)', 'document hidden'] as const)(
    '⛔ INPUT-5 — after %s, the next Alt keyup is the browser’s again',
    (how) => {
      winListeners.clear();
      docListeners.clear();
      const r = rig();
      const { id } = findBandStamp(r);
      r.castle.armExternal(id);
      frame(r);
      keyDown(r.c, key('Alt')); // consumed — its keyup goes to the other window
      if (how === 'window blur (Alt+Tab)') {
        const fns = winListeners.get('blur') ?? [];
        expect(fns.length, 'Controls listens for the window losing focus').toBeGreaterThan(0);
        for (const fn of fns) fn({});
      } else {
        const fns = docListeners.get('visibilitychange') ?? [];
        expect(fns.length, 'Controls listens for the tab going hidden').toBeGreaterThan(0);
        doc.visibilityState = 'hidden';
        for (const fn of fns) fn({});
        doc.visibilityState = 'visible';
      }
      r.castle.disarm();
      frame(r);
      expect(keyDown(r.c, key('Alt')).prevented, 'unarmed: the browser’s Alt').toBe(false);
      expect(keyUp(r.c, key('Alt')).prevented, 'and its release is not swallowed by a stale latch').toBe(false);
    },
  );

  it('INPUT-5 negative — the tab going VISIBLE does not clear a live latch', () => {
    docListeners.clear();
    const r = rig();
    const { id } = findBandStamp(r);
    r.castle.armExternal(id);
    frame(r);
    keyDown(r.c, key('Alt'));
    doc.visibilityState = 'visible';
    for (const fn of docListeners.get('visibilitychange') ?? []) fn({});
    expect(keyUp(r.c, key('Alt')).prevented, 'the release that belongs to it is still swallowed').toBe(true);
  });

  it('⭐ a consumed Alt is swallowed on the KEYUP too (Windows focuses the menu bar on release) — once', () => {
    const r = rig();
    const { id } = findBandStamp(r);
    r.castle.armExternal(id);
    frame(r);
    keyDown(r.c, key('Alt'));
    expect(keyUp(r.c, key('Alt')).prevented, 'the release that belongs to it').toBe(true);
    expect(keyUp(r.c, key('Alt')).prevented, 'and no later one').toBe(false);
  });

  it('⛔ the edge rule is untouched: with the band down, a stamp the edge rule refuses is still refused', () => {
    const r = rig();
    const { id } = findBandStamp(r);
    r.castle.armExternal(id);
    frame(r);
    keyDown(r.c, key('Alt'));
    frame(r);
    const floor = { x: CANVAS_WIDTH / 4, y: CANVAS_HEIGHT - 1 }; // the canvas's last row: off-screen footprint
    expect(canStampAt(r.w, floor, P0, id), 'fixture: the edge rule refuses the bottom row').toBe(false);
    down(r.c, floor);
    expect(r.built).toHaveLength(0);
    expect(r.castle.armed, 'and the tower stays in hand').toBe(id);
  });
});
