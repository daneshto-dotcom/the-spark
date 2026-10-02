/**
 * SPARK — ⭐ S194 THE STAT BOARD'S GEOMETRY, IN ONE PLACE. Pure: counts in, rects out.
 *
 * Both the draw (`matchBoard.ts`) and every hit test read THIS file — the `castlePanel.ts:661` lesson (a
 * layout kept in three places put every e2e click on empty canvas). Every clickable and hoverable is a rect
 * here, and `matchBoardLayout.test.ts` taps inside and just outside each one.
 *
 * Absolute canvas pixels (`CANVAS_WIDTH` × `CANVAS_HEIGHT` = 1920 × 1080).
 */

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** The board's pages: the overview, the charts, then one page per seat in placing order. */
export type BoardTab =
  | { readonly kind: 'overview' }
  | { readonly kind: 'graphs' }
  | { readonly kind: 'player'; readonly index: number };

export const PANEL: Rect = { x: 110, y: 36, w: 1700, h: 1008 };
const TAB_Y = PANEL.y + 108;
const TAB_H = 46;
/** Where every page's content lives: below the tab strip, above the footer. */
export const CONTENT: Rect = { x: PANEL.x + 24, y: TAB_Y + TAB_H + 18, w: PANEL.w - 48, h: PANEL.h - (TAB_Y + TAB_H + 18 - PANEL.y) - 92 };
export const CONTINUE_RECT: Rect = { x: PANEL.x + PANEL.w - 274, y: PANEL.y + PANEL.h - 74, w: 250, h: 54 };

/** The tab strip: OVERVIEW, GRAPHS, then one tab per seat. Widths shrink to fit any seat count. */
export function tabRects(seatCount: number): Rect[] {
  const gap = 8;
  const fixed = [190, 190];
  const avail = PANEL.w - 48 - fixed[0]! - fixed[1]! - gap * (seatCount + 1);
  const seatW = seatCount === 0 ? 0 : Math.min(250, Math.floor(avail / seatCount));
  const out: Rect[] = [];
  let x = PANEL.x + 24;
  for (const w of [...fixed, ...Array.from({ length: seatCount }, () => seatW)]) {
    out.push({ x, y: TAB_Y, w, h: TAB_H });
    x += w + gap;
  }
  return out;
}

/** The tab a strip index means, and back. Index 0 = OVERVIEW, 1 = GRAPHS, 2 + i = seat i's page. */
export const tabAt = (i: number): BoardTab =>
  i === 0 ? { kind: 'overview' } : i === 1 ? { kind: 'graphs' } : { kind: 'player', index: i - 2 };
export const tabIndex = (t: BoardTab): number => (t.kind === 'overview' ? 0 : t.kind === 'graphs' ? 1 : 2 + t.index);

// ── OVERVIEW ─────────────────────────────────────────────────────────────────────────────────────

export const OV_HEAD_H = 34;
export const OV_ROW_H = 54;

/** The overview's table rows (each one clickable — it opens that seat's page) and its score chart. */
export function overviewLayout(rowCount: number): { rows: Rect[]; chart: Rect } {
  const rows: Rect[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push({ x: CONTENT.x, y: CONTENT.y + OV_HEAD_H + i * OV_ROW_H, w: CONTENT.w, h: OV_ROW_H - 4 });
  }
  const tableEnd = CONTENT.y + OV_HEAD_H + Math.max(1, rowCount) * OV_ROW_H;
  const cy = tableEnd + 14;
  return { rows, chart: { x: CONTENT.x, y: cy, w: CONTENT.w, h: Math.max(160, CONTENT.y + CONTENT.h - cy) } };
}

/** Table columns: key, header, left edge (relative to CONTENT.x), width, numeric (right-aligned + bar). */
export const OV_COLUMNS = [
  { key: 'place', head: 'PLACE', x: 12, w: 70, num: false },
  { key: 'player', head: 'PLAYER', x: 92, w: 330, num: false },
  { key: 'status', head: 'STATUS', x: 430, w: 130, num: false },
  { key: 'score', head: 'SCORE', x: 570, w: 140, num: true },
  { key: 'units', head: 'UNITS', x: 720, w: 110, num: true },
  { key: 'kills', head: 'KILLS', x: 840, w: 110, num: true },
  { key: 'lost', head: 'LOST', x: 960, w: 110, num: true },
  { key: 'towers', head: 'TOWERS', x: 1080, w: 120, num: true },
  { key: 'dealt', head: 'DEALT', x: 1210, w: 190, num: true },
  { key: 'taken', head: 'TAKEN', x: 1410, w: 190, num: true },
] as const;
export type OvColumnKey = (typeof OV_COLUMNS)[number]['key'];

// ── GRAPHS ───────────────────────────────────────────────────────────────────────────────────────

export type GraphsSlot = 'damage' | 'built' | 'kills' | 'matrix';
export const GRAPHS_SLOTS: readonly GraphsSlot[] = ['damage', 'built', 'kills', 'matrix'];

/** The charts tab: a 2 × 2 grid — damage per wave, built standing, kills per wave, who-hit-whom. */
export function graphsLayout(): Record<GraphsSlot, Rect> {
  const gap = 18;
  const w = (CONTENT.w - gap) / 2;
  const h = (CONTENT.h - gap) / 2;
  const at = (c: number, r: number): Rect => ({ x: CONTENT.x + c * (w + gap), y: CONTENT.y + r * (h + gap), w, h });
  return { damage: at(0, 0), built: at(1, 0), kills: at(0, 1), matrix: at(1, 1) };
}

/** The plotting area inside a chart frame (title + caption above, axis labels left and below). */
export function plotRect(frame: Rect): Rect {
  const left = frame.x + 70;
  const top = frame.y + 62;
  return { x: left, y: top, w: frame.x + frame.w - 20 - left, h: frame.y + frame.h - 30 - top };
}

/** The wave index under `x` in a plot of `n` waves (nearest point / the bar group it is in), or -1. */
export function waveIndexAt(plot: Rect, n: number, x: number, form: 'points' | 'groups'): number {
  if (n <= 0 || x < plot.x - 12 || x > plot.x + plot.w + 12) return -1;
  if (form === 'groups') {
    const i = Math.floor(((x - plot.x) / plot.w) * n);
    return Math.max(0, Math.min(n - 1, i));
  }
  if (n === 1) return 0;
  const i = Math.round(((x - plot.x) / plot.w) * (n - 1));
  return Math.max(0, Math.min(n - 1, i));
}

/** The x of point `i` of `n` (lines, area) — centred when there is only one. */
export const pointX = (plot: Rect, n: number, i: number): number =>
  n <= 1 ? plot.x + plot.w / 2 : plot.x + (plot.w * i) / (n - 1);

/** The who-hit-whom grid: one cell per (attacker row, victim column). */
export function matrixCells(frame: Rect, n: number): { cells: Rect[][]; rowLabelX: number; colLabelY: number } {
  const labelW = 110;
  const top = frame.y + 92;
  const left = frame.x + 24 + labelW;
  const size = Math.max(1, n);
  const cw = Math.floor((frame.x + frame.w - 24 - left) / size);
  const ch = Math.floor((frame.y + frame.h - 20 - top) / size);
  const cells: Rect[][] = [];
  for (let i = 0; i < n; i++) {
    const row: Rect[] = [];
    for (let j = 0; j < n; j++) row.push({ x: left + j * cw, y: top + i * ch, w: cw - 4, h: ch - 4 });
    cells.push(row);
  }
  return { cells, rowLabelX: frame.x + 24, colLabelY: top - 26 };
}

// ── PLAYER PAGE ──────────────────────────────────────────────────────────────────────────────────

export const PP_HEADER_H = 74;
export const PP_TILE_H = 86;
export const PP_LINE_H = 36;

export function playerLayout(): {
  header: Rect; tiles: Rect[]; units: Rect; damage: Rect; versus: Rect; ledger: Rect;
} {
  const x = CONTENT.x;
  const y = CONTENT.y;
  const tilesY = y + PP_HEADER_H + 12;
  const tw = (CONTENT.w - 5 * 12) / 6;
  const tiles = Array.from({ length: 6 }, (_, i): Rect => ({ x: x + i * (tw + 12), y: tilesY, w: tw, h: PP_TILE_H }));
  const bodyY = tilesY + PP_TILE_H + 16;
  const bodyH = CONTENT.y + CONTENT.h - bodyY;
  const leftW = Math.floor(CONTENT.w * 0.46);
  const rx = x + leftW + 18;
  const rw = CONTENT.w - leftW - 18;
  const damageH = 150;
  const versusH = 150;
  return {
    header: { x, y, w: CONTENT.w, h: PP_HEADER_H },
    tiles,
    units: { x, y: bodyY, w: leftW, h: bodyH },
    damage: { x: rx, y: bodyY, w: rw, h: damageH },
    versus: { x: rx, y: bodyY + damageH + 12, w: rw, h: versusH },
    ledger: { x: rx, y: bodyY + damageH + versusH + 24, w: rw, h: bodyH - damageH - versusH - 24 },
  };
}

/** How many unit lines fit the ledger panel (header row excluded). */
export const unitLinesThatFit = (units: Rect): number => Math.max(1, Math.floor((units.h - 64) / PP_LINE_H));
