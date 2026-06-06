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
import { generateRoomCode, PROTOCOL_VERSION, buildHello, type RosterEntry } from './protocol.ts';
import { buildLobbyRoster } from './lobbyRoster.ts';
import type { NetSession } from './session.ts';
import { NetTransport, selfId } from './transport.ts';
import { dispatch, type World } from '../state/world.ts';
import { stampSenderSeat } from './intentStamp.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';

/**
 * S53 P1 — shared helper for symmetric protocol-mismatch UX text. Both
 * host (hostHandlers.ts) and joiner (clientHandlers.ts) wire the same
 * onProtocolMismatch callback; the message advises which side needs to
 * refresh based on which has the older version.
 */
/**
 * S54 P2 (G3) — render a peer's reported protoVersion safely for the
 * diagnostic string. Primitives (number / string / undefined / null /
 * boolean) render verbatim for diagnostic value; a non-primitive from a
 * corrupt payload (object / array / function) would otherwise stringify to
 * useless noise like "[object Object]", so collapse it to a stable label.
 */
function describePeerVersion(peerVersion: unknown): string {
  if (
    peerVersion !== null &&
    (typeof peerVersion === 'object' || typeof peerVersion === 'function')
  ) {
    return Array.isArray(peerVersion) ? '(array)' : `(${typeof peerVersion})`;
  }
  return String(peerVersion);
}

export function formatProtocolMismatchMessage(peerVersion: unknown): string {
  const peerV = typeof peerVersion === 'number' ? peerVersion : NaN;
  let advice: string;
  if (Number.isFinite(peerV) && peerV < PROTOCOL_VERSION) {
    // S54 P2 (M5) — neutral phrasing ("the other player" not "your friend"):
    // forward-compatible with any future non-friend matchmaking, and accurate
    // regardless of host/joiner asymmetry (Council R1 #3, unanimous).
    advice = `The other player's version is older. Ask them to refresh their browser.`;
  } else if (Number.isFinite(peerV) && peerV > PROTOCOL_VERSION) {
    advice = `Your version is older. Please refresh your browser.`;
  } else {
    // peerVersion is missing / wrong-type / NaN. Truly-ancient or corrupt;
    // safest UX is to advise both sides to refresh.
    advice = `Versions don't match. Both peers should refresh.`;
  }
  return `Protocol mismatch (peer v${describePeerVersion(peerVersion)}, you v${PROTOCOL_VERSION}). ${advice}`;
}

/**
 * S54 P1 — register the peer-join HELLO handshake on a transport. This is the
 * producer that was missing through S53, leaving the protocol-mismatch system
 * dormant. BOTH the host (playerId 0 / crimson) and the joiner (playerId 1 /
 * cyan) call this so EACH side announces its PROTOCOL_VERSION to the other on
 * connect — required for SYMMETRIC mismatch detection: the host-side drop
 * latch needs the joiner's HELLO to close the v2-peer-INTENT-bypass desync gap
 * (S53 CONVERGENT BLOCKER), and the joiner needs the host's to detect a stale
 * host. Host-only is insufficient (Council R1 #2 — "host rejects on receipt"
 * fails for a skewed peer's semantically-valid INTENTs, the exact gap the
 * latch exists to close).
 *
 * Emission is on peer-JOIN, not at connect(): transport.send() broadcasts to
 * *currently-connected* peers, so a HELLO sent at connect() time (peerCount=0)
 * would be dropped. onPeerChange fires once per peerId (deduped across
 * strategies) when the data channel opens. onPeerChange was previously unused
 * API — main.ts polls peerCount() for the connection-lost overlay — so this
 * registration is conflict-free.
 *
 * TIMING GUARANTEE (Council R1 #1 — race/ordering resolution): a join always
 * happens in the LOBBY phase (host shares code → joiner connects → only THEN
 * does the host click "Begin Match"). No NETSNAPSHOT / INTENT /
 * START_GAME_SIGNAL flows before Begin Match, so the HELLO is provably the
 * first app message a peer receives — no separate sendQueue/readiness flag
 * needed.
 *
 * 1v1 NOTE (Council R1 #7 — broadcast vs targeted): send() broadcasts to all
 * peers, but 1v1 caps the room at one remote peer, so broadcast == targeted
 * here. A future >2-player Phase-3 transport (Colyseus / Geckos.io) must
 * switch to a per-peer targeted send keyed off the peerId onPeerChange already
 * provides. Re-sends on reconnect are harmless (HELLO is idempotent: a
 * matching version is a no-op; a mismatch latches once per peerId).
 */
export function wireHelloOnJoin(
  transport: NetTransport,
  playerId: PlayerId,
  color: number,
): void {
  transport.onPeerChange((_peerId, kind) => {
    if (kind === 'join') transport.send(buildHello(playerId, color));
  });
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
  /**
   * S70 P1 — late-bound sink for the live lobby seat roster (mirror of the
   * onLobbyError thunk). The host calls this LOCALLY after building + broadcasting
   * the roster on each peer join/leave: transport.send() broadcasts to PEERS only,
   * so without a local self-dispatch the host would never update its OWN seat rack
   * (Council R6 CRITICAL). main.ts wires it to lobbyScreen.updatePresence (which
   * digests RosterEntry → the render-local SeatPresence shape).
   */
  onPresence: (roster: readonly RosterEntry[]) => void;
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
    // S54 P1 — announce our PROTOCOL_VERSION to the joiner the moment it
    // connects (host = playerId 0 / crimson). Activates the dormant S53
    // protocol-mismatch latch + UX on the joiner's receive side.
    wireHelloOnJoin(transport, asPlayerId(0), PLAYER_COLORS[0]);
    // S70 P1 — lobby presence broadcast. On every peer join/leave, rebuild the
    // current occupied-seat roster (the SAME buildLobbyRoster formula Begin uses,
    // so a joiner's previewed seat == its Begin seat) and (1) broadcast it to peers
    // so joiners paint the TRUE per-seat rack, and (2) dispatch it LOCALLY for the
    // host's OWN rack — transport.send() goes to PEERS only, so the local call is
    // what updates the host (Council R6 CRITICAL). peerIds() is accurate at handler
    // time: the transport mutates peerSet BEFORE firing onPeerChange for both join
    // (added) and leave (removed). No debounce — lobby join/leave is human-paced and
    // the reducer's same-ref churn-guard absorbs any redundant identical roster.
    transport.onPeerChange(() => {
      const roster = buildLobbyRoster(transport.peerIds(), selfId);
      transport.send({ kind: 'LOBBY_PRESENCE', roster });
      deps.onPresence(roster);
    });
    transport.on((msg, peerId) => {
      // S15 P2 — host applies client intent authoritatively.
      // S42 — turn-based active-player gate REMOVED (blueprint mandates
      // real-time). Shared-resource race conditions resolved by first-Intent-
      // wins host-receive order; loser's intent silently no-ops + increments
      // world.diagnostics.raceRejects (observable for tests).
      if (msg.kind === 'INTENT' && deps.session.hostSync !== null) {
        // S62 — stamp the intent's playerId from the SENDER's assigned seat
        // (peerId→seat), overriding whatever the wire claimed. Anti-collision/
        // anti-spoof: a client can only act as its own seat, so two clients
        // can't both drive seat 1 and no client can move another player.
        // Unknown peer (no seat yet / legacy 2-player) → apply as-is.
        const seat = deps.session.hostSeats.get(peerId);
        const action = seat !== undefined ? stampSenderSeat(msg.action, seat) : msg.action;
        dispatch(deps.world, action);
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
    // Host triggers START_GAME. The first snapshot will carry gameState=
    // 'PLAYING' to the clients. S39 P1: also broadcast a dedicated
    // START_GAME_SIGNAL envelope BEFORE the local dispatch so peers' lobby-exit
    // is decoupled from snapshot delivery reliability (S38 audit added silent-
    // drop points to the snapshot apply chain). Order matters: send first while
    // world.gameState is still LOBBY so peers learn of the transition ASAP.
    //
    // S62 — mint the authoritative N-player roster: host = seat 0, remote peers
    // = seats 1..N in join order (capped at MAX_PLAYERS). Freeze peerId→seat on
    // the session FIRST so any INTENT arriving right after the signal is already
    // stamp-able (no pre-ack race), THEN ship the ORDERED roster so every client
    // builds a byte-identical initial world (Council determinism fix).
    const transport = deps.session.netTransport;
    const allPeers = transport !== null ? transport.peerIds() : [];
    // S70 P1 — the authoritative Begin roster now shares the pure buildLobbyRoster
    // builder with the lobby presence broadcast (DRY: byte-identical seat
    // assignment, so a joiner's previewed lobby seat is the seat it receives here).
    // buildLobbyRoster applies the MAX_PLAYERS cap internally; recompute the seated-
    // peer slice for the hostSeats map + the over-capacity warn.
    const roster = buildLobbyRoster(allPeers, selfId);
    const peers = allPeers.slice(0, MAX_PLAYERS - 1);
    if (allPeers.length > peers.length) {
      console.warn(
        `[net] Begin: ${allPeers.length} peers but MAX_PLAYERS=${MAX_PLAYERS}; seating first ${peers.length}, dropping ${allPeers.length - peers.length}.`,
      );
    }
    deps.session.hostSeats.clear();
    peers.forEach((pid, i) => deps.session.hostSeats.set(pid, asPlayerId(i + 1)));
    if (transport !== null) {
      transport.send({ kind: 'START_GAME_SIGNAL', mode: '1v1', roster });
    }
    dispatch(deps.world, {
      type: 'START_GAME',
      mode: '1v1',
      isHost: true,
      roster: roster.map((e) => ({ seat: e.seat, color: e.color })),
    });
  };
}
