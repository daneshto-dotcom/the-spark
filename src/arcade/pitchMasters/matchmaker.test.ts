/**
 * PITCH MASTERS (arcade) — the 1v1 matchmaker, driven over an in-memory "relay" with a fake clock.
 * The real page runs the same class over Trystero; the browser harness covers that wire.
 */

import { describe, expect, it } from 'vitest';

import {
  CODE_ALPHABET,
  DISCOVERY_ROOM,
  FRIEND_JOIN_TIMEOUT_MS,
  isElder,
  Matchmaker,
  MATCH_ROOM_TIMEOUT_MS,
  parseFriendCode,
  SILENCE_MS,
  type Channel,
  type RoomHandlers,
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

  /** A frozen tab (its main thread blocked): nothing reaches `peer` until release(peer). */
  hold(peer: string): void {
    if (!this.held.has(peer)) this.held.set(peer, []);
  }

  release(peer: string): void {
    const q = this.held.get(peer) ?? [];
    this.held.delete(peer);
    this.queue.push(...q);
  }

  join(roomId: string, peer: string, h: RoomHandlers): { send: (c: Channel, d: string, to?: string) => void; leave: () => void } {
    this.joins.push(`${peer}:${roomId}`);
    let room = this.rooms.get(roomId);
    if (room === undefined) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    const r = room;
    for (const [other, oh] of r) {
      this.queue.push(() => {
        if (r.get(other) === oh && r.get(peer) === h) {
          oh.onPeerJoin(peer);
          h.onPeerJoin(other);
        }
      });
    }
    r.set(peer, h);
    return {
      send: (c, d, to) => {
        for (const [other, oh] of r) {
          if (other === peer || (to !== undefined && to !== other)) continue;
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
    for (let i = 0; i < 10_000 && this.queue.length > 0; i++) this.queue.shift()!();
  }

  members(roomId: string): string[] {
    return [...(this.rooms.get(roomId)?.keys() ?? [])];
  }
}

function player(bus: Bus, id: string, build = 'b1', seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1): Matchmaker {
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
