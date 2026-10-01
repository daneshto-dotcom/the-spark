/**
 * SPARK — S189 (C4): **A RECONNECT MUST NOT JOIN THE ROOM IT IS STILL LEAVING.**
 *
 * Trystero's `joinRoom` hands back the room already registered under that id (`strategy.mjs`:
 * `if (occupiedRooms[appId]?.[roomId]) return occupiedRooms[appId][roomId]`), and a room stays
 * registered until its async `leave()` completes — `await leaveAction.send("")`, a 99 ms sleep, then
 * `onSelfLeave` (`delete occupiedRooms[appId][roomId]`, unconditionally). The reconnect loop and the
 * migration rejoin both run `disconnect()` then `connect()` on the SAME code in one frame, so the new
 * transport bound itself to the dying room and never saw a peer again.
 *
 * The mock below is those two behaviours and nothing else, so the REAL `NetTransport.connect` /
 * `disconnect` are what is under test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeRoom {
  id: number;
  dead: boolean;
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  getPeers(): Record<string, unknown>;
  makeAction(): { send(): Promise<void>; onMessage: unknown };
  leave(): Promise<void>;
  /** The host answers this room's announce. A room that has left delivers nothing. */
  arrive(peerId: string): void;
}

const reg = vi.hoisted(() => ({
  occupied: new Map<string, unknown>(),
  joins: [] as string[],
  rooms: [] as unknown[],
  leaveHangs: false,
  n: 0,
  leaveCalls: new Map<number, number>(),
}));

vi.mock('@trystero-p2p/nostr', () => {
  const makeRoom = (roomId: string): FakeRoom => {
    const room: FakeRoom = {
      id: ++reg.n,
      dead: false,
      onPeerJoin: null,
      onPeerLeave: null,
      getPeers: () => ({}),
      makeAction: () => ({ send: () => Promise.resolve(), onMessage: null }),
      leave: async () => {
        reg.leaveCalls.set(room.id, (reg.leaveCalls.get(room.id) ?? 0) + 1);
        if (reg.leaveHangs) await new Promise(() => undefined); // a leave stuck behind a congested channel
        await Promise.resolve(); // leaveAction.send("")
        await new Promise((r) => setTimeout(r, 99)); // room.mjs: the 99 ms sleep
        room.dead = true;
        reg.occupied.delete(roomId); // onSelfLeave — unconditional, as in strategy.mjs
      },
      arrive: (peerId) => {
        if (!room.dead) room.onPeerJoin?.(peerId);
      },
    };
    return room;
  };
  return {
    selfId: 'joiner-self',
    getRelaySockets: () => ({}),
    joinRoom: (_cfg: unknown, roomId: string) => {
      const existing = reg.occupied.get(roomId) as FakeRoom | undefined;
      if (existing !== undefined) {
        reg.joins.push(`reuse#${existing.id}`);
        return existing;
      }
      const room = makeRoom(roomId);
      reg.occupied.set(roomId, room);
      reg.rooms.push(room);
      reg.joins.push(`new#${room.id}`);
      return room;
    },
  };
});
vi.mock('@trystero-p2p/torrent', () => ({
  getRelaySockets: () => ({}),
  joinRoom: () => {
    throw new Error('torrent disabled in this test');
  },
}));

import { NetTransport, PENDING_LEAVE_CAP_MS } from './transport.ts';

const lastRoom = (): FakeRoom => reg.rooms[reg.rooms.length - 1] as FakeRoom;

afterEach(() => {
  vi.useRealTimers();
  reg.occupied.clear();
  reg.joins.length = 0;
  reg.rooms.length = 0;
  reg.leaveHangs = false;
  reg.n = 0;
  reg.leaveCalls.clear();
});

describe('S189 C4 — disconnect() then connect() on the same code', () => {
  it('⭐ REACH: the rejoin gets a FRESH room once the old one has left, and sees the host', async () => {
    vi.useFakeTimers();
    const first = new NetTransport();
    first.connect('ROOMAA');
    lastRoom().arrive('host');
    expect(first.peerCount()).toBe(1);

    // The reconnect loop's exact sequence: tear down, then a NEW transport on the same code, one frame.
    first.disconnect();
    const second = new NetTransport();
    second.connect('ROOMAA');
    await vi.advanceTimersByTimeAsync(500);

    expect(reg.joins).toEqual(['new#1', 'new#2']); // never `reuse#1`
    lastRoom().arrive('host');
    expect(second.peerCount(), 'the rejoined transport must see the host').toBe(1);
    second.disconnect();
  });

  it('⛔ NEGATIVE — with no wait, the same sequence binds the dying room and never sees a peer again', async () => {
    // This is what the pre-S189 code did, reproduced directly against the modelled registry: a join
    // issued while the leave is in flight gets the SAME room object back.
    vi.useFakeTimers();
    const first = new NetTransport();
    first.connect('ROOMBB');
    const dying = lastRoom();
    first.disconnect();
    const { joinRoom } = await import('@trystero-p2p/nostr');
    const got = (joinRoom as unknown as (c: unknown, id: string) => FakeRoom)({}, 'ROOMBB');
    expect(got).toBe(dying);
    await vi.advanceTimersByTimeAsync(500);
    expect(got.dead).toBe(true); // …and once the leave lands, it delivers nothing, forever
  });

  it('a disconnect() during the wait cancels the deferred join entirely', async () => {
    vi.useFakeTimers();
    const first = new NetTransport();
    first.connect('ROOMCC');
    first.disconnect();
    const second = new NetTransport();
    second.connect('ROOMCC');
    second.disconnect(); // e.g. Return to Title inside those ~100 ms
    await vi.advanceTimersByTimeAsync(500);
    expect(reg.joins).toEqual(['new#1']);
  });

  it('a leave that never settles holds the rejoin only for PENDING_LEAVE_CAP_MS', async () => {
    vi.useFakeTimers();
    const first = new NetTransport();
    first.connect('ROOMDD');
    reg.leaveHangs = true;
    first.disconnect();
    reg.occupied.clear(); // the stuck room is not what this test is about: only the cap is
    const second = new NetTransport();
    second.connect('ROOMDD');
    await vi.advanceTimersByTimeAsync(PENDING_LEAVE_CAP_MS - 50);
    expect(reg.joins).toEqual(['new#1']);
    await vi.advanceTimersByTimeAsync(100);
    expect(reg.joins).toEqual(['new#1', 'new#2']);
    second.disconnect();
  });

  it('⛔ a room that is STILL LEAVING past the cap is never adopted — and never left twice', async () => {
    // A second leave() re-runs Trystero's onSelfLeave, which deletes the registry entry and the Nostr
    // topics keyed by ROOM ID — i.e. a newer room's (hunt finding A2). And adopting a leaving room
    // binds the transport to something about to go deaf.
    vi.useFakeTimers();
    const first = new NetTransport();
    first.connect('ROOMGG');
    const stuck = lastRoom();
    reg.leaveHangs = true;
    first.disconnect();
    first.disconnect(); // idempotent: no second leave
    const second = new NetTransport();
    second.connect('ROOMGG');
    await vi.advanceTimersByTimeAsync(PENDING_LEAVE_CAP_MS + 100);
    expect(reg.joins).toEqual(['new#1', 'reuse#1']); // Trystero handed the leaving room back…
    stuck.arrive('host');
    expect(second.peerCount(), '…and the transport refused to adopt it').toBe(0);
    second.disconnect();
    expect(reg.leaveCalls.get(stuck.id)).toBe(1);
  });

  it('NEGATIVE — a connect to a DIFFERENT code does not wait at all', () => {
    const first = new NetTransport();
    first.connect('ROOMEE');
    first.disconnect();
    const other = new NetTransport();
    other.connect('ROOMFF');
    expect(reg.joins).toEqual(['new#1', 'new#2']); // synchronous, as before S189
    other.disconnect();
  });
});
