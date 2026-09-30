/**
 * PITCH MASTERS (arcade) — the 1v1 matchmaker behind `window.PitchNet`.
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/` (copied here by its
 * `tools/build_web.py`). Transport-agnostic on purpose: it drives any `RoomLike` (Trystero in the
 * page, an in-memory bus in `matchmaker.test.ts`), so the pairing rules are tested without a relay.
 *
 * ## Quick match: two strangers, one pair, no server
 *
 * Every seeker joins the discovery room `pitchmasters-qm-v1` and broadcasts `hello {since, busy}`
 * each second. `since` is the sender's OWN search-start time, announced, so every peer orders every
 * seeker the same way: seniority = (since, peerId), smaller = elder. A free seeker PROPOSES only to
 * its eldest free peer, and only when that peer is elder than itself. Proposals therefore always
 * point at an elder, so they can never form a cycle or cross; the eldest seeker waits and receives.
 * `propose -> accept{room} -> confirm` locks the pair (4 s proposer / 6 s acceptor timeouts, a busy
 * seeker rejects), both say `bye`, leave discovery and meet in the random private room the ACCEPTOR
 * named. The acceptor (the elder) HOSTS: Spark S189's lesson that the one who was there first keeps
 * the room, instead of a per-page-load constant deciding it.
 *   - A third seeker is rejected by a locked pair and simply keeps searching.
 *   - A partner who never shows up in the private room (25 s) sends us back to discovery with our
 *     ORIGINAL `since`, so we keep our place in the queue.
 *   - Clock skew between two PCs only changes WHO hosts, never whether the pair forms: both sides
 *     compare the same announced numbers.
 *
 * ## Play a friend
 * `friendHost()` returns a 5-letter code (no I/O/0/1) and waits in `pitchmasters-f-<CODE>`;
 * `friendJoin(code)` joins it. A third player with the same code is told the game is full.
 *
 * ## In the match room
 * Both send `hi {role, v, build}`; each binds the first complementary peer (a quick-match pair binds
 * only the peer it paired with). Packets are base64 strings on the `pk` channel.
 *
 * ## Surviving a network blip (PM-S2 online2)
 * A `bye` (cancel, closed tab) ends the match at once. Anything else is treated as a blip first:
 *   - every packet carries a sequence number (`<seq>:<b64>`) and stays in an outbox until the partner
 *     acknowledges it (the 1 s `ping` carries `ack`, the last in-order seq received);
 *   - the receiver delivers strictly in order, drops duplicates, and answers a gap with `nack`;
 *   - when WebRTC drops the partner (Trystero closes a peer after 5 s of ICE `disconnected`), we keep the
 *     match room: the same peer id rejoins on the next announce, both re-send `hi {ack}`, and each side
 *     re-sends what the other has not acknowledged. The game sees one late burst and nothing lost.
 *   - `stalled` (status) is true after 3 s of silence or while the partner is gone; only after
 *     SILENCE_MS (30 s) without a word is the match `closed` (time this page itself was frozen, e.g. by a
 *     long synchronous game load, does not count: SELF_FREEZE_MS). Loading a match (3D stadium, crowd,
 *     federation art, shader warm-up) blocks the main thread, timers included: 7-9 s measured on a desktop
 *     GPU under load, and a 10 s limit dropped real games right at kick-off.
 * The heartbeat also measures the round trip (`ping {ts}` -> `pong {ts}`, status `rtt` in ms) and tells
 * the partner whether this tab is hidden (`h`), so the other side can say so.
 */

export const PM_PROTO = 1;
export const DISCOVERY_ROOM = `pitchmasters-qm-v${PM_PROTO}`;
export const FRIEND_ROOM_PREFIX = 'pitchmasters-f-';
export const MATCH_ROOM_PREFIX = 'pitchmasters-m-';
export const HELLO_EVERY_MS = 1000;
export const PEER_STALE_MS = 4000;
export const PROPOSE_TIMEOUT_MS = 4000;
export const LOCK_TIMEOUT_MS = 6000;
export const REJECT_COOLDOWN_MS = 3000;
export const NO_ANSWER_COOLDOWN_MS = 8000;
export const MATCH_ROOM_TIMEOUT_MS = 25000;
export const FRIEND_JOIN_TIMEOUT_MS = 45000;
export const HEARTBEAT_MS = 1000;
/**
 * Reconnect grace: a partner silent this long (no bye) is gone. PM-S2 online2: was 10 s. 30 s because a
 * page is ALSO silent while its own main thread is blocked (Godot loads a match scene synchronously: seconds
 * on a weak laptop, 20 s+ on the loaded test machine), and a closed tab says `bye` on pagehide anyway.
 */
export const SILENCE_MS = 30000;
/**
 * The page's own timer went this long without firing: this page was frozen (a long synchronous game load).
 * The partner's silence during our own freeze is not theirs, so it is not counted (a hidden tab's timers
 * still fire about once a second while WebRTC is open, well under this).
 */
export const SELF_FREEZE_MS = 3000;
/** Silence after which the status says `stalled` (the game shows "reconnecting"). */
export const STALL_MS = 3000;
/**
 * PM-S3: a rejoin can fail silently. With flaky Nostr relays (live harness: a relay answering 301 to every
 * handshake, another 524) the re-signaling after a blip sometimes never completes: both sides stayed
 * `matched` + stalled until the 30 s grace closed the match. So the CLIENT, while the host is gone, leaves and
 * rejoins the match room once more (fresh signaling on every relay) REJOIN_FIRST_MS after its last join, then
 * every REJOIN_NEXT_MS, until the host's `hi` / `ping` or the grace.
 * Only the client, and only after a long wait: a first version (d1cc5c2) let BOTH sides retry after 4 s. A
 * WebRTC re-negotiation through the relays takes longer than that, so each side kept tearing down the
 * handshake the other had just started and the match never recovered, even on healthy relays (live harness,
 * 3 tests, reproduced locally). The host is the anchor: it never leaves the room.
 */
export const REJOIN_FIRST_MS = 12000;
export const REJOIN_NEXT_MS = 9000;
/** Packets kept for re-sending until acknowledged (20 Hz snapshots: ~200 s worth). */
export const OUTBOX_MAX = 4000;
export const NACK_EVERY_MS = 500;
/** How long a room we leave stays open so the last message (confirm, bye) is still delivered. */
export const LINGER_MS = 1500;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;

export type NetState = 'idle' | 'seeking' | 'connecting' | 'matched' | 'closed' | 'error';
export type Role = 'host' | 'client' | '';
export type Mode = 'quick' | 'friend' | '';
export type Channel = 'ctl' | 'pk';

/** One Trystero room, reduced to what the matchmaker needs. */
export interface RoomLike {
  send(channel: Channel, data: string, to?: string): void;
  leave(): void;
}

export interface RoomHandlers {
  onMessage(channel: Channel, data: string, from: string): void;
  onPeerJoin(peer: string): void;
  onPeerLeave(peer: string): void;
}

export type RoomFactory = (roomId: string, handlers: RoomHandlers) => RoomLike;

export interface MatchmakerDeps {
  readonly selfId: string;
  readonly join: RoomFactory;
  /** Monotonic ms, for timeouts. */
  readonly now: () => number;
  /** Wall-clock epoch ms: the announced search start. */
  readonly wallNow: () => number;
  /** [0, 1) */
  readonly random: () => number;
  readonly log?: (msg: string) => void;
}

export interface PitchNetStatus {
  state: NetState;
  role: Role;
  mode: Mode;
  code: string;
  detail: string;
  /** Seconds since the search started. */
  elapsed: number;
  /** Round trip to the partner in ms (smoothed), -1 until measured. */
  rtt: number;
  /** Matched, but the partner is silent or reconnecting. */
  stalled: boolean;
  /** Seconds since the partner was last heard (while stalled), else 0. */
  stalledFor: number;
  /** The partner's tab is in the background. */
  partnerHidden: boolean;
  /** Quick match: players searching right now in this build, including us (0 when not searching). */
  seekers: number;
}

interface Seeker {
  since: number;
  build: string;
  busy: boolean;
  lastSeen: number;
}

type Phase =
  | { k: 'free' }
  | { k: 'proposing'; to: string; nonce: string; until: number }
  | { k: 'locked'; from: string; nonce: string; room: string; until: number };

/** PURE — does seeker `a` outrank (is it elder than) seeker `b`? A total order both sides agree on. */
export function isElder(a: { id: string; since: number }, b: { id: string; since: number }): boolean {
  return a.since < b.since || (a.since === b.since && a.id < b.id);
}

/** PURE — normalise what a player typed as a friend code; null if it cannot be one. */
export function parseFriendCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (code.length < 4 || code.length > 8) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class Matchmaker {
  build = 'dev';

  private state: NetState = 'idle';
  private role: Role = '';
  private mode: Mode = '';
  private code = '';
  private detail = '';
  private startedAt = 0;
  private since = 0;

  // discovery
  private disco: RoomLike | null = null;
  /** Rooms we are leaving: kept open briefly so a last confirm / bye still goes out. */
  private lingering: { room: RoomLike; at: number }[] = [];
  private readonly seekers = new Map<string, Seeker>();
  private readonly cooldown = new Map<string, number>();
  private phase: Phase = { k: 'free' };
  private lastHello = -Infinity;

  // match room
  private room: RoomLike | null = null;
  private roomDeadline = Infinity;
  private expect: string | null = null;
  private partner: string | null = null;
  private readonly hiSent = new Set<string>();
  private lastHeard = 0;
  /** When tick() last ran (self-freeze detection). */
  private lastTickAt = -1;
  private lastPing = 0;
  private inbox: string[] = [];
  private epoch = 0;
  // PM-S2 online2: reliable resume, round trip, visibility, discovery head count
  private roomId = '';
  private roomHandlers: RoomHandlers | null = null;
  private partnerPresent = false;
  private sendSeq = 0;
  private recvSeq = 0;
  private outbox: { seq: number; data: string }[] = [];
  private lastNack = -Infinity;
  private rtt = -1;
  private selfHidden = false;
  private partnerHidden = false;
  private seekerCount = 0;
  private blipUntil = 0;
  /** Client only: when to leave + rejoin the match room while the host is gone (0 = not scheduled). */
  private rejoinAt = 0;
  /** Rejoins made since the partner was last present (status + tests). */
  rejoins = 0;

  constructor(private readonly deps: MatchmakerDeps) {}

  // ── the window.PitchNet surface ──────────────────────────────────────────────

  quickMatch(): void {
    this.cancel();
    this.mode = 'quick';
    this.startedAt = this.deps.now();
    this.since = this.deps.wallNow();
    this.enterDiscovery();
  }

  friendHost(): string {
    this.cancel();
    this.mode = 'friend';
    this.startedAt = this.deps.now();
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[Math.floor(this.deps.random() * CODE_ALPHABET.length)];
    this.code = code;
    this.enterMatchRoom(FRIEND_ROOM_PREFIX + code, 'host', null, Infinity);
    this.set('seeking', 'Waiting for your friend to join…');
    return code;
  }

  friendJoin(raw: string): void {
    this.cancel();
    this.mode = 'friend';
    this.startedAt = this.deps.now();
    const code = parseFriendCode(raw);
    if (code === null) {
      this.set('error', 'That is not a game code. Codes are letters and digits, like K7M4Q.');
      return;
    }
    this.code = code;
    this.enterMatchRoom(FRIEND_ROOM_PREFIX + code, 'client', null, this.deps.now() + FRIEND_JOIN_TIMEOUT_MS);
    this.set('seeking', `Looking for game ${code}…`);
  }

  cancel(): void {
    this.leaveDiscovery();
    this.leaveMatchRoom(true);
    this.epoch++;
    this.state = 'idle';
    this.role = '';
    this.mode = '';
    this.code = '';
    this.detail = '';
    this.inbox = [];
  }

  status(): PitchNetStatus {
    const running = this.state !== 'idle';
    const now = this.deps.now();
    const matched = this.state === 'matched';
    const stalled = matched && (!this.partnerPresent || now - this.lastHeard > STALL_MS);
    return {
      state: this.state,
      role: this.role,
      mode: this.mode,
      code: this.code,
      detail: this.detail,
      elapsed: running ? Math.max(0, (now - this.startedAt) / 1000) : 0,
      rtt: matched ? Math.round(this.rtt) : -1,
      stalled,
      stalledFor: stalled ? Math.max(0, (now - this.lastHeard) / 1000) : 0,
      partnerHidden: matched && this.partnerHidden,
      seekers: this.disco !== null ? this.seekerCount : 0,
    };
  }

  /** Queue one packet for the partner; it is re-sent after a blip until acknowledged. */
  send(b64: string): boolean {
    if (this.state !== 'matched' || this.room === null || this.partner === null) return false;
    const seq = ++this.sendSeq;
    this.outbox.push({ seq, data: b64 });
    if (this.outbox.length > OUTBOX_MAX) this.outbox.shift();
    if (this.partnerPresent) this.room.send('pk', `${seq}:${b64}`, this.partner);
    return true;
  }

  /** The page tells us when its tab is hidden / shown; the partner is told at once. */
  setHidden(hidden: boolean): void {
    if (this.selfHidden === hidden) return;
    this.selfHidden = hidden;
    if (this.state === 'matched' && this.partner !== null && this.partnerPresent) {
      this.room?.send('ctl', JSON.stringify({ t: 'vis', h: hidden }), this.partner);
    }
  }

  /**
   * Test hook (the page exposes it only with ?netdebug=1): drop off the match room for `ms`, with no
   * `bye`, then rejoin it: a real transport-level disconnect + reconnect with the same peer id.
   */
  blip(ms: number): boolean {
    if (this.state !== 'matched' || this.room === null || this.roomHandlers === null) return false;
    this.log(`blip: off the room for ${ms} ms`);
    this.room.leave();
    this.room = { send: () => undefined, leave: () => undefined };
    this.partnerPresent = false;
    this.hiSent.clear();
    this.blipUntil = this.deps.now() + Math.max(0, ms);
    return true;
  }

  poll(): string[] {
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  /** Drive timers. The page calls this every 250 ms. */
  tick(): void {
    const now = this.deps.now();
    const gap = this.lastTickAt < 0 ? 0 : now - this.lastTickAt;
    this.lastTickAt = now;
    if (gap > SELF_FREEZE_MS && this.state === 'matched') {
      // We were frozen ourselves: whatever the partner said meanwhile is still queued behind this tick.
      this.lastHeard = Math.min(now, this.lastHeard + gap);
      this.log(`this page was frozen for ${(gap / 1000).toFixed(1)} s: not counted against the partner`);
    }
    if (this.lingering.length > 0) {
      const due = this.lingering.filter((l) => now >= l.at);
      this.lingering = this.lingering.filter((l) => now < l.at);
      for (const l of due) l.room.leave();
    }
    if (this.disco !== null) this.tickDiscovery(now);
    if (this.blipUntil > 0 && now >= this.blipUntil) {
      this.blipUntil = 0;
      if (this.room !== null && this.roomHandlers !== null) {
        this.log('blip over: rejoining the match room');
        this.room = this.deps.join(this.roomId, this.roomHandlers);
        this.scheduleRejoin(now);
      }
    }
    if (this.room !== null) this.tickRoom(now);
  }

  // ── discovery (quick match) ──────────────────────────────────────────────────

  private enterDiscovery(): void {
    this.flushLingering();
    this.seekers.clear();
    this.cooldown.clear();
    this.phase = { k: 'free' };
    this.lastHello = -Infinity;
    this.role = '';
    const epoch = ++this.epoch;
    this.set('seeking', 'Searching for an opponent…');
    this.disco = this.deps.join(DISCOVERY_ROOM, {
      onMessage: (ch, data, from) => {
        if (epoch === this.epoch && ch === 'ctl') this.onDisco(data, from);
      },
      onPeerJoin: (peer) => {
        if (epoch === this.epoch) this.hello(peer);
      },
      onPeerLeave: (peer) => {
        if (epoch !== this.epoch) return;
        this.seekers.delete(peer);
        if (this.phase.k === 'proposing' && this.phase.to === peer) this.phase = { k: 'free' };
        if (this.phase.k === 'locked' && this.phase.from === peer) this.phase = { k: 'free' };
      },
    });
  }

  private leaveDiscovery(): void {
    if (this.disco === null) return;
    this.disco.send('ctl', JSON.stringify({ t: 'bye' }));
    this.linger(this.disco);
    this.disco = null;
    this.seekers.clear();
    this.phase = { k: 'free' };
  }

  private hello(to?: string): void {
    this.disco?.send('ctl', JSON.stringify({ t: 'hello', v: PM_PROTO, build: this.build, since: this.since, busy: this.phase.k !== 'free' }), to);
  }

  private onDisco(raw: string, from: string): void {
    const m = parse(raw);
    if (m === null || this.disco === null) return;
    const now = this.deps.now();
    const nonce = typeof m.nonce === 'string' ? m.nonce : '';
    switch (m.t) {
      case 'hello': {
        if (m.v !== PM_PROTO || typeof m.since !== 'number' || typeof m.build !== 'string') return;
        this.seekers.set(from, { since: m.since, build: m.build, busy: m.busy === true, lastSeen: now });
        return;
      }
      case 'bye':
        this.seekers.delete(from);
        return;
      case 'propose': {
        const s = this.seekers.get(from);
        if (this.phase.k !== 'free' || s === undefined || s.build !== this.build) {
          this.disco.send('ctl', JSON.stringify({ t: 'reject', nonce }), from);
          return;
        }
        const room = MATCH_ROOM_PREFIX + this.deps.selfId.slice(0, 8) + '-' + this.token(12);
        this.phase = { k: 'locked', from, nonce, room, until: now + LOCK_TIMEOUT_MS };
        this.disco.send('ctl', JSON.stringify({ t: 'accept', nonce, room }), from);
        this.log(`locked by ${from.slice(0, 6)}`);
        return;
      }
      case 'accept': {
        const room = typeof m.room === 'string' && m.room.startsWith(MATCH_ROOM_PREFIX) ? m.room : '';
        if (this.phase.k === 'proposing' && this.phase.to === from && this.phase.nonce === nonce && room !== '') {
          this.disco.send('ctl', JSON.stringify({ t: 'confirm', nonce }), from);
          this.paired(room, 'client', from);
        } else {
          this.disco.send('ctl', JSON.stringify({ t: 'cancel', nonce }), from);
        }
        return;
      }
      case 'confirm':
        if (this.phase.k === 'locked' && this.phase.from === from && this.phase.nonce === nonce) {
          this.paired(this.phase.room, 'host', from);
        }
        return;
      case 'reject':
        if (this.phase.k === 'proposing' && this.phase.to === from && this.phase.nonce === nonce) {
          this.phase = { k: 'free' };
          this.cooldown.set(from, now + REJECT_COOLDOWN_MS);
        }
        return;
      case 'cancel':
        if (this.phase.k === 'locked' && this.phase.from === from && this.phase.nonce === nonce) {
          this.phase = { k: 'free' };
        }
        return;
    }
  }

  private tickDiscovery(now: number): void {
    for (const [id, s] of this.seekers) if (now - s.lastSeen > PEER_STALE_MS) this.seekers.delete(id);
    if (this.phase.k === 'proposing' && now > this.phase.until) {
      this.cooldown.set(this.phase.to, now + NO_ANSWER_COOLDOWN_MS);
      this.phase = { k: 'free' };
    } else if (this.phase.k === 'locked' && now > this.phase.until) {
      this.phase = { k: 'free' };
    }
    if (now - this.lastHello >= HELLO_EVERY_MS) {
      this.lastHello = now;
      this.hello();
    }
    let same = 0;
    for (const s of this.seekers.values()) if (s.build === this.build) same++;
    this.seekerCount = same + 1;
    if (this.phase.k !== 'free') return;
    const me = { id: this.deps.selfId, since: this.since };
    let best: { id: string; since: number } | null = null;
    let others = 0;
    for (const [id, s] of this.seekers) {
      if (s.build !== this.build) continue;
      others++;
      if (s.busy || (this.cooldown.get(id) ?? 0) > now) continue;
      const c = { id, since: s.since };
      if (best === null || isElder(c, best)) best = c;
    }
    this.detail = others > 0 ? 'Player found, pairing…' : 'Searching for an opponent…';
    if (best !== null && isElder(best, me)) {
      const nonce = this.token(8);
      this.phase = { k: 'proposing', to: best.id, nonce, until: now + PROPOSE_TIMEOUT_MS };
      this.disco?.send('ctl', JSON.stringify({ t: 'propose', nonce }), best.id);
      this.log(`propose -> ${best.id.slice(0, 6)}`);
    }
  }

  private paired(room: string, role: 'host' | 'client', partner: string): void {
    this.log(`paired as ${role} with ${partner.slice(0, 6)} in ${room}`);
    this.leaveDiscovery();
    this.enterMatchRoom(room, role, partner, this.deps.now() + MATCH_ROOM_TIMEOUT_MS);
    this.set('connecting', 'Opponent found, connecting…');
  }

  // ── match room (quick pair or friend code) ───────────────────────────────────

  private enterMatchRoom(roomId: string, role: 'host' | 'client', expect: string | null, deadline: number): void {
    this.leaveMatchRoom(false);
    if (!roomId.startsWith(MATCH_ROOM_PREFIX)) this.flushLingering();
    this.role = role;
    this.expect = expect;
    this.partner = null;
    this.hiSent.clear();
    this.roomDeadline = deadline;
    this.partnerPresent = false;
    this.sendSeq = 0;
    this.recvSeq = 0;
    this.outbox = [];
    this.lastNack = -Infinity;
    this.rtt = -1;
    this.partnerHidden = false;
    this.blipUntil = 0;
    this.resetRejoin();
    const epoch = ++this.epoch;
    const handlers: RoomHandlers = {
      onMessage: (ch, data, from) => {
        if (epoch === this.epoch) this.onRoom(ch, data, from);
      },
      onPeerJoin: (peer) => {
        if (epoch !== this.epoch) return;
        if (this.partner === null) this.sayHi(peer);
        else if (peer === this.partner) {
          // The partner is back after a blip: shake hands again, then both re-send what is unacked.
          this.hiSent.delete(peer);
          this.sayHi(peer);
        } else if (this.role === 'host') this.room?.send('ctl', JSON.stringify({ t: 'full' }), peer);
      },
      onPeerLeave: (peer) => {
        if (epoch !== this.epoch || peer !== this.partner) return;
        if (this.state === 'matched') {
          // Not a bye: maybe a blip. Keep the room and wait for the same peer (SILENCE_MS grace).
          this.partnerPresent = false;
          this.hiSent.delete(peer);
          this.log('partner dropped: waiting for a reconnect');
          this.scheduleRejoin(this.deps.now());
        } else {
          this.lost('Your opponent left the match.');
        }
      },
    };
    this.roomId = roomId;
    this.roomHandlers = handlers;
    this.room = this.deps.join(roomId, handlers);
  }

  private leaveMatchRoom(sayBye: boolean): void {
    if (this.room === null) return;
    if (sayBye && this.partner !== null) {
      this.room.send('ctl', JSON.stringify({ t: 'bye' }), this.partner);
      this.linger(this.room);
    } else {
      this.room.leave();
    }
    this.room = null;
    this.partner = null;
    this.expect = null;
    this.hiSent.clear();
    this.roomHandlers = null;
    this.partnerPresent = false;
    this.outbox = [];
    this.blipUntil = 0;
    this.resetRejoin();
  }

  private resetRejoin(): void {
    this.rejoinAt = 0;
    this.rejoins = 0;
  }

  /** Client only: (re)start the wait for the host after our own (re)join or the host dropping. */
  private scheduleRejoin(now: number): void {
    if (this.role === 'client') this.rejoinAt = now + REJOIN_FIRST_MS;
  }

  /** The host is still gone long after our (re)join: rejoin the match room with fresh signaling. */
  private tickRejoin(now: number): void {
    if (this.role !== 'client' || this.state !== 'matched' || this.partner === null || this.blipUntil > 0
      || this.roomHandlers === null || this.partnerPresent || this.rejoinAt === 0 || now < this.rejoinAt) return;
    this.rejoins++;
    this.log(`host still gone ${((now - this.lastHeard) / 1000).toFixed(0)} s: rejoining the match room (try ${this.rejoins})`);
    this.room?.leave();
    this.room = this.deps.join(this.roomId, this.roomHandlers);
    this.rejoinAt = now + REJOIN_NEXT_MS;
  }

  private sayHi(peer: string): void {
    if (this.room === null || this.hiSent.has(peer)) return;
    this.hiSent.add(peer);
    this.room.send('ctl', JSON.stringify({ t: 'hi', v: PM_PROTO, build: this.build, role: this.role, ack: this.recvSeq }), peer);
  }

  /** The partner has everything up to `ack`: forget it. */
  private trim(ack: unknown): void {
    if (typeof ack !== 'number') return;
    while (this.outbox.length > 0 && this.outbox[0].seq <= ack) this.outbox.shift();
  }

  private resend(): void {
    if (this.room === null || this.partner === null || !this.partnerPresent) return;
    for (const e of this.outbox) this.room.send('pk', `${e.seq}:${e.data}`, this.partner);
    if (this.outbox.length > 0) this.log(`re-sent ${this.outbox.length} unacked packets`);
  }

  private onRoom(ch: Channel, data: string, from: string): void {
    if (this.room === null) return;
    if (from === this.partner) this.lastHeard = this.deps.now();
    if (ch === 'pk') {
      if (from !== this.partner || this.state !== 'matched') return;
      const cut = data.indexOf(':');
      const seq = Number(data.slice(0, cut));
      if (cut <= 0 || !Number.isInteger(seq)) return;
      if (seq === this.recvSeq + 1) {
        this.recvSeq = seq;
        this.inbox.push(data.slice(cut + 1));
      } else if (seq > this.recvSeq + 1) {
        // A gap: something was lost on the way. Ask for everything after what we have.
        const now = this.deps.now();
        if (now - this.lastNack >= NACK_EVERY_MS) {
          this.lastNack = now;
          this.room.send('ctl', JSON.stringify({ t: 'nack', ack: this.recvSeq }), from);
        }
      }
      return;
    }
    const m = parse(data);
    if (m === null) return;
    switch (m.t) {
      case 'hi': {
        const theirs = m.role === 'host' || m.role === 'client' ? m.role : '';
        if (this.partner !== null) {
          if (from === this.partner) {
            // Resume after a blip.
            const back = !this.partnerPresent;
            this.partnerPresent = true;
            this.sayHi(from);
            this.trim(m.ack);
            this.resend();
            if (back) this.log('partner back: resumed');
            this.resetRejoin();
            return;
          }
          if (this.role === 'host') this.room.send('ctl', JSON.stringify({ t: 'full' }), from);
          return;
        }
        if (theirs === '' || theirs === this.role) return;
        if (this.expect !== null && from !== this.expect) return;
        if (m.v !== PM_PROTO || m.build !== this.build) {
          if (this.mode === 'friend') {
            this.fail('You and your friend have different versions of the game. Both reload the page.');
          }
          return;
        }
        this.partner = from;
        this.partnerPresent = true;
        this.lastHeard = this.deps.now();
        this.lastPing = 0;
        this.sayHi(from);
        this.set('matched', 'Connected');
        this.log(`matched as ${this.role} with ${from.slice(0, 6)}`);
        return;
      }
      case 'full':
        if ((this.partner === null || from === this.partner) && this.role === 'client') {
          this.fail('That game already has two players.');
        }
        return;
      case 'bye':
        if (from === this.partner) this.lost('Your opponent left the match.');
        return;
      case 'ping':
        if (from !== this.partner) return;
        this.partnerPresent = true;
        if (this.rejoinAt !== 0) this.resetRejoin();
        this.trim(m.ack);
        this.partnerHidden = m.h === true;
        this.room.send('ctl', JSON.stringify({ t: 'pong', ts: m.ts }), from);
        return;
      case 'pong': {
        if (from !== this.partner || typeof m.ts !== 'number') return;
        const v = Math.max(0, this.deps.now() - m.ts);
        this.rtt = this.rtt < 0 ? v : this.rtt * 0.7 + v * 0.3;
        return;
      }
      case 'nack':
        if (from !== this.partner) return;
        this.trim(m.ack);
        this.resend();
        return;
      case 'vis':
        if (from === this.partner) this.partnerHidden = m.h === true;
        return;
    }
  }

  private tickRoom(now: number): void {
    if (this.partner === null) {
      if (now <= this.roomDeadline) return;
      if (this.mode === 'quick') {
        this.log('partner never arrived: back to the queue');
        this.leaveMatchRoom(false);
        this.enterDiscovery(); // keeps `since`: our place in the queue
      } else {
        this.fail(`No game found with code ${this.code}. Check the code and that your friend is waiting.`);
      }
      return;
    }
    this.tickRejoin(now);
    if (now - this.lastPing >= HEARTBEAT_MS) {
      this.lastPing = now;
      this.room?.send('ctl', JSON.stringify({ t: 'ping', ack: this.recvSeq, ts: now, h: this.selfHidden }), this.partner);
    }
    if (now - this.lastHeard > SILENCE_MS) this.lost('Connection to your opponent was lost.');
  }

  private lost(msg: string): void {
    if (this.state !== 'matched' && this.state !== 'connecting') {
      this.leaveMatchRoom(false);
      if (this.mode === 'quick') this.enterDiscovery();
      return;
    }
    this.leaveMatchRoom(false);
    this.set('closed', msg);
  }

  private fail(msg: string): void {
    this.leaveDiscovery();
    this.leaveMatchRoom(false);
    this.set('error', msg);
  }

  private linger(room: RoomLike): void {
    this.lingering.push({ room, at: this.deps.now() + LINGER_MS });
  }

  private flushLingering(): void {
    for (const l of this.lingering) l.room.leave();
    this.lingering = [];
  }

  private set(state: NetState, detail: string): void {
    this.state = state;
    this.detail = detail;
  }

  private token(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(this.deps.random() * 16).toString(16);
    return s;
  }

  private log(msg: string): void {
    this.deps.log?.(msg);
  }
}
