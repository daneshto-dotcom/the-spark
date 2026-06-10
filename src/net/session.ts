/**
 * SPARK — NetSession state holder + teardown.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 + C3 ADOPT
 * NetSession state holder pattern over factory closures + mutable record).
 * The four mutable network-related closure variables (netTransport,
 * hostSync, clientSync, lastSnapshotTick) are unified under a single
 * shape so the lobby callback factories + per-tick snapshot loop share
 * one identity-preserving reference.
 *
 * PRIME-AUDIT Δ1 invariant: handlers MUST read `session.netTransport`
 * per-invocation (not capture at factory creation), so that reconnects
 * (transport disposed in teardownNet then re-created in onHostStart/
 * onJoinAttempt) are observed by any later messages routed through the
 * same handler closure.
 */

import { ClientSync, HostSync } from './sync.ts';
import { NetTransport } from './transport.ts';
import type { Controls } from '../input/controls.ts';
import { triggerReset as triggerAudioCursorReset } from '../state/audioCursor.ts';
import type { World } from '../state/world.ts';
import type { PlayerId } from '../types.ts';

export interface NetSession {
  netTransport: NetTransport | null;
  hostSync: HostSync | null;
  clientSync: ClientSync | null;
  /** Last tick at which the host emitted a NETSNAPSHOT. 0 = none yet. */
  lastSnapshotTick: number;
  /**
   * S62 — host-side peerId→seat map, frozen at Begin Match. The host stamps
   * each incoming INTENT's playerId from the sender's seat here (anti-collision
   * / anti-spoof: a client can only drive its own seat). Empty on the client and
   * before Begin. Cleared on teardown.
   */
  hostSeats: Map<string, PlayerId>;
  /**
   * S73 P1 — host-side STABLE lobby seat-map (peerId→seat, seats 1..MAX_PLAYERS-1),
   * accumulated across peer join/leave so survivors KEEP their seat when another peer
   * leaves (non-compacting lobby). The SINGLE SOURCE OF TRUTH: the lobby preview
   * projects it stable (holes allowed) and Begin compacts it dense (buildMatchRoster).
   * Empty on the client + before any peer joins. Cleared on teardown.
   */
  lobbySeats: Map<string, number>;
  /**
   * S79 P4 — CLIENT-side identity of the host peer, latched trust-on-first-use in
   * createJoinAttemptHandler: preferentially from a roster-bearing message
   * (LOBBY_PRESENCE / START_GAME_SIGNAL) whose seat-0 entry NAMES THE SENDER, with a
   * first-NETSNAPSHOT fallback. Once latched, every host-authored message kind
   * (NETSNAPSHOT / GODLY_TRIGGER / START_GAME_SIGNAL / ENDGAME / LOBBY_PRESENCE) from any
   * OTHER peer is dropped — closes backlog #2's client half (a hostile 3rd peer could
   * previously wedge a victim with a spoofed high snapshotSeq, fake a win via ENDGAME, or
   * hijack seating via START_GAME_SIGNAL). Also drives the 3+player host-loss overlay
   * (main.ts). null on the host and before the latch; cleared on teardown.
   */
  hostPeerId: string | null;
}

export function makeNetSession(): NetSession {
  return {
    netTransport: null,
    hostSync: null,
    clientSync: null,
    lastSnapshotTick: 0,
    hostSeats: new Map(),
    lobbySeats: new Map(),
    hostPeerId: null,
  };
}

/**
 * Teardown the active net session. Called from RETURN_TO_TITLE paths:
 * onBackToTitle (lobby Back), onReturnFromConnectionLost (peer-drop),
 * resetIfPostgame (POSTGAME → TITLE).
 *
 * Audit Pass 1 fix 3c8630d7 (Δ4 carry-forward) + Pass 2 refactor 622a7c7f:
 * every production RTT path calls teardownNet first, so firing the cursor
 * reset here covers the full lifecycle. Pre-Pass-2 this was a direct
 * `resetAudioDrainCursor()` call (state→render dep edge — Pass-1 fix);
 * post-Pass-2 it routes through the state-layer publisher, which dispatches
 * to audioManager's registered handler. Without this, after a postgame→
 * TITLE round-trip and a fresh PLAYING entry, audio cues whose `effect.tick`
 * straddles the cursor's prior maximum silently drop (latent since S18 P1
 * introduced the cursor pattern).
 */
export function teardownNet(
  session: NetSession,
  world: World,
  controls: Controls,
  defaultPlayerId: PlayerId,
): void {
  if (session.netTransport !== null) {
    session.netTransport.disconnect();
    session.netTransport = null;
  }
  session.hostSync = null;
  if (session.clientSync !== null) {
    session.clientSync.reset();
    session.clientSync = null;
  }
  controls.setPlayerId(defaultPlayerId);
  world.isHost = true;
  session.lastSnapshotTick = 0;
  session.hostSeats.clear();
  // S73 P1 — clear the stable lobby seat-map so a fresh Host/Join (after lobby Back /
  // peer-drop / postgame) starts with no inherited seats (mirror of hostSeats.clear()).
  session.lobbySeats.clear();
  // S79 P4 — clear the latched host identity so a rejoin re-latches fresh (a new room may
  // have a different host; a stale latch would drop ALL of the new host's messages).
  session.hostPeerId = null;
  triggerAudioCursorReset();
}
