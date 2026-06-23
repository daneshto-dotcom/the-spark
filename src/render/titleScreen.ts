/**
 * SPARK — Title screen (S15 P2; S87 mode restructure).
 *
 * Renders the "SPARK" title + four buttons:
 *   - 1 Player    → solo mode (existing Phase-1 behavior unchanged)
 *   - Multiplayer → networked FFA (2..6 players) via Trystero — friends lobby
 *                   or quick match (S87 rename of the historical "1v1" button;
 *                   the INTERNAL GameMode value stays '1v1', wire-locked)
 *   - VS Bots     → local match vs 1..6 AI sparks (S87; opens BotSetupOverlay)
 *   - CODEX       → godly recipe gallery
 *   - COMBOS      → combo codex (S97 G3b; discovered combos + locked silhouettes)
 *
 * Visibility is gated on world.gameState === 'TITLE'. main.ts adds/removes
 * the container from the stage on FSM transition.
 *
 * Click callbacks are passed in via the constructor — keeps this module
 * pure presentation (no direct dispatch dependency).
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';

const BUTTON_WIDTH = 360;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 24;
const BUTTON_RADIUS = 12;

export interface TitleScreenCallbacks {
  onSoloSelected(): void;
  on1v1Selected(): void;
  /** S87 — open the VS-BOTS setup overlay (bot count + per-bot difficulty). */
  onVsBotsSelected(): void;
  /** S22 P3 — open Codex (MK-style godly recipe gallery). */
  onCodexSelected(): void;
  /** S97 G3b — open the Combo Codex (Magic-14 gallery; discovered + locked silhouettes). */
  onCombosSelected(): void;
}

/** S85 P4c — canvas-space button centers for the e2e geometry-getter migration.
 * S87: `oneVOne` KEY kept (e2e churn guard) — it is the Multiplayer button. */
export interface TitleButtonCenters {
  readonly solo: { x: number; y: number };
  readonly oneVOne: { x: number; y: number };
  readonly vsBots: { x: number; y: number };
  readonly codex: { x: number; y: number };
  readonly combos: { x: number; y: number };
}

export class TitleScreen {
  readonly container: Container;
  private visible = false;

  constructor(app: Application, callbacks: TitleScreenCallbacks) {
    this.container = new Container();

    const title = new Text({
      text: 'SPARK',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 144,
        fontWeight: 'bold',
        fill: 0xffffff,
        letterSpacing: 12,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 160);
    this.container.addChild(title);

    const subtitle = new Text({
      text: 'a real-time game of geometric emergence',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 16,
        fill: 0x888888,
        letterSpacing: 2,
      }),
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    this.container.addChild(subtitle);

    const btnSolo = this.makeButton(
      '1 Player',
      'learn the mechanics solo',
      PLAYER_COLORS[0],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40,
      callbacks.onSoloSelected,
    );
    this.container.addChild(btnSolo);

    // S87 — renamed from "1v1 (2 Player)": the mode has seated up to 6 since
    // S62; the user mandated the honest name. Internal GameMode stays '1v1'.
    const btn1v1 = this.makeButton(
      'Multiplayer',
      'friends lobby or quick match — up to 6 players',
      PLAYER_COLORS[1],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + BUTTON_HEIGHT + BUTTON_GAP,
      callbacks.on1v1Selected,
    );
    this.container.addChild(btn1v1);

    // S87 — VS BOTS entry (third row): local match vs 1..6 AI sparks with
    // per-bot difficulty. Opens BotSetupOverlay; the match itself reuses the
    // FFA rule set (mode 'bots').
    const btnVsBots = this.makeButton(
      'VS Bots',
      'battle 1-6 AI sparks — pick each bot’s difficulty',
      PLAYER_COLORS[6],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 2,
      callbacks.onVsBotsSelected,
    );
    this.container.addChild(btnVsBots);

    // S22 P3 — CODEX entry button (fourth row since S87). MK-style gallery of
    // unlocked godly combos. Empty on first 1v1 (PRIME-AUDIT-S21 #4 no-spoilers).
    const btnCodex = this.makeButton(
      'CODEX',
      'godly combos — discovered through play',
      0xffd60a,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 3,
      callbacks.onCodexSelected,
    );
    this.container.addChild(btnCodex);

    // S97 G3b — COMBOS entry (fifth row): the Magic-14 gallery. Combos are the
    // user-mandated CORE of a geometric builder, so the catalogue gets a
    // top-level button (not buried) — discovered tiles reveal, undiscovered show
    // as locked silhouettes. Opens the lazy ComboCodexOverlay.
    const btnCombos = this.makeButton(
      'COMBOS',
      'the geometry — connections discovered through play',
      0x53d8ff,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 4,
      callbacks.onCombosSelected,
    );
    this.container.addChild(btnCombos);

    // S85 P4c — read the centers back from the LIVE button containers (not a
    // re-derivation of the layout math) so the getter can never drift from
    // what is actually rendered. e2e clicks consume these via __SPARK__
    // (the S50 P5 hardcoded-coordinate drift class is dead by construction).
    // DEV-gated like __SPARK__ itself: e2e runs the dev server; the prod
    // bundle dead-branches this out (S85 bundle-charter remediation).
    if (import.meta.env.DEV) {
      const centers: TitleButtonCenters = {
        solo: { x: btnSolo.position.x, y: btnSolo.position.y },
        oneVOne: { x: btn1v1.position.x, y: btn1v1.position.y },
        vsBots: { x: btnVsBots.position.x, y: btnVsBots.position.y },
        codex: { x: btnCodex.position.x, y: btnCodex.position.y },
        combos: { x: btnCombos.position.x, y: btnCombos.position.y },
      };
      this.getButtonCenters = () => centers;
    }

    app.stage.addChild(this.container);
    this.setVisible(false);
  }

  /** S85 P4c — canvas-space button centers (e2e geometry getter; DEV-only). */
  getButtonCenters?: () => TitleButtonCenters;

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private makeButton(
    label: string,
    sublabel: string,
    accentColor: number,
    cx: number,
    cy: number,
    onClick: () => void,
  ): Container {
    const c = new Container();
    c.position.set(cx, cy);

    const bg = new Graphics();
    bg.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: 0x111111, alpha: 0.92 })
      .stroke({ width: 2, color: accentColor, alpha: 0.85 });
    c.addChild(bg);

    const labelText = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 26,
        fill: accentColor,
        fontWeight: 'bold',
      }),
    });
    labelText.anchor.set(0.5);
    labelText.position.set(0, -10);
    c.addChild(labelText);

    const subText = new Text({
      text: sublabel,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: 0x888888 }),
    });
    subText.anchor.set(0.5);
    subText.position.set(0, 16);
    c.addChild(subText);

    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    c.on('pointerover', () => {
      bg.tint = 0xddddee;
    });
    c.on('pointerout', () => {
      bg.tint = 0xffffff;
    });
    return c;
  }
}
