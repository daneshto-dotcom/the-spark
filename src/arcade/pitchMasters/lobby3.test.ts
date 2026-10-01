/**
 * PITCH MASTERS (arcade) — the three-sided room (PM-S4 P3), driven over an in-memory relay with a fake clock.
 * The real page runs the same class over Trystero; `web/harness/pitchnet.pm.spec.mjs` covers that wire.
 */

import { describe, expect, it } from 'vitest';

import {
  CODE3_LEN,
  isThreeCode,
  Lobby3,
  MAX_CLIENTS,
  QM3_DISCOVERY_ROOM,
  QM3_OPEN_MS,
} from './lobby3.ts';
import { DISCOVERY_ROOM, Matchmaker, SILENCE_MS, type Channel, type RoomHandlers } from './matchmaker.ts';

/** Every room of a fake relay; messages are queued and delivered by `flush()`, in order. */
class Bus {
  now = 0;
  wall = 1_000_000;
  private readonly rooms = new Map<string, Map<string, RoomHandlers>>();
  private queue: (() => void)[] = [];
  readonly joins: string[] = [];
  /** Every pk packet that crossed the relay: `from>to` (the star check). */
  readonly pkRoutes: string[] = [];

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
          if (c === 'pk') this.pkRoutes.push(`${peer}>${other}`);
          this.queue.push(() => {
            if (r.get(other) === oh && r.get(peer) === h) oh.onMessage(c, d, peer);
          });
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

function deps(bus: Bus, id: string) {
  let s = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1;
  return {
    selfId: id,
    join: (roomId: string, h: RoomHandlers) => bus.join(roomId, id, h),
    now: () => bus.now,
    wallNow: () => bus.wall,
    random: () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    },
  };
}

function seat(bus: Bus, id: string, build = 'b1'): Lobby3 {
  const l = new Lobby3(deps(bus, id));
  l.build = build;
  return l;
}

type Ticker = { tick(): void };

function run(bus: Bus, players: Ticker[], ms: number): void {
  for (let t = 0; t < ms; t += 250) {
    bus.now += 250;
    bus.wall += 250;
    for (const p of players) p.tick();
    bus.flush();
  }
}

/** Host + two friends, all seated. */
function friends(bus: Bus): { h: Lobby3; a: Lobby3; b: Lobby3; code: string } {
  const h = seat(bus, 'host');
  const a = seat(bus, 'amy');
  const b = seat(bus, 'bob');
  const code = h.friendHost();
  run(bus, [h], 500);
  a.friendJoin(code.toLowerCase());
  run(bus, [h, a], 2000);
  b.friendJoin(code);
  run(bus, [h, a, b], 2000);
  return { h, a, b, code };
}

describe('three-sided codes', () => {
  it('a three-sided room has a 6-letter code; the 1v1 5-letter codes stay 1v1', () => {
    const bus = new Bus();
    const h = seat(bus, 'host');
    const code = h.friendHost();
    expect(code).toHaveLength(CODE3_LEN);
    expect(isThreeCode(code)).toBe(true);
    expect(isThreeCode('K7M4Q')).toBe(false);
    expect(isThreeCode('k7m-4qp')).toBe(true);
    expect(isThreeCode('nope!!')).toBe(false);
  });
});

describe('play friends (3 humans / 2 humans + AI)', () => {
  it('the host is up at once; two friends take seats 2 and 3', () => {
    const bus = new Bus();
    const h = seat(bus, 'host');
    h.friendHost();
    expect(h.status()).toMatchObject({ state: 'matched', role: 'host', seats: 3, slot: 1, lobby: 'open', partners: [] });
    const { a, b } = (() => {
      const a = seat(bus, 'amy');
      a.friendJoin(h.status().code);
      run(bus, [h, a], 2000);
      expect(h.status().detail).toContain('1 / 2');
      const b = seat(bus, 'bob');
      b.friendJoin(h.status().code);
      run(bus, [h, a, b], 2000);
      return { a, b };
    })();
    expect(a.status()).toMatchObject({ state: 'matched', role: 'client', slot: 2, seats: 3 });
    expect(b.status()).toMatchObject({ state: 'matched', role: 'client', slot: 3, seats: 3 });
    expect(h.status().partners.map((p) => p.slot)).toEqual([2, 3]);
    expect(h.status().lobby).toBe('closed'); // full
    expect(h.status().detail).toContain('2 / 2');
  });

  it('star: a private packet reaches only its seat, a broadcast both; clients never exchange a packet', () => {
    const bus = new Bus();
    const { h, a, b } = friends(bus);
    expect(h.send('SEFORA', 2)).toBe(true); // "hand for seat 2"
    expect(h.send('SEFORB', 3)).toBe(true);
    expect(h.send('QUxM', 0)).toBe(true); // everyone
    expect(a.send('RlJPTUE=')).toBe(true);
    expect(b.send('RlJPTUI=')).toBe(true);
    bus.flush();
    expect(a.poll()).toEqual(['1:SEFORA', '1:QUxM']);
    expect(b.poll()).toEqual(['1:SEFORB', '1:QUxM']);
    expect(h.poll()).toEqual(['2:RlJPTUE=', '3:RlJPTUI=']);
    const clientToClient = bus.pkRoutes.filter((r) => r === 'amy>bob' || r === 'bob>amy');
    expect(clientToClient).toEqual([]);
  });

  it('a fourth player with the code is told the game is full', () => {
    const bus = new Bus();
    const { h, a, b, code } = friends(bus);
    const x = seat(bus, 'xena');
    x.friendJoin(code);
    run(bus, [h, a, b, x], 3000);
    expect(x.status().state).toBe('error');
    expect(x.status().detail).toContain('three players');
    expect(h.status().partners).toHaveLength(MAX_CLIENTS);
  });

  it('START WITH AI (lock) with one friend: a latecomer is refused, the seated friend plays on', () => {
    const bus = new Bus();
    const h = seat(bus, 'host');
    const a = seat(bus, 'amy');
    const code = h.friendHost();
    a.friendJoin(code);
    run(bus, [h, a], 2000);
    h.lock();
    expect(h.status().lobby).toBe('closed');
    const late = seat(bus, 'late');
    late.friendJoin(code);
    run(bus, [h, a, late], 3000);
    expect(late.status().state).toBe('error');
    expect(a.status().state).toBe('matched');
    h.send('b2s=', 2);
    bus.flush();
    expect(a.poll()).toEqual(['1:b2s=']);
  });

  it('a friend leaving mid-match frees only that seat: the host and the other friend stay matched', () => {
    const bus = new Bus();
    const { h, a, b } = friends(bus);
    h.lock();
    b.cancel(); // closes the tab: bye
    run(bus, [h, a], 1000);
    expect(h.status().state).toBe('matched');
    expect(h.status().partners.map((p) => p.slot)).toEqual([2]);
    expect(a.status().state).toBe('matched');
    h.send('c3RpbGw=', 0);
    bus.flush();
    expect(a.poll()).toEqual(['1:c3RpbGw=']);
  });

  it('a friend whose tab dies (no bye) is dropped after the silence limit; the match goes on', () => {
    const bus = new Bus();
    const { h, a, b, code } = friends(bus);
    h.lock();
    bus.vanish(`pitchmasters-f3-${code}`, 'bob');
    run(bus, [h, a], 5000);
    expect(h.status().stalled).toBe(true); // bob is silent
    expect(h.status().partners.find((p) => p.slot === 3)?.stalled).toBe(true);
    run(bus, [h, a], SILENCE_MS);
    expect(h.status().partners.map((p) => p.slot)).toEqual([2]);
    expect(h.status().state).toBe('matched');
    expect(a.status().state).toBe('matched');
    void b;
  });

  it('the host leaving ends the match for both friends', () => {
    const bus = new Bus();
    const { h, a, b } = friends(bus);
    h.cancel();
    run(bus, [a, b], 1000);
    expect(a.status().state).toBe('closed');
    expect(b.status().state).toBe('closed');
    expect(a.status().detail).toContain('host left');
  });

  it('a 6 s blip of one friend: that seat resumes, nothing lost, in order; the other seat never stalls', () => {
    const bus = new Bus();
    const { h, a, b } = friends(bus);
    h.lock();
    let n = 0;
    const stream = (ms: number): void => {
      for (let t = 0; t < ms; t += 250) {
        for (let k = 0; k < 5; k++) h.send(btoa(`n${n++}`), 2);
        run(bus, [h, a, b], 250);
      }
    };
    stream(2000);
    expect(a.blip(6000)).toBe(true);
    stream(4000);
    expect(h.status().partners.find((p) => p.slot === 2)?.stalled).toBe(true);
    expect(h.status().partners.find((p) => p.slot === 3)?.stalled).toBe(false);
    stream(8000);
    run(bus, [h, a, b], 2000);
    const got = a.poll().map((x) => atob(x.slice(2)));
    expect(got).toEqual(Array.from({ length: n }, (_, i) => `n${i}`));
    expect(h.status().partners.every((p) => !p.stalled)).toBe(true);
    expect(b.poll()).toEqual([]);
  });

  it('a friend on another build is told the versions differ; the lobby stays up', () => {
    const bus = new Bus();
    const h = seat(bus, 'host', 'b1');
    const old = seat(bus, 'old', 'b0');
    const code = h.friendHost();
    old.friendJoin(code);
    run(bus, [h, old], 3000);
    expect(old.status().state).toBe('error');
    expect(old.status().detail).toContain('different versions');
    expect(h.status()).toMatchObject({ state: 'matched', lobby: 'open', partners: [] });
  });

  it('a wrong code gives up after the join timeout', () => {
    const bus = new Bus();
    const a = seat(bus, 'amy');
    a.friendJoin('ZZZZZZ');
    run(bus, [a], 50_000);
    expect(a.status().state).toBe('error');
    expect(a.status().detail).toContain('No game found');
  });
});

describe('quick match three-sided (qm3)', () => {
  it('three seekers end in one lobby: host + seats 2 and 3, the lobby closes when full', () => {
    const bus = new Bus();
    const ps = ['q1', 'q2', 'q3'].map((id) => seat(bus, id));
    ps[0].quickMatch();
    run(bus, ps, 1000);
    ps[1].quickMatch();
    run(bus, ps, 1000);
    ps[2].quickMatch();
    run(bus, ps, 12_000);
    expect(ps.map((p) => p.status().state)).toEqual(['matched', 'matched', 'matched']);
    const host = ps.find((p) => p.status().role === 'host')!;
    expect(host).toBe(ps[0]); // the eldest seeker hosts
    expect(host.status().partners.map((p) => p.slot)).toEqual([2, 3]);
    expect(host.status().lobby).toBe('closed');
    expect(ps.filter((p) => p.status().role === 'client').map((p) => p.status().slot).sort()).toEqual([2, 3]);
    expect(bus.members(QM3_DISCOVERY_ROOM)).toEqual([]);
    // The star again: the host reaches each seat.
    host.send('eA==', 0);
    bus.flush();
    for (const c of ps.filter((p) => p !== host)) expect(c.poll()).toEqual(['1:eA==']);
  });

  it('two seekers: the lobby waits QM3_OPEN_MS for a third, then closes (the game starts with an AI)', () => {
    const bus = new Bus();
    const a = seat(bus, 'q1');
    const b = seat(bus, 'q2');
    a.quickMatch();
    run(bus, [a, b], 1000);
    b.quickMatch();
    run(bus, [a, b], 6000);
    expect(a.status()).toMatchObject({ state: 'matched', role: 'host', lobby: 'open' });
    expect(a.status().startIn).toBeGreaterThan(5);
    expect(b.status()).toMatchObject({ state: 'matched', role: 'client', slot: 2 });
    run(bus, [a, b], QM3_OPEN_MS);
    expect(a.status().lobby).toBe('closed');
    expect(a.status().startIn).toBe(0);
    // A late seeker no longer finds this lobby: it keeps searching.
    const c = seat(bus, 'q3');
    c.quickMatch();
    run(bus, [a, b, c], 8000);
    expect(c.status().state).toBe('seeking');
    expect(a.status().partners).toHaveLength(1);
  });

  it('a fourth seeker is not seated in a full lobby and pairs with the next one', () => {
    const bus = new Bus();
    const ps = ['q1', 'q2', 'q3'].map((id) => seat(bus, id));
    for (const p of ps) p.quickMatch();
    run(bus, ps, 12_000);
    expect(ps.every((p) => p.status().state === 'matched')).toBe(true);
    const d = seat(bus, 'q4');
    d.quickMatch();
    run(bus, [...ps, d], 8000);
    expect(d.status().state).toBe('seeking');
    const e = seat(bus, 'q5');
    e.quickMatch();
    run(bus, [...ps, d, e], 8000);
    expect(d.status().state).toBe('matched');
    expect(e.status().state).toBe('matched');
  });

  it('three-sided and 1v1 quick match never meet (separate discovery rooms)', () => {
    const bus = new Bus();
    const t = seat(bus, 'three');
    const one = new Matchmaker(deps(bus, 'one'));
    one.build = 'b1';
    t.quickMatch();
    one.quickMatch();
    run(bus, [t, one], 10_000);
    expect(t.status().state).toBe('seeking');
    expect(one.status().state).toBe('seeking');
    expect(bus.members(DISCOVERY_ROOM)).toEqual(['one']);
    expect(bus.members(QM3_DISCOVERY_ROOM)).toEqual(['three']);
  });

  it('cancel leaves everything: back to idle, out of every room', () => {
    const bus = new Bus();
    const a = seat(bus, 'q1');
    const b = seat(bus, 'q2');
    a.quickMatch();
    b.quickMatch();
    run(bus, [a, b], 6000);
    a.cancel();
    run(bus, [a, b], 3000);
    expect(a.status().state).toBe('idle');
    expect(a.active()).toBe(false);
    // b's host left before kick-off: b is told.
    expect(b.status().state).toBe('closed');
  });
});
