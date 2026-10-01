/**
 * SPARK — S189 (C4, hunt finding E3): **THE CONSOLE MUST SAY WHY A PEER DROPPED.**
 *
 * Trystero knows whether a peer LEFT (a leave message: tab close, BACK TO MAIN, double-Escape) or its
 * NETWORK DIED (ICE disconnected ≥ 5 s, failed, closed), but hands `onPeerLeave` only the id, and
 * SPARK logged only `[net] <strategy> onPeerLeave: <id>` — the same line for both. The owner's
 * `?debug=1` console after "connection was lost at like wave five" could not say which happened.
 *
 * Now every drop logs ONE searchable line:
 *   `[net] PEER DROPPED strategy=… peer=… cause=network-died|peer-left|unknown conn=… ice=…
 *    lastRxAgoMs=… visibility=…`
 * — the cause read from the peer connection's LAST observed state (watched from the moment it joined),
 * plus how long since that peer last sent anything.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakePc {
  connectionState = 'connected';
  iceConnectionState = 'connected';
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

import { NetTransport, classifyPeerDrop } from './transport.ts';

type Room = { onPeerJoin: (id: string) => void; onPeerLeave: (id: string) => void };

/** Connect a real transport, let `peerId` join with a watched peer connection. */
function joined(peerId: string): { t: NetTransport; pc: FakePc; room: Room } {
  const pc = new FakePc();
  sim.pcs.set(peerId, pc);
  const t = new NetTransport();
  t.connect('ROOMLG');
  const room = sim.room as Room;
  room.onPeerJoin(peerId);
  return { t, pc, room };
}

function dropLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => l.includes('[net] PEER DROPPED'));
}

afterEach(() => {
  vi.restoreAllMocks();
  sim.pcs.clear();
});

describe('S189 E3 — a dropped peer says WHY', () => {
  it('⭐ REACH: the network died (ICE disconnected, then closed) → cause=network-died', () => {
    const warn = vi.spyOn(console, 'warn');
    const { t, pc, room } = joined('brother');
    pc.set('disconnected', 'disconnected');
    room.onPeerLeave('brother');
    const lines = dropLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('strategy=nostr');
    expect(lines[0]).toContain('peer=brother');
    expect(lines[0]).toContain('cause=network-died');
    expect(lines[0]).toContain('conn=disconnected');
    expect(lines[0]).toContain('ice=disconnected');
    t.disconnect();
  });

  it('⭐ REACH: the peer LEFT (its connection still healthy when it went) → cause=peer-left', () => {
    const warn = vi.spyOn(console, 'warn');
    const { t, room } = joined('brother');
    room.onPeerLeave('brother');
    const lines = dropLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('cause=peer-left');
    t.disconnect();
  });

  it('it reports how long since that peer last sent anything', () => {
    const warn = vi.spyOn(console, 'warn');
    const { t, room } = joined('brother');
    t.handleRawMessage(JSON.stringify({ kind: 'HELLO' }), 'brother');
    room.onPeerLeave('brother');
    expect(dropLines(warn)[0]).toMatch(/lastRxAgoMs=\d+/);
    t.disconnect();
  });

  it('NEGATIVE — a peer we never saw a connection for is `unknown`, not guessed', () => {
    expect(classifyPeerDrop(null, null)).toBe('unknown');
    expect(classifyPeerDrop('connecting', 'checking')).toBe('unknown');
  });

  it('the classifier: any of disconnected / failed / closed on either state is the network', () => {
    for (const bad of ['disconnected', 'failed', 'closed']) {
      expect(classifyPeerDrop(bad, 'connected')).toBe('network-died');
      expect(classifyPeerDrop('connected', bad)).toBe('network-died');
    }
    expect(classifyPeerDrop('connected', 'completed')).toBe('peer-left');
  });
});
