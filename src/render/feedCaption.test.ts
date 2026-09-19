/**
 * SPARK — S183: **THE OWNER'S FEED CAPTION, BESIDE THE CHIP AND INSIDE THE CARD.**
 *
 * > *"it is not in a good place. It needs to be to the left of the circle. Instead now it's like in
 * > the middle of the frame, so that's not good."* — owner, S183, found while playing
 *
 * The S181 caption had TWO defects in its one line (`characterSheet.ts`, the old
 * `this.textCentred(hint, x + w / 2, top - 12, 9, DIM)`):
 *
 * 1. it rose **12px into an 8px gap** (`ACT_ROW_GAP`), so in BUILD phase it landed 4px INSIDE the
 *    FIX/SCRAP button — the overlap in his screenshot;
 * 2. it was x-anchored to the **card centre** rather than to the chip — his actual complaint.
 *
 * ⛔ **A PURE NUDGE WOULD HAVE OVERFLOWED FIVE OF THE SIX RACES.** Beside the chip the caption no
 * longer has the card's full width: it has `SHEET_W − 2·PAD − gap − FEED_BTN`. At the old wording
 * (`FEED A SHAPE TO BUILD MORE …`) only `BATS` fitted; `HOUNDS` — the owner's own race — missed by
 * 4px and `SOULEATERS` by 26. The wording had to shrink WITH the move, and this file is what stops
 * the next unit name silently re-breaking it.
 *
 * ## ⭐ WHY THE BUDGET IS NEVER TYPED OUT HERE
 *
 * S181's lesson, quoted in CLAUDE.md: *"derive the literal from the constant or the re-pin happens a
 * third time."* So the inner band is not re-stated as `236 − 24`; it is **read back off
 * `layoutSheetActions` itself** by laying out a full-width button and measuring where it lands.
 * Change `SHEET_W` or the padding and this test still measures the truth. And the caption width
 * comes from `feedCaptionWidthPx`, the same function the renderer feeds into the layout — so the
 * test cannot pass with an arithmetic the card does not use.
 *
 * ## ⛔ AND IT IS THE REAL STRINGS, FOR ALL SIX RACES
 *
 * Not a sample and not a hand-copied table: `ALL_RACES` → `RACE_TOWER_IDS` → `feedHintFor`. A
 * seventh race, or a renamed unit, is covered the day it lands.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_RACES } from '../state/races.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import {
  FEED_BTN,
  FEED_CAPTION_FONT,
  FEED_CAPTION_GAP,
  feedCaptionLines,
  feedCaptionMaxWidthPx,
  feedCaptionWidthPx,
  feedHintFor,
  layoutSheetActions,
  MONO_EM_RATIO,
  SHEET_W,
  type SheetActionSlot,
} from './characterSheetModel.ts';

const RECT = { x: 100, y: 100, w: SHEET_W, h: 300 };

function btn(kind: string, over: Partial<SheetActionSlot> = {}): SheetActionSlot {
  return { kind, label: kind, caption: '', enabled: true, x: 0, y: 0, w: 0, h: 0, ...over };
}

/**
 * The card's inner band, MEASURED rather than restated: a lone wide button spans exactly it, so the
 * layout function itself tells us where `PAD` put the left and right edges.
 */
function innerBand(): { left: number; right: number } {
  const [only] = layoutSheetActions([btn('SCRAP')], RECT);
  if (only === undefined) throw new Error('a lone wide button must lay out');
  return { left: only.x, right: only.x + only.w };
}

/** BUILD phase: FIX + SCRAP on the wide row, one race chip beneath, caption beside the chip. */
function raceCard(hint: string): {
  wideBottom: number;
  chip: SheetActionSlot;
  captionRight: number;
  captionLeft: number;
} {
  const captionPx = feedCaptionWidthPx(hint);
  const out = layoutSheetActions(
    [btn('FIX'), btn('SCRAP'), btn('FEED', { sparkType: 0 })],
    RECT,
    captionPx,
  );
  const wide = out.filter((b) => b.kind !== 'FEED');
  const chip = out.find((b) => b.kind === 'FEED');
  if (chip === undefined) throw new Error('the race tower must lay out exactly one chip');
  const captionRight = chip.x - FEED_CAPTION_GAP;
  return {
    wideBottom: Math.max(...wide.map((b) => b.y + b.h)),
    chip,
    captionRight,
    captionLeft: captionRight - captionPx,
  };
}

describe('S183 — the feed caption fits BESIDE the chip, for every race', () => {
  it('every race has a caption at all (and the enumeration is not empty)', () => {
    expect(ALL_RACES.length).toBe(6);
    for (const race of ALL_RACES) {
      expect(feedHintFor(RACE_TOWER_IDS[race])).not.toBeNull();
    }
  });

  it('⛔ the caption LEFT edge clears the card padding — all six races, measured', () => {
    const { left } = innerBand();
    for (const race of ALL_RACES) {
      const hint = feedHintFor(RACE_TOWER_IDS[race]);
      expect(hint).not.toBeNull();
      const card = raceCard(hint as string);
      expect(
        card.captionLeft,
        `${race}: "${hint}" starts at ${card.captionLeft}, inner band starts at ${left}`,
      ).toBeGreaterThanOrEqual(left);
    }
  });

  it('⛔ the chip RIGHT edge clears the card padding — the caption pushed it right, not out', () => {
    const { right } = innerBand();
    for (const race of ALL_RACES) {
      const card = raceCard(feedHintFor(RACE_TOWER_IDS[race]) as string);
      expect(card.chip.x + card.chip.w, `${race}: chip overflows the card`).toBeLessThanOrEqual(right);
    }
  });

  it('the budget is exactly the inner band less the gap and the chip — no slack, no literal', () => {
    const { left, right } = innerBand();
    expect(feedCaptionMaxWidthPx()).toBe(right - left - FEED_CAPTION_GAP - FEED_BTN);
  });

  it('every race caption is within the published budget, and the budget is not vacuous', () => {
    const budget = feedCaptionMaxWidthPx();
    expect(budget).toBeGreaterThan(0);
    for (const race of ALL_RACES) {
      const hint = feedHintFor(RACE_TOWER_IDS[race]) as string;
      expect(feedCaptionWidthPx(hint), `${race}: "${hint}"`).toBeLessThanOrEqual(budget);
    }
  });

  /*
   * ⚠ S183 — THIS WITNESS WAS RE-POINTED, AND THE REASON MATTERS MORE THAN THE TEST.
   *
   * It used to assert that the owner's FULL wording overflowed for five of six races, which was the
   * justification for cutting `A SHAPE` out of it. The measurement was right and the conclusion was
   * wrong: he ruled *"you can make it divided to two lines … and just make it fit the box"*, and a
   * wrapped caption clears the budget with 60px to spare. So the witness now pins the thing that is
   * actually load-bearing — that the caption needs the WRAP, i.e. that ONE line genuinely does not
   * fit — rather than the compromise that was reached for by mistake.
   */
  it('⛔ ONE line genuinely does not fit for five of six — this is why it wraps', () => {
    const budget = feedCaptionMaxWidthPx();
    const oneLine = (hint: string): number =>
      Math.ceil(hint.length * FEED_CAPTION_FONT * MONO_EM_RATIO);
    const overflowing = ALL_RACES.filter(
      (race) => oneLine(feedHintFor(RACE_TOWER_IDS[race]) as string) > budget,
    );
    expect(overflowing.length).toBe(5);
    expect(overflowing).toContain('zombies'); // his hound — over by 4px, the one he reported
  });

  it('⭐ and WRAPPED, every race clears it — the owner keeps his whole sentence', () => {
    const budget = feedCaptionMaxWidthPx();
    for (const race of ALL_RACES) {
      const hint = feedHintFor(RACE_TOWER_IDS[race]) as string;
      expect(hint, `${race} must keep the owner's wording`).toContain('FEED A SHAPE TO BUILD MORE');
      const [a, b] = feedCaptionLines(hint);
      expect(`${a} ${b}`, `${race}: wrapping must not lose a word`).toBe(hint);
      expect(feedCaptionWidthPx(hint), `${race}: "${a}" / "${b}"`).toBeLessThanOrEqual(budget);
    }
  });

  it('⛔ every race gets EXACTLY two lines, so the block is the same shape on all six', () => {
    for (const race of ALL_RACES) {
      const [a, b] = feedCaptionLines(feedHintFor(RACE_TOWER_IDS[race]) as string);
      expect(a.length, `${race} line 1`).toBeGreaterThan(0);
      expect(b.length, `${race} line 2`).toBeGreaterThan(0);
    }
  });

  it('the width formula is the monospace one over the WIDEST line, not the whole string', () => {
    expect(feedCaptionWidthPx('AAAAA')).toBe(Math.ceil(5 * FEED_CAPTION_FONT * MONO_EM_RATIO));
    // Two words, balanced: the block is as wide as one of them, not both plus the space.
    expect(feedCaptionWidthPx('AAAAA BBBBB')).toBe(Math.ceil(5 * FEED_CAPTION_FONT * MONO_EM_RATIO));
  });
});

describe('S183 — the caption is LEFT of the chip, and OFF the FIX/SCRAP row', () => {
  it('⛔ it no longer sits at the card centre — that was the owner report', () => {
    const centre = RECT.x + RECT.w / 2;
    for (const race of ALL_RACES) {
      const card = raceCard(feedHintFor(RACE_TOWER_IDS[race]) as string);
      const captionCentre = (card.captionLeft + card.captionRight) / 2;
      expect(captionCentre, `${race}: caption still straddles the card centre`).toBeLessThan(centre);
      // …and strictly left of the chip, with the gap intact.
      expect(card.captionRight).toBeLessThanOrEqual(card.chip.x - FEED_CAPTION_GAP);
    }
  });

  it('⛔ the caption band does not intersect the wide FIX/SCRAP row', () => {
    for (const race of ALL_RACES) {
      const card = raceCard(feedHintFor(RACE_TOWER_IDS[race]) as string);
      // The caption is vertically centred on the chip, so its band is the chip's own row.
      expect(card.chip.y, `${race}: the caption row overlaps FIX/SCRAP`).toBeGreaterThanOrEqual(
        card.wideBottom,
      );
    }
  });

  it('⚠ the OLD anchor really did land INSIDE the FIX button — the regression witness', () => {
    const card = raceCard(feedHintFor(RACE_TOWER_IDS.zombies) as string);
    // S181 drew the caption at `top - 12` where `top` is the chip row and only ACT_ROW_GAP (8)
    // separates the rows. 12 > 8, so the text's top was 4px above the chip row's top — inside the
    // button above it.
    expect(card.chip.y - 12).toBeLessThan(card.wideBottom);
  });

  it('the caption+gap+chip assembly is CENTRED on the card, so the row still reads balanced', () => {
    for (const race of ALL_RACES) {
      const card = raceCard(feedHintFor(RACE_TOWER_IDS[race]) as string);
      const mid = (card.captionLeft + (card.chip.x + card.chip.w)) / 2;
      // ⚠ WITHIN HALF A PIXEL, not exact: `layoutSheetActions` rounds the chip to a whole pixel so
      // its 1.5 px stroke stays crisp, and an odd caption width therefore shifts the midpoint by up
      // to 0.5. Asserting exactness here would be asserting the rounding away.
      expect(Math.abs(mid - (RECT.x + RECT.w / 2)), `${race}: the assembly is off-centre`)
        .toBeLessThanOrEqual(0.5);
    }
  });
});

describe('S183 — the goblin tower is untouched (it has no caption, deliberately)', () => {
  it('feedHintFor returns null for it, so no caption width enters the layout', () => {
    expect(feedHintFor('goblinTower')).toBeNull();
    expect(feedHintFor(null)).toBeNull();
  });

  it('⛔ its six-chip strip is still centred — a zero caption must change NOTHING', () => {
    const six = Array.from({ length: 6 }, () => btn('FEED'));
    const before = layoutSheetActions(six, RECT);
    const after = layoutSheetActions(six, RECT, 0);
    expect(after).toEqual(before);
    const left = Math.min(...before.map((b) => b.x));
    const right = Math.max(...before.map((b) => b.x + b.w));
    expect((left + right) / 2).toBeCloseTo(RECT.x + RECT.w / 2, 5);
  });
});

describe('S183 — ⛔ THE CALL SITE (existence only; the layout tests above are the reach)', () => {
  const sheet = readFileSync('src/render/characterSheet.ts', 'utf-8');

  it('the card feeds the caption width INTO the layout, so the hit test moves with the glyph', () => {
    expect(sheet).toMatch(/layoutSheetActions\(v\.actions\.buttons,\s*v\.rect,\s*captionPx\)/);
    expect(sheet).toContain('feedCaptionWidthPx(hint)');
  });

  it('⛔ the old card-centre draw is GONE, not merely superseded', () => {
    expect(sheet).not.toContain('this.textCentred(hint');
    expect(sheet).toContain('this.textRightMiddle(');
  });
});
