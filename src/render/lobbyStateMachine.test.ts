/**
 * S64 P1 — unit tests for the pure LobbyStateMachine extracted from
 * lobbyScreen.ts. Exhaustive: every event x every relevant mode, both latches
 * (hostConnected, errorLatched), the same-ref-on-no-change churn guard, the
 * JOIN_INVALID error-recolour + fresh-attempt latch-clear (S65), pane-alpha derivation, RESET clears all,
 * purity (no input mutation), and a src-pinning literal CANARY (the e2e net
 * asserts a substring of these strings but cannot import src, so this canary is
 * what fails loud if a status/colour literal silently drifts).
 */

import { describe, expect, it } from 'vitest';
import {
  hostingConnectedStatus,
  initialLobbyState,
  LOBBY_STATUS,
  lobbyReduce,
  lobbyView,
  STATUS_COLOR_ERROR,
  STATUS_COLOR_NORMAL,
  type LobbyState,
} from './lobbyStateMachine.ts';

const VALID_CODE = 'ABCDEF'; // [2-9A-HJ-NP-Z]{6}
const HOST_CODE = 'A2B3C4';

describe('S64 P1 — initialLobbyState', () => {
  it('is the select-mode empty default', () => {
    expect(initialLobbyState()).toEqual({
      mode: 'select',
      code: '',
      status: '',
      statusColor: STATUS_COLOR_NORMAL,
      beginVisible: false,
      hostConnected: false,
      errorLatched: false,
    });
  });

  it('returns a fresh object each call (no shared mutable singleton)', () => {
    expect(initialLobbyState()).not.toBe(initialLobbyState());
  });
});

describe('S64 P1 — HOST_START', () => {
  it('enters hosting, shows the code + waiting status, leaves Begin hidden', () => {
    const s = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    expect(s.mode).toBe('hosting');
    expect(s.code).toBe(HOST_CODE);
    expect(s.status).toBe(LOBBY_STATUS.HOSTING_WAIT);
    expect(s.statusColor).toBe(STATUS_COLOR_NORMAL);
    expect(s.beginVisible).toBe(false);
    expect(s.hostConnected).toBe(false);
  });
});

describe('S64 P1 — JOIN_ATTEMPT', () => {
  it('valid code: enters joining with Connecting status', () => {
    const s = lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: VALID_CODE });
    expect(s.mode).toBe('joining');
    expect(s.status).toBe(LOBBY_STATUS.CONNECTING);
    expect(s.statusColor).toBe(STATUS_COLOR_NORMAL);
    expect(s.beginVisible).toBe(false);
  });

  it('invalid code: stays in select, shows the invalid-code message', () => {
    const s = lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: 'abc' });
    expect(s.mode).toBe('select');
    expect(s.status).toBe(LOBBY_STATUS.JOIN_INVALID);
  });

  it('invalid code rejects protocol-excluded chars (0/O/1/I) and lowercase', () => {
    for (const bad of ['ABCDE0', 'OABCDE', '1BCDEF', 'IABCDE', 'abcdef', 'ABCDE']) {
      expect(lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: bad }).mode).toBe(
        'select',
      );
    }
  });

  it('S65 landmine #1 fix: an invalid code recolours the status to error-red', () => {
    // From a fresh (grey) state an invalid JOIN_ATTEMPT must render the
    // "Code must be 6 chars" message in error-red, not the neutral grey the
    // original left untouched. errorLatched stays false (select-mode feedback).
    const after = lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: 'zz' });
    expect(after.mode).toBe('select');
    expect(after.status).toBe(LOBBY_STATUS.JOIN_INVALID);
    expect(after.statusColor).toBe(STATUS_COLOR_ERROR);
    expect(after.errorLatched).toBe(false);
  });

  it('an invalid code after a surfaced ERROR stays error-red and still latched', () => {
    // Recolour is idempotent on an already-red line; select-mode input feedback
    // does not disturb a surfaced-error latch.
    const errored = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'boom' });
    const after = lobbyReduce({ ...errored, mode: 'select' }, { type: 'JOIN_ATTEMPT', code: 'zz' });
    expect(after.status).toBe(LOBBY_STATUS.JOIN_INVALID);
    expect(after.statusColor).toBe(STATUS_COLOR_ERROR);
    expect(after.errorLatched).toBe(true);
  });
});

describe('S65 — a fresh attempt clears prior error state (status colour + latch)', () => {
  // S64 preserved the original "fill untouched on HOST / valid-JOIN" behaviour and
  // logged the resulting stale-red bleed (landmine #2) as a fix-when-wanted item.
  // S65 makes HOST_START / valid JOIN_ATTEMPT a fresh start: neutral grey AND the
  // error latch cleared, so a stale error-red can't carry onto the next neutral
  // status, and Begin-gating works again after an error + re-attempt.
  it('HOST_START after an ERROR resets to grey and clears the latch', () => {
    const errored = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'boom' });
    const s = lobbyReduce(errored, { type: 'HOST_START', code: HOST_CODE });
    expect(s.status).toBe(LOBBY_STATUS.HOSTING_WAIT);
    expect(s.statusColor).toBe(STATUS_COLOR_NORMAL);
    expect(s.errorLatched).toBe(false);
  });

  it('valid JOIN_ATTEMPT after an ERROR resets to grey and clears the latch', () => {
    const errored = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'boom' });
    const s = lobbyReduce(errored, { type: 'JOIN_ATTEMPT', code: VALID_CODE });
    expect(s.status).toBe(LOBBY_STATUS.CONNECTING);
    expect(s.statusColor).toBe(STATUS_COLOR_NORMAL);
    expect(s.errorLatched).toBe(false);
  });

  it('clearing the latch on a fresh host attempt lets PEER_STATUS reveal Begin again', () => {
    // The functional half of the landmine #2 fix: pre-S65 a stale errorLatched
    // blocked PEER_STATUS forever, so re-hosting after an error never showed
    // Begin. The fresh HOST_START now clears it.
    const errored = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'boom' });
    const hosting = lobbyReduce(errored, { type: 'HOST_START', code: HOST_CODE });
    const s = lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 1 });
    expect(s.beginVisible).toBe(true);
    expect(s.hostConnected).toBe(true);
    expect(s.statusColor).toBe(STATUS_COLOR_NORMAL);
  });

  it('CHECK-fix: HOST_START after a hosting+peer+ERROR retry resets the Begin/peer latches', () => {
    // GROK-ANALYST counterexample: host a room, a peer joins (beginVisible +
    // hostConnected latch true), an ERROR surfaces, then the user re-hosts a NEW
    // room. The fresh HOST_START must NOT carry the stale Begin button /
    // hostConnected onto the new code (which has no peers yet) — resetting only
    // colour + latch left those stale-true.
    let s = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    s = lobbyReduce(s, { type: 'PEER_STATUS', peerCount: 3 });
    expect(s.beginVisible).toBe(true); // precondition: latched on the first room
    expect(s.hostConnected).toBe(true);
    s = lobbyReduce(s, { type: 'ERROR', text: 'transport lost' });
    const fresh = lobbyReduce(s, { type: 'HOST_START', code: 'WXYZ99' });
    expect(fresh.code).toBe('WXYZ99');
    expect(fresh.status).toBe(LOBBY_STATUS.HOSTING_WAIT);
    expect(fresh.statusColor).toBe(STATUS_COLOR_NORMAL);
    expect(fresh.errorLatched).toBe(false);
    expect(fresh.beginVisible).toBe(false); // the CHECK-fix: not stale-true
    expect(fresh.hostConnected).toBe(false);
  });

  it('RESET restores the grey fill', () => {
    const errored = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'boom' });
    expect(lobbyReduce(errored, { type: 'RESET' }).statusColor).toBe(STATUS_COLOR_NORMAL);
  });
});

describe('S64 P1 — PEER_STATUS (hosting)', () => {
  const hosting = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });

  it('peer joins: latches hostConnected, reveals Begin, shows live count', () => {
    const s = lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 1 });
    expect(s.hostConnected).toBe(true);
    expect(s.beginVisible).toBe(true);
    expect(s.status).toBe('2 players connected — press Begin Match (up to 6).');
  });

  it('reflects the live count for N up to 6 (peerCount + 1)', () => {
    expect(lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 5 }).status).toBe(
      '6 players connected — press Begin Match (up to 6).',
    );
  });

  it('CHURN GUARD: same peer count twice returns the SAME reference (no re-render)', () => {
    const s1 = lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 1 });
    const s2 = lobbyReduce(s1, { type: 'PEER_STATUS', peerCount: 1 });
    expect(s2).toBe(s1);
  });

  it('a CHANGED peer count produces a new state with the updated count', () => {
    const s1 = lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 1 });
    const s2 = lobbyReduce(s1, { type: 'PEER_STATUS', peerCount: 2 });
    expect(s2).not.toBe(s1);
    expect(s2.status).toBe('3 players connected — press Begin Match (up to 6).');
    expect(s2.hostConnected).toBe(true); // latch stays
  });

  it('peerCount 0 is a no-op (same reference)', () => {
    expect(lobbyReduce(hosting, { type: 'PEER_STATUS', peerCount: 0 })).toBe(hosting);
  });
});

describe('S64 P1 — PEER_STATUS (joining + select)', () => {
  it('joining peer joins: waiting-for-host status, Begin stays hidden', () => {
    const joining = lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: VALID_CODE });
    const s = lobbyReduce(joining, { type: 'PEER_STATUS', peerCount: 1 });
    expect(s.status).toBe(LOBBY_STATUS.JOINED_WAIT);
    expect(s.beginVisible).toBe(false);
    expect(s.mode).toBe('joining');
  });

  it('CHURN GUARD: joining peer status is idempotent (same reference)', () => {
    const joining = lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: VALID_CODE });
    const s1 = lobbyReduce(joining, { type: 'PEER_STATUS', peerCount: 1 });
    expect(lobbyReduce(s1, { type: 'PEER_STATUS', peerCount: 2 })).toBe(s1);
  });

  it('select mode PEER_STATUS is a no-op (same reference)', () => {
    const init = initialLobbyState();
    expect(lobbyReduce(init, { type: 'PEER_STATUS', peerCount: 3 })).toBe(init);
  });
});

describe('S64 P1 — ERROR + errorLatched stickiness', () => {
  it('surfaces the error text in red and latches', () => {
    const s = lobbyReduce(initialLobbyState(), { type: 'ERROR', text: 'Refresh — peer on old build' });
    expect(s.status).toBe('Refresh — peer on old build');
    expect(s.statusColor).toBe(STATUS_COLOR_ERROR);
    expect(s.errorLatched).toBe(true);
  });

  it('INVARIANT: once latched, PEER_STATUS cannot clobber the error (same ref, Begin never shows)', () => {
    // The S55 P2 scenario: a mismatched-peer HELLO surfaces an error in the
    // window before the first 'Player N connected' frame; routine per-frame
    // peer status must not overwrite it nor reveal Begin.
    const hosting = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    const errored = lobbyReduce(hosting, { type: 'ERROR', text: 'mismatch' });
    const after = lobbyReduce(errored, { type: 'PEER_STATUS', peerCount: 1 });
    expect(after).toBe(errored); // no-op
    expect(after.status).toBe('mismatch');
    expect(after.beginVisible).toBe(false);
  });
});

describe('S64 P1 — RESET', () => {
  it('from any state returns the pristine initial state', () => {
    let s: LobbyState = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    s = lobbyReduce(s, { type: 'PEER_STATUS', peerCount: 3 });
    s = lobbyReduce(s, { type: 'ERROR', text: 'x' });
    expect(lobbyReduce(s, { type: 'RESET' })).toEqual(initialLobbyState());
  });
});

describe('S64 P1 — lobbyView pane-alpha derivation', () => {
  it('select: both panes full opacity', () => {
    const v = lobbyView(initialLobbyState());
    expect(v.hostPaneAlpha).toBe(1);
    expect(v.joinPaneAlpha).toBe(1);
  });

  it('hosting: join pane dims to 0.3, host pane full', () => {
    const v = lobbyView(lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE }));
    expect(v.hostPaneAlpha).toBe(1);
    expect(v.joinPaneAlpha).toBe(0.3);
  });

  it('joining: host pane dims to 0.3, join pane full', () => {
    const v = lobbyView(lobbyReduce(initialLobbyState(), { type: 'JOIN_ATTEMPT', code: VALID_CODE }));
    expect(v.hostPaneAlpha).toBe(0.3);
    expect(v.joinPaneAlpha).toBe(1);
  });

  it('carries through every state field unchanged', () => {
    const s = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    const v = lobbyView(s);
    expect(v).toMatchObject({ ...s });
  });
});

describe('S64 P1 — purity', () => {
  it('lobbyReduce does not mutate its input state', () => {
    const before = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: HOST_CODE });
    const snapshot = { ...before };
    lobbyReduce(before, { type: 'PEER_STATUS', peerCount: 2 });
    lobbyReduce(before, { type: 'ERROR', text: 'y' });
    lobbyReduce(before, { type: 'RESET' });
    expect(before).toEqual(snapshot);
  });
});

describe('S64 P1 — literal CANARY (src-pinning; e2e asserts substrings of these)', () => {
  it('status strings are byte-exact (em-dashes included)', () => {
    expect(LOBBY_STATUS.HOSTING_WAIT).toBe('Share the code — waiting for players...');
    expect(LOBBY_STATUS.CONNECTING).toBe('Connecting...');
    expect(LOBBY_STATUS.JOIN_INVALID).toBe('Code must be 6 chars (excludes 0, O, 1, I).');
    expect(LOBBY_STATUS.JOINED_WAIT).toBe('Connected. Waiting for host to begin...');
    expect(hostingConnectedStatus(1)).toBe('2 players connected — press Begin Match (up to 6).');
    // The exact substring the P3 e2e net (lobby-construction.spec.ts) asserts:
    expect(hostingConnectedStatus(1)).toContain('players connected');
  });

  it('status colours are the pinned values', () => {
    expect(STATUS_COLOR_NORMAL).toBe(0xaaaaaa);
    expect(STATUS_COLOR_ERROR).toBe(0xff3b6b);
  });
});
