/**
 * SPARK — Host-side lobby + match callbacks.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 ADOPT 4
 * extractions). Two factory-functions wired into LobbyScreen at boot:
 *   createHostStartHandler   — fires when user clicks "Host new room";
 *                              spawns NetTransport, HostSync, registers
 *                              the INTENT msg handler (host applies
 *                              client intents authoritatively per S15 P2).
 *   createBeginMatchHandler  — fires when user clicks "Begin Match";
 *                              broadcasts START_GAME_SIGNAL envelope to
 *                              joiner (S39 P1 lobby-exit decoupling) then
 *                              dispatches local START_GAME.
 *
 * PRIME-AUDIT Δ1: deps.session.* read at HANDLER-INVOCATION time, NOT
 * captured into locals at factory time. Avoids stale references on
 * disconnect/reconnect cycles.
 */

import { HostSync } from './sync.ts';
import { generateRoomCode, PROTOCOL_VERSION } from './protocol.ts';
import type { NetSession } from './session.ts';
import { NetTransport } from './transport.ts';
import { dispatch, type World } from '../state/world.ts';

/**
 * S53 P1 — shared helper for symmetric protocol-mismatch UX text. Both
 * host (hostHandlers.ts) and joiner (clientHandlers.ts) wire the same
 * onProtocolMismatch callback; the message advises which side needs to
 * refresh based on which has the older version.
 */
export function formatProtocolMismatchMessage(peerVersion: unknown): string {
  const peerV = typeof peerVersion === 'number' ? peerVersion : NaN;
  let advice: string;
  if (Number.isFinite(peerV) && peerV < PROTOCOL_VERSION) {
    advice = `Your friend's version is older. Ask them to refresh their browser.`;
  } else if (Number.isFinite(peerV) && peerV > PROTOCOL_VERSION) {
    advice = `Your version is older. Please refresh your browser.`;
  } else {
    // peerVersion is missing / wrong-type / NaN. Truly-ancient or corrupt;
    // safest UX is to advise both sides to refresh.
    advice = `Versions don't match. Both peers should refresh.`;
  }
  return `Protocol mismatch (peer v${String(peerVersion)}, you v${PROTOCOL_VERSION}). ${advice}`;
}

export interface HostStartDeps {
  session: NetSession;
  world: World;
  /**
   * Called when the underlying transport surfaces an error (signaling,
   * ICE, send). Forwarded to LobbyScreen.setErrorMessage in main.ts.
   * Late-bound via thunk so the lobbyScreen instance can be passed
   * after construction without circular-init pain.
   */
  onLobbyError: (errMsg: string) => void;
}

export function createHostStartHandler(deps: HostStartDeps): () => string {
  return () => {
    const code = generateRoomCode();
    const transport = new NetTransport();
    deps.session.netTransport = transport;
    deps.session.hostSync = new HostSync();
    deps.world.isHost = true;
    // S20 P0 — surface NetTransport errors to the lobby statusText so users
    // see the failure layer rather than an indefinite "Waiting for Player 2..."
    // stall (the S19 P4-unresolved BLOCKER root cause: zero error plumbing).
    transport.onError = (errMsg) => deps.onLobbyError(errMsg);
    // S53 P1 — protocol-mismatch UX (S52 CHECK Triumvirate Grok #4 + Gemini #2
    // CONVERGENT BLOCKER follow-up). Surfaces explicit refresh-prompt when an
    // old-build peer's HELLO carries a non-current protoVersion. Per-peer
    // latch in NetTransport drops ALL subsequent messages from the mismatched
    // peer (closes the v2-peer-INTENT-bypass desync gap).
    transport.onProtocolMismatch = (peerVersion) => {
      deps.onLobbyError(formatProtocolMismatchMessage(peerVersion));
    };
    transport.connect(code);
    transport.on((msg) => {
      // S15 P2 — host applies client intent authoritatively.
      // S42 — turn-based active-player gate REMOVED (blueprint mandates
      // real-time). Shared-resource race conditions resolved by first-Intent-
      // wins host-receive order; loser's intent silently no-ops + increments
      // world.diagnostics.raceRejects (observable for tests).
      if (msg.kind === 'INTENT' && deps.session.hostSync !== null) {
        dispatch(deps.world, msg.action);
      }
      // S22 P3 — clients never send GODLY_TRIGGER (host-only authority,
      // Battle Ledger row 9). Defensive: drop GODLY_TRIGGER from clients silently.
    });
    return code;
  };
}

export interface BeginMatchDeps {
  session: NetSession;
  world: World;
}

export function createBeginMatchHandler(deps: BeginMatchDeps): () => void {
  return () => {
    // Host triggers START_GAME. The first snapshot will carry
    // gameState='PLAYING' + gameMode='1v1' to the client. S39 P1: also
    // broadcast a dedicated START_GAME_SIGNAL envelope BEFORE the local
    // dispatch so the peer's lobby-exit is decoupled from snapshot
    // delivery reliability (S38 audit added 3 silent-drop points to the
    // snapshot apply chain — strict schemaVersion at the wire, try/catch
    // at applyNetSnapshot, JSON shape validation). Order matters: send
    // first while world.gameState is still LOBBY so the peer learns of
    // the transition at the earliest possible RTT.
    if (deps.session.netTransport !== null) {
      deps.session.netTransport.send({ kind: 'START_GAME_SIGNAL', mode: '1v1' });
    }
    dispatch(deps.world, { type: 'START_GAME', mode: '1v1', isHost: true });
  };
}
