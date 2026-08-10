/**
 * SPARK — S136 P0: the CASTLE CONTEXT PANEL.
 *
 * WHY THIS EXISTS (owner playtest, 2026-08-10, items 1 + 2). V6-1.1/1.2 put BUY GATHERER and SPEED
 * in a permanent footer bar. The owner's ruling after playing it:
 *
 *   "that footer with those options should be clickable once you click on the castle and not always
 *    there. because eventually different towers and stuff will have different upgrades and they will
 *    pop up when you click on them"
 *
 * So the controls become a panel that opens on a click and closes on a click elsewhere. The stated
 * reason is FORWARD-LOOKING — different structures will each carry their own upgrades — so this is
 * built around a `PanelControl` descriptor list rather than two hard-wired buttons. A tower gets its
 * own panel later by supplying a different list; nothing here needs to change.
 *
 * ⚠ SELECTION IS RENDER-LOCAL, NOT WORLD STATE. `selectedSeat` is never serialized, never hashed,
 * never sent on the wire. Two reasons, both load-bearing: (a) an opponent must not see your panel
 * open, and (b) any new World field must be added to FIELD_COVERAGE / save / protocol /
 * structuralSignature / the positions buffer, and a purely local UI toggle has no business paying
 * that cost or risking a desync. Nothing in this file is reachable from a reducer.
 *
 * ⚠ WHY THE BUTTONS ARE PIXI CONTAINERS WITH A GRAPHICS CHILD. This is the shape that empirically
 * works, verified in headless Chromium this session: `hitTest` at a button centre returns the
 * Container because the child Graphics supplies `containsPoint` (a bare Container has none, and
 * Pixi's `hitTestFn` falls back to `hitArea` → `containsPoint` → false). Keep the Graphics child.
 *
 * ⚠ A DISABLED CONTROL MUST SAY WHY. This is the actual defect behind owner item 1 ("the build
 * extra gatherer or increase speed is not even clickable"). The buttons were never broken — the
 * runtime matrix this session showed SPEED working in every mode/viewport — but BUY is unaffordable
 * from t=0 (STARTING_VICTORY_POINTS 100 vs GATHERER_PRICE 105) and the old footer rendered that as
 * an unexplained dim box, which is indistinguishable from a dead button. Every disabled state here
 * carries a REASON string.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_PRICE,
  GATHERER_SPEED_UPGRADE_PRICE,
  KEEP_H,
} from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import type { World } from '../state/world.ts';

/**
 * Panel box. Sized to the widest label at fontSize 17 plus padding.
 *
 * ⚠ The width is set against the DISABLED label, which is the longest form ("BUY GATHERER  NEED
 * 105" — 22 chars ≈ 224 px at a ~10.2 px monospace advance). The first cut used 244 and the
 * disabled row visibly overflowed its own box in the P0 verification screenshot — the assertions
 * were all green, because "does the text fit" is not something a state assertion can see. Look at
 * the render.
 */
export const PANEL_W = 268;
const PANEL_PAD = 10;
/** Inner width available to a row label, exported so a test can assert labels actually FIT. */
export const ROW_INNER_W = PANEL_W - PANEL_PAD * 2;
/** Monospace advance at ROW_FONT_SIZE — the ratio Pixi's default monospace renders at. */
export const ROW_FONT_ADVANCE = 10.2;
const ROW_H = 44;
const ROW_GAP = 8;
const TITLE_H = 26;
/** Gap between the keep box and the panel edge, so the panel never covers the castle it describes. */
const ANCHOR_GAP = 14;

/**
 * One row in a context panel. `reason` is what the row says when `enabled` is false — never left
 * blank, so a dim row always explains itself (see the file docblock).
 */
export interface PanelControl {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string;
  readonly onActivate: () => void;
}

/**
 * PURE — the two castle controls for `world`'s local seat, with their enabled state and the reason
 * for every disabled state. Exported and world-only (no Pixi) so unit tests can pin the affordability
 * and reason matrix without a renderer; the S130 lesson is that a draw path which cannot be driven
 * headlessly must not be the only place logic lives.
 */
export function castleControlsModel(world: World): Array<Omit<PanelControl, 'onActivate'>> {
  const score = Math.floor(world.scoreByPlayer.get(world.localPlayerId) ?? 0);
  const me = world.players.get(world.localPlayerId);
  // ⚠ HONOUR THE SAME INPUT LOCKS THE CANVAS PATH DOES (carried over verbatim from the footer these
  // rows replace). These buttons live on app.stage and their pointertap never passes through
  // Controls.isInputLocked(), so without this a benched (eaten) player — or one mid-cinematic /
  // mid-NONET, where full-screen overlays do not all capture pointers — could spend victory points.
  const locked =
    world.sudoku !== null ||
    world.activeCinematicPlayerId === world.localPlayerId ||
    (me !== undefined && isBenched(me.benchedUntilTick, world.tick));

  let owned = 0;
  let allMaxed = true;
  for (const g of world.gatherers.values()) {
    if (g.ownerPlayerId !== world.localPlayerId) continue;
    owned++;
    if (g.speedLevel < GATHERER_MAX_SPEED_LEVEL) allMaxed = false;
  }

  const buyReason = locked ? 'LOCKED' : score < GATHERER_PRICE ? `NEED ${GATHERER_PRICE}` : '';
  const upReason = locked
    ? 'LOCKED'
    : owned === 0
      ? 'NO UNITS'
      : allMaxed
        ? 'MAX SPEED'
        : score < GATHERER_SPEED_UPGRADE_PRICE
          ? `NEED ${GATHERER_SPEED_UPGRADE_PRICE}`
          : '';

  // A disabled row shows its BLOCKER in place of the price, not in addition to it: "BUY GATHERER
  // 105  NEED 105" prints the same number twice and overflowed the row box. The reason already
  // carries the number in the cases where a number is the answer.
  return [
    {
      key: 'buyGatherer',
      label: buyReason === '' ? `BUY GATHERER  ${GATHERER_PRICE}` : `BUY GATHERER  ${buyReason}`,
      enabled: buyReason === '',
      reason: buyReason,
    },
    {
      key: 'upgradeSpeed',
      label:
        upReason === ''
          ? `SPEED  ${GATHERER_SPEED_UPGRADE_PRICE}`
          : `SPEED  ${upReason}`,
      enabled: upReason === '',
      reason: upReason,
    },
  ];
}

/**
 * PURE — where the panel's top-left corner goes for a keep at (ax, ay).
 *
 * Opens to the RIGHT of the keep by default and flips LEFT when that would overflow the canvas;
 * clamped vertically. The keeps sit on a ring around the arena centre, so seats on the right-hand
 * arc would otherwise push the panel off-screen. Exported for unit tests — the flip is exactly the
 * kind of edge that is invisible until a specific seat plays.
 */
export function panelOrigin(ax: number, ay: number, rows: number): { x: number; y: number } {
  const h = TITLE_H + rows * ROW_H + (rows - 1) * ROW_GAP + PANEL_PAD * 2;
  let x = ax + KEEP_H / 2 + ANCHOR_GAP;
  if (x + PANEL_W > CANVAS_WIDTH - 8) x = ax - KEEP_H / 2 - ANCHOR_GAP - PANEL_W;
  if (x < 8) x = 8;
  let y = ay - h / 2;
  if (y < 8) y = 8;
  if (y + h > CANVAS_HEIGHT - 8) y = CANVAS_HEIGHT - 8 - h;
  return { x, y };
}

/** PURE — the panel's full rect, given its origin and row count. */
export function panelRect(
  origin: { x: number; y: number },
  rows: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: origin.x,
    y: origin.y,
    w: PANEL_W,
    h: TITLE_H + rows * ROW_H + (rows - 1) * ROW_GAP + PANEL_PAD * 2,
  };
}

export class CastlePanel {
  private readonly container: Container;
  private readonly plate: Graphics;
  private readonly titleText: Text;
  private readonly rows: Array<{ box: Container; bg: Graphics; label: Text; hover: boolean }> = [];
  /** Render-local selection. null = closed. Never serialized (see the file docblock). */
  private selected: number | null = null;
  private onBuyGatherer: (() => void) | null = null;
  private onUpgradeSpeed: (() => void) | null = null;
  /** Latched per frame from `castleControlsModel`, so a pointertap cannot fire a disabled row. */
  private enabled: boolean[] = [];
  /** Armed on a successful spend so the HUD can withhold its "you were robbed" drop-flash. */
  private spendArmed = false;

  constructor(app: Application) {
    this.container = new Container();
    this.plate = new Graphics();
    this.container.addChild(this.plate);

    this.titleText = new Text({
      text: 'CASTLE',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0x9fc4e8 }),
    });
    this.titleText.position.set(PANEL_PAD, PANEL_PAD);
    this.container.addChild(this.titleText);

    // Two rows today; the list is data, so a third costs one entry (see the file docblock).
    for (let i = 0; i < 2; i++) {
      const bg = new Graphics();
      const label = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: 0xffffff }),
      });
      label.anchor.set(0.5);
      label.position.set((PANEL_W - PANEL_PAD * 2) / 2, ROW_H / 2);
      const box = new Container();
      box.addChild(bg); // ⚠ Graphics child supplies containsPoint — do not remove (see docblock).
      box.addChild(label);
      box.position.set(PANEL_PAD, PANEL_PAD + TITLE_H + i * (ROW_H + ROW_GAP));
      box.eventMode = 'static';
      box.cursor = 'pointer';
      const idx = i;
      box.on('pointertap', () => this.activate(idx));
      box.on('pointerover', () => { this.rows[idx].hover = true; });
      box.on('pointerout', () => { this.rows[idx].hover = false; });
      this.container.addChild(box);
      this.rows.push({ box, bg, label, hover: false });
    }

    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  /** main.ts injects the BUY_GATHERER dispatch for the local seat. */
  setBuyGathererHandler(fn: () => void): void {
    this.onBuyGatherer = fn;
  }

  /** main.ts injects the UPGRADE_GATHERER_SPEED dispatch for the local seat. */
  setUpgradeSpeedHandler(fn: () => void): void {
    this.onUpgradeSpeed = fn;
  }

  private activate(idx: number): void {
    if (this.enabled[idx] !== true) return;
    const fn = idx === 0 ? this.onBuyGatherer : this.onUpgradeSpeed;
    if (fn === null) return;
    this.spendArmed = true;
    fn();
  }

  /**
   * S136 P0 — the HUD reads and CLEARS this to suppress its red drop-flash for one voluntary spend.
   * The flash exists to make an INVOLUNTARY loss (a NONET halving) felt; flashing it at a purchase
   * reads as a penalty for playing well. Consuming it here keeps the latch's owner and its expiry in
   * one place instead of duplicating the footer's frame-budget bookkeeping.
   */
  consumeSpendArmed(): boolean {
    const v = this.spendArmed;
    this.spendArmed = false;
    return v;
  }

  isOpen(): boolean {
    return this.selected !== null;
  }

  open(seat: number): void {
    this.selected = seat;
  }

  close(): void {
    this.selected = null;
  }

  /** Click on an already-open castle = close it (the RTS toggle the owner's phrasing implies). */
  toggle(seat: number): void {
    this.selected = this.selected === seat ? null : seat;
  }

  /**
   * Is this canvas-space point over the panel? Consumed by `controls.ts`, which hit-tests WORLD
   * objects on the raw pointer path with no notion of UI and would otherwise ALSO grab a spark /
   * sever a bond on the same physical click that pressed a button — Pixi's `pointertap` does not
   * suppress the canvas handler. This is the direct replacement for the footer's
   * `isOverFooterControl`, and it covers the whole panel rather than only the rows: unlike the
   * footer (a 1920-wide band whose empty region had to stay clickable, or every world object in the
   * bottom 7.8% went inert) the panel is a small floating box, so swallowing clicks on its padding
   * and title is correct — those are the panel, not the board.
   */
  isOverPanel(x: number, y: number): boolean {
    if (this.selected === null) return false;
    const a = castleAnchor(this.selected);
    const r = panelRect(panelOrigin(a.x, a.y, this.rows.length), this.rows.length);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** S136 P0 — live click geometry for the e2e harness (the S85 P4c geometry-getter convention). */
  getUiPoints(): {
    open: boolean;
    rect: { x: number; y: number; w: number; h: number } | null;
    rowCenters: Array<{ key: string; x: number; y: number; enabled: boolean; reason: string }>;
  } {
    if (this.selected === null) return { open: false, rect: null, rowCenters: [] };
    const a = castleAnchor(this.selected);
    const o = panelOrigin(a.x, a.y, this.rows.length);
    const keys = ['buyGatherer', 'upgradeSpeed'];
    return {
      open: true,
      rect: panelRect(o, this.rows.length),
      rowCenters: this.rows.map((_, i) => ({
        key: keys[i],
        x: o.x + PANEL_PAD + (PANEL_W - PANEL_PAD * 2) / 2,
        y: o.y + PANEL_PAD + TITLE_H + i * (ROW_H + ROW_GAP) + ROW_H / 2,
        enabled: this.enabled[i] === true,
        reason: this.reasons[i] ?? '',
      })),
    };
  }

  private reasons: string[] = [];

  sync(world: World): void {
    // The panel is a PLAYING-only affordance; any other state closes it so it cannot survive into
    // the title/win screens (the same scoping the footer had, and the reason its watermark reset).
    if (world.gameState !== 'PLAYING') this.selected = null;
    this.container.visible = this.selected !== null;
    if (this.selected === null) return;

    const model = castleControlsModel(world);
    this.enabled = model.map((m) => m.enabled);
    this.reasons = model.map((m) => m.reason);

    const a = castleAnchor(this.selected);
    const o = panelOrigin(a.x, a.y, this.rows.length);
    const r = panelRect(o, this.rows.length);
    this.container.position.set(o.x, o.y);

    const own = world.players.get(world.localPlayerId);
    const tint = own?.color ?? 0x9fc4e8;
    const g = this.plate;
    g.clear();
    g.roundRect(0, 0, r.w, r.h, 8)
      .fill({ color: 0x0a1622, alpha: 0.94 })
      .stroke({ width: 2, color: tint, alpha: 0.85 });
    this.titleText.style.fill = tint;

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const m = model[i];
      const on = m.enabled;
      const bg = row.bg;
      bg.clear();
      bg.roundRect(0, 0, PANEL_W - PANEL_PAD * 2, ROW_H, 6)
        .fill({ color: on ? (row.hover ? 0x1f5f9e : 0x17497a) : 0x1a2530, alpha: 0.95 })
        .stroke({ width: 2, color: on ? 0x85b7eb : 0x3a4a58, alpha: 0.95 });
      // A dim row NAMES its blocker instead of leaving the player to guess (owner item 1). The
      // blocker is already folded into `label` by castleControlsModel — do NOT append `reason`
      // again here, which is what made the disabled row overflow its box.
      row.label.text = m.label;
      row.label.style.fill = on ? 0xffffff : 0x6b7a88;
      row.box.cursor = on ? 'pointer' : 'default';
    }
  }
}
