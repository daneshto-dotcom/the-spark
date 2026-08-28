/**
 * SPARK — S155 P2: **LEAVING A MATCH IS A BUTTON NOW.**
 *
 * ## The report
 *
 * Owner: *"back to main doesnt work from multiplayer and from some windows. needs to make it all
 * work but also back to main doesnt pop out or show thaty it is clickable like other buttons... need
 * to make it interractive and obvious."*
 *
 * Two halves, and the A.0 probe found each of them true for a different reason:
 *
 *  1. **THERE IS NO BUTTON AT ALL.** `grep -rni "back to main"` over `src/` returns comments and one
 *     e2e spec title. In a live match the only exit is a **double-Escape** (`main.ts`, S153 A2), whose
 *     own comment says it was chosen because it *"needs no new UI surface"* — an undiscoverable
 *     gesture, and the owner is not reporting a broken button, they are reporting a missing one.
 *  2. **THE BUTTONS THAT DO EXIST DON'T ANSWER.** `lobbyScreen.makeButton` — which builds Host, Join,
 *     Begin **and Back** — had `eventMode`, `cursor` and a bare `pointertap` and nothing else. That is
 *     the *"like other buttons"* comparison: S152 A5 fixed this exact complaint on the title screen and
 *     left the fix inline there. Fixed in `buttonFeedback.ts`, shared by all three surfaces.
 *
 * ## Why a MODAL and not a two-step button
 *
 * The S153 A2 invariant is non-negotiable and has three tests: **a single accidental input must never
 * abandon a live match.** My first design kept that with a two-step *same-button* confirm ("CLICK
 * AGAIN TO LEAVE"). The S155 Council (GEMINI-AUDITOR) called it a hazard and was right:
 *
 * > *"Frustrated or lagging players double-click. A two-step button on the exact same hit-box will
 * > result in players accidentally ejecting themselves from live matches."*
 *
 * ⛔ THAT IS STRICTLY WORSE THAN THE BUG BEING FIXED. A double-click is the single most likely input
 * from someone who just pressed a button and saw the game not respond — i.e. precisely the player this
 * work is for. So: a dimming modal whose two choices are **spatially separated**, and the destructive
 * one is NOT under the pointer that opened it. The second click of an accidental double lands on the
 * backdrop, which is a no-op.
 *
 * ⚠ AND `Keep playing` SITS WHERE THE POINTER ALREADY IS. Deliberate: if a stray double-click does
 * reach the panel, the button it hits is the SAFE one.
 *
 * ## Geometry is registered, because an unregistered surface is invisible to the overlap gate
 *
 * S152 shipped HUD diamonds drawn through the `Q=ZONE` text for exactly that reason, and S150 P1 built
 * `hudSurfaces()` + `hudLayout.test.ts` so it could not happen again. The slot here was not guessed —
 * `hudSurfaces` was dumped for the worst-case 4-row metrics and the free space read off it:
 *
 *   beta-badge   x=1729..1917  y=8..29        energy-gauge   x=1896..1904  y=80..988
 *   audio-glyphs x=1874..1908  y=38..54       progress-rail  x=1882..1888  y=80..988
 *   connection-dot x=1890..1902 y=62..74      tier-banner    x=796..1124   y=79..119
 *
 * ⚠ THE RIGHT EDGE IS THE TRAP: the gauge and progress rail run from y=80 all the way to the footer,
 * so the obvious "flush to `HUD_RIGHT_X`" placement would have drawn straight through the progress
 * rail for the whole match. The button therefore ends at `EXIT_RIGHT_LIMIT` (1876), left of the rail.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { attachButtonFeedback } from './buttonFeedback.ts';

/** ⚠ Must stay < PROGRESS_X (1882) — the rail runs y=80..988 down the right edge. */
export const EXIT_RIGHT_LIMIT = 1876;
export const EXIT_BTN_W = 168;
export const EXIT_BTN_H = 34;
export const EXIT_BTN_X = EXIT_RIGHT_LIMIT - EXIT_BTN_W; // 1708
/** Below the connection dot (ends y=74); clear of the tier banner, which stops at x=1124. */
export const EXIT_BTN_Y = 100;
export const EXIT_BTN_LABEL = 'BACK TO MAIN';

/** Modal panel geometry — centred, so neither choice is under the button that opened it. */
const PANEL_W = 620;
const PANEL_H = 240;
const PANEL_X = (CANVAS_WIDTH - PANEL_W) / 2;
const PANEL_Y = (CANVAS_HEIGHT - PANEL_H) / 2;
const MODAL_BTN_W = 240;
const MODAL_BTN_H = 52;
const MODAL_BTN_Y = PANEL_Y + PANEL_H - MODAL_BTN_H - 28;
/** LEAVE on the left, KEEP on the right — 60 px of dead space between them. */
const LEAVE_BTN_X = PANEL_X + 40;
const KEEP_BTN_X = PANEL_X + PANEL_W - MODAL_BTN_W - 40;

const DANGER = 0xff6b6b;
const SAFE = 0x9bff3b;
const PLATE = 0x141414;

export interface ExitButtonHandle {
  /** Show/hide the in-match button. The modal is force-closed when hidden. */
  setVisible(visible: boolean): void;
  /** True while the confirm modal is up — main.ts uses this to stop Escape double-handling. */
  isConfirmOpen(): boolean;
  /** Close the modal without leaving. Idempotent. */
  closeConfirm(): void;
  /** DEV/e2e geometry: canvas-space centres for the three click targets. */
  getUiPoints(): {
    exit: { x: number; y: number };
    leave: { x: number; y: number };
    keep: { x: number; y: number };
    confirmOpen: boolean;
  };
}

/**
 * Build the in-match exit affordance.
 *
 * `onConfirmLeave` is the ONE shared leave thunk (stop quickmatch → teardown net → RETURN_TO_TITLE),
 * the same one double-Escape and the lobby Back button call. Sharing it is the point: the owner said
 * back-to-main *"doesnt work from multiplayer"*, and three independent copies of a teardown sequence
 * is how one of them ends up missing the network half.
 */
export function makeExitButton(app: Application, onConfirmLeave: () => void): ExitButtonHandle {
  const root = new Container();
  // Above the HUD, below nothing — the modal must cover the board and every in-match surface.
  root.zIndex = 900;
  root.visible = false;

  /* ── the button ─────────────────────────────────────────────────────────── */
  const btn = new Container();
  btn.position.set(EXIT_BTN_X, EXIT_BTN_Y);
  const btnBg = new Graphics();
  // A drop shadow so it reads as resting ABOVE the canvas rather than painted onto it (GEMINI's
  // Pixi affordance list). Drawn as an offset plate under the real one — cheap and static.
  btnBg
    .roundRect(3, 3, EXIT_BTN_W, EXIT_BTN_H, 8)
    .fill({ color: 0x000000, alpha: 0.45 })
    .roundRect(0, 0, EXIT_BTN_W, EXIT_BTN_H, 8)
    .fill({ color: PLATE, alpha: 0.92 })
    .stroke({ width: 2, color: 0xcfe8ff, alpha: 0.85 });
  btn.addChild(btnBg);
  const btnText = new Text({
    text: EXIT_BTN_LABEL,
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: 0xcfe8ff, letterSpacing: 1 }),
  });
  btnText.anchor.set(0.5);
  btnText.position.set(EXIT_BTN_W / 2, EXIT_BTN_H / 2);
  btn.addChild(btnText);
  root.addChild(btn);

  /* ── the confirm modal ──────────────────────────────────────────────────── */
  const modal = new Container();
  modal.visible = false;
  // Full-screen backdrop: dims the match AND swallows clicks, so a stray second click of an
  // accidental double-click lands here and does nothing instead of reaching a button.
  const backdrop = new Graphics();
  backdrop.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.72 });
  backdrop.eventMode = 'static';
  modal.addChild(backdrop);

  const panel = new Graphics();
  panel
    .roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14)
    .fill({ color: PLATE, alpha: 0.98 })
    .stroke({ width: 2, color: 0xcfe8ff, alpha: 0.9 });
  modal.addChild(panel);

  const title = new Text({
    text: 'Leave the match?',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 30, fill: 0xffffff, letterSpacing: 1 }),
  });
  title.anchor.set(0.5);
  title.position.set(CANVAS_WIDTH / 2, PANEL_Y + 58);
  modal.addChild(title);

  const body = new Text({
    text: 'You will return to the main menu. This match ends for you.',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: 0x9aa4b2 }),
  });
  body.anchor.set(0.5);
  body.position.set(CANVAS_WIDTH / 2, PANEL_Y + 100);
  modal.addChild(body);

  const modalBtn = (label: string, color: number, x: number, onClick: () => void): Container => {
    const c = new Container();
    c.position.set(x, MODAL_BTN_Y);
    const bg = new Graphics();
    bg.roundRect(0, 0, MODAL_BTN_W, MODAL_BTN_H, 10)
      .fill({ color: 0x1e1e1e, alpha: 0.95 })
      .stroke({ width: 2, color, alpha: 0.9 });
    c.addChild(bg);
    const t = new Text({
      text: label,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: color }),
    });
    t.anchor.set(0.5);
    t.position.set(MODAL_BTN_W / 2, MODAL_BTN_H / 2);
    c.addChild(t);
    attachButtonFeedback(c, bg, onClick);
    return c;
  };

  const closeConfirm = (): void => {
    modal.visible = false;
  };

  const leaveBtn = modalBtn('Leave match', DANGER, LEAVE_BTN_X, () => {
    closeConfirm();
    onConfirmLeave();
  });
  const keepBtn = modalBtn('Keep playing', SAFE, KEEP_BTN_X, closeConfirm);
  modal.addChild(leaveBtn);
  modal.addChild(keepBtn);
  root.addChild(modal);

  attachButtonFeedback(btn, btnBg, () => {
    modal.visible = true;
  });

  app.stage.addChild(root);
  app.stage.sortableChildren = true;

  return {
    setVisible(visible: boolean): void {
      root.visible = visible;
      // Hiding the affordance must never leave a modal orphaned on screen — e.g. the match ends
      // while the confirm is up. Belt-and-braces: the modal is a child of root, so it would be
      // hidden anyway, but a re-show must not resurrect it mid-air.
      if (!visible) modal.visible = false;
    },
    isConfirmOpen(): boolean {
      return modal.visible;
    },
    closeConfirm,
    getUiPoints() {
      return {
        exit: { x: EXIT_BTN_X + EXIT_BTN_W / 2, y: EXIT_BTN_Y + EXIT_BTN_H / 2 },
        leave: { x: LEAVE_BTN_X + MODAL_BTN_W / 2, y: MODAL_BTN_Y + MODAL_BTN_H / 2 },
        keep: { x: KEEP_BTN_X + MODAL_BTN_W / 2, y: MODAL_BTN_Y + MODAL_BTN_H / 2 },
        confirmOpen: modal.visible,
      };
    },
  };
}

/**
 * The button's registered HUD rectangle. Exported so `hudSurfaces()` can include it WITHOUT importing
 * Pixi — the same split every other surface in that registry uses.
 */
export function exitButtonRect(): { x: number; y: number; w: number; h: number } {
  return { x: EXIT_BTN_X, y: EXIT_BTN_Y, w: EXIT_BTN_W, h: EXIT_BTN_H };
}
