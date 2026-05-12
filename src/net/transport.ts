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
 *   host(code) / join(code)  → opens a peer-to-peer room
 *   send(msg)                → broadcasts a NetMessage to all peers
 *   on(handler)              → receives NetMessages
 *   onPeerChange(handler)    → fires when a peer joins / leaves
 *   peerCount()              → current peer count (host: 0 alone, 1 paired)
 *   disconnect()             → tear down
 */

import { joinRoom, type Room } from 'trystero/nostr';
import type { NetMessage } from './protocol.ts';

const APP_ID = 'spark-game-v1';

/**
 * S19 P4 — pinned Nostr relay set. Replaces Trystero 0.24's "5 random of 55"
 * default behavior which causes signaling-layer stalls when the deterministic
 * shuffle lands on dead / personal / geo-blocked relays (S19 playtest BLOCKER:
 * both peers stuck at "connecting" because the appId-seeded shuffle picked
 * relays that were unreachable from both user networks). These 6 are the
 * most-deployed public Nostr relays — picked deterministically by both peers
 * since the list is hard-coded, with redundancy=6 so all 6 are used (no
 * sub-sampling). Order doesn't matter; relayManager parallel-connects all.
 *
 * LOCKED §13.1 codifies the choice + the version pin upgrade ^0.20 → ^0.24.
 */
const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

export type PeerChangeHandler = (peerId: string, kind: 'join' | 'leave') => void;
export type MessageHandler = (msg: NetMessage, peerId: string) => void;

/**
 * One-shot adapter wrapping a single Trystero room. Construct via host()
 * or join() (semantically identical at the Trystero layer — both are
 * `joinRoom(...)` calls — but we keep the distinction at the call site
 * for lobby UI clarity and to seed Hello{playerId} differently).
 */
export class NetTransport {
  private room: Room | null = null;
  private sendFn: ((msg: NetMessage) => void) | null = null;
  private messageHandlers: MessageHandler[] = [];
  private peerHandlers: PeerChangeHandler[] = [];
  private peerSet: Set<string> = new Set();

  /**
   * Open a room. In Trystero, host vs join is symmetric — the first peer
   * to arrive is the de-facto host for our purposes (we tag isHost on the
   * world from controls via the Hello handshake).
   */
  connect(roomCode: string): void {
    if (this.room !== null) {
      throw new Error('NetTransport already connected; call disconnect() first');
    }
    this.room = joinRoom(
      {
        appId: APP_ID,
        relayConfig: {
          urls: NOSTR_RELAYS,
          redundancy: NOSTR_RELAYS.length,
        },
      },
      roomCode,
    );
    // Trystero's makeAction<T> requires T extends a JsonValue index-signature
    // record. NetMessage is a discriminated union — narrower than that
    // constraint allows but JSON-serializable. Cast through unknown to
    // bridge the two type-system worlds; runtime shape is preserved.
    const [sendFn, recvFn] = (this.room as unknown as {
      makeAction: (name: string) => [(msg: unknown) => void, (cb: (data: unknown, peerId: string) => void) => void];
    }).makeAction('msg');
    this.sendFn = sendFn as (msg: NetMessage) => void;
    recvFn((data: unknown, peerId: string) => {
      const msg = data as NetMessage;
      for (const h of this.messageHandlers) h(msg, peerId);
    });
    this.room.onPeerJoin((peerId) => {
      this.peerSet.add(peerId);
      for (const h of this.peerHandlers) h(peerId, 'join');
    });
    this.room.onPeerLeave((peerId) => {
      this.peerSet.delete(peerId);
      for (const h of this.peerHandlers) h(peerId, 'leave');
    });
  }

  send(msg: NetMessage): void {
    if (this.sendFn === null) {
      throw new Error('NetTransport not connected');
    }
    this.sendFn(msg);
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
    if (this.room !== null) {
      this.room.leave();
      this.room = null;
      this.sendFn = null;
      this.peerSet.clear();
    }
  }
}
