/**
 * SPARK — Title screen (S15 P2; S87 mode restructure).
 *
 * Renders the "SPARK" title + four buttons:
 *   - 1 Player    → solo mode (existing Phase-1 behavior unchanged)
 *   - Multiplayer → networked FFA (2..MAX_PLAYERS seats) via Trystero — friends
 *                   lobby or quick match (S87 rename of the historical "1v1" button;
 *                   the INTERNAL GameMode value stays '1v1', wire-locked)
 *   - VS Bots     → local match vs 1..MAX_BOTS AI sparks (S87; opens BotSetupOverlay)
 *   - CODEX       → S104 P3: the ONE unified codex (3 tabs: Godly Combos / Combos / Towers &
 *                   Structures). Replaces the old separate CODEX + COMBOS buttons (owner: "only
 *                   codex that includes all"). Also openable in-game via the G+C chord.
 *
 * Visibility is gated on world.gameState === 'TITLE'. main.ts adds/removes
 * the container from the stage on FSM transition.
 *
 * Click callbacks are passed in via the constructor — keeps this module
 * pure presentation (no direct dispatch dependency).
 */

import { Application, Container, FillGradient, Graphics, Text, TextStyle } from 'pixi.js';
import {
  BOT_ACCENT_COLOR, CANVAS_HEIGHT, CANVAS_WIDTH, MAX_BOTS, MAX_PLAYERS, PLAYER_COLORS,
} from '../constants.ts';
import { fitTextToWidth } from './textFit.ts';
import { attachButtonFeedback } from './buttonFeedback.ts';
// ⭐ S194 T5 — the shared skin (glass plate, icon, hover sheen — all inside the button's hit rect).
import { skinIcon, type SkinIconKind } from './uiSkin.ts';
import { attachHoverSheen, skinStaticPlate } from './uiSkinButton.ts';
import type { TitleBackdrop } from './titleBackdrop.ts';

// S121 P4 — 360 was too narrow for the sublabels (the CODEX one ran ~490px wide and escaped the
// box; Multiplayer/VS-Bots grazed the edges). Wider buttons + tighter copy + a fitTextToWidth
// guard make sublabel overflow structurally impossible.
const BUTTON_WIDTH = 430;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 24;
const BUTTON_RADIUS = 12;
// ⭐ S194 T5 — the icon takes the left ~64 px, so the text block moves right and narrows to match.
const ICON_SIZE = 30;
const ICON_CX = -BUTTON_WIDTH / 2 + 36;
const TEXT_SHIFT = 26;
const SUBLABEL_MAX_W = BUTTON_WIDTH - 36 - TEXT_SHIFT * 2 - 12;

export interface TitleScreenCallbacks {
  onSoloSelected(): void;
  on1v1Selected(): void;
  /** S87 — open the VS-BOTS setup overlay (bot count + per-bot difficulty). */
  onVsBotsSelected(): void;
  /** S22 P3 / S104 P3 — open the unified Codex (3 tabs: Godly Combos / Combos / Towers & Structures). */
  onCodexSelected(): void;
  /** S149 P5 — open ARCADE: standalone minigames, starting with NONET. */
  onArcadeSelected(): void;
}

/** S85 P4c — canvas-space button centers for the e2e geometry-getter migration.
 * S87: `oneVOne` KEY kept (e2e churn guard) — it is the Multiplayer button. */
export interface TitleButtonCenters {
  readonly solo: { x: number; y: number };
  readonly oneVOne: { x: number; y: number };
  readonly vsBots: { x: number; y: number };
  readonly codex: { x: number; y: number };
  /** S149 P5 — the ARCADE entry, below CODEX. */
  readonly arcade: { x: number; y: number };
}

export class TitleScreen {
  readonly container: Container;
  private visible = false;
  /** ⭐ S189 fix round (audit NET-1) — one line under the subtitle saying why we are back here. */
  private readonly notice: Text;

  constructor(app: Application, callbacks: TitleScreenCallbacks) {
    this.container = new Container();

    const title = new Text({
      text: 'SPARK',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 144,
        fontWeight: 'bold',
        // ⭐ S194 T5 — a cold-white-to-ice gradient with a soft blue glow, over the living backdrop.
        // (A gradient needs a canvas to build; headless — vitest — falls back to plain white.)
        fill: typeof document === 'undefined' ? 0xffffff : new FillGradient({
          type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
          colorStops: [{ offset: 0, color: 0xffffff }, { offset: 0.55, color: 0xdff4ff }, { offset: 1, color: 0x7fc8ff }],
        }),
        stroke: { color: 0x0b1a2e, width: 6 },
        dropShadow: { color: 0x3b9cff, alpha: 0.85, blur: 26, distance: 0, angle: 0 },
        // Room for the glow inside the text texture, or its blur is cut off in a hard-edged box.
        padding: 60,
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
        fill: 0x9fb4cc,
        letterSpacing: 2,
      }),
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    this.container.addChild(subtitle);

    this.notice = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 18,
        fill: 0xffcc66,
        letterSpacing: 1,
      }),
    });
    this.notice.anchor.set(0.5);
    this.notice.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    this.notice.visible = false;
    this.container.addChild(this.notice);

    const btnSolo = this.makeButton(
      'play',
      '1 Player',
      'a calm canvas — learn the craft of connection',
      PLAYER_COLORS[0],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40,
      callbacks.onSoloSelected,
    );
    this.container.addChild(btnSolo);

    // S87 — renamed from "1v1 (2 Player)": the mode has seated more than two since
    // S62; the user mandated the honest name. Internal GameMode stays '1v1'.
    //
    // ⛔ S173 B2 (owner) — **THIS SUBLABEL SAID "2–6 SPARKS" AND THE GAME SEATS FOUR.**
    // *"it still says in the home page or whatever that it's up to six, but it's only up to four.
    // Yes, we have six colors. But make sure that's consistent and coherent with what's supposed to
    // be."* The cap moved 6 → 4 in S147 R41 (*"from now on the game will be only upto 4 players"*)
    // and this line did not follow — it was the first thing he saw on the home screen for 26
    // sessions.
    //
    // ⭐ IT IS INTERPOLATED NOW, NOT WRITTEN IN PROSE — the same fix S147 R42 made to the lobby
    // status line (`lobbyStateMachine.ts`: *"the cap is INTERPOLATED, not written in prose"*), for
    // the same reason: a hardcoded cap in copy is a promise the code stops keeping the moment the
    // constant moves, and it moves silently because no test can fail on a sentence.
    //
    // ⚠ SIX COLOURS IS STILL TRUE AND IS DELIBERATELY NOT TOUCHED. `PLAYER_COLORS` has six entries
    // because they are six RACES (owner R45: *"its ok to have 6 colors with only 4 players max"*),
    // of which at most MAX_PLAYERS are in play at once. **Six races, four seats** — the number he
    // was correcting is the SEAT count, and the board says so: `QUADRANTS_4P` has exactly four
    // zones, so a fifth seat has no quadrant to own.
    const btn1v1 = this.makeButton(
      'globe',
      'Multiplayer',
      `friends lobby or quick match · 2–${MAX_PLAYERS} sparks`,
      PLAYER_COLORS[1],
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + BUTTON_HEIGHT + BUTTON_GAP,
      callbacks.on1v1Selected,
    );
    this.container.addChild(btn1v1);

    // S87 — VS BOTS entry (third row): local match vs 1..MAX_BOTS AI sparks with
    // per-bot difficulty. Opens BotSetupOverlay; the match itself reuses the
    // FFA rule set (mode 'bots').
    //
    // ⛔ S173 B2 — THE SAME LIE ONE ROW DOWN, and arguably the worse half: "1–6 AI sparks" plus
    // the human promises SEVEN seats, which is the exact configuration S147 R45 retired the silver
    // colour to make impossible. `MAX_BOTS === MAX_PLAYERS - 1`, and `BotSetupOverlay` has always
    // clamped its picker to it (`Math.min(MAX_BOTS, n)`) — only the copy was stale, so the button
    // advertised a match the next screen would refuse to set up.
    const btnVsBots = this.makeButton(
      'bots',
      'VS Bots',
      `battle 1–${MAX_BOTS} AI sparks · set each bot’s difficulty`,
      BOT_ACCENT_COLOR,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 2,
      callbacks.onVsBotsSelected,
    );
    this.container.addChild(btnVsBots);

    // S22 P3 / S104 P3 — the ONE CODEX entry (fourth row). Replaces the old separate CODEX + COMBOS
    // buttons (owner: "only codex that includes all"). Empty tabs on a fresh profile (no-spoilers).
    // Also openable in-game via the G+C chord.
    // ⚠ S173 P5 — THE SUBTITLE NAMED THE TAB THAT WAS JUST DELETED. It read 'godly · combos ·
    // towers', and the GODLY COMBOS tab is gone (owner: *"remove the whole godly combos"*, Voltkin
    // being *"just a tower now and structure"*). This is the codebase's own four-sites lesson in
    // miniature — grep for the CLAUSE, not for the files you remember touching: the tab lived in
    // codexOverlay.ts and main.ts, and the only place a PLAYER read its name was here.
    const btnCodex = this.makeButton(
      'book',
      'CODEX',
      'combos · towers — everything you have earned',
      0xffd60a,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 3,
      callbacks.onCodexSelected,
    );
    this.container.addChild(btnCodex);

    // ⭐ S149 P5 — ARCADE (fifth row, BELOW the Codex exactly as the owner asked). Standalone
    // minigames with no match attached — the home NONET was given when its demolition was
    // reversed: "you may not delete NONET … we will add ARCADE option to the front page below
    // the Codex and add bunch of minigames like the NONET SODOKU".
    const btnArcade = this.makeButton(
      'star',
      'ARCADE',
      'standalone trials · NONET and more to come',
      0x9b7bff,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 4,
      callbacks.onArcadeSelected,
    );
    this.container.addChild(btnArcade);

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
        arcade: { x: btnArcade.position.x, y: btnArcade.position.y },
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
    this.backdrop?.setRunning(visible);
    if (visible && this.backdrop === null && !this.backdropLoading) this.loadBackdrop();
  }

  /** ⭐ S194 T5 — the animated home backdrop, a lazy chunk; until it lands the screen is as before. */
  private backdrop: TitleBackdrop | null = null;
  private backdropLoading = false;
  private loadBackdrop(): void {
    this.backdropLoading = true;
    import('./titleBackdrop.ts')
      .then((m) => {
        this.backdrop = new m.TitleBackdrop();
        this.container.addChildAt(this.backdrop.container, 0);
        this.backdrop.setRunning(this.visible);
      })
      .catch(() => { /* the plain title is a complete screen; a failed chunk costs only the motes */ });
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** ⭐ S189 fix round (audit NET-1) — show (or clear, with null) the one-line notice. */
  setNotice(text: string | null): void {
    if (text === null) {
      this.notice.visible = false;
      return;
    }
    this.notice.text = text;
    this.notice.visible = true;
  }

  noticeText(): string | null {
    return this.notice.visible ? this.notice.text : null;
  }

  private makeButton(
    icon: SkinIconKind,
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
      .fill({ color: 0x0d121c, alpha: 0.94 });
    const hit = { x: -BUTTON_WIDTH / 2, y: -BUTTON_HEIGHT / 2, w: BUTTON_WIDTH, h: BUTTON_HEIGHT };
    skinStaticPlate(bg, hit, accentColor, BUTTON_RADIUS);
    // The icon sits in its own inset socket, so it reads as a badge on the plate.
    bg.roundRect(ICON_CX - 24, -24, 48, 48, 10).stroke({ width: 1.5, color: accentColor, alpha: 0.45 });
    skinIcon(bg, icon, ICON_CX, 0, ICON_SIZE, accentColor, 0.95);
    bg.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_RADIUS)
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
    labelText.position.set(TEXT_SHIFT, -10);
    c.addChild(labelText);

    const subText = new Text({
      text: sublabel,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: 0x888888 }),
    });
    subText.anchor.set(0.5);
    subText.position.set(TEXT_SHIFT, 16);
    fitTextToWidth(subText, SUBLABEL_MAX_W, 9); // S121 P4 — sublabels can never escape the button
    c.addChild(subText);

    /*
     * ⭐ S152 A5 (owner playtest) — HOVER, PRESS AND SOUND. The old feedback was a `bg.tint` of
     * 0xddddee, i.e. a ~13% lightening of a near-black plate — effectively invisible, and there was
     * no press state and no sound at all.
     *
     * Owner: *"it all need to either pop out, be highlighted, make a sound or all at once so we
     * know when we have clicked something and it simply didnt work"*. So all three:
     *   · HOVER  — the plate brightens AND the whole button scales up 4%: it pops out.
     *   · PRESS  — it scales DOWN below rest on pointerdown. This is the half that answers "did my
     *              click register", and it is the half that did not exist.
     *   · SOUND  — an accept blip on tap.
     *
     * ⚠ `pointerupoutside` MUST reset the scale, or dragging off a pressed button leaves it stuck
     * depressed forever — a button that looks permanently held is worse than no press state.
     *
     * ⭐ S155 P2 — EXTRACTED, NOT CHANGED. The block that used to live here is now
     * `attachButtonFeedback` in buttonFeedback.ts, verbatim: same scales (1 / 1.04 / 0.97), same
     * 0xbfd4ff hover tint, same blip, same `pointerupoutside` reset. It moved because the owner
     * reported the SAME complaint about a second screen — *"back to main doesnt pop out or show
     * thaty it is clickable like other buttons"* — and *"like other buttons"* turned out to mean
     * "like these ones", since `lobbyScreen.makeButton` had no hover, press or sound at all. One
     * grammar shared by every button beats a third hand-rolled variant and a fourth report.
     */
    // ⚠ CENTRED origin — this factory draws its plate from (-w/2, -h/2), unlike the lobby's.
    attachButtonFeedback(c, bg, onClick, {
      hit: { x: -BUTTON_WIDTH / 2, y: -BUTTON_HEIGHT / 2, w: BUTTON_WIDTH, h: BUTTON_HEIGHT },
    });
    attachHoverSheen(c, hit, BUTTON_RADIUS);
    return c;
  }
}
