/**
 * SPARK — Title screen (S15 P2; S87 mode restructure).
 *
 * Renders the "SPARK" title + four buttons:
 *   - 1 Player    → solo mode (existing Phase-1 behavior unchanged)
 *   - Multiplayer → networked FFA (2..6 players) via Trystero — friends lobby
 *                   or quick match (S87 rename of the historical "1v1" button;
 *                   the INTERNAL GameMode value stays '1v1', wire-locked)
 *   - VS Bots     → local match vs 1..6 AI sparks (S87; opens BotSetupOverlay)
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

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BOT_ACCENT_COLOR, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';
import { fitTextToWidth } from './textFit.ts';
import { attachButtonFeedback } from './buttonFeedback.ts';

// S121 P4 — 360 was too narrow for the sublabels (the CODEX one ran ~490px wide and escaped the
// box; Multiplayer/VS-Bots grazed the edges). Wider buttons + tighter copy + a fitTextToWidth
// guard make sublabel overflow structurally impossible.
const BUTTON_WIDTH = 430;
const BUTTON_HEIGHT = 72;
const BUTTON_GAP = 24;
const BUTTON_RADIUS = 12;
const SUBLABEL_MAX_W = BUTTON_WIDTH - 36;

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
      'a calm canvas — learn the craft of connection',
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
      'friends lobby or quick match · 2–6 sparks',
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
      'battle 1–6 AI sparks · set each bot’s difficulty',
      BOT_ACCENT_COLOR,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 40 + (BUTTON_HEIGHT + BUTTON_GAP) * 2,
      callbacks.onVsBotsSelected,
    );
    this.container.addChild(btnVsBots);

    // S22 P3 / S104 P3 — the ONE CODEX entry (fourth row). Opens the unified codex with all three
    // tabs (Godly Combos · Combos · Towers & Structures). Replaces the old separate CODEX + COMBOS
    // buttons (owner: "only codex that includes all"). Empty tabs on a fresh profile (no-spoilers).
    // Also openable in-game via the G+C chord.
    const btnCodex = this.makeButton(
      'CODEX',
      'godly · combos · towers — everything you have earned',
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
    attachButtonFeedback(c, bg, onClick);
    return c;
  }
}
