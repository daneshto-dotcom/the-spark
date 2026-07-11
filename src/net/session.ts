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
import type { HostAttest } from './protocol.ts';
import type { SuccessionWarrant } from './successionWarrant.ts';
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
  /**
   * S82 P4(a) — HOST-side cached attestation {pubkey, sig over (roomCode || selfId)}.
   * Computed once right after host-start (selfId is page-constant); attached to every
   * HELLO + the START_GAME_SIGNAL. null on clients / before ready. Cleared on teardown.
   */
  hostAttest: HostAttest | null;
  /**
   * S82 P4(a) — CLIENT-side: the peer that passed CRYPTOGRAPHIC host verification
   * (pubkey fingerprint === typed room code AND valid signature over its own peerId).
   * The hostPeerId latch above now REQUIRES this — the S79 TOFU first-message race is
   * closed. Survives in-page reconnect (same host identity); cleared on teardown.
   */
  hostVerifiedPeerId: string | null;
  /**
   * S82 P4(b) — the room code of the live session (set on host-start AND join-attempt).
   * Needed by (1) the client's attest verification (the code IS the key commitment) and
   * (2) the auto-reconnect retry (rejoin the same room). Cleared on teardown.
   */
  roomCode: string | null;
  /**
   * S87 P4 — TRUE while this session is a QUICKMATCH room (host or client).
   * Gates the ready-button UI + the host's all-ready auto-Begin; friends
   * lobbies stay byte-identical. Cleared on teardown.
   */
  quickmatch: boolean;
  /**
   * S87 P4 — HOST-side per-peer readiness (keyed by transport peerId — never
   * a wire-claimed identity). Pruned implicitly: the auto-begin check
   * intersects with the CURRENT lobbySeats, so a departed peer's stale flag
   * can never wedge or trip the gate. Cleared on teardown.
   */
  qmReadyPeers: Map<string, boolean>;
  /** S87 P4 — this peer's own readiness (host: gates auto-Begin; client: mirrors the last sent LOBBY_READY). */
  qmSelfReady: boolean;
  /**
   * S118 P1 (host-migration D2) — HOST-side peerId→proven-pubkey (SPKI base64) map. A joiner's pubkey
   * is stored HERE only AFTER verifyPubkeyPop passes (hostHandlers HELLO handler), so a peer can't claim
   * another's key. At Begin the host warrants seat→pubkey for every roster seat WITH a proven pubkey
   * (unproven seats are OMITTED — mixed-build tolerance). Empty on clients / before any verified HELLO.
   * Cleared on teardown.
   */
  peerPubkeys: Map<string, string>;
  /**
   * S118 P1 (host-migration D2) — the SuccessionWarrant for the live term. HOST: set at Begin (the one
   * it signed + broadcast). CLIENT: set when a START_GAME_SIGNAL carrying a warrant that passes
   * verifyWarrant arrives (invalid/absent → stays null, match proceeds fail-open). Drives the D2
   * starvation forensics (would-be successor) + is the precondition for a D3 MIGRATION_CLAIM. Cleared
   * on teardown.
   */
  warrant: SuccessionWarrant | null;
  /**
   * S122 P2 (host-migration D3) — CLIENT-side copy of the frozen Begin roster (the
   * START_GAME_SIGNAL's seat↔peerId map). The successor rebuilds hostSeats from it
   * (roster ∩ transport-alive) and every survivor grounds its alive-seat view in it.
   * null before Begin / on the host (which owns hostSeats). Cleared on teardown.
   */
  lastRoster: readonly import('./protocol.ts').RosterEntry[] | null;
  /**
   * S118 P1 (host-migration D2) — the epoch/term this session runs at. 0 for the original host's term;
   * a migrated session (D3+) advances it. Stamped onto every NetSnapshotMsg by HostSync; the ClientSync
   * epoch gate drops snapshots below it (PROVABLY inert at 0). Reset to 0 on teardown.
   */
  currentEpoch: number;
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
    hostAttest: null,
    hostVerifiedPeerId: null,
    roomCode: null,
    quickmatch: false,
    qmReadyPeers: new Map(),
    qmSelfReady: false,
    // S118 P1 (host-migration D2) — succession detection state (dormant until a peer proves a pubkey).
    peerPubkeys: new Map(),
    warrant: null,
    lastRoster: null,
    currentEpoch: 0,
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
  // S82 P4 — clear the crypto-identity + reconnect state with it (a NEW room = a new
  // code = a new verification; auto-reconnect deliberately does NOT call teardownNet,
  // which is what lets the latch + verification survive an in-page transport blip).
  session.hostAttest = null;
  session.hostVerifiedPeerId = null;
  session.roomCode = null;
  // S87 P4 — quickmatch state dies with the session (a re-host/re-join must
  // opt back in; the QM orchestrator in main.ts re-sets the flag on demote).
  session.quickmatch = false;
  session.qmReadyPeers.clear();
  session.qmSelfReady = false;
  // S118 P1 (host-migration D2) — clear succession state so a fresh Host/Join starts with no inherited
  // pubkeys/warrant/epoch (a new room = a new host key commitment = a new warrant; mirror of the S82
  // hostAttest/hostVerifiedPeerId clears above). Auto-reconnect does NOT call teardownNet, so a live
  // session's warrant survives an in-page transport blip (same posture as the crypto latch).
  session.peerPubkeys.clear();
  session.warrant = null;
  session.lastRoster = null;
  session.currentEpoch = 0;
  triggerAudioCursorReset();
}
