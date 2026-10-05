/**
 * SPARK — connection-lost overlay (extracted from lobbyScreen.ts at S22 P2
 * per §XV anti-bloat). Full-screen modal that appears when a peer drops mid-
 * session. User clicks "Return to Title" to re-enter the lobby flow.
 *
 * Factory pattern: returns { container, setVisible }. The container is
 * added to app.stage by the factory; the caller (LobbyScreen) owns the
 * visibility lifecycle via setVisible.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
// ⭐ S194 T5 — the shared skin (still glass inside the button's own plate).
import { attachChipHover, skinStaticPlate } from './uiSkinButton.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';

const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 48;

export interface ConnectionLostOverlayHandle {
  readonly container: Container;
  setVisible(visible: boolean): void;
  /**
   * S82 P4(b) — flip between the RECONNECTING grace state (auto-rejoin in progress;
   * cyan title + countdown help line) and the terminal CONNECTION LOST state. The
   * Return-to-Title button stays available in both (a user can always bail early).
   * ⭐ S195 T20 (owner B-13, RULED) — the RECONNECTING… heading now also covers the window PAST the 15 s
   * grace while a rejoin attempt is in flight (`planConnectionFrame` → `rejoinAttemptInFlight`,
   * `src/net/reconnectPolicy.ts`): `secondsLeft` is then the give-up remainder (3 min from the loss), not
   * the grace remainder. The heading text is unchanged on purpose — the owner's words were *"keep
   * RECONNECTING…"*; only WHEN it is shown moved, and that decision lives in the policy, not here.
   */
  setReconnecting(reconnecting: boolean, secondsLeft?: number): void;
  /**
   * S124 P1 (host-migration D4) — the MIGRATING variant: the host is gone but the mesh
   * survives, so a warranted survivor is taking over automatically (gold title; the
   * countdown is the worst-case claim-ladder deadline). Same modal, same bail-out button.
   */
  setMigrating(secondsLeft?: number): void;
  /**
   * ⭐ S192 SEAM-1 — the terminal CONNECTION LOST state, with a help line that says what is still happening:
   * a client still retrying, a host still waiting for its peers, or (neither) the old "return to title to
   * retry", which is then true. Replaces `setReconnecting(false)` at the main.ts terminal site.
   */
  setTerminal(retrying: boolean, waitingForPeers: boolean): void;
}

export function makeConnectionLostOverlay(
  app: Application,
  onReturn: () => void,
): ConnectionLostOverlayHandle {
  const container = new Container();

  const overlayBg = new Graphics();
  overlayBg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.88 });
  // ⛔ S189 (audit R2-1) — the backdrop SWALLOWS clicks. Passive, a click fell through to an open draft
  // panel beneath (no longer zIndex 900 since C1) and committed a pick the player cannot see. The
  // Return button is a LATER child and still wins the hit-test.
  overlayBg.eventMode = 'static';
  container.addChild(overlayBg);

  const lostText = new Text({
    text: 'CONNECTION LOST',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 56, fill: 0xff3b6b, letterSpacing: 8 }),
  });
  lostText.anchor.set(0.5);
  lostText.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
  container.addChild(lostText);

  const lostHelp = new Text({
    text: 'peer dropped — return to title to retry',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xcccccc }),
  });
  lostHelp.anchor.set(0.5);
  lostHelp.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
  container.addChild(lostHelp);

  const returnBtn = new Container();
  const btnBg = new Graphics();
  btnBg.roundRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 8).fill({ color: 0x141b26, alpha: 0.92 });
  skinStaticPlate(btnBg, { x: 0, y: 0, w: BUTTON_WIDTH, h: BUTTON_HEIGHT }, 0xcfe8ff, 8);
  btnBg.roundRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 8).stroke({ width: 2, color: 0x888888, alpha: 0.8 });
  returnBtn.addChild(btnBg);
  const btnText = new Text({
    text: 'Return to Title',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: 0x888888 }),
  });
  btnText.anchor.set(0.5);
  btnText.position.set(BUTTON_WIDTH / 2, BUTTON_HEIGHT / 2);
  returnBtn.addChild(btnText);
  returnBtn.eventMode = 'static';
  returnBtn.cursor = 'pointer';
  returnBtn.on('pointertap', onReturn);
  attachChipHover(returnBtn, btnBg, { x: 0, y: 0, w: BUTTON_WIDTH, h: BUTTON_HEIGHT }, 8);
  returnBtn.position.set(CANVAS_WIDTH / 2 - BUTTON_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
  container.addChild(returnBtn);

  container.visible = false;
  app.stage.addChild(container);

  return {
    container,
    setVisible(visible: boolean): void {
      container.visible = visible;
    },
    setReconnecting(reconnecting: boolean, secondsLeft?: number): void {
      if (reconnecting) {
        const secs = secondsLeft !== undefined ? ` (${Math.max(0, Math.ceil(secondsLeft))}s)` : '';
        if (lostText.text !== 'RECONNECTING…') {
          lostText.text = 'RECONNECTING…';
          lostText.style.fill = 0x3bd7ff;
        }
        const help = `connection dropped — retrying automatically${secs}`;
        if (lostHelp.text !== help) lostHelp.text = help;
      } else if (lostText.text !== 'CONNECTION LOST') {
        lostText.text = 'CONNECTION LOST';
        lostText.style.fill = 0xff3b6b;
        lostHelp.text = 'peer dropped — return to title to retry';
      }
    },
    setTerminal(retrying: boolean, waitingForPeers: boolean): void {
      if (lostText.text !== 'CONNECTION LOST') {
        lostText.text = 'CONNECTION LOST';
        lostText.style.fill = 0xff3b6b;
      }
      const help = retrying
        ? 'still reconnecting — or return to title'
        : waitingForPeers
          ? 'waiting for the other player to reconnect — or return to title'
          : 'peer dropped — return to title to retry';
      if (lostHelp.text !== help) lostHelp.text = help;
    },
    setMigrating(secondsLeft?: number): void {
      const secs = secondsLeft !== undefined ? ` (${Math.max(0, Math.ceil(secondsLeft))}s)` : '';
      if (lostText.text !== 'MIGRATING…') {
        lostText.text = 'MIGRATING…';
        lostText.style.fill = 0xffc93b;
      }
      const help = `host lost — a surviving player is taking over automatically${secs}`;
      if (lostHelp.text !== help) lostHelp.text = help;
    },
  };
}
