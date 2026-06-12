/**
 * SPARK — S87: VS-BOTS setup overlay.
 *
 * Title-screen overlay (codexOverlay pattern — NO new GameState; TITLE stays
 * underneath) where the player picks how many bots (1..MAX_BOTS) and each
 * bot's difficulty (NOOB → MID → HARD → IMBA, click-to-cycle), then starts
 * the match. Pure presentation: the START decision is delivered via the
 * onStart callback as a difficulty list; main.ts owns the dispatch + the
 * lazy BotManager import.
 *
 * Layout: dim full-screen backdrop · header · bot-count stepper (− n +) ·
 * one row per active bot (seat swatch + "BOT n" + difficulty cycler) ·
 * START MATCH · ✕ close (also ESC). All Pixi vector, zero assets.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_BOTS, PLAYER_COLORS } from '../constants.ts';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_COLORS,
  type BotDifficulty,
} from '../bots/botTypes.ts';

const PANEL_W = 640;
const ROW_H = 56;
const ROW_GAP = 10;

export interface BotSetupCallbacks {
  /** Fired on START MATCH with one difficulty per bot (length 1..MAX_BOTS). */
  onStart(difficulties: readonly BotDifficulty[]): void;
  onClose(): void;
}

/** S87 — e2e geometry points (DEV-only getter, S85 P4c live-read pattern). */
export interface BotSetupUiPoints {
  readonly countMinus: { x: number; y: number };
  readonly countPlus: { x: number; y: number };
  readonly start: { x: number; y: number };
  readonly close: { x: number; y: number };
  readonly difficulty: ReadonlyArray<{ x: number; y: number }>;
}

export class BotSetupOverlay {
  readonly container: Container;
  private readonly app: Application;
  private visible = false;
  private botCount = 3;
  private readonly difficulties: BotDifficulty[];
  private readonly rowsHost: Container;
  private readonly countText: Text;
  private readonly callbacks: BotSetupCallbacks;
  // Live row cyclers, rebuilt by rebuildRows(); index = bot ordinal (0-based).
  private difficultyCenters: Array<{ x: number; y: number }> = [];
  private uiPoints: Omit<BotSetupUiPoints, 'difficulty'> | null = null;

  constructor(app: Application, callbacks: BotSetupCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.difficulties = Array.from({ length: MAX_BOTS }, () => 'MID' as BotDifficulty);
    this.container = new Container();

    const backdrop = new Graphics();
    backdrop.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.92 });
    // Swallow clicks so the title buttons underneath can't fire through.
    backdrop.eventMode = 'static';
    this.container.addChild(backdrop);

    const header = new Text({
      text: 'VS BOTS',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 56,
        fontWeight: 'bold',
        fill: PLAYER_COLORS[6],
        letterSpacing: 8,
      }),
    });
    header.anchor.set(0.5);
    header.position.set(CANVAS_WIDTH / 2, 120);
    this.container.addChild(header);

    const sub = new Text({
      text: 'they collect, build and disrupt like players — pick your poison',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0x888888 }),
    });
    sub.anchor.set(0.5);
    sub.position.set(CANVAS_WIDTH / 2, 165);
    this.container.addChild(sub);

    // ── bot-count stepper ────────────────────────────────────────────────
    const stepperY = 230;
    const minus = this.makeSmallButton('−', CANVAS_WIDTH / 2 - 120, stepperY, () => {
      this.setBotCount(this.botCount - 1);
    });
    const plus = this.makeSmallButton('+', CANVAS_WIDTH / 2 + 120, stepperY, () => {
      this.setBotCount(this.botCount + 1);
    });
    this.container.addChild(minus, plus);

    this.countText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0xffffff,
      }),
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(CANVAS_WIDTH / 2, stepperY);
    this.container.addChild(this.countText);

    // ── per-bot rows (rebuilt on count change) ───────────────────────────
    this.rowsHost = new Container();
    this.container.addChild(this.rowsHost);

    // ── START + close ────────────────────────────────────────────────────
    const startY = CANVAS_HEIGHT - 140;
    const start = this.makeWideButton('START MATCH', CANVAS_WIDTH / 2, startY, () => {
      this.callbacks.onStart(this.difficulties.slice(0, this.botCount));
    });
    this.container.addChild(start);

    const close = this.makeSmallButton('✕', CANVAS_WIDTH - 60, 60, () => {
      this.callbacks.onClose();
    });
    this.container.addChild(close);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) this.callbacks.onClose();
    });

    if (import.meta.env.DEV) {
      this.uiPoints = {
        countMinus: { x: minus.position.x, y: minus.position.y },
        countPlus: { x: plus.position.x, y: plus.position.y },
        start: { x: start.position.x, y: start.position.y },
        close: { x: close.position.x, y: close.position.y },
      };
      this.getUiPoints = () => ({
        ...(this.uiPoints as Omit<BotSetupUiPoints, 'difficulty'>),
        difficulty: this.difficultyCenters.map((p) => ({ ...p })),
      });
      this.getState = () => ({
        botCount: this.botCount,
        difficulties: this.difficulties.slice(0, this.botCount),
      });
    }

    app.stage.addChild(this.container);
    this.rebuildRows();
    this.setVisible(false);
  }

  /** S87 — e2e geometry getter (DEV-only; live-container reads). */
  getUiPoints?: () => BotSetupUiPoints;
  /** S87 — e2e state probe (DEV-only). */
  getState?: () => { botCount: number; difficulties: readonly BotDifficulty[] };

  setVisible(visible: boolean): void {
    if (visible) {
      // S22 codexOverlay pattern — this overlay is constructed BEFORE
      // titleScreen in boot order, so re-addChild moves it topmost.
      this.app.stage.addChild(this.container);
    }
    this.visible = visible;
    this.container.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private setBotCount(n: number): void {
    this.botCount = Math.max(1, Math.min(MAX_BOTS, n));
    this.rebuildRows();
  }

  private rebuildRows(): void {
    this.countText.text = `${this.botCount} BOT${this.botCount > 1 ? 'S' : ''}`;
    this.rowsHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.difficultyCenters = [];
    const top = 300;
    for (let i = 0; i < this.botCount; i++) {
      const row = new Container();
      const y = top + i * (ROW_H + ROW_GAP);
      row.position.set(CANVAS_WIDTH / 2, y);

      const bg = new Graphics();
      bg.roundRect(-PANEL_W / 2, 0, PANEL_W, ROW_H, 8)
        .fill({ color: 0x111111, alpha: 0.9 })
        .stroke({ width: 1, color: 0x333344, alpha: 0.9 });
      row.addChild(bg);

      // Seat swatch — bot i sits seat i+1 (human is always seat 0).
      const seatColor = PLAYER_COLORS[i + 1];
      const swatch = new Graphics();
      swatch.circle(-PANEL_W / 2 + 36, ROW_H / 2, 12).fill({ color: seatColor, alpha: 0.95 });
      row.addChild(swatch);

      const label = new Text({
        text: `BOT ${i + 2}`, // seat number as players see it (B2..B7 nameplates)
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 20,
          fontWeight: 'bold',
          fill: 0xdddddd,
        }),
      });
      label.anchor.set(0, 0.5);
      label.position.set(-PANEL_W / 2 + 64, ROW_H / 2);
      row.addChild(label);

      // Difficulty cycler button.
      const diffBtn = new Container();
      diffBtn.position.set(PANEL_W / 2 - 110, ROW_H / 2);
      const diffBg = new Graphics();
      const diffText = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 18,
          fontWeight: 'bold',
          fill: 0xffffff,
        }),
      });
      diffText.anchor.set(0.5);
      diffBtn.addChild(diffBg, diffText);
      const paint = (): void => {
        const d = this.difficulties[i];
        const col = BOT_DIFFICULTY_COLORS[d];
        diffBg.clear();
        diffBg.roundRect(-80, -18, 160, 36, 6)
          .fill({ color: 0x0a0a0a, alpha: 0.9 })
          .stroke({ width: 2, color: col, alpha: 0.9 });
        diffText.text = d;
        diffText.style.fill = col;
      };
      paint();
      diffBtn.eventMode = 'static';
      diffBtn.cursor = 'pointer';
      diffBtn.on('pointertap', () => {
        const cur = BOT_DIFFICULTIES.indexOf(this.difficulties[i]);
        this.difficulties[i] = BOT_DIFFICULTIES[(cur + 1) % BOT_DIFFICULTIES.length];
        paint();
      });
      row.addChild(diffBtn);

      this.difficultyCenters.push({
        x: CANVAS_WIDTH / 2 + PANEL_W / 2 - 110,
        y: y + ROW_H / 2,
      });
      this.rowsHost.addChild(row);
    }
  }

  private makeSmallButton(label: string, cx: number, cy: number, onClick: () => void): Container {
    const c = new Container();
    c.position.set(cx, cy);
    const bg = new Graphics();
    bg.roundRect(-24, -24, 48, 48, 8)
      .fill({ color: 0x111111, alpha: 0.92 })
      .stroke({ width: 2, color: 0x666688, alpha: 0.9 });
    c.addChild(bg);
    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 26,
        fontWeight: 'bold',
        fill: 0xffffff,
      }),
    });
    t.anchor.set(0.5);
    c.addChild(t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    c.on('pointerover', () => { bg.tint = 0xddddee; });
    c.on('pointerout', () => { bg.tint = 0xffffff; });
    return c;
  }

  private makeWideButton(label: string, cx: number, cy: number, onClick: () => void): Container {
    const c = new Container();
    c.position.set(cx, cy);
    const bg = new Graphics();
    bg.roundRect(-180, -36, 360, 72, 12)
      .fill({ color: 0x111111, alpha: 0.92 })
      .stroke({ width: 2, color: PLAYER_COLORS[6], alpha: 0.9 });
    c.addChild(bg);
    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 24,
        fontWeight: 'bold',
        fill: PLAYER_COLORS[6],
      }),
    });
    t.anchor.set(0.5);
    c.addChild(t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    c.on('pointerover', () => { bg.tint = 0xddddee; });
    c.on('pointerout', () => { bg.tint = 0xffffff; });
    return c;
  }
}
