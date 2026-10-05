/**
 * SPARK — ⭐ S191 THE END-OF-MATCH STAT BOARD (the Pixi view). It draws `matchBoardModel` and decides nothing.
 * ⭐ S194 v2 — PAGES. Owner, S194: *"Maybe different types of graphs, maybe more interactive ones, maybe more
 * coherent ones … it seems like you just posted two of the same graphs there … Give you different pages that
 * you can go per player, like in Dota."*
 *
 *   OVERVIEW  — the table (place, survival marker, one badge it LEADS, the numbers) + the SCORE RACE lines.
 *   GRAPHS    — four charts in four FORMS, because they answer four questions: damage IN each wave (grouped
 *               bars), what each seat has standing (stacked area — its share of the board), kills IN each wave
 *               (stacked bars), and WHO HIT WHOM (a heatmap).
 *   P1 … Pn   — one page per seat: KPI tiles, its units raised / lost / killed by type (with portraits when
 *               the board's atlases are loaded), damage dealt and taken split UNITS / STRUCTURES / KEEP, who it
 *               hit and who hit it, and a per-wave ledger (dealt up, taken down).
 *
 * Hover any chart for a crosshair tooltip listing every seat at that wave; click a tab or an overview row;
 * ← / → / Tab switch pages. CONTINUE or R is still the only way out, and still waits `ARM_MS`.
 *
 * ## The three rules it lives by (S191, unchanged)
 *
 * - **No show()/hide().** `render(world, nowMs)` runs every frame and visibility is `model !== null`.
 * - **⛔ It owns the exit.** `main.ts` ignores canvas clicks while `isShowing()`; only CONTINUE (primary
 *   button) or R leaves — both refused until the board has been up `ARM_MS`.
 * - **No zIndex.** Its place is its staging line in `main.ts` (canon §7b, S189 C1).
 *
 * Geometry lives in ONE place, `matchBoardLayout.ts`, which the draw, the hover (`matchBoardTips.ts`) and the
 * click all read. Drawing is a pure function of (model, tab, hover, armed, pointer) — it redraws only when
 * that key changes, so an idle board costs one string compare a frame.
 */

import {
  Container, Graphics, Sprite, Text, TextStyle, type FederatedPointerEvent, type Texture,
} from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import type { RaceId } from '../state/races.ts';
import type { World } from '../state/worldTypes.ts';
import {
  CONTENT, CONTINUE_RECT, GRAPHS_SLOTS, OV_COLUMNS, PANEL, PP_LINE_H, graphsLayout, matrixCells,
  overviewLayout, playerLayout, plotRect, pointX, tabAt, tabIndex, tabRects, unitLinesThatFit,
  type BoardTab, type OvColumnKey, type Rect,
} from './matchBoardLayout.ts';
import {
  groupThousands, matchBoardModel, type BoardGraph, type BoardRow, type BoardSeries, type MatchBoardModel,
} from './matchBoardModel.ts';
import { softTexture } from './fx/softTextures.ts';
import { skinButtonFx, skinPanelFx } from './uiSkin.ts'; // ⭐ S194 — T5's one skin for every clickable
import { hoverAt, sameTarget, tooltipFor, type HoverTarget } from './matchBoardTips.ts';

/** ⚠ MINE — how long the board is up before CONTINUE / R may leave it. A fight's last click cannot skip it. */
export const ARM_MS = 1200;

/** Re-exported for the S191 tests and any caller that hit-tests the old way. */
export { CONTINUE_RECT } from './matchBoardLayout.ts';

const INK = 0xf2efe6;
const DIM = 0x7d8596;
const FAINT = 0x4a5264;
const PLATE = 0x10131c;
const CARD = 0x0b0e16;
const EDGE = 0xd8b45a;
const AXIS = 0x3a4050;
const GOOD = 0x6fd08a;
const BAD = 0xe2684a;
/** Losses and damage taken: a neutral slate, never red — four of the seat colours are warm, and a red seat's own bars would vanish into a red "taken". */
const LOSS = 0x8f98ad;
/** The three things damage lands on, always in this order and these colours. */
const SPLIT_COLORS = { units: 0x6fb7e8, structures: 0xd8b45a, keep: 0xe2684a } as const;
const FONT = ['Kanit', 'Impact', 'sans-serif'];
/** ⭐ S195 N14 (⚠ MINE) — a legend / line-end label's widest, and the LOST TO ENTROPY block on the local page's header. */
const LEGEND_LABEL_MAX = 120;
const ENTROPY_BLOCK_W = 180;

/** Looks up a creature portrait (an idle frame) — injected by `main.ts` so this chunk imports no renderer. */
export type BoardPortraitSource = (type: CreatureType, race: RaceId | null) => Texture | null;

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
    t.scale.set(1);
    t.alpha = 1;
    return t;
  }
  hideRest(): void { for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false; }
}

/** The same for the unit portraits. */
class SpritePool {
  private readonly items: Sprite[] = [];
  private used = 0;
  constructor(private readonly parent: Container) {}
  reset(): void { this.used = 0; }
  take(tex: Texture, cx: number, cy: number, box: number): Sprite {
    let s = this.items[this.used];
    if (s === undefined) {
      s = new Sprite();
      s.anchor.set(0.5, 0.5);
      this.items.push(s);
      this.parent.addChild(s);
    }
    this.used += 1;
    s.visible = true;
    s.texture = tex;
    const k = box / Math.max(1, tex.width, tex.height);
    s.scale.set(k, k);
    s.position.set(cx, cy);
    return s;
  }
  hideRest(): void { for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false; }
}

/**
 * A text's width ESTIMATED from its length, never measured. Measuring a Pixi Text needs a canvas (none in the
 * unit suite) and makes the layout depend on font loading; the estimate is deterministic and only ever used
 * to fit a label (scale-to-fit, legend spacing, tooltip width) — it never positions a hit target.
 */
export const estWidth = (text: string, size: number): number => Math.ceil(text.length * size * 0.62);

/**
 * ⭐ S195 N14 — the width a text WILL render at: Pixi's own measurement when a canvas exists (the browser —
 * Kanit 900 runs wider than the 0.62 em estimate, which is how a label "ran out of its box" while the estimate
 * said it fit), the estimate otherwise (the unit suite, or before any canvas). Never NaN, never 0 for a word.
 */
export function textWidth(t: Text): { width: number; measured: boolean } {
  const est = estWidth(t.text, Number(t.style.fontSize));
  try {
    const w = t.width / (t.scale.x === 0 ? 1 : t.scale.x);
    if (Number.isFinite(w) && w > 0) return { width: Math.max(w, 1), measured: true };
  } catch {
    // no canvas to measure with
  }
  return { width: est, measured: false };
}

/** One fitted text, as drawn — what `matchBoardFit.test.ts` measures against its box. */
export interface FitRecord { readonly text: string; readonly size: number; readonly max: number; readonly width: number; readonly scale: number; readonly measured: boolean }

const mix = (c: number, alpha: number): { color: number; alpha: number } => ({ color: c, alpha });

/** The cumulative stack tops of `series` at wave `i`, bottom first (placing order). */
function stackAt(series: readonly BoardSeries[], i: number): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of series) {
    t += s.values[i] ?? 0;
    out.push(t);
  }
  return out;
}

export class MatchBoard {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly glowLayer = new Container();
  private readonly iconLayer = new Container();
  private readonly textLayer = new Container();
  private readonly tipG = new Graphics();
  private readonly tipLayer = new Container();
  private readonly texts: TextPool;
  private readonly icons: SpritePool;
  private readonly tipTexts: TextPool;
  private glow: Sprite | null = null;
  private shownAtMs: number | null = null;
  private model: MatchBoardModel | null = null;
  private modelJson = '';
  private tab: BoardTab = { kind: 'overview' };
  private hover: HoverTarget | null = null;
  private pointer = { x: 0, y: 0 };
  private drawnKey = '';
  private portraits: BoardPortraitSource | null = null;
  /** ⭐ S195 N5 — the pointer is down on the board; the tab / row / CONTINUE under it is drawn 'press'. */
  private pressed = false;
  /** ⭐ S195 N14 — every text fitted this draw (the test's evidence; cleared per draw). */
  private fits: FitRecord[] = [];

  constructor(private readonly onContinue: () => void) {
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.addChild(this.g, this.glowLayer, this.iconLayer, this.textLayer, this.tipG, this.tipLayer);
    this.texts = new TextPool(this.textLayer);
    this.icons = new SpritePool(this.iconLayer);
    this.tipTexts = new TextPool(this.tipLayer);
    this.container.on('pointermove', (e: FederatedPointerEvent) => this.pointerMove(e.global.x, e.global.y));
    // ⭐ S195 N5 — the press latch: sink on the primary button's down, lift on up wherever the release lands.
    this.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return;
      this.pressed = true;
      this.pointerMove(e.global.x, e.global.y);
    });
    this.container.on('pointerup', () => { this.pressed = false; });
    this.container.on('pointerupoutside', () => { this.pressed = false; });
    this.container.on('pointertap', (e: FederatedPointerEvent) => {
      // ⛔ PRIMARY ONLY: right-click is the game's put-it-back / raid gesture (draftOverlay, S187).
      if (e.button !== 0) return;
      this.click(e.global.x, e.global.y, performance.now());
    });
  }

  /** `main.ts` hands over the board renderers' portrait lookup; until it does (or while null) a chip is drawn. */
  setPortraitSource(src: BoardPortraitSource | null): void {
    this.portraits = src;
    this.drawnKey = '';
  }

  /** Is the board up? `main.ts` swallows canvas clicks while it is. */
  isShowing(): boolean {
    return this.model !== null;
  }

  /** May CONTINUE / R leave yet? True when no board is up, so every other exit path is unchanged. */
  isArmed(nowMs: number): boolean {
    return this.shownAtMs === null || nowMs - this.shownAtMs >= ARM_MS;
  }

  /** The page on show (tests + DEV probe). */
  currentTab(): BoardTab {
    return this.tab;
  }

  /**
   * ⭐ S194 — the board's keys, while it is up: → / Tab next page, ← / Shift+Tab previous. Returns true when it
   * consumed the key (so `main.ts` can stop it reaching anything else). R is NOT consumed — it stays the exit.
   */
  handleKey(key: string, shift = false): boolean {
    if (this.model === null) return false;
    const count = 2 + this.model.rows.length;
    const i = tabIndex(this.tab);
    if (key === 'ArrowRight' || (key === 'Tab' && !shift)) {
      this.setTab(tabAt((i + 1) % count));
      return true;
    }
    if (key === 'ArrowLeft' || (key === 'Tab' && shift)) {
      this.setTab(tabAt((i - 1 + count) % count));
      return true;
    }
    return false;
  }

  /** A primary click at canvas (x, y): a tab, an overview row (→ that seat's page), or CONTINUE. */
  click(x: number, y: number, nowMs: number): void {
    const m = this.model;
    if (m === null) return;
    const h = hoverAt(m, this.tab, x, y);
    if (h === null) return;
    if (h.kind === 'continue') {
      if (this.isArmed(nowMs)) this.onContinue();
    } else if (h.kind === 'tab') {
      this.setTab(tabAt(h.index));
    } else if (h.kind === 'row') {
      this.setTab({ kind: 'player', index: h.index });
    }
  }

  private setTab(t: BoardTab): void {
    this.tab = t;
    this.hover = null;
  }

  private pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    const h = this.model === null ? null : hoverAt(this.model, this.tab, x, y);
    if (!sameTarget(h, this.hover)) this.hover = h;
  }

  /** Every frame, unconditionally. */
  render(world: World, nowMs: number): void {
    this.model = matchBoardModel(world);
    if (this.model === null) {
      this.shownAtMs = null;
      this.hover = null;
      this.tab = { kind: 'overview' };
      this.container.visible = false;
      return;
    }
    if (this.shownAtMs === null) {
      this.shownAtMs = nowMs;
      this.tab = { kind: 'overview' }; // every match opens on the overview
    }
    if (this.tab.kind === 'player' && this.tab.index >= this.model.rows.length) this.tab = { kind: 'overview' };
    this.container.visible = true;
    const armed = this.isArmed(nowMs);
    this.modelJson = JSON.stringify(this.model);
    // The pointer is in the key only while a tooltip follows it.
    const tipAt = tooltipFor(this.model, this.tab, this.hover) === null ? '' : `${this.pointer.x},${this.pointer.y}`;
    const iconsReady = this.portraits === null ? 0 : this.countPortraits(this.model);
    const key = `${this.modelJson}|${JSON.stringify(this.tab)}|${JSON.stringify(this.hover)}|${armed}|${tipAt}|${iconsReady}|${this.pressed}`;
    this.pulseGlow(nowMs);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.draw(this.model, armed);
  }

  private countPortraits(m: MatchBoardModel): number {
    let n = 0;
    for (const r of m.rows) for (const l of r.unitLines) if (this.portraits?.(l.type, r.raceId) != null) n += 1;
    return n;
  }

  /** The winner's glow breathes — the only per-frame work, an alpha on one sprite (fx substrate, `soft`). */
  private pulseGlow(nowMs: number): void {
    if (this.glow === null) return;
    this.glow.alpha = 0.32 + 0.12 * Math.sin(nowMs / 520);
  }

  private ensureGlow(color: number): void {
    if (this.glow === null) {
      try {
        // Browser-only (a canvas-built texture); in a unit test there is no document and the board simply
        // has no glow.
        if (typeof document === 'undefined') return;
        const tex = softTexture('soft');
        this.glow = new Sprite(tex);
        this.glow.anchor.set(0.5, 0.5);
        this.glow.blendMode = 'add';
        this.glowLayer.addChild(this.glow);
      } catch {
        return;
      }
    }
    this.glow.tint = color;
    this.glow.position.set(PANEL.x + PANEL.w / 2, PANEL.y + 52);
    this.glow.scale.set(14, 2.4);
  }

  /** ⭐ S195 N14 — the texts fitted by the last draw (tests). */
  fitsDrawn(): readonly FitRecord[] {
    return this.fits;
  }

  /** ⭐ S195 N5 — is the board's pointer down? (tests) */
  isPressed(): boolean {
    return this.pressed;
  }

  /**
   * ⭐ S195 N14 — THE ONE FIT RULE (⚠ MINE): scale a text DOWN (never up) so it fits `max`; never an ellipsis —
   * a shortened number or name on a stat board is a wrong number or name. Every text whose words come from the
   * model goes through here, and `matchBoardFit.test.ts` pins that mechanically (every dynamic `take` is followed
   * by a `fit`) and measures each record against its box.
   */
  private fit(t: Text, max: number): void {
    const { width, measured } = textWidth(t);
    const scale = width > max ? max / width : 1;
    t.scale.set(scale);
    this.fits.push({ text: t.text, size: Number(t.style.fontSize), max, width, scale, measured });
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────────
  // DRAW
  // ─────────────────────────────────────────────────────────────────────────────────────────────────

  private draw(m: MatchBoardModel, armed: boolean): void {
    const g = this.g;
    g.clear();
    this.tipG.clear();
    this.texts.reset();
    this.icons.reset();
    this.tipTexts.reset();
    this.fits = [];

    // The scrim swallows the board underneath; the plate carries everything.
    g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill(mix(0x05060a, 0.8));
    g.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 16).fill(mix(PLATE, 0.97));
    g.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 16).stroke({ color: EDGE, width: 2, alpha: 0.9 });
    skinPanelFx(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, m.headlineColor, 0, 16);
    // A band of the winner's colour along the top edge: the page is about them first.
    g.roundRect(PANEL.x + 2, PANEL.y + 2, PANEL.w - 4, 8, 4).fill(mix(m.headlineColor, 0.85));

    this.ensureGlow(m.headlineColor);
    const head = this.texts.take(`★  ${m.headline}  ★`, 46, m.headlineColor);
    head.anchor.set(0.5, 0);
    head.position.set(PANEL.x + PANEL.w / 2, PANEL.y + 24);
    this.fit(head, PANEL.w - 120);
    const sub = this.texts.take(m.subline, 16, DIM, '400');
    sub.anchor.set(0.5, 0);
    sub.position.set(PANEL.x + PANEL.w / 2, PANEL.y + 80);
    this.fit(sub, PANEL.w - 120);

    this.drawTabs(m);
    if (this.tab.kind === 'overview') this.drawOverview(m);
    else if (this.tab.kind === 'graphs') this.drawGraphsPage(m);
    else this.drawPlayerPage(m, m.rows[this.tab.index]!);

    // ── footer: the trust line, the keys, and the one way out ──
    const note = m.noStats
      ? 'this host sent no match stats (an older build) — places and scores only'
      : 'every number is in the units that float off a unit  ·  ← → or TAB to change page  ·  hover a chart';
    const n = this.texts.take(note, 15, DIM, '400');
    n.position.set(PANEL.x + 30, CONTINUE_RECT.y + 18);
    this.fit(n, CONTINUE_RECT.x - 24 - (PANEL.x + 30));
    const c = CONTINUE_RECT;
    const hot = this.hover?.kind === 'continue' && armed;
    g.roundRect(c.x, c.y, c.w, c.h, 10).fill({ color: armed ? EDGE : AXIS, alpha: armed ? (hot ? 1 : 0.92) : 0.6 });
    // ⭐ S194 — the shared skin (T5), laid INSIDE the rect `hoverAt` tests; disabled (hatched) until armed.
    // ⭐ S195 N5 — and 'press' while the pointer is down on it.
    skinButtonFx(g, c.x, c.y, c.w, c.h, { accent: 0xffffff, state: armed ? (hot ? (this.pressed ? 'press' : 'hover') : 'rest') : 'disabled', radius: 10 });
    const ct = this.texts.take('CONTINUE  (R)', 22, armed ? PLATE : DIM);
    ct.anchor.set(0.5, 0.5);
    ct.position.set(c.x + c.w / 2, c.y + c.h / 2);

    this.drawTooltip(m);
    this.texts.hideRest();
    this.icons.hideRest();
    this.tipTexts.hideRest();
  }

  private drawTabs(m: MatchBoardModel): void {
    const g = this.g;
    const rects = tabRects(m.rows.length);
    const current = tabIndex(this.tab);
    rects.forEach((r, i) => {
      const row = i >= 2 ? m.rows[i - 2] : undefined;
      const on = i === current;
      const hot = this.hover?.kind === 'tab' && this.hover.index === i;
      const accent = row?.color ?? EDGE;
      g.roundRect(r.x, r.y, r.w, r.h, 9).fill(mix(on ? accent : CARD, on ? 0.28 : hot ? 0.95 : 0.85));
      skinButtonFx(g, r.x, r.y, r.w, r.h, { accent, state: on ? 'active' : hot ? (this.pressed ? 'press' : 'hover') : 'rest', radius: 9 });
      g.roundRect(r.x, r.y, r.w, r.h, 9).stroke({ color: on ? accent : hot ? INK : AXIS, width: on ? 2 : 1, alpha: 0.9 });
      if (row !== undefined) g.rect(r.x + 10, r.y + 12, 6, r.h - 24).fill(mix(row.color, 1));
      const label = i === 0 ? 'OVERVIEW' : i === 1 ? 'GRAPHS' : `${row!.label} ${row!.race}${row!.isLocal ? ' ·YOU' : ''}`;
      const t = this.texts.take(label, r.w < 170 ? 15 : 18, on ? INK : row !== undefined ? row.color : DIM);
      t.anchor.set(0.5, 0.5);
      t.position.set(r.x + r.w / 2 + (row !== undefined ? 6 : 0), r.y + r.h / 2);
      this.fit(t, r.w - 28 - (row !== undefined ? 12 : 0));
    });
  }

  // ── OVERVIEW ─────────────────────────────────────────────────────────────────────────────────

  private drawOverview(m: MatchBoardModel): void {
    const g = this.g;
    const L = overviewLayout(m.rows.length);
    const maxOf = new Map<string, number>();
    for (const c of OV_COLUMNS) if (c.num) maxOf.set(c.key, Math.max(1, ...m.rows.map((r) => ovValue(r, c.key))));
    for (const c of OV_COLUMNS) {
      const t = this.texts.take(c.head, 15, DIM);
      t.anchor.set(c.num ? 1 : 0, 0);
      t.position.set(CONTENT.x + c.x + (c.num ? c.w - 6 : 0), CONTENT.y + 8);
    }
    m.rows.forEach((row, i) => {
      const r = L.rows[i]!;
      const hot = this.hover?.kind === 'row' && this.hover.index === i;
      g.roundRect(r.x, r.y, r.w, r.h, 8).fill(mix(row.color, hot ? 0.16 : row.isLocal ? 0.09 : 0.04));
      skinButtonFx(g, r.x, r.y, r.w, r.h, { accent: row.color, state: hot ? (this.pressed ? 'press' : 'hover') : 'rest', radius: 8, studs: false });
      if (hot) g.roundRect(r.x, r.y, r.w, r.h, 8).stroke({ color: row.color, width: 2, alpha: 0.9 });
      g.rect(r.x, r.y + 6, 5, r.h - 12).fill(mix(row.color, 1)); // the seat's colour, always on the edge
      for (const c of OV_COLUMNS) {
        const x0 = CONTENT.x + c.x;
        if (c.num) {
          // Bar-in-cell: each column reads as a tiny bar chart (S179 research — people scan a column).
          const frac = ovValue(row, c.key) / maxOf.get(c.key)!;
          if (frac > 0) g.roundRect(x0 + c.w * (1 - frac), r.y + 8, c.w * frac, r.h - 16, 4).fill(mix(row.color, 0.22));
          const t = this.texts.take(ovText(row, c.key), 23, row.color);
          t.anchor.set(1, 0.5);
          t.position.set(x0 + c.w - 6, r.y + r.h / 2);
          this.fit(t, c.w - 12);
        } else if (c.key === 'place') {
          const t = this.texts.take(row.placeLabel, 24, row.isWinner ? EDGE : INK);
          t.anchor.set(0, 0.5);
          t.position.set(x0, r.y + r.h / 2);
          this.fit(t, c.w - 4);
        } else if (c.key === 'player') {
          const name = this.texts.take(`${row.isWinner ? '★ ' : ''}${row.label}  ${row.race}${row.isLocal ? '   YOU' : ''}`, 22, row.color);
          name.position.set(x0, r.y + 5);
          this.fit(name, c.w - 8);
          const badge = this.texts.take(row.badge ?? ' ', 13, EDGE, '400');
          badge.position.set(x0 + 2, r.y + 31);
          this.fit(badge, c.w - 8);
        } else if (c.key === 'status') {
          const standing = !row.out;
          g.roundRect(x0, r.y + 12, c.w - 10, r.h - 24, (r.h - 24) / 2).fill(mix(standing ? GOOD : BAD, 0.18));
          g.roundRect(x0, r.y + 12, c.w - 10, r.h - 24, (r.h - 24) / 2).stroke({ color: standing ? GOOD : BAD, width: 1, alpha: 0.8 });
          const t = this.texts.take(row.status, 14, standing ? GOOD : BAD);
          t.anchor.set(0.5, 0.5);
          t.position.set(x0 + (c.w - 10) / 2, r.y + r.h / 2);
          this.fit(t, c.w - 22);
        }
      }
    });
    this.drawChart(m.graphs.score, L.chart, 'score');
  }

  // ── GRAPHS ───────────────────────────────────────────────────────────────────────────────────

  private drawGraphsPage(m: MatchBoardModel): void {
    const G = graphsLayout();
    for (const slot of GRAPHS_SLOTS) {
      if (slot === 'matrix') this.drawMatrix(m, G.matrix);
      else this.drawChart(m.graphs[slot], G[slot], slot);
    }
  }

  /** A chart frame: card, title, caption, axes, y labels. Returns the plot rect. */
  private frame(R: Rect, title: string, caption: string, maxValue: number, legend: readonly BoardSeries[]): Rect {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    g.roundRect(R.x, R.y, R.w, R.h, 10).stroke({ color: AXIS, width: 1, alpha: 0.8 });
    // Legend chips, right-aligned on the title line; the title and caption fit what the legend leaves.
    let lx = R.x + R.w - 16;
    for (let i = legend.length - 1; i >= 0; i--) {
      const s = legend[i]!;
      const lt = this.texts.take(s.label, 13, s.color);
      lt.anchor.set(1, 0);
      lt.position.set(lx, R.y + 14);
      this.fit(lt, LEGEND_LABEL_MAX);
      lx -= Math.min(LEGEND_LABEL_MAX, estWidth(lt.text, 13)) + 6;
      g.roundRect(lx - 12, R.y + 17, 12, 12, 3).fill(mix(s.color, 1));
      lx -= 26;
    }
    const t = this.texts.take(title, 19, INK);
    t.position.set(R.x + 16, R.y + 10);
    this.fit(t, lx - 8 - (R.x + 16));
    const c = this.texts.take(caption, 13, DIM, '400');
    c.position.set(R.x + 16, R.y + 36);
    this.fit(c, R.w - 32);
    const P = plotRect(R);
    // ⛔ canon §7c C7: every path segment starts with moveTo, so no pen line joins two shapes.
    for (const f of [0.5, 1]) {
      g.moveTo(P.x, P.y + P.h * (1 - f)).lineTo(P.x + P.w, P.y + P.h * (1 - f)).stroke({ color: FAINT, width: 1, alpha: 0.5 });
    }
    g.moveTo(P.x, P.y).lineTo(P.x, P.y + P.h).lineTo(P.x + P.w, P.y + P.h).stroke({ color: AXIS, width: 2 });
    for (const [v, y] of [[maxValue, P.y], [Math.round(maxValue / 2), P.y + P.h / 2], [0, P.y + P.h]] as const) {
      const yl = this.texts.take(groupThousands(v), 13, DIM, '400');
      yl.anchor.set(1, 0.5);
      yl.position.set(P.x - 8, y);
      this.fit(yl, P.x - 8 - (R.x + 4));
    }
    return P;
  }

  private waveLabels(P: Rect, waves: readonly number[], groups: boolean): void {
    const n = waves.length;
    const step = Math.max(1, Math.ceil(n / 10));
    waves.forEach((w, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const t = this.texts.take(`W${w}`, 12, DIM, '400');
      t.anchor.set(0.5, 0);
      t.position.set(groups ? P.x + (P.w * (i + 0.5)) / n : pointX(P, n, i), P.y + P.h + 6);
      this.fit(t, Math.max(16, (P.w / n) * step - 4));
    });
  }

  private hoveredWave(chart: string): number | null {
    const h = this.hover;
    return h !== null && h.kind === 'wave' && h.chart === chart ? h.index : null;
  }

  private drawChart(gr: BoardGraph, R: Rect, chart: 'score' | 'damage' | 'built' | 'kills'): void {
    const g = this.g;
    const P = this.frame(R, gr.title, gr.caption, gr.maxValue, gr.series);
    const n = gr.waves.length;
    if (n === 0) {
      const t = this.texts.take('no wave has closed yet', 15, DIM, '400');
      t.anchor.set(0.5, 0.5);
      t.position.set(P.x + P.w / 2, P.y + P.h / 2);
      return;
    }
    const hw = this.hoveredWave(chart);
    const yAt = (v: number): number => P.y + P.h - (P.h * v) / gr.maxValue;
    const groups = gr.form === 'bars' || gr.form === 'stackedBars';
    this.waveLabels(P, gr.waves, groups);
    const gw = P.w / n;
    if (groups && hw !== null) g.rect(P.x + gw * hw, P.y, gw, P.h).fill(mix(INK, 0.06));

    switch (gr.form) {
      case 'lines': {
        if (hw !== null) {
          const x = pointX(P, n, hw);
          g.moveTo(x, P.y).lineTo(x, P.y + P.h).stroke({ color: INK, width: 1, alpha: 0.45 });
        }
        for (const s of gr.series) {
          if (n > 1) {
            g.moveTo(pointX(P, n, 0), yAt(s.values[0] ?? 0));
            for (let i = 1; i < n; i++) g.lineTo(pointX(P, n, i), yAt(s.values[i] ?? 0));
            g.stroke({ color: s.color, width: 3, alpha: 0.95 });
          }
          for (let i = 0; i < n; i++) {
            g.circle(pointX(P, n, i), yAt(s.values[i] ?? 0), i === hw ? 7 : 4).fill(mix(s.color, 1));
          }
          // The line's end carries its label, so a reader never has to map colours back to the legend.
          const end = this.texts.take(s.label, 13, s.color);
          end.anchor.set(1, 1);
          end.position.set(pointX(P, n, n - 1) - 6, yAt(s.values[n - 1] ?? 0) - 6);
          this.fit(end, LEGEND_LABEL_MAX);
        }
        break;
      }
      case 'bars': {
        const k = gr.series.length;
        const bw = (gw * 0.78) / Math.max(1, k);
        for (let i = 0; i < n; i++) {
          gr.series.forEach((s, j) => {
            const v = s.values[i] ?? 0;
            if (v <= 0) return;
            const x = P.x + gw * i + gw * 0.11 + bw * j;
            g.rect(x, yAt(v), Math.max(1, bw - 1), P.y + P.h - yAt(v)).fill(mix(s.color, hw === null || hw === i ? 0.95 : 0.55));
          });
        }
        break;
      }
      case 'stackedBars': {
        for (let i = 0; i < n; i++) {
          const tops = stackAt(gr.series, i);
          let base = 0;
          gr.series.forEach((s, j) => {
            const top = tops[j]!;
            if (top > base) {
              g.rect(P.x + gw * i + gw * 0.15, yAt(top), gw * 0.7, yAt(base) - yAt(top))
                .fill(mix(s.color, hw === null || hw === i ? 0.95 : 0.55));
            }
            base = top;
          });
        }
        break;
      }
      case 'stackedArea': {
        // Bottom-up bands; with one wave the band is a short plateau so it still reads as an area.
        const xs = n === 1
          ? [P.x + P.w / 2 - 30, P.x + P.w / 2 + 30]
          : Array.from({ length: n }, (_, i) => pointX(P, n, i));
        const at = (i: number): number => (n === 1 ? 0 : i);
        const lower = xs.map(() => 0);
        gr.series.forEach((s) => {
          const upper = xs.map((_, i) => lower[i]! + (s.values[at(i)] ?? 0));
          const pts: number[] = [];
          xs.forEach((x, i) => pts.push(x, yAt(upper[i]!)));
          for (let i = xs.length - 1; i >= 0; i--) pts.push(xs[i]!, yAt(lower[i]!));
          if (upper.some((u, i) => u > lower[i]!)) {
            g.poly(pts).fill(mix(s.color, 0.62));
            g.moveTo(xs[0]!, yAt(upper[0]!));
            for (let i = 1; i < xs.length; i++) g.lineTo(xs[i]!, yAt(upper[i]!));
            g.stroke({ color: s.color, width: 2, alpha: 1 });
          }
          for (let i = 0; i < xs.length; i++) lower[i] = upper[i]!;
        });
        if (hw !== null) {
          const x = n === 1 ? P.x + P.w / 2 : pointX(P, n, hw);
          g.moveTo(x, P.y).lineTo(x, P.y + P.h).stroke({ color: INK, width: 1, alpha: 0.6 });
        }
        break;
      }
    }
  }

  private drawMatrix(m: MatchBoardModel, R: Rect): void {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    g.roundRect(R.x, R.y, R.w, R.h, 10).stroke({ color: AXIS, width: 1, alpha: 0.8 });
    const t = this.texts.take('WHO HIT WHOM', 19, INK);
    t.position.set(R.x + 16, R.y + 10);
    const c = this.texts.take('row dealt it to column · rows add up to DEALT, columns to TAKEN', 13, DIM, '400');
    c.position.set(R.x + 16, R.y + 36);
    const M = m.matrix;
    const { cells, rowLabelX, colLabelY } = matrixCells(R, M.rows.length, M.cols.length);
    const hc = this.hover?.kind === 'cell' ? this.hover : null;
    M.cols.forEach((col, j) => {
      const r = cells[0]?.[j];
      if (r === undefined) return;
      const lt = this.texts.take(`→ ${col.label}`, 14, col.color);
      lt.anchor.set(0.5, 0);
      lt.position.set(r.x + r.w / 2, colLabelY);
      this.fit(lt, r.w);
    });
    M.rows.forEach((rowAxis, i) => {
      const row = cells[i]!;
      const rl = this.texts.take(rowAxis.label, 15, rowAxis.color);
      rl.anchor.set(0, 0.5);
      rl.position.set(rowLabelX, row[0]!.y + row[0]!.h / 2);
      this.fit(rl, 104);
      row.forEach((r, j) => {
        const v = M.cells[i]![j]!;
        // ⭐ S194 (audit) — the diagonal is the seat's SELF-hits: taken, never dealt, so drawn as a dim cell.
        const self = rowAxis.seat !== null && rowAxis.seat === M.cols[j]!.seat;
        const frac = self ? 0 : v / M.maxValue;
        g.roundRect(r.x, r.y, r.w, r.h, 6).fill(self ? mix(FAINT, 0.18) : mix(rowAxis.color, 0.08 + 0.8 * frac));
        const hot = hc !== null && hc.attacker === i && hc.victim === j;
        if (hot) g.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ color: INK, width: 2 });
        if (r.h >= 22 && (!self || v > 0)) {
          const vt = this.texts.take(groupThousands(v), Math.min(18, Math.max(11, r.h / 3)), self ? DIM : frac > 0.55 ? PLATE : INK);
          vt.anchor.set(0.5, 0.5);
          vt.position.set(r.x + r.w / 2, r.y + r.h / 2);
          this.fit(vt, r.w - 6);
        }
      });
    });
  }

  // ── PLAYER PAGE ──────────────────────────────────────────────────────────────────────────────

  private drawPlayerPage(m: MatchBoardModel, row: BoardRow): void {
    const g = this.g;
    const L = playerLayout();
    // Header band in the seat's colour.
    const H = L.header;
    g.roundRect(H.x, H.y, H.w, H.h, 10).fill(mix(row.color, 0.16));
    g.roundRect(H.x, H.y, 10, H.h, 5).fill(mix(row.color, 1));
    const place = this.texts.take(row.placeLabel, 40, row.isWinner ? EDGE : INK);
    place.anchor.set(0, 0.5);
    place.position.set(H.x + 28, H.y + H.h / 2);
    this.fit(place, 92);
    const standing = !row.out;
    const pill: Rect = { x: H.x + H.w - 190, y: H.y + 18, w: 170, h: H.h - 36 };
    /*
     * ⭐ S195 N12 / B-17 — LOST TO ENTROPY, on the LOCAL seat's page ONLY (*"only the player itself will see it,
     * not all players"*): a dim label over the number, left of the status pill. Another seat's page never
     * prints it, whatever its counter says.
     */
    const entropyW = row.isLocal ? ENTROPY_BLOCK_W : 0;
    if (row.isLocal) {
      const ex = pill.x - 24;
      const el = this.texts.take('LOST TO ENTROPY', 13, DIM, '400');
      el.anchor.set(1, 0.5);
      el.position.set(ex, H.y + H.h / 2 - 14);
      this.fit(el, ENTROPY_BLOCK_W);
      const ev = this.texts.take(`${groupThousands(row.lostToEntropy)} connector${row.lostToEntropy === 1 ? '' : 's'}`, 20, INK);
      ev.anchor.set(1, 0.5);
      ev.position.set(ex, H.y + H.h / 2 + 10);
      this.fit(ev, ENTROPY_BLOCK_W);
    }
    const name = this.texts.take(`${row.isWinner ? '★ ' : ''}${row.label}  ${row.race}${row.isLocal ? '   YOU' : ''}`, 32, row.color);
    name.anchor.set(0, 0.5);
    name.position.set(H.x + 128, H.y + H.h / 2 - 8);
    this.fit(name, pill.x - 24 - entropyW - 24 - (H.x + 128));
    const bl = this.texts.take(row.badge ?? `finished ${row.placeLabel} of ${m.rows.length}`, 15, row.badge !== null ? EDGE : DIM, '400');
    bl.position.set(H.x + 130, H.y + H.h / 2 + 14);
    this.fit(bl, pill.x - 24 - entropyW - 24 - (H.x + 130));
    g.roundRect(pill.x, pill.y, pill.w, pill.h, pill.h / 2).fill(mix(standing ? GOOD : BAD, 0.2));
    g.roundRect(pill.x, pill.y, pill.w, pill.h, pill.h / 2).stroke({ color: standing ? GOOD : BAD, width: 2 });
    const st = this.texts.take(row.status, 18, standing ? GOOD : BAD);
    st.anchor.set(0.5, 0.5);
    st.position.set(pill.x + pill.w / 2, pill.y + pill.h / 2);
    this.fit(st, pill.w - 24);

    // KPI tiles.
    const tiles: Array<[string, string]> = [
      ['SCORE', groupThousands(row.score)],
      ['UNITS RAISED', groupThousands(row.units)],
      ['ENEMY KILLS', groupThousands(row.kills)],
      ['UNITS LOST', groupThousands(row.lost)],
      ['TOWERS BUILT / FELL', `${row.towersBuilt} / ${row.towersFell}`],
      ['PEAK CONNECTORS', groupThousands(row.peakBuilt)],
    ];
    tiles.forEach(([label, value], i) => {
      const r = L.tiles[i]!;
      g.roundRect(r.x, r.y, r.w, r.h, 10).fill(mix(CARD, 0.95));
      g.roundRect(r.x, r.y, r.w, 4, 2).fill(mix(row.color, 0.9));
      const v = this.texts.take(value, 32, INK);
      v.anchor.set(0.5, 0);
      v.position.set(r.x + r.w / 2, r.y + 12);
      this.fit(v, r.w - 24);
      const l = this.texts.take(label, 13, DIM, '400');
      l.anchor.set(0.5, 0);
      l.position.set(r.x + r.w / 2, r.y + 58);
      this.fit(l, r.w - 16);
    });

    this.drawUnitLedger(row, L.units);
    this.drawDamageSplit(row, L.damage);
    this.drawVersus(row, L.versus);
    this.drawWaveLedger(m, row, L.ledger);
  }

  private drawUnitLedger(row: BoardRow, R: Rect): void {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    const t = this.texts.take('UNITS', 19, INK);
    t.position.set(R.x + 16, R.y + 10);
    const cols = [
      { head: 'RAISED', x: R.x + 250, color: row.color, of: (l: BoardRow['unitLines'][number]) => l.built },
      { head: 'LOST', x: R.x + 250 + (R.w - 270) / 3, color: LOSS, of: (l: BoardRow['unitLines'][number]) => l.lost },
      { head: 'KILLED', x: R.x + 250 + (2 * (R.w - 270)) / 3, color: GOOD, of: (l: BoardRow['unitLines'][number]) => l.killed },
    ];
    const cw = (R.w - 270) / 3 - 12;
    for (const c of cols) {
      const h = this.texts.take(c.head, 13, DIM);
      h.position.set(c.x, R.y + 16);
    }
    const lines = row.unitLines;
    const fit = unitLinesThatFit(R);
    const shown = lines.slice(0, fit);
    const maxV = Math.max(1, ...lines.flatMap((l) => [l.built, l.lost, l.killed]));
    shown.forEach((l, i) => {
      const y = R.y + 50 + i * PP_LINE_H;
      if (i % 2 === 0) g.rect(R.x + 8, y - 2, R.w - 16, PP_LINE_H - 2).fill(mix(INK, 0.025));
      const cx = R.x + 30;
      const cy = y + (PP_LINE_H - 4) / 2;
      const tex = this.portraits?.(l.type, row.raceId) ?? null;
      if (tex !== null) {
        g.circle(cx, cy, 15).fill(mix(row.color, 0.18));
        this.icons.take(tex, cx, cy, 30);
      } else {
        g.circle(cx, cy, 13).fill(mix(row.color, 0.35));
        const ini = this.texts.take(l.name.slice(0, 1), 14, INK);
        ini.anchor.set(0.5, 0.5);
        ini.position.set(cx, cy);
        this.fit(ini, 24);
      }
      const nm = this.texts.take(l.name, 16, INK, '400');
      nm.anchor.set(0, 0.5);
      nm.position.set(R.x + 54, cy);
      this.fit(nm, 186);
      for (const c of cols) {
        const v = c.of(l);
        const w = (cw - 48) * (v / maxV);
        if (v > 0) g.roundRect(c.x, cy - 8, Math.max(2, w), 16, 4).fill(mix(c.color, 0.75));
        const vt = this.texts.take(v === 0 ? '·' : groupThousands(v), 15, v === 0 ? FAINT : INK);
        vt.anchor.set(0, 0.5);
        vt.position.set(c.x + Math.max(2, w) + 6, cy);
        this.fit(vt, Math.max(12, cw - Math.max(2, w) - 6));
      }
    });
    if (lines.length === 0) {
      const e = this.texts.take('no units this match', 15, DIM, '400');
      e.position.set(R.x + 16, R.y + 56);
    } else if (lines.length > fit) {
      const more = this.texts.take(`+ ${lines.length - fit} more types`, 13, DIM, '400');
      more.position.set(R.x + 16, R.y + R.h - 22);
      this.fit(more, R.w - 32);
    }
  }

  private drawDamageSplit(row: BoardRow, R: Rect): void {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    const t = this.texts.take('DAMAGE — WHAT IT LANDED ON', 19, INK);
    t.position.set(R.x + 16, R.y + 10);
    // Legend.
    let lx = R.x + R.w - 16;
    for (const [k, label] of [['keep', 'KEEP'], ['structures', 'STRUCTURES'], ['units', 'UNITS']] as const) {
      const lt = this.texts.take(label, 13, SPLIT_COLORS[k]);
      lt.anchor.set(1, 0);
      lt.position.set(lx, R.y + 14);
      this.fit(lt, LEGEND_LABEL_MAX);
      lx -= estWidth(lt.text, 13) + 6;
      g.roundRect(lx - 12, R.y + 17, 12, 12, 3).fill(mix(SPLIT_COLORS[k], 1));
      lx -= 26;
    }
    const maxT = Math.max(1, row.dealt, row.taken);
    const barX = R.x + 110;
    const barW = R.w - 110 - 150;
    ([['DEALT', row.dealtSplit, R.y + 52], ['TAKEN', row.takenSplit, R.y + 100]] as const).forEach(([label, sp, y]) => {
      const lt = this.texts.take(label, 16, DIM);
      lt.anchor.set(0, 0.5);
      lt.position.set(R.x + 16, y + 15);
      this.fit(lt, barX - 8 - (R.x + 16));
      g.roundRect(barX, y, barW, 30, 6).fill(mix(FAINT, 0.25));
      let x = barX;
      for (const k of ['units', 'structures', 'keep'] as const) {
        const w = (barW * sp[k]) / maxT;
        if (w > 0) g.rect(x, y, w, 30).fill(mix(SPLIT_COLORS[k], 0.85));
        if (w > 64) {
          const st = this.texts.take(groupThousands(sp[k]), 13, PLATE);
          st.anchor.set(0.5, 0.5);
          st.position.set(x + w / 2, y + 15);
          this.fit(st, w - 8);
        }
        x += w;
      }
      const tt = this.texts.take(groupThousands(sp.total), 20, INK);
      tt.anchor.set(1, 0.5);
      tt.position.set(R.x + R.w - 16, y + 15);
      this.fit(tt, 150 - 24);
    });
  }

  private drawVersus(row: BoardRow, R: Rect): void {
    const g = this.g;
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    const half = (R.w - 30) / 2;
    ([['DEALT TO', row.dealtTo, R.x + 10], ['TAKEN FROM', row.takenFrom, R.x + 20 + half]] as const).forEach(([title, list, x0]) => {
      const t = this.texts.take(title, 16, INK);
      t.position.set(x0 + 6, R.y + 10);
      this.fit(t, half - 12);
      const maxA = Math.max(1, ...list.map((a) => a.amount));
      const lineH = Math.min(26, (R.h - 44) / Math.max(1, list.length));
      if (list.length === 0) {
        const e = this.texts.take('nobody', 14, DIM, '400');
        e.position.set(x0 + 6, R.y + 44);
      }
      list.forEach((a, i) => {
        const y = R.y + 40 + i * lineH;
        const lt = this.texts.take(a.label, 14, a.color);
        lt.anchor.set(0, 0.5);
        lt.position.set(x0 + 6, y + lineH / 2);
        this.fit(lt, 78 - 10);
        const bw = (half - 170) * (a.amount / maxA);
        g.roundRect(x0 + 78, y + 4, Math.max(2, bw), lineH - 8, 4).fill(mix(a.color, 0.8));
        const vt = this.texts.take(groupThousands(a.amount), 14, INK);
        vt.anchor.set(0, 0.5);
        vt.position.set(x0 + 84 + Math.max(2, bw), y + lineH / 2);
        this.fit(vt, Math.max(12, x0 + half - 6 - (x0 + 84 + Math.max(2, bw))));
      });
    });
  }

  /** Per wave: what this seat dealt (up, its colour) and took (down, red). Hover a wave for both numbers. */
  private drawWaveLedger(m: MatchBoardModel, row: BoardRow, R: Rect): void {
    const g = this.g;
    const dealt = m.graphs.damage.series.find((s) => s.seat === row.seat)?.values ?? [];
    const taken = m.takenPerWave.find((s) => s.seat === row.seat)?.values ?? [];
    const maxV = Math.max(1, ...dealt, ...taken);
    g.roundRect(R.x, R.y, R.w, R.h, 10).fill(mix(CARD, 0.92));
    const t = this.texts.take('WAVE BY WAVE', 19, INK);
    t.position.set(R.x + 16, R.y + 10);
    const c = this.texts.take('dealt above the line · taken below it', 13, DIM, '400');
    c.position.set(R.x + 16, R.y + 36);
    const P = plotRect(R);
    const mid = P.y + P.h / 2;
    g.moveTo(P.x, mid).lineTo(P.x + P.w, mid).stroke({ color: AXIS, width: 2 });
    // ⭐ S194 (audit T10 LOW-3) — the axis says which half is which, so a reader never needs the caption.
    for (const [label, y, color] of [['DEALT ▲', mid - 12, row.color], ['TAKEN ▼', mid + 12, LOSS]] as const) {
      const al = this.texts.take(label, 13, color);
      al.anchor.set(1, 0.5);
      al.position.set(P.x - 8, y);
      this.fit(al, P.x - 8 - (R.x + 4));
    }
    for (const [v, y] of [[maxV, P.y], [maxV, P.y + P.h]] as const) {
      const yl = this.texts.take(groupThousands(v), 12, DIM, '400');
      yl.anchor.set(1, 0.5);
      yl.position.set(P.x - 8, y);
      this.fit(yl, P.x - 8 - (R.x + 4));
    }
    const n = m.graphs.damage.waves.length;
    if (n === 0) return;
    this.waveLabels({ ...P, h: P.h }, m.graphs.damage.waves, true);
    const gw = P.w / n;
    const hw = this.hover?.kind === 'ledger' ? this.hover.index : null;
    if (hw !== null) g.rect(P.x + gw * hw, P.y, gw, P.h).fill(mix(INK, 0.06));
    for (let i = 0; i < n; i++) {
      const up = ((P.h / 2) * (dealt[i] ?? 0)) / maxV;
      const dn = ((P.h / 2) * (taken[i] ?? 0)) / maxV;
      const x = P.x + gw * i + gw * 0.18;
      const a = hw === null || hw === i ? 0.92 : 0.55;
      if (up > 0) g.rect(x, mid - up, gw * 0.64, up).fill(mix(row.color, a));
      if (dn > 0) g.rect(x, mid, gw * 0.64, dn).fill(mix(LOSS, a * 0.8));
    }
  }

  // ── TOOLTIP ──────────────────────────────────────────────────────────────────────────────────

  private drawTooltip(m: MatchBoardModel): void {
    const lines = tooltipFor(m, this.tab, this.hover);
    if (lines === null) return;
    const texts = lines.map((l, i) => this.tipTexts.take(l.text, i === 0 ? 15 : 14, l.color ?? (i === 0 ? EDGE : INK), i === 0 ? '900' : '400'));
    const w = Math.max(...texts.map((t) => estWidth(t.text, Number(t.style.fontSize)))) + 24;
    const h = texts.length * 20 + 16;
    let x = this.pointer.x + 18;
    let y = this.pointer.y + 18;
    if (x + w > CANVAS_WIDTH - 8) x = this.pointer.x - 18 - w;
    if (y + h > CANVAS_HEIGHT - 8) y = this.pointer.y - 18 - h;
    this.tipG.roundRect(x, y, w, h, 8).fill(mix(0x05060a, 0.94));
    this.tipG.roundRect(x, y, w, h, 8).stroke({ color: EDGE, width: 1, alpha: 0.8 });
    texts.forEach((t, i) => t.position.set(x + 12, y + 8 + i * 20));
  }
}

function ovValue(row: BoardRow, key: OvColumnKey): number {
  switch (key) {
    case 'score': return row.score;
    case 'units': return row.units;
    case 'kills': return row.kills;
    case 'lost': return row.lost;
    case 'towers': return row.towersBuilt;
    case 'dealt': return row.dealt;
    case 'taken': return row.taken;
    default: return 0;
  }
}

function ovText(row: BoardRow, key: OvColumnKey): string {
  if (key === 'towers') return `${row.towersBuilt} / ${row.towersFell}`;
  return groupThousands(ovValue(row, key));
}
