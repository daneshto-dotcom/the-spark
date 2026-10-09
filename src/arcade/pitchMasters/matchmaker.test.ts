/**
 * PITCH MASTERS (arcade) — the 1v1 matchmaker, driven over an in-memory "relay" with a fake clock.
 * The real page runs the same class over Trystero; the browser harness covers that wire.
 */

import { describe, expect, it } from 'vitest';

import {
  CODE_ALPHABET,
  DISCOVERY_ROOM,
  FRIEND_JOIN_TIMEOUT_MS,
  HANDSHAKE_MS,
  isElder,
  Matchmaker,
  MATCH_ROOM_TIMEOUT_MS,
  parseFriendCode,
  REJOIN_FIRST_MS,
  REJOIN_SLACK_MS,
  type ResumeStore,
  serialRooms,
  SILENCE_MS,
  type RoomHandlers,
  type RoomLike,
} from './matchmaker.ts';

/** Every room of a fake relay; messages are queued and delivered by `flush()`, in order. */
class Bus {
  now = 0;
  wall = 1_000_000;
  private readonly rooms = new Map<string, Map<string, RoomHandlers>>();
  private queue: (() => void)[] = [];
  /** Frozen tabs: what is sent to them waits here, in order, until release(). */
  private readonly held = new Map<string, (() => void)[]>();
  readonly joins: string[] = [];
  /** PM-S5 lag-research: rooms offer a fast lane (unordered, lossy) when set; `dropFast` loses a packet on it. */
  fastLanes = false;
  dropFast: (data: string) => boolean = () => false;
  /** `room:peer->to` -> the receiver for the fast lane that `peer` opened toward `to`. */
  private readonly fastRx = new Map<string, (d: string) => void>();
  /** Failed signaling: the next N joins of a peer never see (or get seen by) anyone. */
  private readonly deafJoins = new Map<string, number>();

  deaf(peer: string, joins = 1): void {
    this.deafJoins.set(peer, joins);
  }

  /**
   * PM-S4 net-blip: the next join of `peer` gets a STUCK transport handshake (the live failure): the others see
   * `peer` join and hear nothing from it, `peer` never sees them, cannot send, and drops what they send;
   * HANDSHAKE_MS later its transport reports `handshake timed out` for each of them (onPeerError).
   */
  wedge(peer: string, joins = 1): void {
    this.wedgeJoins.set(peer, joins);
  }

  private readonly wedgeJoins = new Map<string, number>();
  /** `room:peer` joins whose side of the handshake is stuck (see wedge). */
  private readonly stuck = new Set<string>();
  private timers: { at: number; fn: () => void }[] = [];

  /** A frozen tab (its main thread blocked): nothing reaches `peer` until release(peer). */
  hold(peer: string): void {
    if (!this.held.has(peer)) this.held.set(peer, []);
  }

  release(peer: string): void {
    const q = this.held.get(peer) ?? [];
    this.held.delete(peer);
    this.queue.push(...q);
  }

  join(roomId: string, peer: string, h: RoomHandlers): RoomLike {
    this.joins.push(`${peer}:${roomId}`);
    let room = this.rooms.get(roomId);
    if (room === undefined) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    const r = room;
    const deafLeft = this.deafJoins.get(peer) ?? 0;
    if (deafLeft > 0) {
      // In the room for nobody: no join events, nothing delivered either way, and its leave is silent.
      this.deafJoins.set(peer, deafLeft - 1);
      return { send: () => undefined, leave: () => undefined };
    }
    const wedgeLeft = this.wedgeJoins.get(peer) ?? 0;
    const stuck = wedgeLeft > 0;
    if (stuck) {
      this.wedgeJoins.set(peer, wedgeLeft - 1);
      this.stuck.add(`${roomId}:${peer}`);
    } else this.stuck.delete(`${roomId}:${peer}`);
    for (const [other, oh] of r) {
      this.queue.push(() => {
        if (r.get(other) === oh && r.get(peer) === h) {
          oh.onPeerJoin(peer);
          if (!stuck) h.onPeerJoin(other);
        }
      });
      if (stuck) {
        this.timers.push({
          at: this.now + HANDSHAKE_MS,
          fn: () => {
            if (r.get(peer) === h && this.stuck.has(`${roomId}:${peer}`)) h.onPeerError?.(other, `handshake timed out after ${HANDSHAKE_MS}ms`);
          },
        });
      }
    }
    r.set(peer, h);
    const fastApi: Pick<RoomLike, 'fast' | 'sendFast'> = !this.fastLanes
      ? {}
      : {
          fast: (to, onData) => {
            if (!r.has(to)) return false;
            this.fastRx.set(`${roomId}:${to}->${peer}`, onData); // what `to` sends us arrives here
            return true;
          },
          sendFast: (to, data) => {
            const rx = this.fastRx.get(`${roomId}:${peer}->${to}`);
            if (rx === undefined || r.get(peer) !== h) return false; // the other side has not opened its end
            if (!this.dropFast(data)) this.queue.push(() => rx(data));
            return true;
          },
        };
    return {
      ...fastApi,
      send: (c, d, to) => {
        if (this.stuck.has(`${roomId}:${peer}`)) return; // not live on our side: the transport refuses to send
        for (const [other, oh] of r) {
          if (other === peer || (to !== undefined && to !== other) || this.stuck.has(`${roomId}:${other}`)) continue;
          const deliver = (): void => {
            if (r.get(other) === oh && r.get(peer) === h) oh.onMessage(c, d, peer);
          };
          const frozen = this.held.get(other);
          if (frozen !== undefined) frozen.push(deliver);
          else this.queue.push(deliver);
        }
      },
      leave: () => {
        if (r.get(peer) !== h) return;
        r.delete(peer);
        for (const [, oh] of r) this.queue.push(() => oh.onPeerLeave(peer));
      },
    };
  }

  /** A tab that dies: gone from the room with no `bye` and no leave event. */
  vanish(roomId: string, peer: string): void {
    this.rooms.get(roomId)?.delete(peer);
  }

  flush(): void {
    const due = this.timers.filter((x) => x.at <= this.now);
    this.timers = this.timers.filter((x) => x.at > this.now);
    for (const x of due) this.queue.push(x.fn);
    for (let i = 0; i < 10_000 && this.queue.length > 0; i++) this.queue.shift()!();
  }

  members(roomId: string): string[] {
    return [...(this.rooms.get(roomId)?.keys() ?? [])];
  }
}

/** PM-S5 net-reconnect: a browser's localStorage, one per "browser" (a restarted page gets the same one). */
function memStore(): ResumeStore & { value: string | null } {
  const st = {
    value: null as string | null,
    get: () => st.value,
    set: (v: string | null) => {
      st.value = v;
    },
  };
  return st;
}

function player(bus: Bus, id: string, build = 'b1', seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1, store?: ResumeStore): Matchmaker {
  let s = seed;
  const mm = new Matchmaker({
    selfId: id,
    join: (roomId, h) => bus.join(roomId, id, h),
    now: () => bus.now,
    wallNow: () => bus.wall,
    random: () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    },
    store,
  });
  mm.build = build;
  return mm;
}

/** Advance the clock in 250 ms steps, ticking everyone and delivering messages. */
function run(bus: Bus, players: Matchmaker[], ms: number): void {
  for (let t = 0; t < ms; t += 250) {
    bus.now += 250;
    bus.wall += 250;
    for (const p of players) p.tick();
    bus.flush();
  }
}

describe('seniority is a total order both peers agree on', () => {
  it('earlier search start is elder; a tie goes to the smaller id', () => {
    expect(isElder({ id: 'z', since: 1 }, { id: 'a', since: 2 })).toBe(true);
    expect(isElder({ id: 'a', since: 2 }, { id: 'z', since: 1 })).toBe(false);
    expect(isElder({ id: 'a', since: 5 }, { id: 'b', since: 5 })).toBe(true);
    expect(isElder({ id: 'b', since: 5 }, { id: 'a', since: 5 })).toBe(false);
  });
});

describe('quick match', () => {
  it('pairs two seekers; the one who searched first hosts; packets flow both ways', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    a.quickMatch();
    expect(a.status().state).toBe('seeking');
    run(bus, [a], 3000);
    const b = player(bus, 'peerB');
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status()).toMatchObject({ state: 'matched', role: 'host', mode: 'quick' });
    expect(b.status()).toMatchObject({ state: 'matched', role: 'client', mode: 'quick' });
    // Both left discovery.
    expect(bus.members(DISCOVERY_ROOM)).toEqual([]);
    expect(a.send('AAEC')).toBe(true);
    expect(b.send('AwQF')).toBe(true);
    expect(b.send('BgcI')).toBe(true);
    bus.flush();
    expect(b.poll()).toEqual(['AAEC']);
    expect(a.poll()).toEqual(['AwQF', 'BgcI']);
    expect(a.poll()).toEqual([]);
  });

  it('the elder hosts even when it has the LARGER id (no per-page-load bias)', () => {
    const bus = new Bus();
    const z = player(bus, 'zzzz');
    z.quickMatch();
    run(bus, [z], 500);
    const a = player(bus, 'aaaa');
    a.quickMatch();
    run(bus, [z, a], 6000);
    expect(z.status().role).toBe('host');
    expect(a.status().role).toBe('client');
  });

  it('two seekers who click at the same instant still pair', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    const b = player(bus, 'peerB');
    a.quickMatch();
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status().state).toBe('matched');
    expect(b.status().state).toBe('matched');
    expect(new Set([a.status().role, b.status().role])).toEqual(new Set(['host', 'client']));
  });

  it('a third seeker does not break a formed pair, and pairs with the next one', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    const b = player(bus, 'peerB');
    const c = player(bus, 'peerC');
    a.quickMatch();
    run(bus, [a], 1000);
    b.quickMatch();
    run(bus, [a, b], 250);
    c.quickMatch();
    run(bus, [a, b, c], 8000);
    const states = [a, b, c].map((p) => p.status().state).sort();
    expect(states).toEqual(['matched', 'matched', 'seeking']);
    const lone = [a, b, c].find((p) => p.status().state === 'seeking')!;
    const pair = [a, b, c].filter((p) => p !== lone);
    // The pair is still talking to each other only.
    expect(pair[0].send('AQ==')).toBe(true);
    bus.flush();
    expect(pair[1].poll()).toEqual(['AQ==']);
    expect(lone.poll()).toEqual([]);
    const d = player(bus, 'peerD');
    d.quickMatch();
    run(bus, [a, b, c, d], 8000);
    expect(lone.status().state).toBe('matched');
    expect(d.status().state).toBe('matched');
    expect(pair.every((p) => p.status().state === 'matched')).toBe(true);
  });

  it('four seekers arriving together form two pairs', () => {
    const bus = new Bus();
    const ps = ['p1', 'p2', 'p3', 'p4'].map((id) => player(bus, id));
    for (const p of ps) p.quickMatch();
    run(bus, ps, 15000);
    expect(ps.map((p) => p.status().state)).toEqual(['matched', 'matched', 'matched', 'matched']);
    expect(ps.filter((p) => p.status().role === 'host')).toHaveLength(2);
  });

  it('cancel leaves the queue: nobody pairs with a cancelled seeker', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    a.quickMatch();
    run(bus, [a], 1000);
    a.cancel();
    expect(a.status().state).toBe('idle');
    const b = player(bus, 'peerB');
    b.quickMatch();
    run(bus, [a, b], 8000);
    expect(b.status().state).toBe('seeking');
    expect(a.status().state).toBe('idle');
  });

  it('a partner who never reaches the private room sends us back to the queue, keeping our place', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    a.quickMatch();
    run(bus, [a], 1000);
    const b = player(bus, 'peerB');
    b.quickMatch();
    // Tick only until the handshake completes, then B's tab dies before it joins the match room.
    let guard = 0;
    while (a.status().state === 'seeking' && guard++ < 40) run(bus, [a, b], 250);
    expect(['connecting', 'matched']).toContain(a.status().state);
    const matchRoom = bus.joins.filter((j) => j.startsWith('peerB:pitchmasters-m-')).map((j) => j.slice(6))[0];
    if (matchRoom !== undefined) bus.vanish(matchRoom, 'peerB');
    b.cancel = () => undefined; // dead tab: no bye
    if (a.status().state === 'connecting') {
      run(bus, [a], MATCH_ROOM_TIMEOUT_MS + 1000);
      expect(a.status().state).toBe('seeking');
      // A newcomer who arrives later is junior: A still hosts.
      const c = player(bus, 'peerC');
      c.quickMatch();
      run(bus, [a, c], 8000);
      expect(a.status()).toMatchObject({ state: 'matched', role: 'host' });
    } else {
      run(bus, [a], SILENCE_MS + 1000);
      expect(a.status().state).toBe('closed');
    }
  });

  it('a partner lost mid-match: the survivor sees closed (clean leave, and silent death)', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA');
    const b = player(bus, 'peerB');
    a.quickMatch();
    run(bus, [a], 500);
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status().state).toBe('matched');
    b.cancel();
    run(bus, [a], 500);
    expect(a.status()).toMatchObject({ state: 'closed' });

    const bus2 = new Bus();
    const c = player(bus2, 'peerC');
    const d = player(bus2, 'peerD');
    c.quickMatch();
    run(bus2, [c], 500);
    d.quickMatch();
    run(bus2, [c, d], 6000);
    expect(c.status().state).toBe('matched');
    for (const j of bus2.joins.filter((x) => x.startsWith('peerD:pitchmasters-m-'))) bus2.vanish(j.slice(6), 'peerD');
    run(bus2, [c], SILENCE_MS + 1000);
    expect(c.status().state).toBe('closed');
  });

  it('different builds never pair', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA', 'build-1');
    const b = player(bus, 'peerB', 'build-2');
    a.quickMatch();
    b.quickMatch();
    run(bus, [a, b], 8000);
    expect(a.status().state).toBe('seeking');
    expect(b.status().state).toBe('seeking');
  });
});

describe('play a friend', () => {
  it('host gets a typeable code; the friend joins with it; a third player is turned away', () => {
    const bus = new Bus();
    const h = player(bus, 'host1', 'b1', 7);
    const code = h.friendHost();
    expect(code).toHaveLength(5);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(h.status()).toMatchObject({ state: 'seeking', role: 'host', code });
    run(bus, [h], 2000);
    const f = player(bus, 'friend');
    f.friendJoin(` ${code.toLowerCase()} `);
    run(bus, [h, f], 2000);
    expect(h.status()).toMatchObject({ state: 'matched', role: 'host' });
    expect(f.status()).toMatchObject({ state: 'matched', role: 'client' });
    const x = player(bus, 'stranger');
    x.friendJoin(code);
    run(bus, [h, f, x], 2000);
    expect(x.status().state).toBe('error');
    expect(x.status().detail).toContain('two players');
    expect(h.status().state).toBe('matched');
    expect(f.send('AA==')).toBe(true);
    bus.flush();
    expect(h.poll()).toEqual(['AA==']);
  });

  it('a wrong code gives up with a message', () => {
    const bus = new Bus();
    const f = player(bus, 'friend');
    f.friendJoin('ZZZZZ');
    run(bus, [f], FRIEND_JOIN_TIMEOUT_MS + 1000);
    expect(f.status().state).toBe('error');
    expect(f.status().detail).toContain('ZZZZZ');
  });

  it('parses what people type', () => {
    expect(parseFriendCode(' k7m4q ')).toBe('K7M4Q');
    expect(parseFriendCode('K7M-4Q')).toBe('K7M4Q');
    expect(parseFriendCode('K7O4Q')).toBeNull(); // no O: ambiguous with 0
    expect(parseFriendCode('ab')).toBeNull();
  });

  it('a different build is told to reload instead of desyncing', () => {
    const bus = new Bus();
    const h = player(bus, 'host1', 'new');
    const code = h.friendHost();
    const f = player(bus, 'friend', 'old');
    f.friendJoin(code);
    run(bus, [h, f], 2000);
    expect(f.status().state).toBe('error');
    expect(f.status().detail).toContain('reload');
  });
});

describe('PM-S2 online2: blips, round trip, visibility, head count', () => {
  function pair(bus: Bus): [Matchmaker, Matchmaker] {
    const a = player(bus, 'peerA');
    const b = player(bus, 'peerB');
    a.quickMatch();
    run(bus, [a], 500);
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status().state).toBe('matched');
    expect(b.status().state).toBe('matched');
    return [a, b];
  }

  it('a 6 s blip (drop off the room, rejoin) keeps the match and loses nothing, in order', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    for (let i = 0; i < 3; i++) a.send(`pre${i}`);
    bus.flush();
    expect(b.poll()).toEqual(['pre0', 'pre1', 'pre2']);
    expect(b.blip(6000)).toBe(true);
    const got: string[] = [];
    let wasStalled = false;
    for (let t = 0; t < 6000; t += 250) {
      a.send(`mid${t}`);
      b.send(`back${t}`);
      run(bus, [a, b], 250);
      got.push(...b.poll());
      wasStalled ||= a.status().stalled;
      expect(a.status().state).toBe('matched');
      expect(b.status().state).toBe('matched');
    }
    expect(wasStalled).toBe(true);
    run(bus, [a, b], 3000);
    got.push(...b.poll());
    expect(got).toEqual(Array.from({ length: 24 }, (_, i) => `mid${i * 250}`));
    expect(a.poll()).toEqual(Array.from({ length: 24 }, (_, i) => `back${i * 250}`));
    expect(a.status().stalled).toBe(false);
    expect(b.status().stalled).toBe(false);
    // Traffic keeps flowing after the resume, with no duplicates.
    a.send('after');
    bus.flush();
    expect(b.poll()).toEqual(['after']);
  });

  it('PM-S3: a client rejoin whose signaling fails is retried once the host has been gone long: nothing lost', () => {
    const bus = new Bus();
    const [a, b] = pair(bus); // a searched first: a hosts, b is the client
    expect(b.status().role).toBe('client');
    bus.deaf('peerB', 1); // the rejoin right after the blip reaches no one (dead relays)
    expect(b.blip(3000)).toBe(true);
    const got: string[] = [];
    let aStalled = false;
    let bStalled = false;
    for (let t = 0; t < 22_000; t += 250) {
      if (t < 8000) a.send(`m${t}`);
      run(bus, [a, b], 250);
      got.push(...b.poll());
      aStalled ||= a.status().stalled;
      bStalled ||= b.status().stalled;
    }
    // Both sides said "stalled" (the game's reconnecting note) meanwhile...
    expect(aStalled).toBe(true);
    expect(bStalled).toBe(true);
    // ...then the client's retry (REJOIN_FIRST_MS after its deaf rejoin) brought the host back, inside the grace.
    expect(b.rejoins).toBe(0); // reset on resume
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(got).toEqual(Array.from({ length: 32 }, (_, i) => `m${i * 250}`));
    expect(3000 + REJOIN_FIRST_MS).toBeLessThan(SILENCE_MS);
  });

  it('PM-S3: the host is the anchor: it never leaves the room while the client is gone, and a normal blip needs no retry', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    const hostJoins = (): number => bus.joins.filter((j) => j.startsWith('peerA:pitchmasters-m-')).length;
    const before = hostJoins();
    b.blip(6000); // healthy relays: the blip's own rejoin works
    run(bus, [a, b], 20_000);
    expect(hostJoins()).toBe(before);
    expect(bus.joins.filter((j) => j.startsWith('peerB:pitchmasters-m-')).length).toBe(2); // first join + blip rejoin
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false });
  });

  it('PM-S4 net-blip: a rejoin stuck in the transport handshake is retried as soon as the transport gives up', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    bus.wedge('peerB', 1); // the blip's own rejoin: the host goes live on it, the client never does (live failure)
    expect(b.blip(6000)).toBe(true);
    const got: string[] = [];
    let backAt = -1;
    for (let t = 0; t < 30_000; t += 250) {
      if (t < 4000) a.send(`m${t}`);
      run(bus, [a, b], 250);
      got.push(...b.poll());
      if (backAt < 0 && t > 6000 && !a.status().stalled && !b.status().stalled) backAt = t;
    }
    // The client rejoined at once when its handshake timed out (HANDSHAKE_MS after the blip's rejoin), not after
    // REJOIN_FIRST_MS; the clean leave reset the host's side and the fresh join brought both back, nothing lost.
    expect(backAt).toBeGreaterThan(6000 + HANDSHAKE_MS - 500);
    expect(backAt).toBeLessThan(6000 + HANDSHAKE_MS + 1500);
    expect(6000 + HANDSHAKE_MS + 1500).toBeLessThan(6000 + REJOIN_FIRST_MS);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(got).toEqual(Array.from({ length: 16 }, (_, i) => `m${i * 250}`));
  });

  it('PM-S4 net-blip: a handshake error never moves the host (the anchor)', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    const hostJoins = (): number => bus.joins.filter((j) => j.startsWith('peerA:pitchmasters-m-')).length;
    const before = hostJoins();
    b.blip(6000);
    run(bus, [a, b], 500);
    // The host's own transport reports a stuck handshake with the client (its stray re-attach timing out).
    (a as unknown as { roomHandlers: RoomHandlers }).roomHandlers.onPeerError?.('peerB', 'handshake timed out after 5000ms');
    run(bus, [a, b], 20_000);
    expect(hostJoins()).toBe(before);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false });
  });

  it('a partner who drops and never comes back ends the match after the grace', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    b.blip(1_000_000);
    run(bus, [a, b], 10_000);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: true });
    run(bus, [a, b], SILENCE_MS);
    expect(a.status().state).toBe('closed');
  });

  it('a page frozen by a long game load does not drop a partner who had just stalled itself', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    run(bus, [a, b], 2000);
    const step = (): void => {
      bus.now += 250;
      bus.wall += 250;
    };
    // B's page freezes for 10 s (A hears nothing), then A's page freezes for 25 s while B is back.
    bus.hold('peerB');
    for (let t = 0; t < 9000; t += 250) {
      step();
      a.tick();
      bus.flush();
    }
    bus.hold('peerA'); // A freezes at 9 s
    for (let t = 0; t < 1000; t += 250) step();
    bus.release('peerB'); // B wakes at 10 s and reads what A said meanwhile
    b.tick();
    bus.flush();
    for (let t = 0; t < 24_000; t += 250) {
      step();
      b.tick();
      bus.flush();
    }
    expect(b.status()).toMatchObject({ state: 'matched', stalled: true }); // B: A silent 24 s, inside the grace
    // A wakes at 34 s: it last heard B 32 s ago, but for 25 s of that it was frozen itself.
    a.tick();
    expect(a.status().state).toBe('matched');
    bus.release('peerA');
    bus.flush();
    run(bus, [a, b], 2000);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false });
    a.send('still here');
    bus.flush();
    expect(b.poll()).toEqual(['still here']);
  });

  it('measures a round trip, and reports the partner hiding its tab', () => {
    const bus = new Bus();
    const [a, b] = pair(bus);
    run(bus, [a, b], 2000);
    expect(a.status().rtt).toBeGreaterThanOrEqual(0);
    b.setHidden(true);
    bus.flush();
    expect(a.status().partnerHidden).toBe(true);
    b.setHidden(false);
    bus.flush();
    expect(a.status().partnerHidden).toBe(false);
  });

  it('quick match counts the players searching in this build (us included)', () => {
    const bus = new Bus();
    const a = player(bus, 'peerA', 'x');
    const b = player(bus, 'peerB', 'y'); // other build: never pairs, not counted
    a.quickMatch();
    b.quickMatch();
    run(bus, [a, b], 2000);
    expect(a.status().seekers).toBe(1);
    const c = player(bus, 'peerC', 'x');
    c.quickMatch();
    bus.flush(); // c hears a's hello
    bus.now += 250;
    c.tick(); // counts, then proposes to a (not delivered yet)
    expect(c.status().seekers).toBe(2);
    run(bus, [a, b, c], 3000);
    expect(a.status().state).toBe('matched');
    expect(a.status().seekers).toBe(0); // out of the queue
    a.cancel();
    expect(a.status().seekers).toBe(0);
  });
});

describe('serialRooms (PM-S4 net-blip)', () => {
  /** A transport whose leave() finishes only when the test says so (Trystero: @_leave, ~100 ms, teardown). */
  function slowTransport(): { join: (id: string, h: RoomHandlers) => RoomLike; joins: string[]; leaves: string[]; finish: () => Promise<void> } {
    const joins: string[] = [];
    const leaves: string[] = [];
    let pending: (() => void)[] = [];
    return {
      joins,
      leaves,
      join: (id) => {
        const n = joins.push(id);
        return {
          send: () => undefined,
          leave: () => {
            leaves.push(`${id}#${n}`);
            return new Promise<void>((res) => pending.push(res));
          },
        };
      },
      finish: async () => {
        const p = pending;
        pending = [];
        for (const r of p) r();
        await new Promise((r) => setTimeout(r, 0));
      },
    };
  }
  const h: RoomHandlers = { onMessage: () => undefined, onPeerJoin: () => undefined, onPeerLeave: () => undefined };

  it('a re-join of a room still being left waits for the leave, then joins once', async () => {
    const t = slowTransport();
    const join = serialRooms(t.join);
    const r1 = join('m-1', h);
    expect(t.joins).toEqual(['m-1']);
    void r1.leave();
    join('m-1', h); // the retry: leave + join in one go
    expect(t.joins).toEqual(['m-1']); // NOT the dying room again
    await t.finish();
    expect(t.joins).toEqual(['m-1', 'm-1']);
  });

  it('a leave runs once however often it is called', async () => {
    const t = slowTransport();
    const join = serialRooms(t.join);
    const r1 = join('m-1', h);
    void r1.leave();
    void r1.leave();
    await t.finish();
    void r1.leave();
    expect(t.leaves).toEqual(['m-1#1']);
  });

  it('a waiting join that is left before it ever joined never joins', async () => {
    const t = slowTransport();
    const join = serialRooms(t.join);
    void join('m-1', h).leave();
    void join('m-1', h).leave();
    await t.finish();
    await t.finish();
    expect(t.joins).toEqual(['m-1']);
    expect(t.leaves).toEqual(['m-1#1']);
  });

  it('other room ids are not held up', () => {
    const t = slowTransport();
    const join = serialRooms(t.join);
    void join('m-1', h).leave();
    join('m-2', h);
    expect(t.joins).toEqual(['m-1', 'm-2']);
  });
});

describe('PM-S5 net-reconnect: the match record, a rejoin on a NEW peer id with the seat token, suspend vs cancel', () => {
  /** A quick-match pair whose two "browsers" each keep a record. */
  function pairWithStores(bus: Bus): { a: Matchmaker; b: Matchmaker; sa: ReturnType<typeof memStore>; sb: ReturnType<typeof memStore> } {
    const sa = memStore();
    const sb = memStore();
    const a = player(bus, 'peerA', 'b1', undefined, sa);
    const b = player(bus, 'peerB', 'b1', undefined, sb);
    a.quickMatch();
    run(bus, [a], 500);
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status()).toMatchObject({ state: 'matched', role: 'host' });
    expect(b.status()).toMatchObject({ state: 'matched', role: 'client' });
    return { a, b, sa, sb };
  }

  it('both sides keep a record (room, role, the same seat token, alive) while matched; cancel() clears it', () => {
    const bus = new Bus();
    const { a, b, sa, sb } = pairWithStores(bus);
    const ra = JSON.parse(sa.value ?? '{}');
    const rb = JSON.parse(sb.value ?? '{}');
    expect(ra).toMatchObject({ role: 'host', mode: 'quick', build: 'b1' });
    expect(rb).toMatchObject({ role: 'client', mode: 'quick', build: 'b1' });
    expect(ra.room).toBe(rb.room);
    expect(ra.token).toBe(rb.token);
    expect(ra.token).toMatch(/^[0-9a-f]{16}$/);
    expect(a.resumeInfo()).not.toBe('');
    // `alive` follows the clock (touched every heartbeat), and the game's standing rides along.
    b.setGame('{"round":2}');
    run(bus, [a, b], 5000);
    expect(JSON.parse(sb.value ?? '{}')).toMatchObject({ game: '{"round":2}' });
    expect(JSON.parse(sb.value ?? '{}').alive).toBeGreaterThanOrEqual(bus.wall - 1500);
    b.cancel(); // a leave on purpose: bye + the record goes
    run(bus, [a, b], 1000);
    expect(sb.value).toBeNull();
    expect(a.status().state).toBe('closed'); // ... and the host's record with its match
    expect(sa.value).toBeNull();
  });

  it('the client\'s tab dies and a fresh page rejoins with the token inside the window: adopted on a new id, streams restart, partnerEpoch bumps', () => {
    const bus = new Bus();
    const { a, b, sb } = pairWithStores(bus);
    a.send('old1');
    bus.flush();
    expect(b.poll()).toEqual(['old1']);
    b.suspend(); // pagehide: no bye, the record stays
    expect(sb.value).not.toBeNull();
    run(bus, [a], 4000);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: true, partnerGone: true, partnerEpoch: 0 });
    a.send('while-away'); // what the host sends meanwhile is for the OLD game instance: never delivered to the new one
    // 10 s later a fresh page (new peer id, same browser store) rejoins.
    run(bus, [a], 10000);
    const b2 = player(bus, 'peerB2', 'b1', undefined, sb);
    expect(b2.rejoin()).toBe(true);
    expect(b2.status()).toMatchObject({ state: 'seeking', role: 'client' });
    run(bus, [a, b2], 2000);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false, partnerGone: false, partnerEpoch: 1 });
    expect(b2.status()).toMatchObject({ state: 'matched', role: 'client', stalled: false, partnerEpoch: 0 });
    // Fresh streams: the new page gets nothing from before, and everything from now on, in order, both ways.
    expect(b2.poll()).toEqual([]);
    a.send('r1');
    a.send('r2');
    b2.send('c1');
    bus.flush();
    expect(b2.poll()).toEqual(['r1', 'r2']);
    expect(a.poll()).toEqual(['c1']);
    run(bus, [a, b2], 5000);
    expect(a.status()).toMatchObject({ state: 'matched', stalled: false });
    expect(JSON.parse(sb.value ?? '{}').token).toBe(JSON.parse(a.resumeInfo()).token);
  });

  it('the HOST\'s tab dies and rejoins: the client adopts the new host id', () => {
    const bus = new Bus();
    const { a, b, sa } = pairWithStores(bus);
    a.suspend();
    run(bus, [b], 8000);
    expect(b.status()).toMatchObject({ state: 'matched', stalled: true, partnerGone: true });
    const a2 = player(bus, 'peerA2', 'b1', undefined, sa);
    expect(a2.rejoin()).toBe(true);
    run(bus, [a2, b], 2000);
    expect(b.status()).toMatchObject({ state: 'matched', stalled: false, partnerEpoch: 1 });
    expect(a2.status()).toMatchObject({ state: 'matched', role: 'host', stalled: false });
    a2.send('h1');
    b.send('c1');
    bus.flush();
    expect(b.poll()).toEqual(['h1']);
    expect(a2.poll()).toEqual(['c1']);
  });

  it('a stranger in the room without the token is told the game is full while the partner is away; the partner still rejoins', () => {
    const bus = new Bus();
    const { a, b, sb } = pairWithStores(bus);
    const room = JSON.parse(sb.value ?? '{}').room as string;
    b.suspend();
    run(bus, [a], 3000);
    const x = player(bus, 'peerX');
    // A stranger that knows the room name (no token): friendJoin cannot name a match room, so drive it as a client.
    (x as unknown as { enterMatchRoom(r: string, role: string, e: null, d: number): void }).enterMatchRoom(room, 'client', null, Infinity);
    run(bus, [a, x], 3000);
    expect(a.status()).toMatchObject({ state: 'matched', partnerGone: true, partnerEpoch: 0 });
    expect(x.status().state).not.toBe('matched');
    const b2 = player(bus, 'peerB2', 'b1', undefined, sb);
    expect(b2.rejoin()).toBe(true);
    run(bus, [a, x, b2], 3000);
    expect(a.status()).toMatchObject({ state: 'matched', partnerGone: false, partnerEpoch: 1 });
    expect(b2.status().state).toBe('matched');
  });

  it('a record older than the window (SILENCE_MS + REJOIN_SLACK_MS) is dead: rejoin() fails, says so and clears it', () => {
    const bus = new Bus();
    const { b, sb } = pairWithStores(bus);
    b.suspend();
    bus.wall += SILENCE_MS + REJOIN_SLACK_MS + 1000;
    const b2 = player(bus, 'peerB2', 'b1', undefined, sb);
    expect(b2.resumeInfo()).toBe('');
    expect(b2.rejoin()).toBe(false);
    expect(b2.status()).toMatchObject({ state: 'error', detail: 'Your match is over.' });
    expect(sb.value).toBeNull();
  });

  it('a rejoin whose partner is no longer waiting gives up after its deadline (no quick-match re-queue) and clears the record', () => {
    const bus = new Bus();
    const { a, b, sb } = pairWithStores(bus);
    b.suspend();
    a.cancel(); // the host left for good meanwhile
    run(bus, [a], 1000);
    const b2 = player(bus, 'peerB2', 'b1', undefined, sb);
    expect(b2.rejoin()).toBe(true);
    run(bus, [b2], SILENCE_MS + REJOIN_SLACK_MS + 2000);
    expect(b2.status()).toMatchObject({ state: 'error', detail: 'Your match is over.' });
    expect(sb.value).toBeNull();
    expect(bus.members(DISCOVERY_ROOM)).toEqual([]);
  });

  it('the partner\'s silence limit still closes the match and clears the record (the stayer takes the forfeit)', () => {
    const bus = new Bus();
    const { a, b, sa } = pairWithStores(bus);
    b.suspend();
    run(bus, [a], SILENCE_MS + 1000);
    expect(a.status().state).toBe('closed');
    // PM-S4 reconnect-live: the game says "did not come back" for this one, not "left the match".
    expect(a.status().closedWhy).toBe('silence');
    expect(sa.value).toBeNull();
  });

  it('PM-S4 reconnect-live: closedWhy tells a leave on purpose (bye) from the silence limit; empty while matched', () => {
    const bus = new Bus();
    const { a, b } = pairWithStores(bus);
    expect(a.status().closedWhy).toBe('');
    expect(b.status().closedWhy).toBe('');
    b.cancel();
    run(bus, [a, b], 1000);
    expect(a.status()).toMatchObject({ state: 'closed', closedWhy: 'bye' });
    expect(b.status().closedWhy).toBe(''); // the leaver itself is idle, not closed
  });

  it('the window is the game\'s: SILENCE_MS is 30 s (Net.RECONNECT_GRACE_S) and the slack 6 s (NetResume.SLACK_S)', () => {
    expect(SILENCE_MS).toBe(30000);
    expect(REJOIN_SLACK_MS).toBe(6000);
  });
});

describe('PM-S5 lag-research: the fast lane for snapshots', () => {
  function pair(fast: boolean): { bus: Bus; a: Matchmaker; b: Matchmaker } {
    const bus = new Bus();
    bus.fastLanes = fast;
    const a = player(bus, 'peerA');
    a.quickMatch();
    run(bus, [a], 3000);
    const b = player(bus, 'peerB');
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status().state).toBe('matched');
    expect(b.status().state).toBe('matched');
    return { bus, a, b };
  }

  it('unreliable packets ride the fast lane, outside the sequence: a lost one holds nothing back and is not re-sent', () => {
    const { bus, a, b } = pair(true);
    bus.dropFast = (d) => d === 'U2';
    for (let i = 0; i < 5; i++) {
      expect(a.send(`R${i}`)).toBe(true);
      expect(a.sendUnreliable(`U${i}`)).toBe(true);
    }
    bus.flush();
    const got = b.poll();
    expect(got.filter((x) => x.startsWith('R'))).toEqual(['R0', 'R1', 'R2', 'R3', 'R4']);
    expect(got.filter((x) => x.startsWith('U'))).toEqual(['U0', 'U1', 'U3', 'U4']);
    expect(a.status().fastSent).toBe(5);
    expect(b.status().fastRecv).toBe(4);
    run(bus, [a, b], 3000); // pings / acks / nacks: the lost snapshot never comes back
    expect(b.poll().filter((x) => x === 'U2')).toEqual([]);
  });

  it('without a fast lane an unreliable packet is a normal, sequenced send (the old behaviour)', () => {
    const { bus, a, b } = pair(false);
    a.sendUnreliable('U0');
    a.send('R0');
    a.sendUnreliable('U1');
    bus.flush();
    expect(b.poll()).toEqual(['U0', 'R0', 'U1']);
    expect(a.status().fastSent).toBe(0);
  });

  it('?nofast=1 (fastLane = false) keeps every packet on the reliable lane', () => {
    const { bus, a, b } = pair(true);
    a.fastLane = false;
    a.sendUnreliable('U0');
    bus.flush();
    expect(b.poll()).toEqual(['U0']);
    expect(a.status().fastSent).toBe(0);
  });
});
