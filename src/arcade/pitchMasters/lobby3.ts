/**
 * PITCH MASTERS (arcade) — the THREE-SIDED room behind `window.PitchNet` (PM-S4 P3).
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/` (copied here by its
 * `tools/build_web.py`). Like `matchmaker.ts` it drives any `RoomLike`, so `lobby3.test.ts` runs it over an
 * in-memory bus. The 1v1 `Matchmaker` is NOT changed by this file: `bridge.ts` hands the page's calls to
 * whichever of the two is active.
 *
 * ## Star, not mesh
 * A Trystero room is a mesh, but a three-sided match is a star: the host simulates and talks to each client;
 * the two clients never exchange a packet (the Godot side runs with `server_relay = false`, and a hand sent
 * to one seat must never reach the other). Each client link is the pair logic of `matchmaker.ts` once per
 * partner: `<seq>:<b64>` packets, an outbox until acked (`ping {ack}`), in-order delivery, `nack` on a gap,
 * a blip keeps the room and re-sends, SILENCE_MS without a word ends only THAT seat (the game gives it to a
 * bot and plays on).
 *
 * ## Play friends (3 humans, or 2 humans + 1 AI)
 * `friendHost3()` returns a 6-letter code (the 1v1 codes have 5, so `friendJoin(code)` knows which room to
 * look in) and opens `pitchmasters-f3-<CODE>`. The host's state is `matched` at once: its game shows the
 * lobby ("1 / 2 friends joined") and may START WITH AI whenever it likes, which calls `lock()`: from then on
 * a newcomer is told the game is full. Seats: host = Godot peer 1, clients 2 then 3 (the lowest free one).
 *
 * ## Quick match three-sided (qm3): a thin layer over the proven pair logic
 * A second `Matchmaker` runs the unchanged pairing in its own discovery room `pitchmasters-qm3-v<PROTO>`.
 * When it pairs, it hands the pair to us (`onPaired`) instead of entering its match room: the elder becomes a
 * lobby host in that room, the younger its first client. The lobby host also stands in the qm3 discovery
 * room and announces `lobby3 {room, free}` every second for QM3_OPEN_MS; a seeker who hears it leaves the
 * queue and joins that room (the host accepts while a seat is free, else says `full` and the seeker goes back
 * to the queue). When the lobby is full, or its time is up, `lobby` turns `closed` and the host's game starts
 * the match with an AI in any empty seat.
 */

import {
  CODE_ALPHABET,
  FRIEND_JOIN_TIMEOUT_MS,
  HEARTBEAT_MS,
  LINGER_MS,
  MATCH_ROOM_PREFIX,
  MATCH_ROOM_TIMEOUT_MS,
  Matchmaker,
  NACK_EVERY_MS,
  OUTBOX_MAX,
  parseFriendCode,
  PM_PROTO,
  REJOIN_FIRST_MS,
  REJOIN_NEXT_MS,
  SELF_FREEZE_MS,
  SILENCE_MS,
  STALL_MS,
  type Channel,
  type MatchmakerDeps,
  type Mode,
  type NetState,
  type PitchNetStatus,
  type Role,
  type RoomHandlers,
  type RoomLike,
} from './matchmaker.ts';

export const FRIEND3_ROOM_PREFIX = 'pitchmasters-f3-';
export const CODE3_LEN = 6;
export const QM3_DISCOVERY_ROOM = `pitchmasters-qm3-v${PM_PROTO}`;
/** How long a quick-match lobby stays discoverable for a third seeker after its pair formed. */
export const QM3_OPEN_MS = 20000;
export const LOBBY_EVERY_MS = 1000;
/** Clients per room (the host is the third seat). */
export const MAX_CLIENTS = 2;
/** Godot peer ids: the host is 1, the clients take 2 and 3. */
export const HOST_SLOT = 1;
export const CLIENT_SLOTS: readonly number[] = [2, 3];
/** A lobby that said `full` to a qm3 seeker is not tried again for this long. */
export const LOBBY_COOLDOWN_MS = 8000;

/** PURE — is this friend code a three-sided room's (6 letters) rather than a 1v1 room's (5)? */
export function isThreeCode(raw: string): boolean {
  const code = parseFriendCode(raw);
  return code !== null && code.length === CODE3_LEN;
}

export interface PartnerStatus {
  /** Godot peer id of this partner (host: the client's seat 2 / 3; client: 1). */
  slot: number;
  present: boolean;
  rtt: number;
  stalled: boolean;
  stalledFor: number;
  hidden: boolean;
}

export interface Lobby3Status extends PitchNetStatus {
  /** Always 3: the game reads it to know this is a three-sided room. */
  seats: 3;
  /** Our own Godot peer id (1 host, 2 / 3 client, 0 before a client is seated). */
  slot: number;
  partners: PartnerStatus[];
  /** Whether the room still takes a newcomer: `open` until locked / full / (qm3) its time is up. */
  lobby: 'open' | 'closed';
  /** qm3 host: seconds until the lobby closes (0 when not counting). */
  startIn: number;
}

interface Link {
  readonly id: string;
  readonly slot: number;
  present: boolean;
  lastHeard: number;
  lastPing: number;
  hiSent: boolean;
  sendSeq: number;
  recvSeq: number;
  outbox: { seq: number; data: string }[];
  lastNack: number;
  rtt: number;
  hidden: boolean;
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class Lobby3 {
  build = 'dev';

  private state: NetState = 'idle';
  private role: Role = '';
  private mode: Mode = '';
  private code = '';
  private detail = '';
  private startedAt = 0;

  private room: RoomLike | null = null;
  private roomId = '';
  private roomHandlers: RoomHandlers | null = null;
  private roomDeadline = Infinity;
  /** Client: the host we must bind (qm3); host: unused. */
  private expect: string | null = null;
  private readonly links = new Map<string, Link>();
  private locked = false;
  private epoch = 0;
  private inbox: string[] = [];
  private lingering: { room: RoomLike; at: number }[] = [];
  private lastTickAt = -1;
  private selfHidden = false;
  private blipUntil = 0;
  private rejoinAt = 0;
  rejoins = 0;
  /** Client: the seat the host gave us. */
  private mySlot = 0;

  // qm3
  private readonly pairer: Matchmaker;
  private advert: RoomLike | null = null;
  private lastAdvert = -Infinity;
  private openUntil = 0;
  private advertFrom = 0;
  private readonly lobbyCooldown = new Map<string, number>();

  constructor(private readonly deps: MatchmakerDeps) {
    this.pairer = new Matchmaker({
      ...deps,
      discoveryRoom: QM3_DISCOVERY_ROOM,
      onPaired: (room, role, partner) => {
        this.qmPaired(room, role, partner);
        return true;
      },
      join: (roomId, h) =>
        deps.join(roomId, {
          ...h,
          onMessage: (ch, data, from) => {
            if (roomId === QM3_DISCOVERY_ROOM && ch === 'ctl') this.hearLobby(data, from);
            h.onMessage(ch, data, from);
          },
        }),
      log: (msg) => this.log(`qm3 ${msg}`),
    });
  }

  /** Is anything running (a lobby, a search, a seat)? `bridge.ts` routes the page's calls here while it is. */
  active(): boolean {
    return this.state !== 'idle';
  }

  // ── the window.PitchNet surface ──────────────────────────────────────────────

  friendHost(): string {
    this.cancel();
    this.mode = 'friend';
    this.startedAt = this.deps.now();
    let code = '';
    for (let i = 0; i < CODE3_LEN; i++) code += CODE_ALPHABET[Math.floor(this.deps.random() * CODE_ALPHABET.length)];
    this.code = code;
    this.enterRoom(FRIEND3_ROOM_PREFIX + code, 'host', null, Infinity);
    this.set('matched', 'Waiting for your friends to join… (0 / 2)');
    return code;
  }

  friendJoin(raw: string): void {
    this.cancel();
    this.mode = 'friend';
    this.startedAt = this.deps.now();
    const code = parseFriendCode(raw);
    if (code === null || code.length !== CODE3_LEN) {
      this.set('error', 'That is not a three-sided game code. Codes are 6 letters and digits, like K7M4QP.');
      return;
    }
    this.code = code;
    this.enterRoom(FRIEND3_ROOM_PREFIX + code, 'client', null, this.deps.now() + FRIEND_JOIN_TIMEOUT_MS);
    this.set('seeking', `Looking for game ${code}…`);
  }

  quickMatch(): void {
    this.cancel();
    this.mode = 'quick';
    this.startedAt = this.deps.now();
    this.pairer.build = this.build;
    this.pairer.quickMatch();
    this.set('seeking', 'Searching for two opponents…');
  }

  /** Host: the match starts; nobody else joins (a seat that empties later goes to a bot in the game). */
  lock(): void {
    if (this.role !== 'host') return;
    this.locked = true;
    this.stopAdvert();
  }

  cancel(): void {
    this.pairer.cancel();
    this.stopAdvert();
    this.leaveRoom(true);
    this.epoch++;
    this.state = 'idle';
    this.role = '';
    this.mode = '';
    this.code = '';
    this.detail = '';
    this.inbox = [];
    this.locked = false;
    this.mySlot = 0;
    this.openUntil = 0;
  }

  status(): Lobby3Status {
    const now = this.deps.now();
    const matched = this.state === 'matched';
    const partners: PartnerStatus[] = [];
    for (const l of this.links.values()) {
      const stalled = !l.present || now - l.lastHeard > STALL_MS;
      partners.push({
        slot: l.slot,
        present: l.present,
        rtt: Math.round(l.rtt),
        stalled,
        stalledFor: stalled ? Math.max(0, (now - l.lastHeard) / 1000) : 0,
        hidden: l.hidden,
      });
    }
    partners.sort((a, b) => a.slot - b.slot);
    const worst = partners.reduce<PartnerStatus | null>((w, p) => (w === null || p.stalledFor > w.stalledFor ? p : w), null);
    const pairing = this.mode === 'quick' && this.state === 'seeking' && this.room === null;
    const ps = pairing ? this.pairer.status() : null;
    return {
      state: this.state,
      role: this.role,
      mode: this.mode,
      code: this.code,
      detail: ps !== null && ps.detail !== '' ? ps.detail.replace('an opponent', 'two opponents') : this.detail,
      elapsed: this.state !== 'idle' ? Math.max(0, (now - this.startedAt) / 1000) : 0,
      rtt: matched && partners.length > 0 ? Math.max(...partners.map((p) => p.rtt)) : -1,
      stalled: matched && partners.some((p) => p.stalled),
      stalledFor: matched && worst !== null && worst.stalled ? worst.stalledFor : 0,
      partnerHidden: matched && partners.some((p) => p.hidden),
      seekers: ps !== null ? ps.seekers : 0,
      seats: 3,
      slot: this.role === 'host' ? HOST_SLOT : this.mySlot,
      partners,
      lobby: this.lobbyOpen(now) ? 'open' : 'closed',
      startIn: this.role === 'host' && this.mode === 'quick' && this.openUntil > 0 && this.lobbyOpen(now)
        ? Math.max(0, (this.openUntil - now) / 1000) : 0,
    };
  }

  /**
   * Queue one packet. Host: `to` = the client's slot (2 / 3), or 0 / undefined = every seated client.
   * Client: always to the host.
   */
  send(b64: string, to?: number): boolean {
    if (this.state !== 'matched' || this.room === null) return false;
    let sent = false;
    for (const l of this.links.values()) {
      if (this.role === 'host' && to !== undefined && to > 0 && l.slot !== to) continue;
      const seq = ++l.sendSeq;
      l.outbox.push({ seq, data: b64 });
      if (l.outbox.length > OUTBOX_MAX) l.outbox.shift();
      if (l.present) this.room.send('pk', `${seq}:${b64}`, l.id);
      sent = true;
    }
    return sent;
  }

  /** Packets since the last poll, oldest first, each `<from slot>:<b64>`. */
  poll(): string[] {
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  setHidden(hidden: boolean): void {
    if (this.selfHidden === hidden) return;
    this.selfHidden = hidden;
    if (this.state !== 'matched') return;
    for (const l of this.links.values()) if (l.present) this.room?.send('ctl', JSON.stringify({ t: 'vis', h: hidden }), l.id);
  }

  /** Test hook (?netdebug=1): drop off the room for `ms` with no bye, then rejoin it. */
  blip(ms: number): boolean {
    if (this.state !== 'matched' || this.room === null || this.roomHandlers === null) return false;
    this.log(`blip: off the room for ${ms} ms`);
    this.room.leave();
    this.room = { send: () => undefined, leave: () => undefined };
    for (const l of this.links.values()) {
      l.present = false;
      l.hiSent = false;
    }
    this.blipUntil = this.deps.now() + Math.max(0, ms);
    return true;
  }

  tick(): void {
    const now = this.deps.now();
    const gap = this.lastTickAt < 0 ? 0 : now - this.lastTickAt;
    this.lastTickAt = now;
    if (gap > SELF_FREEZE_MS && this.state === 'matched') {
      for (const l of this.links.values()) l.lastHeard = Math.min(now, l.lastHeard + gap);
      this.log(`this page was frozen for ${(gap / 1000).toFixed(1)} s: not counted against the partners`);
    }
    if (this.lingering.length > 0) {
      const due = this.lingering.filter((l) => now >= l.at);
      this.lingering = this.lingering.filter((l) => now < l.at);
      for (const l of due) l.room.leave();
    }
    this.pairer.tick();
    if (this.blipUntil > 0 && now >= this.blipUntil) {
      this.blipUntil = 0;
      if (this.room !== null && this.roomHandlers !== null) {
        this.log('blip over: rejoining the room');
        this.room = this.deps.join(this.roomId, this.roomHandlers);
        this.scheduleRejoin(now);
      }
    }
    this.tickAdvert(now);
    if (this.room !== null) this.tickRoom(now);
  }

  // ── qm3 ────────────────────────────────────────────────────────────────────

  private qmPaired(room: string, role: 'host' | 'client', partner: string): void {
    if (this.mode !== 'quick') return;
    this.log(`qm3 paired as ${role} with ${partner.slice(0, 6)}`);
    if (role === 'host') {
      this.enterRoom(room, 'host', null, this.deps.now() + MATCH_ROOM_TIMEOUT_MS);
      this.expect = partner;
      this.set('connecting', 'Opponent found, connecting…');
    } else {
      this.enterRoom(room, 'client', partner, this.deps.now() + MATCH_ROOM_TIMEOUT_MS);
      this.set('connecting', 'Opponents found, connecting…');
    }
  }

  /** A qm3 seeker hears a lobby host announce a free seat: leave the queue and take it. */
  private hearLobby(raw: string, from: string): void {
    if (this.mode !== 'quick' || this.state !== 'seeking' || this.room !== null || this.pairer.pairing) return;
    const m = parse(raw);
    if (m === null || m.t !== 'lobby3' || m.v !== PM_PROTO || m.build !== this.build) return;
    const room = typeof m.room === 'string' && m.room.startsWith(MATCH_ROOM_PREFIX) ? m.room : '';
    if (room === '' || typeof m.free !== 'number' || m.free < 1) return;
    if ((this.lobbyCooldown.get(from) ?? 0) > this.deps.now()) return;
    this.log(`qm3 lobby of ${from.slice(0, 6)} has a free seat: joining`);
    this.pairer.cancel();
    this.enterRoom(room, 'client', from, this.deps.now() + MATCH_ROOM_TIMEOUT_MS);
    this.set('connecting', 'Opponents found, connecting…');
  }

  private lobbyOpen(now: number): boolean {
    if (this.state === 'idle' || this.locked) return false;
    if (this.role === 'host' && this.links.size >= MAX_CLIENTS) return false;
    if (this.role === 'host' && this.mode === 'quick' && this.openUntil > 0 && now >= this.openUntil) return false;
    return true;
  }

  private tickAdvert(now: number): void {
    if (this.role !== 'host' || this.mode !== 'quick' || this.state !== 'matched') return;
    if (!this.lobbyOpen(now)) {
      this.stopAdvert();
      return;
    }
    if (now < this.advertFrom) return; // the pairer's discovery room is still lingering (same room id)
    if (this.advert === null) {
      this.advert = this.deps.join(QM3_DISCOVERY_ROOM, { onMessage: () => undefined, onPeerJoin: () => undefined, onPeerLeave: () => undefined });
      this.lastAdvert = -Infinity;
    }
    if (now - this.lastAdvert >= LOBBY_EVERY_MS) {
      this.lastAdvert = now;
      this.advert.send('ctl', JSON.stringify({ t: 'lobby3', v: PM_PROTO, build: this.build, room: this.roomId, free: MAX_CLIENTS - this.links.size }));
    }
  }

  /** Left at once (nothing to deliver): the pairer may rejoin this same room right after (Trystero keeps one
   * room object per id, so a lingering advert would be left under the pairer's feet). */
  private stopAdvert(): void {
    if (this.advert === null) return;
    this.advert.leave();
    this.advert = null;
  }

  private backToQueue(why: string): void {
    this.log(`qm3 ${why}: back to the queue`);
    this.leaveRoom(false);
    this.role = '';
    this.mySlot = 0;
    this.pairer.build = this.build;
    this.pairer.quickMatch();
    this.set('seeking', 'Searching for two opponents…');
  }

  // ── the room ───────────────────────────────────────────────────────────────

  private enterRoom(roomId: string, role: 'host' | 'client', expect: string | null, deadline: number): void {
    this.leaveRoom(false);
    this.role = role;
    this.expect = expect;
    this.roomDeadline = deadline;
    this.locked = false;
    this.mySlot = 0;
    this.blipUntil = 0;
    this.resetRejoin();
    const epoch = ++this.epoch;
    const handlers: RoomHandlers = {
      onMessage: (ch, data, from) => {
        if (epoch === this.epoch) this.onRoom(ch, data, from);
      },
      onPeerJoin: (peer) => {
        if (epoch !== this.epoch) return;
        const l = this.links.get(peer);
        if (l !== undefined) {
          // Back after a blip: shake hands again, then both re-send what is unacked.
          l.hiSent = false;
          this.sayHi(l.id, l.slot);
        } else if (this.role === 'client') {
          if (this.links.size === 0) this.sayHi(peer, 0);
        } else if (!this.lobbyOpen(this.deps.now())) {
          this.room?.send('ctl', JSON.stringify({ t: 'full', v: PM_PROTO, build: this.build }), peer);
        }
      },
      onPeerLeave: (peer) => {
        if (epoch !== this.epoch) return;
        const l = this.links.get(peer);
        if (l === undefined) return;
        // Not a bye: maybe a blip. Keep the seat and wait for the same peer (SILENCE_MS grace).
        l.present = false;
        l.hiSent = false;
        this.log(`slot ${l.slot} dropped: waiting for a reconnect`);
        this.scheduleRejoin(this.deps.now());
      },
    };
    this.roomId = roomId;
    this.roomHandlers = handlers;
    this.room = this.deps.join(roomId, handlers);
  }

  private leaveRoom(sayBye: boolean): void {
    if (this.room === null) return;
    if (sayBye && this.links.size > 0) {
      for (const l of this.links.values()) this.room.send('ctl', JSON.stringify({ t: 'bye' }), l.id);
      this.linger(this.room);
    } else {
      this.room.leave();
    }
    this.room = null;
    this.roomHandlers = null;
    this.links.clear();
    this.expect = null;
    this.blipUntil = 0;
    this.resetRejoin();
  }

  private resetRejoin(): void {
    this.rejoinAt = 0;
    this.rejoins = 0;
  }

  private scheduleRejoin(now: number): void {
    if (this.role === 'client') this.rejoinAt = now + REJOIN_FIRST_MS;
  }

  /** Client: the host is still gone long after our (re)join: rejoin the room with fresh signaling. */
  private tickRejoin(now: number): void {
    const host = this.links.values().next().value;
    if (this.role !== 'client' || this.state !== 'matched' || host === undefined || this.blipUntil > 0
      || this.roomHandlers === null || host.present || this.rejoinAt === 0 || now < this.rejoinAt) return;
    this.rejoins++;
    this.log(`host still gone ${((now - host.lastHeard) / 1000).toFixed(0)} s: rejoining the room (try ${this.rejoins})`);
    this.room?.leave();
    this.room = this.deps.join(this.roomId, this.roomHandlers);
    this.rejoinAt = now + REJOIN_NEXT_MS;
  }

  private sayHi(peer: string, slot: number): void {
    if (this.room === null) return;
    const l = this.links.get(peer);
    if (l !== undefined) {
      if (l.hiSent) return;
      l.hiSent = true;
    }
    this.room.send('ctl', JSON.stringify({ t: 'hi', v: PM_PROTO, build: this.build, role: this.role, mode: 3, slot, ack: l?.recvSeq ?? 0 }), peer);
  }

  private newLink(id: string, slot: number): Link {
    const now = this.deps.now();
    const l: Link = { id, slot, present: true, lastHeard: now, lastPing: 0, hiSent: false, sendSeq: 0, recvSeq: 0, outbox: [], lastNack: -Infinity, rtt: -1, hidden: false };
    this.links.set(id, l);
    return l;
  }

  private freeSlot(): number {
    const used = new Set([...this.links.values()].map((l) => l.slot));
    return CLIENT_SLOTS.find((s) => !used.has(s)) ?? 0;
  }

  private trim(l: Link, ack: unknown): void {
    if (typeof ack !== 'number') return;
    while (l.outbox.length > 0 && l.outbox[0].seq <= ack) l.outbox.shift();
  }

  private resend(l: Link): void {
    if (this.room === null || !l.present) return;
    for (const e of l.outbox) this.room.send('pk', `${e.seq}:${e.data}`, l.id);
    if (l.outbox.length > 0) this.log(`re-sent ${l.outbox.length} unacked packets to slot ${l.slot}`);
  }

  private friendsLine(): string {
    return `Waiting for your friends to join… (${this.links.size} / ${MAX_CLIENTS})`;
  }

  private onRoom(ch: Channel, data: string, from: string): void {
    if (this.room === null) return;
    const l = this.links.get(from);
    if (l !== undefined) l.lastHeard = this.deps.now();
    if (ch === 'pk') {
      if (l === undefined || this.state !== 'matched') return;
      const cut = data.indexOf(':');
      const seq = Number(data.slice(0, cut));
      if (cut <= 0 || !Number.isInteger(seq)) return;
      if (seq === l.recvSeq + 1) {
        l.recvSeq = seq;
        this.inbox.push(`${l.slot}:${data.slice(cut + 1)}`);
      } else if (seq > l.recvSeq + 1) {
        const now = this.deps.now();
        if (now - l.lastNack >= NACK_EVERY_MS) {
          l.lastNack = now;
          this.room.send('ctl', JSON.stringify({ t: 'nack', ack: l.recvSeq }), from);
        }
      }
      return;
    }
    const m = parse(data);
    if (m === null) return;
    switch (m.t) {
      case 'hi': {
        if (l !== undefined) {
          const back = !l.present;
          l.present = true;
          this.sayHi(from, l.slot);
          this.trim(l, m.ack);
          this.resend(l);
          if (back) this.log(`slot ${l.slot} back: resumed`);
          this.resetRejoin();
          return;
        }
        if (this.role === 'host') this.hostHi(m, from);
        else this.clientHi(m, from);
        return;
      }
      case 'full':
        if (this.role !== 'client' || this.links.size > 0) return;
        if (this.expect !== null && from !== this.expect) return;
        if (this.mode === 'quick') {
          this.lobbyCooldown.set(from, this.deps.now() + LOBBY_COOLDOWN_MS);
          this.backToQueue('that lobby is full');
        } else if (m.v !== PM_PROTO || m.build !== this.build) {
          this.fail('You and your friend have different versions of the game. Both reload the page.');
        } else {
          this.fail('That game already has three players.');
        }
        return;
      case 'bye':
        if (l !== undefined) this.dropLink(l, this.role === 'host' ? 'left' : 'The host left the match.');
        return;
      case 'ping':
        if (l === undefined) return;
        l.present = true;
        if (this.rejoinAt !== 0) this.resetRejoin();
        this.trim(l, m.ack);
        l.hidden = m.h === true;
        this.room.send('ctl', JSON.stringify({ t: 'pong', ts: m.ts }), from);
        return;
      case 'pong': {
        if (l === undefined || typeof m.ts !== 'number') return;
        const v = Math.max(0, this.deps.now() - m.ts);
        l.rtt = l.rtt < 0 ? v : l.rtt * 0.7 + v * 0.3;
        return;
      }
      case 'nack':
        if (l === undefined) return;
        this.trim(l, m.ack);
        this.resend(l);
        return;
      case 'vis':
        if (l !== undefined) l.hidden = m.h === true;
        return;
    }
  }

  private hostHi(m: Record<string, unknown>, from: string): void {
    if (m.role !== 'client' || m.mode !== 3) return;
    const full = (): void => this.room?.send('ctl', JSON.stringify({ t: 'full', v: PM_PROTO, build: this.build }), from);
    if (m.v !== PM_PROTO || m.build !== this.build) {
      full(); // the joiner sees our v / build and tells its player the versions differ
      return;
    }
    if (!this.lobbyOpen(this.deps.now())) {
      full();
      return;
    }
    const slot = this.freeSlot();
    if (slot === 0) {
      full();
      return;
    }
    const l = this.newLink(from, slot);
    this.sayHi(from, slot);
    this.log(`seated ${from.slice(0, 6)} in slot ${slot}`);
    if (this.state !== 'matched') {
      // qm3: the paired partner arrived; the lobby is up and stays open for a third seeker.
      this.openUntil = this.deps.now() + QM3_OPEN_MS;
      this.advertFrom = this.deps.now() + LINGER_MS + 500;
      this.set('matched', 'Connected');
    }
    this.roomDeadline = Infinity;
    if (this.mode === 'friend') this.detail = this.friendsLine();
    void l;
  }

  private clientHi(m: Record<string, unknown>, from: string): void {
    if (m.role !== 'host' || m.mode !== 3) return;
    if (this.expect !== null && from !== this.expect) return;
    if (m.v !== PM_PROTO || m.build !== this.build) {
      if (this.mode === 'friend') this.fail('You and your friend have different versions of the game. Both reload the page.');
      return;
    }
    const slot = typeof m.slot === 'number' && CLIENT_SLOTS.includes(m.slot) ? m.slot : 0;
    if (slot === 0) return; // the host answers our hi with our seat; its first unsolicited hi carries none
    this.newLink(from, HOST_SLOT);
    this.mySlot = slot;
    this.links.get(from)!.hiSent = true;
    this.roomDeadline = Infinity;
    this.set('matched', 'Connected');
    this.log(`seated in slot ${slot} by ${from.slice(0, 6)}`);
  }

  /** A seat is gone for good (bye or the silence limit). Host: the game gives it to a bot. Client: closed. */
  private dropLink(l: Link, why: string): void {
    this.links.delete(l.id);
    this.log(`slot ${l.slot} gone (${why})`);
    if (this.role === 'client') {
      this.leaveRoom(false);
      this.set('closed', why);
      return;
    }
    if (this.mode === 'friend' && !this.locked) this.detail = this.friendsLine();
    // qm3: the lobby emptied before kick-off: search again (the game detaches and waits for a new lobby).
    if (this.mode === 'quick' && !this.locked && this.links.size === 0) this.backToQueue('the lobby emptied');
  }

  private tickRoom(now: number): void {
    if (this.links.size === 0 && this.state !== 'matched') {
      if (now <= this.roomDeadline) return;
      if (this.mode === 'quick') this.backToQueue('the room stayed empty');
      else this.fail(`No game found with code ${this.code}. Check the code and that your friend is waiting.`);
      return;
    }
    if (this.role === 'host' && this.mode === 'quick' && this.links.size === 0 && this.roomDeadline !== Infinity && now > this.roomDeadline) {
      this.backToQueue('the partner never arrived');
      return;
    }
    this.tickRejoin(now);
    for (const l of [...this.links.values()]) {
      if (now - l.lastPing >= HEARTBEAT_MS) {
        l.lastPing = now;
        this.room?.send('ctl', JSON.stringify({ t: 'ping', ack: l.recvSeq, ts: now, h: this.selfHidden }), l.id);
      }
      if (now - l.lastHeard > SILENCE_MS) {
        this.dropLink(l, this.role === 'host' ? 'silent' : 'Connection to the host was lost.');
        if (this.room === null) return;
      }
    }
  }

  private fail(msg: string): void {
    this.pairer.cancel();
    this.stopAdvert();
    this.leaveRoom(false);
    this.set('error', msg);
  }

  private linger(room: RoomLike): void {
    this.lingering.push({ room, at: this.deps.now() + LINGER_MS });
  }

  private set(state: NetState, detail: string): void {
    this.state = state;
    this.detail = detail;
  }

  private log(msg: string): void {
    this.deps.log?.(`[3] ${msg}`);
  }
}
