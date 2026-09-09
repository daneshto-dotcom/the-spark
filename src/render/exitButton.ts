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
 *   beta-badge   x=1729..1917  y=8..29
 *   settings-gear x=1888..1904  y=38..54
 *   (S169 — the energy gauge and score rail were REMOVED; the right edge now holds only the gear
 *    and the connection dot, both on the GAUGE_X column.)
 *   (S169 — was `audio-glyphs` x=1874..1908, a ♪/⚙ PAIR; the ♪ was removed and the gear centred)
 *   connection-dot x=1890..1902 y=62..74      tier-banner    x=796..1124   y=79..119
 *
 * ⚠ THE RIGHT EDGE IS THE TRAP: the gauge and progress rail run from y=80 all the way to the footer,
 * so the obvious "flush to `HUD_RIGHT_X`" placement would have drawn straight through the progress
 * rail for the whole match. The button therefore ends at `EXIT_RIGHT_LIMIT` (1876), left of the rail.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { attachButtonFeedback } from './buttonFeedback.ts';

/** Must stay < PROGRESS_X (1882) - the rail runs y=80..988 down the right edge. */
export const EXIT_RIGHT_LIMIT = 1876;
export const EXIT_BTN_W = 168;
export const EXIT_BTN_H = 34;

/*
 * S165 (owner: "back to main covering the player two castle") - MOVED LEFT, OFF SEAT 1'S KEEP.
 *
 * THE COLLISION, IN NUMBERS. On QUADRANTS_4P seat 1's castle anchor is (1790, 130) and its keep box
 * is KEEP_W x KEEP_H = 74 x 58, so it occupies x 1753..1827, y 101..159. The button was flush to
 * EXIT_RIGHT_LIMIT at x 1708..1876, y 100..134. That overlaps on both axes, and the castle SPRITE
 * is drawn taller than the keep box, so the button sat squarely on top of the art.
 *
 * WHY THE BUTTON MOVED AND NOT THE CASTLE. The four anchors are the board's corners and drive real
 * simulation - gatherer spawns, castle-gun range, keep hit-testing, zone ownership, the race-unit
 * emitter and the army recall all read `castleAnchor`. Nudging one of them left would desymmetrise
 * the board and change gameplay to fix a HUD overlap. The HUD is the layer that has to yield, which
 * is the same principle `expectNoHudOverlaps` already enforces for every other instrument.
 *
 * THE NEW SLOT is derived, not guessed: the right edge sits KEEP_CLEARANCE left of the keep's left
 * edge. The band x 1524..1692 at y 100..134 is free in the worst-case 4-row HUD dump quoted above -
 * the tier banner stops at x=1124 and the beta badge starts at y=8 and ends at y=29.
 */
/*
 * ⭐ S168 (owner: "move the back to main all the way to the top to be instead the Beta S17 Phase - 2").
 *
 * ⭐ AND MOVING IT UP RETIRES THE S165 CONSTRAINT RATHER THAN WORKING AROUND IT. The block above is
 * kept because it explains why the button sat where it did: seat 1's keep on QUADRANTS_4P occupies
 * y 101..159, and the button's old y 100..134 overlapped it, so S165 slid the button LEFT to escape.
 * At the new y 8..42 there is no vertical overlap with the keep AT ALL, so the horizontal dodge is
 * no longer buying anything — the button is free to sit far right, in the top chrome row, which is
 * exactly where the owner asked for it.
 *
 * THE SLOT IS DERIVED, NOT EYEBALLED — same method S165 used. The top-right column, right to left:
 *   energy gauge / progress rail  x 1882..1904, y 80 down    (below us)
 *   connection dot                x 1890..1902, y  62..74    (below us)
 *   ♪ / ⚙ glyph pair              x 1874..1908, y  38..54    (below and right of us)
 *   BETA badge plate              x 1827..1917, y   8..33    (immediately right of us)
 * so the button takes the band ending BADGE_CLEARANCE left of the badge plate, at the badge's own
 * top. `hudLayout.test.ts` sweeps every pair and would name the collision if this is ever wrong.
 */

/**
 * Room the layout GUARANTEES for the badge TEXT. "BETA" is 4 chars at 12 px monospace with
 * letterSpacing 3 — about 41 px — so 72 is a deliberate over-reserve: the test feeds this same
 * number as `badgeWidth`, which makes the sweep a STRICTER bound than the real badge.
 */
const BADGE_TEXT_RESERVE = 72;
/** ui.ts draws the badge plate starting 9 px left of the text. Must match `hudSurfaces()`. */
const BADGE_PLATE_PAD = 9;
/** Breathing room between the button and the badge plate. */
const BADGE_CLEARANCE = 20;
/**
 * ⚠ Mirrors `HUD_RIGHT_X` in ui.ts (`CANVAS_WIDTH - 12`). It is duplicated rather than imported
 * because ui.ts imports THIS file for `exitButtonRect()`, so importing back would be a cycle.
 * `hudLayout.test.ts` pins the two in step so the duplicate cannot drift.
 */
const HUD_RIGHT_MIRROR = CANVAS_WIDTH - 12;

export const EXIT_BTN_X =
  HUD_RIGHT_MIRROR - BADGE_TEXT_RESERVE - BADGE_PLATE_PAD - BADGE_CLEARANCE - EXIT_BTN_W;
/** The top chrome row — same top edge as the BETA badge plate (`BETA_BADGE_Y - 4` in ui.ts). */
export const EXIT_BTN_Y = 8;
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
    attachButtonFeedback(c, bg, onClick, {
      hit: { x: 0, y: 0, w: MODAL_BTN_W, h: MODAL_BTN_H },
    });
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

  // ⚠ The hit rect is the PLATE, not the plate plus its drop shadow: the shadow is decoration drawn
  // at (3, 3) and must not be clickable, or the button would appear to respond 3 px outside itself.
  attachButtonFeedback(
    btn,
    btnBg,
    () => {
      modal.visible = true;
    },
    { hit: { x: 0, y: 0, w: EXIT_BTN_W, h: EXIT_BTN_H } },
  );

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
