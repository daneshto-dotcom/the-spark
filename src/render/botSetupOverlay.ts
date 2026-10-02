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

import { attachButtonFeedback } from './buttonFeedback.ts';
// ⭐ S194 T5 — the shared skin (glass + sheen, inside each plate / hit rect).
import { skinButtonFx, skinPanelFx } from './uiSkin.ts';
import { attachChipHover, attachHoverSheen } from './uiSkinButton.ts';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { defaultRaceForSeat, RACE_COLORS, type RaceId } from '../state/races.ts';
import { raceDisplayName } from './raceBanners.ts';
import { makeRacePicker, type RacePickerHandle } from './racePicker.ts';
import { BOT_ACCENT_COLOR, CANVAS_HEIGHT, CANVAS_WIDTH, MAX_BOTS } from '../constants.ts';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_COLORS,
  BOT_PERSONALITY_CHOICES,
  BOT_PERSONALITY_COLORS,
  BOT_PERSONALITY_LOCKED_TAGLINE,
  BOT_PERSONALITY_TAGLINES,
  type BotDifficulty,
  type BotPersonalityChoice,
} from '../bots/botTypes.ts';

// ⭐ S193 — widened 640 → 860 for the third chip (personality) between race and difficulty.
const PANEL_W = 860;
/** Row-relative centres of the three chips, right to left: difficulty, personality, race. */
const DIFF_X = PANEL_W / 2 - 110;
const PERSONA_X = PANEL_W / 2 - 300;
const RACE_X = PANEL_W / 2 - 500;
const ROW_H = 56;
const ROW_GAP = 10;

export interface BotSetupCallbacks {
  /**
   * Fired on START MATCH with one difficulty per bot (length 1..MAX_BOTS), and — S161 P6 — one race
   * per SEAT.
   *
   * ⚠ THE TWO ARRAYS ARE DIFFERENT LENGTHS ON PURPOSE, and mixing them up would silently give the
   * human a bot's race. `difficulties` is per BOT (index 0 = the first bot); `races` is per SEAT
   * (index 0 = the HUMAN, index i+1 = bot i), so `races.length === difficulties.length + 1`. The
   * seat-indexed shape is the one `applyStartGame` wants, since it builds a roster over seats.
   */
  onStart(
    difficulties: readonly BotDifficulty[],
    races: readonly RaceId[],
    /**
     * ⭐ S193 (owner R193-AI) — one personality choice per BOT, indexed like `difficulties`. RANDOM is
     * passed through unresolved; the BotManager resolves it from the match seed.
     */
    personalities: readonly BotPersonalityChoice[],
  ): void;
  onClose(): void;
}

/** S87 — e2e geometry points (DEV-only getter, S85 P4c live-read pattern). */
export interface BotSetupUiPoints {
  readonly countMinus: { x: number; y: number };
  readonly countPlus: { x: number; y: number };
  readonly start: { x: number; y: number };
  readonly close: { x: number; y: number };
  readonly difficulty: ReadonlyArray<{ x: number; y: number }>;
  /** ⭐ S193 — the personality chip centres, one per active bot. */
  readonly personality: ReadonlyArray<{ x: number; y: number }>;
}

export class BotSetupOverlay {
  readonly container: Container;
  private readonly app: Application;
  private visible = false;
  private botCount = 3;
  private readonly difficulties: BotDifficulty[];
  /** ⭐ S193 — per BOT; default BALANCED, so an untouched lobby fields today's bot. */
  private readonly personalities: BotPersonalityChoice[] =
    Array.from({ length: MAX_BOTS }, () => 'BALANCED' as BotPersonalityChoice);
  private personalityCenters: Array<{ x: number; y: number }> = [];
  private readonly rowsHost: Container;
  private readonly countText: Text;
  private readonly callbacks: BotSetupCallbacks;
  // Live row cyclers, rebuilt by rebuildRows(); index = bot ordinal (0-based).
  private difficultyCenters: Array<{ x: number; y: number }> = [];
  /**
   * ⭐ S161 P6 (owner) — *"same for the play with bots, but only there you can chose the bot race
   * and color"*. SEAT-indexed: [0] is the human, [i+1] is bot i. Sized for every seat the overlay
   * can ever offer so a bot-count change never has to resize it — a row that appears mid-setup
   * finds its race already defaulted rather than undefined.
   */
  private readonly races: RaceId[] =
    Array.from({ length: MAX_BOTS + 1 }, (_, seat) => defaultRaceForSeat(seat));
  private readonly racePicker: RacePickerHandle;
  /** Which SEAT's row opened the picker, so the pick lands on the right row. */
  private pickingSeat = 0;
  private uiPoints: Omit<BotSetupUiPoints, 'difficulty' | 'personality'> | null = null;

  constructor(app: Application, callbacks: BotSetupCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.difficulties = Array.from({ length: MAX_BOTS }, () => 'MID' as BotDifficulty);
    /*
     * ⭐ S161 P6 — THE SAME PICKER THE MULTIPLAYER LOBBY USES, not a second one written to match.
     * The owner asked for the same menu here (*"and same for the play with bots"*), and sharing the
     * component is what makes "same" true a year from now — a copy would drift the first time either
     * surface was retuned.
     */
    this.racePicker = makeRacePicker((raceId) => {
      this.races[this.pickingSeat] = raceId;
      this.rebuildRows();
    });
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
        fill: BOT_ACCENT_COLOR,
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
      this.callbacks.onStart(
        this.difficulties.slice(0, this.botCount),
        this.races.slice(0, this.botCount + 1),
        this.personalities.slice(0, this.botCount),
      );
    });
    this.container.addChild(start);

    const close = this.makeSmallButton('✕', CANVAS_WIDTH - 60, 60, () => {
      this.callbacks.onClose();
    });
    this.container.addChild(close);

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.visible) return;
      // ⭐ S162 — INNERMOST MODAL FIRST. With the race menu up, Escape means "close the menu", not
      // "abandon bot setup". Handled in one listener rather than two so the outcome cannot depend on
      // registration order.
      if (this.racePicker.isOpen()) {
        this.racePicker.close();
        return;
      }
      this.callbacks.onClose();
    });

    if (import.meta.env.DEV) {
      this.uiPoints = {
        countMinus: { x: minus.position.x, y: minus.position.y },
        countPlus: { x: plus.position.x, y: plus.position.y },
        start: { x: start.position.x, y: start.position.y },
        close: { x: close.position.x, y: close.position.y },
      };
      this.getUiPoints = () => ({
        ...(this.uiPoints as Omit<BotSetupUiPoints, 'difficulty' | 'personality'>),
        difficulty: this.difficultyCenters.map((p) => ({ ...p })),
        personality: this.personalityCenters.map((p) => ({ ...p })),
      });
      this.getState = () => ({
        botCount: this.botCount,
        difficulties: this.difficulties.slice(0, this.botCount),
        personalities: this.personalities.slice(0, this.botCount),
      });
    }

    // ⭐ S161 P6 — the picker mounts INSIDE this overlay's container so `setVisible(false)` takes
    // it down with the rest of the screen, and last so its scrim covers the rows.
    this.container.addChild(this.racePicker.container);

    app.stage.addChild(this.container);
    this.rebuildRows();
    this.setVisible(false);
  }

  /** S87 — e2e geometry getter (DEV-only; live-container reads). */
  getUiPoints?: () => BotSetupUiPoints;
  /** S87 — e2e state probe (DEV-only). */
  getState?: () => {
    botCount: number;
    difficulties: readonly BotDifficulty[];
    personalities: readonly BotPersonalityChoice[];
  };

  setVisible(visible: boolean): void {
    // ⭐ S162 P3 (MED-3) — the picker mounts inside this container; without this it stayed flagged
    // visible and reappeared over the overlay the next time it was opened. Same defect as lobbyScreen.
    if (!visible) this.racePicker.close();
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

  /**
   * ⭐ S161 P6 — the RACE button shared by the human row and every bot row. Opens the same picker
   * the multiplayer lobby uses, scoped to `seat`.
   *
   * ⛔ THE TAKEN SET IS EVERY OTHER SEAT'S RACE — the same one-race-per-player rule multiplayer
   * enforces host-side. Solo has no host to arbitrate, so if this did not exclude the others, a
   * vs-bots match could open with two crimson castles and the board would be unreadable in exactly
   * the way `RACE_COLORS` exists to prevent.
   */
  private makeRaceButton(seat: number, cx: number): Container {
    const btn = new Container();
    btn.position.set(cx, ROW_H / 2);
    const raceId = this.races[seat]!;
    const col = RACE_COLORS[raceId];
    const plate = new Graphics().roundRect(-92, -18, 184, 36, 6).fill({ color: 0x0d121c, alpha: 0.92 });
    skinButtonFx(plate, -92, -18, 184, 36, { accent: col, state: 'rest', radius: 6, studs: false });
    plate.roundRect(-92, -18, 184, 36, 6).stroke({ width: 2, color: col, alpha: 0.9 });
    btn.addChild(plate);
    attachChipHover(btn, plate, { x: -92, y: -18, w: 184, h: 36 }, 6);
    const t = new Text({
      text: raceDisplayName(raceId),
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fontWeight: 'bold', fill: col }),
    });
    t.anchor.set(0.5);
    btn.addChild(t);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      this.pickingSeat = seat;
      const taken = new Set<RaceId>();
      for (let s2 = 0; s2 <= this.botCount; s2++) if (s2 !== seat) taken.add(this.races[s2]!);
      this.racePicker.open(taken, this.races[seat]);
    });
    return btn;
  }

  private rebuildRows(): void {
    this.countText.text = `${this.botCount} BOT${this.botCount > 1 ? 'S' : ''}`;
    this.rowsHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.difficultyCenters = [];
    this.personalityCenters = [];
    const top = 300;

    /*
     * ⭐ S161 P6 — A ROW FOR THE HUMAN, ABOVE THE BOTS. The owner's note is *"you can chose the bot
     * race and color"*, but a screen where you may recolour every opponent and not yourself is the
     * odd one out — multiplayer lets you pick your own and this is the same choice. It carries no
     * difficulty cycler, which is also what distinguishes it at a glance.
     */
    const youRow = new Container();
    // ⚠ THE YOU ROW TAKES THE FIRST SLOT AND THE BOTS SHIFT DOWN ONE, rather than the YOU row
    // being tucked in ABOVE `top`. The first version did the latter and landed it straight on top of
    // the "N BOTS" counter — the rack has a fixed origin and the counter sits just above it, so
    // there was never any room up there to borrow.
    youRow.position.set(CANVAS_WIDTH / 2, top);
    youRow.addChild(
      new Graphics()
        .roundRect(-PANEL_W / 2, 0, PANEL_W, ROW_H, 8)
        .fill({ color: 0x0d121c, alpha: 0.9 })
        .stroke({ width: 1, color: 0x444455, alpha: 0.9 }),
    );
    {
      const frame = new Graphics();
      frame.eventMode = 'none';
      skinPanelFx(frame, -PANEL_W / 2, 0, PANEL_W, ROW_H, RACE_COLORS[this.races[0]!], 0, 8);
      youRow.addChild(frame);
    }
    youRow.addChild(
      new Graphics()
        .circle(-PANEL_W / 2 + 36, ROW_H / 2, 12)
        .fill({ color: RACE_COLORS[this.races[0]!], alpha: 0.95 }),
    );
    const youLabel = new Text({
      text: 'YOU',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold', fill: 0xdddddd }),
    });
    youLabel.anchor.set(0, 0.5);
    youLabel.position.set(-PANEL_W / 2 + 64, ROW_H / 2);
    youRow.addChild(youLabel);
    youRow.addChild(this.makeRaceButton(0, RACE_X));
    this.rowsHost.addChild(youRow);

    for (let i = 0; i < this.botCount; i++) {
      const row = new Container();
      const y = top + (i + 1) * (ROW_H + ROW_GAP);
      row.position.set(CANVAS_WIDTH / 2, y);

      const bg = new Graphics();
      bg.roundRect(-PANEL_W / 2, 0, PANEL_W, ROW_H, 8).fill({ color: 0x0d121c, alpha: 0.9 });
      skinPanelFx(bg, -PANEL_W / 2, 0, PANEL_W, ROW_H, BOT_ACCENT_COLOR, 0, 8);
      bg.roundRect(-PANEL_W / 2, 0, PANEL_W, ROW_H, 8).stroke({ width: 1, color: 0x333344, alpha: 0.9 });
      row.addChild(bg);

      // Seat swatch — bot i sits seat i+1 (human is always seat 0).
      // ⭐ S161 P6 — from its RACE, not from the seat: the seat's default is only the starting
      // value now, and a swatch still keyed to the seat would contradict the button beside it.
      const seatColor = RACE_COLORS[this.races[i + 1]!];
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
      label.position.set(-PANEL_W / 2 + 64, ROW_H / 2 - 8);
      row.addChild(label);

      // ⭐ S193 — the personality's one-line identity under the bot's name (read at a glance).
      const tagline = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: 0x888888 }),
      });
      tagline.anchor.set(0, 0.5);
      tagline.position.set(-PANEL_W / 2 + 64, ROW_H / 2 + 13);
      row.addChild(tagline);

      // Difficulty cycler button.
      const diffBtn = new Container();
      diffBtn.position.set(DIFF_X, ROW_H / 2);
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

      /*
       * ⭐ S193 (owner R193-AI) — the PERSONALITY chip: click to cycle BALANCED, WARMONGER, FORTRESS,
       * TYCOON, SABOTEUR, RANDOM. ⛔ GREYED AND INERT ON A NOOB ROW (Council S193, Gemini M3): a NOOB
       * builds no towers and cannot raid, so a personality there would be a fake choice, and the brain
       * resolves every NOOB to BALANCED. The pick is KEPT, so cycling the difficulty up restores it.
       */
      const personaBtn = new Container();
      personaBtn.position.set(PERSONA_X, ROW_H / 2);
      const personaBg = new Graphics();
      const personaText = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', fill: 0xffffff }),
      });
      personaText.anchor.set(0.5);
      personaBtn.addChild(personaBg, personaText);
      const paintPersona = (): void => {
        const pick = this.personalities[i];
        const locked = this.difficulties[i] === 'NOOB';
        const col = locked ? 0x555555 : BOT_PERSONALITY_COLORS[pick];
        personaBg.clear();
        personaBg.roundRect(-90, -18, 180, 36, 6).fill({ color: 0x0d121c, alpha: 0.92 });
        skinButtonFx(personaBg, -90, -18, 180, 36, { accent: col, state: locked ? 'disabled' : 'rest', radius: 6, studs: false });
        personaBg.roundRect(-90, -18, 180, 36, 6).stroke({ width: 2, color: col, alpha: 0.9 });
        personaText.text = locked ? 'BALANCED' : pick;
        personaText.style.fill = col;
        personaBtn.cursor = locked ? 'default' : 'pointer';
        tagline.text = locked ? BOT_PERSONALITY_LOCKED_TAGLINE : BOT_PERSONALITY_TAGLINES[pick];
      };
      personaBtn.eventMode = 'static';
      attachChipHover(personaBtn, personaBg, { x: -90, y: -18, w: 180, h: 36 }, 6, () => this.difficulties[i] !== 'NOOB');
      personaBtn.on('pointertap', () => {
        if (this.difficulties[i] === 'NOOB') return;
        const cur = BOT_PERSONALITY_CHOICES.indexOf(this.personalities[i]);
        this.personalities[i] = BOT_PERSONALITY_CHOICES[(cur + 1) % BOT_PERSONALITY_CHOICES.length];
        paintPersona();
      });
      row.addChild(personaBtn);
      this.personalityCenters.push({ x: CANVAS_WIDTH / 2 + PERSONA_X, y: y + ROW_H / 2 });

      const paint = (): void => {
        const d = this.difficulties[i];
        const col = BOT_DIFFICULTY_COLORS[d];
        diffBg.clear();
        diffBg.roundRect(-80, -18, 160, 36, 6).fill({ color: 0x0d121c, alpha: 0.92 });
        skinButtonFx(diffBg, -80, -18, 160, 36, { accent: col, state: 'rest', radius: 6, studs: false });
        diffBg.roundRect(-80, -18, 160, 36, 6).stroke({ width: 2, color: col, alpha: 0.9 });
        diffText.text = d;
        diffText.style.fill = col;
      };
      paint();
      paintPersona();
      diffBtn.eventMode = 'static';
      attachChipHover(diffBtn, diffBg, { x: -80, y: -18, w: 160, h: 36 }, 6);
      diffBtn.cursor = 'pointer';
      diffBtn.on('pointertap', () => {
        const cur = BOT_DIFFICULTIES.indexOf(this.difficulties[i]);
        this.difficulties[i] = BOT_DIFFICULTIES[(cur + 1) % BOT_DIFFICULTIES.length];
        paint();
        paintPersona(); // S193 — the NOOB lock follows the difficulty
      });
      row.addChild(diffBtn);
      row.addChild(this.makeRaceButton(i + 1, RACE_X));

      this.difficultyCenters.push({
        x: CANVAS_WIDTH / 2 + DIFF_X,
        y: y + ROW_H / 2,
      });
      this.rowsHost.addChild(row);
    }
  }

  private makeSmallButton(label: string, cx: number, cy: number, onClick: () => void): Container {
    const c = new Container();
    c.position.set(cx, cy);
    const bg = new Graphics();
    bg.roundRect(-24, -24, 48, 48, 8).fill({ color: 0x111a2a, alpha: 0.92 });
    skinButtonFx(bg, -24, -24, 48, 48, { accent: BOT_ACCENT_COLOR, state: 'rest', radius: 8 });
    bg.roundRect(-24, -24, 48, 48, 8).stroke({ width: 2, color: 0x666688, alpha: 0.9 });
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
    // ⭐ S194 (owner: *"the plus and minus button … doesn't have any graphic implemented"*) — the
    // steppers and the close ✕ get the shared button grammar (hover pop, press squash, click blip) and
    // the sheen, on exactly their 48×48 plate. They used to answer only with a near-invisible tint.
    attachButtonFeedback(c, bg, onClick, { hit: { x: -24, y: -24, w: 48, h: 48 } });
    attachHoverSheen(c, { x: -24, y: -24, w: 48, h: 48 }, 8);
    return c;
  }

  private makeWideButton(label: string, cx: number, cy: number, onClick: () => void): Container {
    const c = new Container();
    c.position.set(cx, cy);
    const bg = new Graphics();
    bg.roundRect(-180, -36, 360, 72, 12).fill({ color: 0x0d121c, alpha: 0.94 });
    skinButtonFx(bg, -180, -36, 360, 72, { accent: BOT_ACCENT_COLOR, state: 'rest', radius: 12 });
    bg.roundRect(-180, -36, 360, 72, 12).stroke({ width: 2, color: BOT_ACCENT_COLOR, alpha: 0.9 });
    c.addChild(bg);
    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 24,
        fontWeight: 'bold',
        fill: BOT_ACCENT_COLOR,
      }),
    });
    t.anchor.set(0.5);
    c.addChild(t);
    /*
     * ⭐ S185 — START MATCH pops like the title screen's buttons. Owner, auditing every screen:
     * *"if you get into versus bots, the start match doesn't [pop out]"* — while explicitly asking
     * to LEAVE the bot-count, race and difficulty chips alone: *"they do kind of change shade, so
     * that's good … it shouldn't pop out for now."* ⭐ S194 SUPERSEDED for the −/+/✕ steppers by the owner's *"the plus and minus button … across the board"*: they now use `attachButtonFeedback` (hover pop, press squash, click). The race / difficulty chips still do not pop (`attachChipHover` never scales).
     *
     * ⚠ The hand-rolled tint pair here is REPLACED rather than extended: it was a look-alike of the
     * shared grammar that had drifted from it — no scale, no press state, and no click SOUND, which
     * `attachButtonFeedback` registers precisely so it cannot be forgotten at one call site. The
     * plate is already drawn about its own centre, so it scales from the middle with no pivot work.
     */
    attachButtonFeedback(c, bg, onClick, { hit: { x: -180, y: -36, w: 360, h: 72 } });
    attachHoverSheen(c, { x: -180, y: -36, w: 360, h: 72 }, 12);
    return c;
  }
}
