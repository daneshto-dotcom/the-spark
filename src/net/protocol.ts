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
 * Audit Pass 1 fix d3f0e22b + 561e37ce — closed-set allowlist of GameAction
 * discriminants. INTENT.action.type MUST appear here for the validator to pass.
 * Adding a new GameAction variant in `state/world.ts` (or a sub-module) requires
 * adding the discriminant string here too — the duplicated source is deliberate:
 * `world.ts` owns the structural type, this file owns the WIRE allowlist so an
 * upstream type widening cannot silently grow the attack surface.
 */
const KNOWN_GAME_ACTION_TYPES = new Set<string>([
  'SPAWN_SPARK',
  'DESPAWN_SPARK',
  'PICKUP_SPARK',
  'DROP_SPARK',
  'PLACE_PRIMITIVE',
  'SEVER_BOND',
  'TICK_ENERGY',
  'WIN_TRIGGER',
  'START_GAME',
  'END_TURN',
  'RETURN_TO_TITLE',
  'UPDATE_AVATAR_POS',
  'GODLY_TRIGGER',
  'GODLY_COMPLETE',
  'GODLY_ABORT',
  'SPAWN_CREATURE',
  'DESPAWN_CREATURE',
  'CREATURE_TICK',
  'CREATURE_ATTACK',
]);

const WIRE_SCHEMA_VERSION = 1;

/**
 * S22 P3 (R9 safety) — parse + validate a peer-wire payload into a NetMessage.
 * Returns null on any of: non-object input, unknown `kind`, type-shape mismatch,
 * unknown INTENT.action.type, NETSNAPSHOT.snapshot.schemaVersion mismatch, or
 * HELLO with mismatched protoVersion.
 *
 * Audit Pass 1 fix (d3f0e22b + 561e37ce): strengthened beyond the original
 * key-presence checks. Now wired at transport.ts:recvFn (was previously
 * defined-but-never-called outside tests — Karpathy K1+K3). Defense-in-depth:
 * the validator pre-rejects payloads that would otherwise throw inside
 * applyNetSnapshot (`schemaVersion !== 1`) or land in the dispatcher's `default`
 * case (unknown action.type). Strong types (closed allowlist) keep the wire
 * attack surface frozen even as the in-process GameAction union grows.
 */
export function parseNetMessage(raw: unknown): NetMessage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  switch (obj.kind) {
    case 'HELLO': {
      if (obj.protoVersion !== PROTOCOL_VERSION) return null;
      if (typeof obj.playerId !== 'number') return null;
      if (typeof obj.color !== 'number') return null;
      return obj as unknown as HelloMsg;
    }
    case 'INTENT': {
      if (typeof obj.intentSeq !== 'number') return null;
      if (obj.action === null || typeof obj.action !== 'object') return null;
      const actionType = (obj.action as Record<string, unknown>).type;
      if (typeof actionType !== 'string') return null;
      if (!KNOWN_GAME_ACTION_TYPES.has(actionType)) return null;
      return obj as unknown as IntentMsg;
    }
    case 'NETSNAPSHOT': {
      if (typeof obj.snapshotSeq !== 'number') return null;
      if (obj.snapshot === null || typeof obj.snapshot !== 'object') return null;
      // Pre-validate schemaVersion so applyNetSnapshot's throw is unreachable
      // from a wire payload that survives this validator (defense-in-depth
      // paired with finding e698a17a's try/catch guard in sync.ts).
      const schemaVersion = (obj.snapshot as Record<string, unknown>).schemaVersion;
      // Allow `undefined` only for the test-doubles pattern in protocol.test.ts
      // that posts `snapshot: {}` (intentionally minimal); real wire payloads
      // from `netSnapshot()` always carry schemaVersion=1 (see save.ts:241).
      if (schemaVersion !== undefined && schemaVersion !== WIRE_SCHEMA_VERSION) {
        return null;
      }
      return obj as unknown as NetSnapshotMsg;
    }
    case 'ENDGAME':
      return typeof obj.winnerId === 'number' ? (obj as unknown as EndGameMsg) : null;
    case 'GODLY_TRIGGER': {
      if (obj.event === null || typeof obj.event !== 'object') return null;
      const godlyId = (obj.event as Record<string, unknown>).godlyId;
      if (typeof godlyId !== 'string') return null;
      return obj as unknown as GodlyTriggerMsg;
    }
    default:
      return null;
  }
}
