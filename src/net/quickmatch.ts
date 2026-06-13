/**
 * SPARK — S87 P4: QUICK MATCH — serverless stranger matchmaking + all-ready
 * start gate. LAZY chunk (imported on first "Quick Match" click; the index
 * bundle pays nothing — S85 charter pattern).
 *
 * This module is the LAZY half — discovery election + the Trystero-backed
 * QuickmatchDiscovery class. The EAGER ready-gate/presence helpers
 * (isQuickmatchAllReady, rosterWithReady, broadcastQmPresence, …) live in
 * quickmatchGate.ts so hostHandlers.ts can use them without pulling Trystero
 * into the index chunk.
 *
 *  1. DISCOVERY ELECTION (decideQuickmatch + qmPromoteDelayMs):
 *     all seekers join a well-known discovery room (`spark-qm-v{PROTO}`) and
 *     gossip `{t:'host', code, full}` announcements. A seeker that hears a
 *     joinable host joins the SMALLEST advertised code (deterministic
 *     convergence — Council S87 F4 fix #3); a seeker that hears nothing for a
 *     JITTERED window (qmPromoteDelayMs, derived from selfId so simultaneous
 *     seekers don't all promote at once — fix #2) self-promotes to host and
 *     starts announcing its OWN code (= its ECDSA pubkey fingerprint, so the
 *     existing crypto attestation works unchanged when others join it). A
 *     PEERLESS host that later hears a smaller code demotes and joins it
 *     (split-brain heals toward the globally-smallest code); a host WITH peers
 *     never demotes. A FULL host (6 seated) announces full:true and is ignored
 *     by seekers (fix #4).
 *
 *  2. READY GATE (isQuickmatchAllReady + rosterWithReady + qmReadyCount):
 *     in a quickmatch room EVERY player (host + joiners) gets a READY toggle.
 *     Joiners send LOBBY_READY{ready} (the v7→8 wire bump); the host records
 *     it per transport peerId, mirrors the aggregate via LOBBY_PRESENCE
 *     roster.ready, and AUTO-BEGINS the instant every CURRENTLY-SEATED player
 *     is ready and ≥2 are present. Readiness is intersected with the live
 *     seat-map each check, so a player who closes their tab after readying can
 *     never wedge the gate (fix #5).
 *
 * Determinism note: the discovery layer is real-time presence (wall-clock
 * timers, network ordering) and is explicitly OUTSIDE the save.replay sim
 * determinism contract — like the friends-lobby seating it gates.
 */

import { joinRoom as joinNostr, selfId } from '@trystero-p2p/nostr';
import type { MessageAction, Room } from '@trystero-p2p/core';
import { APP_ID, HANDSHAKE_TIMEOUT_MS, ICE_SERVERS, NOSTR_RELAYS } from './iceConfig.ts';
import { MAX_PLAYERS } from '../constants.ts';
import { PROTOCOL_VERSION } from './protocol.ts';

/* ════════════════════════ DISCOVERY ELECTION (pure) ═══════════════════════ */

/** A host's discovery beacon. `full` hosts are skipped by seekers. */
export interface QmAnnouncement {
  readonly t: 'host';
  readonly code: string;
  readonly full: boolean;
}

/** The election decision for one tick. The orchestrator owns role transitions:
 *  'join' while already hosting ⇒ demote-then-join (it tears the host room down
 *  first). 'wait' keeps the current role. */
export type QmDecision =
  | { readonly kind: 'wait' }
  | { readonly kind: 'promote' }
  | { readonly kind: 'join'; readonly code: string };

export interface QmDecisionState {
  /** 'seeking' (no room yet) or 'hosting' (self-promoted, announcing). */
  readonly role: 'seeking' | 'hosting';
  /** My host code — set iff role==='hosting'. */
  readonly myCode: string | null;
  /** Iff hosting: do I already have ≥1 connected peer? (never demote if so). */
  readonly hostHasPeers: boolean;
  /** Iff seeking: ms elapsed since I started seeking. */
  readonly elapsedMs: number;
  /** Jittered self-promote threshold (qmPromoteDelayMs). */
  readonly promoteDelayMs: number;
}

/**
 * PURE election step. Given my state + the host beacons I've heard, decide the
 * single next action. Total + side-effect-free → exhaustively unit-testable.
 */
export function decideQuickmatch(
  state: QmDecisionState,
  heard: ReadonlyMap<string, QmAnnouncement>,
): QmDecision {
  // Joinable = advertised, NOT full, and NOT my own code.
  const joinable: string[] = [];
  for (const a of heard.values()) {
    if (a.full) continue;
    if (state.myCode !== null && a.code === state.myCode) continue;
    joinable.push(a.code);
  }
  joinable.sort(); // lexicographic — deterministic smallest-first convergence

  if (state.role === 'seeking') {
    if (joinable.length > 0) return { kind: 'join', code: joinable[0] };
    if (state.elapsedMs >= state.promoteDelayMs) return { kind: 'promote' };
    return { kind: 'wait' };
  }

  // role === 'hosting'
  if (state.hostHasPeers) return { kind: 'wait' }; // someone joined me — hold
  // Peerless host: demote only toward a STRICTLY smaller code (so two peerless
  // hosts can't ping-pong; the smaller always wins, the larger always yields).
  const smaller = joinable.filter((c) => state.myCode !== null && c < state.myCode);
  if (smaller.length > 0) return { kind: 'join', code: smaller[0] };
  return { kind: 'wait' };
}

/**
 * Deterministic per-peer self-promote jitter in [minMs, maxMs], derived from a
 * stable string (selfId). De-synchronizes simultaneous seekers so they don't
 * all promote in the same instant and shatter into N one-person rooms (Council
 * F4 fix #2). Pure (no Math.random) — same id ⇒ same delay, testable.
 */
export function qmPromoteDelayMs(id: string, minMs = 2000, maxMs = 3500): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return minMs + (h % (maxMs - minMs + 1));
}

/* ════════════════════════ DISCOVERY PLUMBING (thin) ═══════════════════════ */

/** Well-known discovery room — version-scoped so only same-protocol peers meet. */
export const QM_DISCOVERY_ROOM = `spark-qm-v${PROTOCOL_VERSION}`;
const ANNOUNCE_INTERVAL_MS = 2000;
const TICK_INTERVAL_MS = 700;

export interface QuickmatchCallbacks {
  /** Become a host (standard host-start path). Returns the host room code to announce. */
  becomeHost(): string;
  /** Join an advertised host code (standard client path). */
  joinCode(code: string): void;
  /** Tear down the current peerless host room before demoting to a joiner. */
  teardownHost(): void;
  /** Live peer count of our own host room (0 ⇒ peerless; ≥MAX_PLAYERS-1 ⇒ full). */
  hostPeerCount(): number;
}

/**
 * Drives the discovery room: joins `spark-qm-v{PROTO}`, gossips/listens for
 * host beacons, and ticks the pure election. start() opens the room and begins
 * seeking; stop() leaves (called once committed — joined a room or a match
 * began). Everything decision-shaped is delegated to decideQuickmatch.
 */
export class QuickmatchDiscovery {
  private room: Room | null = null;
  private action: MessageAction<string> | null = null;
  private readonly heard = new Map<string, QmAnnouncement>();
  private role: 'seeking' | 'hosting' = 'seeking';
  private myCode: string | null = null;
  private startedMs = 0;
  private readonly promoteDelayMs = qmPromoteDelayMs(selfId);
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(private readonly callbacks: QuickmatchCallbacks) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.role = 'seeking';
    this.myCode = null;
    this.heard.clear();
    this.startedMs = Date.now();
    try {
      const room = joinNostr(
        {
          appId: APP_ID,
          relayConfig: { urls: NOSTR_RELAYS, redundancy: NOSTR_RELAYS.length },
          rtcConfig: { iceServers: ICE_SERVERS, iceTransportPolicy: 'all' },
          trickleIce: true,
        },
        QM_DISCOVERY_ROOM,
        { handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS },
      );
      this.room = room;
      // makeAction returns an object in @trystero-p2p 0.25 (.send / .onMessage),
      // mirroring transport.ts's usage of the same API.
      const action = room.makeAction<string>('qm') as MessageAction<string>;
      this.action = action;
      action.onMessage = (data) => this.onBeacon(data as string);
    } catch (err) {
      // Discovery relays unreachable: degrade to a lone waiting host so the
      // player isn't stuck on a dead "searching…" screen.
      console.warn('[qm] discovery join failed — promoting to lone host', err);
      this.promote();
      return;
    }
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    this.active = false;
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.announceTimer !== null) clearInterval(this.announceTimer);
    this.tickTimer = null;
    this.announceTimer = null;
    this.action = null;
    if (this.room !== null) {
      void this.room.leave().catch(() => undefined);
      this.room = null;
    }
    this.heard.clear();
  }

  private onBeacon(raw: string): void {
    try {
      const a = JSON.parse(raw) as Partial<QmAnnouncement>;
      if (a.t === 'host' && typeof a.code === 'string') {
        this.heard.set(a.code, { t: 'host', code: a.code, full: a.full === true });
      }
    } catch {
      // Malformed beacon — ignore (a stranger room can carry junk).
    }
  }

  private tick(): void {
    if (!this.active) return;
    const decision = decideQuickmatch(
      {
        role: this.role,
        myCode: this.myCode,
        hostHasPeers: this.role === 'hosting' && this.callbacks.hostPeerCount() > 0,
        elapsedMs: Date.now() - this.startedMs,
        promoteDelayMs: this.promoteDelayMs,
      },
      this.heard,
    );
    if (decision.kind === 'promote') {
      this.promote();
    } else if (decision.kind === 'join') {
      if (this.role === 'hosting') this.callbacks.teardownHost();
      this.callbacks.joinCode(decision.code);
      this.stop(); // committed — leave discovery
    }
    // 'wait' → nothing.
  }

  private promote(): void {
    this.role = 'hosting';
    this.myCode = this.callbacks.becomeHost();
    // Announce immediately, then on a cadence, until stop().
    this.sendAnnounce();
    if (this.announceTimer === null) {
      this.announceTimer = setInterval(() => this.sendAnnounce(), ANNOUNCE_INTERVAL_MS);
    }
  }

  private sendAnnounce(): void {
    if (this.action === null || this.myCode === null) return;
    const full = this.callbacks.hostPeerCount() >= MAX_PLAYERS - 1;
    const msg: QmAnnouncement = { t: 'host', code: this.myCode, full };
    void Promise.resolve(this.action.send(JSON.stringify(msg))).catch(() => undefined);
  }
}
