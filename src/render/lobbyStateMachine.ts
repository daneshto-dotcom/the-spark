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
 *   select  --HOST_START{code}------> hosting   (code shown, "share the code"; fresh attempt RESETS all session state)
 *   select  --JOIN_ATTEMPT{valid}---> joining   ("Connecting..."; fresh attempt RESETS all session state)
 *   select  --JOIN_ATTEMPT{invalid}-> select    (error text in RED; errorLatch untouched)
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
      // S65 (landmine #2 + GROK-ANALYST CHECK-fix): a fresh host attempt clears
      // ALL prior session state — neutral-grey status, unlatched error flag, AND
      // the Begin/peer-connected latches — so the "share the code" line never
      // inherits a stale error-red, no stale Begin button shows on the new room,
      // and a subsequent PEER_STATUS reveals Begin correctly. (CHECK counterexample:
      // HOST_START after a hosting+peer+ERROR retry previously carried
      // beginVisible/hostConnected=true onto the fresh code; resetting only colour
      // + latch left those stale. Resetting all session-scoped fields here makes
      // that incoherent tuple unrepresentable.) S64 preserved the original
      // no-reset behaviour byte-for-byte and logged this fix-when-wanted item.
      return {
        ...state,
        mode: 'hosting',
        code: event.code,
        status: LOBBY_STATUS.HOSTING_WAIT,
        statusColor: STATUS_COLOR_NORMAL,
        beginVisible: false,
        hostConnected: false,
        errorLatched: false,
      };

    case 'JOIN_ATTEMPT':
      // S65 P2 mode-guard: a join attempt is only meaningful from the select
      // screen. The UI only dispatches JOIN from select (the HTML code input is
      // display:none outside select, and Enter is select-gated), but the dimmed
      // joinButton stays eventMode='static' and is click-reachable while
      // hosting/joining. A guarded no-op there prevents a wrong-mode red
      // JOIN_INVALID status (the P1 CHECK residual) and prevents a stale valid
      // code from abandoning an active host session. Same-ref => the shell's
      // applyView idles.
      if (state.mode !== 'select') return state;
      // Validation lives in the already-pure isValidRoomCode (lobbyGeometry); the
      // shell passes inputEl.value.toUpperCase() so the reducer stays pure.
      if (isValidRoomCode(event.code)) {
        // S65 (landmine #2 + CHECK-fix, mirror of HOST_START): a fresh join
        // attempt clears all prior session state — neutral-grey, unlatched, and
        // the Begin/peer latches reset (a joiner must never carry a host's stale
        // Begin/hostConnected) — so no stale red bleeds onto "Connecting..." and
        // PEER_STATUS updates normally. (code carries forward via ...state; it is
        // not displayed in joining mode.)
        return {
          ...state,
          mode: 'joining',
          status: LOBBY_STATUS.CONNECTING,
          statusColor: STATUS_COLOR_NORMAL,
          beginVisible: false,
          hostConnected: false,
          errorLatched: false,
        };
      }
      // S65 landmine #1 fix: an invalid code is an error, so it renders in
      // error-red. The original left fill untouched here, so the "Code must be
      // 6 chars" message showed in neutral grey — the bad-UX landmine S64 logged
      // for this fix. errorLatched stays untouched: this is select-mode input
      // feedback and PEER_STATUS is a no-op in select, so no latch is needed (and
      // leaving it lets any prior surfaced error stay latched while the user retypes).
      return { ...state, status: LOBBY_STATUS.JOIN_INVALID, statusColor: STATUS_COLOR_ERROR };

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
