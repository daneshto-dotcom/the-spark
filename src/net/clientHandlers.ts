/**
 * SPARK — Client-side lobby + match callbacks.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 ADOPT 4
 * extractions). Single factory `createJoinAttemptHandler` wired into
 * LobbyScreen at boot. Fires when joiner submits a room code; spawns
 * NetTransport + ClientSync, dispatches the four client-side message
 * kinds it accepts (NETSNAPSHOT, GODLY_TRIGGER, START_GAME_SIGNAL, ENDGAME).
 *
 * PRIME-AUDIT Δ1: deps.session.* read at MSG-RECEIPT time, NOT captured
 * into locals at factory time. Avoids stale clientSync reference after
 * teardownNet + rejoin cycles.
 */

import { ClientSync } from './sync.ts';
import type { NetSession } from './session.ts';
import type { NetMessage, RosterEntry } from './protocol.ts';
import { NetTransport, selfId } from './transport.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { formatProtocolMismatchMessage, wireHelloOnJoin } from './hostHandlers.ts';
import { PLAYER_COLORS } from '../constants.ts';

export interface JoinAttemptDeps {
  session: NetSession;
  world: World;
  controls: Controls;
  /** Forwarded to LobbyScreen.setErrorMessage. Late-bound thunk. */
  onLobbyError: (errMsg: string) => void;
  /**
   * S70 P1 — late-bound sink for the host's lobby presence roster (mirror of the
   * host path's onPresence). The joiner forwards the received roster verbatim;
   * main.ts digests it to the render shape, computing isYou via peerId === selfId
   * — which is how this joiner finally learns WHICH seat is its own pre-Begin.
   */
  onPresence: (roster: readonly RosterEntry[]) => void;
}

/**
 * S79 P4 (HIGH-2, backlog #2 client half) — host sender-auth. Pre-fix, the joiner's
 * message handler trusted ANY peer in the room: a hostile 3rd peer could WEDGE a victim
 * with a spoofed high-snapshotSeq NETSNAPSHOT (ClientSync then drops the real host's
 * lower-seq snapshots forever), fake a win via ENDGAME, hijack seating via
 * START_GAME_SIGNAL, or fire bogus GODLY_TRIGGER cinematics.
 *
 * Latch (trust-on-first-use): the host's peerId is learned from the FIRST roster-bearing
 * message whose seat-0 entry NAMES THE SENDER (the genuine host always self-identifies at
 * seat 0 in buildLobbyRoster/buildMatchRoster), with a first-NETSNAPSHOT fallback for any
 * legacy flow that skips the lobby beacon. Gate: once latched, the five host-authored
 * kinds are dropped unless sent BY the latched host; before any latch they are dropped
 * too (fail-closed — in practice a beacon/snapshot always precedes the other kinds).
 *
 * Ceiling (documented, accepted): without cryptographic peer identity a spoofer who BEATS
 * the genuine host's first message into the victim's handler could win the latch. That
 * requires joining a secret-coded room AND racing the host's join-triggered beacon —
 * a far smaller surface than the pre-fix "any peer, any time". Crypto identity belongs to
 * the netcode-infra backlog (#4). Returns true = process, false = drop. Pure w.r.t.
 * everything except the latch write; exported for unit tests.
 */
export function hostAuthFilter(
  session: Pick<NetSession, 'hostPeerId'>,
  msg: NetMessage,
  peerId: string,
): boolean {
  if (session.hostPeerId === null) {
    if (
      (msg.kind === 'LOBBY_PRESENCE' || msg.kind === 'START_GAME_SIGNAL') &&
      msg.roster.some((e) => e.seat === 0 && e.peerId === peerId)
    ) {
      session.hostPeerId = peerId;
    } else if (msg.kind === 'NETSNAPSHOT') {
      session.hostPeerId = peerId;
    }
  }
  const hostAuthored =
    msg.kind === 'NETSNAPSHOT' ||
    msg.kind === 'GODLY_TRIGGER' ||
    msg.kind === 'START_GAME_SIGNAL' ||
    msg.kind === 'ENDGAME' ||
    msg.kind === 'LOBBY_PRESENCE';
  return !hostAuthored || session.hostPeerId === peerId;
}

export function createJoinAttemptHandler(deps: JoinAttemptDeps): (code: string) => void {
  return (code: string) => {
    const transport = new NetTransport();
    deps.session.netTransport = transport;
    deps.session.clientSync = new ClientSync();
    deps.world.isHost = false;
    // S35 P0 — break 1v1 join bootstrap deadlock. The render-loop client-
    // interpolation gate at main.ts is the only path that runs
    // clientSync.interpolateInto → applyNetSnapshot. Without setting gameMode
    // here, the gate stays false because the joiner's world.gameMode stays
    // at the makeWorld default 'solo' — so host's NETSNAPSHOT (which carries
    // gameMode='1v1' + gameState='PLAYING') is RECEIVED but never APPLIED.
    // Host avoids this trap because applyStartGame sets gameMode='1v1'
    // synchronously on onBeginMatch. Setting it here at the joiner's setup-
    // entry-point is symmetric. RETURN_TO_TITLE resets gameMode='solo' so
    // back-out remains clean. Bug pre-dates S15 commit add497f (~20 sessions).
    deps.world.gameMode = '1v1';
    // S62 — the client's seat is NO LONGER hardcoded to 1. localPlayerId +
    // controls playerId are set from the host's authoritative roster when
    // START_GAME_SIGNAL arrives (below), so a 2nd/3rd client gets its own seat
    // (1, 2, …) instead of every client claiming seat 1. gameMode is still set
    // here because the snapshot-apply gate (main.ts) reads it before PLAYING.
    // S20 P0 — same onError wiring as host path.
    transport.onError = (errMsg) => deps.onLobbyError(errMsg);
    // S53 P1 — same onProtocolMismatch wiring as host path; shared
    // formatProtocolMismatchMessage helper produces direction-aware advice
    // (which side needs to refresh based on peer vs local PROTOCOL_VERSION).
    transport.onProtocolMismatch = (peerVersion) => {
      deps.onLobbyError(formatProtocolMismatchMessage(peerVersion));
    };
    transport.connect(code);
    // S54 P1 — announce our PROTOCOL_VERSION to the host the moment we connect
    // (joiner = playerId 1 / cyan). Symmetric with the host path; activates
    // the dormant S53 protocol-mismatch latch + UX on the host's receive side
    // (closes the v2-peer-INTENT-bypass desync gap from the joiner direction).
    wireHelloOnJoin(transport, asPlayerId(1), PLAYER_COLORS[1]);
    transport.on((msg, peerId) => {
      // S79 P4 — host sender-auth gate (see hostAuthFilter). Drops the five host-authored
      // kinds unless they come from the latched host peer. INTENT/HELLO are unaffected
      // (the host side already stamps INTENT playerIds from its hostSeats freeze).
      if (!hostAuthFilter(deps.session, msg, peerId)) return;
      if (msg.kind === 'NETSNAPSHOT' && deps.session.clientSync !== null) {
        deps.session.clientSync.receive(msg, performance.now());
      }
      // S22 P3 — receive host-broadcast godly trigger; apply locally.
      // Client NEVER runs the recipe predicate itself (anti-desync,
      // Battle Ledger row 9). Predicate is host-only.
      if (msg.kind === 'GODLY_TRIGGER') {
        dispatch(deps.world, { type: 'GODLY_TRIGGER', event: msg.event });
      }
      // S39 P1 — dedicated lobby-exit signal. Pre-S39 the peer exited
      // LOBBY only when a NETSNAPSHOT arrived AND applied cleanly; after
      // S38 audit Pass-1/2 added try/catch + strict schemaVersion gate,
      // any silent drop on that path stranded the peer in lobby. This
      // signal kicks the peer's FSM to PLAYING immediately (snapshots
      // still drive authoritative state afterwards). isHost stays false
      // — the peer never claims host authority. Idempotent: only fires
      // when still in LOBBY so a late/duplicate signal can't reset
      // pendingCreatureSpawn that snapshots may have already populated.
      if (msg.kind === 'START_GAME_SIGNAL' && deps.world.gameState === 'LOBBY') {
        // S62 — adopt the seat the host assigned to THIS peer (match by selfId
        // in the authoritative roster), then seat everyone deterministically
        // from the same ordered roster. Fallback to seat 1 if (unexpectedly) not
        // found, preserving the 2-player default.
        const mine = msg.roster.find((e) => e.peerId === selfId);
        const seat = mine !== undefined ? asPlayerId(mine.seat) : asPlayerId(1);
        deps.world.localPlayerId = seat;
        deps.controls.setPlayerId(seat);
        dispatch(deps.world, {
          type: 'START_GAME',
          mode: msg.mode,
          isHost: false,
          roster: msg.roster.map((e) => ({ seat: e.seat, color: e.color })),
        });
      }
      // S70 P1 — host lobby presence beacon. While still in LOBBY, forward the
      // roster so the joiner's rack shows its OWN seat (peerId === selfId glow) +
      // real per-seat colours + accurate drop-on-leave instead of count-based
      // occupancy. Gated on gameState==='LOBBY' (mirrors START_GAME_SIGNAL): once
      // PLAYING the rack is gone, so a late/duplicate beacon is ignored. Cosmetic —
      // the AUTHORITATIVE seat still arrives via START_GAME_SIGNAL at Begin, so a
      // dropped beacon only delays the live rack until the next join/leave re-broadcast.
      if (msg.kind === 'LOBBY_PRESENCE' && deps.world.gameState === 'LOBBY') {
        deps.onPresence(msg.roster);
      }
      // S47 P1 (Sym I fix) — receive host-broadcast game-end envelope
      // and dispatch WIN_TRIGGER locally so joiner's gameState flips to
      // 'WIN' immediately. Pre-S47, the joiner had no handler for ENDGAME
      // AND host never sent it. Both halves now connected. The widened
      // snapshot gate (main.ts) means subsequent NETSNAPSHOTs will carry
      // the host's WIN→POSTGAME transition for state sync; this envelope
      // guarantees the joiner sees the result even if the very first
      // WIN-tick snapshot is dropped. Idempotent — re-dispatching
      // WIN_TRIGGER while already in WIN/POSTGAME is a noop because the
      // reducer is pure-assignment + the world is host-state-overwritten
      // by the next snapshot.
      if (msg.kind === 'ENDGAME') {
        dispatch(deps.world, { type: 'WIN_TRIGGER', winnerId: msg.winnerId });
      }
    });
  };
}
