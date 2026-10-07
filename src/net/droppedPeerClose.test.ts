/**
 * SPARK — S196 (net-blip): **A PEER TRYSTERO DROPPED FOR A DEAD NETWORK MUST NOT KEEP ITS CONNECTION.**
 *
 * Reproduced on the desktop with a SILENT drop (`scripts/live-mp/live-silent-blip.mjs`: the joiner's ICE forced
 * through a UDP relay that goes dark — nothing closed, no SCTP abort). Trystero 0.25.2 closes a peer that sits ICE
 * `disconnected` for 5 s, but only DETACHES it (`shared-peer.mjs` `clear(destroyPeer: false)`, `room.mjs`
 * `exitPeer` → proxy destroy); the RTCPeerConnection lives on. When the outage ends between the two sides' timers,
 * one side drops the peer and the other does not — and the dropped side's ORPHAN connection reconnects ICE and
 * keeps the far side's channel `open`, so the far side reads its peer as `live` forever and ignores every
 * announce/offer of the rejoin (relay trace: 24 offers delivered, zero answers). Measured: a permanent split.
 *
 * The fix: when `onPeerLeave` fires for a peer whose connection reads DEAD, the transport closes it
 * (`shouldCloseDroppedPeerConnection`, `NetTransport.closeDroppedPeerConnection`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakePc {
  connectionState = 'connected';
  iceConnectionState = 'connected';
  closeCalls = 0;
  private readonly listeners = new Map<string, Array<() => void>>();
  addEventListener(ev: string, f: () => void): void {
    this.listeners.set(ev, [...(this.listeners.get(ev) ?? []), f]);
  }
  set(conn: string, ice: string): void {
    this.connectionState = conn;
    this.iceConnectionState = ice;
    for (const f of this.listeners.get('connectionstatechange') ?? []) f();
    for (const f of this.listeners.get('iceconnectionstatechange') ?? []) f();
  }
  /** Like the real one: no state-change event fires, the state just reads `closed`. */
  close(): void {
    this.closeCalls++;
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
  }
}

const sim = vi.hoisted(() => ({
  pcs: new Map<string, unknown>(),
  room: null as unknown,
}));

vi.mock('@trystero-p2p/nostr', () => ({
  selfId: 'me',
  getRelaySockets: () => ({}),
  joinRoom: () => {
    const room = {
      onPeerJoin: null as ((id: string) => void) | null,
      onPeerLeave: null as ((id: string) => void) | null,
      // Like Trystero's room: only ACTIVE peers — a dropped peer is gone from here before onPeerLeave fires.
      getPeers: () => Object.fromEntries(sim.pcs),
      makeAction: () => ({ send: () => Promise.resolve(), onMessage: null }),
      leave: () => Promise.resolve(),
    };
    sim.room = room;
    return room;
  },
}));
vi.mock('@trystero-p2p/torrent', () => ({
  getRelaySockets: () => ({}),
  joinRoom: () => {
    throw new Error('torrent disabled in this test');
  },
}));

import { NetTransport, shouldCloseDroppedPeerConnection } from './transport.ts';

type Room = { onPeerJoin: (id: string) => void; onPeerLeave: (id: string) => void };

function joined(peerId: string): { t: NetTransport; pc: FakePc; room: Room } {
  const pc = new FakePc();
  sim.pcs.set(peerId, pc);
  const t = new NetTransport();
  t.connect('ROOMDP');
  const room = sim.room as Room;
  room.onPeerJoin(peerId);
  return { t, pc, room };
}

/** What Trystero does when its 5 s disconnected timer fires: the peer leaves getPeers(), then onPeerLeave. */
function trysteroDropsIt(room: Room, peerId: string): void {
  sim.pcs.delete(peerId);
  room.onPeerLeave(peerId);
}

afterEach(() => {
  vi.restoreAllMocks();
  sim.pcs.clear();
});

describe('S196 — shouldCloseDroppedPeerConnection (the decision)', () => {
  it('a dead connection (disconnected / failed on either state) is closed', () => {
    expect(shouldCloseDroppedPeerConnection('disconnected', 'disconnected')).toBe(true);
    expect(shouldCloseDroppedPeerConnection('connected', 'disconnected')).toBe(true);
    expect(shouldCloseDroppedPeerConnection('failed', 'disconnected')).toBe(true);
    expect(shouldCloseDroppedPeerConnection('connected', 'failed')).toBe(true);
  });
  it('NEGATIVE — a HEALTHY connection is kept (a peer that LEFT: the clean-rejoin fast path re-binds it)', () => {
    expect(shouldCloseDroppedPeerConnection('connected', 'connected')).toBe(false);
    expect(shouldCloseDroppedPeerConnection('connected', 'completed')).toBe(false);
  });
  it('NEGATIVE — already closed, or never observed: nothing to do, nothing guessed', () => {
    expect(shouldCloseDroppedPeerConnection('closed', 'closed')).toBe(false);
    expect(shouldCloseDroppedPeerConnection(null, null)).toBe(false);
    expect(shouldCloseDroppedPeerConnection('connecting', 'checking')).toBe(false);
  });
});

describe('S196 — REACH through the transport: Trystero drops a dead peer → its connection is closed', () => {
  it('⭐ the silent-drop shape: ICE disconnected, Trystero\'s 5 s close fires → pc.close() exactly once', () => {
    const warn = vi.spyOn(console, 'warn');
    const { t, pc, room } = joined('brother');
    pc.set('disconnected', 'disconnected');
    trysteroDropsIt(room, 'brother');
    expect(pc.closeCalls).toBe(1);
    expect(t.peerCount()).toBe(0); // the drop itself is unchanged
    const line = warn.mock.calls.map((c) => c.map(String).join(' ')).find((l) => l.includes("closing dropped peer's connection"));
    expect(line).toContain('peer=brother');
    expect(line).toContain('conn=disconnected');
    t.disconnect();
  });

  it('it reads the state at the moment of the drop, not a stale record (failed → closed)', () => {
    const { t, pc, room } = joined('brother');
    pc.connectionState = 'failed'; // no event fired — the live read must still see it
    trysteroDropsIt(room, 'brother');
    expect(pc.closeCalls).toBe(1);
    t.disconnect();
  });

  it('only the dropped peer\'s connection — a second, healthy peer is untouched', () => {
    const { t, pc, room } = joined('brother');
    const other = new FakePc();
    sim.pcs.set('cousin', other);
    room.onPeerJoin('cousin');
    pc.set('disconnected', 'disconnected');
    trysteroDropsIt(room, 'brother');
    expect(pc.closeCalls).toBe(1);
    expect(other.closeCalls).toBe(0);
    expect(t.peerCount()).toBe(1);
    t.disconnect();
  });
});

describe('S196 — NEGATIVE: a live connection is never torn down', () => {
  it('a peer that LEFT with a healthy connection keeps it (the shared pc the clean rejoin re-binds in ~0.2 s)', () => {
    const { t, pc, room } = joined('brother');
    trysteroDropsIt(room, 'brother');
    expect(pc.closeCalls).toBe(0);
    t.disconnect();
  });

  it('a genuinely connected peer that RE-ANNOUNCES (a duplicate join, here or on another strategy) is not touched', () => {
    const { t, pc, room } = joined('brother');
    room.onPeerJoin('brother');
    room.onPeerJoin('brother');
    expect(pc.closeCalls).toBe(0);
    expect(t.peerCount()).toBe(1);
    t.disconnect();
  });

  it('a peer whose connection was REPLACED by a fresh one: a leave reads the NEW (healthy) one and closes nothing', () => {
    const { t, pc: old, room } = joined('brother');
    old.set('disconnected', 'disconnected');
    const fresh = new FakePc();
    sim.pcs.set('brother', fresh);
    room.onPeerJoin('brother'); // Trystero re-activated it on a new connection
    trysteroDropsIt(room, 'brother');
    expect(fresh.closeCalls).toBe(0);
    t.disconnect();
  });

  it('our OWN disconnect() (the reconnect loop) never closes a connection — Trystero keeps it for the rejoin', () => {
    const { t, pc } = joined('brother');
    pc.set('disconnected', 'disconnected');
    t.disconnect();
    expect(pc.closeCalls).toBe(0);
  });

  it('an already-closed connection is not closed again; a close that throws is swallowed', () => {
    const { t, pc, room } = joined('brother');
    pc.close();
    trysteroDropsIt(room, 'brother');
    expect(pc.closeCalls).toBe(1);
    const { t: t2, pc: pc2, room: room2 } = joined('cousin');
    pc2.set('failed', 'failed');
    pc2.close = () => {
      throw new Error('boom');
    };
    expect(() => trysteroDropsIt(room2, 'cousin')).not.toThrow();
    t.disconnect();
    t2.disconnect();
  });
});
