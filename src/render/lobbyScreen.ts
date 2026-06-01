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
// S64 P1 — the pure mode/Begin-gating reducer extracted from this file.
import {
  initialLobbyState,
  lobbyReduce,
  lobbyView,
  type LobbyMode,
  type LobbyState,
} from './lobbyStateMachine.ts';

// S60 P4 — the pure geometry/validation helpers + layout/validation constants
// moved to lobbyGeometry.ts (§XV de-hypertrophy). The class imports what it needs;
// the public helpers are re-exported below so external callers (controls.ts's
// cssToCanvasCoords, the input-overlay positioning) + lobbyScreen.test.ts keep
// importing them from this module unchanged.
import {
  BUTTON_HEIGHT,
  BUTTON_WIDTH,
  INPUT_CANVAS_H,
  INPUT_CANVAS_W,
  INPUT_CANVAS_X,
  INPUT_CANVAS_Y,
  isValidRoomCode,
  JOIN_PANE_X,
  JOIN_PANE_Y,
  mapCanvasRectToPage,
  PANE_GAP,
  PANE_HEIGHT,
  PANE_WIDTH,
  ROOM_CODE_PATTERN,
  sanitizeRoomCodeValue,
} from './lobbyGeometry.ts';

export {
  cssToCanvasCoords,
  getConnectButtonCanvasBounds,
  getHostButtonCanvasBounds,
  getHostCodeTextCanvasPos,
  getHostPaneOrigin,
  getJoinPaneOrigin,
  isValidRoomCode,
  JOIN_INPUT_RECT,
  mapCanvasRectToPage,
  sanitizeRoomCodeValue,
} from './lobbyGeometry.ts';

// S64 P1 — single source of truth now lives in lobbyStateMachine.ts.
export type { LobbyMode };

export interface LobbyScreenCallbacks {
  onHostStart(): string;            // returns generated room code
  onJoinAttempt(code: string): void;
  onBeginMatch(): void;
  onBackToTitle(): void;
  onReturnFromConnectionLost(): void;
}

export class LobbyScreen {
  readonly container: Container;
  // S64 P1 — mode / Begin-gating / status / latches now live in a pure reducer
  // (lobbyStateMachine.ts); this class is the Pixi/DOM shell that dispatches an
  // event on each transition and applies the derived view. All OTHER side
  // effects (HTML input overlay, diagnostic strips, connection-lost overlay)
  // remain shell-owned.
  private state: LobbyState = initialLobbyState();
  private statusText: Text;
  private codeText: Text;
  private hostPane: Container;
  private joinPane: Container;
  private joinButton: Container;
  private joinButtonBg: Graphics;
  private beginButton: Container;
  // S39 P1 — visible-to-user wire diagnostics. Renders below statusText
  // whenever the peer is joining + has a connected host. Without this, a
  // peer stuck on "Waiting for host to begin" has no signal whether the
  // wire is silent (host not broadcasting), busy-but-rejected (parseNetMessage
  // null), or busy-but-throwing (applyNetSnapshot caught) — three distinct
  // failure modes the S38 audit added to the snapshot delivery chain.
  private diagnosticsText: Text;
  // S46 P1 Phase A.0 — host-side diagnostic strip. Mirrors the joiner-side
  // strip pattern so the host can SEE peerCount + mode + hostConnected latch
  // + NetTransport strategy state while waiting in lobby. Without this, a host
  // stuck on "Waiting for Player 2..." has no signal whether (H1) peer never
  // connected from host's POV (Trystero one-way), (H2) avatarRenderer or
  // another ticker stage threw silently breaking updatePeerStatus call, or
  // (H3) the hostConnected latch + beginButton.visible somehow drifted.
  // BUG-CRITICAL-4 state-discovery instrumentation.
  private hostDiagnosticsText: Text;
  private readonly connectionLostHandle: ConnectionLostOverlayHandle;
  // S55 P2 — the errorLatched sticky flag + the hostConnected latch + mode all
  // live in `state` now: a surfaced error (transport failure / protocol
  // mismatch) is sticky until reset() so the routine per-frame PEER_STATUS can't
  // clobber it (was: a mismatched-peer HELLO overwritten by 'Player 2
  // connected!', permanently hiding the refresh-prompt UX). The reducer enforces it.

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
      text: 'MULTIPLAYER LOBBY',
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
      this.state = lobbyReduce(this.state, { type: 'HOST_START', code });
      this.applyView();
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
      if (this.state.mode === 'select') this.inputEl.focus();
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
      this.state = lobbyReduce(this.state, { type: 'JOIN_ATTEMPT', code });
      this.applyView();
      // updateInputVisibility + the join callback fire ONLY on the valid branch
      // (behaviour-exact: the original gated both inside `if (isValidRoomCode)`).
      if (isValidRoomCode(code)) {
        this.updateInputVisibility();
        callbacks.onJoinAttempt(code);
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

    // S39 P1 — diagnostic text below status. Hidden by default; only shown
    // when mode='joining' AND peerCount>0 (i.e. the "Waiting for host to begin"
    // window). 13px grey, monospaced — informational, not alarming.
    this.diagnosticsText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0x777777 }),
    });
    this.diagnosticsText.anchor.set(0.5);
    this.diagnosticsText.position.set(CANVAS_WIDTH / 2, paneY + PANE_HEIGHT + 62);
    this.diagnosticsText.visible = false;
    this.container.addChild(this.diagnosticsText);

    // S46 P1 Phase A.0 — host-side diagnostic strip. Always visible while
    // hosting in lobby (gated by main.ts caller, not here). Positioned below
    // the joiner diagnostics line so both can show simultaneously during the
    // 2-peer smoke. Yellow-orange (0xffaa44) to distinguish from grey joiner
    // strip. 13px monospaced — same visual register.
    this.hostDiagnosticsText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0xffaa44 }),
    });
    this.hostDiagnosticsText.anchor.set(0.5);
    this.hostDiagnosticsText.position.set(CANVAS_WIDTH / 2, paneY + PANE_HEIGHT + 82);
    this.hostDiagnosticsText.visible = false;
    this.container.addChild(this.hostDiagnosticsText);

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
    // S64 P1 — the errorLatched short-circuit, the hostConnected latch, the live
    // N-player count (S62), and the per-frame churn guard all live in the
    // reducer, which returns the SAME state reference when nothing changed; the
    // re-render (applyView) only runs on an actual transition.
    const next = lobbyReduce(this.state, { type: 'PEER_STATUS', peerCount });
    if (next === this.state) return;
    this.state = next;
    this.applyView();
  }

  reset(): void {
    // SM-owned surface (mode / status / colour / Begin / code / pane-alphas) via
    // the view; everything else is shell-owned and cleared verbatim as before.
    this.state = lobbyReduce(this.state, { type: 'RESET' });
    this.applyView();
    this.connectionLostHandle.setVisible(false);
    this.inputEl.value = '';
    this.joinButton.alpha = 0.4;
    this.diagnosticsText.visible = false;
    this.diagnosticsText.text = '';
    // S46 P1 Phase A.0 — reset host diagnostic strip too.
    this.hostDiagnosticsText.visible = false;
    this.hostDiagnosticsText.text = '';
    this.updateInputVisibility();
  }

  /**
   * S46 P1 Phase A.0 — read-only accessor for the host-side diagnostic strip.
   * Caller (main.ts) composes the diagnostic text from netTransport state +
   * these LobbyScreen-internal fields. Surfaces the three values that are
   * load-bearing for the "Begin Match never appears" hypothesis space:
   *   - `mode`: must be 'hosting' for the updatePeerStatus latch to fire
   *   - `hostConnected`: one-shot latch; once true, beginButton.visible stays
   *     true. If false despite peerCount > 0, the latch never fired
   *     (suggests updatePeerStatus skipped or mode drift).
   *   - `beginButtonVisible`: the actual rendered visibility. If true but
   *     not seen on screen, points to z-order / overlay occlusion bug.
   *     If false despite hostConnected=true, points to a downstream visibility
   *     mutation after the latch fired.
   */
  getDebugState(): { mode: LobbyMode; hostConnected: boolean; beginButtonVisible: boolean } {
    return {
      mode: this.state.mode,
      hostConnected: this.state.hostConnected,
      beginButtonVisible: this.beginButton.visible,
    };
  }

  /**
   * S46 P1 — return the room code shown in the host pane (or empty string
   * if not in hosting mode). Used by E2E harness to read the code after
   * clicking "Host New Room" without OCR-ing the canvas.
   */
  getRoomCode(): string {
    return this.codeText.text ?? '';
  }

  /**
   * S55 P2 — DEV/E2E read accessor for the shared status line (the surface
   * setErrorMessage + updatePeerStatus write to). Lets the protocol-mismatch
   * E2E assert the user-visible mismatch text WITHOUT OCR-ing the Pixi canvas,
   * completing end-to-end verification of the onProtocolMismatch ->
   * formatProtocolMismatchMessage -> onLobbyError -> setErrorMessage UX chain
   * that the S54 PRIME-AUDIT flagged as having zero runtime coverage.
   */
  getStatusText(): string {
    return this.statusText.text ?? '';
  }

  /**
   * S46 P1 Phase A.0 — update host-side diagnostic strip. Called per-frame
   * by main.ts when world.isHost && mode === 'hosting' && in LOBBY. Empty
   * text hides the strip (same idempotent pattern as updateDiagnostics).
   */
  updateHostDiagnostics(text: string): void {
    if (text === '') {
      if (this.hostDiagnosticsText.visible) this.hostDiagnosticsText.visible = false;
      return;
    }
    if (!this.hostDiagnosticsText.visible) this.hostDiagnosticsText.visible = true;
    if (this.hostDiagnosticsText.text !== text) this.hostDiagnosticsText.text = text;
  }

  /**
   * S20 P0 — error sink from NetTransport.onError; renders failure layer in red
   * over the status line (resets to grey in reset()).
   * S55 P2 — latches errorLatched so the routine per-frame updatePeerStatus
   * can't clobber a surfaced error (e.g. a protocol-mismatch HELLO arriving in
   * the brief window before the first post-connect 'Player 2 connected' frame).
   */
  setErrorMessage(text: string): void {
    this.state = lobbyReduce(this.state, { type: 'ERROR', text });
    this.applyView();
  }

  /**
   * S39 P1 — update the diagnostic strip shown below the status line while a
   * joiner is waiting for the host to begin. Caller is main.ts; called every
   * render frame with the latest NetTransport + ClientSync diagnostics + the
   * current world.gameState. Empty `text` hides the strip; non-empty shows it.
   */
  updateDiagnostics(text: string): void {
    if (text === '') {
      if (this.diagnosticsText.visible) this.diagnosticsText.visible = false;
      return;
    }
    if (!this.diagnosticsText.visible) this.diagnosticsText.visible = true;
    if (this.diagnosticsText.text !== text) this.diagnosticsText.text = text;
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
    const shouldShow = this.isShown && this.state.mode === 'select';
    this.inputEl.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) this.updateInputPosition();
  }

  /**
   * S64 P1 — apply the reducer's derived view to the Pixi objects this class
   * owns. Per-field diffs avoid redundant Pixi writes (belt-and-suspenders with
   * the reducer's same-ref no-op gate). statusColor is set unconditionally:
   * Pixi v8 TextStyle.fill has no reliable round-trip read, and applyView only
   * runs on an actual transition, so re-asserting the (rare) colour is free.
   */
  private applyView(): void {
    const v = lobbyView(this.state);
    if (this.codeText.text !== v.code) this.codeText.text = v.code;
    if (this.statusText.text !== v.status) this.statusText.text = v.status;
    this.statusText.style.fill = v.statusColor;
    if (this.beginButton.visible !== v.beginVisible) this.beginButton.visible = v.beginVisible;
    if (this.hostPane.alpha !== v.hostPaneAlpha) this.hostPane.alpha = v.hostPaneAlpha;
    if (this.joinPane.alpha !== v.joinPaneAlpha) this.joinPane.alpha = v.joinPaneAlpha;
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
