/**
 * SPARK — S154 P1 (owner R80): the SHAPE STRIP's geometry.
 *
 * Owner, third time of asking: the palette and the order queue must be *"always be visible on the
 * right side of the footer (after tier 8)"*. This file pins the two things that can go wrong with a
 * control placed in that specific stretch of canvas:
 *
 *  1. it must not sit on a **castle porch** — the `QUADRANTS_4P` seat-2 porch is at (1790, 1024),
 *     INSIDE the footer band, and a control drawn over it makes that seat's deposit point
 *     unclickable. `footerBand.test.ts` has asserted this for the CHIPS since S149 P4, and its
 *     sweep iterated `chips` only — so a strip that collided would have shipped green;
 *  2. it must be **derived from the live chip row**, not placed at a fixed x, or the day a sixth
 *     recipe complexity enters the registry `layoutChips` re-centres the row and the new chip is
 *     drawn straight through the strip.
 *
 * Pure geometry, no Pixi — the same headless discipline `layoutChips` and `progressBarFractions`
 * already follow.
 */

import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_TOP_Y,
  GATHERER_DEPOSIT_OFFSET_Y,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { zoneCount, type ZoneLayout } from '../state/zones.ts';
import { footerBandModel } from './footerBandModel.ts';
import { layoutCards, layoutChips, legendAnchor, type FooterChipGeom } from './footerBand.ts';
import {
  STRIP_BTN,
  STRIP_CHIP_H,
  STRIP_CHIP_W,
  STRIP_MAX_CHIPS,
  STRIP_PALETTE_TYPES,
  coalesceOrders,
  hitStripRect,
  paletteRowWidth,
  queueRowWidth,
  shapeStripLayout,
  stripLeft,
  stripMaxWidth,
  stripRowTops,
} from './shapeStrip.ts';

function playingWorld(seats = 1): World {
  const w = makeWorld(0);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: Array.from({ length: seats - 1 }, (_, i) => i + 1),
  });
  return w;
}

const liveChips = (seats = 1): FooterChipGeom[] => layoutChips(footerBandModel(playingWorld(seats)));

/** A synthetic chip row of `n` tiers, laid out by the REAL function so the maths cannot fork. */
function chipsForTierCount(n: number): FooterChipGeom[] {
  return layoutChips(
    Array.from({ length: n }, (_, i) => ({
      complexity: 4 + i,
      total: 1,
      affordable: 0,
      enabled: false,
    })),
  );
}

const FULL_QUEUE: SparkType[] = [...STRIP_PALETTE_TYPES];

describe('S154 P1 — the strip is DERIVED from the chip row, never placed at a fixed x', () => {
  it('sits to the RIGHT of the last tier chip, with clear air between them', () => {
    const chips = liveChips();
    const rightmost = Math.max(...chips.map((c) => c.x + c.w));
    const { palette } = shapeStripLayout(chips, []);
    expect(palette.length).toBe(STRIP_PALETTE_TYPES.length);
    expect(palette[0].x).toBeGreaterThan(rightmost);
  });

  it('⛔ MARCHES RIGHT when a sixth tier appears — the defect a hardcoded x would ship', () => {
    // layoutChips re-centres the whole row, so its right edge moves right by (CHIP_W+CHIP_GAP)/2
    // = 38 px per added tier. A strip pinned to today's five chips would be drawn through the sixth.
    const five = stripLeft(chipsForTierCount(5));
    const six = stripLeft(chipsForTierCount(6));
    const seven = stripLeft(chipsForTierCount(7));
    expect(six).toBeGreaterThan(five);
    expect(seven).toBeGreaterThan(six);
    expect(six - five).toBeCloseTo(38, 6);
  });

  it('never overlaps the chips at ANY tier count from 1 to 12', () => {
    for (let n = 1; n <= 12; n++) {
      const chips = chipsForTierCount(n);
      const { palette, queue } = shapeStripLayout(chips, FULL_QUEUE);
      for (const c of chips) {
        for (const r of [...palette, ...queue]) {
          const disjoint = r.x >= c.x + c.w || c.x >= r.x + r.w || r.y >= c.y + c.h || c.y >= r.y + r.h;
          expect(disjoint, `tier ${n}: chip ${c.complexity} overlaps a strip box`).toBe(true);
        }
      }
    }
  });

  it('leaves the LEGEND alone — it anchors off the LEFT end of the row, the strip off the right', () => {
    // The banked plan for this priority warned that the legend "will collide and must move". It
    // will not: legendAnchor returns `leftmost - LEGEND_GAP - LEGEND_WIDTH + …`. Asserted rather
    // than argued, so the claim cannot rot.
    const chips = liveChips();
    const legend = legendAnchor(chips);
    const { palette } = shapeStripLayout(chips, FULL_QUEUE);
    expect(legend.x).toBeLessThan(Math.min(...chips.map((c) => c.x)));
    expect(palette[0].x).toBeGreaterThan(legend.x);
  });
});

describe('S154 P1 — ⛔ THE STRIP CLEARS THE CASTLE PORCHES (the assertion the chip sweep could not make)', () => {
  const LAYOUTS: readonly ZoneLayout[] = ['PITCH_2P', 'QUADRANTS_4P'];

  it('the collision is real — the bottom quadrant porches ARE inside the footer band', () => {
    // Anti-vacuity, mirroring footerBand.test.ts: if the porches ever move out of the band this
    // fails and the whole clearance concern can be retired rather than kept forever on faith.
    for (const seat of [2, 3]) {
      const a = castleAnchor(seat, 'QUADRANTS_4P');
      expect(a.y + GATHERER_DEPOSIT_OFFSET_Y).toBeGreaterThan(FOOTER_TOP_Y);
    }
  });

  for (const layout of LAYOUTS) {
    it(`${layout} — no palette button or queue chip covers any castle porch`, () => {
      // A FULL queue is the widest the strip can ever be, so this is the worst case, not a sample.
      const chips = liveChips(zoneCount(layout));
      const { palette, queue } = shapeStripLayout(chips, FULL_QUEUE);
      expect(palette.length + queue.length).toBeGreaterThan(0); // anti-vacuity: there IS a strip

      for (let seat = 0; seat < zoneCount(layout); seat++) {
        const a = castleAnchor(seat, layout);
        const porch = { x: a.x, y: a.y + GATHERER_DEPOSIT_OFFSET_Y };
        for (const r of [...palette, ...queue]) {
          expect(
            hitStripRect(r, porch.x, porch.y),
            `${layout} seat ${seat} porch (${porch.x},${porch.y}) is under a strip box`,
          ).toBe(false);
        }
      }
    });
  }

  it('still clears the seat-2 porch with THREE more tiers than exist today', () => {
    // The strip marches right as tiers are added, so the clearance has a horizon. Pin it: the
    // budget must survive foreseeable growth, and if it ever stops doing so this fails while the
    // recipe is being added rather than after a player reports a dead porch.
    const porchX = castleAnchor(2, 'QUADRANTS_4P').x;
    for (let n = 5; n <= 8; n++) {
      const right = stripLeft(chipsForTierCount(n)) + stripMaxWidth();
      expect(right, `${n} tiers`).toBeLessThan(porchX);
    }
  });

  it('the whole strip sits inside the footer band, on the board', () => {
    const { palette, queue } = shapeStripLayout(liveChips(), FULL_QUEUE);
    for (const r of [...palette, ...queue]) {
      expect(r.y).toBeGreaterThanOrEqual(FOOTER_TOP_Y);
      expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
    }
  });

  it('⛔ the OPEN TOWER-CARD MENU clears the strip — measured at 2 px, so it is pinned', () => {
    /*
     * MEASURED LIVE this session, in the running game: with tier 8 open, the single voltkin card
     * occupies y 941..1003 and the strip's palette row starts at y 1005. Two pixels.
     *
     * Today that margin is not even load-bearing, because the card row is centred on the board
     * (x 847..1073) while the strip is far to its right (x 1177..1382) — they miss each other
     * horizontally as well. But `layoutCards` widens the row as structures are added at one
     * complexity: at FIVE cards it spans x 375..1545 and does reach into the strip's column, at
     * which point those 2 px of vertical clearance become the only thing keeping the menu off the
     * palette. That is exactly the "two independently-correct components drawn through each other"
     * class `hudLayout.test.ts` exists to prevent, so it is asserted rather than left to luck.
     */
    const w = playingWorld();
    const chips = liveChips();
    const { palette } = shapeStripLayout(chips, FULL_QUEUE);
    const stripTop = Math.min(...palette.map((b) => b.y));
    for (const chip of chips) {
      const cards = layoutCards(w, chip.complexity, chip.y);
      for (const card of cards) {
        expect(
          card.y + card.h,
          `the tier-${chip.complexity} card menu reaches the shape strip`,
        ).toBeLessThanOrEqual(stripTop);
      }
    }
  });

  it('clears the controls help line, which shares the bottom strip', () => {
    // HELP_LINE_X=10, HELP_LINE_Y=CANVAS_HEIGHT-22, measured width 581 → it owns x 10..591. The
    // strip lives far to the right of that; asserted because both are in the same 84 px band.
    const HELP_RIGHT = 10 + 581;
    const { palette, queue } = shapeStripLayout(liveChips(), FULL_QUEUE);
    for (const r of [...palette, ...queue]) expect(r.x).toBeGreaterThan(HELP_RIGHT);
  });
});

describe('S154 P1 — the two rows', () => {
  it('the palette is above the queue and they do not overlap', () => {
    const { paletteY, queueY } = stripRowTops();
    expect(queueY).toBeGreaterThanOrEqual(paletteY + STRIP_BTN);
  });

  it('one palette button per primitive type, in enum order', () => {
    const { palette } = shapeStripLayout(liveChips(), []);
    expect(palette.length).toBe(6);
    expect(palette.map((b) => b.type)).toEqual([...STRIP_PALETTE_TYPES]);
  });

  it('the palette does NOT reflow as the queue changes — the button stays under the finger', () => {
    const chips = liveChips();
    const empty = shapeStripLayout(chips, []).palette;
    const full = shapeStripLayout(chips, FULL_QUEUE).palette;
    expect(full).toEqual(empty);
  });

  it('the queue is LEFT-ALIGNED, so chips grow rightward instead of dancing sideways', () => {
    // The panel version centred the row on a fixed-width plate. Centring here would drag the
    // "next" chip out from under the player's finger every time a chip appeared or was cancelled.
    const chips = liveChips();
    const one = shapeStripLayout(chips, [SparkType.Dot]).queue;
    const three = shapeStripLayout(chips, [SparkType.Dot, SparkType.Line, SparkType.Triangle]).queue;
    expect(one[0].x).toBe(three[0].x);
  });

  it('marks the LEFTMOST chip as next, and only that one', () => {
    const { queue } = shapeStripLayout(liveChips(), [SparkType.Dot, SparkType.Line]);
    expect(queue.map((c) => c.next)).toEqual([true, false]);
  });

  it('shows at most STRIP_MAX_CHIPS chips however long the queue gets', () => {
    const long: SparkType[] = [];
    for (let i = 0; i < 40; i++) long.push(STRIP_PALETTE_TYPES[i % STRIP_PALETTE_TYPES.length]);
    const { queue } = shapeStripLayout(liveChips(), long);
    expect(queue.length).toBeLessThanOrEqual(STRIP_MAX_CHIPS);
  });

  it('row widths are what the clearance budget assumes', () => {
    // The porch budget above is spent against these two numbers; if a button is widened on taste
    // this fails next to the comment explaining why widening needs a fresh measurement.
    expect(paletteRowWidth()).toBe(6 * STRIP_BTN + 5 * 5);
    expect(queueRowWidth(STRIP_MAX_CHIPS)).toBe(6 * STRIP_CHIP_W + 5 * 5);
    expect(queueRowWidth(0)).toBe(0);
    expect(stripMaxWidth()).toBe(Math.max(paletteRowWidth(), queueRowWidth(STRIP_MAX_CHIPS)));
    expect(STRIP_CHIP_H).toBe(30);
  });

  it('draws nothing at all when there are no chips to anchor to', () => {
    const { palette, queue } = shapeStripLayout([], FULL_QUEUE);
    expect(palette).toEqual([]);
    expect(queue).toEqual([]);
  });
});

describe('S154 P1 — coalesceOrders moved with the display, and its rule did not change', () => {
  it('collapses repeats into one chip with a count, in FIRST-APPEARANCE order', () => {
    expect(coalesceOrders([SparkType.Line, SparkType.Dot, SparkType.Line])).toEqual([
      { type: SparkType.Line, count: 2 },
      { type: SparkType.Dot, count: 1 },
    ]);
  });

  it('an empty queue coalesces to nothing', () => {
    expect(coalesceOrders([])).toEqual([]);
  });
});
