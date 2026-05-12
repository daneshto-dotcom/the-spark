/**
 * SPARK — Trystero/Nostr transport adapter for Phase-2 1v1 networking.
 *
 * § 11 LOCKED (post-S15): Trystero with Nostr-primary strategy (PRIME-AUDIT
 * #1 — explicit import from 'trystero/nostr' vs the BitTorrent default
 * Grok R1 flagged as rate-limit-prone at 10Hz binary). Free, no signaling
 * server to operate, multi-relay fallback under the Trystero abstraction.
 *
 * This wrapper exposes a narrow API so the rest of the game has no direct
 * Trystero dependency:
 *   connect(roomCode)        → opens a peer-to-peer room
 *   send(msg)                → broadcasts a NetMessage to all peers
 *   on(handler)              → receives NetMessages
 *   onPeerChange(handler)    → fires when a peer joins / leaves
 *   onError = handler        → S20 P0: surfaces signaling/ICE/send errors
 *   peerCount()              → current peer count (host: 0 alone, 1 paired)
 *   isConnected()            → true if room open AND ≥1 peer
 *   disconnect()             → tear down
 *
 * § 13.1 v5 (S20 P0): joinRoom now passes a 3rd-arg JoinRoomCallbacks
 * (onJoinError + onPeerHandshake + handshakeTimeoutMs) AND an rtcConfig
 * with STUN + free public TURN servers. Previous wrapper (v4) passed
 * neither, so signaling failures + symmetric-NAT users were invisible
 * BLOCKERs. Diagnostic [net]-tagged console logging at every layer
 * transition + 1Hz ICE-state poll via room.getPeers() while peerSet is
 * empty (max 30 s) names the failure layer for user retest.
 */

import { joinRoom, getRelaySockets, type Room } from 'trystero/nostr';
import type { NetMessage } from './protocol.ts';

const APP_ID = 'spark-game-v1';

/**
 * S19 P4 — pinned Nostr relay set. Replaces Trystero 0.24's "5 random of 55"
 * default behavior which causes signaling-layer stalls when the deterministic
 * shuffle lands on dead / personal / geo-blocked relays. These 6 are the
 * most-deployed public Nostr relays — picked deterministically by both peers
 * since the list is hard-coded, with redundancy=NOSTR_RELAYS.length so all 6
 * are used (no sub-sampling). Order doesn't matter; relayManager parallel-
 * connects all.
 *
 * LOCKED §13.1 v4 codifies the choice + the version pin upgrade ^0.20 → ^0.24.
 */
const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

/**
 * S20 P0 — ICE servers passed to RTCPeerConnection via Trystero rtcConfig.
 * Google STUN x2 for fast direct-NAT cases + openrelay.metered.ca free TURN
 * x3 (UDP/80, TCP/443, UDP/443) for symmetric-NAT users (mobile hotspot,
 * corporate, some ISP CGNATs) who cannot ICE-connect on STUN alone — the
 * primary suspect for the S19 P4-unresolved 1v1 BLOCKER.
 *
 * openrelay.metered.ca creds are publicly documented stable shared creds
 * (https://www.metered.ca/tools/openrelay/). Replace with an org-owned
 * coturn deployment if abuse becomes an issue. iceTransportPolicy 'all'
 * is the RTCConfiguration default but made explicit for predictability.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=udp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/** S20 P0 — joinRoom 3rd-arg handshakeTimeoutMs. After 30 s of stuck
 *  handshake, Trystero fires onJoinError with a timeout-flavored error. */
const HANDSHAKE_TIMEOUT_MS = 30000;

/** S20 P0 — 1Hz ICE-state poll while peerSet empty, capped at 30 s = max 30 log lines.
 *  Stops on first onPeerJoin OR after cap. Names the failure layer for users who
 *  would otherwise see indefinite "Connecting..." with no console output. */
const ICE_POLL_INTERVAL_MS = 1000;
const ICE_POLL_MAX_DURATION_MS = 30000;

export type PeerChangeHandler = (peerId: string, kind: 'join' | 'leave') => void;
export type MessageHandler = (msg: NetMessage, peerId: string) => void;
export type ErrorHandler = (msg: string) => void;

/**
 * S20 P0 — classify a `details.error` string from Trystero's onJoinError into
 * a user-friendly UX hint. Substring-matched (case-insensitive). Falls back
 * to the raw error if no pattern matches (Council R1 Gemini #4).
 */
export function classifyJoinError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (lower.includes('timeout')) {
    return `Signaling timeout — try again (${rawError})`;
  }
  if (lower.includes('rejected') || lower.includes('invalid') || lower.includes('denied')) {
    return `Connection rejected — check the room code (${rawError})`;
  }
  return `Signaling: ${rawError}`;
}

/**
 * One-shot adapter wrapping a single Trystero room. Construct via host or
 * join (semantically identical at the Trystero layer — both are `joinRoom(...)`
 * calls — but we keep the distinction at the call site for lobby UI clarity
 * and to seed Hello{playerId} differently).
 */
export class NetTransport {
  private room: Room | null = null;
  private sendFn: ((msg: string) => Promise<void[]>) | null = null;
  private messageHandlers: MessageHandler[] = [];
  private peerHandlers: PeerChangeHandler[] = [];
  private peerSet: Set<string> = new Set();
  private icePollTimer: ReturnType<typeof setInterval> | null = null;
  private icePollStartMs = 0;

  /** S20 P0 — UI error sink; called for join errors, ICE failures, send
   *  rejections, malformed-peer-message parses. Set once after construction
   *  in main.ts to route into lobbyScreen.setErrorMessage. */
  public onError: ErrorHandler | null = null;

  private emitError(msg: string): void {
    console.error('[net] error:', msg);
    if (this.onError !== null) this.onError(msg);
  }

  /**
   * Open a room. In Trystero, host vs join is symmetric — the first peer
   * to arrive is the de-facto host for our purposes (we tag isHost on the
   * world from controls via the Hello handshake).
   */
  connect(roomCode: string): void {
    if (this.room !== null) {
      throw new Error('NetTransport already connected; call disconnect() first');
    }
    console.info(
      `[net] connect: roomCode=${roomCode} appId=${APP_ID} relays=${NOSTR_RELAYS.length} ice=${ICE_SERVERS.length}`,
    );

    // S20 P0 — joinRoom 3rd arg JoinRoomCallbacks: onJoinError + onPeerHandshake
    // + handshakeTimeoutMs. Without these, signaling/handshake failures are
    // silent and the UI hangs forever (the S19 P4-unresolved BLOCKER root cause).
    this.room = joinRoom(
      {
        appId: APP_ID,
        relayConfig: {
          urls: NOSTR_RELAYS,
          redundancy: NOSTR_RELAYS.length,
        },
        rtcConfig: {
          iceServers: ICE_SERVERS,
          iceTransportPolicy: 'all',
        },
        trickleIce: true,
      },
      roomCode,
      {
        handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
        onJoinError: (details) => {
          console.error('[net] onJoinError:', details);
          this.emitError(classifyJoinError(details.error));
        },
        onPeerHandshake: async (peerId, _send, _receive, isInitiator) => {
          // Observability-only (PRIME-AUDIT-2 revision of Council ADOPT-E):
          // protocol.ts already encodes HelloMsg.protoVersion at the app
          // layer, so a duplicate handshake-layer version check is redundant.
          // Log the handshake event so users see it in F12 console during
          // the pre-peer-join phase (between signaling complete and ICE done).
          console.info(`[net] onPeerHandshake peer=${peerId} isInitiator=${isInitiator}`);
        },
      },
    );

    // S20 P0 — log Nostr relay socket count post-attach (Council ADOPT-G).
    // getRelaySockets is `any`-typed in Trystero 0.24 export; defensive call.
    try {
      const getSockets = getRelaySockets as unknown as (() => unknown) | undefined;
      if (typeof getSockets === 'function') {
        const sockets = getSockets();
        const count =
          sockets !== null && typeof sockets === 'object'
            ? Object.keys(sockets as Record<string, unknown>).length
            : 0;
        console.info('[net] relay sockets attached:', count);
      }
    } catch (err) {
      console.warn('[net] getRelaySockets probe failed:', err);
    }

    // S20 P0 — replace S19 P4 unknown-cast with proper Room.makeAction<string>.
    // Returns 3-tuple [sender, receiver, ActionProgress]; we don't use progress.
    // Wire format is JSON-encoded NetMessage as a single string for type clarity
    // (string is a JsonPrimitive ⊂ DataPayload — no struct-vs-index-signature
    // type fight). Both peers upgrade together via deploy so wire-compat is OK.
    const [sendFn, recvFn] = this.room.makeAction<string>('msg');
    this.sendFn = sendFn;
    recvFn((data, peerId) => {
      // makeAction<string> narrows `data` to string; defensive parse here
      // anyway since a non-conforming peer could still wire arbitrary bytes.
      try {
        const msg = JSON.parse(data) as NetMessage;
        for (const h of this.messageHandlers) h(msg, peerId);
      } catch (err) {
        this.emitError(
          `Malformed peer message from ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    this.room.onPeerJoin((peerId) => {
      console.info(`[net] onPeerJoin: ${peerId} size=${this.peerSet.size + 1}`);
      this.peerSet.add(peerId);
      this.stopIcePollIfRunning();
      for (const h of this.peerHandlers) h(peerId, 'join');
    });
    this.room.onPeerLeave((peerId) => {
      console.info(`[net] onPeerLeave: ${peerId} size=${this.peerSet.size - 1}`);
      this.peerSet.delete(peerId);
      for (const h of this.peerHandlers) h(peerId, 'leave');
    });

    // S20 P0 — 1Hz ICE-state poll while peerSet empty. Stops on first peer join
    // (in onPeerJoin) OR after 30 s elapsed. Names the failure layer for users
    // who would otherwise see indefinite "Connecting..." with no console output.
    this.startIcePoll();
  }

  private startIcePoll(): void {
    this.icePollStartMs = Date.now();
    this.icePollTimer = setInterval(() => {
      const elapsed = Date.now() - this.icePollStartMs;
      if (elapsed >= ICE_POLL_MAX_DURATION_MS) {
        this.stopIcePollIfRunning();
        console.warn('[net] ice-poll: 30s elapsed, peerSet still empty');
        return;
      }
      if (this.room === null) {
        this.stopIcePollIfRunning();
        return;
      }
      const peers = this.room.getPeers();
      const peerIds = Object.keys(peers);
      if (peerIds.length === 0) {
        console.info(`[net] ice-poll t=${elapsed}ms: no RTCPeerConnection yet`);
        return;
      }
      for (const peerId of peerIds) {
        const pc = peers[peerId];
        console.info(
          `[net] ice-poll t=${elapsed}ms peer=${peerId} ` +
            `ice=${pc.iceConnectionState} gather=${pc.iceGatheringState} ` +
            `conn=${pc.connectionState} sig=${pc.signalingState}`,
        );
      }
    }, ICE_POLL_INTERVAL_MS);
  }

  private stopIcePollIfRunning(): void {
    if (this.icePollTimer !== null) {
      clearInterval(this.icePollTimer);
      this.icePollTimer = null;
    }
  }

  send(msg: NetMessage): void {
    if (this.sendFn === null) {
      throw new Error('NetTransport not connected');
    }
    // S20 P0 — Trystero 0.24 sender returns Promise<void[]>. Fire-and-forget
    // but surface unhandled rejections to UI (.catch escalates to onError per
    // Council ADOPT-F, not just console).
    this.sendFn(JSON.stringify(msg)).catch((err: unknown) => {
      this.emitError(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  on(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onPeerChange(handler: PeerChangeHandler): void {
    this.peerHandlers.push(handler);
  }

  peerCount(): number {
    return this.peerSet.size;
  }

  isConnected(): boolean {
    return this.room !== null && this.peerSet.size > 0;
  }

  disconnect(): void {
    this.stopIcePollIfRunning();
    if (this.room !== null) {
      console.info('[net] disconnect');
      this.room.leave();
      this.room = null;
      this.sendFn = null;
      this.peerSet.clear();
    }
  }
}
