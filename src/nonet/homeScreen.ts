/**
 * SPARK — S196 #16: **THE NONET HOME — "a front door"** (Option A of
 * `.claude/plans/S195_NONET_HOME_OPTIONS.md`, owner-approved S196).
 *
 * Owner, R194-25: NONET is its own game and gets a home screen. Before this, clicking NONET on the
 * ARCADE menu dropped you straight into a random grid with the clock running — "that drop-straight-in
 * is what you called wrong". Now the row opens THIS page, in the arcade's own skin (glowing title,
 * living backdrop, the kami as the hero), with six doors:
 *
 *   PLAY    — the timed run, exactly as before (fresh grid, the `nonet` average board)
 *   CAMPAIGN — (Option B, R196-D2) 3 bands × 10 stages, one board per stage (`nonet:s07`)
 *   DAILY   — one grid per UTC day, the same for everyone, its own board (`nonet:dYYYYMMDD`)
 *   ZEN     — no clock, no board
 *   RANKING — the boards you have put your name on (R182-G's reveal gate kept — `rankingView.ts`)
 *   BACK    — the ARCADE menu
 *
 * ## ⛔ RENDER STATE ONLY, AND THE GAME ITSELF IS UNTOUCHED
 *
 * This page owns no puzzle. A door calls `hooks.onDoor`; `main.ts` mints the puzzle through the SAME
 * `makeArcadeNonet` + `SudokuOverlay` override seam the arcade always used. Nothing here reads or
 * writes `world`, and the match trial (`sudokuEvent.ts`, `generateSudoku(seed)`) is not imported.
 *
 * ## ⭐ ONE MOUNT CALL — `mountNonetHome`
 *
 * `main.ts` lazy-imports this chunk and calls `mountNonetHome` once. Option B's CAMPAIGN (R196-D2) is a
 * row in `NONET_HOME_DOORS` + an arm in `nonetModes.planLaunch` + the stage/star strip + the campaign
 * HUD this page owns; Option C (its own `/nonet/` page, not built) would mount the same class into its
 * own Pixi stage.
 *
 * ## The hit-test is MECHANICAL (S182 rule 2)
 *
 * Every button's hit rect is its geometry row, `hitTest` reads the same pure geometry, and
 * `nonetHome.reach.test.ts` counts the `attachButtonFeedback` calls against the rows, so a new button
 * without a geometry row (or the reverse) turns the suite red.
 */
import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { attachButtonFeedback } from '../render/buttonFeedback.ts';
import { skinIcon, skinPanelFx, type SkinIconKind } from '../render/uiSkin.ts';
import { attachHoverSheen, skinStaticPlate } from '../render/uiSkinButton.ts';
import { glowTitleStyle, LazyScreenBackdrop, type ScreenAccent } from '../render/uiScreenChrome.ts';
import { fitTextToWidth } from '../render/textFit.ts';
import { formatTime } from '../render/arcadeScores.ts';
import { flushAllPendingRuns } from '../render/arcadeLeaderboard.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { NonetDoor } from './nonetModes.ts';
import { formatDayKey, rankingPanels, type RankingPanel } from './rankingView.ts';
import type { RankingEntry } from '../render/arcadeScores.ts';
import { CAMPAIGN_STAGES, STAGES_PER_BAND, stageById } from './campaign.ts';
import { FRESH_PROGRESS, currentStage, totalStars, type CampaignProgress } from './campaignProgress.ts';
import { CampaignHud, type CampaignHudInfo } from './campaignHud.ts';

/** NONET's accent — the violet of its arcade row (`ARCADE_GAMES` tint 0x9b7bff) and the kami's moss. */
export const ACCENT_NONET: ScreenAccent = {
  stops: [0xf1ecff, 0xb69cff, 0x6a3fd8],
  glow: 0x9b7bff,
  rim: 0x0e0820,
  backdrop: {
    logoX: 1180,
    logoY: 200,
    haloTint: 0x5b3fb0,
    ringTint: 0x9fe3a0,
    emberColors: [0x9b7bff, 0x6fae5e, 0xdff0a0, 0xc8b8ff],
  },
};

/** Every id the home's hit-test can answer. */
export type NonetHomeId = 'play' | 'campaign' | 'daily' | 'zen' | 'ranking' | 'back' | 'ranking-back';

export interface NonetHomeRow {
  readonly id: NonetHomeId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The doors on the home view, top to bottom. BACK is drawn smaller, below them. */
export const NONET_HOME_DOORS: readonly { id: Exclude<NonetHomeId, 'back' | 'ranking-back'>; name: string; icon: SkinIconKind; tint: number }[] = [
  { id: 'play', name: 'PLAY', icon: 'play', tint: 0x9b7bff },
  // ⭐ S196 Option B (R196-D2) — three bands × ten stages.
  { id: 'campaign', name: 'CAMPAIGN', icon: 'book', tint: 0xff8a5a },
  { id: 'daily', name: 'DAILY', icon: 'globe', tint: 0xf2bf26 },
  { id: 'zen', name: 'ZEN', icon: 'grid', tint: 0x6fae5e },
  { id: 'ranking', name: 'RANKING', icon: 'star', tint: 0x3bd7ff },
];

const COL_CX = 1180;
const TITLE_Y = 190;
const ROW_W = 560;
const ROW_H = 78;
const ROW_GAP = 16;
const FIRST_ROW_Y = 340;
/** ⭐ Option B — the 30-pip stage/star strip under the subtitle. */
const STRIP_Y = 292;
const PIP_W = 22;
const PIP_H = 16;
const PIP_GAP = 4;
const BAND_GAP = 14;
const BACK_W = 220;
const BACK_H = 56;
const HERO_X = 470;
const HERO_Y = 610;
/** The kami is 512 px square; this puts it ~560 px tall, the page's hero. */
const HERO_SCALE = 1.1;

/** PURE — the home view's rectangles (doors, then BACK). */
export function nonetHomeGeoms(): NonetHomeRow[] {
  const left = COL_CX - ROW_W / 2;
  const rows: NonetHomeRow[] = NONET_HOME_DOORS.map((d, i) => ({ id: d.id, x: left, y: FIRST_ROW_Y + i * (ROW_H + ROW_GAP), w: ROW_W, h: ROW_H }));
  const last = rows[rows.length - 1]!;
  rows.push({ id: 'back', x: COL_CX - BACK_W / 2, y: last.y + ROW_H + 40, w: BACK_W, h: BACK_H });
  return rows;
}

const PANEL_W = 640;
const PANEL_H = 560;
const PANEL_GAP = 60;
const PANEL_Y = 250;

/** PURE — the ranking view's two panels (not clickable) and its BACK. */
export function nonetRankingGeoms(): { panels: { x: number; y: number; w: number; h: number }[]; back: NonetHomeRow } {
  const left = (CANVAS_WIDTH - (2 * PANEL_W + PANEL_GAP)) / 2;
  return {
    panels: [0, 1].map((i) => ({ x: left + i * (PANEL_W + PANEL_GAP), y: PANEL_Y, w: PANEL_W, h: PANEL_H })),
    back: { id: 'ranking-back', x: (CANVAS_WIDTH - BACK_W) / 2, y: PANEL_Y + PANEL_H + 50, w: BACK_W, h: BACK_H },
  };
}

export interface NonetHomeHooks {
  /** PLAY / CAMPAIGN / DAILY / ZEN pressed — `main.ts` plans and mints the run (`nonetModes.planLaunch`). */
  onDoor(door: NonetDoor): void;
  /** BACK (or ESC on the home view) — return to the ARCADE menu. */
  onBack(): void;
}

/** What the page shows this visit. Read at `show`, never cached across visits. */
export interface NonetHomeContext {
  /** Today's UTC day key (`dailySeed.utcDayKey(Date.now())` at the menu). */
  readonly todayKey: string;
  /** The last day whose ranked DAILY this device solved, or null (`dailyProgress.ts`). */
  readonly dailySolvedKey: string | null;
  /** A one-line note (e.g. after a ZEN solve), or null. */
  readonly notice?: string | null;
  /** ⭐ Option B — campaign progress on this device (`campaignProgress.loadProgress()`). */
  readonly progress?: CampaignProgress;
}

/** PURE — the strip's 30 pips: x of each, centred on the door column, ten per band with a gap. */
export function stripPipXs(): number[] {
  const total = CAMPAIGN_STAGES.length * PIP_W + (CAMPAIGN_STAGES.length - 3) * PIP_GAP + 2 * BAND_GAP;
  const x0 = COL_CX - total / 2;
  return CAMPAIGN_STAGES.map((_, i) => {
    const band = Math.floor(i / STAGES_PER_BAND);
    const inBand = i % STAGES_PER_BAND;
    return x0 + band * (STAGES_PER_BAND * PIP_W + (STAGES_PER_BAND - 1) * PIP_GAP + BAND_GAP) + inBand * (PIP_W + PIP_GAP);
  });
}

export interface NonetHomeOpts {
  /** Load the kami hero art. Default: `Assets.load('/art/nonet/kami.webp')`. Tests pass `null`. */
  readonly loadHero?: (() => Promise<Texture>) | null;
  /** The board cache reader for RANKING. Default: `arcadeScores.loadRanking`. */
  readonly loadRanking?: (boardId: string) => readonly RankingEntry[];
  /** Host the living backdrop. Default true; tests pass false (no lazy import). */
  readonly backdrop?: boolean;
  /** ⭐ S196 MED-1 — the queued-run flush run on every open. Default: `flushAllPendingRuns`. */
  readonly flushPending?: () => Promise<number>;
}

/** The blurbs. DAILY's depends on whether today's ranked daily is already solved here. */
export function doorBlurb(id: NonetHomeId, ctx: NonetHomeContext): string {
  switch (id) {
    case 'play': return 'the timed run — a fresh grid, your average on the board';
    case 'campaign': {
      const p = ctx.progress ?? FRESH_PROGRESS;
      const s = stageById(currentStage(p))!;
      return `stage ${s.id} of 30 · ${s.clues} clues · ★ ${totalStars(p)}/90 on this device`;
    }
    case 'daily':
      return ctx.dailySolvedKey === ctx.todayKey
        ? 'solved today ✓ — replay it untimed, unranked'
        : `${formatDayKey(ctx.todayKey)} — one grid for everyone, its own board`;
    case 'zen': return 'no clock, no board — just the puzzle';
    case 'ranking': return 'the boards you have put your name on';
    default: return '';
  }
}

export class NonetHome {
  readonly container: Container;
  private readonly homeLayer = new Container();
  private readonly rankingLayer = new Container();
  private readonly rankingContent = new Container();
  /** One per row of `nonetHomeGeoms()`, then the ranking BACK — the mechanical pairing. */
  private readonly buttons: Container[] = [];
  private readonly blurbs = new Map<NonetHomeId, Text>();
  private readonly notice: Text;
  private readonly texts: Text[] = [];
  private readonly backdrop: LazyScreenBackdrop | null;
  /** ⭐ Option B — the stage/star strip, redrawn on every `show`. */
  private readonly strip = new Graphics();
  /** ⭐ Option B — the campaign strip over a stage (lives outside the page: it shows while the page is hidden). */
  private readonly hud: CampaignHud;
  private hero: Sprite | null = null;
  private heroLoading = false;
  private open = false;
  private viewName: 'home' | 'ranking' = 'home';
  private ctx: NonetHomeContext = { todayKey: '19700101', dailySolvedKey: null };

  constructor(parent: Container, private readonly hooks: NonetHomeHooks, private readonly opts: NonetHomeOpts = {}) {
    this.container = new Container();
    this.container.label = 'nonet-home';
    this.container.visible = false;
    // ⚠ THE WHOLE PAGE SWALLOWS POINTERS — a full-screen modal over the title, like the arcade menu.
    // The container-level tap routes only taps that landed on NO button (`e.target === container`),
    // so a button's own click never fires twice.
    this.container.eventMode = 'static';
    this.container.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= CANVAS_WIDTH && y >= 0 && y <= CANVAS_HEIGHT };
    this.container.on('pointertap', (e: { target?: unknown; global: { x: number; y: number } }) => {
      if (!this.open || e.target !== this.container) return;
      const local = this.container.toLocal(e.global);
      const id = this.hitTest(local.x, local.y);
      if (id !== null) this.select(id);
    });

    const scrim = new Graphics();
    scrim.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x05070c, alpha: 0.95 });
    this.container.addChild(scrim);
    this.backdrop = opts.backdrop === false ? null : new LazyScreenBackdrop(this.container, 1, ACCENT_NONET.backdrop);
    this.container.addChild(this.homeLayer, this.rankingLayer);
    this.rankingLayer.visible = false;

    this.buildHome();
    this.buildRanking();
    this.notice = this.text('', COL_CX, 0, 20, 0xdff0a0, this.homeLayer);
    const lastRow = nonetHomeGeoms()[nonetHomeGeoms().length - 1]!;
    this.notice.position.set(COL_CX, lastRow.y + lastRow.h + 44);
    parent.addChild(this.container);
    this.hud = new CampaignHud(parent);
  }

  show(ctx: NonetHomeContext): void {
    // ⭐ S196 MED-1 — deliver any run a DAILY / STAGE board never received: those boards get no "next
    // submit to the same board" to carry their queue, so an undelivered run would skew an average forever.
    void (this.opts.flushPending ?? flushAllPendingRuns)().catch(() => 0);
    this.ctx = ctx;
    this.open = true;
    this.container.visible = true;
    this.setView('home');
    for (const [id, t] of this.blurbs) {
      t.text = doorBlurb(id, ctx);
      fitTextToWidth(t, ROW_W - 88);
    }
    this.notice.text = ctx.notice ?? '';
    this.drawStrip(ctx.progress ?? FRESH_PROGRESS);
    this.backdrop?.setShown(true);
    this.loadHero();
    // Re-add on top of whatever was constructed later (the S149 arcade z-order lesson).
    const p = this.container.parent;
    if (p !== null) p.addChild(this.container);
  }

  hide(): void {
    this.open = false;
    this.container.visible = false;
    this.backdrop?.setShown(false);
  }

  isOpen(): boolean {
    return this.open;
  }

  view(): 'home' | 'ranking' {
    return this.viewName;
  }

  /** ESC: the ranking view steps back to the home; the home steps back to the arcade. */
  escape(): void {
    if (!this.open) return;
    if (this.viewName === 'ranking') this.setView('home');
    else this.hooks.onBack();
  }

  /** The id under this canvas point in the CURRENT view, or null. */
  hitTest(x: number, y: number): NonetHomeId | null {
    if (!this.open) return null;
    const rows = this.viewName === 'home' ? nonetHomeGeoms() : [nonetRankingGeoms().back];
    for (const r of rows) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
    return null;
  }

  /** Route an id — the single place a button, a container tap or a test lands. */
  select(id: NonetHomeId): void {
    if (!this.open) return;
    switch (id) {
      case 'play': this.hooks.onDoor('PLAY'); return;
      case 'campaign': this.hooks.onDoor('CAMPAIGN'); return;
      case 'daily': this.hooks.onDoor('DAILY'); return;
      case 'zen': this.hooks.onDoor('ZEN'); return;
      case 'ranking': this.setView('ranking'); return;
      case 'back': this.hooks.onBack(); return;
      case 'ranking-back': this.setView('home'); return;
    }
  }

  /** S85 P4c geometry-getter convention — live click geometry for e2e. */
  getUiPoints(): { open: boolean; view: 'home' | 'ranking'; rows: NonetHomeRow[]; heroLoaded: boolean } {
    return {
      open: this.open,
      view: this.viewName,
      rows: this.viewName === 'home' ? nonetHomeGeoms() : [nonetRankingGeoms().back],
      heroLoaded: this.hero !== null,
    };
  }

  destroy(): void {
    this.backdrop?.setShown(false);
    this.container.destroy({ children: true });
  }

  /** ⭐ Option B — every frame from `main.ts`: the campaign strip over a stage, or `null`. */
  renderCampaignHud(info: CampaignHudInfo | null): void {
    this.hud.render(info);
  }

  campaignHudPoints(): { visible: boolean; top: string; bottom: string } {
    return this.hud.getUiPoints();
  }

  /** The 30 pips: locked dim, unlocked outlined, cleared gold by stars, the current stage ringed. */
  private drawStrip(p: CampaignProgress): void {
    const g = this.strip;
    g.clear();
    const xs = stripPipXs();
    const cur = currentStage(p);
    for (const [i, x] of xs.entries()) {
      const id = i + 1;
      const st = p.stars[i] ?? 0;
      if (st > 0) g.roundRect(x, STRIP_Y, PIP_W, PIP_H, 4).fill({ color: 0xffd60a, alpha: [0, 0.45, 0.72, 1][st] ?? 1 });
      else if (id <= p.unlocked) g.roundRect(x, STRIP_Y, PIP_W, PIP_H, 4).fill({ color: 0x9b7bff, alpha: 0.18 }).stroke({ width: 1.5, color: 0x9b7bff, alpha: 0.8 });
      else g.roundRect(x, STRIP_Y, PIP_W, PIP_H, 4).fill({ color: 0x2a2f3a, alpha: 0.7 });
      if (id === cur) g.roundRect(x - 3, STRIP_Y - 3, PIP_W + 6, PIP_H + 6, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
  }

  private setView(v: 'home' | 'ranking'): void {
    this.viewName = v;
    this.homeLayer.visible = v === 'home';
    this.rankingLayer.visible = v === 'ranking';
    if (v === 'ranking') this.fillRanking();
  }

  private buildHome(): void {
    const title = new Text({ text: 'NONET', style: glowTitleStyle(ACCENT_NONET, 92, 14) });
    title.anchor.set(0.5);
    title.position.set(COL_CX, TITLE_Y);
    this.homeLayer.addChild(title);
    this.texts.push(title);
    this.text('the six-colour logic trial — fill every row, column and box', COL_CX, TITLE_Y + 72, 20, 0x9fb4cc, this.homeLayer);

    // The hero's glow pool, drawn now so the page is complete before the art arrives (and without it).
    const glow = new Graphics();
    for (const [r, a] of [[300, 0.06], [230, 0.07], [160, 0.08]] as const) glow.ellipse(HERO_X, HERO_Y + 40, r, r * 0.9).fill({ color: 0x6fae5e, alpha: a });
    glow.ellipse(HERO_X, HERO_Y + 300, 230, 34).fill({ color: 0x000000, alpha: 0.35 });
    glow.eventMode = 'none';
    this.homeLayer.addChild(glow);
    this.strip.eventMode = 'none';
    this.homeLayer.addChild(this.strip);

    const geoms = nonetHomeGeoms();
    for (const [i, d] of NONET_HOME_DOORS.entries()) {
      const r = geoms[i]!;
      const blurb = this.addButton(this.homeLayer, r, 12, d.tint, d.icon, d.name, 28, d.tint, ' ');
      if (blurb !== null) this.blurbs.set(d.id, blurb);
    }
    const back = geoms[geoms.length - 1]!;
    this.addButton(this.homeLayer, back, 10, 0x6f7b8f, 'back', 'BACK', 24, 0xc8d2e0, null);
  }

  private buildRanking(): void {
    const title = new Text({ text: 'RANKING', style: glowTitleStyle(ACCENT_NONET, 72, 10) });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 120);
    this.rankingLayer.addChild(title);
    this.texts.push(title);
    this.text('as it stood after your last run on this device — the board opens once you have put your name down', CANVAS_WIDTH / 2, 186, 18, 0x9fb4cc, this.rankingLayer);
    this.rankingLayer.addChild(this.rankingContent);
    const back = nonetRankingGeoms().back;
    this.addButton(this.rankingLayer, back, 10, 0x6f7b8f, 'back', 'BACK', 24, 0xc8d2e0, null);
  }

  /** Redrawn every time the ranking view opens — the cache may have changed since the last visit. */
  private fillRanking(): void {
    for (const c of this.rankingContent.removeChildren()) c.destroy({ children: true });
    const panels = rankingPanels(this.ctx.todayKey, this.opts.loadRanking);
    const geoms = nonetRankingGeoms().panels;
    for (const [i, p] of panels.entries()) this.drawPanel(p, geoms[i]!);
  }

  private drawPanel(p: RankingPanel, r: { x: number; y: number; w: number; h: number }): void {
    const g = new Graphics();
    g.roundRect(r.x, r.y, r.w, r.h, 12).fill({ color: 0x0b1018, alpha: 0.95 });
    skinPanelFx(g, r.x, r.y, r.w, r.h, 0x9b7bff, 58, 12);
    g.roundRect(r.x, r.y, r.w, r.h, 12).stroke({ width: 2, color: 0x9b7bff, alpha: 0.8 });
    g.eventMode = 'none';
    this.rankingContent.addChild(g);
    this.text(p.title, r.x + r.w / 2, r.y + 30, 24, 0xc8b8ff, this.rankingContent);
    if (p.rows === null) {
      this.text('LOCKED', r.x + r.w / 2, r.y + r.h / 2 - 24, 34, 0x6f7b8f, this.rankingContent);
      this.text('finish a run on this board and enter your name to see it', r.x + r.w / 2, r.y + r.h / 2 + 22, 17, 0x8f9bb0, this.rankingContent);
      return;
    }
    const top = r.y + 92;
    const step = Math.min(44, (r.h - 110) / Math.max(1, p.rows.length));
    for (const [i, row] of p.rows.entries()) {
      const y = top + i * step;
      const fill = i === 0 ? 0xffd60a : 0xe4ecf7;
      this.textAt(`${i + 1}.`, r.x + 40, y, 22, fill, 0);
      this.textAt(row.name, r.x + 110, y, 24, fill, 0);
      this.textAt(formatTime(row.averageMs), r.x + r.w - 170, y, 22, fill, 1);
      this.textAt(`×${row.runs}`, r.x + r.w - 40, y, 18, 0x8f9bb0, 1);
    }
  }

  /** The kami, off-bundle, once. The page is complete without it (the glow pool stands in). */
  private loadHero(): void {
    if (this.hero !== null || this.heroLoading) return;
    const load = this.opts.loadHero === undefined ? () => Assets.load('/art/nonet/kami.webp') as Promise<Texture> : this.opts.loadHero;
    if (load === null) return;
    this.heroLoading = true;
    load()
      .then((tex) => {
        if (this.container.destroyed) return;
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(HERO_SCALE);
        s.position.set(HERO_X, HERO_Y);
        s.eventMode = 'none';
        this.homeLayer.addChildAt(s, 3); // above the glow pool (and below the strip and every button)
        this.hero = s;
      })
      .catch(() => { this.heroLoading = false; });
  }

  /** One pop-out button (the arcade menu's grammar). Returns its blurb Text when it has one. */
  private addButton(
    layer: Container,
    r: NonetHomeRow,
    radius: number,
    stroke: number,
    icon: SkinIconKind,
    name: string,
    size: number,
    fill: number,
    blurb: string | null,
  ): Text | null {
    const btn = new Container();
    btn.label = `nonet-btn-${r.id}`;
    const plate = new Graphics();
    plate.roundRect(0, 0, r.w, r.h, radius).fill({ color: 0x0b1018, alpha: 0.95 });
    skinStaticPlate(plate, { x: 0, y: 0, w: r.w, h: r.h }, stroke, radius);
    const badge = Math.min(r.h - 16, 48);
    const bx = 10 + badge / 2;
    plate.roundRect(bx - badge / 2, r.h / 2 - badge / 2, badge, badge, 10).stroke({ width: 1.5, color: stroke, alpha: 0.45 });
    skinIcon(plate, icon, bx, r.h / 2, badge * 0.62, stroke, 0.95);
    plate.roundRect(0, 0, r.w, r.h, radius).stroke({ width: 2, color: stroke, alpha: 0.9 });
    btn.addChild(plate);
    const shift = (badge + 10) / 2;
    const label = new Text({ text: name, style: { fontFamily: 'monospace', fontSize: size, fill } });
    label.anchor.set(0.5);
    label.position.set(r.w / 2 + shift, blurb === null ? r.h / 2 : 26);
    fitTextToWidth(label, r.w - (badge + 10) - 28);
    btn.addChild(label);
    this.texts.push(label);
    let blurbText: Text | null = null;
    if (blurb !== null) {
      blurbText = new Text({ text: blurb, style: { fontFamily: 'monospace', fontSize: 16, fill: 0x8f9bb0 } });
      blurbText.anchor.set(0.5);
      blurbText.position.set(r.w / 2 + shift, 55);
      btn.addChild(blurbText);
      this.texts.push(blurbText);
    }
    btn.pivot.set(r.w / 2, r.h / 2);
    btn.position.set(r.x + r.w / 2, r.y + r.h / 2);
    attachButtonFeedback(btn, plate, () => this.select(r.id), { hit: { x: 0, y: 0, w: r.w, h: r.h } });
    attachHoverSheen(btn, { x: 0, y: 0, w: r.w, h: r.h }, radius);
    layer.addChild(btn);
    this.buttons.push(btn);
    return blurbText;
  }

  private text(text: string, x: number, y: number, size: number, fill: number, layer: Container): Text {
    const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fill } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.eventMode = 'none';
    layer.addChild(t);
    this.texts.push(t);
    return t;
  }

  private textAt(text: string, x: number, y: number, size: number, fill: number, anchorX: 0 | 1): void {
    const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fill } });
    t.anchor.set(anchorX, 0.5);
    t.position.set(x, y);
    t.eventMode = 'none';
    this.rankingContent.addChild(t);
  }
}

/**
 * ⭐ THE ONE MOUNT CALL. `main.ts` lazy-imports this module and calls it once; a later `/nonet/` page
 * (Option C) calls it against its own stage. Returns the page, hidden.
 */
export function mountNonetHome(parent: Container, hooks: NonetHomeHooks, opts: NonetHomeOpts = {}): NonetHome {
  return new NonetHome(parent, hooks, opts);
}
