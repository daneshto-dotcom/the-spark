/**
 * SPARK — ⭐ S194 THE STAT BOARD'S HOVER: what is under the pointer, and what its tooltip says. Pure.
 *
 * Kept out of the Pixi view so both halves are testable without a renderer: `hoverAt` turns a pointer into a
 * target using ONLY `matchBoardLayout.ts` (the same rects the view draws), and `tooltipFor` turns a target
 * into the lines the tooltip prints. The crosshair pattern is Dota's / LTD2's: hover a wave and every seat's
 * value AT that wave is listed, not one dot at a time.
 */

import {
  CONTINUE_RECT, GRAPHS_SLOTS, graphsLayout, inRect, matrixCells, overviewLayout, playerLayout, plotRect,
  tabRects, waveIndexAt, type BoardTab,
} from './matchBoardLayout.ts';
import { groupThousands, type BoardGraph, type MatchBoardModel } from './matchBoardModel.ts';

export type BoardChartKey = 'score' | 'damage' | 'built' | 'kills';

export type HoverTarget =
  | { readonly kind: 'tab'; readonly index: number }
  | { readonly kind: 'row'; readonly index: number }
  | { readonly kind: 'wave'; readonly chart: BoardChartKey; readonly index: number }
  | { readonly kind: 'cell'; readonly attacker: number; readonly victim: number }
  | { readonly kind: 'ledger'; readonly index: number }
  | { readonly kind: 'continue' };

export const sameTarget = (a: HoverTarget | null, b: HoverTarget | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const formOf = (g: BoardGraph): 'points' | 'groups' => (g.form === 'bars' || g.form === 'stackedBars' ? 'groups' : 'points');

/** The target under (x, y) on `tab`, or null. The tab strip and CONTINUE are on every page. */
export function hoverAt(m: MatchBoardModel, tab: BoardTab, x: number, y: number): HoverTarget | null {
  if (inRect(CONTINUE_RECT, x, y)) return { kind: 'continue' };
  const tabs = tabRects(m.rows.length);
  const t = tabs.findIndex((r) => inRect(r, x, y));
  if (t !== -1) return { kind: 'tab', index: t };
  const n = m.graphs.score.waves.length;
  if (tab.kind === 'overview') {
    const L = overviewLayout(m.rows.length);
    const r = L.rows.findIndex((rr) => inRect(rr, x, y));
    if (r !== -1) return { kind: 'row', index: r };
    const p = plotRect(L.chart);
    if (inRect(L.chart, x, y)) {
      const i = waveIndexAt(p, n, x, 'points');
      if (i !== -1) return { kind: 'wave', chart: 'score', index: i };
    }
    return null;
  }
  if (tab.kind === 'graphs') {
    const G = graphsLayout();
    for (const slot of GRAPHS_SLOTS) {
      const frame = G[slot];
      if (!inRect(frame, x, y)) continue;
      if (slot === 'matrix') {
        const cells = matrixCells(frame, m.matrix.seats.length).cells;
        for (let i = 0; i < cells.length; i++) {
          for (let j = 0; j < cells[i]!.length; j++) {
            if (i !== j && inRect(cells[i]![j]!, x, y)) return { kind: 'cell', attacker: i, victim: j };
          }
        }
        return null;
      }
      const i = waveIndexAt(plotRect(frame), n, x, formOf(m.graphs[slot]));
      return i === -1 ? null : { kind: 'wave', chart: slot, index: i };
    }
    return null;
  }
  const P = playerLayout();
  if (inRect(P.ledger, x, y)) {
    const i = waveIndexAt(plotRect(P.ledger), n, x, 'groups');
    if (i !== -1) return { kind: 'ledger', index: i };
  }
  return null;
}

/** One tooltip line: its words, and the seat colour it is printed in (null = the default ink). */
export interface TipLine { readonly text: string; readonly color: number | null }

const plain = (...xs: string[]): TipLine[] => xs.map((text) => ({ text, color: null }));

/** The tooltip's lines for a target (first line is the title), or null when it has none. */
export function tooltipFor(m: MatchBoardModel, tab: BoardTab, h: HoverTarget | null): TipLine[] | null {
  if (h === null) return null;
  switch (h.kind) {
    case 'row': {
      const r = m.rows[h.index];
      return r === undefined ? null : [{ text: `${r.label} ${r.race}`, color: r.color }, ...plain('click to open this player\'s page')];
    }
    case 'wave': {
      const g = m.graphs[h.chart];
      const w = g.waves[h.index];
      if (w === undefined) return null;
      const lines = plain(`WAVE ${w} · ${g.title}`);
      // Highest first; ties keep placing order (a stable sort), so the tooltip is a total order too.
      const vals = g.series.map((s) => ({ s, v: s.values[h.index] ?? 0 })).sort((a, b) => b.v - a.v);
      for (const { s, v } of vals) lines.push({ text: `${s.label}  ${groupThousands(v)}`, color: s.color });
      if (g.form === 'stackedArea' || g.form === 'stackedBars') {
        lines.push({ text: `ALL  ${groupThousands(vals.reduce((t, x) => t + x.v, 0))}`, color: null });
      }
      return lines;
    }
    case 'cell': {
      const a = m.matrix.labels[h.attacker];
      const v = m.matrix.labels[h.victim];
      const n = m.matrix.cells[h.attacker]?.[h.victim];
      if (a === undefined || v === undefined || n === undefined) return null;
      const back = m.matrix.cells[h.victim]?.[h.attacker] ?? 0;
      return [
        { text: `${a} → ${v}`, color: m.matrix.colors[h.attacker] ?? null },
        ...plain(`dealt  ${groupThousands(n)}`, `${v} hit back  ${groupThousands(back)}`),
      ];
    }
    case 'ledger': {
      if (tab.kind !== 'player') return null;
      const r = m.rows[tab.index];
      const w = m.graphs.damage.waves[h.index];
      if (r === undefined || w === undefined) return null;
      const dealt = m.graphs.damage.series.find((s) => s.seat === r.seat)?.values[h.index] ?? 0;
      const taken = m.takenPerWave.find((s) => s.seat === r.seat)?.values[h.index] ?? 0;
      return plain(`WAVE ${w} · ${r.label}`, `dealt  ${groupThousands(dealt)}`, `taken  ${groupThousands(taken)}`);
    }
    case 'tab':
    case 'continue':
      return null;
  }
}
