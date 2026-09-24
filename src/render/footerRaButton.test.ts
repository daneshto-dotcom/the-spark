/**
 * SPARK — S188 P6 — **THE POWER OF RA SKILL BUTTON**, left of the tier chips.
 *
 * > *"it adds you a skill button … maybe to the left of the tier three tower because there's nothing
 * > there."* — owner
 *
 * The footer's two recorded defect shapes are what this pins: a surface that is drawn but not
 * hit-tested (a click plants a tower under it), and one that is hit-tested but not drawn (the
 * collapse's invisible-but-clickable trap). Both are asserted against the REAL `FooterBand` after a
 * real `sync`, in both collapse states, plus the pure layout against the castle porches and the
 * carry readout that shares this side of the band.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { CANVAS_HEIGHT, FOOTER_TOP_Y, GATHERER_DEPOSIT_OFFSET_Y, PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { zoneCount, type ZoneLayout } from '../state/zones.ts';
import { footerBandModel } from './footerBandModel.ts';
import {
  CARRY_PLATE_PAD,
  FooterBand,
  RA_ICON_COLLAPSED_SIZE,
  RA_ICON_SIZE,
  collapseTabRect,
  layoutCarryBill,
  layoutChips,
  layoutRaButton,
  raButtonCaption,
} from './footerBand.ts';
import { raAimPreview, setRaAimPreview } from './raAimPreview.ts';
import type { RaCastRefusal } from '../state/racial/powerOfRaRules.ts';

const P0 = asPlayerId(0);

function world(seats: number, mummyTookRa: boolean): World {
  const w = makeWorld(0x188);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: seats === 1 ? 'solo' : 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, s) => ({
      seat: s, color: PLAYER_COLORS[s]!, raceId: s === 0 ? ('mummies' as const) : undefined,
    })),
    botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1),
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: mummyTookRa ? 'racial' : 'hp' });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

function band(): FooterBand {
  const stage = new Container();
  return new FooterBand({ stage } as never, stage);
}

const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

afterEach(() => setRaAimPreview(null));

describe('S188 P6 — where the button sits', () => {
  const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

  it('⭐ immediately LEFT of the chip row, a chip gap away, on the chip row\'s own line', () => {
    const chips = layoutChips(footerBandModel(world(1, true)));
    const r = layoutRaButton(chips, false)!;
    const first = Math.min(...chips.map((c) => c.x));
    expect(r.x + r.w).toBeLessThan(first);
    expect(first - (r.x + r.w)).toBeLessThanOrEqual(20);
    expect(r.y).toBe(chips[0]!.y);
    expect(r.h).toBe(chips[0]!.h);
    expect(r.w).toBe(RA_ICON_SIZE);
    expect(r.h, 'S188 P11 - a SQUARE slot, the WoW icon').toBe(r.w);
    expect(r.y).toBeGreaterThanOrEqual(FOOTER_TOP_Y);
    expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it('⛔ clears every castle porch, and so does the carry readout pushed left of it', () => {
    for (const layout of LAYOUTS) {
      const w = world(zoneCount(layout), true);
      expect(w.layout).toBe(layout);
      const chips = layoutChips(footerBandModel(w));
      const r = layoutRaButton(chips, false)!;
      const carry = layoutCarryBill(chips, 6, r.x)!; // the widest bill any card can name
      const plateL = carry.left - CARRY_PLATE_PAD;
      const plateR = carry.right + CARRY_PLATE_PAD;
      expect(plateR, 'the readout never lands on the button').toBeLessThan(r.x);
      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = castleAnchor(seat, layout);
        const porch = { x: a.x, y: a.y + GATHERER_DEPOSIT_OFFSET_Y };
        const inR = porch.x >= r.x && porch.x <= r.x + r.w && porch.y >= r.y && porch.y <= r.y + r.h;
        expect(inR, `${layout} seat ${seat} porch under the button`).toBe(false);
        const inCarry = porch.x >= plateL && porch.x <= plateR && porch.y >= carry.y - 23 && porch.y <= carry.y + 23;
        expect(inCarry, `${layout} seat ${seat} porch under the shifted readout`).toBe(false);
      }
    }
  });

  it('without the button the carry readout sits exactly where it always did', () => {
    const chips = layoutChips(footerBandModel(world(1, true)));
    expect(layoutCarryBill(chips, 3, undefined)).toEqual(layoutCarryBill(chips, 3));
  });

  it('⭐ collapsed, it is a compact sun beside the tab — the tab\'s height, not overlapping it', () => {
    const r = layoutRaButton([], true)!;
    const tab = collapseTabRect(true);
    expect(r.compact).toBe(true);
    expect(r.w).toBe(RA_ICON_COLLAPSED_SIZE);
    expect(r.h).toBe(tab.h);
    expect(r.y + r.h).toBe(CANVAS_HEIGHT);
    expect(r.x + r.w).toBeLessThan(tab.x);
  });
});

describe('S188 P6 — the button SAYS why it is refused', () => {
  it.each<[RaCastRefusal | null, boolean, string]>([
    [null, false, ''], // S188 P11 - a ready WoW slot is its picture; its name shows on hover
    [null, true, 'AIMING'],
    ['NOT_FIGHT', false, 'FIGHT ONLY'],
    ['USED', false, 'USED'],
    ['BENCHED', false, 'BENCHED'],
    ['ELIMINATED', false, 'OUT'],
  ])('%s (aiming %s) → %s', (refusal, aiming, text) => {
    expect(raButtonCaption(refusal, aiming)).toBe(text);
  });
});

describe('S188 P6 — the REAL band: drawn ⇔ hit-tested, in both collapse states', () => {
  it('⭐ a seat holding the perk gets a button that is a CONTROL and an opaque SURFACE', () => {
    const w = world(1, true);
    const b = band();
    b.sync(w);
    const r = b.getUiPoints().ra!;
    expect(r, 'drawn').not.toBeNull();
    const p = mid(r);
    expect(b.isOverRaButton(p.x, p.y)).toBe(true);
    expect(b.isOverChip(p.x, p.y), 'the cursor offers it and the click router consumes it').toBe(true);
    expect(b.isOverBandSurface(p.x, p.y), 'nothing is planted under it').toBe(true);
  });

  it('⛔ a seat WITHOUT the perk has no button — nothing drawn, nothing hit-tested', () => {
    const w = world(1, false);
    const b = band();
    b.sync(w);
    expect(b.getUiPoints().ra).toBeNull();
    const would = layoutRaButton(layoutChips(footerBandModel(w)), false)!;
    const p = mid(would);
    expect(b.isOverRaButton(p.x, p.y)).toBe(false);
    expect(b.isOverChip(p.x, p.y), 'the empty stretch left of the chips stays board').toBe(false);
  });

  it('⛔ COLLAPSED: the full-size spot is released, and the compact button beside the tab is live', () => {
    const w = world(1, true);
    const b = band();
    b.sync(w);
    const full = b.getUiPoints().ra!;
    b.toggleCollapsed();
    b.sync(w);
    const compact = b.getUiPoints().ra!;
    expect(compact.compact).toBe(true);
    const f = mid(full);
    expect(b.isOverBandSurface(f.x, f.y), 'the full-size spot is board again').toBe(false);
    expect(b.isOverChip(f.x, f.y)).toBe(false);
    const c = mid(compact);
    expect(b.isOverChip(c.x, c.y)).toBe(true);
    expect(b.isOverBandSurface(c.x, c.y)).toBe(true);
    // …and the tab still works beside it.
    const t = mid(collapseTabRect(true));
    expect(b.isOverCollapseTab(t.x, t.y)).toBe(true);
  });

  it('⛔ outside a PLAYING match nothing of it is hit-testable', () => {
    const w = world(1, true);
    const b = band();
    b.sync(w);
    const p = mid(b.getUiPoints().ra!);
    w.gameState = 'WIN';
    b.sync(w);
    expect(b.isOverRaButton(p.x, p.y)).toBe(false);
  });

  it('⭐ a stale AIM is dropped once the cast is no longer legal (the fight ended)', () => {
    const w = world(1, true);
    const b = band();
    setRaAimPreview({ seat: P0, x: 500, y: 500 });
    b.sync(w);
    expect(raAimPreview(), 'legal: the aim stays').not.toBeNull();
    w.matchPhase = 'BUILD';
    b.sync(w);
    expect(raAimPreview(), 'refused: the aim is dropped').toBeNull();
  });
});

describe('S188 P11 — the slot shows WRATH OF RA\'s charges', () => {
  it('⭐ three pips\' worth for a WRATH seat, one spent per cast, refused only when all are gone', () => {
    const w = world(1, true);
    w.players.get(P0)!.draftPicks.push('hp', 'racial'); // level 5 general, level 10 WRATH
    w.waveNumber = 11;
    const b = band();
    b.sync(w);
    expect(b.getUiPoints().raSlot).toMatchObject({ charges: 3, left: 3, wrath: true, refusal: null });
    for (const left of [2, 1, 0]) {
      dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 500 + left, y: 400 });
      b.sync(w);
      expect(b.getUiPoints().raSlot?.left).toBe(left);
    }
    expect(b.getUiPoints().raSlot?.refusal, 'the slot dims only once all three are spent').toBe('USED');
  });

  it('a POWER-only seat shows one charge and no WRATH', () => {
    const w = world(1, true);
    const b = band();
    b.sync(w);
    expect(b.getUiPoints().raSlot).toMatchObject({ charges: 1, left: 1, wrath: false });
  });
});

/*
 * ⭐ S190 W-6 — **COLLAPSED, THE SLOT STILL SAYS WHY AND STILL COUNTS.** The compact square used to
 * return before its caption and skip its pips, so a refused slot was only a grey square and a WRATH
 * seat with one charge left looked exactly like one with three.
 */
describe('S190 W-6 — the COLLAPSED slot shows its reason and its charges', () => {
  function wrathWorld(): World {
    const w = world(1, true);
    w.players.get(P0)!.draftPicks.push('hp', 'racial'); // level 5 general, level 10 WRATH
    w.waveNumber = 11;
    return w;
  }
  function collapsed(w: World): FooterBand {
    const b = band();
    b.toggleCollapsed();
    b.sync(w);
    return b;
  }
  type Priv = { raOverlay: { getLocalBounds(): { minX: number; minY: number; maxX: number; maxY: number } }; raLabel: { visible: boolean; x: number; y: number; text: string } | null };

  it('⭐ a collapsed WRATH seat draws its three pips — INSIDE the square it hit-tests', () => {
    const w = wrathWorld();
    const b = collapsed(w);
    const ui = b.getUiPoints();
    expect(ui.ra!.compact).toBe(true);
    expect(ui.raPips).toBe(3);
    expect(ui.raSlot).toMatchObject({ charges: 3, left: 3 });
    // Everything on the overlay (the edge + the pips) stays within the square, give or take its stroke:
    // no pip pokes out onto ground `isOverRaButton` would not claim.
    const r = ui.ra!;
    const bb = (b as unknown as Priv).raOverlay.getLocalBounds();
    expect(bb.minX).toBeGreaterThanOrEqual(r.x - 2);
    expect(bb.maxX).toBeLessThanOrEqual(r.x + r.w + 2);
    expect(bb.minY).toBeGreaterThanOrEqual(r.y - 2);
    expect(bb.maxY).toBeLessThanOrEqual(r.y + r.h + 2);
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 500, y: 400 });
    b.sync(w);
    expect(b.getUiPoints()).toMatchObject({ raPips: 3, raSlot: { left: 2 } });
  });

  it('⭐ a refused collapsed slot SAYS why, left of the square, on its midline', () => {
    const w = wrathWorld();
    w.matchPhase = 'BUILD';
    const b = collapsed(w);
    const ui = b.getUiPoints();
    expect(ui.raCaption).toBe('FIGHT ONLY');
    const label = (b as unknown as Priv).raLabel!;
    expect(label.visible).toBe(true);
    expect(label.text).toBe('FIGHT ONLY');
    const r = ui.ra!;
    expect(label.x, 'to the LEFT of the square').toBeLessThan(r.x);
    expect(label.y).toBe(r.y + r.h / 2);
    // Text only, so it adds no surface: the ground under the words is still board.
    expect(b.isOverBandSurface(label.x - 10, label.y)).toBe(false);
  });

  it('⛔ a ready POWER-only collapsed slot draws no pips and says nothing', () => {
    const b = collapsed(world(1, true));
    expect(b.getUiPoints()).toMatchObject({ raPips: 0, raCaption: '' });
  });
});
