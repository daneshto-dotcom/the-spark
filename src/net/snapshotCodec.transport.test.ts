/**
 * S195 (net-delta) — the codec THROUGH the real `NetTransport`: two transports started with their own
 * `startStrategy` on fake rooms (`linkedPair`), so the `snap`/`sack` closures, `onPeerJoin`, the per-peer
 * backpressure slot and `handleRawMessage` are all production code. Each case below is a policy branch
 * of `encodeFor` / `decodeSnapFrame`, driven and then checked on what the joiner's handlers received.
 */
import { describe, expect, it, vi } from 'vitest';
import { stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import type { NetMessage, NetSnapshotMsg } from './protocol.ts';
import { linkedPair, startedTransport, fakeRoom, until, type LinkedPair } from './snapshotCodec.fixtures.ts';
import {
  FRAME_DEFLATE, FRAME_TEXT, KEYFRAME_INTERVAL, encodeDelta, packFrame, readDeltaHeader, segmentSnapshotMessage, unpackFrame,
} from './snapshotCodec.ts';

function snap(seq: number, opts: { prims?: number; moved?: number; drop?: number[] } = {}): NetSnapshotMsg {
  const n = opts.prims ?? 300;
  const primitives = [];
  for (let i = 1; i <= n; i++) {
    if (opts.drop?.includes(i)) continue;
    const dx = i <= (opts.moved ?? 0) ? seq * 0.37 : 0;
    primitives.push({
      id: i,
      type: i % 6,
      placerColor: 3921919,
      placedBy: i % 4,
      createdTick: 1000 + i,
      pos: { x: 100 + i + dx, y: 200 + (i % 17) },
      prevPos: { x: 1, y: 1 },
      bonds: [i - 1, i],
      ownerColor: 3921919,
      lastOwnershipChange: 1000 + i,
      radius: 8,
      origin: { x: 100 + i, y: 200 },
    });
  }
  const bonds = [];
  for (let i = 1; i < n; i++) bonds.push({ id: i, aId: i, bId: i + 1, restLength: 58.891234, stiffnessTier: 'HIGH', createdTick: 1000 + i });
  return {
    kind: 'NETSNAPSHOT',
    snapshotSeq: seq,
    snapshot: { schemaVersion: 1, tick: seq * 6, primitives, bonds, freeSparks: [], players: [] } as never,
    matchId: 'm.1',
  };
}
const fullWire = (m: NetSnapshotMsg): string => JSON.stringify(stripWirePrevPos(m), wireNumberReplacer);

/** host.send → the frame(s) it transmitted for this snapshot. */
async function sendAndTake(p: LinkedPair, m: NetSnapshotMsg): Promise<Uint8Array[]> {
  const before = p.hostRoom.actions.get('snap')!.sent.length;
  p.host.send(m);
  await until(() => p.hostRoom.actions.get('snap')!.sent.length > before, 'host transmitted');
  return p.takeFrames();
}
async function deliver(p: LinkedPair, frames: Uint8Array[]): Promise<void> {
  for (const f of frames) p.deliverFrame(f);
  await p.joiner.snapFramesSettled('H');
}
const headerOf = async (f: Uint8Array) => readDeltaHeader(await unpackFrame(f))!;
const rings = (p: LinkedPair) => (p.joiner as unknown as { rxPeers: Map<string, { ring: Map<number, unknown> }> }).rxPeers;
function received(p: LinkedPair): NetMessage[] {
  const out: NetMessage[] = [];
  p.joiner.on((m) => out.push(m));
  return out;
}
/** Hand every ack the joiner has sent to the host. */
function flushAcks(p: LinkedPair): void {
  for (const a of p.takeAcks()) p.deliverAck(a);
}

describe('S195 net-delta — through the real transport', () => {
  it('first frame is a KEYFRAME; once acked, frames are DELTAS a fraction of the size; the joiner gets the exact snapshot', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p); // the joiner's hello: z=1
    const [k] = await sendAndTake(p, snap(1, { moved: 10 }));
    expect((await headerOf(k!)).baseFid).toBe(0);
    await deliver(p, [k!]);
    flushAcks(p);
    const [d] = await sendAndTake(p, snap(2, { moved: 10 }));
    const h = await headerOf(d!);
    expect(h.baseFid).toBeGreaterThan(0);
    await deliver(p, [d!]);
    expect(got).toHaveLength(2);
    expect(p.rawSeen[1]).toBe(fullWire(snap(2, { moved: 10 })));
    expect(d![0]).toBe(FRAME_DEFLATE);
    // 10 of 300 shapes moved: the delta is a small fraction of the keyframe, deflated or not.
    expect(d!.byteLength * 10).toBeLessThan(k!.byteLength);
    expect(d!.byteLength * 50).toBeLessThan(fullWire(snap(2)).length);
  });

  it('⛔ NEGATIVE — a frame whose base the joiner does not hold is DROPPED (nothing applied) and a keyframe is requested; the next frame is a keyframe', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    // Frame 2 is lost; the host is (falsely) told the joiner rebuilt it — e.g. a joiner that reloaded.
    const lost = await sendAndTake(p, snap(2));
    const lostFid = (await headerOf(lost[0]!)).fid;
    p.deliverAck(JSON.stringify({ f: lostFid, z: 1 }));
    const [d] = await sendAndTake(p, snap(3));
    expect((await headerOf(d!)).baseFid).toBe(lostFid);
    await deliver(p, [d!]);
    expect(got).toHaveLength(1); // frame 3 was NOT applied
    const acks = p.takeAcks().map((a) => JSON.parse(a));
    expect(acks).toContainEqual({ f: 0, z: 1, k: 1 });
    for (const a of acks) p.deliverAck(JSON.stringify(a));
    const [k] = await sendAndTake(p, snap(4));
    expect((await headerOf(k!)).baseFid).toBe(0);
    await deliver(p, [k!]);
    expect(got).toHaveLength(2);
    expect(p.rawSeen.at(-1)).toBe(fullWire(snap(4)));
  });

  it('a joiner that cannot inflate (ack z=0) gets UNCOMPRESSED frames — it still plays', async () => {
    const p = linkedPair();
    const got = received(p);
    p.takeAcks();
    p.deliverAck(JSON.stringify({ f: 0, z: 0 }));
    const [k] = await sendAndTake(p, snap(1));
    expect(k![0]).toBe(FRAME_TEXT);
    await deliver(p, [k!]);
    expect(got).toHaveLength(1);
    expect(p.rawSeen[0]).toBe(fullWire(snap(1)));
  });

  it('a frame delivered twice (two strategies) is applied once; an OLDER frame after a newer one is ignored', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p);
    const [a] = await sendAndTake(p, snap(1));
    const [b] = await sendAndTake(p, snap(2)); // both keyframes: nothing acked yet
    await deliver(p, [a!, a!, b!, a!]);
    expect(got.map((m) => (m as NetSnapshotMsg).snapshotSeq)).toEqual([1, 2]);
  });

  it('frames keep ARRIVAL order through the async inflate, many in one burst', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    const burst: Uint8Array[] = [];
    for (let s = 2; s <= 12; s++) burst.push(...(await sendAndTake(p, snap(s, { moved: s * 3, prims: 200 + s }))));
    await deliver(p, burst);
    expect(got.map((m) => (m as NetSnapshotMsg).snapshotSeq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(p.rawSeen.at(-1)).toBe(fullWire(snap(12, { moved: 36, prims: 212 })));
  });

  it('a destroyed entity is REMOVED on the joiner (explicit removal, not a stale copy)', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(2, { drop: [5, 6, 300] })));
    const last = got.at(-1) as NetSnapshotMsg;
    const ids = last.snapshot.primitives.map((x) => x.id as unknown as number);
    expect(ids).not.toContain(5);
    expect(ids).not.toContain(300);
    expect(ids).toHaveLength(297);
  });

  it(`a keyframe at least every KEYFRAME_INTERVAL (${KEYFRAME_INTERVAL}) frames even while every frame is acked`, async () => {
    const p = linkedPair();
    flushAcks(p);
    let keyframes = 0;
    for (let s = 1; s <= KEYFRAME_INTERVAL + 5; s++) {
      const frames = await sendAndTake(p, snap(s, { prims: 20 }));
      if ((await headerOf(frames[0]!)).baseFid === 0) keyframes++;
      await deliver(p, frames);
      flushAcks(p);
    }
    expect(keyframes).toBe(2);
  });

  it('a host that RECONNECTS (new transport, same peer id) starts with a keyframe, and a stale ack from before names nothing', async () => {
    const p = linkedPair();
    const got = received(p);
    flushAcks(p);
    const [k] = await sendAndTake(p, snap(1));
    const oldFid = (await headerOf(k!)).fid;
    await deliver(p, [k!]);
    // The host's transport is replaced; the joiner keeps its ring for peer 'H'.
    const room2 = fakeRoom();
    const host2 = startedTransport(room2);
    room2.room.onPeerJoin('J');
    room2.actions.get('sack')!.onMessage!(JSON.stringify({ f: oldFid, z: 1 }), { peerId: 'J' });
    host2.send(snap(2));
    await until(() => room2.actions.get('snap')!.sent.length > 0, 'host2 transmitted');
    const f = room2.actions.get('snap')!.sent[0]!.data as Uint8Array;
    const h = await headerOf(f);
    expect(h.baseFid).toBe(0);
    expect(h.fid).toBeGreaterThan(oldFid); // page-unique fids
    p.deliverFrame(f);
    await p.joiner.snapFramesSettled('H');
    expect(got.map((m) => (m as NetSnapshotMsg).snapshotSeq)).toEqual([1, 2]);
  });

  it('a handle WITHOUT the binary action (legacy) still gets the exact pre-S195 string on `msg`', async () => {
    const t = startedTransport(fakeRoom());
    const priv = t as unknown as { strategies: Map<string, { snapAction?: unknown }> };
    const h = priv.strategies.get('nostr')!;
    h.snapAction = null;
    const room = (t as unknown as { strategies: Map<string, { room: { onPeerJoin: (id: string) => void } }> }).strategies.get('nostr')!.room;
    room.onPeerJoin('J');
    const msgAction = (t as unknown as { strategies: Map<string, { action: { sent: Array<{ data: unknown }> } }> }).strategies.get('nostr')!.action;
    t.send(snap(1));
    await until(() => msgAction.sent.length > 0, 'legacy send');
    expect(msgAction.sent[0]!.data).toBe(fullWire(snap(1)));
  });

  it('control traffic (HELLO) never enters the codec: it stays a plain string on `msg`', async () => {
    const p = linkedPair();
    p.host.send({ kind: 'HELLO', protoVersion: 1, playerId: 0, color: 1 } as never);
    expect(p.hostRoom.actions.get('snap')!.sent).toHaveLength(0);
    expect(typeof p.hostRoom.actions.get('msg')!.sent[0]!.data).toBe('string');
  });

  it('a peer leaving clears its codec state: on its return the first frame is a keyframe', async () => {
    const p = linkedPair();
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    expect((await headerOf((await sendAndTake(p, snap(2)))[0]!)).baseFid).toBeGreaterThan(0);
    p.hostRoom.room.onPeerLeave('J');
    p.hostRoom.room.onPeerJoin('J');
    expect((await headerOf((await sendAndTake(p, snap(3)))[0]!)).baseFid).toBe(0);
  });

  it('⛔ S195 audit F1 (P1) — a message handler that THROWS once does not freeze the board: later frames still apply', async () => {
    const p = linkedPair();
    const got: NetMessage[] = [];
    let throwOnce = true;
    p.joiner.on((m) => {
      if (throwOnce && (m as NetSnapshotMsg).snapshotSeq === 2) { throwOnce = false; throw new Error('handler boom'); }
      got.push(m);
    });
    const errors: string[] = [];
    p.joiner.onError = (e) => errors.push(e);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushAcks(p);
    for (let s = 1; s <= 6; s++) {
      await deliver(p, await sendAndTake(p, snap(s, { moved: 5 })));
      flushAcks(p);
    }
    quiet.mockRestore();
    expect(got.map((m) => (m as NetSnapshotMsg).snapshotSeq)).toEqual([1, 3, 4, 5, 6]);
    // ⛔ R2(c) — logged + counted, NEVER raised into onError (the sticky lobby line).
    expect(errors, 'a handler throw must not reach the lobby error line').toEqual([]);
    expect(p.joiner.snapshotHandlerErrors()).toBe(1);
    expect(p.rawSeen.at(-1)).toBe(fullWire(snap(6, { moved: 5 })));
  });

  it('⛔ S195 audit F2 (P3) — a frame that rebuilds into a NON-message is never kept as a base, from any peer', async () => {
    const p = linkedPair();
    const segs = segmentSnapshotMessage({ kind: 'GARBAGE', snapshot: { junk: 'x'.repeat(100_000) } } as never, wireNumberReplacer)!;
    const frame = await packFrame(encodeDelta(segs, null, 999_999, 0), false);
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    p.joinerRoom.actions.get('snap')!.onMessage!(frame, { peerId: 'EVIL' });
    await p.joiner.snapFramesSettled('EVIL');
    quiet.mockRestore();
    const rx = (p.joiner as unknown as { rxPeers: Map<string, { ring: Map<number, unknown> }> }).rxPeers.get('EVIL');
    expect(rx?.ring.size ?? 0).toBe(0);
    expect(p.takeAcks().filter((a) => JSON.parse(a).f === 999_999), 'and it is never acked').toHaveLength(0);
  });

  it('⛔ S195 audit F2 — only ONE sender holds a ring: a successor accepted keyframe moves it, the old host ring is dropped', async () => {
    const p = linkedPair();
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    const rings = (p.joiner as unknown as { rxPeers: Map<string, { ring: Map<number, unknown> }> }).rxPeers;
    expect(rings.get('H')!.ring.size).toBe(1);
    // A second sender (a migration successor) sends a keyframe the receive path accepts.
    const room2 = fakeRoom();
    const host2 = startedTransport(room2);
    room2.room.onPeerJoin('J');
    host2.send(snap(2));
    await until(() => room2.actions.get('snap')!.sent.length > 0, 'host2 transmitted');
    // The client adopted the successor (`session.hostPeerId = winner.peerId`) — it is now the authority.
    p.joiner.isSnapshotAuthority = (id) => id === 'H2';
    p.joinerRoom.actions.get('snap')!.onMessage!(room2.actions.get('snap')!.sent[0]!.data, { peerId: 'H2' });
    await p.joiner.snapFramesSettled('H2');
    expect(rings.get('H2')!.ring.size).toBe(1);
    expect(rings.get('H')!.ring.size, 'the deposed sender keeps no bases').toBe(0);
  });

  it('⛔ S195 re-audit R2(a) (G1) — the INNER try/catch alone: the frame whose handler threw is still committed + acked, the next delta bases on it', async () => {
    const p = linkedPair();
    let throwOnce = true;
    p.joiner.on((m) => { if (throwOnce && (m as NetSnapshotMsg).snapshotSeq === 2) { throwOnce = false; throw new Error('boom'); } });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    const f2 = await sendAndTake(p, snap(2));
    const fid2 = (await headerOf(f2[0]!)).fid;
    await deliver(p, f2);
    const acks = p.takeAcks().map((a) => JSON.parse(a));
    for (const a of acks) p.deliverAck(JSON.stringify(a));
    quiet.mockRestore();
    expect(acks.map((a) => a.f)).toContain(fid2);
    expect(rings(p).get('H')!.ring.has(fid2)).toBe(true);
    expect((await headerOf((await sendAndTake(p, snap(3)))[0]!)).baseFid).toBe(fid2);
  });

  it('⛔ S195 re-audit R2(b) (G2) — a THROWING onError on top of a handler throw does not freeze the board', async () => {
    const p = linkedPair();
    const got: number[] = [];
    let throwOnce = true;
    p.joiner.on((m) => {
      const s = (m as NetSnapshotMsg).snapshotSeq;
      if (throwOnce && s === 2) { throwOnce = false; throw new Error('boom'); }
      got.push(s);
    });
    p.joiner.onError = () => { throw new Error('ui callback threw'); };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushAcks(p);
    for (let s = 1; s <= 6; s++) {
      await deliver(p, await sendAndTake(p, snap(s)));
      flushAcks(p);
    }
    quiet.mockRestore();
    expect(got).toEqual([1, 3, 4, 5, 6]);
  });

  it('⛔ S195 re-audit R2(b) — the CHAIN catch alone: a decode step that rejects (outside the handler guard) with a THROWING onError still leaves the chain alive', async () => {
    const p = linkedPair();
    const got: number[] = [];
    p.joiner.on((m) => got.push((m as NetSnapshotMsg).snapshotSeq));
    p.joiner.onError = () => { throw new Error('ui callback threw'); };
    // ⭐ S196 (joiner-desync) — the per-frame step is now the synchronous `processSnapFrame` inside the
    // receive pipeline's drain (no promise chain left); a throw from it must leave the pipeline alive.
    const priv = p.joiner as unknown as { processSnapFrame: (...a: unknown[]) => void };
    const real = priv.processSnapFrame.bind(p.joiner);
    let failOnce = true;
    priv.processSnapFrame = (...a: unknown[]) => {
      if (failOnce) { failOnce = false; throw new Error('unexpected decode failure'); }
      return real(...a);
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushAcks(p);
    for (let s = 1; s <= 4; s++) {
      await deliver(p, await sendAndTake(p, snap(s)));
      flushAcks(p);
    }
    quiet.mockRestore();
    expect(got).toEqual([2, 3, 4]);
    expect(p.joiner.snapshotHandlerErrors()).toBe(1);
  });

  it('⛔ S195 re-audit R1 (G3) — a NON-HOST peer’s valid keyframe cannot take the base slot: the host’s next delta applies with no keyframe request', async () => {
    const p = linkedPair();
    flushAcks(p);
    await deliver(p, await sendAndTake(p, snap(1)));
    flushAcks(p);
    expect(rings(p).get('H')!.ring.size).toBe(1);
    const evilRoom = fakeRoom();
    const evil = startedTransport(evilRoom);
    evilRoom.room.onPeerJoin('J');
    evil.send(snap(999));
    await until(() => evilRoom.actions.get('snap')!.sent.length > 0, 'evil sent');
    p.joinerRoom.actions.get('snap')!.onMessage!(evilRoom.actions.get('snap')!.sent[0]!.data, { peerId: 'EVIL' });
    await p.joiner.snapFramesSettled('EVIL');
    expect(rings(p).get('H')!.ring.size).toBe(1);
    expect((p.joiner as unknown as { rxSource: string }).rxSource).toBe('H');
    expect(rings(p).get('EVIL')?.ring.size ?? 0).toBe(0);
    const got: NetMessage[] = [];
    p.joiner.on((m) => got.push(m));
    const [d] = await sendAndTake(p, snap(2));
    expect((await headerOf(d!)).baseFid).toBeGreaterThan(0);
    await deliver(p, [d!]);
    expect(got.map((m) => (m as NetSnapshotMsg).snapshotSeq)).toEqual([2]);
    const acks = p.takeAcks().map((a) => JSON.parse(a));
    expect(acks.filter((a) => a.k === 1), 'no keyframe request').toEqual([]);
    expect(evilRoom.actions.get('sack')!.onMessage, 'evil side exists').toBeDefined();
  });

  it('⛔ NEGATIVE — garbage on the snap action (not bytes, unknown format) is dropped and asks for a keyframe, never throws', async () => {
    const p = linkedPair();
    const got = received(p);
    p.takeAcks();
    p.deliverFrame('a string' as never);
    p.deliverFrame(new Uint8Array([0x99, 1, 2]));
    await p.joiner.snapFramesSettled('H');
    expect(got).toHaveLength(0);
    expect(p.takeAcks().map((a) => JSON.parse(a))).toEqual([{ f: 0, z: 1, k: 1 }]); // rate-limited: one
  });
});
