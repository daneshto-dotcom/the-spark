/**
 * SPARK — Lobby screen (S15 P2).
 *
 * Two-pane UI:
 *   - Host pane: generates a 6-char room code; shows "Waiting for Player 2..."
 *     until a peer connects, then enables "Begin Match" button.
 *   - Join pane: text input for room code; "Connect" button initiates
 *     transport.connect(code); shows status / errors.
 *
 * "Back to Title" button cancels.
 *
 * Visibility gated on world.gameState === 'LOBBY'. Connection-lost overlay
 * shows full-screen "Connection lost — Return to Title" when peers drop
 * (handled in this same module since it's the same fallback path).
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';

const PANE_WIDTH = 480;
const PANE_HEIGHT = 360;
const PANE_GAP = 40;
const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 48;

export type LobbyMode = 'select' | 'hosting' | 'joining';

export interface LobbyScreenCallbacks {
  onHostStart(): string;            // returns generated room code
  onJoinAttempt(code: string): void;
  onBeginMatch(): void;
  onBackToTitle(): void;
  onReturnFromConnectionLost(): void;
}

export class LobbyScreen {
  readonly container: Container;
  private mode: LobbyMode = 'select';
  private statusText: Text;
  private codeText: Text;
  private joinInputText: Text;
  private joinBuffer = '';
  private hostPane: Container;
  private joinPane: Container;
  private beginButton: Container;
  private connectionLostOverlay: Container;
  private hostConnected = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(app: Application, callbacks: LobbyScreenCallbacks) {
    this.container = new Container();

    // Title
    const title = new Text({
      text: '1v1 LOBBY',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: 0xffffff, letterSpacing: 6 }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 120);
    this.container.addChild(title);

    // Two panes side by side
    const paneY = CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2;
    const hostPaneX = CANVAS_WIDTH / 2 - PANE_WIDTH - PANE_GAP / 2;
    const joinPaneX = CANVAS_WIDTH / 2 + PANE_GAP / 2;

    this.hostPane = this.makePane('HOST', PLAYER_COLORS[0], hostPaneX, paneY);
    this.joinPane = this.makePane('JOIN', PLAYER_COLORS[1], joinPaneX, paneY);
    this.container.addChild(this.hostPane);
    this.container.addChild(this.joinPane);

    // Host button — generate room code
    const hostBtn = this.makeButton('Host New Room', PLAYER_COLORS[0], () => {
      const code = callbacks.onHostStart();
      this.mode = 'hosting';
      this.codeText.text = code;
      this.statusText.text = 'Waiting for Player 2...';
      this.renderState();
    });
    hostBtn.position.set(hostPaneX + PANE_WIDTH / 2 - BUTTON_WIDTH / 2, paneY + 220);
    this.hostPane.addChild(hostBtn);

    this.codeText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 56, fill: 0xffffff, letterSpacing: 12 }),
    });
    this.codeText.anchor.set(0.5);
    this.codeText.position.set(hostPaneX + PANE_WIDTH / 2, paneY + 130);
    this.hostPane.addChild(this.codeText);

    // Join input + button
    this.joinInputText = new Text({
      text: 'enter code...',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fill: 0x666666, letterSpacing: 8 }),
    });
    this.joinInputText.anchor.set(0.5);
    this.joinInputText.position.set(joinPaneX + PANE_WIDTH / 2, paneY + 130);
    this.joinPane.addChild(this.joinInputText);

    const joinInputBg = new Graphics();
    joinInputBg.roundRect(joinPaneX + 40, paneY + 100, PANE_WIDTH - 80, 60, 6)
      .stroke({ width: 1, color: 0x444444, alpha: 0.7 });
    this.joinPane.addChild(joinInputBg);

    const joinBtn = this.makeButton('Connect', PLAYER_COLORS[1], () => {
      if (this.joinBuffer.length === 6) {
        this.mode = 'joining';
        this.statusText.text = 'Connecting...';
        callbacks.onJoinAttempt(this.joinBuffer);
        this.renderState();
      } else {
        this.statusText.text = 'Code must be 6 characters.';
        this.renderState();
      }
    });
    joinBtn.position.set(joinPaneX + PANE_WIDTH / 2 - BUTTON_WIDTH / 2, paneY + 220);
    this.joinPane.addChild(joinBtn);

    // Bottom status text (shared)
    this.statusText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: 0xaaaaaa }),
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(CANVAS_WIDTH / 2, paneY + PANE_HEIGHT + 40);
    this.container.addChild(this.statusText);

    // Begin Match (revealed when peer joins on host side)
    this.beginButton = this.makeButton('Begin Match', 0x9bff3b, callbacks.onBeginMatch);
    this.beginButton.position.set(CANVAS_WIDTH / 2 - BUTTON_WIDTH / 2, paneY + PANE_HEIGHT + 70);
    this.beginButton.visible = false;
    this.container.addChild(this.beginButton);

    // Back button
    const backBtn = this.makeButton('Back to Title', 0x888888, () => {
      this.reset();
      callbacks.onBackToTitle();
    });
    backBtn.position.set(40, CANVAS_HEIGHT - 80);
    this.container.addChild(backBtn);

    // Connection-lost overlay (full-screen)
    this.connectionLostOverlay = new Container();
    const overlayBg = new Graphics();
    overlayBg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.88 });
    this.connectionLostOverlay.addChild(overlayBg);

    const lostText = new Text({
      text: 'CONNECTION LOST',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 56, fill: 0xff3b6b, letterSpacing: 8 }),
    });
    lostText.anchor.set(0.5);
    lostText.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    this.connectionLostOverlay.addChild(lostText);

    const lostHelp = new Text({
      text: 'peer dropped — return to title to retry',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xcccccc }),
    });
    lostHelp.anchor.set(0.5);
    lostHelp.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    this.connectionLostOverlay.addChild(lostHelp);

    const returnBtn = this.makeButton('Return to Title', 0x888888, callbacks.onReturnFromConnectionLost);
    returnBtn.position.set(CANVAS_WIDTH / 2 - BUTTON_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
    this.connectionLostOverlay.addChild(returnBtn);

    this.connectionLostOverlay.visible = false;
    app.stage.addChild(this.connectionLostOverlay);

    app.stage.addChild(this.container);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
    if (visible) {
      this.installKeyHandler();
    } else {
      this.uninstallKeyHandler();
    }
  }

  setConnectionLostVisible(visible: boolean): void {
    this.connectionLostOverlay.visible = visible;
  }

  /** Called by main.ts every frame; updates "Begin Match" + status based on peer count. */
  updatePeerStatus(peerCount: number): void {
    if (this.mode === 'hosting' && peerCount > 0 && !this.hostConnected) {
      this.hostConnected = true;
      this.statusText.text = 'Player 2 connected! Press Begin Match.';
      this.beginButton.visible = true;
      this.renderState();
    } else if (this.mode === 'joining' && peerCount > 0) {
      this.statusText.text = 'Connected. Waiting for host to begin...';
      this.renderState();
    }
  }

  reset(): void {
    this.mode = 'select';
    this.codeText.text = '';
    this.joinInputText.text = 'enter code...';
    this.joinBuffer = '';
    this.statusText.text = '';
    this.hostConnected = false;
    this.beginButton.visible = false;
    this.connectionLostOverlay.visible = false;
    this.renderState();
  }

  private renderState(): void {
    // Hide non-active pane elements visually based on mode.
    if (this.mode === 'hosting') {
      this.joinPane.alpha = 0.3;
      this.hostPane.alpha = 1;
    } else if (this.mode === 'joining') {
      this.hostPane.alpha = 0.3;
      this.joinPane.alpha = 1;
    } else {
      this.hostPane.alpha = 1;
      this.joinPane.alpha = 1;
    }
  }

  private installKeyHandler(): void {
    if (this.keyHandler !== null) return;
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.mode !== 'select') return;
      const k = e.key.toUpperCase();
      if (k === 'BACKSPACE') {
        this.joinBuffer = this.joinBuffer.slice(0, -1);
      } else if (k.length === 1 && /[2-9A-Z]/.test(k) && !'0O1I'.includes(k) && this.joinBuffer.length < 6) {
        this.joinBuffer += k;
      } else {
        return;
      }
      this.joinInputText.text = this.joinBuffer.length > 0 ? this.joinBuffer : 'enter code...';
      this.joinInputText.style.fill = this.joinBuffer.length > 0 ? 0xffffff : 0x666666;
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private uninstallKeyHandler(): void {
    if (this.keyHandler !== null) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private makePane(label: string, accentColor: number, x: number, y: number): Container {
    const c = new Container();
    c.position.set(x, y);
    const bg = new Graphics();
    bg.roundRect(0, 0, PANE_WIDTH, PANE_HEIGHT, 16)
      .fill({ color: 0x0a0a0a, alpha: 0.85 })
      .stroke({ width: 2, color: accentColor, alpha: 0.6 });
    c.addChild(bg);
    const headerText = new Text({
      text: label,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fill: accentColor, letterSpacing: 4 }),
    });
    headerText.anchor.set(0.5);
    headerText.position.set(PANE_WIDTH / 2, 36);
    c.addChild(headerText);
    return c;
  }

  private makeButton(label: string, color: number, onClick: () => void): Container {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 8)
      .fill({ color: 0x222222, alpha: 0.9 })
      .stroke({ width: 2, color, alpha: 0.8 });
    c.addChild(bg);
    const text = new Text({
      text: label,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: color }),
    });
    text.anchor.set(0.5);
    text.position.set(BUTTON_WIDTH / 2, BUTTON_HEIGHT / 2);
    c.addChild(text);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }
}
