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
// S118 P1 (host-migration D2) — TYPE-ONLY (erased at compile; adds no runtime import cycle) so the
// Begin signal can carry the host's SuccessionWarrant additively. Shape is validated at the wire below.
import type { SuccessionWarrant } from './successionWarrant.ts';
import { MAX_PLAYERS } from '../constants.ts';

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
// S62 — bumped 3→4 for N-player: START_GAME_SIGNAL now carries the seat→color
// roster (deterministic cross-client seating). A v3 peer is rejected at the
// HELLO handshake (single-deploy, no stragglers) — same lockstep as prior bumps.
// S71 — bumped 4→5: new TRIGGER_BOMB client→host gameplay intent (Council
// UNANIMOUS Fork A). Unlike the cosmetic LOBBY_PRESENCE (no bump), a stale v4
// peer would desync on bomb-grabs + the bomb/hunter/potato snapshot state, so it
// is hard-rejected at the HELLO handshake. (Single bump covers the P1/P2/P3 batch.)
// S75 — bumped 5→6: new TRIGGER_RAINBOW client→host gameplay intent (the rainbow colour-
// shuffle). A stale v5 peer would desync on the global player/prim colour remap (+ the new
// rainbows[] snapshot field), so it is hard-rejected at the HELLO handshake — same lockstep
// as the S71 TRIGGER_BOMB bump.
// S77 P3 — bumped 6→7: the new SEAGULL hazard. Its actions are HOST-INTERNAL (no new client
// intent — cleaning is host-detected avatar proximity), so by the hunter/potato precedent it
// COULD be no-bump; but it is a GLOBAL income-affecting hazard (a poop fouls a structure →
// that structure's income halts; a free spark is slowed) whose effects would be invisible/
// confusing to a stale v6 peer (which can't render seagulls/poops or understand the foul).
// Council CONVERGED on the rainbow precedent: bump so a stale peer is hard-rejected at HELLO.
// S87 P4 — bumped 7→8: QUICKMATCH ships the new LOBBY_READY client→host
// envelope and an all-ready START GATE. A stale v7 peer in a quickmatch room
// could never send LOBBY_READY, so the host's "everyone clicked start" gate
// would stall FOREVER on its silence (Council S87 F4 CONCEDED→GEMINI — the
// LOBBY_PRESENCE no-bump precedent covers cosmetic kinds, not match-gating
// ones). The HELLO hard-reject + "please refresh" UX handles the skew.
// S100 P1 (TD Phase 1a) — bumped 9→10: the tower-defense feature ships
// REGISTER_SPAWNER/REMOVE_SPAWNER (host-internal) + a new SPAWN_CREATURE
// sourceSpawnerId field + the additive-optional `creatureSpawners[]` snapshot
// field. Both are HOST-AUTHORITATIVE (never client INTENTs — see the
// KNOWN_GAME_ACTION_TYPES_RECORD rows below, deliberately ABSENT from
// CLIENT_INTENT_TYPES). A stale v9 peer can't render an income-affecting +
// structure-destroying system (a spawner that mints chewers chewing through its
// connectors), so it is hard-rejected at the HELLO handshake — same lockstep as
// the S77 seagull / S93 NONET bumps (TOWER_DEFENSE_DESIGN.md §3.3).
// S102 #1 — bumped 10→11: the new RAID_CREATURE client INTENT (a player right-clicks an
// enemy chewer to pop it) + creatures now carry an `hp` field (host-only, wire-stripped, but
// the kill semantics differ). A stale v10 peer that can't originate/handle a raid would
// desync on the creature-kill, so it is hard-rejected at HELLO (same lockstep as above).
// S103 P2 — bumped 11->12: the generic DEFENDER substrate ships REGISTER_DEFENDER /
// REMOVE_DEFENDER / DEFENDER_TICK (host-internal) + the additive-optional `defenders[]` snapshot
// field (a stationary turret/HELGA auto-attacking creatures). A stale v11 peer can't stay in sync
// with a defender firing beams/slaps, so it is hard-rejected at HELLO (same lockstep as the S100
// spawner bump). Defenders are HOST-AUTHORITATIVE (never client INTENTs — they auto-build from
// geometry), so they ride KNOWN_GAME_ACTION_TYPES_RECORD only, ABSENT from CLIENT_INTENT_TYPES.
// S110 P4 (Batch B) — bumped 12->13: HELGA's walk-to-target rework adds a SERIALIZED defender state
// literal 'WALK' + additive-optional prevPos/walkTargetPos to the defenders[] snapshot. A stale v12
// peer would receive a 'WALK' state it can't parse / would mis-render the walking princess, so it is
// hard-rejected at HELLO (same lockstep as the S103 11->12 defender bump). Still host-authoritative.
// S113 Batch C — bumped 13->14: the lightning-drone building adds a NEW CreatureType 'lightningDrone'
// on the serialized creatures[] + a NEW recipeId 'lightningHub' on a SerializedSpawner. A stale v13
// peer would receive a creature/recipe literal it can't render, so it is hard-rejected at HELLO. The
// new actions (DRONE_EXPLODE / STRUCTURE_SELFDESTRUCT) are HOST-INTERNAL (never client INTENTs).
export const PROTOCOL_VERSION = 14 as const;

/**
 * S82 P4(a) — host attestation: {public key, signature} binding the ROOM CODE (which is
 * a 30-bit fingerprint of that key — see net/hostIdentity.ts) to the host's transport
 * peerId. ADDITIVE-OPTIONAL on HELLO + START_GAME_SIGNAL (no PROTOCOL_VERSION bump —
 * lockstep-deploy procedure; a stale peer ignores unknown keys). The client latches the
 * host ONLY after verifying it — the S79 P4 TOFU first-message race is dead.
 */
export interface HostAttest {
  readonly spkiB64: string;
  readonly sigB64: string;
}

/** Fail-closed shape check for an OPTIONAL hostAttest field (malformed ⇒ reject message). */
function isValidHostAttest(v: unknown): v is HostAttest {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return typeof a.spkiB64 === 'string' && typeof a.sigB64 === 'string';
}

/**
 * S118 P1 (host-migration D2) — fail-closed SHAPE check for an OPTIONAL START_GAME_SIGNAL.warrant.
 * Validates {epoch:number, seats:[{seat:number, spkiB64:string}] (≤ MAX_PLAYERS), sigB64:string}. This
 * is a WIRE-shape gate only — cryptographic verifyWarrant (chaining to the room code) runs later, in
 * the client handler. A malformed warrant nulls the whole message (never hand a junk shape downstream);
 * an ABSENT warrant is fine (legacy/mixed-build Begin). Bounds seat-list work against a flooding peer.
 */
function isValidWarrant(v: unknown): v is SuccessionWarrant {
  if (v === null || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  if (typeof w.epoch !== 'number' || typeof w.sigB64 !== 'string') return false;
  if (!Array.isArray(w.seats) || w.seats.length > MAX_PLAYERS) return false;
  for (const s of w.seats) {
    if (s === null || typeof s !== 'object') return false;
    const seat = s as Record<string, unknown>;
    if (typeof seat.seat !== 'number' || typeof seat.spkiB64 !== 'string') return false;
  }
  return true;
}

export interface HelloMsg {
  readonly kind: 'HELLO';
  readonly playerId: PlayerId;
  readonly color: number;
  /** Protocol version — bumped on wire-incompatible changes. S77 P3: 6→7 (seagull); S87 P4: 7→8 (LOBBY_READY quickmatch gate); S93: 8→9 (NONET SUDOKU_SOLVED intent + sudoku snapshot field); S100 P1: 9→10 (TD spawner lifecycle + creatureSpawners snapshot field); S102 #1: 10→11 (RAID_CREATURE intent + creature hp); S103 P2: 11→12 (generic defender lifecycle + defenders snapshot field); S110 P4: 12→13 (HELGA walk: serialized 'WALK' state + prevPos/walkTargetPos on defenders[]); S113 Batch C: 13→14 (lightning-drone building: new CreatureType 'lightningDrone' + recipeId 'lightningHub'). */
  readonly protoVersion: 14;
  /** S82 P4(a) — present on the HOST's HELLO only (additive-optional). */
  readonly hostAttest?: HostAttest;
  /**
   * S115 P3 (host-migration D1) — the joiner's ephemeral pubkey (SPKI base64, net/hostIdentity.
   * generateClientIdentity), so the host can warrant it as a potential successor. ADDITIVE-OPTIONAL (no
   * PROTOCOL_VERSION bump — same posture as hostAttest): a stale peer ignores the key, and no live HELLO
   * populates it yet (D1 is feature-flagged off; D2 wires the send). Absent on host/legacy HELLOs.
   */
  readonly clientPubkeyB64?: string;
  /**
   * S118 P1 (host-migration D2) — the joiner's PROOF-OF-POSSESSION signature over
   * buildPubkeyPopPayload(roomCode, selfId, clientPubkeyB64) (net/hostIdentity.ts), proving it holds
   * the private key for clientPubkeyB64 (closes the "claim any pubkey in HELLO" hole — Council GROK W1).
   * ADDITIVE-OPTIONAL (no PROTOCOL_VERSION bump). Present only alongside clientPubkeyB64 on a live D2
   * joiner HELLO; the host stores the pubkey ONLY after verifyPubkeyPop passes. Absent on host/legacy.
   */
  readonly clientPubkeyPopB64?: string;
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

export function buildHello(
  playerId: PlayerId,
  color: number,
  hostAttest?: HostAttest,
  clientPubkeyB64?: string,
  // S118 P1 (host-migration D2) — the joiner's PoP signature; threaded alongside clientPubkeyB64.
  clientPubkeyPopB64?: string,
): HelloMsg {
  const override = readTestProtoVersionOverride();
  if (override !== null) {
    // DEV/E2E ONLY (window.__TEST_PROTO_VERSION_OVERRIDE__ is undefined in
    // production). The `as typeof PROTOCOL_VERSION` cast is the SINGLE,
    // quarantined point where the wire-contract literal is deliberately violated
    // to simulate a stale-build peer; the receiver's detectProtocolMismatch is
    // designed to reject it. (S79 P6 — was a hardcoded `as 7`/stale "as 6"
    // comment that needed manual maintenance on every version bump; the typeof
    // form tracks the literal automatically.) The PRODUCTION return below stays
    // `protoVersion: PROTOCOL_VERSION`, which preserves the version-bump
    // lockstep tsc tripwire: raising PROTOCOL_VERSION without updating
    // HelloMsg.protoVersion errors at that line. (Council R1 #1 —
    // quarantine-cast over relaxing the type to number.)
    return {
      kind: 'HELLO',
      playerId,
      color,
      protoVersion: override as typeof PROTOCOL_VERSION,
      ...(hostAttest !== undefined ? { hostAttest } : {}),
      ...(clientPubkeyB64 !== undefined ? { clientPubkeyB64 } : {}),
      ...(clientPubkeyPopB64 !== undefined ? { clientPubkeyPopB64 } : {}),
    };
  }
  return {
    kind: 'HELLO',
    playerId,
    color,
    protoVersion: PROTOCOL_VERSION,
    ...(hostAttest !== undefined ? { hostAttest } : {}),
    ...(clientPubkeyB64 !== undefined ? { clientPubkeyB64 } : {}),
    ...(clientPubkeyPopB64 !== undefined ? { clientPubkeyPopB64 } : {}),
  };
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
  /**
   * S118 P1 (host-migration D2) — the term/epoch this snapshot was emitted under. 0 (or absent =
   * treated as 0) for the ORIGINAL host's term; a migrated session (D3+) runs at epoch ≥ 1, letting a
   * survivor DROP late snapshots from a deposed zombie host (ClientSync epoch gate). ENVELOPE-ONLY —
   * it rides NetSnapshotMsg, NEVER enters NetSnapshot/save (save.replay stays byte-identical by
   * construction). ADDITIVE-OPTIONAL: PROTOCOL_VERSION held 14; the gate is PROVABLY inert at 0
   * (0 < 0 is false). D4 carry-forward: epoch-advance/reset + late-packet rules before activation.
   */
  readonly epoch?: number;
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
/**
 * S62 — a single authoritative seat assignment in the match roster. The host
 * mints the roster (seat 0 = host; seats 1..N-1 = remote peers in join order),
 * one entry per connected player, and ships the ORDERED array (by seat) so every
 * client constructs a byte-identical initial world (Council determinism fix:
 * ordered array, NOT a Map — iteration order can't diverge). Each client finds
 * its OWN entry by matching `peerId === selfId` to learn its seat + color.
 */
export interface RosterEntry {
  readonly seat: number;
  readonly peerId: string;
  readonly color: number;
  /**
   * S87 P4 — quickmatch readiness flag, attached by the HOST to the
   * LOBBY_PRESENCE roster in quickmatch rooms only (friends-lobby beacons
   * stay byte-identical). Additive-optional: absent = not-applicable (friends
   * lobby) or not-ready. Drives the joiner's "ready k/n" display; the
   * AUTHORITATIVE gate is host-side (isQuickmatchAllReady).
   */
  readonly ready?: boolean;
}

export interface StartGameMsg {
  readonly kind: 'START_GAME_SIGNAL';
  // Kept as the literal '1v1' value (the "networked mode" tag) for back-compat;
  // the actual player count is roster.length (2..MAX_PLAYERS). S62.
  readonly mode: '1v1';
  // S62 — seat→color roster for deterministic N-player seating. Ordered by seat.
  readonly roster: readonly RosterEntry[];
  /** S82 P4(a) — host attestation (additive-optional): lets a client whose HELLO was
   *  lost still verify + latch from the Begin signal itself (buffered until verified). */
  readonly hostAttest?: HostAttest;
  /**
   * S118 P1 (host-migration D2) — the host's SuccessionWarrant (net/successionWarrant.ts), signed at
   * Begin over the seat→pubkey roster ∩ proven-pubkey peers, so survivors can later verify a D3
   * MIGRATION_CLAIM chains to the room-code commitment. ADDITIVE-OPTIONAL (PROTOCOL_VERSION held 14);
   * a client that receives no/invalid warrant just can't be a successor (fail-open — instrument phase,
   * match proceeds). Seats without a proven pubkey are OMITTED (mixed-build tolerance, GROK R1 fix).
   */
  readonly warrant?: SuccessionWarrant;
}

/**
 * S70 P1 — lobby presence beacon. The host broadcasts the CURRENT occupied-seat
 * roster (seat 0 = host, seats 1..N = connected peers in join order) on every
 * peer join/leave during the LOBBY phase, so joiners render the TRUE per-seat
 * rack — their own seat (peerId === selfId), real per-seat colours, and accurate
 * drop-when-a-peer-leaves — instead of count-based occupancy.
 *
 * PURELY COSMETIC: the AUTHORITATIVE roster still ships only at Begin via
 * START_GAME_SIGNAL, so a peer that never receives (or cannot parse) this just
 * falls back to the count-based rack and plays normally. That is why NO
 * PROTOCOL_VERSION bump is needed (Council S70 Fork B): unlike the gameplay
 * envelopes (whose bumps prevent desync), a stale-build peer null-rejects this
 * unknown kind in parseNetMessage and degrades gracefully, rather than being
 * hard-rejected at the HELLO handshake for a non-gameplay message. Reuses the
 * RosterEntry shape + isValidRoster validator (no new wire-validation surface).
 */
interface LobbyPresenceMsg {
  readonly kind: 'LOBBY_PRESENCE';
  readonly roster: readonly RosterEntry[];
}

interface EndGameMsg {
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
interface GodlyTriggerMsg {
  readonly kind: 'GODLY_TRIGGER';
  readonly event: GodlyTriggerEvent;
}

/**
 * S87 P4 — quickmatch readiness toggle, CLIENT→HOST (the one lobby message a
 * client originates). The host records it per sender peerId (never trusts a
 * claimed identity — same posture as INTENT seat-stamping), mirrors the
 * aggregate back via LOBBY_PRESENCE roster.ready, and auto-Begins when every
 * seated player is ready and >=2 are present. Drives the PROTOCOL_VERSION
 * 7→8 bump (see above).
 */
/**
 * S122 P2 (host-migration D3) — a warranted survivor claims host succession after loss+grace
 * (HOST_MIGRATION_DESIGN.md §5). SEAM-GATED: production peers never emit one (main.ts gates
 * activation on __TEST_MIGRATION__), and pre-D3 peers null the unknown kind at parseNetMessage
 * (the LOBBY_PRESENCE Fork-B no-bump precedent) — PROTOCOL_VERSION held; D4 owns the bump at
 * default-on (S122 Council L4). The signature binds (roomCode ‖ epoch ‖ seat ‖ SENDER peerId)
 * under the pubkey the ORIGINAL host warranted for that seat (net/migrationClaim.ts).
 */
export interface MigrationClaimMsg {
  readonly kind: 'MIGRATION_CLAIM';
  /** The NEW term (survivors require currentEpoch + 1). */
  readonly epoch: number;
  /** The claimant's seat — must be the lowest warranted transport-alive seat. */
  readonly seat: number;
  readonly sigB64: string;
}

interface LobbyReadyMsg {
  readonly kind: 'LOBBY_READY';
  readonly ready: boolean;
}

export type NetMessage =
  | HelloMsg
  | IntentMsg
  | NetSnapshotMsg
  | StartGameMsg
  | EndGameMsg
  | GodlyTriggerMsg
  | LobbyPresenceMsg
  | LobbyReadyMsg
  | MigrationClaimMsg;

/**
 * 6-character alphanumeric room code (uppercase letters + digits, dropping
 * 0/O/1/I to avoid visual confusion when sharing verbally). Caller asks
 * Math.random() for entropy — fine for friends-only matchmaking (no
 * adversarial collision search worth defending against in v1).
 */
// S82 P4(a) — exported: net/hostIdentity.ts derives the room code from the host pubkey
// fingerprint over this SAME alphabet (single source of truth for the code charset).
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
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
  // S71 P1 — bomb hazard. TRIGGER_BOMB is the client→host intent (a joiner that
  // grabs the bomb); SPAWN_BOMB + DISSIPATE_BOMB are host-internal (listed here
  // only because this Record must mirror GameAction['type'] exhaustively — clients
  // never originate them, so wire-allowing them is inert under the friends-only model).
  SPAWN_BOMB: true,
  TRIGGER_BOMB: true,
  DISSIPATE_BOMB: true,
  // S72 P2 — Pac-Man hunter. ALL THREE are host-internal (host-authored + snapshot-
  // replicated; NOT client INTENTs — see hunters/hunterLifecycle.ts). Listed here
  // only because this Record must mirror GameAction['type'] exhaustively; clients
  // never originate them, so wire-allowing them is inert under the friends-only model
  // (a spoofed HUNTER_* would just advance host-authoritative deterministic state — no
  // desync). No PROTOCOL_VERSION bump: no NEW client intent — the S71 v4→5 bump stands.
  SPAWN_HUNTER: true,
  HUNTER_TICK: true,
  HUNTER_CATCH: true,
  // S72 P3 — potato bomb. PICKUP/PLACE/DROP_POTATO are client INTENTs (a joiner can
  // carry + plant a potato — wire-allowed); SPAWN_POTATO + POTATO_DETONATE are
  // host-internal (listed for the exhaustive Record mirror; inert as client intents).
  // NO PROTOCOL_VERSION bump — Council: the S71 v4->5 bump covers the P1/P2/P3 batch.
  SPAWN_POTATO: true,
  PICKUP_POTATO: true,
  PLACE_POTATO: true,
  DROP_POTATO: true,
  POTATO_DETONATE: true,
  DISSIPATE_POTATO: true, // S78 — host-internal: a FREE potato's fuse elapsed → harmless removal (mirrors DISSIPATE_BOMB; inert as a client intent).
  // S75 P3 — rainbow color-shuffle. TRIGGER_RAINBOW is the client→host intent (any player
  // clicking the rainbow); SPAWN_RAINBOW + DISSIPATE_RAINBOW are host-internal (spawner cadence /
  // TTL poll — listed for the exhaustive Record mirror; inert as client intents). PROTOCOL bumped
  // 5→6: the new TRIGGER_RAINBOW intent + the global colour remap would desync a stale v5 peer.
  SPAWN_RAINBOW: true,
  TRIGGER_RAINBOW: true,
  DISSIPATE_RAINBOW: true,
  // S77 P3 — seagull hazard. ALL FOUR are HOST-INTERNAL (host-authored + snapshot-replicated;
  // NOT client INTENTs — cleaning is host-detected avatar proximity, see seagulls/seagullLifecycle.ts).
  // Listed here only because this Record must mirror GameAction['type'] exhaustively; clients never
  // originate them, so wire-allowing them is inert under the friends-only model. PROTOCOL bumped 6→7:
  // the global income-affecting foul would confuse a stale v6 peer (see PROTOCOL_VERSION comment).
  SPAWN_SEAGULL: true,
  SEAGULL_TICK: true,
  POOP_TICK: true,
  CLEAN_POOP: true,
  // S82 P4(c) — host-internal mid-game drop-bench. Listed for the exhaustive Record
  // mirror ONLY; it is NOT in CLIENT_INTENT_TYPES below, so a client sending it as an
  // INTENT is dropped by the host's allowlist gate (hostHandlers.ts) — the first action
  // to rely on that gate rather than the "inert under friends-only" rationalization.
  BENCH_OFFLINE_PLAYER: true,
  // S93 — NONET solve submission (player-originated; also in CLIENT_INTENT_TYPES below).
  SUDOKU_SOLVED: true,
  // S100 P1 (TD Phase 1a) — creature-spawner lifecycle. BOTH are HOST-INTERNAL
  // (host-authored on ignition / re-validation; NOT client INTENTs — see
  // spawners/spawnerLifecycle.ts). Listed here ONLY because this Record must mirror
  // GameAction['type'] exhaustively; they are deliberately ABSENT from
  // CLIENT_INTENT_TYPES below, so a modified client sending one as an INTENT is dropped
  // by the host allowlist gate (BENCH_OFFLINE_PLAYER precedent). The PROTOCOL_VERSION
  // bump (9→10) for this feature is owned by the protocol layer, not this layer.
  REGISTER_SPAWNER: true,
  REMOVE_SPAWNER: true,
  // S102 #1 — a player raids an enemy SPAWN (right-click a chewer). A genuine client
  // INTENT (also in CLIENT_INTENT_TYPES below); the host charge-gates + enemy-checks it.
  RAID_CREATURE: true,
  // S103 P2 — generic defender lifecycle. ALL THREE are HOST-INTERNAL (host-authored on recipe
  // ignition / re-validation / per-tick FSM; NOT client INTENTs — defenders auto-build from
  // geometry). Listed here only because this Record must mirror GameAction['type'] exhaustively;
  // deliberately ABSENT from CLIENT_INTENT_TYPES so a modified client sending one is dropped by
  // the host allowlist gate. PROTOCOL bump (11->12) owned by the PROTOCOL_VERSION above.
  REGISTER_DEFENDER: true,
  REMOVE_DEFENDER: true,
  DEFENDER_TICK: true,
  // S113 Batch C — lightning-drone building. BOTH are HOST-INTERNAL (host-authored: a drone's
  // detonation / the hub's post-3-drone self-destruct; NOT client INTENTs). Listed here only because
  // this Record must mirror GameAction['type'] exhaustively; deliberately ABSENT from
  // CLIENT_INTENT_TYPES so a modified client sending one is dropped by the host allowlist gate.
  // PROTOCOL bump (13->14) owned by the PROTOCOL_VERSION above.
  DRONE_EXPLODE: true,
  STRUCTURE_SELFDESTRUCT: true,
};
const KNOWN_GAME_ACTION_TYPES: ReadonlySet<string> = new Set(
  Object.keys(KNOWN_GAME_ACTION_TYPES_RECORD),
);

/**
 * S82 P4(c) — CLIENT-INTENT ALLOWLIST (single source of truth — Council S82 Grok R2#2).
 * The Record above mirrors the FULL GameAction union for wire-shape validation, which
 * means a modified client could send HOST-INTERNAL actions (SPAWN_*, *_TICK, WIN_TRIGGER,
 * START_GAME, …) as INTENTs and the host would apply them (state-machine abuse: free
 * hazard spawns, forced win, mid-game restarts). This is the set of actions a player may
 * GENUINELY originate; the host's INTENT handler drops everything else (fail-closed).
 * `satisfies` keeps every key a real GameAction type — a typo or a renamed action errors
 * at typecheck. Adding a NEW player-facing intent requires adding it HERE (the unit test
 * in protocol.test.ts will remind you).
 */
const CLIENT_INTENT_TYPES_RECORD = {
  PICKUP_SPARK: true,
  DROP_SPARK: true,
  PLACE_PRIMITIVE: true, // legacy pre-S52 client placement — host re-pick path still validates it
  PLACE_FROM_FREE: true,
  SEVER_BOND: true,
  UPDATE_AVATAR_POS: true,
  SHRINK_TERRITORY: true,
  TRIGGER_BOMB: true,
  TRIGGER_RAINBOW: true,
  PICKUP_POTATO: true,
  PLACE_POTATO: true,
  DROP_POTATO: true,
  // S93 — NONET: a 1v1 client (joiner) submits its completed grid; host validates first-valid-wins.
  SUDOKU_SOLVED: true,
  // S102 #1 — a 1v1 client can raid an enemy chewer (right-click); host charge-gates + enemy-checks.
  RAID_CREATURE: true,
} as const satisfies Partial<Record<GameAction['type'], true>>;

export const CLIENT_INTENT_TYPES: ReadonlySet<string> = new Set(
  Object.keys(CLIENT_INTENT_TYPES_RECORD),
);

/** True iff a client may originate this action type as an INTENT (host-side gate). */
export function isClientIntentAllowed(actionType: string): boolean {
  return CLIENT_INTENT_TYPES.has(actionType);
}

const WIRE_SCHEMA_VERSION = 1;

/**
 * S70 P1 — shared seat-roster validator (extracted from the inline
 * START_GAME_SIGNAL check, now reused by LOBBY_PRESENCE — Council DRY). Fail-
 * closed: a non-array, empty array, an OVER-CAP array (> MAX_PLAYERS), or any
 * malformed entry rejects the whole message, so a corrupt/hostile peer can
 * neither desync the authoritative seating (START_GAME_SIGNAL) nor inject a bad
 * lobby rack (LOBBY_PRESENCE). A valid roster is a NON-EMPTY, at-most-MAX_PLAYERS
 * array of {seat:number, peerId:string, color:number}.
 *
 * S70 P1 CHECK (GROK-ANALYST): the ≤ MAX_PLAYERS cap is the fix for the "no length
 * cap" finding — a roster is bounded by the player cap by definition (the host
 * never builds a larger one), so an oversized array is malformed, and rejecting it
 * at the wire bounds the receive-side Map-build work against a flooding peer.
 */
function isValidRoster(roster: unknown): roster is readonly RosterEntry[] {
  if (!Array.isArray(roster) || roster.length === 0 || roster.length > MAX_PLAYERS) {
    return false;
  }
  for (const e of roster) {
    if (e === null || typeof e !== 'object') return false;
    const r = e as Record<string, unknown>;
    if (
      typeof r.seat !== 'number' ||
      typeof r.peerId !== 'string' ||
      typeof r.color !== 'number'
    ) {
      return false;
    }
    // S87 P4 — optional readiness flag: absent is fine; present-but-not-boolean
    // rejects the message (fail-closed, mirrors the hostAttest posture).
    if (r.ready !== undefined && typeof r.ready !== 'boolean') return false;
  }
  return true;
}

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
      // S82 P4(a) — optional attestation: absent is fine (client HELLOs); present but
      // malformed rejects the message (fail-closed — never hand a junk shape downstream).
      if (obj.hostAttest !== undefined && !isValidHostAttest(obj.hostAttest)) return null;
      // S115 P3 (host-migration D1) — optional joiner pubkey: absent is fine (host/legacy HELLOs);
      // present but non-string rejects (fail-closed, same posture as hostAttest).
      if (obj.clientPubkeyB64 !== undefined && typeof obj.clientPubkeyB64 !== 'string') return null;
      // S118 P1 (host-migration D2) — optional joiner PoP signature: absent is fine; present but
      // non-string rejects (fail-closed). Cryptographic verifyPubkeyPop runs host-side later.
      if (obj.clientPubkeyPopB64 !== undefined && typeof obj.clientPubkeyPopB64 !== 'string') return null;
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
      // S118 P1 (host-migration D2) — optional envelope epoch: absent is fine (legacy/original-term =
      // treated as 0); present but non-number rejects (fail-closed, same posture as the other optionals).
      if (obj.epoch !== undefined && typeof obj.epoch !== 'number') return null;
      return obj as unknown as NetSnapshotMsg;
    }
    case 'START_GAME_SIGNAL': {
      // S39 P1 — host→peer lobby-exit signal. Mode tag fixed at '1v1' (the
      // networked-mode marker); checked at the wire so a future mode addition
      // fails closed. S62 — also validate the seat roster (S70 P1: extracted to
      // isValidRoster). A malformed roster nulls the whole message (fail-closed)
      // so a corrupt peer can't desync seating.
      if (obj.mode !== '1v1') return null;
      if (!isValidRoster(obj.roster)) return null;
      // S82 P4(a) — optional attestation, same fail-closed posture as HELLO.
      if (obj.hostAttest !== undefined && !isValidHostAttest(obj.hostAttest)) return null;
      // S118 P1 (host-migration D2) — optional succession warrant: absent is fine (legacy/mixed-build
      // Begin); present but malformed rejects the whole message (fail-closed). Crypto verify runs later.
      if (obj.warrant !== undefined && !isValidWarrant(obj.warrant)) return null;
      return obj as unknown as StartGameMsg;
    }
    case 'LOBBY_PRESENCE': {
      // S70 P1 — cosmetic lobby seat roster (host→peer on join/leave). Same
      // fail-closed roster validation as START_GAME_SIGNAL; no mode tag. A
      // stale-build peer that predates this kind falls through to `default` →
      // null (graceful degradation — the no-version-bump path, Council Fork B).
      if (!isValidRoster(obj.roster)) return null;
      return obj as unknown as LobbyPresenceMsg;
    }
    case 'LOBBY_READY': {
      // S87 P4 — quickmatch readiness toggle (client→host). Boolean-strict.
      if (typeof obj.ready !== 'boolean') return null;
      return obj as unknown as LobbyReadyMsg;
    }
    case 'ENDGAME':
      return typeof obj.winnerId === 'number' ? (obj as unknown as EndGameMsg) : null;
    case 'GODLY_TRIGGER': {
      if (obj.event === null || typeof obj.event !== 'object') return null;
      const godlyId = (obj.event as Record<string, unknown>).godlyId;
      if (typeof godlyId !== 'string') return null;
      return obj as unknown as GodlyTriggerMsg;
    }
    case 'MIGRATION_CLAIM': {
      // S122 P2 (host-migration D3) — fail-closed shape gate; cryptographic verification
      // (warrant chain + sender binding) runs in the client handler. Bounds-checked ints so
      // a garbage epoch/seat can't reach the handlers.
      if (typeof obj.epoch !== 'number' || !Number.isInteger(obj.epoch) || obj.epoch < 1) return null;
      if (typeof obj.seat !== 'number' || !Number.isInteger(obj.seat) || obj.seat < 0) return null;
      if (typeof obj.sigB64 !== 'string') return null;
      return obj as unknown as MigrationClaimMsg;
    }
    default:
      return null;
  }
}
