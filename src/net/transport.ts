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
import { parseNetMessage, type NetMessage } from './protocol.ts';
import {
  APP_ID,
  HANDSHAKE_TIMEOUT_MS,
  ICE_POLL_INTERVAL_MS,
  ICE_POLL_MAX_DURATION_MS,
  ICE_SERVERS,
  NOSTR_RELAYS,
  classifyJoinError,
} from './iceConfig.ts';

// classifyJoinError re-exported for callers that imported it from transport.ts
// before the S22 P1 §XV extraction. Pure pass-through — no behavior change.
export { classifyJoinError };

export type PeerChangeHandler = (peerId: string, kind: 'join' | 'leave') => void;
export type MessageHandler = (msg: NetMessage, peerId: string) => void;
export type ErrorHandler = (msg: string) => void;

/**
 * One-shot adapter wrapping a single Trystero room. Construct via host or
 * join (semantically identical at the Trystero layer — both are `joinRoom(...)`
 * calls — but we keep the distinction at the call site for lobby UI clarity
 * and to seed Hello{playerId} differently).
 */
/**
 * S39 P1 — wire diagnostics. Counters maintained by recvFn for visible-to-user
 * surfacing in the lobby screen while joining (no `?debug=1` required). When
 * the peer is stuck on "Waiting for host to begin", these numbers tell us
 * whether snapshots are arriving, being rejected at the wire (parseNetMessage
 * null), or arriving but failing applyNetSnapshot (incremented by ClientSync).
 */
export interface NetDiagnostics {
  readonly accepted: number;
  readonly rejected: number;
  readonly lastSeq: number;
  readonly lastKind: string | null;
}

export class NetTransport {
  private room: Room | null = null;
  private sendFn: ((msg: string) => Promise<void[]>) | null = null;
  private messageHandlers: MessageHandler[] = [];
  private peerHandlers: PeerChangeHandler[] = [];
  private peerSet: Set<string> = new Set();
  private icePollTimer: ReturnType<typeof setInterval> | null = null;
  private icePollStartMs = 0;
  private acceptedCount = 0;
  private rejectedCount = 0;
  private lastSeq = 0;
  private lastKind: string | null = null;

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
      //
      // Audit Pass 1 fix d3f0e22b: route through parseNetMessage(...) — the
      // protocol.ts validator that was defined for "defense against malformed
      // peers" (S22 P3) but never previously wired here. Pre-fix this was a
      // raw `JSON.parse(data) as NetMessage` cast that forwarded ANY shape
      // matching the discriminant kind to handlers, including payloads that
      // would throw inside applyNetSnapshot (bad schemaVersion) or land in the
      // dispatcher's default branch (unknown action.type).
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        this.emitError(
          `Malformed peer message from ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      const msg = parseNetMessage(parsed);
      if (msg === null) {
        // Don't let an attacker probe by spamming emitError into the UI; log
        // once at console.warn for diagnosability and drop. emitError stays
        // reserved for JSON-syntax failures (above) which signal real
        // transport breakage rather than peer-misbehavior.
        this.rejectedCount++;
        console.warn('[net] rejected malformed NetMessage from', peerId, parsed);
        return;
      }
      this.acceptedCount++;
      this.lastKind = msg.kind;
      if (msg.kind === 'NETSNAPSHOT') this.lastSeq = msg.snapshotSeq;
      for (const h of this.messageHandlers) h(msg, peerId);
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

  /** S39 P1 — visible-to-lobby diagnostics; see NetDiagnostics jsdoc. */
  getDiagnostics(): NetDiagnostics {
    return {
      accepted: this.acceptedCount,
      rejected: this.rejectedCount,
      lastSeq: this.lastSeq,
      lastKind: this.lastKind,
    };
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
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.lastSeq = 0;
    this.lastKind = null;
  }
}
