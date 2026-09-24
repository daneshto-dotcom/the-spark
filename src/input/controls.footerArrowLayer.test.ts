/**
 * SPARK — S188 (owner) — **THE COLLAPSE ARROW IS ONE LAYER BELOW AN OPEN TOWER MENU.**
 *
 * > *"the arrow that takes down the footer it actually reads more important than the tower above
 * > it. So if you open up tier five, six, or seven, and you click on the towers to build the towers
 * > where this arrow is, it actually brings down the menu. So you shouldn't do that. If you want to
 * > bring down the menu, you will click back on the number of the tier … then the down arrow would
 * > be active. So it'd be one layer below."*
 *
 * Driven through the REAL `Controls.onDown` and the REAL `FooterBand` after a real `sync`, so the
 * card the click hits is the card that was drawn. Every point is DERIVED from the live geometry —
 * the intersection of a drawn card with `collapseTabRect(false)` — never a literal, so a retuned
 * card or tab moves the test with it.
 *
 * ⚠ The harness stubs only what a headless run lacks: `window`, a 1:1 canvas, the UI sound cues, and
 * a fixed-advance text measurer (Pixi measures a card's sub-line through a canvas Node does not have
 * — the same stand-in `draftOverlay.test.ts` uses).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container } from 'pixi.js';
import { ALL_SPARK_TYPES, PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { bankAdd } from '../state/castleBank.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { Controls, type CastlePanelLike } from './controls.ts';
import { FooterBand, collapseTabRect, type FooterCardGeom } from '../render/footerBand.ts';

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

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const P0 = asPlayerId(0);

/** The owner named these three; every tier's menu covers the tab, and the extra tiers are swept below. */
const OWNER_TIERS = [5, 6, 7] as const;

type Rect = { x: number; y: number; w: number; h: number };
const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The intersection of two rectangles, or null when they do not overlap. */
function overlap(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** A castle panel that only remembers which tower is in hand — the part of it the footer's arm uses. */
function castleStub(): CastlePanelLike & { armed: GodlyId | null; ordered: GodlyId[] } {
  const s = {
    armed: null as GodlyId | null,
    ordered: [] as GodlyId[],
    isOpen: () => false,
    toggle() {},
    close() {},
    isOverPanel: () => false,
    armedBlueprint: () => s.armed,
    disarm() { s.armed = null; },
    armExternal(id: GodlyId | null) { s.armed = id; },
    requestShapesFor(_w: World, id: GodlyId) { s.ordered.push(id); },
  };
  return s;
}

function rig(): { w: World; c: Controls; band: FooterBand; castle: ReturnType<typeof castleStub>; canvas: { style: { cursor: string } } } {
  const w = makeWorld(0x188a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1],
  });
  // Rich enough that every card is AFFORDABLE, so a press on one ARMS it (the gesture he described).
  for (const t of ALL_SPARK_TYPES) for (let i = 0; i < 40; i++) bankAdd(w.castleBanks, w.localPlayerId, t);
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
  };
  const c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  const castle = castleStub();
  c.setFooterBand(band);
  c.setCastlePanel(castle);
  band.sync(w);
  return { w, c, band, castle, canvas };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: { x: number; y: number }, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: { x: number; y: number }, button = 0): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const move = (c: Controls, p: { x: number; y: number }): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });
const tap = (c: Controls, p: { x: number; y: number }): void => {
  down(c, p);
  up(c, p);
};

/** Open `tier` the way the player does — a press on its chip — and redraw. */
function openTier(r: ReturnType<typeof rig>, tier: number): void {
  const chip = r.band.getUiPoints().chips.find((k) => k.complexity === tier);
  expect(chip, `tier ${tier} has a chip on this board`).toBeDefined();
  tap(r.c, mid(chip!));
  r.band.sync(r.w);
  expect(r.band.selection()).toBe(tier);
}

/** Every drawn card that lies over the expanded tab, with the centre of the overlap. */
function cardsOverTab(band: FooterBand): Array<{ card: FooterCardGeom; at: { x: number; y: number } }> {
  const tab = collapseTabRect(false);
  const out: Array<{ card: FooterCardGeom; at: { x: number; y: number } }> = [];
  for (const card of band.getUiPoints().cards) {
    const o = overlap(card, tab);
    if (o !== null) out.push({ card, at: mid(o) });
  }
  return out;
}

describe('⛔⛔ S188 — with a tier menu open, a card over the arrow WINS the click', () => {
  it.each(OWNER_TIERS)('tier %i: pressing a card where it covers the arrow ARMS that tower and leaves the footer up', (tier) => {
    const r = rig();
    openTier(r, tier);
    const hits = cardsOverTab(r.band);
    expect(hits.length, `tier ${tier}'s menu covers the arrow (anti-vacuity)`).toBeGreaterThan(0);
    for (const { card, at } of hits) {
      expect(card.enabled, 'the rig banks enough that the card arms rather than orders').toBe(true);
      tap(r.c, at);
      r.band.sync(r.w);
      expect(r.band.isCollapsed(), `the ${card.id} card, not the arrow under it`).toBe(false);
      expect(r.castle.armed, `the press armed ${card.id}`).toBe(card.id);
      expect(r.band.selection(), 'and the menu is still open').toBe(tier);
    }
  });

  it.each(OWNER_TIERS)('tier %i: the cursor, the click and the placement gate agree about whose pixel it is', (tier) => {
    const r = rig();
    openTier(r, tier);
    for (const { card, at } of cardsOverTab(r.band)) {
      expect(r.band.isOverCollapseTab(at.x, at.y), 'the arrow does not claim a covered pixel').toBe(false);
      expect(r.band.cardAt(at.x, at.y)).toBe(card.id);
      expect(r.band.isOverChip(at.x, at.y), 'the cursor still promises a control — the card').toBe(true);
      expect(r.band.isOverBandSurface(at.x, at.y), 'and nothing is planted under it').toBe(true);
      move(r.c, at);
      expect(r.canvas.style.cursor).toBe('pointer');
    }
  });

  it('⭐ the same holds for EVERY tier on the bar, not only the three he named', () => {
    const tiers = rig().band.getUiPoints().chips.map((k) => k.complexity);
    expect(tiers.length).toBeGreaterThanOrEqual(OWNER_TIERS.length);
    for (const tier of tiers) {
      const r = rig();
      openTier(r, tier);
      const hits = cardsOverTab(r.band);
      expect(hits.length, `tier ${tier}`).toBeGreaterThan(0);
      for (const { card, at } of hits) {
        tap(r.c, at);
        r.band.sync(r.w);
        expect(r.band.isCollapsed(), `tier ${tier}, ${card.id}`).toBe(false);
        expect(r.castle.armed).toBe(card.id);
      }
    }
  });
});

describe('⭐ the arrow is still the arrow wherever no menu covers it', () => {
  it.each(OWNER_TIERS)('tier %i: with NO menu open, the very same point collapses the footer', (tier) => {
    // The point is measured on a menu-open rig, then pressed on a fresh one with no menu open.
    const probe = rig();
    openTier(probe, tier);
    const points = cardsOverTab(probe.band).map((h) => h.at);
    expect(points.length).toBeGreaterThan(0);
    for (const at of points) {
      const r = rig();
      expect(r.band.selection(), 'no menu open').toBeNull();
      tap(r.c, at);
      expect(r.band.isCollapsed(), 'the arrow takes it').toBe(true);
      expect(r.castle.armed, 'and nothing was armed').toBeNull();
    }
  });

  it.each(OWNER_TIERS)('tier %i: re-clicking the tier chip closes the menu, and then the arrow works — "one layer below"', (tier) => {
    const r = rig();
    openTier(r, tier);
    const at = cardsOverTab(r.band)[0]!.at;
    const chip = r.band.getUiPoints().chips.find((k) => k.complexity === tier)!;
    tap(r.c, mid(chip)); // his "click on six again"
    r.band.sync(r.w);
    expect(r.band.selection(), 'the chip closed its own menu').toBeNull();
    expect(r.band.getUiPoints().cards).toHaveLength(0);
    tap(r.c, at);
    expect(r.band.isCollapsed(), 'the arrow is live again').toBe(true);
    expect(r.castle.armed).toBeNull();
  });

  it('⚠ a two-card tier leaves the SEAM between its cards showing the arrow, and there it is the arrow', () => {
    /*
     * The literal layer rule: the tab answers exactly where no card is drawn over it. Tiers 5 and 7
     * are two cards with a CARD_GAP seam, and the seam sits inside the tab — the chevron's tip shows
     * through it, and a press there is the tab's. Pinned so the choice is visible: if the owner would
     * rather the arrow be dead for as long as ANY menu is open, this is the test to flip.
     */
    const r = rig();
    const tab = collapseTabRect(false);
    let seams = 0;
    for (const tier of r.band.getUiPoints().chips.map((k) => k.complexity)) {
      const probe = rig();
      openTier(probe, tier);
      const cards = [...probe.band.getUiPoints().cards].sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < cards.length; i++) {
        const seam = { x: (cards[i]!.x + cards[i]!.w + cards[i + 1]!.x) / 2, y: tab.y + tab.h / 2 };
        if (seam.x <= tab.x || seam.x >= tab.x + tab.w) continue;
        seams++;
        expect(probe.band.cardAt(seam.x, seam.y), `tier ${tier}: the seam is not a card`).toBeNull();
        expect(probe.band.isOverCollapseTab(seam.x, seam.y), `tier ${tier}: the seam shows the tab`).toBe(true);
        tap(probe.c, seam);
        expect(probe.band.isCollapsed(), `tier ${tier}: a press on the seam is the tab's`).toBe(true);
      }
    }
    expect(seams, 'tiers 5 and 7 are two-card menus today (anti-vacuity)').toBeGreaterThan(0);
  });

  it('⛔ collapsed WITH a menu still selected, the way back works and the stale cards act nowhere', () => {
    /*
     * A collapsed `sync` returns before `this.cards` is rebuilt, so the last open menu's cards are
     * still in the array. Reachable: open a two-card tier and press its seam. The collapsed tab must
     * not consult those cards, and nothing may be armed from where they used to be drawn.
     */
    const r = rig();
    openTier(r, 5);
    const [a, b] = [...r.band.getUiPoints().cards].sort((p, q) => p.x - q.x);
    const tab = collapseTabRect(false);
    const seam = { x: (a!.x + a!.w + b!.x) / 2, y: tab.y + tab.h / 2 };
    tap(r.c, seam);
    r.band.sync(r.w);
    expect(r.band.isCollapsed()).toBe(true);
    expect(r.band.selection(), 'the selection survives the collapse').toBe(5);

    tap(r.c, mid(a!)); // where a card was drawn before the collapse
    expect(r.castle.armed, 'a card that is not drawn arms nothing').toBeNull();

    const back = collapseTabRect(true);
    expect(r.band.isOverCollapseTab(back.x + back.w / 2, back.y + back.h / 2)).toBe(true);
    tap(r.c, mid(back));
    expect(r.band.isCollapsed(), 'the way back still works').toBe(false);
  });
});
