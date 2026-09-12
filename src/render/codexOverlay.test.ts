/**
 * SPARK — S173 P5: the CODEX overlay's scroll math, and the tab set it scrolls.
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL. `main.ts` records, at the tier-9 unlock hook, that *"there is no
 * codexOverlay.test.ts, so nothing would have reported it"* about a codex bug that shipped. This is
 * that file. It cannot drive Pixi in the node env, so the overlay's arithmetic is exported from
 * codexOverlay.ts as pure functions and checked HERE — the row count, the content extent, the
 * clamp, the wheel conversion and the thumb. What that buys: a future tower tier that pushes the
 * grid past the viewport is a NUMBER a test can assert on, not something a human has to notice on
 * a screenshot, which is precisely how the owner found the bug this priority fixes.
 *
 * The owner's two rulings under test:
 *   (a) *"remove the whole godly combos"* — TWO tabs, and the type says so.
 *   (b) *"the towers and structures… it's not scrollable. I can't scroll down and keep seeing all
 *       the towers, which is bad."* — and, in the same breath, *"Combos, they're all fine. You can
 *       see all of them."* So COMBOS must still have ZERO travel: the fix must not move it.
 */

import { describe, expect, it } from 'vitest';
import {
  clampScroll,
  gridContentBottom,
  gridRowCount,
  scrollExtent,
  scrollbarThumb,
  wheelScrollDelta,
  type CodexTabKey,
} from './codexOverlay.ts';
import { CANVAS_HEIGHT } from '../constants.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';

// The tile anatomy the overlay lays out with. Mirrored here rather than exported, because these are
// private layout constants; the numbers below are the ones the file itself uses.
const TILE_H = 320;
const TILE_GAP = 28;
const COMBO_TILE_H = 132;
const COMBO_GAP = 24;
const COMBO_COLS = 5;
const TOWER_COLS = 4;
/** The viewport floor: CANVAS_HEIGHT - 44, i.e. just above the footer line at y = 1054. */
const VIEW_BOTTOM = CANVAS_HEIGHT - 44;

describe('S173 P5 — the codex has TWO tabs (owner: "remove the whole godly combos")', () => {
  it('CodexTabKey admits combos + towers and nothing else', () => {
    // A compile-time assertion with a runtime body: if 'godly' is ever re-added to the union this
    // stops type-checking, which is the half that matters. `tsc -b` runs over the test files too.
    const all: readonly CodexTabKey[] = ['combos', 'towers'];
    expect(all).toHaveLength(2);
    expect(all).not.toContain('godly');
  });
});

describe('S173 P5 — the towers grid scrolls, and the extent comes from the grid itself', () => {
  it('19 entries at 4 columns is 5 rows — the shipped TOWERS & STRUCTURES shape', () => {
    // Voltkin + 18 spawner/defender recipes. `listRecipes()` feeds the tab whole (main.ts), so this
    // is the real count; it is asserted as a SHAPE rather than pinned, so adding a tower moves the
    // extent instead of failing here.
    expect(gridRowCount(19, TOWER_COLS)).toBe(5);
    expect(gridRowCount(20, TOWER_COLS)).toBe(5);
    expect(gridRowCount(21, TOWER_COLS)).toBe(6);
  });

  it('THE BUG, AS A NUMBER: the shipped grid runs past the bottom of a 1080-tall canvas', () => {
    // The measurement behind the owner's "I can't scroll down and keep seeing all the towers": the
    // last tile's bottom edge is y = 1947 and the padded content bottom 1971, against a canvas of
    // 1080 and a viewport floor of 1036 — so 935 px, more than half the tab and the whole boss-tower
    // tier, had no way to be reached.
    const bottom = gridContentBottom(5, TILE_H, TILE_GAP);
    expect(bottom).toBe(1971); // 235 GRID_TOP + 5*320 + 4*28 + 24 bottom pad
    expect(bottom - 24).toBe(1947); // the last tile's own bottom edge
    expect(bottom).toBeGreaterThan(CANVAS_HEIGHT);
    expect(scrollExtent(bottom)).toBe(935);
    expect(scrollExtent(bottom)).toBe(bottom - VIEW_BOTTOM);
  });

  it('REGRESSION: COMBOS still has ZERO travel — owner: "they\'re all fine, you can see all of them"', () => {
    // The viewport is applied to BOTH tabs (one code path). This is the assertion that the shared
    // path did not change the tab the owner explicitly said was fine: the Magic-14 at 5 columns is
    // 3 rows ending well above the viewport floor, so no scrollbar, no footer hint, no offset.
    const rows = gridRowCount(MAGIC_COMBO_KEYS.length, COMBO_COLS);
    expect(rows).toBe(3);
    const bottom = gridContentBottom(rows, COMBO_TILE_H, COMBO_GAP);
    expect(bottom).toBeLessThan(VIEW_BOTTOM);
    expect(scrollExtent(bottom)).toBe(0);
  });

  it('an empty grid has no extent (the "nothing discovered yet" state)', () => {
    expect(gridRowCount(0, TOWER_COLS)).toBe(0);
    expect(scrollExtent(gridContentBottom(0, TILE_H, TILE_GAP))).toBe(0);
  });
});

describe('S173 P5 — clamping: you cannot scroll past either end', () => {
  it('holds the offset inside [0, max]', () => {
    expect(clampScroll(-500, 900)).toBe(0);
    expect(clampScroll(0, 900)).toBe(0);
    expect(clampScroll(450, 900)).toBe(450);
    expect(clampScroll(900, 900)).toBe(900);
    expect(clampScroll(99999, 900)).toBe(900);
  });

  it('a grid that fits is pinned at 0 in BOTH directions', () => {
    // Without this, a wheel event on the COMBOS tab would drag its grid off the top of the mask —
    // the failure mode where "make towers scroll" quietly breaks the tab that was already correct.
    for (const attempt of [-300, -1, 0, 1, 300]) expect(clampScroll(attempt, 0)).toBe(0);
  });
});

describe('S173 P5 — wheel conversion handles all three DOM deltaModes', () => {
  it('pixel mode (Chrome) scales the delta into canvas units', () => {
    expect(wheelScrollDelta(100, 0)).toBeCloseTo(160, 6);
    expect(wheelScrollDelta(-100, 0)).toBeCloseTo(-160, 6);
  });

  it('line mode (Firefox) is not mistaken for pixels', () => {
    // ⛔ THE TRAP THIS PINS: Firefox reports deltaMode 1 with deltaY ≈ ±3 per notch. Treated as
    // pixels that is FIVE canvas px of travel per notch against a 348 px row — indistinguishable
    // from "it still doesn't scroll", and it would only ever be reported by a Firefox user.
    expect(wheelScrollDelta(3, 1)).toBe(180);
    expect(Math.abs(wheelScrollDelta(3, 1))).toBeGreaterThan(Math.abs(wheelScrollDelta(3, 0)));
  });

  it('page mode moves just under a viewport, never more', () => {
    const viewH = VIEW_BOTTOM - 212;
    expect(wheelScrollDelta(1, 2)).toBeCloseTo(viewH * 0.9, 6);
    expect(wheelScrollDelta(1, 2)).toBeLessThan(viewH);
  });

  it('direction is preserved — down scrolls down', () => {
    for (const mode of [0, 1, 2]) {
      expect(wheelScrollDelta(1, mode)).toBeGreaterThan(0);
      expect(wheelScrollDelta(-1, mode)).toBeLessThan(0);
    }
  });
});

describe('S173 P5 — the scrollbar says how much more there is', () => {
  const MAX = scrollExtent(gridContentBottom(5, TILE_H, TILE_GAP));
  const VIEW_TOP = 212;
  const VIEW_H = VIEW_BOTTOM - VIEW_TOP;

  it('the thumb starts at the track top and ends flush with its bottom', () => {
    const top = scrollbarThumb(0, MAX);
    expect(top.y).toBe(VIEW_TOP);
    const bot = scrollbarThumb(MAX, MAX);
    expect(bot.y + bot.h).toBeCloseTo(VIEW_TOP + VIEW_H, 6);
  });

  it('the thumb length is the visible fraction, floored so it stays grabbable', () => {
    const t = scrollbarThumb(0, MAX);
    expect(t.h).toBeGreaterThanOrEqual(48);
    expect(t.h).toBeLessThan(VIEW_H);
    // A much longer grid must not shrink the thumb to a sliver.
    expect(scrollbarThumb(0, 100000).h).toBe(48);
  });

  it('the thumb never leaves the track, at any offset including out-of-range ones', () => {
    for (const offset of [-9999, 0, 1, MAX / 3, MAX - 1, MAX, MAX + 9999]) {
      const t = scrollbarThumb(offset, MAX);
      expect(t.y).toBeGreaterThanOrEqual(VIEW_TOP);
      expect(t.y + t.h).toBeLessThanOrEqual(VIEW_TOP + VIEW_H + 1e-6);
    }
  });

  it('travel is monotonic in the offset', () => {
    expect(scrollbarThumb(MAX / 2, MAX).y).toBeGreaterThan(scrollbarThumb(0, MAX).y);
    expect(scrollbarThumb(MAX, MAX).y).toBeGreaterThan(scrollbarThumb(MAX / 2, MAX).y);
  });
});
