/**
 * SPARK — wire protocol for Phase-2 1v1 networked play.
 *
 * § 11 LOCKED (post-S15 amendment): host-authoritative, Trystero transport,
 * NetSnapshot at 10 Hz, per-direction sequence numbers (Council R2 +
 * PRIME-AUDIT #2: separate counters for host→client snapshots vs
 * client→host intents).
 *
 * Envelope = discriminated union over { HELLO, INTENT, NETSNAPSHOT, ENDGAME }.
 * Serialized over Trystero's DataChannel via room.makeAction('msg').
 *
 * NetSnapshot is a STRIPPED projection of save.ts's WorldSnapshot — the
 * fields the host computes locally (savedAt, rngSeed, nextPrimitiveId,
 * nextBondId) are absent. See save.ts:netSnapshot() for the producer side.
 *
 * Intents are dispatchable GameAction shapes (client computed target IDs
 * from its local snapshot view; host re-validates IDs + currentPlayerId
 * before dispatching). PRIME-AUDIT #7 / Grok R1 #5 input-sanitization.
 */

import type { GameAction } from '../state/world.ts';
import type { NetSnapshot } from '../state/save.ts';
import type { PlayerId } from '../types.ts';

// NetSnapshot is defined in save.ts (alongside its producer netSnapshot()
// + consumer applyNetSnapshot()). Re-export so protocol callers can refer
// to it without crossing the save.ts boundary directly.
export type { NetSnapshot };

export interface HelloMsg {
  readonly kind: 'HELLO';
  readonly playerId: PlayerId;
  readonly color: number;
  /** Protocol version — bumped on wire-incompatible changes. */
  readonly protoVersion: 1;
}

export interface IntentMsg {
  readonly kind: 'INTENT';
  readonly intentSeq: number;
  readonly action: GameAction;
}

export interface NetSnapshotMsg {
  readonly kind: 'NETSNAPSHOT';
  readonly snapshotSeq: number;
  readonly snapshot: NetSnapshot;
}

export interface EndGameMsg {
  readonly kind: 'ENDGAME';
  readonly winnerId: PlayerId;
}

export type NetMessage = HelloMsg | IntentMsg | NetSnapshotMsg | EndGameMsg;

/**
 * 6-character alphanumeric room code (uppercase letters + digits, dropping
 * 0/O/1/I to avoid visual confusion when sharing verbally). Caller asks
 * Math.random() for entropy — fine for friends-only matchmaking (no
 * adversarial collision search worth defending against in v1).
 */
const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateRoomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Validate a user-typed room code: uppercase + length match + alphabet subset.
 * Returns canonicalized code or null on failure.
 */
export function parseRoomCode(input: string, length = 6): string | null {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== length) return null;
  for (const ch of trimmed) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  }
  return trimmed;
}
