/**
 * SPARK — ⭐ S194: the stat board's geometry. Every clickable / hoverable rect is inside the panel, does not
 * overlap its siblings, and hit-tests INSIDE and NOT just outside — for every seat count the game can seat.
 */
import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import {
  CONTENT, CONTINUE_RECT, GRAPHS_SLOTS, PANEL, graphsLayout, inRect, matrixCells, overviewLayout, playerLayout,
  plotRect, pointX, tabAt, tabIndex, tabRects, unitLinesThatFit, waveIndexAt, type Rect,
} from './matchBoardLayout.ts';

const inside = (outer: Rect, r: Rect): boolean =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Inside at the centre; NOT inside 2 px past each edge. */
function hitsExactly(r: Rect): void {
  expect(inRect(r, r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
  expect(inRect(r, r.x - 2, r.y + r.h / 2)).toBe(false);
  expect(inRect(r, r.x + r.w + 2, r.y + r.h / 2)).toBe(false);
  expect(inRect(r, r.x + r.w / 2, r.y - 2)).toBe(false);
  expect(inRect(r, r.x + r.w / 2, r.y + r.h + 2)).toBe(false);
}

describe('S194 matchBoardLayout — every rect where it is drawn', () => {
  it('the panel fits the canvas; content and CONTINUE sit inside it and do not collide', () => {
    expect(inside({ x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT }, PANEL)).toBe(true);
    expect(inside(PANEL, CONTENT)).toBe(true);
    expect(inside(PANEL, CONTINUE_RECT)).toBe(true);
    expect(overlap(CONTENT, CONTINUE_RECT)).toBe(false);
    hitsExactly(CONTINUE_RECT);
  });

  for (const seats of [1, 2, 3, 4, 6, 8]) {
    it(`${seats} seat(s): tabs fit, never overlap, and each hit-tests exactly; rows likewise`, () => {
      const tabs = tabRects(seats);
      expect(tabs).toHaveLength(2 + seats);
      for (const t of tabs) {
        expect(inside(PANEL, t)).toBe(true);
        expect(overlap(t, CONTENT)).toBe(false);
        expect(t.w).toBeGreaterThan(60);
        hitsExactly(t);
      }
      for (let i = 1; i < tabs.length; i++) expect(overlap(tabs[i - 1]!, tabs[i]!)).toBe(false);
      const ov = overviewLayout(seats);
      for (const r of ov.rows) {
        expect(inside(CONTENT, r)).toBe(true);
        hitsExactly(r);
      }
      for (let i = 1; i < ov.rows.length; i++) expect(overlap(ov.rows[i - 1]!, ov.rows[i]!)).toBe(false);
      expect(inside(CONTENT, ov.chart)).toBe(true);
      for (const r of ov.rows) expect(overlap(r, ov.chart)).toBe(false);
    });
  }

  it('the four GRAPHS slots tile the content without overlapping; the heatmap cells sit inside their card', () => {
    const G = graphsLayout();
    for (const s of GRAPHS_SLOTS) expect(inside(CONTENT, G[s])).toBe(true);
    for (let i = 0; i < GRAPHS_SLOTS.length; i++) {
      for (let j = i + 1; j < GRAPHS_SLOTS.length; j++) expect(overlap(G[GRAPHS_SLOTS[i]!], G[GRAPHS_SLOTS[j]!])).toBe(false);
    }
    for (const n of [2, 4, 8]) {
      const { cells } = matrixCells(G.matrix, n);
      for (const row of cells) for (const c of row) {
        expect(inside(G.matrix, c)).toBe(true);
        hitsExactly(c);
      }
      expect(overlap(cells[0]![0]!, cells[0]![1]!)).toBe(false);
      expect(overlap(cells[0]![0]!, cells[1]![0]!)).toBe(false);
    }
  });

  it('the player page panels sit inside the content and never overlap', () => {
    const P = playerLayout();
    const all = [P.header, ...P.tiles, P.units, P.damage, P.versus, P.ledger];
    for (const r of all) expect(inside(CONTENT, r)).toBe(true);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlap(all[i]!, all[j]!)).toBe(false);
    expect(unitLinesThatFit(P.units)).toBeGreaterThanOrEqual(8);
    expect(P.ledger.h).toBeGreaterThan(120);
  });

  it('a chart\'s wave under the pointer: nearest point for lines, the containing group for bars, -1 off the plot', () => {
    const plot = plotRect(graphsLayout().damage);
    expect(waveIndexAt(plot, 5, pointX(plot, 5, 3), 'points')).toBe(3);
    expect(waveIndexAt(plot, 5, plot.x + (plot.w * 2.5) / 5, 'groups')).toBe(2);
    expect(waveIndexAt(plot, 5, plot.x - 40, 'points')).toBe(-1);
    expect(waveIndexAt(plot, 5, plot.x + plot.w + 40, 'groups')).toBe(-1);
    expect(waveIndexAt(plot, 0, plot.x + 10, 'points')).toBe(-1);
    expect(waveIndexAt(plot, 1, plot.x + 3, 'points')).toBe(0);
  });

  it('tab index ↔ tab round-trips', () => {
    for (let i = 0; i < 10; i++) expect(tabIndex(tabAt(i))).toBe(i);
  });
});
