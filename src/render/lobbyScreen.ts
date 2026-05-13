/**
 * SPARK — Lobby screen (S15 P2 / S16 P1 HTML-input overlay revision).
 *
 * Two-pane UI: Host pane (generates 6-char room code, "Begin Match" on peer-join)
 * + Join pane (HTML <input> positioned via getBoundingClientRect() for native
 * focus/caret/paste/IME). Visibility gated on world.gameState === 'LOBBY'.
 * Connection-lost overlay extracted to connectionLostOverlay.ts (S22 P2).
 *
 * S16 P1 dropped a Pixi-text + window.keydown hack (no caret / no paste) in favor
 * of an HTML <input> overlay. visualViewport.resize handles mobile-keyboard
 * collapse. zIndex=1000 guards Pixi stacking. A11y attrs per Council R1 Gemini #1.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';
import {
  makeConnectionLostOverlay,
  type ConnectionLostOverlayHandle,
} from './connectionLostOverlay.ts';

const PANE_WIDTH = 480;
const PANE_HEIGHT = 360;
const PANE_GAP = 40;
const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 48;

// JOIN pane code-input rectangle in canvas-space (matches the Pixi rect at
// joinInputBg position: joinPaneX+40, paneY+100, PANE_WIDTH-80, 60).
const JOIN_PANE_X = CANVAS_WIDTH / 2 + PANE_GAP / 2;
const JOIN_PANE_Y = CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2;
const INPUT_CANVAS_X = JOIN_PANE_X + 40;
const INPUT_CANVAS_Y = JOIN_PANE_Y + 100;
const INPUT_CANVAS_W = PANE_WIDTH - 80;
const INPUT_CANVAS_H = 60;

const ROOM_CODE_PATTERN = '[2-9A-HJ-NP-Z]{6}';
const ROOM_CODE_CHAR_REGEX = /[^2-9A-HJ-NP-Z]/g;
const ROOM_CODE_FULL_REGEX = new RegExp(`^${ROOM_CODE_PATTERN}$`);

/**
 * Pure helper: sanitize a raw input value into a room-code-safe string.
 * Uppercases, strips invalid chars (0, O, 1, I — the protocol charset),
 * truncates to 6. Exported for tests.
 */
export function sanitizeRoomCodeValue(raw: string): string {
  return raw.toUpperCase().replace(ROOM_CODE_CHAR_REGEX, '').slice(0, 6);
}

/** Pure helper: full-pattern validity (length 6 + valid chars). Exported for tests. */
export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_FULL_REGEX.test(value);
}

/**
 * Pure helper: map a canvas-space rect to page-space pixels for absolute
 * HTML overlay positioning. canvasRect must come from
 * `canvas.getBoundingClientRect()`. Exported for tests.
 */
export function mapCanvasRectToPage(
  canvasRect: { left: number; top: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
  zoneX: number,
  zoneY: number,
  zoneW: number,
  zoneH: number,
): { left: number; top: number; width: number; height: number } {
  const sx = canvasRect.width / canvasW;
  const sy = canvasRect.height / canvasH;
  return {
    left: canvasRect.left + zoneX * sx,
    top: canvasRect.top + zoneY * sy,
    width: zoneW * sx,
    height: zoneH * sy,
  };
}

/** Exposed canvas-space coords of the JOIN code input rect — used by overlay positioning. */
export const JOIN_INPUT_RECT = {
  x: INPUT_CANVAS_X,
  y: INPUT_CANVAS_Y,
  w: INPUT_CANVAS_W,
  h: INPUT_CANVAS_H,
} as const;

/** S17 P0' — pure helpers exposing pane-relative button/code bounds for vitest regression coverage of the double-offset bug fix. */
export function getConnectButtonCanvasBounds(
  joinPaneX: number,
  paneY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: joinPaneX + (PANE_WIDTH / 2 - BUTTON_WIDTH / 2),
    y: paneY + 220,
    w: BUTTON_WIDTH,
    h: BUTTON_HEIGHT,
  };
}

export function getHostButtonCanvasBounds(
  hostPaneX: number,
  paneY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: hostPaneX + (PANE_WIDTH / 2 - BUTTON_WIDTH / 2),
    y: paneY + 220,
    w: BUTTON_WIDTH,
    h: BUTTON_HEIGHT,
  };
}

export function getHostCodeTextCanvasPos(
  hostPaneX: number,
  paneY: number,
): { x: number; y: number } {
  return {
    x: hostPaneX + PANE_WIDTH / 2,
    y: paneY + 130,
  };
}

/** Exposed canvas-space pane origins for tests. */
export function getHostPaneOrigin(): { x: number; y: number } {
  return {
    x: CANVAS_WIDTH / 2 - PANE_WIDTH - PANE_GAP / 2,
    y: CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2,
  };
}
export function getJoinPaneOrigin(): { x: number; y: number } {
  return {
    x: CANVAS_WIDTH / 2 + PANE_GAP / 2,
    y: CANVAS_HEIGHT / 2 - PANE_HEIGHT / 2,
  };
}

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
  private hostPane: Container;
  private joinPane: Container;
  private joinButton: Container;
  private joinButtonBg: Graphics;
  private beginButton: Container;
  private readonly connectionLostHandle: ConnectionLostOverlayHandle;
  private hostConnected = false;

  // S16 P1: HTML input overlay
  private readonly canvas: HTMLCanvasElement;
  private readonly inputEl: HTMLInputElement;
  private readonly resizeHandler: () => void;
  private readonly inputHandler: () => void;
  // S17 P0': Enter-key handler invokes same path as Connect-button click.
  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private attemptJoinFn: () => void = () => {};
  private isShown = false;

  constructor(app: Application, callbacks: LobbyScreenCallbacks) {
    this.container = new Container();
    this.canvas = app.canvas as HTMLCanvasElement;

    // ─────── S16 P1: HTML input overlay (created EARLY so setVisible can ──
    // toggle its display before pane construction completes) ──────────────
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.maxLength = 6;
    this.inputEl.pattern = ROOM_CODE_PATTERN;
    this.inputEl.placeholder = 'ENTER CODE';
    this.inputEl.autocomplete = 'off';
    this.inputEl.spellcheck = false;
    this.inputEl.setAttribute('autocapitalize', 'characters');
    this.inputEl.setAttribute('inputmode', 'text');
    this.inputEl.setAttribute('aria-label', 'Room code');
    this.inputEl.style.position = 'fixed';
    this.inputEl.style.zIndex = '1000';
    this.inputEl.style.display = 'none';
    this.inputEl.style.fontFamily = 'monospace';
    this.inputEl.style.textAlign = 'center';
    this.inputEl.style.background = 'transparent';
    this.inputEl.style.color = '#ffffff';
    this.inputEl.style.border = `2px solid #${PLAYER_COLORS[1].toString(16).padStart(6, '0')}`;
    this.inputEl.style.borderRadius = '6px';
    this.inputEl.style.outline = 'none';
    this.inputEl.style.padding = '0';
    this.inputEl.style.margin = '0';
    this.inputEl.style.letterSpacing = '0.4em';
    this.inputEl.style.textTransform = 'uppercase';
    this.inputEl.style.caretColor = `#${PLAYER_COLORS[1].toString(16).padStart(6, '0')}`;
    document.body.appendChild(this.inputEl);

    // Title
    const title = new Text({
      text: '1v1 LOBBY',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: 0xffffff, letterSpacing: 6 }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, 120);
    this.container.addChild(title);

    // Two panes side by side
    const paneY = JOIN_PANE_Y;
    const hostPaneX = CANVAS_WIDTH / 2 - PANE_WIDTH - PANE_GAP / 2;
    const joinPaneX = JOIN_PANE_X;

    this.hostPane = this.makePane('HOST', PLAYER_COLORS[0], hostPaneX, paneY);
    this.joinPane = this.makePane('JOIN', PLAYER_COLORS[1], joinPaneX, paneY);
    this.container.addChild(this.hostPane);
    this.container.addChild(this.joinPane);

    // Host button — generate room code. Positions are pane-relative (S17 P0').
    const hostBtn = this.makeButton('Host New Room', PLAYER_COLORS[0], () => {
      const code = callbacks.onHostStart();
      this.mode = 'hosting';
      this.codeText.text = code;
      this.statusText.text = 'Waiting for Player 2...';
      this.renderState();
      this.updateInputVisibility();
    });
    hostBtn.position.set(PANE_WIDTH / 2 - BUTTON_WIDTH / 2, 220);
    this.hostPane.addChild(hostBtn);

    this.codeText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 56, fill: 0xffffff, letterSpacing: 12 }),
    });
    this.codeText.anchor.set(0.5);
    this.codeText.position.set(PANE_WIDTH / 2, 130);
    this.hostPane.addChild(this.codeText);

    // Join pane visual border (pane-relative; HTML input overlays this rect).
    const joinInputBg = new Graphics();
    joinInputBg.roundRect(40, 100, PANE_WIDTH - 80, 60, 6)
      .stroke({ width: 1, color: PLAYER_COLORS[1], alpha: 0.45 });
    this.joinPane.addChild(joinInputBg);

    // Click anywhere on JOIN pane focuses the HTML input.
    this.joinPane.eventMode = 'static';
    this.joinPane.cursor = 'text';
    this.joinPane.on('pointertap', () => {
      if (this.mode === 'select') this.inputEl.focus();
    });

    // Hint text below the input area
    const hint = new Text({
      text: 'Click here, type the code from your friend',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0xaaaaaa, letterSpacing: 1 }),
    });
    hint.anchor.set(0.5);
    hint.position.set(PANE_WIDTH / 2, 180);
    this.joinPane.addChild(hint);

    // Connect button — gates on inputEl.value.length === 6
    this.joinButton = new Container();
    this.joinButtonBg = new Graphics();
    this.joinButtonBg.roundRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 8)
      .fill({ color: 0x222222, alpha: 0.9 })
      .stroke({ width: 2, color: PLAYER_COLORS[1], alpha: 0.8 });
    this.joinButton.addChild(this.joinButtonBg);
    const joinBtnText = new Text({
      text: 'Connect',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: PLAYER_COLORS[1] }),
    });
    joinBtnText.anchor.set(0.5);
    joinBtnText.position.set(BUTTON_WIDTH / 2, BUTTON_HEIGHT / 2);
    this.joinButton.addChild(joinBtnText);
    this.joinButton.eventMode = 'static';
    this.joinButton.cursor = 'pointer';
    this.joinButton.alpha = 0.4; // disabled until 6 valid chars

    // S17 P0' — Enter-key handler invokes the same path as Connect-button click.
    const attemptJoin = (): void => {
      const code = this.inputEl.value.toUpperCase();
      if (isValidRoomCode(code)) {
        this.mode = 'joining';
        this.statusText.text = 'Connecting...';
        this.renderState();
        this.updateInputVisibility();
        callbacks.onJoinAttempt(code);
      } else {
        this.statusText.text = 'Code must be 6 chars (excludes 0, O, 1, I).';
        this.renderState();
      }
    };
    this.joinButton.on('pointertap', attemptJoin);
    this.attemptJoinFn = attemptJoin;

    this.joinButton.position.set(PANE_WIDTH / 2 - BUTTON_WIDTH / 2, 220);
    this.joinPane.addChild(this.joinButton);

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

    // S22 P2 — connection-lost overlay extracted to connectionLostOverlay.ts.
    this.connectionLostHandle = makeConnectionLostOverlay(
      app,
      callbacks.onReturnFromConnectionLost,
    );

    app.stage.addChild(this.container);
    this.setVisible(false);

    // Wire input event + window/visualViewport resize handlers
    this.inputHandler = () => {
      // Force uppercase + strip invalid chars in real time.
      const original = this.inputEl.value;
      const cleaned = sanitizeRoomCodeValue(original);
      if (cleaned !== original) this.inputEl.value = cleaned;
      // Visual disabled-gate on Connect button.
      this.joinButton.alpha = cleaned.length === 6 ? 1.0 : 0.4;
    };
    this.inputEl.addEventListener('input', this.inputHandler);

    // S17 P0' — Enter-key on inputEl invokes same path as Connect-button click.
    // Without this, user could type a valid code but had no keyboard fallback
    // if the Connect button was off-screen (the original BLOCKER).
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.attemptJoinFn();
      }
    };
    this.inputEl.addEventListener('keydown', this.keydownHandler);

    this.resizeHandler = () => this.updateInputPosition();
    window.addEventListener('resize', this.resizeHandler);
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.resizeHandler);
    }
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
    this.isShown = visible;
    this.updateInputVisibility();
  }

  setConnectionLostVisible(visible: boolean): void {
    this.connectionLostHandle.setVisible(visible);
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
    this.statusText.text = '';
    this.statusText.style.fill = 0xaaaaaa;
    this.hostConnected = false;
    this.beginButton.visible = false;
    this.connectionLostHandle.setVisible(false);
    this.inputEl.value = '';
    this.joinButton.alpha = 0.4;
    this.renderState();
    this.updateInputVisibility();
  }

  /** S20 P0 — error sink from NetTransport.onError; renders failure layer in red over the status line (resets to grey in reset()). */
  setErrorMessage(text: string): void {
    this.statusText.text = text;
    this.statusText.style.fill = 0xff3b6b;
    this.renderState();
  }

  /** Test-only accessor + cleanup hook. */
  getInputElement(): HTMLInputElement {
    return this.inputEl;
  }

  destroy(): void {
    this.inputEl.removeEventListener('input', this.inputHandler);
    this.inputEl.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('resize', this.resizeHandler);
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.resizeHandler);
    }
    this.inputEl.remove();
  }

  /**
   * Map the canvas-space rect (INPUT_CANVAS_X/Y/W/H) into page-space and
   * absolutely-position the HTML input there. Called on show + on window
   * resize + on visualViewport.resize (mobile keyboard).
   */
  private updateInputPosition(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const mapped = mapCanvasRectToPage(
      rect,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      INPUT_CANVAS_X,
      INPUT_CANVAS_Y,
      INPUT_CANVAS_W,
      INPUT_CANVAS_H,
    );
    this.inputEl.style.left = `${mapped.left}px`;
    this.inputEl.style.top = `${mapped.top}px`;
    this.inputEl.style.width = `${mapped.width}px`;
    this.inputEl.style.height = `${mapped.height}px`;
    // Scale font to match the pane's letter-spacing/size visual.
    this.inputEl.style.fontSize = `${36 * (rect.height / CANVAS_HEIGHT)}px`;
  }

  private updateInputVisibility(): void {
    const shouldShow = this.isShown && this.mode === 'select';
    this.inputEl.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) this.updateInputPosition();
  }

  private renderState(): void {
    this.hostPane.alpha = this.mode === 'joining' ? 0.3 : 1;
    this.joinPane.alpha = this.mode === 'hosting' ? 0.3 : 1;
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
