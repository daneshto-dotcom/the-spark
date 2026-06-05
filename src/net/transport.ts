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
import {
  APP_ID,
  HANDSHAKE_TIMEOUT_MS,
  ICE_POLL_INTERVAL_MS,
  ICE_POLL_MAX_DURATION_MS,
  ICE_SERVERS,
  NOSTR_RELAYS,
  STRATEGY_FLAGS,
  TORRENT_TRACKERS,
  classifyJoinError,
  type StrategyName,
} from './iceConfig.ts';

export { classifyJoinError };
// S62 — re-export Trystero's local peer id so net handlers can self-identify in
// the broadcast roster (each client matches its own seat by peerId === selfId).
// selfId is a stable per-page-load constant, identical across all strategies.
export { selfId };

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
  icePollTimer: ReturnType<typeof setInterval> | null;
  icePollStartMs: number;
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
  handleRawMessage(data: string, peerId: string, strategyName = ''): void {
    // Parse on the receive boundary so malformed peer messages don't
    // poison handlers (Audit Pass-1 fix d3f0e22b preserved).
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emitError(
        `Malformed peer message from ${peerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    // S53 P1 — per-peer protocol-mismatch latch (Council R1 Grok #4 +
    // Gemini #2 CONVERGENT BLOCKER). Drop ALL subsequent messages from a
    // peer once their HELLO failed the protoVersion check — including
    // INTENTs whose action.type would otherwise pass the in-process
    // KNOWN_GAME_ACTION_TYPES_RECORD allowlist. Closes the
    // stale-build-peer-injection desync hazard.
    if (this.protocolMismatchPeers.has(peerId)) {
      this.rejectedCount++;
      return;
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
      return;
    }
    const msg = parseNetMessage(parsed);
    if (msg === null) {
      this.rejectedCount++;
      console.warn('[net]', strategyName, 'rejected malformed NetMessage from', peerId, parsed);
      return;
    }
    this.acceptedCount++;
    this.lastKind = msg.kind;
    if (msg.kind === 'NETSNAPSHOT') this.lastSeq = msg.snapshotSeq;
    // App-layer dedup: NETSNAPSHOTs are idempotent (snapshotSeq monotonic),
    // INTENTs are timestamped, HELLO is idempotent. Duplicate delivery from
    // a second strategy is harmless. Routing through full handler list.
    for (const h of this.messageHandlers) h(msg, peerId);
  }

  connect(roomCode: string): void {
    if (this.connected) {
      throw new Error('NetTransport already connected; call disconnect() first');
    }
    this.connected = true;
    console.info(
      `[net] connect: roomCode=${roomCode} appId=${APP_ID} ice=${ICE_SERVERS.length} ` +
        `strategies=[${Object.entries(STRATEGY_FLAGS)
          .filter(([, on]) => on)
          .map(([n]) => n)
          .join(',')}]`,
    );

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
          if (!this.connected) return;
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
          if (!this.connected) return;
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
          trickleIce: true,
        },
        roomCode,
        {
          handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
          onJoinError: (details) => {
            const errMsg = `[${name}] ${classifyJoinError(details.error)}`;
            console.error('[net] onJoinError:', name, details);
            handle.lastError = details.error;
            handle.state = 'failed';
            // Only escalate to UI if ALL strategies have failed; otherwise a
            // single-strategy decay is invisible to the user (multi-broadcast
            // continues on the survivors).
            if (this.allStrategiesFailed()) {
              this.emitError(errMsg);
            } else {
              console.warn('[net]', name, 'failed but others active — UI quiet');
            }
          },
          onPeerHandshake: async (peerId, _send, _receive, isInitiator) => {
            console.info(
              `[net] ${name} onPeerHandshake peer=${peerId} isInitiator=${isInitiator}`,
            );
          },
        },
      );

      handle.room = room;
      handle.state = 'ready';

      // makeAction returns an object in 0.25 (was 3-tuple in 0.24).
      const action = room.makeAction<string>('msg') as MessageAction<string>;
      handle.action = action;
      // S54 P1 — delegate to the extracted, unit-testable receive seam
      // (handleRawMessage). The closure stays minimal: it only adapts
      // Trystero's (data, ctx) shape to (data, peerId, strategyName).
      action.onMessage = (data, ctx) => this.handleRawMessage(data, ctx.peerId, name);

      room.onPeerJoin = (peerId) => {
        console.info(`[net] ${name} onPeerJoin: ${peerId} strategyPeers=${handle.peers.size + 1}`);
        handle.peers.add(peerId);
        this.stopIcePoll(handle);
        // Dedup at transport boundary — only fire onPeerChange the first
        // time we see this peerId across all strategies.
        if (!this.peerSet.has(peerId)) {
          this.peerSet.add(peerId);
          for (const h of this.peerHandlers) h(peerId, 'join');
        } else {
          console.info(`[net] ${name} duplicate join for ${peerId} — already known`);
        }
      };

      room.onPeerLeave = (peerId) => {
        console.info(`[net] ${name} onPeerLeave: ${peerId}`);
        handle.peers.delete(peerId);
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
    }
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

  private stopIcePoll(handle: StrategyHandle): void {
    if (handle.icePollTimer !== null) {
      clearInterval(handle.icePollTimer);
      handle.icePollTimer = null;
    }
  }

  send(msg: NetMessage): void {
    if (!this.connected) {
      throw new Error('NetTransport not connected');
    }
    const serialized = JSON.stringify(msg);
    let dispatched = 0;
    for (const handle of this.strategies.values()) {
      if (handle.action === null) continue;
      dispatched++;
      handle.action.send(serialized).catch((err: unknown) => {
        // Per-strategy send failure: warn, do not escalate UI unless all
        // strategies have failed.
        const errMsg = `${handle.name} send: ${err instanceof Error ? err.message : String(err)}`;
        console.warn('[net]', errMsg);
        if (this.allStrategiesFailed()) {
          this.emitError(errMsg);
        }
      });
    }
    if (dispatched === 0) {
      // No strategy ready yet; messages sent during startup window are lost
      // (Trystero semantics). Warn so it's surfaced in console + diagnostics.
      console.warn('[net] send dropped — no strategy ready yet, kind=', msg.kind);
    }
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
    for (const handle of this.strategies.values()) {
      this.stopIcePoll(handle);
      if (handle.room !== null) {
        console.info(`[net] disconnect strategy=${handle.name}`);
        // leave() returns a Promise in 0.25; fire-and-forget (await would
        // delay the next connect() unnecessarily; teardown is best-effort).
        void handle.room.leave().catch((err: unknown) => {
          console.warn('[net] leave failed:', handle.name, err);
        });
      }
    }
    this.strategies.clear();
    this.peerSet.clear();
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
