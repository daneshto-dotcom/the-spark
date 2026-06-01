/**
 * SPARK — S64 P1: pure LobbyStateMachine (extracted from lobbyScreen.ts).
 *
 * The lobby's mode / Begin-gating logic as a PURE reducer — no Pixi, no DOM, no
 * callbacks — so it is exhaustively unit-testable in vitest without a WebGL
 * Application. This closes the coverage gap the S61 Council flagged: the lobby
 * state machine had ZERO unit coverage (only its geometry/validation helpers in
 * lobbyGeometry.ts were tested) which is why the structural lobby refactor was
 * deferred until the S63 P3 Playwright net existed. LobbyScreen now holds one
 * LobbyState, dispatches an event on each of its 5 transition sites, and applies
 * the derived view to its Pixi objects.
 *
 * SEPARATION (PRIME-AUDIT desync mitigation): this module owns ONLY
 * mode / status / status-colour / Begin-visibility / room-code. ALL other side
 * effects — the HTML <input> overlay, the joiner + host diagnostic strips, the
 * connection-lost overlay, and the Connect-button input-length alpha gate — stay
 * in the shell, byte-for-byte as before.
 *
 * State machine:
 *   select  --HOST_START{code}------> hosting   (code shown, "share the code" status)
 *   select  --JOIN_ATTEMPT{valid}---> joining   ("Connecting...")
 *   select  --JOIN_ATTEMPT{invalid}-> select    (error text, status COLOUR UNCHANGED)
 *   hosting --PEER_STATUS{n>0}------> hosting   (hostConnected latch, Begin shown, live count)
 *   joining --PEER_STATUS{n>0}------> joining   ("Connected. Waiting for host...")
 *   *       --ERROR{text}-----------> *         (red status, errorLatched; blocks PEER_STATUS)
 *   *       --RESET-----------------> select    (initialLobbyState)
 *
 * CHURN GUARD (Council DP4 synthesis): lobbyReduce returns the SAME state
 * reference when an event produces no observable change — per-frame PEER_STATUS
 * with an unchanged peer count, or ANY PEER_STATUS once errorLatched. The shell's
 * `if (next !== state)` gate then both preserves the original per-frame re-render
 * guard AND avoids hot-path allocation. (Returning the input on a no-op is still
 * a pure function.)
 */

import { isValidRoomCode } from './lobbyGeometry.ts';

export type LobbyMode = 'select' | 'hosting' | 'joining';

// Status-line colours — exported so the shell + tests share the exact values
// (the original used these literals inline in setErrorMessage / reset).
export const STATUS_COLOR_NORMAL = 0xaaaaaa;
export const STATUS_COLOR_ERROR = 0xff3b6b;

// Status strings — byte-exact, em-dashes included. The e2e net asserts a
// substring of HOSTING_CONNECTED ('players connected'); a src-pinning canary in
// lobbyStateMachine.test.ts fails loud if any literal drifts (e2e can't import
// src, so the canary is the guard against silent Playwright breakage).
export const LOBBY_STATUS = {
  EMPTY: '',
  HOSTING_WAIT: 'Share the code — waiting for players...',
  CONNECTING: 'Connecting...',
  JOIN_INVALID: 'Code must be 6 chars (excludes 0, O, 1, I).',
  JOINED_WAIT: 'Connected. Waiting for host to begin...',
} as const;

/** Host-side "N players connected" status. total = peerCount + 1 (incl. the host). */
export function hostingConnectedStatus(peerCount: number): string {
  return `${peerCount + 1} players connected — press Begin Match (up to 6).`;
}

export interface LobbyState {
  readonly mode: LobbyMode;
  readonly code: string;
  readonly status: string;
  readonly statusColor: number;
  readonly beginVisible: boolean;
  readonly hostConnected: boolean;
  readonly errorLatched: boolean;
}

export type LobbyEvent =
  | { type: 'HOST_START'; code: string }
  | { type: 'JOIN_ATTEMPT'; code: string }
  | { type: 'PEER_STATUS'; peerCount: number }
  | { type: 'ERROR'; text: string }
  | { type: 'RESET' };

export function initialLobbyState(): LobbyState {
  return {
    mode: 'select',
    code: '',
    status: LOBBY_STATUS.EMPTY,
    statusColor: STATUS_COLOR_NORMAL,
    beginVisible: false,
    hostConnected: false,
    errorLatched: false,
  };
}

/**
 * Pure reducer. Returns the SAME `state` reference when the event is a no-op
 * (see module header) so the shell can short-circuit re-render + allocation.
 */
export function lobbyReduce(state: LobbyState, event: LobbyEvent): LobbyState {
  switch (event.type) {
    case 'HOST_START':
      // statusColor is deliberately NOT set: the original only ever wrote
      // statusText.style.fill in setErrorMessage (red) and reset (grey), never on
      // the HOST path. Carrying the prior colour is behaviour-exact — INCLUDING
      // the latent landmine that a stale error-red bleeds onto this neutral
      // "share the code" status if HOST is re-clicked after an error without a
      // reset (CHECK/Grok counterexample; logged future-UX item, NOT this scope).
      return {
        ...state,
        mode: 'hosting',
        code: event.code,
        status: LOBBY_STATUS.HOSTING_WAIT,
      };

    case 'JOIN_ATTEMPT':
      // Validation lives in the already-pure isValidRoomCode (lobbyGeometry); the
      // shell passes inputEl.value.toUpperCase() so the reducer stays pure.
      if (isValidRoomCode(event.code)) {
        // statusColor NOT set (same behaviour-preservation as HOST_START): the
        // original left fill untouched on the valid-join path, so a prior
        // error-red carries until reset.
        return {
          ...state,
          mode: 'joining',
          status: LOBBY_STATUS.CONNECTING,
        };
      }
      // Invalid: status TEXT only. Colour is deliberately UNCHANGED — the
      // original left statusText.style.fill untouched on this path. (A known
      // bad-UX landmine: an invalid-code message renders in the neutral grey,
      // not error red. Preserved here; recolouring is a logged future-UX item,
      // NOT this refactor's scope.)
      return { ...state, status: LOBBY_STATUS.JOIN_INVALID };

    case 'PEER_STATUS': {
      // A surfaced error (transport failure / protocol mismatch) is sticky: the
      // routine per-frame peer status must not clobber it (S55 P2 errorLatched).
      if (state.errorLatched) return state;

      if (state.mode === 'hosting' && event.peerCount > 0) {
        const status = hostingConnectedStatus(event.peerCount);
        // Original churn guard: re-render only when `!hostConnected || text
        // changed`. (hostConnected === true implies beginVisible === true, since
        // only RESET clears both, so this is the exact original condition.)
        if (state.hostConnected && state.status === status) return state;
        return { ...state, hostConnected: true, status, beginVisible: true };
      }

      if (state.mode === 'joining' && event.peerCount > 0) {
        // The original re-set this every frame; same-ref-on-no-change makes the
        // joining path inherit the hosting path's churn guard — unobservable
        // (identical status / alphas / visibility), just no per-frame alloc.
        if (state.status === LOBBY_STATUS.JOINED_WAIT) return state;
        return { ...state, status: LOBBY_STATUS.JOINED_WAIT };
      }

      // peerCount === 0, or select mode: nothing to do.
      return state;
    }

    case 'ERROR':
      return {
        ...state,
        status: event.text,
        statusColor: STATUS_COLOR_ERROR,
        errorLatched: true,
      };

    case 'RESET':
      return initialLobbyState();
  }
}

export interface LobbyView extends LobbyState {
  readonly hostPaneAlpha: number;
  readonly joinPaneAlpha: number;
}

/**
 * Pure derivation of the renderable view — adds the two pane alphas (the
 * original renderState(): the inactive pane dims to 0.3 while the other mode is
 * committed). The shell applies these fields to its Pixi objects.
 */
export function lobbyView(state: LobbyState): LobbyView {
  return {
    ...state,
    hostPaneAlpha: state.mode === 'joining' ? 0.3 : 1,
    joinPaneAlpha: state.mode === 'hosting' ? 0.3 : 1,
  };
}
