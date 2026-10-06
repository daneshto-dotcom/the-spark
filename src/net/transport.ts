/**
 * SPARK — Trystero/@trystero-p2p multi-strategy transport adapter for
 * Phase-2 1v1 networking.
 *
 * S44 (2026-05-24) — Council R1+R2 Full-tier synthesis:
 *   - Migrated 0.24 umbrella `trystero` -> explicit `@trystero-p2p/{core,
 *     nostr,torrent,mqtt}@0.25.0` (Council C2 ADOPT-REVISE: full-migrate to
 *     escape version-skew + take real torrent/mqtt impls instead of the
 *     0.24 deprecation stubs).
 *   - Multi-strategy SIMULTANEOUS broadcast (PRIME-AUDIT Δ2 resolution
 *     alternative to Council C4 race-winner pick): all enabled strategies
 *     stay active; NetMessages broadcast on all; app-layer dedups by
 *     NETSNAPSHOT.snapshotSeq / INTENT timestamp / HELLO idempotency.
 *     Obsoletes Δ3 mid-session zombie (no single transport failure ends
 *     the session). Cost: 2-3x bandwidth on small messages = negligible
 *     (10 Hz * ~50 bytes per NETSNAPSHOT = <5 KB/s aggregate).
 *   - STRATEGY_FLAGS gate dynamic imports (Council S3γ lazy-load): nostr
 *     eager (primary), torrent + mqtt deferred behind dynamic import so
 *     OFF strategies contribute zero bytes to initial bundle.
 *   - Per-strategy + per-relay telemetry surfaces in NetDiagnostics.
 *   - peerJoin dedups by peerId (Trystero selfId is consistent across
 *     strategies for the same peer — confirmed via @trystero-p2p/core
 *     0.25 types) so a peer that arrives on Nostr + Torrent counts once.
 *   - Carry-forward (handoff): mid-session degraded-strategy explicit
 *     teardown (Council Δ3 architectural follow-on).
 *
 * Public API preserved for main.ts / lobbyScreen.ts:
 *   connect(roomCode) -> opens enabled strategies
 *   send(msg)         -> broadcasts NetMessage on every active strategy
 *   on(handler)       -> receives NetMessages (deduped per-peer at the
 *                        transport boundary)
 *   onPeerChange      -> fires once per peerId regardless of strategy count
 *   peerCount         -> distinct peer count across all strategies
 *   isConnected       -> any strategy has >= 1 peer
 *   getDiagnostics    -> NetDiagnostics (extended with strategies array)
 *   disconnect        -> tears down all strategies
 *   onError           -> error sink (signaling / send / parse failures)
 */

import {
  joinRoom as joinNostr,
  getRelaySockets as getNostrSockets,
  selfId,
} from '@trystero-p2p/nostr';
import type { MessageAction, Room } from '@trystero-p2p/core';
import { parseNetMessage, PROTOCOL_VERSION, type NetMessage } from './protocol.ts';
import { netStats } from './netStats.ts';
import { stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import {
  APP_ID,
  HANDSHAKE_TIMEOUT_MS,
  ICE_POLL_INTERVAL_MS,
  ICE_POLL_MAX_DURATION_MS,
  ICE_SERVERS,
  NOSTR_RELAYS,
  SNAPSHOT_SINGLE_STRATEGY,
  SNAPSHOT_STRATEGY_PREFERENCE,
  STRATEGY_FLAGS,
  TORRENT_TRACKERS,
  classifyJoinError,
  type StrategyName,
} from './iceConfig.ts';
import { POOL_SAFE_PC } from './poolSafePeerConnection.ts';
import {
  HOST_RING,
  JOINER_RING,
  KEYFRAME_INTERVAL,
  KEY_REQUEST_MIN_MS,
  SNAPSHOT_CODEC_ENABLED,
  applyDelta,
  buildSnapAck,
  canDeflate,
  encodeDelta,
  packFrame,
  parseSnapAck,
  readDeltaHeader,
  segmentSnapshotMessage,
  segmentsToText,
  unpackFrame,
  type Segments,
} from './snapshotCodec.ts';

export { classifyJoinError };

/**
 * ⭐ S189 (C4) — a leave() in flight, per room code, shared by every NetTransport on the page (the
 * reconnect loop makes a NEW transport for the same code). See the note in `connect()`.
 */
const pendingLeaves = new Map<string, Promise<unknown>>();
/**
 * The longest a connect() waits for that leave. MINE, not the owner's: a normal leave settles in
 * ~100 ms (one leave message + Trystero's 99 ms sleep); the cap only matters for a leave message
 * queued behind a congested channel, and it must not hold a rejoin hostage.
 */
export const PENDING_LEAVE_CAP_MS = 2_000;
/**
 * ⛔ S189 (C4) — every room this page has called `leave()` on. A room must be left ONCE: a second
 * `leave()` runs Trystero's `onSelfLeave` again, which deletes the registry entry and Nostr topic
 * subscriptions KEYED BY ROOM ID — i.e. the NEWER room's, if one has joined that code since
 * (verified S189 against nostr 0.25.2 by the disconnect hunt, finding A2). And a room that is still
 * leaving must never be adopted by a new join.
 */
const leavingRooms = new WeakSet<object>();
/**
 * ⭐ S195 (net-delta) — the snapshot frame id, PAGE-unique (module scope, never reset). A joiner keys
 * its rebuilt frames by (sender peerId, fid); a sender's peerId is per page load, so a host that
 * reconnects (a NEW NetTransport, same peerId) can never reuse an fid the joiner still holds from
 * its previous transport, and a late ack from before the reconnect can never name the wrong frame.
 */
let nextSnapFid = 1;

/**
 * ⭐ S195 — one snapshot waiting for, or in, a per-peer slot. `segs` is the codec's view (null when
 * the codec is off or the message is not snapshot-shaped); `legacy()` the pre-S195 wire string,
 * built at most once and only if some handle has no binary action.
 */
interface SnapJob {
  readonly fid: number;
  readonly segs: Segments | null;
  readonly legacy: () => string;
}

/** ⭐ S195 — what the host knows about one receiving peer (across strategies). */
interface TxPeer {
  /** Newest frame this peer said it rebuilt (0 = none yet). */
  ackFid: number;
  /** It said it can inflate a deflated frame. */
  inflate: boolean;
  /** It asked for a keyframe (no usable base). */
  needKey: boolean;
  /** Frames sent to it since its last keyframe. */
  sinceKey: number;
}

/** ⭐ S195 — what a joiner keeps per SENDER: its rebuilt frames, oldest first. */
interface RxPeer {
  readonly ring: Map<number, Segments>;
  lastFid: number;
  /** Frames are decoded strictly one after another, in arrival order (inflate is async). */
  chain: Promise<void>;
  lastKeyRequestMs: number;
}
// S62 — re-export Trystero's local peer id so net handlers can self-identify in
// the broadcast roster (each client matches its own seat by peerId === selfId).
// selfId is a stable per-page-load constant, identical across all strategies.
export { selfId };

/** S182 LEVER 1 — the per-strategy facts `pickSnapshotStrategy` routes on. */
export interface StrategyRouteInfo {
  readonly name: StrategyName;
  /** Has a bound `MessageAction` — i.e. it can actually send. */
  readonly ready: boolean;
  /** Peers this strategy currently sees. Zero means it is carrying nobody. */
  readonly peerCount: number;
}

/**
 * S182 LEVER 1 — choose the ONE strategy that carries high-rate `NETSNAPSHOT` traffic, or `null`
 * to fall back to broadcasting on all of them.
 *
 * Pure + exported so the routing decision is unit-testable without a live Trystero room — the same
 * pattern as `detectProtocolMismatch` and `handleRawMessage` above, and for the same reason: this is
 * the half of the change that can silently cost the owner a playable match.
 *
 * THE RULES, in order:
 *   1. Prefer the first strategy in `SNAPSHOT_STRATEGY_PREFERENCE` that is READY **and carries EVERY
 *      peer at the table** (`peerCount >= totalPeers`). Readiness alone is not enough — a strategy
 *      that joined the room but never completed a handshake would swallow every snapshot into nothing.
 *   2. ⭐ Otherwise return `null` and broadcast, the pre-S182 behaviour. This is the deliberately
 *      conservative arm and it covers both "nobody is visible anywhere" and "no single strategy
 *      reaches the whole table". It costs nothing when there are no peers, because then there is no
 *      traffic to double either.
 *
 * ## ⛔ WHY THE TEST IS FULL COVERAGE AND NOT `peerCount > 0` — A REAL BUG, CAUGHT IN AUDIT
 *
 * The first cut asked only "does this strategy have A peer". `StrategyHandle.peers` is PER-STRATEGY
 * and is a subset of `NetTransport.peerSet`, the union across strategies, and Trystero's
 * `action.send()` reaches only the peers attached to THAT strategy's room. So with nostr carrying
 * {A} and torrent carrying {A, B} — perfectly ordinary, since the two are independent signalling
 * paths — the router chose nostr and **peer B received zero snapshots for the whole match**. Its
 * board would freeze completely: exactly the symptom this branch exists to remove, caused by the fix
 * for it, and invisible in the 1v1 the brief is written around.
 *
 * `MAX_PLAYERS` is 4, so 3- and 4-seat matches are in scope and this was not hypothetical. The brief
 * says "fail over to torrent if nostr loses the peer" — singular — which is the 1v1 framing that hid
 * it. Three independent audit lanes flagged it; one verifier waved it off as "inert, the flag is
 * off", which is a statement about the blast radius today, not a refutation of the defect in a
 * mechanism the owner is being asked to approve.
 *
 * Called per send, so a strategy that loses a peer is abandoned on the next snapshot (≤100 ms at
 * `NET_SNAPSHOT_HZ`). ⚠ It still cannot detect a strategy that REPORTS its peers while delivering
 * nothing; see the `SNAPSHOT_SINGLE_STRATEGY` docblock on that residual risk.
 */
export function pickSnapshotStrategy(
  strategies: ReadonlyArray<StrategyRouteInfo>,
  totalPeers: number,
): StrategyName | null {
  if (totalPeers <= 0) return null;
  for (const preferred of SNAPSHOT_STRATEGY_PREFERENCE) {
    const match = strategies.find((s) => s.name === preferred);
    // ⛔ `>= totalPeers`, NOT `> 0`. Per-strategy `peers` is a SUBSET of the union `peerSet`, so a
    // strategy carrying only some of the table cannot carry the snapshot for the rest.
    if (match !== undefined && match.ready && match.peerCount >= totalPeers) return preferred;
  }
  return null;
}

export type PeerChangeHandler = (peerId: string, kind: 'join' | 'leave') => void;
export type MessageHandler = (msg: NetMessage, peerId: string) => void;
export type ErrorHandler = (msg: string) => void;

interface RelayDiagnostic {
  readonly url: string;
  readonly connected: boolean;
}

interface StrategyDiagnostic {
  readonly name: StrategyName;
  readonly state: 'starting' | 'ready' | 'failed' | 'disabled';
  readonly peerCount: number;
  readonly relays: ReadonlyArray<RelayDiagnostic>;
  readonly lastError: string | null;
  /** ⭐ S192 T1 — distinct peers whose link failed on this strategy (per-peer, not a strategy failure). */
  readonly peerJoinFailures?: number;
}

export interface NetDiagnostics {
  readonly accepted: number;
  readonly rejected: number;
  readonly lastSeq: number;
  readonly lastKind: string | null;
  readonly strategies: ReadonlyArray<StrategyDiagnostic>;
}

interface StrategyHandle {
  name: StrategyName;
  room: Room | null;
  action: MessageAction<string> | null;
  state: 'starting' | 'ready' | 'failed' | 'disabled';
  peers: Set<string>;
  relayUrls: string[];
  getSockets: (() => unknown) | null;
  lastError: string | null;
  /**
   * ⭐ S192 T1 — peers whose connection failed ON THIS STRATEGY (Trystero `onJoinError`, a per-peer
   * report). OPTIONAL so test-injected handles read as "none". Deliberately NOT `state`: see
   * `onPeerJoinError`.
   */
  peerJoinFailures?: Set<string>;
  icePollTimer: ReturnType<typeof setInterval> | null;
  icePollStartMs: number;
  /**
   * ⭐ S189 — snapshot backpressure, PER PEER on this strategy: is a NETSNAPSHOT still being handed to
   * Trystero for that peer, and the newest one waiting behind it. OPTIONAL so a handle built without
   * it (tests inject handles directly) reads as "idle, nothing waiting". See `sendSnapshotOn`.
   */
  snapSlots?: Map<string, { inFlight: boolean; pending: SnapJob | null }>;
  /** Snapshots superseded before they were sent, summed over peers — how a starved uplink shows up. */
  snapSkipped?: number;
  /**
   * ⭐ S195 — the BINARY snapshot action (`snap`, delta + deflate frames) and the ack action (`sack`).
   * OPTIONAL: a handle without them (test fakes, SNAPSHOT_CODEC_ENABLED off) sends the legacy string.
   */
  snapAction?: MessageAction<Uint8Array> | null;
  ackAction?: MessageAction<string> | null;
}

type JoinFn = (
  config: Parameters<typeof joinNostr>[0],
  roomId: string,
  callbacks?: Parameters<typeof joinNostr>[2],
) => Room;

/**
 * S53 P1 — pure helper detecting HELLO + protoVersion mismatch.
 *
 * Council R1 Battle Ledger (Gemini #4 ADOPT + Gemini #5 PARTIAL — inline
 * type-guard for HELLO shape): loosened predicate. ANY non-PROTOCOL_VERSION
 * value at `parsed.protoVersion` on a `kind:'HELLO'` message counts as a
 * mismatch — including `undefined` (truly-ancient peer omitted the field),
 * `null`, strings, or wrong numbers. Returns the offending value verbatim
 * so the diagnostic UX can string-coerce it for the user-visible message.
 *
 * Exported for unit testing (S10 #test-via-pure-helper-export pattern) —
 * the live `NetTransport.startStrategy` closure invokes this helper inside
 * its per-strategy `action.onMessage` handler. Pure function = no mocks of
 * Trystero rooms required to validate the predicate.
 *
 * Used by `NetTransport` to:
 *   1. Drop the mismatched HELLO before parseNetMessage (which would also
 *      null-reject, but with no diagnostic surface).
 *   2. Add the sender peerId to `protocolMismatchPeers` so ALL subsequent
 *      messages from that peer are dropped at the transport boundary
 *      (Council R1 Grok #4 + Gemini #2 CONVERGENT BLOCKER resolution —
 *      closes the v2-peer-INTENT-bypass-after-failed-HELLO gap).
 */
/**
 * S54 P2 (M4) — narrowing type-guard replacing the prior
 * `parsed as Record<string, unknown>` cast in detectProtocolMismatch. A real
 * guard makes the property reads below type-safe (no assertion) and documents
 * the single shape assumption — any non-null object, incl. arrays (which
 * correctly fall through as `kind !== 'HELLO'`).
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * ⭐ S189 (C4, hunt E3) — WHY did a peer drop? Read from its peer connection's LAST observed state:
 * a connection that had gone `disconnected` / `failed` / `closed` means the NETWORK died (Trystero's
 * ICE lifecycle drops it: disconnected for 5 s, failed, closed, channel close); one still healthy when
 * the peer vanished means the peer LEFT (a leave message — tab close, BACK TO MAIN, double-Escape).
 * No observed state is `unknown`, never a guess.
 */
export type PeerDropCause = 'network-died' | 'peer-left' | 'unknown';
const DEAD_PC_STATES = new Set(['disconnected', 'failed', 'closed']);
const LIVE_PC_STATES = new Set(['connected', 'completed']);
export function classifyPeerDrop(conn: string | null, ice: string | null): PeerDropCause {
  if ((conn !== null && DEAD_PC_STATES.has(conn)) || (ice !== null && DEAD_PC_STATES.has(ice))) {
    return 'network-died';
  }
  if (conn !== null && ice !== null && LIVE_PC_STATES.has(conn) && LIVE_PC_STATES.has(ice)) return 'peer-left';
  return 'unknown';
}

export function detectProtocolMismatch(
  parsed: unknown,
): { mismatch: true; version: unknown } | { mismatch: false } {
  if (!isObjectRecord(parsed)) return { mismatch: false };
  if (parsed.kind !== 'HELLO') return { mismatch: false };
  if (parsed.protoVersion === PROTOCOL_VERSION) return { mismatch: false };
  return { mismatch: true, version: parsed.protoVersion };
}

export class NetTransport {
  private strategies: Map<StrategyName, StrategyHandle> = new Map();
  private messageHandlers: MessageHandler[] = [];
  private peerHandlers: PeerChangeHandler[] = [];
  private peerSet: Set<string> = new Set();
  private acceptedCount = 0;
  private rejectedCount = 0;
  private lastSeq = 0;
  private lastKind: string | null = null;
  private connected = false;
  /** ⭐ S189 — the room this transport joined, so `disconnect()` can register its leave. */
  private roomCode: string | null = null;
  /** ⭐ S189 — bumped by every connect()/disconnect(): a deferred start from an older one is void. */
  private connectGen = 0;
  /** ⭐ S189 (E3) — each strategy×peer connection's last observed state, for the drop line. */
  private readonly pcState = new Map<string, { conn: string; ice: string }>();
  /** ⭐ S189 (E3) — when each peer last sent us anything (performance.now()). */
  private readonly lastRxAtMs = new Map<string, number>();
  /** ⭐ S195 — host side of the snapshot codec: per receiving peer, and the frames it may delta against. */
  private readonly txPeers = new Map<string, TxPeer>();
  private readonly txRing = new Map<number, Segments>();
  private lastTxSegs: Segments | null = null;
  /** Encoded frames for the newest fids, keyed `fid|base|z` — peers sharing a base share the work. */
  private readonly encodeMemo = new Map<string, Promise<Uint8Array>>();
  /** ⭐ S195 — joiner side: per sender, the frames rebuilt from its deltas. */
  private readonly rxPeers = new Map<string, RxPeer>();
  /** ⭐ S195 audit F2 — the one sender whose frames may be kept as bases (see `decodeSnapFrame`). */
  private rxSource: string | null = null;

  public onError: ErrorHandler | null = null;

  /**
   * S53 P1 — Protocol-mismatch UX diagnostic callback. Fires once per peer
   * (per-peer latch ensures idempotency across multi-strategy fan-out) when
   * that peer's HELLO carries a protoVersion ≠ PROTOCOL_VERSION (current=3).
   * `peerVersion` is the offending value verbatim (number / undefined / string
   * / null) — UI string-coerces via `String(v)` for user display.
   *
   * Wired in main.ts to lobbyScreen.setErrorMessage with refresh-prompt text.
   * Set to null = silent (default; preserves pre-S53 behavior).
   */
  public onProtocolMismatch: ((peerVersion: unknown) => void) | null = null;

  /**
   * S53 P1 — per-peer protocol-mismatch latch (Council R1 Grok #4 + Gemini #2
   * CONVERGENT BLOCKER resolution). Once a peer's HELLO is rejected for
   * protoVersion mismatch, that peer's peerId is added here; ALL subsequent
   * messages from that peerId are dropped at the transport boundary
   * (`rejectedCount` incremented, no further routing). Closes the
   * v2-peer-INTENT-bypass gap where a stale-build peer could send
   * INTENT(PICKUP_SPARK) after HELLO null-reject and the allowlist would
   * still accept it (action type is in KNOWN_GAME_ACTION_TYPES_RECORD), then
   * the host would apply → desync.
   *
   * Cleared on disconnect() (lifecycle = single NetTransport instance). A
   * peer rejoining with a new peerId re-checks via fresh HELLO (correct);
   * same peerId rejoining (rare Trystero behavior) inherits the ban (also
   * correct — still stale build until they refresh).
   */
  private protocolMismatchPeers: Set<string> = new Set();

  private emitError(msg: string): void {
    console.error('[net] error:', msg);
    if (this.onError !== null) this.onError(msg);
  }

  private emitProtocolMismatch(peerId: string, peerVersion: unknown): void {
    // Idempotency latch — only fire the callback ONCE per peer regardless of
    // how many mismatched HELLOs the peer sends or how many strategies the
    // duplicate-routed envelope landed on. UI text is set-not-toggle so the
    // user sees a single stable error message.
    if (this.protocolMismatchPeers.has(peerId)) return;
    this.protocolMismatchPeers.add(peerId);
    console.warn(
      `[net] protocol mismatch peer=${peerId} peerVersion=${String(peerVersion)} local=v${PROTOCOL_VERSION}`,
    );
    if (this.onProtocolMismatch !== null) this.onProtocolMismatch(peerVersion);
  }

  /**
   * S54 P1 — single inbound-message entry point, invoked by every strategy's
   * `action.onMessage` closure. Extracted from the inline closure (Council R1
   * #6: Grok R8 HIGH + Gemini ch.3 CONVERGENT) so the receive path — JSON
   * parse → per-peer drop latch → protocol-mismatch sniff → parseNetMessage →
   * handler fan-out — becomes unit-testable WITHOUT a live Trystero room (the
   * file header's long-standing limitation). PURE REFACTOR: behavior is
   * identical to the pre-S54 closure. `strategyName` is diagnostic-only (the
   * rejected-message warn); defaults to '' so tests can omit it.
   *
   * This is the RECEIVE half of the S53/S54 protocol-mismatch system:
   * detectProtocolMismatch runs BEFORE parseNetMessage so a different-version
   * peer's HELLO (now actually SENT by buildHello/wireHelloOnJoin as of S54
   * P1) fires onProtocolMismatch + latches the peer, dropping ALL of its
   * subsequent messages.
   */
  handleRawMessage(data: string, peerId: string, strategyName = '', countBytes = true): boolean {
    this.lastRxAtMs.set(peerId, performance.now()); // ⭐ S189 (E3) — for the drop line's lastRxAgoMs
    // S182 STEP 0 — count inbound bytes BEFORE the parse and before any gate, so the reading
    // includes the redundant second-strategy copy. That copy is not free on the joiner: it is a
    // full JSON.parse of a ~100 KiB payload that is then discarded on ClientSync's seq gate.
    // ⭐ S195 — a snapshot rebuilt from a codec frame was counted at its WIRE size when the frame
    // arrived (`onSnapFrame`), so it passes countBytes=false: the reading stays the network's.
    if (countBytes && netStats.isEnabled()) netStats.recordReceive(data.length, performance.now());
    // Parse on the receive boundary so malformed peer messages don't
    // poison handlers (Audit Pass-1 fix d3f0e22b preserved).
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emitError(
        `Malformed peer message from ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
    // S53 P1 — per-peer protocol-mismatch latch (Council R1 Grok #4 +
    // Gemini #2 CONVERGENT BLOCKER). Drop ALL subsequent messages from a
    // peer once their HELLO failed the protoVersion check — including
    // INTENTs whose action.type would otherwise pass the in-process
    // KNOWN_GAME_ACTION_TYPES_RECORD allowlist. Closes the
    // stale-build-peer-injection desync hazard.
    if (this.protocolMismatchPeers.has(peerId)) {
      this.rejectedCount++;
      return false;
    }
    // S53 P1 — HELLO protoVersion sniff BEFORE parseNetMessage (which
    // also null-rejects but with no diagnostic surface). On detect: fire
    // onProtocolMismatch + add peerId to latch + early-return. Gemini #3
    // ADOPT (early-return instead of fall-through). Loosened predicate
    // per Gemini #4 ADOPT — missing/wrong-type protoVersion ALSO counts
    // as mismatch (catches truly-ancient peers).
    const protoCheck = detectProtocolMismatch(parsed);
    if (protoCheck.mismatch) {
      this.emitProtocolMismatch(peerId, protoCheck.version);
      this.rejectedCount++;
      return false;
    }
    const msg = parseNetMessage(parsed);
    if (msg === null) {
      this.rejectedCount++;
      console.warn('[net]', strategyName, 'rejected malformed NetMessage from', peerId, parsed);
      return false;
    }
    this.acceptedCount++;
    this.lastKind = msg.kind;
    if (msg.kind === 'NETSNAPSHOT') this.lastSeq = msg.snapshotSeq;
    // App-layer dedup: NETSNAPSHOTs are idempotent (snapshotSeq monotonic),
    // INTENTs are timestamped, HELLO is idempotent. Duplicate delivery from
    // a second strategy is harmless. Routing through full handler list.
    for (const h of this.messageHandlers) h(msg, peerId);
    return true;
  }

  connect(roomCode: string): void {
    if (this.connected) {
      throw new Error('NetTransport already connected; call disconnect() first');
    }
    this.connected = true;
    this.roomCode = roomCode;
    const gen = ++this.connectGen;
    console.info(
      `[net] connect: roomCode=${roomCode} appId=${APP_ID} ice=${ICE_SERVERS.length} ` +
        `strategies=[${Object.entries(STRATEGY_FLAGS)
          .filter(([, on]) => on)
          .map(([n]) => n)
          .join(',')}]`,
    );
    /*
     * ⛔⛔ S189 (C4) — **NEVER JOIN A ROOM THAT IS STILL LEAVING.**
     *
     * Trystero's `joinRoom` returns the room ALREADY registered under that id (`strategy.mjs`:
     * `if (occupiedRooms[appId]?.[roomId]) return occupiedRooms[appId][roomId]`), and a room stays
     * registered until its async `leave()` finishes — `await leaveAction.send("")`, a 99 ms sleep,
     * THEN `onSelfLeave` unregisters it (`room.mjs`). `disconnect()` fires `leave()` without waiting,
     * and the reconnect loop and the migration rejoin both call `disconnect()` then `connect()` on the
     * SAME code back to back — so the new transport bound itself to the dying room and could never
     * see a peer. Reproduced over real WebRTC (`e2e/reconnect-hard-blip.spec.ts`).
     *
     * So a connect to a code with a leave in flight waits for that leave (capped — a leave queued
     * behind a congested channel must not hold the rejoin hostage), then starts. `connected` is true
     * throughout, so `send()` in that window takes the ordinary startup path: no strategy yet, dropped
     * with a warn — the same as the first ~100 ms of any join.
     */
    const pending = pendingLeaves.get(roomCode);
    if (pending !== undefined) {
      console.info(`[net] connect: waiting for the previous leave of ${roomCode} to finish`);
      void Promise.race([pending, new Promise((r) => setTimeout(r, PENDING_LEAVE_CAP_MS))]).then(() => {
        if (this.connected && this.connectGen === gen) this.startAllStrategies(roomCode);
      });
      return;
    }
    this.startAllStrategies(roomCode);
  }

  /** The body of `connect()` — every enabled strategy joins `roomCode`. */
  private startAllStrategies(roomCode: string): void {
    // ⚠ S189 — the chunk-load callbacks below check the GENERATION, not just `connected`: a
    // disconnect()+connect() inside one chunk load (the reconnect loop does exactly that) made the
    // OLD callback see `connected === true` and start a second, orphaned torrent room.
    const gen = this.connectGen;
    // Nostr — primary, always-on, eager static import.
    if (STRATEGY_FLAGS.nostr) {
      this.startStrategy(
        'nostr',
        roomCode,
        joinNostr as JoinFn,
        NOSTR_RELAYS,
        getNostrSockets as unknown as () => unknown,
      );
    }

    // Torrent — Council Option C fallback, dynamic-import to defer cost.
    if (STRATEGY_FLAGS.torrent) {
      void import('@trystero-p2p/torrent')
        .then((mod) => {
          if (!this.connected || this.connectGen !== gen) return;
          this.startStrategy(
            'torrent',
            roomCode,
            mod.joinRoom as JoinFn,
            TORRENT_TRACKERS,
            mod.getRelaySockets as unknown as () => unknown,
          );
        })
        .catch((err) => {
          this.markStrategyFailed(
            'torrent',
            `chunk load failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // MQTT — Council R2 S1δ default-OFF; operator opts in via STRATEGY_FLAGS.
    if (STRATEGY_FLAGS.mqtt) {
      void import('@trystero-p2p/mqtt')
        .then((mod) => {
          if (!this.connected || this.connectGen !== gen) return;
          this.startStrategy(
            'mqtt',
            roomCode,
            mod.joinRoom as JoinFn,
            [],
            mod.getRelaySockets as unknown as () => unknown,
          );
        })
        .catch((err) => {
          this.markStrategyFailed(
            'mqtt',
            `chunk load failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  private startStrategy(
    name: StrategyName,
    roomCode: string,
    joinFn: JoinFn,
    relayUrls: string[],
    getSockets: (() => unknown) | null,
  ): void {
    const handle: StrategyHandle = {
      name,
      room: null,
      action: null,
      state: 'starting',
      peers: new Set(),
      relayUrls,
      getSockets,
      lastError: null,
      icePollTimer: null,
      icePollStartMs: 0,
    };
    this.strategies.set(name, handle);

    try {
      const relayConfig = relayUrls.length > 0
        ? { urls: relayUrls, redundancy: relayUrls.length }
        : undefined;

      const room = joinFn(
        {
          appId: APP_ID,
          ...(relayConfig !== null && relayConfig !== undefined ? { relayConfig } : {}),
          rtcConfig: {
            iceServers: ICE_SERVERS,
            iceTransportPolicy: 'all',
          },
          // ⛔ S192 T1 — the pool-safe PC (never rolls back an unanswered pooled offer). Without it a
          // pooled offer > 57.3 s old is restarted into an EMPTY offer and the late joiner's link
          // is dead. See `poolSafePeerConnection.ts`; `trysteroPolyfill.test.ts` pins every site.
          rtcPolyfill: POOL_SAFE_PC,
          trickleIce: true,
        },
        roomCode,
        {
          handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
          onJoinError: (details) => this.onPeerJoinError(handle, details),
          onPeerHandshake: async (peerId, _send, _receive, isInitiator) => {
            console.info(
              `[net] ${name} onPeerHandshake peer=${peerId} isInitiator=${isInitiator}`,
            );
          },
        },
      );

      // ⛔ S189 (C4) — Trystero hands back a room still registered under this id. If that room is one
      // we are LEAVING (the leave outlived PENDING_LEAVE_CAP_MS), adopting it binds this transport to a
      // room that is about to go deaf. Refuse; the reconnect loop's next attempt joins a fresh one.
      if (leavingRooms.has(room)) {
        throw new Error('the room is still leaving — refusing to adopt it (S189)');
      }
      handle.room = room;
      handle.state = 'ready';

      // makeAction returns an object in 0.25 (was 3-tuple in 0.24).
      const action = room.makeAction<string>('msg') as MessageAction<string>;
      handle.action = action;
      // S54 P1 — delegate to the extracted, unit-testable receive seam
      // (handleRawMessage). The closure stays minimal: it only adapts
      // Trystero's (data, ctx) shape to (data, peerId, strategyName).
      action.onMessage = (data, ctx) => {
        this.handleRawMessage(data, ctx.peerId, name);
      };
      // ⭐ S195 (net-delta) — the snapshot codec's two actions. Names are ≤ 12 bytes (Trystero limit).
      if (SNAPSHOT_CODEC_ENABLED) {
        const snapAction = room.makeAction<Uint8Array>('snap') as MessageAction<Uint8Array>;
        const ackAction = room.makeAction<string>('sack') as MessageAction<string>;
        handle.snapAction = snapAction;
        handle.ackAction = ackAction;
        snapAction.onMessage = (data, ctx) => this.onSnapFrame(data, ctx.peerId, name);
        ackAction.onMessage = (data, ctx) => this.onSnapAck(data, ctx.peerId);
      }

      room.onPeerJoin = (peerId) => {
        console.info(`[net] ${name} onPeerJoin: ${peerId} strategyPeers=${handle.peers.size + 1}`);
        handle.peers.add(peerId);
        // S192 audit L1 — it connected, so every recorded failure for it is history.
        this.clearPeerJoinFailures(peerId);
        this.stopIcePoll(handle);
        this.watchPeerConnection(handle, peerId);
        // Dedup at transport boundary — only fire onPeerChange the first
        // time we see this peerId across all strategies.
        // ⭐ S195 — tell this peer, before it sends us a single snapshot, whether we can inflate: a
        // late joiner's first keyframe (the whole board, ~120 KiB at wave 10) then goes out deflated.
        this.sendSnapAck(handle, peerId, 0, false);
        if (!this.peerSet.has(peerId)) {
          this.peerSet.add(peerId);
          for (const h of this.peerHandlers) h(peerId, 'join');
        } else {
          console.info(`[net] ${name} duplicate join for ${peerId} — already known`);
        }
      };

      room.onPeerLeave = (peerId) => {
        console.info(`[net] ${name} onPeerLeave: ${peerId}`);
        this.logPeerDrop(name, peerId);
        handle.peers.delete(peerId);
        handle.snapSlots?.delete(peerId); // ⭐ S189 — its snapshot slot goes with it
        // Only fire leave when ALL strategies have lost this peer.
        const stillSeenElsewhere = Array.from(this.strategies.values()).some(
          (s) => s.peers.has(peerId),
        );
        if (!stillSeenElsewhere && this.peerSet.has(peerId)) {
          this.peerSet.delete(peerId);
          // S53 P1 (CHECK Gemini M2 ADOPT) — defensive hygiene: clear the
          // protocol-mismatch latch entry for a peer who has fully left the
          // room (across all strategies). Trystero assigns a fresh peerId
          // on browser refresh so the latch entry is effectively orphaned
          // after onPeerLeave; this delete prevents unbounded growth across
          // a long-lived session (e.g. host with many transient v2 joiners
          // mid-deploy window). No functional impact on live paths — the
          // mismatched peer cannot re-emerge with the same peerId.
          this.protocolMismatchPeers.delete(peerId);
          // ⭐ S195 — its codec state goes with it: a rejoin starts from a keyframe both ways.
          this.txPeers.delete(peerId);
          this.rxPeers.delete(peerId);
          if (this.rxSource === peerId) this.rxSource = null;
          for (const h of this.peerHandlers) h(peerId, 'leave');
        }
      };

      // Log relay socket attachment count post-bind (Council ADOPT-G).
      try {
        if (typeof handle.getSockets === 'function') {
          const sockets = handle.getSockets();
          const count =
            sockets !== null && typeof sockets === 'object'
              ? Object.keys(sockets as Record<string, unknown>).length
              : 0;
          console.info(`[net] ${name} relay sockets attached:`, count);
        }
      } catch (err) {
        console.warn(`[net] ${name} getRelaySockets probe failed:`, err);
      }

      this.startIcePoll(handle);
    } catch (err) {
      this.markStrategyFailed(
        name,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private markStrategyFailed(name: StrategyName, errMsg: string): void {
    const handle = this.strategies.get(name) ?? {
      name,
      room: null,
      action: null,
      state: 'failed' as const,
      peers: new Set<string>(),
      relayUrls: [],
      getSockets: null,
      lastError: null,
      icePollTimer: null,
      icePollStartMs: 0,
    };
    handle.state = 'failed';
    handle.lastError = errMsg;
    this.strategies.set(name, handle);
    console.error(`[net] strategy ${name} failed:`, errMsg);
    if (this.allStrategiesFailed()) {
      this.emitError(`[${name}] ${errMsg}`);
      return;
    }
    // ⛔ S192 audit F1 — a strategy dying can turn an earlier QUIET per-peer failure into a total one:
    // the host link failed on nostr while torrent had not started (quiet, correctly — it might still
    // reach the peer), and now torrent itself has failed. `allStrategiesFailed()` cannot see that,
    // because nostr is (rightly) not failed. Re-ask the per-peer question for every recorded failure.
    for (const h of this.strategies.values()) {
      for (const peerId of h.peerJoinFailures ?? []) {
        if (this.peerUnreachableEverywhere(peerId)) {
          this.emitError(`[${h.name}] ${classifyJoinError(h.lastError ?? errMsg)}`);
          return;
        }
      }
    }
  }

  /**
   * ⛔ S192 T1 — Trystero's `onJoinError` is a PER-PEER report, never a strategy failure.
   *
   * Every call site in `@trystero-p2p/core` (`signal-handler.mjs` SDP-exchange failure and the two
   * decrypt failures, `strategy.mjs` `onHandshakeError`) carries a `peerId` and is about ONE pair.
   * This used to set `handle.state = 'failed'` for the whole strategy, permanently: one dead pair on
   * nostr and one on torrent — even two DIFFERENT non-host peers — tripped `allStrategiesFailed()`
   * and latched the sticky red lobby error while the host link was fine, and the diagnostics strip
   * read `nostr:fail` for a strategy still carrying every other peer.
   *
   * Now `state` means what it says (the join threw / the chunk failed to load, `markStrategyFailed`),
   * and a per-peer failure is recorded per peer. The UI is told only when THAT peer is unreachable on
   * every live strategy and is not connected through any of them — the honest version of the old
   * "all strategies failed" escalation, scoped to the peer it is actually about.
   */
  private onPeerJoinError(handle: StrategyHandle, details: { error: string; peerId: string }): void {
    console.error('[net] onJoinError:', handle.name, details);
    handle.lastError = details.error;
    // ⛔ S192 re-audit L1-RACE — a failure for a peer that IS connected (on another strategy) is a
    // redundant handshake timing out late (HANDSHAKE_TIMEOUT_MS = 30 s), not a reachability fact.
    // Recording it would outlive the clear in onPeerJoin: when the peer later drops, ONE fresh failure
    // would read as "unreachable everywhere" and latch the red error, and the ✗ count would never drop.
    if (this.peerSet.has(details.peerId)) {
      console.warn('[net]', handle.name, `peer ${details.peerId} failed here but is connected — not recorded`);
      return;
    }
    (handle.peerJoinFailures ??= new Set()).add(details.peerId);
    if (this.peerUnreachableEverywhere(details.peerId)) {
      this.emitError(`[${handle.name}] ${classifyJoinError(details.error)}`);
    } else {
      console.warn('[net]', handle.name, `peer ${details.peerId} failed here but is reachable elsewhere — UI quiet`);
    }
  }

  /**
   * ⭐ S192 audit L1 — forget `peerId`'s recorded join failures on EVERY strategy once it connects on
   * any of them. Without this the sets only grew while a handle lived: a stale nostr failure for a peer
   * that later connected (then dropped) let one fresh torrent failure read as "unreachable everywhere",
   * and the strip's ✗N count never came down.
   */
  private clearPeerJoinFailures(peerId: string): void {
    for (const h of this.strategies.values()) h.peerJoinFailures?.delete(peerId);
  }

  /** True iff `peerId` is not connected and has a recorded join failure on every non-failed strategy. */
  private peerUnreachableEverywhere(peerId: string): boolean {
    if (this.peerSet.has(peerId)) return false;
    const enabled = (Object.keys(STRATEGY_FLAGS) as StrategyName[]).filter((n) => STRATEGY_FLAGS[n]);
    const live = enabled.map((n) => this.strategies.get(n)).filter((h) => h === undefined || h.state !== 'failed');
    // A strategy that has not started yet may still reach the peer — stay quiet until it reports.
    return live.every((h) => h !== undefined && h.peerJoinFailures?.has(peerId) === true);
  }

  private allStrategiesFailed(): boolean {
    const enabled = (Object.keys(STRATEGY_FLAGS) as StrategyName[]).filter(
      (n) => STRATEGY_FLAGS[n],
    );
    if (enabled.length === 0) return true;
    return enabled.every((n) => {
      const h = this.strategies.get(n);
      return h !== undefined && h.state === 'failed';
    });
  }

  private startIcePoll(handle: StrategyHandle): void {
    handle.icePollStartMs = Date.now();
    handle.icePollTimer = setInterval(() => {
      const elapsed = Date.now() - handle.icePollStartMs;
      if (elapsed >= ICE_POLL_MAX_DURATION_MS) {
        this.stopIcePoll(handle);
        console.warn(`[net] ${handle.name} ice-poll: 30s elapsed, peerSet still empty`);
        return;
      }
      if (handle.room === null) {
        this.stopIcePoll(handle);
        return;
      }
      const peers = handle.room.getPeers();
      const peerIds = Object.keys(peers);
      if (peerIds.length === 0) {
        console.info(`[net] ${handle.name} ice-poll t=${elapsed}ms: no RTCPeerConnection yet`);
        return;
      }
      for (const peerId of peerIds) {
        const pc = peers[peerId];
        console.info(
          `[net] ${handle.name} ice-poll t=${elapsed}ms peer=${peerId} ` +
            `ice=${pc.iceConnectionState} gather=${pc.iceGatheringState} ` +
            `conn=${pc.connectionState} sig=${pc.signalingState}`,
        );
      }
    }, ICE_POLL_INTERVAL_MS);
  }

  /**
   * ⭐ S189 (C4, hunt E3) — remember this peer connection's state from the moment it joins, so a drop
   * can say whether the network died or the peer left. Diagnostics only: any failure here is silent.
   */
  private watchPeerConnection(handle: StrategyHandle, peerId: string): void {
    try {
      const peers = handle.room?.getPeers?.() as Record<string, RTCPeerConnection> | undefined;
      const pc = peers?.[peerId];
      if (pc === undefined || typeof pc.addEventListener !== 'function') return;
      const key = `${handle.name}:${peerId}`;
      const record = (): void => {
        this.pcState.set(key, { conn: String(pc.connectionState), ice: String(pc.iceConnectionState) });
      };
      record();
      pc.addEventListener('connectionstatechange', record);
      pc.addEventListener('iceconnectionstatechange', record);
    } catch {
      /* diagnostics only */
    }
  }

  /**
   * ⭐ S189 (C4, hunt E3) — the ONE line a drop leaves, searchable as `[net] PEER DROPPED`. It was only
   * `onPeerLeave: <id>`, the same whether the brother's tab closed or his network died.
   */
  private logPeerDrop(strategy: StrategyName, peerId: string): void {
    const key = `${strategy}:${peerId}`;
    const st = this.pcState.get(key) ?? null;
    this.pcState.delete(key);
    const rx = this.lastRxAtMs.get(peerId);
    const lastRxAgoMs = rx === undefined ? 'never' : String(Math.round(performance.now() - rx));
    const visibility = typeof document !== 'undefined' ? document.visibilityState : 'n/a';
    console.warn(
      `[net] PEER DROPPED strategy=${strategy} peer=${peerId} ` +
        `cause=${classifyPeerDrop(st?.conn ?? null, st?.ice ?? null)} ` +
        `conn=${st?.conn ?? 'unseen'} ice=${st?.ice ?? 'unseen'} ` +
        `lastRxAgoMs=${lastRxAgoMs} visibility=${visibility}`,
    );
  }

  private stopIcePoll(handle: StrategyHandle): void {
    if (handle.icePollTimer !== null) {
      clearInterval(handle.icePollTimer);
      handle.icePollTimer = null;
    }
  }

  /**
   * V6-RISK(R12): the host serializes ONCE here and then sends the full payload **per active
   * strategy** — `iceConfig` has both `nostr` and `torrent` on, and peer dedup happens on
   * RECEIVE only. So the 10 Hz snapshot cadence is a CAP, not a delivered rate: this repo has
   * measured it collapsing to 2.2 Hz under a TD-heavy sim, below what the 150 ms render-delay
   * buffer needs. Measure real 6-seat upstream BEFORE Phase 1 commits — delta encoding is
   * Phase-1-adjacent, not V6-4.2 cleanup. See BACKLOG CARRY-FORWARD LEDGER.
   */
  send(msg: NetMessage): void {
    if (!this.connected) {
      throw new Error('NetTransport not connected');
    }
    // S182 LEVER 2 — round coordinates to 2 dp for the high-rate snapshot only. Non-mutating by
    // construction: the replacer sees values on their way into the string and never writes back, so
    // it cannot reach the worker mirror, the disk save or any hash. See `wireNumberReplacer`.
    // ⭐ S195 — a snapshot becomes a SnapJob: segmented once for the codec (shared by every peer), its
    // legacy string built lazily, only for a handle without the binary action.
    let job: SnapJob | null = null;
    let serialized = '';
    if (msg.kind === 'NETSNAPSHOT') {
      const stripped = stripWirePrevPos(msg);
      const wantCodec =
        SNAPSHOT_CODEC_ENABLED && Array.from(this.strategies.values()).some((h) => h.snapAction != null);
      const segs = wantCodec ? segmentSnapshotMessage(stripped, wireNumberReplacer, this.lastTxSegs) : null;
      let legacyText: string | null = null;
      const fid = nextSnapFid++;
      job = {
        fid,
        segs,
        legacy: () => (legacyText ??= JSON.stringify(stripped, wireNumberReplacer)),
      };
      if (segs !== null) this.rememberTxFrame(fid, segs);
    } else {
      serialized = JSON.stringify(msg);
    }
    /*
     * S182 LEVER 1 — snapshot routing. `null` means "broadcast on every ready strategy", which is
     * the pre-S182 behaviour.
     *
     * ⛔ S183 — THIS COMMENT SAID THE SHIPPED DEFAULT WAS BROADCAST, *"SNAPSHOT_SINGLE_STRATEGY is
     * false pending the owner's decision"*. BOTH HALVES WERE FALSE. `iceConfig.ts` reads
     * `export const SNAPSHOT_SINGLE_STRATEGY = true;`, and the owner RULED it in S182 —
     * *"if it halves our bandwidth, then of course we need to do it"* (`SPARK_CANON.md` §6). Three
     * independent audit lanes flagged this line, because a comment that states a false VALUE and
     * re-opens a SETTLED question is the exact rot `SPARK_CANON.md` exists to stop.
     *
     * So the shipped default is SINGLE-STRATEGY, and `null` is the fallback taken when
     * `pickSnapshotStrategy` finds no one strategy carrying every peer.
     *
     * Only NETSNAPSHOT is ever eligible: the rare control messages keep their redundancy, because
     * that is what multi-strategy is FOR.
     */
    const only =
      SNAPSHOT_SINGLE_STRATEGY && msg.kind === 'NETSNAPSHOT'
        ? pickSnapshotStrategy(
            Array.from(this.strategies.values()).map((h) => ({
              name: h.name,
              ready: h.action !== null,
              peerCount: h.peers.size,
            })),
            this.peerSet.size,
          )
        : null;
    let dispatched = 0;
    for (const handle of this.strategies.values()) {
      if (handle.action === null) continue;
      if (only !== null && handle.name !== only) continue;
      dispatched++;
      // ⭐ S189 — a snapshot goes through the backpressure gate; control traffic never does.
      if (job !== null) {
        this.sendSnapshotOn(handle, job);
        continue;
      }
      // S182 STEP 0 — per-strategy upload. `action.send()` transmits to EVERY peer in that
      // strategy's room, so the wire cost is payload × peers, not payload. In the owner's 1v1 the
      // two are equal; at 3–4 seats counting it once understated the host's upload by up to 3×,
      // which is the number that decides whether his uplink is the bottleneck.
      if (netStats.isEnabled()) {
        netStats.recordSend(handle.name, serialized.length, handle.peers.size, performance.now());
      }
      handle.action.send(serialized).catch((err: unknown) => this.onSendFailed(handle, err));
    }
    // ⛔ S182 STEP 0 — THE ENVELOPE IS COUNTED **AFTER** THE LOOP, AND ONLY IF IT ACTUALLY WENT OUT.
    // Counted once per send() call, so `snap tx` reads the host's real cadence (10 Hz) rather than
    // 10 × the strategy count; the per-strategy BYTES are counted inside the loop, because that
    // duplication is the phenomenon under measurement.
    //
    // ⚠ The `dispatched > 0` guard is not decoration. Recording before the loop counted a snapshot
    // as SENT even when no strategy was ready and Trystero dropped it on the floor — see the warn
    // immediately below, which exists precisely because that happens during the startup window. An
    // instrument that reports a healthy 10 Hz tx while nothing is leaving the machine would send the
    // next session hunting on the joiner for a fault that is on the host.
    // ⭐ S189 — a snapshot's envelope is counted when it is actually TRANSMITTED (`transmitSnapshot`),
    // because behind a starved uplink most of them are superseded and never leave the machine.
    if (netStats.isEnabled() && dispatched > 0 && msg.kind !== 'NETSNAPSHOT') {
      netStats.recordSendEnvelope(msg.kind, serialized.length, performance.now());
    }
    if (dispatched === 0) {
      // No strategy ready yet; messages sent during startup window are lost
      // (Trystero semantics). Warn so it's surfaced in console + diagnostics.
      console.warn('[net] send dropped — no strategy ready yet, kind=', msg.kind);
    }
  }

  /**
   * ⛔⛔ S189 (C5) — **A SNAPSHOT THE UPLINK CANNOT CARRY IS SKIPPED, NOT QUEUED.**
   *
   * Owner: *"it was lagging at about wave five"*. `send()` used to hand every 10 Hz snapshot to
   * Trystero without waiting. Trystero's action-wire cuts a message into 16 KiB chunks and waits, per
   * chunk, for the channel's `bufferedamountlow` — with a 10 s timeout, after which it ABANDONS the
   * rest of that message. A wave-5 board is ~113 KiB, ~9.3 Mbit/s per peer (measured S189). On an
   * uplink below that every excess tick became one more concurrent send: the backlog grew without
   * bound, each snapshot arrived later than the last, and once a turn around the backlog passed 10 s
   * snapshots were abandoned half-sent. Reproduced through Trystero's real action-wire
   * (`snapshotBackpressure.test.ts`): 5 Mbit/s → 40–47 s latency and 8–10 s gaps between whole
   * snapshots, past `HOST_STARVATION_MS`.
   *
   * ⭐ LATEST WINS. At most ONE snapshot in flight per PEER, and at most one waiting — the newest.
   * A snapshot is the WHOLE world (no deltas), so a superseded one carries nothing the next does not;
   * the client's seq gate already treats a gap as normal. On a link that keeps up nothing is ever
   * skipped (the in-flight send finishes inside the 100 ms cadence); on one that cannot, the rate falls
   * to what the link carries and the latency stays at one snapshot.
   *
   * ⚠ "In flight" is Trystero's promise: it resolves once the last chunk is handed to the channel,
   * which its own wait keeps within ~64 KiB of the wire. Control traffic (HELLO, INTENT, LOBBY_*,
   * MIGRATION_CLAIM …) never enters this gate — it is small, rare, and must never be dropped.
   *
   * ⛔ S189 fix round (audit NET-2) — PER PEER, NOT PER STRATEGY. Trystero's `action.send` to several
   * targets resolves only when EVERY target has drained, and a dying channel stays 'open' for ~5-10 s
   * (ICE disconnected + Trystero's 5 s close delay). Gated per strategy, one slow or dying client set
   * the snapshot rate for every client in a 3-4 seat match — reproduced: a healthy peer beside a stalled
   * one received 3 of 100 snapshots. Each peer now has its own slot and its own targeted send
   * (`{ target: peerId }`, Trystero 0.25). Wire cost is unchanged: Trystero already sent per peer.
   */
  private sendSnapshotOn(handle: StrategyHandle, serialized: SnapJob): void {
    for (const peerId of handle.peers) {
      const slots = (handle.snapSlots ??= new Map());
      let slot = slots.get(peerId);
      if (slot === undefined) slots.set(peerId, (slot = { inFlight: false, pending: null }));
      if (slot.inFlight) {
        if (slot.pending !== null) handle.snapSkipped = (handle.snapSkipped ?? 0) + 1;
        slot.pending = serialized;
        continue;
      }
      this.transmitSnapshot(handle, peerId, serialized);
    }
  }

  private transmitSnapshot(handle: StrategyHandle, peerId: string, job: SnapJob): void {
    const action = handle.action;
    const slot = handle.snapSlots?.get(peerId);
    if (action === null || slot === undefined) return;
    slot.inFlight = true;
    let sent: Promise<unknown>;
    const snapAction = handle.snapAction;
    if (snapAction != null && job.segs !== null) {
      // ⭐ S195 — the codec path. Encoding is async (deflate), and it happens INSIDE the slot's
      // in-flight window, so this peer's frames still leave strictly one after another, newest wins.
      sent = this.encodeFor(peerId, job).then((bytes) => {
        this.countSnapshotSend(handle.name, bytes.byteLength, job.fid);
        return snapAction.send(bytes, { target: peerId });
      });
    } else {
      const serialized = job.legacy();
      this.countSnapshotSend(handle.name, serialized.length, job.fid);
      try {
        sent = Promise.resolve(action.send(serialized, { target: peerId }));
      } catch (err) {
        sent = Promise.reject(err);
      }
    }
    sent
      .catch((err: unknown) => this.onSendFailed(handle, err))
      .finally(() => {
        slot.inFlight = false;
        const next = slot.pending;
        slot.pending = null;
        // Only on the handle that is still live, to a peer still in it: a disconnect or a reconnect
        // replaces handles, a departed peer's slot is dropped — and a snapshot for either goes nowhere.
        if (
          next !== null &&
          this.connected &&
          this.strategies.get(handle.name) === handle &&
          handle.peers.has(peerId) &&
          handle.snapSlots?.get(peerId) === slot
        ) {
          this.transmitSnapshot(handle, peerId, next);
        }
      });
  }

  /** The newest snapshot frame whose envelope was counted — so a broadcast counts it once. */
  private lastEnvelopeCounted = 0;

  private countSnapshotSend(strategy: StrategyName, size: number, fid: number): void {
    // ⛔ The S182 zero-cost contract (`netStats.test.ts`): each recorder call reads isEnabled() first.
    if (netStats.isEnabled()) netStats.recordSend(strategy, size, 1, performance.now());
    // Once per snapshot, however many strategies and peers carry it (the S182 `snap tx` contract).
    // ⚠ S195: with per-peer deltas the envelope's SIZE is the first peer's frame, not a shared string.
    if (netStats.isEnabled() && fid !== this.lastEnvelopeCounted) {
      this.lastEnvelopeCounted = fid;
      netStats.recordSendEnvelope('NETSNAPSHOT', size, performance.now());
    }
  }

  /** ⭐ S195 — keep a frame the host may delta against; the ring holds the newest HOST_RING. */
  private rememberTxFrame(fid: number, segs: Segments): void {
    this.lastTxSegs = segs;
    this.txRing.set(fid, segs);
    while (this.txRing.size > HOST_RING) {
      const oldest = this.txRing.keys().next().value as number;
      this.txRing.delete(oldest);
    }
    // Memoised encodings are only ever reused for the newest frames.
    for (const key of this.encodeMemo.keys()) {
      if (Number(key.slice(0, key.indexOf('|'))) < fid - 2) this.encodeMemo.delete(key);
    }
  }

  private txPeer(peerId: string): TxPeer {
    let p = this.txPeers.get(peerId);
    if (p === undefined) this.txPeers.set(peerId, (p = { ackFid: 0, inflate: false, needKey: false, sinceKey: 0 }));
    return p;
  }

  /**
   * ⭐ S195 — the frame for `peerId`: a DELTA against the newest frame it acknowledged, or a KEYFRAME
   * when it has acknowledged none, asked for one, its ack fell out of the ring, or KEYFRAME_INTERVAL
   * frames have gone by. Deflated when it said it can inflate and this browser can deflate.
   */
  private encodeFor(peerId: string, job: SnapJob): Promise<Uint8Array> {
    const segs = job.segs as Segments;
    const p = this.txPeer(peerId);
    const base = p.ackFid > 0 && p.ackFid < job.fid ? this.txRing.get(p.ackFid) : undefined;
    const key = base === undefined || p.needKey || p.sinceKey >= KEYFRAME_INTERVAL;
    if (key) {
      p.needKey = false;
      p.sinceKey = 0;
    } else {
      p.sinceKey++;
    }
    const baseFid = key ? 0 : p.ackFid;
    const z = p.inflate && canDeflate();
    const memoKey = `${job.fid}|${baseFid}|${z ? 1 : 0}`;
    let out = this.encodeMemo.get(memoKey);
    if (out === undefined) {
      const text = encodeDelta(segs, key ? null : (base as Segments), job.fid, baseFid);
      out = packFrame(text, z);
      this.encodeMemo.set(memoKey, out);
    }
    return out;
  }

  /** ⭐ S195 — an ack from a peer we send snapshots to. */
  private onSnapAck(data: unknown, peerId: string): void {
    this.lastRxAtMs.set(peerId, performance.now());
    const ack = parseSnapAck(data);
    if (ack === null) return;
    const p = this.txPeer(peerId);
    p.inflate = ack.z;
    // Only a frame we still hold can be a base; fids are page-unique, so a stale ack names nothing.
    if (ack.f > p.ackFid && this.txRing.has(ack.f)) p.ackFid = ack.f;
    if (ack.k) p.needKey = true;
  }

  private sendSnapAck(handle: StrategyHandle, peerId: string, fid: number, wantKey: boolean): void {
    const ackAction = handle.ackAction;
    if (ackAction == null) return;
    try {
      void Promise.resolve(ackAction.send(buildSnapAck(fid, wantKey), { target: peerId })).catch(() => {
        /* an ack lost is a keyframe later, never an error */
      });
    } catch {
      /* same */
    }
  }

  /**
   * ⭐ S195 — a codec frame from `peerId`. Decoded strictly in arrival order per sender (inflate is
   * async), rebuilt into the FULL wire string, and handed to the unchanged receive path. A frame
   * whose base this joiner does not hold, or that fails to decode, is dropped and a keyframe is
   * requested — the board holds at the last good snapshot until it comes (about one round trip).
   */
  private onSnapFrame(data: unknown, peerId: string, strategyName: StrategyName): void {
    const now = performance.now();
    this.lastRxAtMs.set(peerId, now);
    if (!(data instanceof Uint8Array)) return;
    if (netStats.isEnabled()) netStats.recordReceive(data.byteLength, now);
    let rx = this.rxPeers.get(peerId);
    if (rx === undefined) {
      rx = { ring: new Map(), lastFid: 0, chain: Promise.resolve(), lastKeyRequestMs: -Infinity };
      this.rxPeers.set(peerId, rx);
    }
    const r = rx;
    const gen = this.connectGen;
    // ⛔ S195 audit F1 — the chain must SURVIVE a throw. Without the catch, one throw anywhere below
    // rejected `chain` for good and every later frame from this host was skipped: a frozen board that
    // never reads as host-lost (lastRxAtMs keeps updating). The legacy string path survives the same
    // throw because Trystero catches per call; this restores that property.
    r.chain = r.chain
      .then(() => this.decodeSnapFrame(data, peerId, strategyName, r, gen))
      .catch((err: unknown) => {
        this.emitError(`snapshot frame from ${peerId} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /** Visible for tests: resolves when every frame received so far from `peerId` is processed. */
  snapFramesSettled(peerId: string): Promise<void> {
    return this.rxPeers.get(peerId)?.chain ?? Promise.resolve();
  }

  private async decodeSnapFrame(
    data: Uint8Array,
    peerId: string,
    strategyName: StrategyName,
    rx: RxPeer,
    gen: number,
  ): Promise<void> {
    let text: string;
    try {
      text = await unpackFrame(data);
    } catch (err) {
      this.requestKeyframe(peerId, strategyName, rx, `undecodable frame: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // A disconnect, or the sender leaving, while this frame was inflating: it belongs to nobody now.
    if (this.connectGen !== gen || this.rxPeers.get(peerId) !== rx) return;
    const header = readDeltaHeader(text);
    if (header === null) {
      this.requestKeyframe(peerId, strategyName, rx, 'bad frame header');
      return;
    }
    // A duplicate (the same frame on a second strategy) or an older frame: nothing new in it.
    if (header.fid <= rx.lastFid) return;
    let base: Segments | null = null;
    if (header.baseFid !== 0) {
      const held = rx.ring.get(header.baseFid);
      if (held === undefined) {
        this.requestKeyframe(peerId, strategyName, rx, `no base frame ${header.baseFid}`);
        return;
      }
      base = held;
    }
    let segs: Segments;
    let full: string;
    try {
      segs = applyDelta(text, base);
      full = segmentsToText(segs);
    } catch (err) {
      this.requestKeyframe(peerId, strategyName, rx, err instanceof Error ? err.message : String(err));
      return;
    }
    rx.lastFid = header.fid;
    // ⛔ S195 audit F1 — a handler that throws must not take the frame (or the chain) down with it. The
    // throw can only come from a message handler AFTER the rebuilt string parsed and validated, so the
    // frame itself is good: it is committed as a base and acked like any accepted frame.
    let accepted: boolean;
    try {
      accepted = this.handleRawMessage(full, peerId, strategyName, false);
    } catch (err) {
      this.emitError(`snapshot handler threw for ${peerId}: ${err instanceof Error ? err.message : String(err)}`);
      accepted = true;
    }
    /*
     * ⛔ S195 audit F2 — a frame becomes a BASE only once the receive path ACCEPTED what it rebuilt, and
     * only ONE sender holds a ring: the latest peer whose rebuilt snapshot was accepted (the host; after
     * a migration, the successor's first keyframe moves it). Any other peer can make this joiner decode
     * a frame, but never park state in it. A sender other than the latched one can only be accepted on
     * a KEYFRAME (its deltas have no base here), so switching never needs a base it does not have.
     */
    if (!accepted) {
      if (this.rxSource === peerId) this.requestKeyframe(peerId, strategyName, rx, 'rebuilt snapshot rejected');
      return;
    }
    if (this.rxSource !== peerId) {
      if (this.rxSource !== null) this.rxPeers.get(this.rxSource)?.ring.clear();
      this.rxSource = peerId;
    }
    rx.ring.set(header.fid, segs);
    while (rx.ring.size > JOINER_RING) rx.ring.delete(rx.ring.keys().next().value as number);
    const handle = this.strategies.get(strategyName);
    if (handle !== undefined) this.sendSnapAck(handle, peerId, header.fid, false);
  }

  private requestKeyframe(peerId: string, strategyName: StrategyName, rx: RxPeer, why: string): void {
    const now = performance.now();
    if (now - rx.lastKeyRequestMs < KEY_REQUEST_MIN_MS) return;
    rx.lastKeyRequestMs = now;
    console.warn(`[net] snapshot frame from ${peerId} dropped (${why}) — asking for a keyframe`);
    const handle = this.strategies.get(strategyName);
    if (handle !== undefined) this.sendSnapAck(handle, peerId, 0, true);
  }

  private onSendFailed(handle: StrategyHandle, err: unknown): void {
    // Per-strategy send failure: warn, do not escalate UI unless all
    // strategies have failed.
    const errMsg = `${handle.name} send: ${err instanceof Error ? err.message : String(err)}`;
    console.warn('[net]', errMsg);
    if (this.allStrategiesFailed()) {
      this.emitError(errMsg);
    }
  }

  /** ⭐ S189 — diagnostics: snapshots superseded before transmission, per strategy. */
  snapshotsSkipped(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const h of this.strategies.values()) out[h.name] = h.snapSkipped ?? 0;
    return out;
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

  /**
   * S62 — the connected remote peer ids in stable join order (Set insertion
   * order). The host uses this at Begin Match to assign seats 1..N to remote
   * peers (host = seat 0) and to build the authoritative ordered roster.
   */
  peerIds(): string[] {
    return Array.from(this.peerSet);
  }

  isConnected(): boolean {
    return this.connected && this.peerSet.size > 0;
  }

  getDiagnostics(): NetDiagnostics {
    const strategies: StrategyDiagnostic[] = (
      Object.keys(STRATEGY_FLAGS) as StrategyName[]
    ).map((name) => {
      if (!STRATEGY_FLAGS[name]) {
        return { name, state: 'disabled', peerCount: 0, relays: [], lastError: null };
      }
      const handle = this.strategies.get(name);
      if (handle === undefined) {
        return { name, state: 'starting', peerCount: 0, relays: [], lastError: null };
      }
      const relays: RelayDiagnostic[] = handle.relayUrls.map((url) => {
        let connected = false;
        try {
          if (typeof handle.getSockets === 'function') {
            const sockets = handle.getSockets();
            if (sockets !== null && typeof sockets === 'object') {
              const sock = (sockets as Record<string, unknown>)[url];
              connected = sock !== undefined && sock !== null;
            }
          }
        } catch {
          /* socket probe failed — leave connected=false */
        }
        return { url, connected };
      });
      return {
        name,
        state: handle.state,
        peerCount: handle.peers.size,
        relays,
        lastError: handle.lastError,
        peerJoinFailures: handle.peerJoinFailures?.size ?? 0,
      };
    });
    return {
      accepted: this.acceptedCount,
      rejected: this.rejectedCount,
      lastSeq: this.lastSeq,
      lastKind: this.lastKind,
      strategies,
    };
  }

  disconnect(): void {
    const leaves: Promise<unknown>[] = [];
    for (const handle of this.strategies.values()) {
      this.stopIcePoll(handle);
      if (handle.room !== null && !leavingRooms.has(handle.room)) {
        leavingRooms.add(handle.room);
        console.info(`[net] disconnect strategy=${handle.name}`);
        // leave() returns a Promise in 0.25; fire-and-forget (await would
        // delay the next connect() unnecessarily; teardown is best-effort).
        // ⭐ S189 — still not awaited HERE, but REGISTERED, so a connect() to the same code waits
        // for it instead of binding to the dying room (see the note in `connect()`).
        let left: Promise<unknown>;
        try {
          left = Promise.resolve(handle.room.leave());
        } catch (err) {
          left = Promise.reject(err);
        }
        leaves.push(
          left.catch((err: unknown) => {
            console.warn('[net] leave failed:', handle.name, err);
          }),
        );
      }
    }
    if (this.roomCode !== null && leaves.length > 0) {
      const code = this.roomCode;
      const settled = Promise.all(leaves);
      pendingLeaves.set(code, settled);
      void settled.then(() => {
        if (pendingLeaves.get(code) === settled) pendingLeaves.delete(code);
      });
    }
    this.roomCode = null;
    this.connectGen++;
    this.strategies.clear();
    this.peerSet.clear();
    // ⭐ S195 — codec state is per connection. (`nextSnapFid` is NOT reset: fids stay page-unique.)
    this.txPeers.clear();
    this.txRing.clear();
    this.lastTxSegs = null;
    this.encodeMemo.clear();
    this.rxPeers.clear();
    this.rxSource = null;
    // S53 P1 — clear protocol-mismatch latch on disconnect. Lifetime of the
    // ban set = lifetime of the NetTransport instance + active session.
    // Reconnecting after disconnect (e.g. lobby Back → re-Host) starts fresh.
    this.protocolMismatchPeers.clear();
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.lastSeq = 0;
    this.lastKind = null;
    this.connected = false;
  }
}
