/**
 * SPARK — Title screen (S15 P2).
 *
 * Renders the "SPARK" title + two mode buttons:
 *   - 1 Player   → solo mode (existing Phase-1 behavior unchanged)
 *   - 1v1 (2 Player) → networked hotseat-style 1v1 via Trystero
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
  /** S22 P3 — open Codex (MK-style godly recipe gallery). */
  onCodexSelected(): void;
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

    const btn1v1 = this.makeButton(
      '1v1 (2 Player)',
      'host or join a room — play against a friend',
      PLAYER_COLORS[1],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + BUTTON_HEIGHT + BUTTON_GAP,
      callbacks.on1v1Selected,
    );
    this.container.addChild(btn1v1);

    // S22 P3 — CODEX entry button (third row). MK-style gallery of unlocked
    // godly combos. Empty on first 1v1 (PRIME-AUDIT-S21 #4 no-spoilers).
    const btnCodex = this.makeButton(
      'CODEX',
      'godly combos — discovered through play',
      0xffd60a,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 2,
      callbacks.onCodexSelected,
    );
    this.container.addChild(btnCodex);

    app.stage.addChild(this.container);
    this.setVisible(false);
  }

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
