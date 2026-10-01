/**
 * SPARK — S189 (C6): **QUICK MATCH — THE PLAYER WHO WAS IN THE LOBBY FIRST STAYS PLAYER ONE.**
 *
 * Owner, S189: *"Quick match … I'm player one … my brother connects … it switches me to player two
 * puts him as player one … only happens to this workstation … if my brother goes in as player one and
 * then I join him then I'm player two"*.
 *
 * ⛔ THE MECHANISM (verified by hand, S189). The late seeker's 2–3.5 s promote clock usually beats
 * the discovery handshake (S182, `quickmatch.test.ts`), so both peers become PEERLESS HOSTS and the
 * demote arm decides — and it decided by CODE: the larger code yields. The code is the host identity
 * fingerprint, minted ONCE PER PAGE LOAD (`main.ts` `generateHostIdentity()` at boot; hosted as
 * `hostIdentity.roomCode` in `hostHandlers.ts`). So for one pair of open tabs the verdict repeated on
 * every attempt: the owner's tab held the larger code, and he was demoted whenever both promoted —
 * which is the swap when he was first, and the P2 he expected when he was second. That is the
 * "only this workstation" bias: per page load, not per machine; a reload re-rolls it.
 *
 * ⭐ THE FIX: beacons carry the sender's lobby AGE (its own monotonic clock — no clock sync needed)
 * and the elder keeps the room; a near-tie is broken by the code. `decideQuickmatch`'s docblock
 * carries the proof that no pair can both yield; the sweep at the bottom checks it end to end.
 *
 * ⭐ THE REACH HALF drives the REAL `QuickmatchDiscovery` — its tick, announce, bookkeeping and the
 * callbacks `main.ts` wires — over an in-memory discovery room (`QmDiscoveryDeps`), with a model of
 * the host rooms that records a join into a torn-down room as a DEAD JOIN.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decideQuickmatch,
  parseQmBeacon,
  qmCompareRooms,
  qmEstimatedAgeMs,
  qmOutranksMe,
  qmPromoteDelayMs,
  QM_AGE_MARGIN_MS,
  QM_MAX_HOLDS,
  QuickmatchDiscovery,
  ANNOUNCE_INTERVAL_MS,
  TICK_INTERVAL_MS,
  type QmActionLike,
  type QmDecisionState,
  type QmDiscoveryDeps,
  type QmHeard,
  type QmRoomLike,
} from './quickmatch.ts';

/* ═════════════════════════════ the in-memory world ═════════════════════════════ */

interface Endpoint {
  readonly id: string;
  readonly room: QmRoomLike;
  readonly action: QmActionLike;
  readonly open: Set<string>;
  live: boolean;
}

/** A discovery room: channels open `handshakeMs` after the later of two joins; messages take `transitMs`. */
class DiscoveryBus {
  private readonly eps = new Map<string, Endpoint>();

  constructor(
    private readonly handshakeMs: number,
    private readonly transitMs: number,
    private readonly leaveDetectMs = 1000,
  ) {}

  deps(id: string, selfId: string): QmDiscoveryDeps {
    return { openRoom: () => this.openRoom(id), now: () => Date.now(), selfId };
  }

  private openRoom(id: string): { room: QmRoomLike; action: QmActionLike } {
    const ep: Endpoint = {
      id,
      open: new Set(),
      live: true,
      room: {
        onPeerJoin: null,
        onPeerLeave: null,
        leave: () => {
          this.leave(ep);
          return Promise.resolve();
        },
      },
      action: {
        onMessage: null,
        send: (data, opts) => this.send(ep, data, opts?.target),
      },
    };
    const others = [...this.eps.values()].filter((e) => e.live);
    this.eps.set(id, ep);
    for (const q of others) {
      setTimeout(() => {
        if (!ep.live || !q.live) return;
        ep.open.add(q.id);
        q.open.add(ep.id);
        q.room.onPeerJoin?.(ep.id);
        ep.room.onPeerJoin?.(q.id);
      }, this.handshakeMs);
    }
    return { room: ep.room, action: ep.action };
  }

  private send(from: Endpoint, data: string, target: string | undefined): void {
    if (!from.live) return;
    for (const to of from.open) {
      if (target !== undefined && to !== target) continue;
      setTimeout(() => {
        const q = this.eps.get(to);
        if (q !== undefined && q.live && q.open.has(from.id)) q.action.onMessage?.(data, { peerId: from.id });
      }, this.transitMs);
    }
  }

  private leave(ep: Endpoint): void {
    ep.live = false;
    for (const to of ep.open) {
      const q = this.eps.get(to);
      if (q === undefined) continue;
      q.open.delete(ep.id);
      setTimeout(() => {
        if (q.live) q.room.onPeerLeave?.(ep.id);
      }, this.leaveDetectMs);
    }
    ep.open.clear();
  }
}

/** The GAME rooms — what `becomeHost` / `joinCode` / `teardownHost` do in `main.ts`, modelled. */
class HostRooms {
  readonly rooms = new Map<string, { live: boolean; peers: number }>();
  readonly deadJoins: string[] = [];
}

class Tab {
  state: 'idle' | 'seeking' | 'hosting' | 'joining' | 'client' | 'dead' = 'idle';
  joinedCode: string | null = null;
  promotions = 0;
  teardowns = 0;
  readonly qm: QuickmatchDiscovery;

  constructor(
    readonly name: string,
    readonly code: string,
    selfId: string,
    bus: DiscoveryBus,
    rooms: HostRooms,
    joinMs: number,
  ) {
    this.qm = new QuickmatchDiscovery(
      {
        becomeHost: () => {
          this.state = 'hosting';
          this.promotions++;
          rooms.rooms.set(code, { live: true, peers: 0 });
          return code;
        },
        joinCode: (c) => {
          this.state = 'joining';
          this.joinedCode = c;
          setTimeout(() => {
            const r = rooms.rooms.get(c);
            if (r !== undefined && r.live) {
              r.peers++;
              this.state = 'client';
            } else {
              this.state = 'dead';
              rooms.deadJoins.push(this.name);
            }
          }, joinMs);
        },
        teardownHost: () => {
          const r = rooms.rooms.get(code);
          if (r !== undefined) r.live = false;
          this.teardowns++;
        },
        hostPeerCount: () => {
          const r = rooms.rooms.get(code);
          return r !== undefined && r.live ? r.peers : 0;
        },
      },
      bus.deps(name, selfId),
    );
  }

  click(): void {
    this.state = 'seeking';
    this.qm.start();
  }
}

interface PairOpts {
  readonly firstCode: string;
  readonly secondCode: string;
  readonly gapMs: number;
  readonly handshakeMs: number;
  readonly transitMs?: number;
  readonly joinMs?: number;
  readonly firstSelfId?: string;
  readonly secondSelfId?: string;
}

/** Two tabs press Quick Match `gapMs` apart; run the world a minute past the second click. */
function runPair(o: PairOpts): { first: Tab; second: Tab; rooms: HostRooms } {
  vi.useFakeTimers();
  const bus = new DiscoveryBus(o.handshakeMs, o.transitMs ?? 80);
  const rooms = new HostRooms();
  const joinMs = o.joinMs ?? 1500;
  const first = new Tab('first', o.firstCode, o.firstSelfId ?? 'tab-first', bus, rooms, joinMs);
  const second = new Tab('second', o.secondCode, o.secondSelfId ?? 'tab-second', bus, rooms, joinMs);
  first.click();
  vi.advanceTimersByTime(o.gapMs);
  second.click();
  vi.advanceTimersByTime(60_000);
  first.qm.stop();
  second.qm.stop();
  return { first, second, rooms };
}

/** Exactly one host, the other its client, nobody stranded in a dead room. */
function expectOneRoom(r: { first: Tab; second: Tab; rooms: HostRooms }): Tab {
  expect(r.rooms.deadJoins, 'a join landed in a torn-down room — both peers yielded').toEqual([]);
  const hosts = [r.first, r.second].filter((t) => t.state === 'hosting');
  expect(hosts.length, `states: ${r.first.state} / ${r.second.state}`).toBe(1);
  const host = hosts[0]!;
  const client = host === r.first ? r.second : r.first;
  expect(client.state).toBe('client');
  expect(client.joinedCode).toBe(host.code);
  expect(r.rooms.rooms.get(host.code)).toEqual({ live: true, peers: 1 });
  expect(host.teardowns, 'the host must never have torn its room down').toBe(0);
  return host;
}

afterEach(() => {
  vi.useRealTimers();
});

/* ═════════════════════════════ REACH — the real class ═════════════════════════════ */

describe('S189 C6 — REACH: two real QuickmatchDiscovery instances, both arrival orders', () => {
  it('⛔ THE OWNER\'S CASE: the first tab holds the LARGER code, the second promotes before it hears — the FIRST stays P1', () => {
    const r = runPair({ firstCode: 'ZZZZZZ', secondCode: 'AAAAAA', gapMs: 60_000, handshakeMs: 5000 });
    // The second tab really did become a peerless host first — this is the demote arm, the path that
    // produced the swap, not a direct join that would have passed under the old rule too.
    expect(r.second.promotions).toBe(1);
    expect(r.second.teardowns).toBe(1);
    expect(expectOneRoom(r)).toBe(r.first);
  });

  it('the reverse arrival order with the SAME two codes — the (smaller-code) first tab stays P1', () => {
    const r = runPair({ firstCode: 'AAAAAA', secondCode: 'ZZZZZZ', gapMs: 60_000, handshakeMs: 5000 });
    expect(r.second.promotions).toBe(1);
    expect(expectOneRoom(r)).toBe(r.first);
  });

  it('⭐ across gaps and handshakes, in BOTH orders, the first tab is P1 every time', () => {
    for (const gapMs of [2_000, 5_000, 60_000, 180_000]) {
      for (const handshakeMs of [3_000, 5_000, 12_000]) {
        for (const [firstCode, secondCode] of [
          ['ZZZZZZ', 'AAAAAA'],
          ['AAAAAA', 'ZZZZZZ'],
        ] as const) {
          const r = runPair({ firstCode, secondCode, gapMs, handshakeMs });
          expect(expectOneRoom(r), `gap ${gapMs} handshake ${handshakeMs} first ${firstCode}`).toBe(r.first);
          vi.useRealTimers();
        }
      }
    }
  });

  it('a FAST handshake (inside the promote window) is a direct join — the newcomer never hosts', () => {
    const r = runPair({ firstCode: 'ZZZZZZ', secondCode: 'AAAAAA', gapMs: 30_000, handshakeMs: 600 });
    expect(r.second.promotions).toBe(0);
    expect(expectOneRoom(r)).toBe(r.first);
  });

  it('⭐ ANNOUNCE ON JOIN: a channel that opens just after the incumbent\'s cadence tick is answered at once', () => {
    /*
     * Constructed so the periodic beacon CANNOT save the newcomer: its channel opens 100 ms after the
     * incumbent's announce tick, and its own promote deadline falls before the next tick. Only the
     * on-join beacon reaches it in time; without it the newcomer promotes and the pair goes the long
     * way round (still correct, since S189, but not a direct join).
     */
    // A newcomer whose promote deadline is ≤ 2100 ms promotes at its THIRD tick (2100 ms).
    let secondSelfId = '';
    for (let i = 0; i < 4096 && secondSelfId === ''; i++) {
      if (qmPromoteDelayMs(`fast-${i}`) <= 3 * TICK_INTERVAL_MS) secondSelfId = `fast-${i}`;
    }
    expect(secondSelfId).not.toBe('');
    // The first promotes at its first tick past its deadline and announces then and every 2 s. The
    // second clicks so that its channel (handshake 400 ms) opens 100 ms after the announce 10 cadences
    // in; the next periodic beacon lands at click + 2380 ms — after the newcomer's 2100 ms promote.
    const promoteAt = Math.ceil(qmPromoteDelayMs('tab-first') / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
    const gapMs = promoteAt + 10 * ANNOUNCE_INTERVAL_MS + 100 - 400;
    const r = runPair({ firstCode: 'ZZZZZZ', secondCode: 'AAAAAA', gapMs, handshakeMs: 400, secondSelfId });
    expect(r.second.promotions, 'the newcomer promoted — it never heard the incumbent in time').toBe(0);
    expect(expectOneRoom(r)).toBe(r.first);
  });

  it('a NEAR-TIE (clicks 100 ms apart) still ends in ONE room — the code breaks it, in both orders', () => {
    for (const [firstCode, secondCode] of [
      ['ZZZZZZ', 'AAAAAA'],
      ['AAAAAA', 'ZZZZZZ'],
    ] as const) {
      const r = runPair({ firstCode, secondCode, gapMs: 100, handshakeMs: 5000 });
      // Both promoted (the handshake outlived both clocks) and each judged itself the elder: a mutual
      // hold, broken by the code on both sides alike.
      expect(r.first.promotions).toBe(1);
      expect(r.second.promotions).toBe(1);
      expect(expectOneRoom(r).code).toBe('AAAAAA');
      vi.useRealTimers();
    }
  });

  it('NEGATIVE: a beacon from a peer that has LEFT the discovery room is forgotten, not joined', () => {
    vi.useFakeTimers();
    const room: QmRoomLike = { onPeerJoin: null, onPeerLeave: null, leave: () => Promise.resolve() };
    const action: QmActionLike = { onMessage: null, send: () => undefined };
    const deps: QmDiscoveryDeps = {
      openRoom: () => ({ room, action }),
      now: () => Date.now(),
      selfId: 'lonely',
    };
    const joined: string[] = [];
    let hosted = 0;
    const qm = new QuickmatchDiscovery(
      {
        becomeHost: () => {
          hosted++;
          return 'MMMMMM';
        },
        joinCode: (c) => joined.push(c),
        teardownHost: () => undefined,
        hostPeerCount: () => 0,
      },
      deps,
    );
    qm.start();
    // A host beacons, then goes into its match (leaves discovery) before this seeker's next tick.
    action.onMessage!(JSON.stringify({ t: 'host', code: 'AAAAAA', full: false, ageMs: 9000 }), { peerId: 'p1' });
    room.onPeerLeave!('p1');
    vi.advanceTimersByTime(10_000);
    qm.stop();
    expect(joined, 'joined a room whose host had already left').toEqual([]);
    expect(hosted).toBe(1); // it waited out its window and hosted instead
  });

  it('⭐ SWEEP: 300 random pairs — always ONE room, never a dead join, and the first tab wins any real gap', () => {
    // mulberry32 — a seeded PRNG, so a red run is reproducible from its index.
    let seed = 0x5189c6;
    const rnd = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = (): string => Array.from({ length: 6 }, () => ALPHA.charAt(Math.floor(rnd() * ALPHA.length))).join('');
    for (let trial = 0; trial < 300; trial++) {
      const firstCode = code();
      let secondCode = code();
      while (secondCode === firstCode) secondCode = code();
      const gapMs = Math.floor(rnd() * 20_000);
      const handshakeMs = 200 + Math.floor(rnd() * 15_000);
      const transitMs = 5 + Math.floor(rnd() * 400);
      const r = runPair({
        firstCode,
        secondCode,
        gapMs,
        handshakeMs,
        transitMs,
        firstSelfId: `a${trial}`,
        secondSelfId: `b${trial}`,
      });
      const label = `trial ${trial}: gap ${gapMs} hs ${handshakeMs} transit ${transitMs} ${firstCode}/${secondCode}`;
      let host: Tab;
      try {
        host = expectOneRoom(r);
      } catch (e) {
        throw new Error(`${label}: ${(e as Error).message}`);
      }
      // A gap beyond the margin + transit — and beyond the promote jitter, below which the SECOND
      // click can legitimately promote first while both still seek — must go to the first tab.
      if (gapMs > QM_AGE_MARGIN_MS + transitMs && gapMs > 1500) {
        expect(host, label).toBe(r.first);
      }
      vi.useRealTimers();
    }
  });
});

/* ═════════════════════════════ the pure election ═════════════════════════════ */

const beacon = (code: string, over: Partial<QmHeard> = {}): QmHeard => ({ t: 'host', code, full: false, ...over });
const heardOf = (...hs: QmHeard[]): Map<string, QmHeard> => new Map(hs.map((h) => [h.code, h]));
const hosting = (myCode: string, over: Partial<QmDecisionState> = {}): QmDecisionState => ({
  role: 'hosting',
  myCode,
  hostHasPeers: false,
  elapsedMs: 10_000,
  promoteDelayMs: 2500,
  nowMs: 100_000,
  ...over,
});

describe('S189 C6 — the pure election: the elder keeps the room', () => {
  it('the estimate is an UNDER-estimate: sent age + time since ARRIVAL − the margin', () => {
    expect(qmEstimatedAgeMs(beacon('AAAAAA', { ageMs: 4000, receivedAtMs: 90_000 }), 100_000)).toBe(
      4000 + 10_000 - QM_AGE_MARGIN_MS,
    );
    expect(qmEstimatedAgeMs(beacon('AAAAAA', { ageMs: 4000 }), 100_000)).toBeNull(); // no arrival stamp
    expect(qmEstimatedAgeMs(beacon('AAAAAA', { receivedAtMs: 1 }), 100_000)).toBeNull(); // pre-S189 beacon
  });

  it('a peerless host yields to an ELDER even when the elder has the LARGER code (the old rule demoted the elder)', () => {
    const elder = beacon('ZZZZZZ', { ageMs: 60_000, receivedAtMs: 100_000 });
    expect(decideQuickmatch(hosting('AAAAAA', { elapsedMs: 5000 }), heardOf(elder))).toEqual({ kind: 'join', code: 'ZZZZZZ' });
    // …and the elder, hearing the youngster's SMALLER code, holds — and records the judgment.
    const young = beacon('AAAAAA', { ageMs: 5000, receivedAtMs: 100_000 });
    expect(decideQuickmatch(hosting('ZZZZZZ', { elapsedMs: 60_000 }), heardOf(young))).toEqual({
      kind: 'wait',
      holds: ['AAAAAA'],
    });
  });

  it('NEGATIVE: a pre-S189 beacon (no age) keeps the CODE rule both ways — a mixed pair still agrees', () => {
    expect(decideQuickmatch(hosting('ZZZZZZ', { elapsedMs: 60_000 }), heardOf(beacon('AAAAAA')))).toEqual({
      kind: 'join',
      code: 'AAAAAA',
    });
    expect(decideQuickmatch(hosting('AAAAAA'), heardOf(beacon('ZZZZZZ'))).kind).toBe('wait');
  });

  it('NEGATIVE: a host WITH peers never demotes, even to a far elder', () => {
    const elder = beacon('ZZZZZZ', { ageMs: 600_000, receivedAtMs: 100_000 });
    expect(decideQuickmatch(hosting('AAAAAA', { hostHasPeers: true }), heardOf(elder))).toEqual({ kind: 'wait' });
  });

  it('⛔ a hold is STICKY: a later beacon that makes the other look older does not flip it into a yield', () => {
    const nowOlder = beacon('ZZZZZZ', { ageMs: 90_000, receivedAtMs: 100_000 });
    const state = hosting('MMMMMM', { elapsedMs: 10_000, holding: new Set(['ZZZZZZ']) });
    expect(decideQuickmatch(state, heardOf(nowOlder))).toEqual({ kind: 'wait' });
  });

  it('a MUTUAL hold is broken by the code: only the LARGER code yields, and only once it sees the hold', () => {
    const mine = new Set(['AAAAAA']);
    const theirHold = beacon('AAAAAA', { ageMs: 10_000, receivedAtMs: 100_000, holds: ['ZZZZZZ'] });
    expect(decideQuickmatch(hosting('ZZZZZZ', { holding: mine }), heardOf(theirHold))).toEqual({
      kind: 'join',
      code: 'AAAAAA',
    });
    // Not yet seen: hold.
    const noHoldYet = beacon('AAAAAA', { ageMs: 10_000, receivedAtMs: 100_000 });
    expect(decideQuickmatch(hosting('ZZZZZZ', { holding: mine }), heardOf(noHoldYet))).toEqual({ kind: 'wait' });
    // The smaller code, seeing the larger's hold on IT, stays.
    const largerHold = beacon('ZZZZZZ', { ageMs: 10_000, receivedAtMs: 100_000, holds: ['AAAAAA'] });
    expect(decideQuickmatch(hosting('AAAAAA', { holding: new Set(['ZZZZZZ']) }), heardOf(largerHold))).toEqual({
      kind: 'wait',
    });
  });

  it('a seeker picks the ELDEST room, a known age beats an unknown one, and a tie goes to the smaller code', () => {
    const seeking: QmDecisionState = { role: 'seeking', myCode: null, hostHasPeers: false, elapsedMs: 100, promoteDelayMs: 2500, nowMs: 100_000 };
    const young = beacon('AAAAAA', { ageMs: 3000, receivedAtMs: 100_000 });
    const old = beacon('ZZZZZZ', { ageMs: 90_000, receivedAtMs: 100_000 });
    const ageless = beacon('222222');
    expect(decideQuickmatch(seeking, heardOf(young, old, ageless))).toEqual({ kind: 'join', code: 'ZZZZZZ' });
    const twinA = beacon('BBBBBB', { ageMs: 5000, receivedAtMs: 100_000 });
    const twinB = beacon('CCCCCC', { ageMs: 5000, receivedAtMs: 100_000 });
    expect(decideQuickmatch(seeking, heardOf(twinB, twinA))).toEqual({ kind: 'join', code: 'BBBBBB' });
    // qmCompareRooms is a total order: antisymmetric on every pair here.
    const all = [young, old, ageless, twinA, twinB];
    for (const a of all) for (const b of all) {
      expect(Math.sign(qmCompareRooms(a, b, 100_000)) + Math.sign(qmCompareRooms(b, a, 100_000))).toBe(0);
      expect(qmCompareRooms(a, b, 100_000) === 0).toBe(a === b);
    }
  });

  it('⭐ PROPERTY: two hosts judging each other at ANY two moments never BOTH yield', () => {
    /*
     * The proof in `decideQuickmatch`, run as numbers: true ages a_X = a_P + D (D constant), each side
     * estimates the other through its own random transit, and each evaluates at its own random time.
     * A direct yield by both would need D > 0 and D < 0 at once.
     */
    let s = 12345;
    const rnd = (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 20_000; i++) {
      const D = Math.floor((rnd() - 0.5) * 4000); // −2 s … +2 s — the band where it could go wrong
      const aP0 = 3000 + Math.floor(rnd() * 20_000);
      const aX0 = aP0 + D;
      const judge = (myCode: string, myAge0: number, theirCode: string, theirAge0: number): boolean => {
        const sendAt = Math.floor(rnd() * 5000);
        const transit = Math.floor(rnd() * 800);
        const evalAt = sendAt + transit + Math.floor(rnd() * 5000);
        const h = beacon(theirCode, { ageMs: theirAge0 + sendAt, receivedAtMs: sendAt + transit });
        return qmOutranksMe(h, myCode, myAge0 + evalAt, evalAt);
      };
      const pYields = judge('PPPPPP', aP0, 'XXXXXX', aX0);
      const xYields = judge('XXXXXX', aX0, 'PPPPPP', aP0);
      expect(pYields && xYields, `D=${D}`).toBe(false);
    }
  });
});

describe('S189 C6 — parseQmBeacon: the two new fields are validated at the boundary', () => {
  const raw = (o: unknown): string => JSON.stringify(o);

  it('accepts an age and a holds list, canonicalising the codes', () => {
    expect(parseQmBeacon(raw({ t: 'host', code: 'A2B3C4', full: false, ageMs: 1234, holds: [' zzzzzz '] }))).toEqual({
      t: 'host',
      code: 'A2B3C4',
      full: false,
      ageMs: 1234,
      holds: ['ZZZZZZ'],
    });
  });

  it('NEGATIVE: a bad age or holds is DROPPED — the beacon (a live room) survives on the code rule', () => {
    for (const ageMs of [-1, 1.5, 'x', null, Number.MAX_SAFE_INTEGER]) {
      const a = parseQmBeacon(raw({ t: 'host', code: 'A2B3C4', ageMs }));
      expect(a, String(ageMs)).not.toBeNull();
      expect(a!.ageMs, String(ageMs)).toBeUndefined();
    }
    expect(parseQmBeacon(raw({ t: 'host', code: 'A2B3C4', holds: 'ZZZZZZ' }))!.holds).toBeUndefined();
    expect(parseQmBeacon(raw({ t: 'host', code: 'A2B3C4', holds: [42, 'bad', 'ZZZZZZ'] }))!.holds).toEqual(['ZZZZZZ']);
    const many = Array.from({ length: QM_MAX_HOLDS + 5 }, () => 'ZZZZZZ');
    expect(parseQmBeacon(raw({ t: 'host', code: 'A2B3C4', holds: many }))!.holds!.length).toBe(QM_MAX_HOLDS);
  });
});
