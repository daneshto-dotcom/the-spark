/**
 * SPARK — wire protocol for Phase-2 1v1 networked play.
 *
 * § 11 LOCKED (post-S15 amendment): host-authoritative, Trystero transport,
 * NetSnapshot at 10 Hz, per-direction sequence numbers (Council R2 +
 * PRIME-AUDIT #2: separate counters for host→client snapshots vs
 * client→host intents).
 *
 * S22 P3 amendment: protoVersion bumped 1 → 2. Added GodlyTriggerMsg
 * envelope for host-broadcast godly events. No back-compat shim — peers
 * on protoVersion 1 are rejected at lobby; both peers always upgrade
 * together via deploy. parseNetMessage validator added for R9 safety.
 */

import type { GameAction } from '../state/world.ts';
import type { NetSnapshot } from '../state/save.ts';
import type { PlayerId } from '../types.ts';
import type { GodlyTriggerEvent } from '../state/godlyRecipes/types.ts';

// NetSnapshot is defined in save.ts (alongside its producer netSnapshot()
// + consumer applyNetSnapshot()). Re-export so protocol callers can refer
// to it without crossing the save.ts boundary directly.
export type { NetSnapshot };

export const PROTOCOL_VERSION = 2 as const;

export interface HelloMsg {
  readonly kind: 'HELLO';
  readonly playerId: PlayerId;
  readonly color: number;
  /** Protocol version — bumped on wire-incompatible changes. */
  readonly protoVersion: 2;
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

/**
 * S22 P3 — host-broadcast godly-cinematic-fire event. Sent standalone
 * (not bundled with NetSnapshot) so the client renders the cinematic
 * 0-100 ms sooner than next snapshot would arrive (D4 standalone choice).
 * Client routes to local dispatch GODLY_TRIGGER; client NEVER runs the
 * recipe predicate locally (Battle Ledger row 9 anti-desync clarification).
 */
export interface GodlyTriggerMsg {
  readonly kind: 'GODLY_TRIGGER';
  readonly event: GodlyTriggerEvent;
}

export type NetMessage = HelloMsg | IntentMsg | NetSnapshotMsg | EndGameMsg | GodlyTriggerMsg;

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

/**
 * S22 P3 (R9 safety) — parse + validate a peer-wire payload into a NetMessage.
 * Returns null on unknown `kind` or on HELLO with mismatched protoVersion.
 * Used by transport.ts recvFn for defense against malformed peers + by tests.
 */
export function parseNetMessage(raw: unknown): NetMessage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  switch (obj.kind) {
    case 'HELLO':
      return obj.protoVersion === PROTOCOL_VERSION ? (obj as unknown as HelloMsg) : null;
    case 'INTENT':
      return typeof obj.intentSeq === 'number' && obj.action !== undefined
        ? (obj as unknown as IntentMsg)
        : null;
    case 'NETSNAPSHOT':
      return typeof obj.snapshotSeq === 'number' && obj.snapshot !== undefined
        ? (obj as unknown as NetSnapshotMsg)
        : null;
    case 'ENDGAME':
      return typeof obj.winnerId === 'number' ? (obj as unknown as EndGameMsg) : null;
    case 'GODLY_TRIGGER':
      return obj.event !== undefined ? (obj as unknown as GodlyTriggerMsg) : null;
    default:
      return null;
  }
}
