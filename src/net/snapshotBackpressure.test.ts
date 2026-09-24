/**
 * SPARK — S189 (C5, and a C4 candidate): **A SNAPSHOT THE UPLINK CANNOT CARRY MUST BE SKIPPED, NOT QUEUED.**
 *
 * Owner, S189: *"it was lagging at about wave five"* and *"connection was lost at like wave five"*.
 *
 * ⛔ THE MECHANISM. `NetTransport.send` handed every 10 Hz NETSNAPSHOT to Trystero and did not wait:
 * `handle.action.send(serialized).catch(...)`. Trystero (`@trystero-p2p/core` action-wire) cuts each
 * message into 16 KiB chunks and, per chunk, waits for the data channel's `bufferedamountlow` — with a
 * 10 s timeout, after which it ABANDONS the rest of that message. A wave-5 board is ~113 KiB, i.e.
 * ~9.3 Mbit/s of host upload per peer (measured S189, `c5WaveFiveMeasure.test.ts`). On an uplink below
 * that, every tick of excess becomes another concurrent send waiting its turn: the backlog grows
 * without bound, each snapshot arrives later than the last (the LAG), and once a turn around the
 * backlog takes longer than 10 s the waits time out and snapshots are abandoned half-sent — so the
 * client stops receiving whole snapshots at all (starvation, `HOST_STARVATION_MS` = 6 s).
 *
 * ⭐ THE FIX (`NetTransport.send`): at most ONE snapshot in flight per strategy, and the newest one
 * waiting. A snapshot is the whole world, so a superseded one is worthless — skipping it loses nothing
 * the next one does not carry. On a link that keeps up nothing is skipped; on one that cannot, the
 * effective rate falls to what the link carries and the latency stays at one snapshot.
 *
 * ⭐ REAL CODE ON BOTH ENDS OF THE WIRE. The chunking, the backpressure waits, the 10 s abandon and the
 * receiver's reassembly are Trystero's own `createActionWireManager`; the sender is the real
 * `NetTransport`. Only the data channel is modelled: a byte queue that drains at a fixed uplink rate
 * and fires `bufferedamountlow` the way an RTCDataChannel does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Chunk = Uint8Array;
interface WireManager {
  makeInternalAction(type: string): {
    send(data: unknown, targets?: string | string[] | null): Promise<unknown>;
    onMessage(f: (payload: unknown, peerId: string, meta?: unknown) => void): void;
  };
  handleData(id: string, data: ArrayBuffer): void;
}

/** A data channel: bytes queue up and drain at `bytesPerSec`; `bufferedamountlow` fires on the way down. */
class SimChannel {
  readyState: 'open' | 'closed' = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 65535;
  maxBuffered = 0;
  private readonly queue: Chunk[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly bytesPerSec: number,
    private readonly deliver: (c: Chunk) => void,
    private readonly stepMs = 5,
  ) {
    this.timer = setInterval(() => this.drain(), this.stepMs);
  }

  addEventListener(ev: string, f: () => void): void {
    let s = this.listeners.get(ev);
    if (s === undefined) this.listeners.set(ev, (s = new Set()));
    s.add(f);
  }
  removeEventListener(ev: string, f: () => void): void {
    this.listeners.get(ev)?.delete(f);
  }

  send(c: Chunk): void {
    this.queue.push(c);
    this.bufferedAmount += c.byteLength;
    if (this.bufferedAmount > this.maxBuffered) this.maxBuffered = this.bufferedAmount;
  }

  private headSent = 0;

  private drain(): void {
    let budget = (this.bytesPerSec * this.stepMs) / 1000;
    const wasHigh = this.bufferedAmount > this.bufferedAmountLowThreshold;
    while (budget > 0 && this.queue.length > 0) {
      const head = this.queue[0]!;
      const remaining = head.byteLength - this.headSent;
      if (remaining <= budget) {
        budget -= remaining;
        this.headSent = 0;
        this.bufferedAmount -= head.byteLength;
        this.queue.shift();
        this.deliver(head);
      } else {
        this.headSent += budget;
        budget = 0;
      }
    }
    if (wasHigh && this.bufferedAmount <= this.bufferedAmountLowThreshold) {
      for (const f of [...(this.listeners.get('bufferedamountlow') ?? [])]) f();
    }
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

/**
 * The simulated link, shared by the mocked `@trystero-p2p/nostr` below and the tests. `link.open()`
 * builds the host room on the REAL action-wire manager and a receiving manager for the client.
 */
const link = vi.hoisted(() => ({
  bytesPerSec: 0,
  /** ⭐ S189 fix round — per-peer uplink rates (bytes/s; 0 = a channel that never drains). Default: one 'client'. */
  peerRates: null as Record<string, number> | null,
  propagationMs: 30,
  received: [] as Array<{ kind: string; seq: number | null; atMs: number; peer: string }>,
  channel: null as unknown,
  room: null as unknown,
  stop: [] as Array<() => void>,
}));

vi.mock('@trystero-p2p/nostr', async () => {
  // Trystero's internal module: not in the package's `exports`, and it ships no .d.ts — typed below.
  // @ts-expect-error TS7016 — no declaration file for this path
  const aw = (await import('../../node_modules/@trystero-p2p/core/dist/action-wire.mjs')) as unknown as {
    createActionWireManager(o: {
      getPeer(id: string): unknown;
      getPeerIds(): string[];
      canReceiveFromPeer(): boolean;
      throwIfAborted(): void;
    }): WireManager;
  };
  return {
    selfId: 'host-self',
    getRelaySockets: () => ({}),
    joinRoom: () => {
      const rates = link.peerRates ?? { client: link.bytesPerSec };
      const peers = new Map<string, { channel: SimChannel; sendData(c: Chunk): void }>();
      for (const [peerId, rate] of Object.entries(rates)) {
        // Each CLIENT end: Trystero's own reassembly, recording every COMPLETE message it hands up.
        const clientWire = aw.createActionWireManager({
          getPeer: () => undefined,
          getPeerIds: () => [],
          canReceiveFromPeer: () => true,
          throwIfAborted: () => undefined,
        });
        clientWire.makeInternalAction('msg').onMessage((payload) => {
          const m = JSON.parse(payload as string) as { kind: string; snapshotSeq?: number };
          link.received.push({ kind: m.kind, seq: m.snapshotSeq ?? null, atMs: Date.now(), peer: peerId });
        });
        const channel = new SimChannel(rate, (c) => {
          setTimeout(() => clientWire.handleData('host-self', c.slice().buffer as ArrayBuffer), link.propagationMs);
        });
        if (link.channel === null) link.channel = channel;
        link.stop.push(() => channel.stop());
        peers.set(peerId, { channel, sendData: (c: Chunk) => channel.send(c) });
      }
      const hostWire = aw.createActionWireManager({
        getPeer: (id) => peers.get(id),
        getPeerIds: () => [...peers.keys()],
        canReceiveFromPeer: () => true,
        throwIfAborted: () => undefined,
      });
      const room = {
        onPeerJoin: null as ((id: string) => void) | null,
        onPeerLeave: null as ((id: string) => void) | null,
        getPeers: () => ({}),
        leave: () => Promise.resolve(),
        makeAction: (type: string) => {
          const a = hostWire.makeInternalAction(type);
          return {
            send: (data: string, opts?: { target?: string }) => a.send(data, opts?.target ?? null),
            set onMessage(_f: unknown) {
              /* the host's inbound path is not under test */
            },
          };
        },
      };
      link.room = room;
      return room;
    },
  };
});

// The torrent strategy is a second, independent path; here it simply fails to start.
vi.mock('@trystero-p2p/torrent', () => ({
  getRelaySockets: () => ({}),
  joinRoom: () => {
    throw new Error('torrent disabled in this test');
  },
}));

import { NetTransport } from './transport.ts';
import { HOST_STARVATION_MS } from './succession.ts';
import { NET_SNAPSHOT_HZ } from '../constants.ts';
import type { NetMessage } from './protocol.ts';

/** A NETSNAPSHOT envelope of roughly `kib` KiB on the wire — the transport only serializes it. */
function snapshotOf(seq: number, kib: number): NetMessage {
  const prim = { id: 0, type: 1, pos: { x: 123.45, y: 678.9 }, hp: 70, bonds: [1, 2], placedBy: 1, pad: 'x'.repeat(140) };
  const n = Math.ceil((kib * 1024) / JSON.stringify(prim).length);
  const primitives = Array.from({ length: n }, (_, i) => ({ ...prim, id: i }));
  return { kind: 'NETSNAPSHOT', snapshotSeq: seq, snapshot: { primitives } } as unknown as NetMessage;
}

interface Run {
  sentAt: Map<number, number>;
  delivered: Array<{ seq: number; latencyMs: number; atMs: number }>;
  maxGapMs: number;
  maxBuffered: number;
  sends: number;
}

/** The host's 10 Hz snapshot loop, for `seconds`, over a link of `mbit` Mbit/s, through a real NetTransport. */
async function runLink(opts: {
  mbit: number;
  kib: number;
  seconds: number;
  raw?: boolean;
  /** ⭐ S189 fix round — several peers at their own rates (Mbit/s); `delivered` is then for `measure`. */
  peersMbit?: Record<string, number>;
  measure?: string;
}): Promise<Run> {
  vi.useFakeTimers();
  link.bytesPerSec = (opts.mbit * 1e6) / 8;
  link.peerRates =
    opts.peersMbit === undefined
      ? null
      : Object.fromEntries(Object.entries(opts.peersMbit).map(([k, v]) => [k, (v * 1e6) / 8]));
  link.channel = null;
  link.received.length = 0;
  const t = new NetTransport();
  t.connect('ROOMAA');
  // Let the (mocked, rejecting) torrent chunk load settle, then the client(s) arrive.
  await vi.advanceTimersByTimeAsync(10);
  for (const id of Object.keys(opts.peersMbit ?? { client: 0 })) {
    (link.room as { onPeerJoin: (id: string) => void }).onPeerJoin(id);
  }
  const sentAt = new Map<number, number>();
  const intervalMs = 1000 / NET_SNAPSHOT_HZ;
  const t0 = Date.now();
  let seq = 0;
  while (Date.now() - t0 < opts.seconds * 1000) {
    seq++;
    sentAt.set(seq, Date.now());
    if (opts.raw === true) {
      // The PRE-S189 send, exactly: serialize, hand to Trystero, do not wait.
      const action = (link.room as { makeAction(t: string): { send(d: string): Promise<unknown> } }).makeAction('msg');
      void action.send(JSON.stringify(snapshotOf(seq, opts.kib))).catch(() => undefined);
    } else {
      t.send(snapshotOf(seq, opts.kib));
    }
    await vi.advanceTimersByTimeAsync(intervalMs);
  }
  // Drain: stop sending, give the link time to finish what is in flight.
  await vi.advanceTimersByTimeAsync(2000);
  const measured = opts.measure ?? 'client';
  const delivered = link.received
    .filter((r) => r.kind === 'NETSNAPSHOT' && r.seq !== null && r.peer === measured)
    .map((r) => ({ seq: r.seq!, atMs: r.atMs, latencyMs: r.atMs - sentAt.get(r.seq!)! }));
  let maxGapMs = 0;
  let prev = t0;
  for (const d of delivered) {
    maxGapMs = Math.max(maxGapMs, d.atMs - prev);
    prev = d.atMs;
  }
  // ⚠ And the TRAILING gap — silence after the last whole snapshot, up to the end of the sending
  // window. The first cut omitted it and read a link that went completely dark after 22 s as an 8.8 s gap.
  maxGapMs = Math.max(maxGapMs, t0 + opts.seconds * 1000 - prev);
  const maxBuffered = (link.channel as SimChannel).maxBuffered;
  t.disconnect();
  for (const s of link.stop.splice(0)) s();
  return { sentAt, delivered, maxGapMs, maxBuffered, sends: seq };
}

afterEach(() => {
  vi.useRealTimers();
});

const REPRO_MBIT = 5;

describe('S189 C5 — the host snapshot stream over a link that cannot carry it', () => {
  it('⛔ REPRODUCTION: fire-and-forget into Trystero over 5 Mbit/s — the backlog grows, then whole snapshots stop arriving', async () => {
    /*
     * The mechanism, pinned against Trystero's REAL action-wire so a library upgrade that changes it
     * turns this red. This is how `NetTransport.send` behaved before S189: one un-awaited send per
     * 100 ms. Demand ~9.3 Mbit/s against 5: the latency climbs every second, and when a turn around
     * the backlog exceeds Trystero's 10 s backpressure wait, snapshots are abandoned half-sent.
     */
    const r = await runLink({ mbit: REPRO_MBIT, kib: 113, seconds: 90, raw: true });
    const byWindow = (from: number, to: number) =>
      r.delivered.filter((d) => d.seq >= from * 10 && d.seq < to * 10).map((d) => d.latencyMs);
    const early = byWindow(0, 10);
    const late = r.delivered.map((d) => d.latencyMs);
    console.log(
      `[S189 C5 repro] fire-and-forget @${REPRO_MBIT} Mbit/s: sent ${r.sends}, WHOLE snapshots delivered ${r.delivered.length}, ` +
        `first-10s worst latency ${Math.max(0, ...early)} ms, overall worst ${Math.max(0, ...late)} ms, ` +
        `max gap between whole snapshots ${r.maxGapMs} ms, max bufferedAmount ${(r.maxBuffered / 1024).toFixed(0)} KiB`,
    );
    // The lag: latency is many seconds, not one snapshot's transmit time.
    expect(Math.max(...late)).toBeGreaterThan(10_000);
    // The starvation: somewhere the client goes a whole starvation window without a complete snapshot.
    expect(r.maxGapMs).toBeGreaterThanOrEqual(HOST_STARVATION_MS);
  }, 120_000);

  it('⭐ REACH: a 113 KiB snapshot at 10 Hz over a 5 Mbit/s uplink — latency stays bounded, the client is never starved', async () => {
    const r = await runLink({ mbit: 5, kib: 113, seconds: 60 });
    const last = r.delivered.slice(-10);
    const worst = Math.max(...r.delivered.map((d) => d.latencyMs));
    console.log(
      `[S189 C5] 5 Mbit/s: sent ${r.sends}, delivered ${r.delivered.length}, worst latency ${worst} ms, ` +
        `last-10 latency ${last.map((d) => d.latencyMs).join('/')} ms, max gap ${r.maxGapMs} ms, ` +
        `max bufferedAmount ${(r.maxBuffered / 1024).toFixed(0)} KiB`,
    );
    // The link carries ~5.4 snapshots/s of this size; the rest must be SKIPPED, not queued.
    expect(r.delivered.length).toBeGreaterThan(r.sends * 0.4);
    // Latency is about one snapshot's transmit time (~185 ms here), never a growing backlog.
    expect(worst, 'snapshot latency grew — the sends are queueing behind each other').toBeLessThan(1000);
    // …so the client never goes a starvation window without a whole snapshot.
    expect(r.maxGapMs).toBeLessThan(HOST_STARVATION_MS / 4);
    // Delivered in order: a skipped snapshot is skipped, never re-sent late.
    const seqs = r.delivered.map((d) => d.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    // The channel's own buffer stays at ~one snapshot, not tens of MiB.
    expect(r.maxBuffered).toBeLessThan(512 * 1024);
  }, 60_000);

  it('⛔ PER PEER: one STALLED peer (a dying channel) does not hold back the healthy peer — it still gets ~10 Hz', async () => {
    /*
     * S189 fix round (audit NET-2). The first cut gated per STRATEGY, and Trystero's `action.send`
     * resolves only when EVERY target has drained — so in a 3-4 seat match the slowest (or a dying,
     * still-'open') channel set the snapshot rate for everyone. Gated per peer, each sends on its own.
     */
    const r = await runLink({ mbit: 0, kib: 60, seconds: 10, peersMbit: { fast: 20, stalled: 0 }, measure: 'fast' });
    console.log(`[S189 NET-2] fast peer: ${r.delivered.length} of ${r.sends} snapshots with a stalled sibling`);
    expect(r.delivered.length, 'the healthy peer must not inherit the stalled peer\'s rate').toBeGreaterThan(r.sends * 0.85);
    expect(r.maxGapMs).toBeLessThan(500);
  }, 60_000);

  it('NEGATIVE: a link that KEEPS UP (20 Mbit/s) skips nothing — every snapshot arrives', async () => {
    const r = await runLink({ mbit: 20, kib: 113, seconds: 10 });
    expect(r.delivered.map((d) => d.seq)).toEqual(Array.from({ length: r.sends }, (_, i) => i + 1));
    expect(Math.max(...r.delivered.map((d) => d.latencyMs))).toBeLessThan(200);
  }, 60_000);
});

/** A transport with one injected, controllable strategy — each send() returns a promise WE settle. */
function gated(): { t: NetTransport; sent: string[]; settle: () => void } {
  const t = new NetTransport();
  const priv = t as unknown as {
    connected: boolean;
    strategies: Map<string, Record<string, unknown>>;
    peerSet: Set<string>;
  };
  priv.connected = true;
  priv.peerSet = new Set(['peer-0']);
  priv.strategies = new Map();
  const sent: string[] = [];
  const resolvers: Array<() => void> = [];
  priv.strategies.set('nostr', {
    name: 'nostr',
    room: null,
    action: {
      send: (d: string) => {
        sent.push(d);
        return new Promise<void>((r) => resolvers.push(r));
      },
    },
    state: 'ready',
    peers: new Set(['peer-0']),
    relayUrls: [],
    getSockets: null,
    lastError: null,
    icePollTimer: null,
    icePollStartMs: 0,
  });
  return { t, sent, settle: () => resolvers.shift()?.() };
}
const snap = (seq: number): NetMessage =>
  ({ kind: 'NETSNAPSHOT', snapshotSeq: seq, snapshot: { tick: seq } }) as unknown as NetMessage;
const seqOf = (s: string): number => (JSON.parse(s) as { snapshotSeq: number }).snapshotSeq;

describe('S189 C5 — the gate itself', () => {
  it('LATEST WINS: behind an in-flight snapshot only the NEWEST waits; the rest are counted as skipped', async () => {
    const { t, sent, settle } = gated();
    t.send(snap(1));
    t.send(snap(2));
    t.send(snap(3));
    t.send(snap(4));
    expect(sent.map(seqOf)).toEqual([1]); // 2..4 wait behind 1
    expect(t.snapshotsSkipped()).toEqual({ nostr: 2 }); // 2 and 3 were superseded
    settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.map(seqOf)).toEqual([1, 4]); // the NEWEST, never a stale one
  });

  it('⛔ NEGATIVE: control traffic is NEVER gated — a HELLO behind an in-flight snapshot goes at once', () => {
    const { t, sent } = gated();
    t.send(snap(1));
    t.send({ kind: 'HELLO', protoVersion: 1 } as unknown as NetMessage);
    t.send({ kind: 'MIGRATION_CLAIM' } as unknown as NetMessage);
    expect(sent.map((s) => (JSON.parse(s) as { kind: string }).kind)).toEqual(['NETSNAPSHOT', 'HELLO', 'MIGRATION_CLAIM']);
  });

  it('a waiting snapshot never goes to a room we have LEFT', async () => {
    const { t, sent, settle } = gated();
    t.send(snap(1));
    t.send(snap(2)); // waiting
    t.disconnect();
    settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.map(seqOf)).toEqual([1]);
  });

  it('a send that REJECTS still releases the gate', async () => {
    const t = new NetTransport();
    const priv = t as unknown as { connected: boolean; strategies: Map<string, Record<string, unknown>>; peerSet: Set<string> };
    priv.connected = true;
    priv.peerSet = new Set(['peer-0']);
    const sent: number[] = [];
    priv.strategies = new Map([['nostr', {
      name: 'nostr', room: null, state: 'ready', peers: new Set(['peer-0']), relayUrls: [], getSockets: null,
      lastError: null, icePollTimer: null, icePollStartMs: 0,
      action: { send: (d: string) => { sent.push(seqOf(d)); return Promise.reject(new Error('channel closed')); } },
    }]]);
    t.send(snap(1));
    t.send(snap(2));
    await new Promise((r) => setTimeout(r, 0));
    t.send(snap(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([1, 2, 3]);
  });
});
