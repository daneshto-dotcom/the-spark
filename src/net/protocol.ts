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

// S52 P1 — bumped 2→3 to add PLACE_FROM_FREE atomic LMB-up action (Council
// R1 CONVERGENT BLOCKER C1 Grok#8+Gemini#1). parseNetMessage HELLO check
// below rejects mismatched protoVersion at handshake.
//
// S53 P1 — NetTransport now ALSO surfaces the mismatch as an explicit
// "Protocol mismatch — please refresh" UX diagnostic via onProtocolMismatch
// + per-peer protocolMismatchPeers latch that drops ALL subsequent messages
// from a peer whose HELLO failed protoVersion (closes the v2-peer-INTENT-
// bypass-after-failed-HELLO desync gap that Council Triumvirate flagged as
// CONVERGENT BLOCKER). The PICKUP_SPARK + PLACE_PRIMITIVE allowlist entries
// below remain — placeFromFree.ts's internal fsmPickup dispatches PICKUP_SPARK
// during atomic execution + placePrimitive is the delegation target. Mid-
// deploy peers still see "Protocol mismatch" plus the underlying Connection-
// lost overlay (S22 P3 pattern preserved). S53 P2 — RMB ConnectDrag flow
// removed; the legacy v2 carry-then-place external entry point no longer
// exists locally even if a v2 peer slipped past the latch.
export const PROTOCOL_VERSION = 3 as const;

export interface HelloMsg {
  readonly kind: 'HELLO';
  readonly playerId: PlayerId;
  readonly color: number;
  /** Protocol version — bumped on wire-incompatible changes. S52 P1: 2→3. */
  readonly protoVersion: 3;
}

/**
 * S54 P1 — construct the HELLO handshake envelope a peer broadcasts at
 * peer-join time to announce its protocol version (+ identity). This is the
 * producer that was MISSING through S53: the receive-side machinery
 * (detectProtocolMismatch + onProtocolMismatch + the per-peer drop latch,
 * transport.ts) shipped + unit-tested in S53 P1 but never fired because no
 * call site ever sent a HELLO. Wiring this at peer-join (see
 * `wireHelloOnJoin` in hostHandlers.ts) activates that dormant system.
 *
 * ALWAYS stamps the LOCAL current PROTOCOL_VERSION — a peer announces its own
 * version, never a remembered peer's. The receiver runs detectProtocolMismatch
 * on this BEFORE parseNetMessage, so a peer on a different PROTOCOL_VERSION
 * trips the mismatch UX + drop latch. `playerId`/`color` are informational
 * today (no receiver reads them — host/client message handlers ignore
 * kind:'HELLO'); carried for a future identity/colour handshake and to keep
 * the envelope valid under parseNetMessage's numeric-field checks.
 */
/**
 * S55 P2 — DEV/E2E send-side protoVersion override seam. Mirrors the
 * constants.ts `__TEST_*__` idiom (readTestSpawnRate / readTestWinScore /
 * readTestTerritoryBaseRadius): a Playwright `addInitScript` sets
 * `window.__TEST_PROTO_VERSION_OVERRIDE__` BEFORE the bundle loads, so a test
 * peer can announce a NON-current protoVersion and exercise the RECEIVER's
 * mismatch latch + UX over a real cross-browser wire — the only runtime
 * coverage of the otherwise statically-tested S53/S54 mismatch system (see
 * e2e/smoke.spec.ts "Protocol mismatch").
 *
 * Read PER-CALL (buildHello fires once per peer-join, not on a hot path) so the
 * override is observed whenever it was set before the first join. Window-
 * guarded: production (no window, or no override) returns null and buildHello
 * stamps the local PROTOCOL_VERSION. Ships in the bundle as a ~6-line no-op.
 * Worst-case abuse — a user setting this in their own devtools console — only
 * causes THEIR OWN peer to be latched + dropped by the other side (self-DoS,
 * no cross-peer attack), identical to the 3 existing shipped seams.
 */
function readTestProtoVersionOverride(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_PROTO_VERSION_OVERRIDE__?: number })
    .__TEST_PROTO_VERSION_OVERRIDE__;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function buildHello(playerId: PlayerId, color: number): HelloMsg {
  const override = readTestProtoVersionOverride();
  if (override !== null) {
    // DEV/E2E ONLY (window.__TEST_PROTO_VERSION_OVERRIDE__ is undefined in
    // production). The `as 3` cast is the SINGLE, quarantined point where the
    // wire-contract literal is deliberately violated to simulate a stale-build
    // peer; the receiver's detectProtocolMismatch is designed to reject it.
    // The PRODUCTION return below stays `protoVersion: PROTOCOL_VERSION`, which
    // preserves the version-bump lockstep tsc tripwire: raising
    // PROTOCOL_VERSION without updating HelloMsg.protoVersion errors at that
    // line. (Council R1 #1 — quarantine-cast over relaxing the type to number.)
    return { kind: 'HELLO', playerId, color, protoVersion: override as 3 };
  }
  return { kind: 'HELLO', playerId, color, protoVersion: PROTOCOL_VERSION };
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

/**
 * S39 P1 — dedicated lobby-exit signal. Before S39 the peer transitioned
 * out of LOBBY only when the FIRST NETSNAPSHOT (carrying gameState='PLAYING')
 * arrived and successfully applied. After S38 audit Pass 1/2 added a try/catch
 * around applyNetSnapshot + strict schemaVersion gate in parseNetMessage, any
 * silent drop on the snapshot path leaves the peer stuck in lobby with no
 * user-visible feedback. This envelope is broadcast by the host BEFORE its
 * first snapshot — the peer dispatches a local START_GAME on receipt,
 * decoupling lobby-exit from snapshot-delivery reliability. Subsequent
 * NETSNAPSHOTs still carry authoritative state; this signal only kicks the
 * peer's FSM into PLAYING so visuals start rendering immediately.
 */
export interface StartGameMsg {
  readonly kind: 'START_GAME_SIGNAL';
  readonly mode: '1v1';
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

export type NetMessage =
  | HelloMsg
  | IntentMsg
  | NetSnapshotMsg
  | StartGameMsg
  | EndGameMsg
  | GodlyTriggerMsg;

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
 * Audit Pass 1 fix d3f0e22b + 561e37ce + Pass 2 fix ce51b032 — closed-set
 * allowlist of GameAction discriminants. The Record literal MUST list every
 * `GameAction['type']` exactly once (tsc enforces both directions):
 *   - Removing a kind from GameAction in world.ts → tsc errors here because
 *     the property key is no longer a valid `keyof Record<GameAction['type'], true>`.
 *   - Adding a kind to GameAction without adding the row here → tsc errors at
 *     the type assignment because the literal is missing a required property.
 * Pre-Pass-2 this was an untyped `Set<string>([...])` literal that gave neither
 * direction of safety; the maintenance-trap finding ce51b032 surfaced after
 * Pass 1 strengthened parseNetMessage. The Record-based form makes the wire
 * allowlist a true compile-time mirror of the in-process action union, so the
 * "wire silently rejects valid INTENT" failure mode is now caught at typecheck.
 */
const KNOWN_GAME_ACTION_TYPES_RECORD: Record<GameAction['type'], true> = {
  SPAWN_SPARK: true,
  DESPAWN_SPARK: true,
  PICKUP_SPARK: true,
  DROP_SPARK: true,
  PLACE_PRIMITIVE: true,
  // S52 P1 — atomic LMB-up action replacing the legacy PICKUP+PLACE burst.
  // PROTOCOL_VERSION bumped 2→3; old peers can't receive this but their
  // HELLO will already have been rejected at handshake.
  PLACE_FROM_FREE: true,
  SEVER_BOND: true,
  TICK_ENERGY: true,
  WIN_TRIGGER: true,
  START_GAME: true,
  // S42 — END_TURN removed: turn-based gameplay deleted (blueprint mandates
  // real-time). Old browser-tab peers sending END_TURN get null from
  // parseNetMessage = defensive no-op; no protoVersion bump needed because
  // this is an allowlist tighten, not a structural message change.
  RETURN_TO_TITLE: true,
  UPDATE_AVATAR_POS: true,
  GODLY_TRIGGER: true,
  GODLY_COMPLETE: true,
  GODLY_ABORT: true,
  SPAWN_CREATURE: true,
  DESPAWN_CREATURE: true,
  CREATURE_TICK: true,
  CREATURE_ATTACK: true,
  // S49 P1 (Sym F) — territorial shrink disruption. Joiner can dispatch
  // this as an INTENT; host applies authoritatively.
  SHRINK_TERRITORY: true,
};
const KNOWN_GAME_ACTION_TYPES: ReadonlySet<string> = new Set(
  Object.keys(KNOWN_GAME_ACTION_TYPES_RECORD),
);

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
      // Audit Pass 2 fix d4541985: tighten schemaVersion check. Pre-fix this
      // was `if (schemaVersion !== undefined && schemaVersion !== WIRE_SCHEMA_VERSION)`
      // — a deliberate carve-out for the protocol.test.ts test-double pattern
      // `snapshot: {}`. The carve-out meant a peer could send `{snapshot:{}}`
      // and bypass the version gate (downstream applyNetSnapshot would throw,
      // caught by sync.ts:91 try/catch — bounded to one dropped frame, but
      // the wire validator's leniency was a permissive gap). Strict equality
      // now; test fixtures updated to include `schemaVersion: 1`.
      const schemaVersion = (obj.snapshot as Record<string, unknown>).schemaVersion;
      if (schemaVersion !== WIRE_SCHEMA_VERSION) return null;
      return obj as unknown as NetSnapshotMsg;
    }
    case 'START_GAME_SIGNAL': {
      // S39 P1 — host→peer lobby-exit signal. Mode is fixed at '1v1' today
      // (solo never broadcasts START_GAME), but checked at the wire so a future
      // mode addition fails closed rather than silently mis-routing.
      if (obj.mode !== '1v1') return null;
      return obj as unknown as StartGameMsg;
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
