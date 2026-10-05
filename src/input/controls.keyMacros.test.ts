/**
 * SPARK — S195 N6 (owner) — **SHIFT = PLACE MANY, and NUMBER-KEY BUILD MACROS**, driven through the REAL
 * `Controls` (its `onDown` / `onUp` / `onKeyDown` / `onKeyUp` / focus-loss handlers) and the REAL
 * `FooterBand` after a real `sync`, with a host that really applies `BUILD_BLUEPRINT` so the bank drains.
 *
 * > *"hold shift down when placing down a tower to place multiple … if you have enough resources … rebuild
 * > really quickly"*; *"click like three, one … tier three towers … first tower in line … five, two … Helga
 * > … like in TD games"* — owner, S195 (N6)
 *
 * ⛔ MUTATION PAIRS (each test names the line that would turn it red):
 *   · delete `keepArmedAfterPlacement(e, armed)` in the stamp arm → "Shift keeps the item armed" fails;
 *   · drop the Shift condition inside it (keep on affordability alone) → "no Shift → disarmed" fails;
 *   · drop the affordability half → "runs out → disarmed" fails;
 *   · delete `endShiftChain` on Shift-up → "Shift release → disarmed" fails;
 *   · delete `handleDigitKey` → every digit test fails; drop one guard → that overlay's test fails.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, type SparkType } from '../constants.ts';
import { asPlayerId, type Vec2 } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { bankAdd } from '../state/castleBank.ts';
import { canStampAt } from '../state/blueprintLegality.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { planBlueprintPayment } from '../state/blueprintBuild.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { playUiClickSFX, playUiRefusedSFX } from '../render/audioManager.ts';
import { Controls, type CastlePanelLike } from './controls.ts';
import { FooterBand } from '../render/footerBand.ts';
import '../state/godlyRecipes/registerAll.ts';

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
  getContext(): FakeContext2D { return new FakeContext2D(); }
}

/** The stubs RECORD what `Controls` registers on window / document, so a test can fire the real listener. */
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
afterAll(() => { vi.unstubAllGlobals(); });

const P0 = asPlayerId(0);
const BAT = 't3TowerVampires' as GodlyId; // the complexity-3 tier's first (only) card — his "three, one"
const clicked = vi.mocked(playUiClickSFX);
const refused = vi.mocked(playUiRefusedSFX);
beforeEach(() => { clicked.mockClear(); refused.mockClear(); doc.activeElement = null; doc.visibilityState = 'visible'; winListeners.clear(); docListeners.clear(); });

function castleStub(): CastlePanelLike & { armed: GodlyId | null } {
  const s = {
    armed: null as GodlyId | null,
    isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false,
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
  sent: GameAction[];
  modal: { open: boolean };
}

/** A live 2-seat bots match (BUILD phase), the local seat's bank funded for exactly `towers` BAT TOWERs. */
function rig(towers = 2): Rig {
  const w = makeWorld(0x195a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1],
  });
  w.draft = null; // no panel over the board — the gestures under test are the board's own
  for (const [type, n] of blueprintBill(BAT)) for (let i = 0; i < n * towers; i++) bankAdd(w.castleBanks, w.localPlayerId, type as SparkType);
  const sent: GameAction[] = [];
  const canvas = {
    addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0 }),
  };
  // The host path of `main.ts`'s dispatchFn: apply locally, synchronously.
  const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); dispatch(w, a); });
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  const castle = castleStub();
  const modal = { open: false };
  c.setFooterBand(band);
  c.setCastlePanel(castle);
  c.setModalCover(() => modal.open);
  // Exactly what `main.ts` wires: the local seat's BUILD_BLUEPRINT through the same dispatchFn.
  c.setBuildBlueprintHandler((blueprintId, centre) => {
    sent.push({ type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId, centre });
    dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId, centre });
  });
  const r = { w, c, band, castle, sent, modal };
  frame(r);
  return r;
}

/** What `main.ts` does every frame for the band: mirror the hand, then draw. */
function frame(r: Rig): void {
  r.band.setArmed(r.castle.armedBlueprint());
  r.band.sync(r.w);
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number; shiftKey?: boolean };
const down = (c: Controls, p: Vec2, o: Partial<Ptr> = {}): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1, ...o });
const up = (c: Controls, p: Vec2, o: Partial<Ptr> = {}): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1, ...o });
const click = (r: Rig, p: Vec2, o: Partial<Ptr> = {}): void => { down(r.c, p, o); up(r.c, p, o); frame(r); };

interface KeyEv { key: string; code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; prevented: boolean; preventDefault(): void }
function key(k: string, over: Partial<KeyEv> = {}): KeyEv {
  const e: KeyEv = {
    key: k, code: /^[1-9]$/.test(k) ? `Digit${k}` : k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, prevented: false,
    preventDefault() { e.prevented = true; },
    ...over,
  };
  return e;
}
const keyDown = (r: Rig, e: KeyEv): KeyEv => { (r.c as unknown as { onKeyDown(e: KeyEv): void }).onKeyDown(e); frame(r); return e; };
const keyUp = (r: Rig, e: KeyEv): KeyEv => { (r.c as unknown as { onKeyUp(e: KeyEv): void }).onKeyUp(e); frame(r); return e; };
const builds = (r: Rig): number => r.sent.filter((a) => a.type === 'BUILD_BLUEPRINT').length;

/** Legal stamp points for `id`, well clear of the HUD bands and of each other (one BAT TOWER is ~83 px wide). */
function legalPoints(r: Rig, id: GodlyId, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let y = 200; y <= 800 && out.length < n; y += 140) {
    for (let x = 160; x <= 1760 && out.length < n; x += 220) {
      if (canStampAt(r.w, { x, y }, P0, id)) out.push({ x, y });
    }
  }
  expect(out.length, 'fixture: enough legal stamp points').toBe(n);
  return out;
}

describe('⭐⭐ S195 N6 — SHIFT = PLACE MANY (REACH through the real Controls)', () => {
  it('Shift held: two placements send two BUILD_BLUEPRINT intents and the tower is STILL in hand', () => {
    const r = rig(3);
    const [a, b] = legalPoints(r, BAT, 2);
    r.castle.armed = BAT; frame(r);
    keyDown(r, key('Shift'));
    click(r, a, { shiftKey: true });
    expect(builds(r)).toBe(1);
    expect(r.castle.armed, 'kept in hand (delete `keepArmedAfterPlacement` in the stamp arm → red)').toBe(BAT);
    click(r, b, { shiftKey: true });
    expect(builds(r)).toBe(2);
    expect(r.castle.armed).toBe(BAT);
    // ⛔ NOTHING NEW ON THE WIRE: each intent is byte-for-byte the shape a single placement sends.
    for (const i of r.sent.filter((x) => x.type === 'BUILD_BLUEPRINT')) {
      expect(Object.keys(i).sort()).toEqual(['blueprintId', 'centre', 'playerId', 'type']);
    }
    // and the host really built both (the bank paid twice)
    expect(r.w.primitives.size).toBeGreaterThanOrEqual(6);
  });

  it('NEGATIVE: no Shift → one pick = one tower, disarmed after the first placement (today\'s rule)', () => {
    const r = rig(3);
    const [a] = legalPoints(r, BAT, 1);
    r.castle.armed = BAT; frame(r);
    click(r, a);
    expect(builds(r)).toBe(1);
    expect(r.castle.armed, 'drop the Shift condition in `keepArmedAfterPlacement` → red').toBeNull();
  });

  it('the pointer event\'s own shiftKey counts as a held Shift (no keydown ever reached the window)', () => {
    const r = rig(3);
    const [a] = legalPoints(r, BAT, 1);
    r.castle.armed = BAT; frame(r);
    click(r, a, { shiftKey: true });
    expect(builds(r)).toBe(1);
    expect(r.castle.armed).toBe(BAT);
  });

  it('runs out → disarmed: funded for exactly two, the second Shift placement puts the tower back', () => {
    const r = rig(2);
    const [a, b, c] = legalPoints(r, BAT, 3);
    r.castle.armed = BAT; frame(r);
    keyDown(r, key('Shift'));
    click(r, a, { shiftKey: true });
    expect(r.castle.armed, 'one more is affordable').toBe(BAT);
    expect(planBlueprintPayment(r.w, P0, BAT)).not.toBeNull();
    click(r, b, { shiftKey: true });
    expect(builds(r)).toBe(2);
    expect(planBlueprintPayment(r.w, P0, BAT), 'the bank is spent').toBeNull();
    expect(r.castle.armed, 'drop the affordability half of `keepArmedAfterPlacement` → red').toBeNull();
    // and a third click with nothing in hand builds nothing
    click(r, c, { shiftKey: true });
    expect(builds(r)).toBe(2);
  });

  it('Shift release → disarmed: the chained tower goes back on keyup', () => {
    const r = rig(3);
    const [a] = legalPoints(r, BAT, 1);
    r.castle.armed = BAT; frame(r);
    keyDown(r, key('Shift'));
    click(r, a, { shiftKey: true });
    expect(r.castle.armed).toBe(BAT);
    keyUp(r, key('Shift'));
    expect(r.castle.armed, 'delete `endShiftChain` on Shift-up → red').toBeNull();
  });

  it('⚠ a Shift release puts back ONLY the chained tower — a tower picked afresh afterwards stays', () => {
    const r = rig(3);
    const [a] = legalPoints(r, BAT, 1);
    r.castle.armed = BAT; frame(r);
    keyDown(r, key('Shift'));
    click(r, a, { shiftKey: true });
    keyDown(r, key('Escape')); // put it back by hand — the chain is over
    expect(r.castle.armed).toBeNull();
    r.castle.armed = BAT; frame(r); // picked again, deliberately, while Shift is still down
    keyUp(r, key('Shift'));
    expect(r.castle.armed, 'the fresh pick is not the chain\'s').toBe(BAT);
  });

  it('window blur / tab hidden end the chain the way a Shift release does (no stuck Shift)', () => {
    for (const how of ['blur', 'hidden'] as const) {
      const r = rig(3);
      const [a] = legalPoints(r, BAT, 1);
      r.castle.armed = BAT; frame(r);
      keyDown(r, key('Shift'));
      click(r, a, { shiftKey: true });
      expect(r.castle.armed).toBe(BAT);
      if (how === 'blur') for (const fn of winListeners.get('blur') ?? []) fn({});
      else { doc.visibilityState = 'hidden'; for (const fn of docListeners.get('visibilitychange') ?? []) fn({}); }
      frame(r);
      expect(r.castle.armed, how).toBeNull();
      // and Shift is no longer believed held: the next plain click is a single placement
      const [b] = legalPoints(r, BAT, 1);
      r.castle.armed = BAT; frame(r);
      click(r, b);
      expect(r.castle.armed, `${how}: shiftHeld was cleared`).toBeNull();
    }
  });

  it('illegal spot with Shift held → the refused cue, nothing sent, STILL armed (the existing refusal path)', () => {
    const r = rig(3);
    let bad: Vec2 | null = null;
    for (let y = 200; y <= 800 && bad === null; y += 20) for (let x = 120; x <= 1800; x += 20) if (!canStampAt(r.w, { x, y }, P0, BAT)) { bad = { x, y }; break; }
    expect(bad, 'fixture: an illegal point').not.toBeNull();
    r.castle.armed = BAT; frame(r);
    keyDown(r, key('Shift'));
    click(r, bad!, { shiftKey: true });
    expect(refused).toHaveBeenCalledTimes(1);
    expect(builds(r)).toBe(0);
    expect(r.castle.armed).toBe(BAT);
  });

  it('Shift alone is never consumed (keydown) and arms nothing', () => {
    const r = rig(3);
    const e = keyDown(r, key('Shift'));
    expect(e.prevented).toBe(false);
    expect(r.castle.armed).toBeNull();
    expect(builds(r)).toBe(0);
  });
});

describe('⭐⭐ S195 N6 — NUMBER-KEY BUILD MACROS: "three, one" (REACH through the real Controls + FooterBand)', () => {
  it('"3" opens the chip that PRINTS 3; "1" arms its first card; "1" again puts it back', () => {
    const r = rig(3);
    expect(r.band.getUiPoints().selected).toBeNull();
    const e3 = keyDown(r, key('3'));
    expect(e3.prevented, 'consumed').toBe(true);
    expect(r.band.getUiPoints().selected).toBe(3);
    const cards = r.band.getUiPoints().cards;
    expect(cards[0]?.id).toBe(BAT);
    keyDown(r, key('1'));
    expect(r.castle.armed, 'the first tower in line').toBe(BAT);
    expect(clicked).toHaveBeenCalled();
    keyDown(r, key('1'));
    expect(r.castle.armed, 'the armed card\'s own digit is a toggle').toBeNull();
  });

  it('the digit arms what the player SEES as the N-th card — the chip\'s printed number, not its column', () => {
    const r = rig(3);
    const chips = r.band.getUiPoints().chips;
    // the SECOND chip from the left prints 4; "4" must open IT, and "2" (its column) must not open anything
    expect(chips[1]?.complexity).toBe(4);
    keyDown(r, key('2'));
    expect(r.band.getUiPoints().selected, 'no menu open → 2 names no card and no chip prints 2').toBeNull();
    keyDown(r, key('4'));
    expect(r.band.getUiPoints().selected).toBe(4);
    // "7, 2" → the complexity-7 tier's second card (his "five, two … Helga" — Helga prints 7 today)
    keyDown(r, key('7'));
    expect(r.band.getUiPoints().selected).toBe(7);
    const seven = r.band.getUiPoints().cards;
    expect(seven.length).toBe(2);
    expect(seven[1]!.id).toBe('helga');
    expect(seven[1]!.enabled, 'fixture: the bank holds BAT shapes only, so HELGA is SHORT').toBe(false);
    keyDown(r, key('2'));
    expect(r.castle.armed, 'a SHORT card\'s digit does not arm it (the card\'s own `cardEnabled` verdict)').toBeNull();
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('the open chip\'s own digit shuts the menu (the chip click\'s `select` toggle)', () => {
    const r = rig(3);
    keyDown(r, key('3'));
    expect(r.band.getUiPoints().selected).toBe(3);
    keyDown(r, key('3'));
    expect(r.band.getUiPoints().selected).toBeNull();
  });

  it('an unaffordable card\'s digit does what its click does: the refused cue and ORDER THE SHAPES, no arm', () => {
    const r = rig(0); // an empty bank
    const ordered: GodlyId[] = [];
    r.castle.requestShapesFor = (_w, id) => { ordered.push(id); };
    keyDown(r, key('3'));
    keyDown(r, key('1'));
    expect(r.castle.armed).toBeNull();
    expect(refused).toHaveBeenCalledTimes(1);
    expect(ordered).toEqual([BAT]);
  });

  it('Shift+digit arms exactly as the plain digit does (US layout reports key "!" — `code` is read)', () => {
    const r = rig(3);
    keyDown(r, key('3', { shiftKey: true, key: '#' }));
    expect(r.band.getUiPoints().selected).toBe(3);
    keyDown(r, key('1', { shiftKey: true, key: '!' }));
    expect(r.castle.armed).toBe(BAT);
    // …and combines with 1: the next Shift placement keeps it in hand
    const [a] = legalPoints(r, BAT, 1);
    click(r, a, { shiftKey: true });
    expect(builds(r)).toBe(1);
    expect(r.castle.armed).toBe(BAT);
  });

  it('numpad digits are the same keys', () => {
    const r = rig(3);
    keyDown(r, key('3', { code: 'Numpad3' }));
    expect(r.band.getUiPoints().selected).toBe(3);
    keyDown(r, key('1', { code: 'Numpad1' }));
    expect(r.castle.armed).toBe(BAT);
  });

  it('a digit that names nothing on screen is inert and silent (not consumed, no cue)', () => {
    const r = rig(3);
    const e = keyDown(r, key('1')); // no menu open, no chip prints 1
    expect(e.prevented).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
    expect(refused).not.toHaveBeenCalled();
  });

  it('an auto-repeat and a Ctrl / Meta / Alt chord are left to the browser', () => {
    const r = rig(3);
    for (const over of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }] as Partial<KeyEv>[]) {
      const e = keyDown(r, key('3', over));
      expect(e.prevented, JSON.stringify(over)).toBe(false);
      expect(r.band.getUiPoints().selected, JSON.stringify(over)).toBeNull();
    }
  });

  it('the card KEY BADGE is drawn INSIDE the card\'s hit rect (plate 12 ⊆ plate 5 — `cardAt` answers for it)', () => {
    const r = rig(3);
    keyDown(r, key('7'));
    const ui = r.band.getUiPoints();
    expect(ui.cards.length).toBe(2);
    expect(ui.keyBadges.map((b) => b.digit)).toEqual([1, 2]);
    for (const b of ui.keyBadges) {
      const card = ui.cards.find((c) => c.id === b.id)!;
      expect(b.x).toBeGreaterThanOrEqual(card.x);
      expect(b.y).toBeGreaterThanOrEqual(card.y);
      expect(b.x + b.w).toBeLessThanOrEqual(card.x + card.w);
      expect(b.y + b.h).toBeLessThanOrEqual(card.y + card.h);
      expect(r.band.cardAt(b.x + 1, b.y + 1)).toBe(b.id);
      expect(r.band.cardAt(b.x + b.w - 1, b.y + b.h - 1)).toBe(b.id);
    }
    // and the band's own map agrees with what it drew
    expect(ui.keyMap[0]).toEqual({ kind: 'card', id: ui.cards[0]!.id, index: 0 });
    expect(ui.keyMap[1]).toEqual({ kind: 'card', id: ui.cards[1]!.id, index: 1 });
    expect(ui.keyMap[2]).toEqual({ kind: 'chip', complexity: 3 });
  });
});

describe('⛔ S195 N6 — DIGITS ARE INERT WHEREVER ANOTHER SURFACE OWNS THE KEYBOARD (enumerated)', () => {
  const inert = (r: Rig, why: string): void => {
    const e = keyDown(r, key('3'));
    expect(e.prevented, `${why}: not consumed`).toBe(false);
    expect(r.band.getUiPoints().selected, `${why}: nothing opened`).toBeNull();
    expect(r.castle.armed, `${why}: nothing armed`).toBeNull();
  };

  it('1 · a focused text field or form control (lobby chat / room code / name, the settings overlay\'s controls)', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const r = rig(3);
      doc.activeElement = { tagName };
      inert(r, tagName);
      doc.activeElement = null;
    }
  });

  it('2 · the codex / CONNECTION LOST / exit confirm — the modal cover the click gates ask', () => {
    const r = rig(3);
    r.modal.open = true;
    inert(r, 'modal cover');
    r.modal.open = false;
    keyDown(r, key('3'));
    expect(r.band.getUiPoints().selected, 'and live again once it closes').toBe(3);
  });

  it('3 · the NONET trial (its digits 1–6 are its own)', () => {
    const r = rig(3);
    r.w.sudoku = {} as never;
    inert(r, 'NONET');
  });

  it('4 · outside PLAYING — the POSTGAME match board (← → Tab paging) and the lobby draw no footer', () => {
    for (const state of ['POSTGAME', 'LOBBY', 'TITLE'] as const) {
      const r = rig(3);
      r.w.gameState = state;
      frame(r);
      inert(r, state);
    }
  });

  it('5 · the band collapsed (Alt / the arrow): nothing is drawn, so nothing is addressed', () => {
    const r = rig(3);
    r.band.toggleCollapsed();
    frame(r);
    expect(r.band.keyMacroTargets()).toEqual([]);
    inert(r, 'collapsed');
    r.band.toggleCollapsed();
    frame(r);
    keyDown(r, key('3'));
    expect(r.band.getUiPoints().selected, 'raised again → live').toBe(3);
  });

  it('6 · a benched seat (`isInputLocked`)', () => {
    const r = rig(3);
    const me = r.w.players.get(P0)!;
    (me as { benchedUntilTick: number }).benchedUntilTick = r.w.tick + 1000;
    inert(r, 'benched');
  });

  it('NEGATIVE: with none of the above, the same key is live', () => {
    const r = rig(3);
    keyDown(r, key('3'));
    expect(r.band.getUiPoints().selected).toBe(3);
  });
});
