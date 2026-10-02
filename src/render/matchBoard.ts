/**
 * SPARK — ⭐ S191 THE END-OF-MATCH STAT BOARD (the Pixi view). It draws `matchBoardModel` and decides nothing.
 *
 * Owner, S191: *"how many units were built, how many units were killed of each type … the graphs showing like
 * all the players and how much they have built and like compared to each other."*
 *
 * ## The three rules it lives by
 *
 * - **No show()/hide().** `render(world, nowMs)` runs every frame and visibility is `model !== null` — the
 *   `arcadeRunOverlay` convention. POSTGAME has five exits (click, R, the exit button, a peer drop, lobby
 *   Back); an overlay you have to remember to hide eventually sticks on one of them.
 * - **⛔ It owns the exit.** `main.ts` used to reset the match on ANY canvas click in POSTGAME, which made a
 *   stat board unreadable by construction. The scrim swallows the board, `main.ts` ignores canvas clicks
 *   while `isShowing()`, and only CONTINUE (primary button) or R leaves — both refused until the board has
 *   been up `ARM_MS`, so a click still in flight from the last fight cannot skip it.
 * - **No zIndex.** Its place is its staging line in `main.ts` (canon §7b, S189 C1).
 *
 * Geometry lives in ONE place, `matchBoardLayout`, which both the draw and the hit test read — the
 * `castlePanel.ts:661` lesson (a layout kept in three places put every e2e click on empty canvas).
 */

import { Container, Graphics, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { World } from '../state/worldTypes.ts';
import { groupThousands, matchBoardModel, type BoardGraph, type BoardRow, type MatchBoardModel } from './matchBoardModel.ts';

/** ⚠ MINE — how long the board is up before CONTINUE / R may leave it. A fight's last click cannot skip it. */
export const ARM_MS = 1200;

const INK = 0xf2efe6;
const DIM = 0x7d8596;
const PLATE = 0x10131c;
const EDGE = 0xd8b45a;
const AXIS = 0x3a4050;
const FONT = ['Kanit', 'Impact', 'sans-serif'];

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** The table's columns: key, header, left edge (panel-relative), width, numeric (right-aligned + bar). */
const COLUMNS = [
  { key: 'place', head: 'PLACE', x: 30, w: 80, num: false },
  { key: 'player', head: 'PLAYER', x: 120, w: 360, num: false },
  { key: 'score', head: 'SCORE', x: 490, w: 150, num: true },
  { key: 'units', head: 'UNITS', x: 650, w: 130, num: true },
  { key: 'kills', head: 'KILLS', x: 790, w: 130, num: true },
  { key: 'towers', head: 'TOWERS', x: 930, w: 140, num: true },
  { key: 'dealt', head: 'DEALT', x: 1080, w: 220, num: true },
  { key: 'taken', head: 'TAKEN', x: 1310, w: 220, num: true },
] as const;

const PANEL: Rect = { x: 160, y: 60, w: 1600, h: 960 };
const ROW_H = 46;
const TABLE_TOP = 150;

/** THE single source of the board's geometry, for any row count. Absolute canvas pixels. */
export function matchBoardLayout(rowCount: number): {
  panel: Rect; rows: Rect[]; breakdown: Rect; graphs: [Rect, Rect]; cont: Rect;
} {
  const rows: Rect[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push({ x: PANEL.x + 20, y: PANEL.y + TABLE_TOP + 40 + i * ROW_H, w: PANEL.w - 40, h: ROW_H - 4 });
  }
  const tableEnd = PANEL.y + TABLE_TOP + 40 + Math.max(1, rowCount) * ROW_H;
  const gy = tableEnd + 90;
  const gh = PANEL.y + PANEL.h - 100 - gy;
  const gw = (PANEL.w - 60) / 2;
  return {
    panel: PANEL,
    rows,
    breakdown: { x: PANEL.x + 30, y: tableEnd + 8, w: PANEL.w - 60, h: 70 },
    graphs: [
      { x: PANEL.x + 20, y: gy, w: gw, h: gh },
      { x: PANEL.x + 40 + gw, y: gy, w: gw, h: gh },
    ],
    cont: { x: PANEL.x + PANEL.w - 270, y: PANEL.y + PANEL.h - 76, w: 240, h: 54 },
  };
}

const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function cellText(row: BoardRow, key: (typeof COLUMNS)[number]['key']): string {
  switch (key) {
    case 'place': return row.placeLabel;
    case 'player': {
      const out = row.out ? (row.outOnWave !== null ? `  OUT W${row.outOnWave}` : '  OUT') : '';
      return `${row.isWinner ? '★ ' : ''}${row.label} ${row.race}${row.isLocal ? '  YOU' : ''}${out}`;
    }
    case 'score': return groupThousands(row.score);
    case 'units': return groupThousands(row.units);
    case 'kills': return groupThousands(row.kills);
    case 'towers': return `${row.towersBuilt} / ${row.towersFell}`;
    case 'dealt': return groupThousands(row.dealt);
    case 'taken': return groupThousands(row.taken);
  }
}

function cellValue(row: BoardRow, key: (typeof COLUMNS)[number]['key']): number {
  switch (key) {
    case 'score': return row.score;
    case 'units': return row.units;
    case 'kills': return row.kills;
    case 'towers': return row.towersBuilt;
    case 'dealt': return row.dealt;
    case 'taken': return row.taken;
    default: return 0;
  }
}

/** A tiny Text pool: the board redraws only when its content changes, and reuses every Text it made. */
class TextPool {
  private readonly items: Text[] = [];
  private used = 0;
  constructor(private readonly parent: Container) {}
  reset(): void { this.used = 0; }
  take(text: string, size: number, fill: number, weight: '400' | '900' = '900'): Text {
    let t = this.items[this.used];
    if (t === undefined) {
      t = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: size, fill, fontWeight: weight }) });
      this.items.push(t);
      this.parent.addChild(t);
    }
    this.used += 1;
    t.visible = true;
    t.text = text;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.style.fontWeight = weight;
    t.anchor.set(0, 0);
    return t;
  }
  hideRest(): void { for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false; }
}

export class MatchBoard {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly texts: TextPool;
  private shownAtMs: number | null = null;
  private hoverRow: number | null = null;
  private model: MatchBoardModel | null = null;
  private drawnKey = '';

  constructor(private readonly onContinue: () => void) {
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.addChild(this.g);
    this.texts = new TextPool(this.container);
    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      const rows = matchBoardLayout(this.model?.rows.length ?? 0).rows;
      const i = rows.findIndex((r) => inRect(r, e.global.x, e.global.y));
      this.hoverRow = i === -1 ? null : i;
    });
    this.container.on('pointertap', (e: FederatedPointerEvent) => {
      // ⛔ PRIMARY ONLY: right-click is the game's put-it-back / raid gesture (draftOverlay, S187).
      if (e.button !== 0 || this.model === null) return;
      if (inRect(matchBoardLayout(this.model.rows.length).cont, e.global.x, e.global.y) && this.isArmed(performance.now())) {
        this.onContinue();
      }
    });
  }

  /** Is the board up? `main.ts` swallows canvas clicks while it is. */
  isShowing(): boolean {
    return this.model !== null;
  }

  /** May CONTINUE / R leave yet? True when no board is up, so every other exit path is unchanged. */
  isArmed(nowMs: number): boolean {
    return this.shownAtMs === null || nowMs - this.shownAtMs >= ARM_MS;
  }

  /** Every frame, unconditionally. */
  render(world: World, nowMs: number): void {
    this.model = matchBoardModel(world);
    if (this.model === null) {
      this.shownAtMs = null;
      this.hoverRow = null;
      this.container.visible = false;
      return;
    }
    if (this.shownAtMs === null) this.shownAtMs = nowMs;
    this.container.visible = true;
    const armed = this.isArmed(nowMs);
    const key = `${JSON.stringify(this.model)}|${this.hoverRow}|${armed}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.draw(this.model, armed);
  }

  private draw(m: MatchBoardModel, armed: boolean): void {
    const g = this.g;
    const L = matchBoardLayout(m.rows.length);
    g.clear();
    this.texts.reset();
    // The scrim swallows the board underneath; the plate carries everything.
    g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x05060a, alpha: 0.78 });
    g.roundRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h, 14).fill({ color: PLATE, alpha: 0.97 });
    g.roundRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h, 14).stroke({ color: EDGE, width: 2, alpha: 0.9 });

    const head = this.texts.take(m.headline, 46, m.headlineColor);
    head.anchor.set(0.5, 0);
    head.position.set(L.panel.x + L.panel.w / 2, L.panel.y + 30);

    // ── the table ──
    const maxOf = new Map<string, number>();
    for (const c of COLUMNS) if (c.num) maxOf.set(c.key, Math.max(1, ...m.rows.map((r) => cellValue(r, c.key))));
    for (const c of COLUMNS) {
      const t = this.texts.take(c.head, 16, DIM);
      const x = L.panel.x + c.x + (c.num ? c.w : 0);
      t.anchor.set(c.num ? 1 : 0, 0);
      t.position.set(x, L.panel.y + TABLE_TOP + 8);
    }
    m.rows.forEach((row, i) => {
      const r = L.rows[i]!;
      if (i === this.hoverRow || (this.hoverRow === null && row.isLocal)) {
        g.roundRect(r.x, r.y, r.w, r.h, 6).fill({ color: 0xffffff, alpha: 0.06 });
      }
      for (const c of COLUMNS) {
        if (c.num) {
          // Bar-in-cell: each column reads as a tiny bar chart (S179 research — people scan a column).
          const frac = cellValue(row, c.key) / maxOf.get(c.key)!;
          if (frac > 0) g.rect(L.panel.x + c.x + c.w * (1 - frac), r.y + 6, c.w * frac, r.h - 12).fill({ color: row.color, alpha: 0.2 });
        }
        const t = this.texts.take(cellText(row, c.key), c.key === 'place' ? 22 : 24, c.num || c.key === 'player' ? row.color : INK);
        t.anchor.set(c.num ? 1 : 0, 0.5);
        t.position.set(L.panel.x + c.x + (c.num ? c.w - 6 : 0), r.y + r.h / 2);
      }
    });

    // ── the per-type breakdown of the hovered (else your own, else the winner's) row ──
    const focus = m.rows[this.hoverRow ?? -1] ?? m.rows.find((r) => r.isLocal) ?? m.rows[0];
    if (focus !== undefined) {
      const list = (xs: BoardRow['unitsByType']): string =>
        xs.length === 0 ? '—' : xs.map((u) => `${u.name} ${groupThousands(u.count)}`).join(' · ');
      const b1 = this.texts.take(`${focus.label}  UNITS BUILT   ${list(focus.unitsByType)}`, 17, focus.color, '400');
      b1.position.set(L.breakdown.x, L.breakdown.y);
      const b2 = this.texts.take(`${focus.label}  UNITS KILLED  ${list(focus.killsByType)}`, 17, focus.color, '400');
      b2.position.set(L.breakdown.x, L.breakdown.y + 26);
    }

    // ── the two graphs ──
    this.drawGraph(m.graphs[0], L.graphs[0]);
    this.drawGraph(m.graphs[1], L.graphs[1]);

    // ── footer: the trust line, and the one way out ──
    const note = m.noStats
      ? 'this host sent no match stats (an older build) — places and scores only'
      : 'every number is in the same units that float off a unit · hover a row for its units';
    const n = this.texts.take(note, 15, DIM, '400');
    n.position.set(L.panel.x + 30, L.cont.y + 18);
    g.roundRect(L.cont.x, L.cont.y, L.cont.w, L.cont.h, 10).fill({ color: armed ? EDGE : AXIS, alpha: armed ? 0.95 : 0.6 });
    const ct = this.texts.take('CONTINUE  (R)', 22, armed ? PLATE : DIM);
    ct.anchor.set(0.5, 0.5);
    ct.position.set(L.cont.x + L.cont.w / 2, L.cont.y + L.cont.h / 2);
    this.texts.hideRest();
  }

  private drawGraph(gr: BoardGraph, R: Rect): void {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 8).fill({ color: 0x0b0e16, alpha: 0.9 });
    const title = this.texts.take(`${gr.title} PER WAVE`, 18, INK);
    title.position.set(R.x + 14, R.y + 10);
    const left = R.x + 64;
    const right = R.x + R.w - 18;
    const top = R.y + 44;
    const bottom = R.y + R.h - 34;
    // ⛔ canon §7c C7: every path segment starts with moveTo, so no pen line joins two shapes.
    g.moveTo(left, top).lineTo(left, bottom).lineTo(right, bottom).stroke({ color: AXIS, width: 2 });
    const maxT = this.texts.take(groupThousands(gr.maxValue), 14, DIM, '400');
    maxT.anchor.set(1, 0.5);
    maxT.position.set(left - 8, top);
    const n = gr.waves.length;
    if (n === 0) return;
    const xAt = (i: number): number => (n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
    const yAt = (v: number): number => bottom - ((bottom - top) * v) / gr.maxValue;
    const step = Math.max(1, Math.ceil(n / 8));
    gr.waves.forEach((w, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const t = this.texts.take(`W${w}`, 13, DIM, '400');
      t.anchor.set(0.5, 0);
      t.position.set(xAt(i), bottom + 6);
    });
    for (const s of gr.series) {
      g.moveTo(xAt(0), yAt(s.values[0] ?? 0));
      for (let i = 1; i < n; i++) g.lineTo(xAt(i), yAt(s.values[i] ?? 0));
      g.stroke({ color: s.color, width: 3, alpha: 0.95 });
      for (let i = 0; i < n; i++) g.circle(xAt(i), yAt(s.values[i] ?? 0), 4).fill({ color: s.color });
    }
  }
}
