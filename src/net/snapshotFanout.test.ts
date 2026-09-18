/**
 * SPARK — S182 LEVER 1: the SEND FAN-OUT, driven end-to-end through `NetTransport.send`.
 *
 * ⛔ THIS IS THE TEST THE BRANCH BRIEF NAMED, AND THE FIRST CUT OF THIS BRANCH DID NOT HAVE IT.
 * `snapshotRouting.test.ts` proves `pickSnapshotStrategy` picks correctly and pins the call shape by
 * source text — but neither of those actually watches a message leave. The brief asked for exactly
 * one thing: *"a test that `NETSNAPSHOT` goes out on exactly one strategy while `HELLO` goes out on
 * all"*. A routing bug that dropped every snapshot, or that narrowed HELLO too, would have passed
 * every other test on this branch.
 *
 * `transport.test.ts` opens by saying the `send()` happy path "requires a live network and is
 * validated via production playtest". That was true while `send()` was an unconditional broadcast
 * loop. It stopped being true the moment the loop grew a routing decision, so `send()` gets a real
 * harness here: fake `StrategyHandle`s injected into the private map, each recording what it was
 * handed. No Trystero room, no network.
 *
 * ## Why this file mocks `iceConfig`
 *
 * `SNAPSHOT_SINGLE_STRATEGY` is a `const false` — that is the point of it, and a test must not be
 * able to flip the shipped default at runtime. So the ON path is exercised by module-mocking the
 * config for this file only. The OFF path (what actually ships today) is asserted in
 * `snapshotRouting.test.ts` against the unmocked module.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted by vitest above the imports below: `transport.ts` binds SNAPSHOT_SINGLE_STRATEGY at
// import time, so the override has to be in place before it is loaded.
vi.mock('./iceConfig.ts', async (importOriginal) => {
  // `importOriginal()` is typed `unknown`; the cast is what lets the spread compile.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, SNAPSHOT_SINGLE_STRATEGY: true };
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
 * `peerCount > 0` is what makes a strategy eligible to carry snapshots — see `pickSnapshotStrategy`.
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
  // ⭐ THE UNION MATTERS NOW. Routing requires a strategy to carry EVERY peer at the table, so a
  // harness that populated per-strategy peers but left `peerSet` empty would make totalPeers 0 and
  // silently exercise the broadcast arm for every case. Peer ids are SHARED across strategies here
  // (`peer-0`, `peer-1`, …) because that is the real topology: one peer, two signalling paths.
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
  return { kind: 'HELLO', protoVersion: 46 } as never;
}

function byName(recorders: Recorder[], name: string): Recorder {
  const r = recorders.find((x) => x.name === name);
  if (r === undefined) throw new Error(`no recorder ${name}`);
  return r;
}

describe('S182 LEVER 1 — send fan-out with the routing flag ON', () => {
  beforeEach(() => {
    // Guard the guard: if the module mock ever stops applying, every assertion in this file would
    // silently become a test of the OFF path and pass for the wrong reason.
    expect(SNAPSHOT_SINGLE_STRATEGY).toBe(true);
  });

  it('⭐ NETSNAPSHOT goes out on EXACTLY ONE strategy while HELLO goes out on ALL', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    transport.send(snapMsg(1));
    transport.send(helloMsg());

    const nostr = byName(recorders, 'nostr');
    const torrent = byName(recorders, 'torrent');

    // The snapshot took one route — nostr, the preferred strategy.
    const snapSends = recorders.flatMap((r) => r.sent.filter((s) => s.includes('NETSNAPSHOT')));
    expect(snapSends).toHaveLength(1);
    expect(nostr.sent.filter((s) => s.includes('NETSNAPSHOT'))).toHaveLength(1);
    expect(torrent.sent.filter((s) => s.includes('NETSNAPSHOT'))).toHaveLength(0);

    // The rare control message kept its redundancy — this is the half that must NOT change.
    expect(nostr.sent.filter((s) => s.includes('HELLO'))).toHaveLength(1);
    expect(torrent.sent.filter((s) => s.includes('HELLO'))).toHaveLength(1);
  });

  it('halves snapshot traffic exactly — 10 snapshots produce 10 sends, not 20', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    for (let i = 1; i <= 10; i++) transport.send(snapMsg(i));
    const total = recorders.reduce((n, r) => n + r.sent.length, 0);
    expect(total).toBe(10);
  });

  it('fails over to torrent when nostr has lost its peer — the snapshot is NOT dropped', () => {
    const { transport, recorders } = harness([
      { name: 'nostr', peers: 0 },
      { name: 'torrent', peers: 1 },
    ]);
    transport.send(snapMsg(1));
    expect(byName(recorders, 'nostr').sent).toHaveLength(0);
    expect(byName(recorders, 'torrent').sent).toHaveLength(1);
  });

  it('⛔ when NO strategy has a peer it broadcasts rather than dropping the snapshot', () => {
    // The conservative arm of pickSnapshotStrategy. Dropping here would be strictly worse than the
    // doubling this lever removes: a silent total loss of snapshots is the freeze the owner's
    // brother already reported, caused by the fix for it.
    const { transport, recorders } = harness([
      { name: 'nostr', peers: 0 },
      { name: 'torrent', peers: 0 },
    ]);
    transport.send(snapMsg(1));
    expect(byName(recorders, 'nostr').sent).toHaveLength(1);
    expect(byName(recorders, 'torrent').sent).toHaveLength(1);
  });

  it('a not-ready strategy is skipped entirely and never receives anything', () => {
    const { transport, recorders } = harness([
      { name: 'nostr', ready: false, peers: 0 },
      { name: 'torrent', peers: 1 },
    ]);
    transport.send(snapMsg(1));
    transport.send(helloMsg());
    expect(byName(recorders, 'nostr').sent).toHaveLength(0);
    expect(byName(recorders, 'torrent').sent).toHaveLength(2);
  });

  it('a single-strategy session is unaffected — the snapshot still goes out', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }]);
    transport.send(snapMsg(1));
    expect(byName(recorders, 'nostr').sent).toHaveLength(1);
  });

  it('every other message kind keeps the redundant broadcast', () => {
    const { transport, recorders } = harness([{ name: 'nostr' }, { name: 'torrent' }]);
    for (const kind of ['INTENT', 'START_GAME_SIGNAL', 'LOBBY_PRESENCE', 'MIGRATION_CLAIM']) {
      transport.send({ kind } as never);
    }
    expect(byName(recorders, 'nostr').sent).toHaveLength(4);
    expect(byName(recorders, 'torrent').sent).toHaveLength(4);
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
});
