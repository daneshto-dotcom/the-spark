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
   */
  setReconnecting(reconnecting: boolean, secondsLeft?: number): void;
  /**
   * S124 P1 (host-migration D4) — the MIGRATING variant: the host is gone but the mesh
   * survives, so a warranted survivor is taking over automatically (gold title; the
   * countdown is the worst-case claim-ladder deadline). Same modal, same bail-out button.
   */
  setMigrating(secondsLeft?: number): void;
}

export function makeConnectionLostOverlay(
  app: Application,
  onReturn: () => void,
): ConnectionLostOverlayHandle {
  const container = new Container();

  const overlayBg = new Graphics();
  overlayBg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.88 });
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
  btnBg.roundRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 8)
    .fill({ color: 0x222222, alpha: 0.9 })
    .stroke({ width: 2, color: 0x888888, alpha: 0.8 });
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
