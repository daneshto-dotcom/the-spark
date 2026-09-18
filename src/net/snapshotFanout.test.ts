/**
 * SPARK — S182 LEVER 1: THE ESCAPE HATCH, driven end-to-end through `NetTransport.send`.
 *
 * ## Why this file mocks `iceConfig` — AND WHY THE MOCK FLIPPED IN S182
 *
 * It used to mock `SNAPSHOT_SINGLE_STRATEGY` **ON**, because the shipped default was OFF pending the
 * owner's ruling. He has now ruled — *"if it halves our bandwidth, then of course we need to do it"*
 * — so ON is the default, and `snapshotRouting.test.ts` covers it unmocked on the real send path.
 *
 * This file therefore now mocks the flag **OFF**, because the escape hatch is the thing that is no
 * longer exercised by default and so the thing that can silently rot. A constant documented as
 * *"flip it back if snapshot delivery ever looks worse in the field than the doubling was"* is worth
 * nothing if flipping it back has quietly stopped working. The way back is a feature, and features
 * need tests.
 *
 * ## Why `send()` gets a harness at all
 *
 * `transport.test.ts` opens by saying the `send()` happy path "requires a live network and is
 * validated via production playtest". That was true while `send()` was an unconditional broadcast
 * loop. It stopped being true the moment that loop grew a routing decision. Fake `StrategyHandle`s
 * are injected into the private map, each recording what it was handed — no Trystero room, no
 * network.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted by vitest above the imports below: `transport.ts` binds SNAPSHOT_SINGLE_STRATEGY at
// import time, so the override has to be in place before it is loaded.
vi.mock('./iceConfig.ts', async (importOriginal) => {
  // `importOriginal()` is typed `unknown`; the cast is what lets the spread compile.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, SNAPSHOT_SINGLE_STRATEGY: false };
});

const { NetTransport } = await import('./transport.ts');
const { SNAPSHOT_SINGLE_STRATEGY } = await import('./iceConfig.ts');

/** What one fake strategy was handed, in order. */
interface Recorder {
  readonly name: string;
  readonly sent: string[];
}

/**
 * Inject fake strategies into a connected transport and return one recorder per strategy.
 * A strategy carries snapshots only if it reaches EVERY peer — see `pickSnapshotStrategy`.
 */
function harness(
  specs: ReadonlyArray<{ name: string; ready?: boolean; peers?: number }>,
): { transport: InstanceType<typeof NetTransport>; recorders: Recorder[] } {
  const transport = new NetTransport();
  const priv = transport as unknown as {
    connected: boolean;
    strategies: Map<string, Record<string, unknown>>;
    peerSet: Set<string>;
  };
  priv.connected = true;
  priv.strategies = new Map();
  // ⭐ THE UNION MATTERS. Routing requires a strategy to carry EVERY peer at the table, so a harness
  // that populated per-strategy peers but left `peerSet` empty would make totalPeers 0 and silently
  // exercise the broadcast arm in every case. Peer ids are SHARED across strategies here
  // (`peer-0`, `peer-1`, …) because that is the real topology: one machine, two signalling paths.
  priv.peerSet = new Set();
  const recorders: Recorder[] = [];
  for (const spec of specs) {
    const ready = spec.ready !== false;
    const sent: string[] = [];
    recorders.push({ name: spec.name, sent });
    const peers = new Set<string>();
    for (let i = 0; i < (spec.peers ?? 1); i++) {
      peers.add(`peer-${i}`);
      priv.peerSet.add(`peer-${i}`);
    }
    priv.strategies.set(spec.name, {
      name: spec.name,
      room: null,
      action: ready ? { send: (data: string) => { sent.push(data); return Promise.resolve(); } } : null,
      state: ready ? 'ready' : 'failed',
      peers,
      relayUrls: [],
      getSockets: null,
      lastError: null,
      icePollTimer: null,
      icePollStartMs: 0,
    });
  }
  return { transport, recorders };
}

/** A minimal NETSNAPSHOT envelope — `send` reads only `kind` and stringifies the rest. */
function snapMsg(seq: number): never {
  return {
    kind: 'NETSNAPSHOT',
    snapshotSeq: seq,
    snapshot: { schemaVersion: 1, tick: 7, primitives: [], bonds: [], freeSparks: [], players: [] },
  } as never;
}

function helloMsg(): never {
  return { kind: 'HELLO', protoVersion: 47 } as never;
}

function byName(recorders: Recorder[], name: string): Recorder {
  const r = recorders.find((x) => x.name === name);
  if (r === undefined) throw new Error(`no recorder ${name}`);
  return r;
}

describe('⛔ S182 LEVER 1 — THE ESCAPE HATCH: flag OFF restores the pre-S182 broadcast', () => {
  beforeEach(() => {
    // Guard the guard: if the module mock ever stops applying, every assertion in this file would
    // silently become a test of the shipped ON path and pass for the wrong reason.
    expect(SNAPSHOT_SINGLE_STRATEGY).toBe(false);
  });

  it('⭐ NETSNAPSHOT goes back to EVERY strategy, exactly as before S182', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    transport.send(snapMsg(1));
    expect(byName(recorders, 'nostr').sent).toHaveLength(1);
    expect(byName(recorders, 'torrent').sent).toHaveLength(1);
  });

  it('the doubling returns in full — 10 snapshots produce 20 sends', () => {
    // This is the cost the owner approved removing. Pinning it here makes the escape hatch a real,
    // measured way back rather than a comment claiming there is one.
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    for (let i = 1; i <= 10; i++) transport.send(snapMsg(i));
    expect(recorders.reduce((n, r) => n + r.sent.length, 0)).toBe(20);
  });

  it('control traffic is unchanged either way', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    transport.send(helloMsg());
    for (const kind of ['INTENT', 'START_GAME_SIGNAL', 'LOBBY_PRESENCE', 'MIGRATION_CLAIM']) {
      transport.send({ kind } as never);
    }
    expect(byName(recorders, 'nostr').sent).toHaveLength(5);
    expect(byName(recorders, 'torrent').sent).toHaveLength(5);
  });

  it('a not-ready strategy is still skipped entirely', () => {
    const { transport, recorders } = harness([
      { name: 'nostr', ready: false, peers: 0 },
      { name: 'torrent', peers: 1 },
    ]);
    transport.send(snapMsg(1));
    transport.send(helloMsg());
    expect(byName(recorders, 'nostr').sent).toHaveLength(0);
    expect(byName(recorders, 'torrent').sent).toHaveLength(2);
  });
});

describe('S182 LEVER 2 — the replacer, observed on the actual send path', () => {
  it('⭐ a NETSNAPSHOT leaves the transport with coordinates rounded to 2 dp', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }]);
    transport.send({
      kind: 'NETSNAPSHOT',
      snapshotSeq: 1,
      snapshot: { schemaVersion: 1, tick: 3, pos: { x: 812.3358154296875, y: 447.00390625 } },
    } as never);
    const wire = byName(recorders, 'nostr').sent[0];
    expect(wire).toContain('812.34');
    expect(wire).toContain('447');
    expect(wire).not.toContain('812.3358154296875');
  });

  it('a non-NETSNAPSHOT is NOT rounded — the replacer is scoped to the high-rate kind', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }]);
    transport.send({ kind: 'INTENT', intentSeq: 1, action: { type: 'X', at: 1.23456789 } } as never);
    expect(byName(recorders, 'nostr').sent[0]).toContain('1.23456789');
  });

  it('the message object handed to send() is not mutated by the replacer', () => {
    const { transport } = harness([{ name: 'nostr' }]);
    const msg = {
      kind: 'NETSNAPSHOT',
      snapshotSeq: 1,
      snapshot: { schemaVersion: 1, tick: 3, pos: { x: 812.3358154296875, y: 1 } },
    };
    transport.send(msg as never);
    expect(msg.snapshot.pos.x).toBe(812.3358154296875);
  });

  it('⭐ a large integer survives the wire EXACTLY — the replacer never touches integers', () => {
    // `v * 100` exceeds 2^53 above ~9.0e13, so the old arithmetic could hand back a DIFFERENT
    // integer than it was given. `tick` and `snapshotSeq` are nowhere near that today, but a counter
    // that is exact on the host and altered on the wire is the quietest possible desync.
    const big = 9_007_199_254_740_991; // Number.MAX_SAFE_INTEGER
    const { transport, recorders } = harness([{ name: 'nostr' }]);
    transport.send({
      kind: 'NETSNAPSHOT',
      snapshotSeq: 1,
      snapshot: { schemaVersion: 1, tick: big },
    } as never);
    expect(byName(recorders, 'nostr').sent[0]).toContain(String(big));
  });
});
