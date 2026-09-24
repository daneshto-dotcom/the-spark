/**
 * SPARK — ⛔ THE FOOTER COLLAPSE, AND THE ONE PROPERTY THAT MAKES IT WORTH HAVING.
 *
 * The owner's brother could not build in the bottom band of a four-player game, because the footer
 * sits on it. Canon §4b records that the dead band and the footer stand on the SAME ground, so
 * geometry alone could never give it back — the only fix is to RELEASE THE SURFACE.
 *
 * ⛔ **SO THE TEST THAT MATTERS IS `isOverBandSurface`, NOT `isOverChip`.** `isOverChip` decides the
 * CURSOR; `isOverBandSurface` decides whether a tower may be PLANTED. A collapse that taught only
 * the first would hide the menu and still refuse every placement underneath it — the band swallowing
 * clicks while invisible, which `footerBand.ts` records shipping TWICE in one session.
 */

import { describe, expect, it } from 'vitest';
import { COLLAPSE_TAB_H, COLLAPSE_TAB_W, collapseTabRect } from './footerBand.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, FOOTER_TOP_Y } from '../constants.ts';

describe('the tab is where he can find it', () => {
  it('is centred horizontally, in both states', () => {
    for (const collapsed of [false, true]) {
      const r = collapseTabRect(collapsed);
      expect(Math.abs(r.x + r.w / 2 - CANVAS_WIDTH / 2)).toBeLessThanOrEqual(1);
    }
  });

  it('rides the band’s top edge while the menu is up', () => {
    expect(collapseTabRect(false).y + COLLAPSE_TAB_H).toBe(FOOTER_TOP_Y);
  });

  it('hugs the very bottom once collapsed, giving back every pixel it can', () => {
    const r = collapseTabRect(true);
    expect(r.y + r.h).toBe(CANVAS_HEIGHT);
    expect(r.y).toBeGreaterThan(FOOTER_TOP_Y);
  });

  it('stays on the canvas in both states', () => {
    for (const collapsed of [false, true]) {
      const r = collapseTabRect(collapsed);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('⚠ is SMALL — collapsed it is the only footer pixel left, and each one is board he wants back', () => {
    const band = CANVAS_WIDTH * (CANVAS_HEIGHT - FOOTER_TOP_Y);
    expect((COLLAPSE_TAB_W * COLLAPSE_TAB_H) / band).toBeLessThan(0.02);
  });
});

/**
 * A stand-in for the parts of `FooterBand` this contract touches. The real class needs a Pixi
 * Application; the collapse RULE does not, and driving it through the real thing would be testing
 * Pixi rather than the rule. The two methods below are transcribed from `footerBand.ts` — if that
 * file's collapse branches change, these must change with them or the pairing has drifted.
 */
class BandModel {
  collapsed = false;
  /** Worst case: assume the whole band except the tab is covered in controls. */
  private controlsCover(x: number, y: number): boolean {
    return y >= FOOTER_TOP_Y && x > 200 && x < CANVAS_WIDTH - 200;
  }
  /**
   * ⭐ S188 — the open tower menu's cards. Empty here (no menu open), which is every case this model
   * asserts; the tab being ONE LAYER BELOW an open card is driven through the real band and the real
   * `Controls` in `input/controls.footerArrowLayer.test.ts`. Transcribed so the pairing stays true.
   */
  openCards: Array<{ x: number; y: number; w: number; h: number }> = [];
  isOverCollapseTab(x: number, y: number): boolean {
    const r = collapseTabRect(this.collapsed);
    if (!(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return false;
    return this.collapsed || !this.openCards.some((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  }
  isOverChip(x: number, y: number): boolean {
    if (this.collapsed) return this.isOverCollapseTab(x, y);
    return this.controlsCover(x, y) || this.isOverCollapseTab(x, y);
  }
  isOverBandSurface(x: number, y: number): boolean {
    if (this.collapsed) return this.isOverCollapseTab(x, y);
    return this.isOverChip(x, y);
  }
  toggleCollapsed(): boolean {
    this.collapsed = !this.collapsed;
    return this.collapsed;
  }
}

describe('⛔ collapsing actually releases the ground', () => {
  const MID_BAND = { x: CANVAS_WIDTH / 2 + 300, y: FOOTER_TOP_Y + 40 };

  it('refuses placement in the band while the menu is up', () => {
    expect(new BandModel().isOverBandSurface(MID_BAND.x, MID_BAND.y)).toBe(true);
  });

  it('⛔ RELEASES that same point once collapsed — this is the whole feature', () => {
    const b = new BandModel();
    b.toggleCollapsed();
    expect(b.isOverBandSurface(MID_BAND.x, MID_BAND.y)).toBe(false);
    expect(b.isOverChip(MID_BAND.x, MID_BAND.y)).toBe(false);
  });

  it('⛔ keeps the TAB opaque while collapsed, so nothing is planted under the way back', () => {
    const b = new BandModel();
    b.toggleCollapsed();
    const r = collapseTabRect(true);
    expect(b.isOverBandSurface(r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
    expect(b.isOverChip(r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
  });

  it('the tab is clickable in BOTH states, so the menu can always come back', () => {
    const b = new BandModel();
    const up = collapseTabRect(false);
    expect(b.isOverCollapseTab(up.x + up.w / 2, up.y + up.h / 2)).toBe(true);
    b.toggleCollapsed();
    const down = collapseTabRect(true);
    expect(b.isOverCollapseTab(down.x + down.w / 2, down.y + down.h / 2)).toBe(true);
  });

  it('toggles back, restoring the menu and its surface', () => {
    const b = new BandModel();
    expect(b.toggleCollapsed()).toBe(true);
    expect(b.isOverBandSurface(MID_BAND.x, MID_BAND.y)).toBe(false);
    expect(b.toggleCollapsed()).toBe(false);
    expect(b.isOverBandSurface(MID_BAND.x, MID_BAND.y)).toBe(true);
  });
});

describe('⭐ the real module honours the collapse in BOTH hit-tests', () => {
  it('both branches are present in footerBand.ts, and the surface one carries its reason', () => {
    // A source check, and its limits are known: it proves the branches EXIST, not that they are
    // reached (S182 lesson 2). The behavioural proof is the BandModel block above; this catches the
    // specific regression of somebody deleting one of the two branches and leaving the other.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(__dirname, 'footerBand.ts'), 'utf8');
    const branches = src.match(/if \(this\.collapsed\) return this\.isOverCollapseTab\(x, y\);/g) ?? [];
    expect(
      branches.length,
      'isOverChip AND isOverBandSurface must each release the band when collapsed. Teaching only ' +
        'the cursor one hides the menu while still refusing every placement underneath it.',
    ).toBe(2);
  });
});
