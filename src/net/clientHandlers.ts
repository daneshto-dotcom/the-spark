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
import { NetTransport } from './transport.ts';
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
    deps.controls.setPlayerId(asPlayerId(1));
    // S42 — non-serialized convention field; HUD energy gauge reads this
    // to render the LOCAL player's energy (replaces removed currentPlayerId
    // "active player" concept). Default asPlayerId(0) covers solo + 1v1
    // host; this assignment covers the 1v1 client peer. Council R1 Battle
    // Ledger row 3 (Grok-C3 ADOPT + Gemini-R2 validated).
    deps.world.localPlayerId = asPlayerId(1);
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
    transport.on((msg) => {
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
        dispatch(deps.world, { type: 'START_GAME', mode: msg.mode, isHost: false });
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
