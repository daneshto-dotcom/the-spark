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
 *     ⛔⛔ S189 — **THE ELDER KEEPS THE ROOM; THE CODE ONLY BREAKS A TIE.** Owner: *"Quick match …
 *     I'm player one … my brother connects … it switches me to player two puts him as player one …
 *     only happens to this workstation"*. The sentences above are the mechanism: the late seeker's
 *     2–3.5 s promote clock usually beats the discovery handshake (S182, pinned in
 *     `quickmatch.test.ts`), so BOTH become peerless hosts and the demote arm decides — by CODE, not
 *     by who was there first. And the code is fixed per PAGE LOAD (`main.ts` mints the host identity
 *     once at boot; `hostHandlers.ts` hosts `hostIdentity.roomCode`), so for one pair of open tabs
 *     the verdict is the SAME on every attempt: his tab held the larger code, so he was demoted
 *     whenever both promoted — the swap when he was first, and the "correct" P2 when he was second.
 *     That is the "only this workstation" bias. Beacons now carry the sender's lobby age and the
 *     election is: the ELDER keeps the room, a near-tie goes to the smaller code. See
 *     `decideQuickmatch` for why it cannot make both peers yield.
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
import type { MessageAction } from '@trystero-p2p/core';
import { APP_ID, HANDSHAKE_TIMEOUT_MS, ICE_SERVERS, NOSTR_RELAYS } from './iceConfig.ts';
import { MAX_PLAYERS, NET_ROOM_CODE_LENGTH } from '../constants.ts';
import { parseRoomCode, PROTOCOL_VERSION } from './protocol.ts';

/* ════════════════════════ DISCOVERY ELECTION (pure) ═══════════════════════ */

/** A host's discovery beacon. `full` hosts are skipped by seekers. */
export interface QmAnnouncement {
  readonly t: 'host';
  readonly code: string;
  readonly full: boolean;
  /**
   * ⭐ S189 — how long the SENDER has been in the quickmatch lobby (ms since it pressed Quick Match),
   * on the sender's OWN monotonic clock, floored, at the moment it sent this beacon. RELATIVE on
   * purpose: two machines' wall clocks are not synchronised and a skewed one would silently invert
   * "who was first". Absent from a pre-S189 beacon — that pair then falls back to the code rule,
   * which is exactly what the older build runs, so a mixed pair still agrees.
   */
  readonly ageMs?: number;
  /**
   * ⭐ S189 — codes the sender has judged it OUTRANKS. A judgment is STICKY (see `decideQuickmatch`)
   * and this list is how the other side learns of it — the only thing that resolves a mutual hold.
   */
  readonly holds?: readonly string[];
}

/** A beacon as the RECEIVER holds it — stamped with its arrival time on the receiver's monotonic clock. */
export interface QmHeard extends QmAnnouncement {
  readonly receivedAtMs?: number;
}

/**
 * ⭐ S189 — subtracted from every ESTIMATE of another host's age, so an estimate can only ever be
 * an UNDER-estimate. MINE, not the owner's: it absorbs clock-RATE drift between two machines
 * (~1e-4 ⇒ 60 ms over a 10-minute lobby) and the floor on `ageMs`; transit is already on the safe
 * side (a beacon ages in flight, and the receiver does not add that back). It is the width of the
 * near-tie band that the code decides — two clicks less than ~this apart are "simultaneous".
 * `decideQuickmatch`'s proof needs it ≥ 0 and nothing else.
 */
export const QM_AGE_MARGIN_MS = 500;
/** ⭐ S189 — parse hygiene only: an `ageMs` beyond a day is refused (the beacon keeps its code). */
export const QM_MAX_AGE_MS = 86_400_000;
/** ⭐ S189 — parse + send cap on `holds`. A beacon is ~15 bytes per entry. */
export const QM_MAX_HOLDS = 16;

/** The election decision for one tick. The orchestrator owns role transitions:
 *  'join' while already hosting ⇒ demote-then-join (it tears the host room down
 *  first). 'wait' keeps the current role; its `holds` are codes this peer has
 *  just judged it outranks — the orchestrator records them (sticky) and announces. */
export type QmDecision =
  | { readonly kind: 'wait'; readonly holds?: readonly string[] }
  | { readonly kind: 'promote' }
  | { readonly kind: 'join'; readonly code: string };

export interface QmDecisionState {
  /** 'seeking' (no room yet) or 'hosting' (self-promoted, announcing). */
  readonly role: 'seeking' | 'hosting';
  /** My host code — set iff role==='hosting'. */
  readonly myCode: string | null;
  /** Iff hosting: do I already have ≥1 connected peer? (never demote if so). */
  readonly hostHasPeers: boolean;
  /** ms elapsed since I pressed Quick Match — the promote clock AND (S189) my own lobby age. */
  readonly elapsedMs: number;
  /** Jittered self-promote threshold (qmPromoteDelayMs). */
  readonly promoteDelayMs: number;
  /** ⭐ S189 — my monotonic clock now, to age the beacons I hold. Absent ⇒ every age is unknown. */
  readonly nowMs?: number;
  /** ⭐ S189 — codes I have ALREADY judged I outrank. Sticky: never yielded to except by a mutual hold. */
  readonly holding?: ReadonlySet<string>;
}

/**
 * ⭐ S189 — my estimate of a heard host's lobby age NOW, or null if it is unknown (a pre-S189
 * beacon, or no clock). An UNDER-estimate by construction: the age it sent, plus the time since it
 * ARRIVED (not since it was sent), minus `QM_AGE_MARGIN_MS`.
 */
export function qmEstimatedAgeMs(h: QmHeard, nowMs: number | undefined): number | null {
  if (h.ageMs === undefined || h.receivedAtMs === undefined || nowMs === undefined) return null;
  return h.ageMs + Math.max(0, nowMs - h.receivedAtMs) - QM_AGE_MARGIN_MS;
}

/**
 * ⭐ S189 — in MY view, does heard host `h` outrank me? The elder outranks; an exact tie (or an
 * unknown age) goes to the smaller code — the pre-S189 rule, kept as the tie-break.
 */
export function qmOutranksMe(
  h: QmHeard,
  myCode: string,
  myAgeMs: number,
  nowMs: number | undefined,
): boolean {
  const theirs = qmEstimatedAgeMs(h, nowMs);
  if (theirs !== null && theirs !== myAgeMs) return theirs > myAgeMs;
  return h.code < myCode;
}

/**
 * ⭐ S189 — the order a seeker (or a yielding host) picks its room in: known ages first, the ELDEST
 * first, then the smallest code. A TOTAL order — lexicographic on (age known, −age, code) — so the
 * pick never depends on `Map` iteration order. With no ages in play it is exactly the pre-S189
 * smallest-code-first.
 */
export function qmCompareRooms(a: QmHeard, b: QmHeard, nowMs: number | undefined): number {
  const ea = qmEstimatedAgeMs(a, nowMs);
  const eb = qmEstimatedAgeMs(b, nowMs);
  if ((ea === null) !== (eb === null)) return ea === null ? 1 : -1;
  if (ea !== null && eb !== null && ea !== eb) return eb - ea;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

const NO_HOLDS: ReadonlySet<string> = new Set();

/**
 * PURE election step. Given my state + the host beacons I've heard, decide the
 * single next action. Total + side-effect-free → exhaustively unit-testable.
 *
 * ⛔⛔ S189 — **WHY THIS CAN NEVER MAKE BOTH PEERS YIELD, which is the failure that matters.** Two
 * peerless hosts that each join the other have both torn their rooms down: two players stuck
 * joining dead rooms. (A pair that both HOLD is only slow — two lone hosts, same as a far
 * stranger.) Let D = a_X − a_P be the true age difference; it is CONSTANT, because both lobby ages
 * grow at the same rate. P's estimate of a_X is ≤ a_X − MARGIN, and X's of a_P ≤ a_P − MARGIN.
 *   · P yields directly ⇒ est_P(a_X) ≥ a_P ⇒ D ≥ MARGIN > 0.  X yields directly ⇒ D < 0. Never both.
 *   · Because D is constant, this holds whenever each side evaluates — no shared clock, no
 *     simultaneous tick needed.
 * A judgment is STICKY: the first time I judge a host I outrank, I never yield to it directly
 * afterwards, even if a later (less delayed) beacon makes it look older. Without that, jitter can
 * flip a hold into a yield while the other side is acting on my announced hold — the one hole.
 * The only way out of a sticky hold is a MUTUAL hold — each has judged it outranks the other (the
 * near-tie band, |D| ≲ MARGIN) — and that is broken by the code, which both sides read the same:
 * the larger code yields, once it SEES the other's hold naming it. The other has already judged,
 * stickily, so it cannot be yielding back.
 */
export function decideQuickmatch(
  state: QmDecisionState,
  heard: ReadonlyMap<string, QmHeard>,
): QmDecision {
  // Joinable = advertised, NOT full, and NOT my own code.
  const joinable: QmHeard[] = [];
  for (const a of heard.values()) {
    if (a.full) continue;
    if (state.myCode !== null && a.code === state.myCode) continue;
    joinable.push(a);
  }
  // ⭐ S189 — eldest first, then smallest code (a total order; see qmCompareRooms).
  joinable.sort((a, b) => qmCompareRooms(a, b, state.nowMs));

  if (state.role === 'seeking') {
    if (joinable.length > 0) return { kind: 'join', code: joinable[0].code };
    if (state.elapsedMs >= state.promoteDelayMs) return { kind: 'promote' };
    return { kind: 'wait' };
  }

  // role === 'hosting'
  if (state.hostHasPeers) return { kind: 'wait' }; // someone joined me — hold
  const myCode = state.myCode;
  if (myCode === null) return { kind: 'wait' }; // a host always has a code; total anyway
  const holding = state.holding ?? NO_HOLDS;
  const newHolds: string[] = [];
  // In rank order, so the first host I yield to is the eldest one I yield to.
  for (const a of joinable) {
    const judgedMine = holding.has(a.code) || !qmOutranksMe(a, myCode, state.elapsedMs, state.nowMs);
    if (!judgedMine) return { kind: 'join', code: a.code };
    // A MUTUAL hold: it has told me it outranks me, and I judge I outrank it. The code breaks it.
    if (a.code < myCode && a.holds !== undefined && a.holds.includes(myCode)) {
      return { kind: 'join', code: a.code };
    }
    if (!holding.has(a.code)) newHolds.push(a.code);
  }
  return newHolds.length > 0 ? { kind: 'wait', holds: newHolds } : { kind: 'wait' };
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

/**
 * ⭐ S182 — PURE beacon parse, EXPORTED so the trust boundary is testable without a Trystero room
 * (`#test-via-pure-helper-export`, the pattern `lobbyRoster.ts` names). Returns null for anything
 * that must not reach the election.
 *
 * ⛔⛔ **VALIDATE AT THE INGEST BOUNDARY, WHICH IS HERE AND NOWHERE DOWNSTREAM.**
 *
 * This accepted any `{t:'host', code:<string>}` published into the PUBLIC discovery room, and
 * `decideQuickmatch` sorts lexicographically and takes the smallest — so a junk string could win the
 * election outright. The first S182 self-audit tried to fix that in the LOBBY REDUCER
 * (`QM_JOIN_START`), and that was wrong twice over:
 *
 *   1. **IT DID NOT STOP THE ATTACK ITS OWN COMMENT DESCRIBED.** `isValidRoomCode('222222')` is
 *      TRUE — an attacker simply picks a well-formed code that sorts below every real one.
 *   2. **AND REFUSING THERE RE-CREATED THE VERY DESYNC THIS BRANCH EXISTS TO KILL.** By the time
 *      `applyQuickmatchJoining` runs, `tick()` has ALREADY called `teardownHost()` and `joinCode()`
 *      — the transport is irreversibly a client in someone else's room. A reducer returning `state`
 *      unchanged there leaves `mode === 'hosting'`: a peer painting "P1  HOST" while being a client.
 *      That IS the two-P1 bug, reintroduced on the malformed-code path by its own fix.
 *
 * ⭐ SO THE CHECK LIVES WHERE REFUSING IS STILL FREE. A rejected beacon never enters `heard`, never
 * reaches the election, and nothing downstream has committed. `parseRoomCode` is the net-layer
 * canonicaliser (`protocol.ts`), deliberately NOT `render/lobbyGeometry`'s `isValidRoomCode` —
 * `net/` must not import from `render/`.
 *
 * ⚠ AND THIS IS HYGIENE, NOT A SECURITY BOUNDARY. It cannot stop point 1. What actually stops a
 * hostile code is that the room does not answer — the join stalls and `joinTrust` surfaces it — and
 * that a host we cannot cryptographically verify never latches (`hostAuthFilter`).
 */
export function parseQmBeacon(raw: string): QmAnnouncement | null {
  try {
    const a = JSON.parse(raw) as Partial<Record<keyof QmAnnouncement, unknown>>;
    if (a.t !== 'host' || typeof a.code !== 'string') return null;
    const code = parseRoomCode(a.code, NET_ROOM_CODE_LENGTH);
    if (code === null) return null;
    /*
     * ⭐ S189 — the two new fields are validated HERE for the same reason the code is, and a bad one
     * is DROPPED rather than failing the beacon: an unusable age degrades that pair to the code rule,
     * which is a correct election, whereas refusing the beacon would hide a live room. (A hostile
     * peer can still claim a large age and win — the same hygiene-not-security limit as `222222`.)
     */
    const ageMs =
      typeof a.ageMs === 'number' && Number.isInteger(a.ageMs) && a.ageMs >= 0 && a.ageMs <= QM_MAX_AGE_MS
        ? a.ageMs
        : undefined;
    let holds: string[] | undefined;
    if (Array.isArray(a.holds)) {
      holds = [];
      for (const h of a.holds.slice(0, QM_MAX_HOLDS)) {
        const c = typeof h === 'string' ? parseRoomCode(h, NET_ROOM_CODE_LENGTH) : null;
        if (c !== null) holds.push(c);
      }
    }
    return {
      t: 'host',
      code,
      full: a.full === true,
      ...(ageMs !== undefined ? { ageMs } : {}),
      ...(holds !== undefined && holds.length > 0 ? { holds } : {}),
    };
  } catch {
    // Malformed JSON — ignore (a public stranger room can carry junk).
    return null;
  }
}



/** Well-known discovery room — version-scoped so only same-protocol peers meet. */
export const QM_DISCOVERY_ROOM = `spark-qm-v${PROTOCOL_VERSION}`;
/**
 * ⭐ S182 — EXPORTED so the election's timing contract can be pinned against the REAL values rather
 * than against literals re-typed in a test file. `quickmatch.test.ts` compared its own local copies
 * to each other, so the assertion held no matter what these became.
 */
export const ANNOUNCE_INTERVAL_MS = 2000;
export const TICK_INTERVAL_MS = 700;

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
 * ⭐ S189 — the slice of a Trystero room the discovery actually uses. Injectable (`QmDiscoveryDeps`)
 * so the REAL class — its tick, its announce, its bookkeeping — can be driven end-to-end by a test
 * bus instead of only its pure helpers; production passes the nostr room unchanged.
 */
export interface QmRoomLike {
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave(): Promise<void>;
}
export interface QmActionLike {
  send(data: string, options?: { target?: string }): Promise<void> | void;
  onMessage: ((data: string, ctx: { peerId: string }) => void) | null;
}
export interface QmDiscoveryDeps {
  /** Join the discovery room. May throw (relays unreachable) ⇒ this peer promotes to a lone host. */
  openRoom(): { room: QmRoomLike; action: QmActionLike };
  /** MONOTONIC ms clock. ⚠ Not `Date.now()`: a wall-clock step (NTP) mid-lobby would corrupt an age. */
  now(): number;
  /** Seeds the promote jitter (`qmPromoteDelayMs`). */
  readonly selfId: string;
}

const TRYSTERO_DEPS: QmDiscoveryDeps = {
  openRoom() {
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
    // makeAction returns an object in @trystero-p2p 0.25 (.send / .onMessage),
    // mirroring transport.ts's usage of the same API.
    const action = room.makeAction<string>('qm') as MessageAction<string>;
    return { room, action: action as unknown as QmActionLike };
  },
  now: () => performance.now(),
  selfId,
};

/**
 * Drives the discovery room: joins `spark-qm-v{PROTO}`, gossips/listens for
 * host beacons, and ticks the pure election. start() opens the room and begins
 * seeking; stop() leaves (called once committed — joined a room or a match
 * began). Everything decision-shaped is delegated to decideQuickmatch.
 */
export class QuickmatchDiscovery {
  private room: QmRoomLike | null = null;
  private action: QmActionLike | null = null;
  private readonly heard = new Map<string, QmHeard>();
  /**
   * ⭐ S189 — which code each discovery peer last announced, so its beacon can be DROPPED when that
   * peer leaves the room. `heard` used to keep a beacon forever: a host that went into a match (it
   * leaves discovery) or closed its tab stayed joinable until this peer's own discovery stopped.
   * With ages that matters more — a stale beacon's estimated age keeps growing, so it would keep
   * winning. `onPeerLeave` is an EVENT, so a timer-throttled background tab cannot starve it.
   */
  private readonly codeByPeer = new Map<string, string>();
  /** ⭐ S189 — codes I have judged I outrank. Sticky for this discovery session; see decideQuickmatch. */
  private readonly holding = new Set<string>();
  private role: 'seeking' | 'hosting' = 'seeking';
  private myCode: string | null = null;
  private startedMs = 0;
  private readonly promoteDelayMs: number;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(
    private readonly callbacks: QuickmatchCallbacks,
    private readonly deps: QmDiscoveryDeps = TRYSTERO_DEPS,
  ) {
    this.promoteDelayMs = qmPromoteDelayMs(deps.selfId);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.role = 'seeking';
    this.myCode = null;
    this.heard.clear();
    this.codeByPeer.clear();
    this.holding.clear();
    this.startedMs = this.deps.now();
    try {
      const { room, action } = this.deps.openRoom();
      this.room = room;
      this.action = action;
      action.onMessage = (data, ctx) => this.onBeacon(data, ctx.peerId);
      /*
       * ⭐ S189 — ANNOUNCE ON JOIN. A newcomer can only join an incumbent it has HEARD, and the only
       * beacon used to be a 2 s interval — so a newcomer whose channel opened just after a tick waited
       * up to 2 s more, inside its own 2–3.5 s promote window. Now the incumbent answers the moment
       * the channel opens, which turns more of those races into a direct join. Also robust to a
       * backgrounded incumbent: timers are throttled there, network events are not.
       */
      room.onPeerJoin = (peerId) => {
        if (this.active && this.role === 'hosting') this.sendAnnounce(peerId);
      };
      room.onPeerLeave = (peerId) => this.onPeerLeave(peerId);
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
      this.room.onPeerJoin = null;
      this.room.onPeerLeave = null;
      void this.room.leave().catch(() => undefined);
      this.room = null;
    }
    this.heard.clear();
    this.codeByPeer.clear();
    this.holding.clear();
  }

  private onBeacon(raw: string, peerId: string): void {
    const a = parseQmBeacon(raw);
    if (a === null) return;
    const prev = this.codeByPeer.get(peerId);
    if (prev !== undefined && prev !== a.code) this.heard.delete(prev);
    this.codeByPeer.set(peerId, a.code);
    this.heard.set(a.code, { ...a, receivedAtMs: this.deps.now() });
  }

  private onPeerLeave(peerId: string): void {
    const code = this.codeByPeer.get(peerId);
    this.codeByPeer.delete(peerId);
    if (code !== undefined) this.heard.delete(code);
  }

  private tick(): void {
    if (!this.active) return;
    const now = this.deps.now();
    const decision = decideQuickmatch(
      {
        role: this.role,
        myCode: this.myCode,
        hostHasPeers: this.role === 'hosting' && this.callbacks.hostPeerCount() > 0,
        elapsedMs: now - this.startedMs,
        promoteDelayMs: this.promoteDelayMs,
        nowMs: now,
        holding: this.holding,
      },
      this.heard,
    );
    if (decision.kind === 'promote') {
      this.promote();
    } else if (decision.kind === 'join') {
      if (this.role === 'hosting') this.callbacks.teardownHost();
      this.callbacks.joinCode(decision.code);
      this.stop(); // committed — leave discovery
    } else if (decision.holds !== undefined && decision.holds.length > 0) {
      // ⭐ S189 — record the new judgments (sticky) and tell the room NOW: a mutual hold resolves
      // only once the other side has seen this list, so there is no reason to wait for the cadence.
      for (const c of decision.holds) this.holding.add(c);
      this.sendAnnounce();
    }
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

  private sendAnnounce(target?: string): void {
    if (this.action === null || this.myCode === null) return;
    const full = this.callbacks.hostPeerCount() >= MAX_PLAYERS - 1;
    // Only holds against hosts still in the room — a departed one needs no answer. Sorted: a
    // stable wire order, so the cap drops the same entries every time.
    const holds = [...this.holding].filter((c) => this.heard.has(c)).sort().slice(0, QM_MAX_HOLDS);
    const msg: QmAnnouncement = {
      t: 'host',
      code: this.myCode,
      full,
      // Floored: a reported age may only ever be at or below the truth (decideQuickmatch's proof).
      ageMs: Math.max(0, Math.floor(this.deps.now() - this.startedMs)),
      ...(holds.length > 0 ? { holds } : {}),
    };
    const json = JSON.stringify(msg);
    const sent = target === undefined ? this.action.send(json) : this.action.send(json, { target });
    void Promise.resolve(sent).catch(() => undefined);
  }
}
