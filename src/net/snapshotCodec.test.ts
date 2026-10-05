/**
 * S195 (net-delta) — the snapshot codec, unit level: segmentation is exact, deltas round-trip every
 * shape change, and every malformed input is refused (a frame from a host is untrusted input).
 * The long-match oracle is `snapshotCodec.differential.test.ts`; the transport wiring is
 * `snapshotCodec.transport.test.ts`.
 */
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { wireNumberReplacer } from '../state/save.ts';
import {
  FRAME_DEFLATE,
  FRAME_TEXT,
  MAX_INFLATED_BYTES,
  applyDelta,
  buildSnapAck,
  encodeDelta,
  packFrame,
  parseSnapAck,
  readDeltaHeader,
  segmentSnapshotMessage,
  segmentsToText,
  unpackFrame,
  type Segments,
} from './snapshotCodec.ts';

type Msg = { kind: 'NETSNAPSHOT'; snapshotSeq: number; snapshot: Record<string, unknown>; epoch?: number; matchId?: string };

function msg(snapshot: Record<string, unknown>, extra: Partial<Msg> = {}): Msg {
  return { kind: 'NETSNAPSHOT', snapshotSeq: 7, snapshot, ...extra };
}

const seg = (m: Msg, prev: Segments | null = null): Segments => {
  const s = segmentSnapshotMessage(m, wireNumberReplacer, prev);
  if (s === null) throw new Error('not segmentable');
  return s;
};
const wire = (m: Msg): string => JSON.stringify(m, wireNumberReplacer);

/** Encode `b` against `a`, apply, and return the rebuilt text. */
function roundTrip(a: Msg | null, b: Msg): string {
  const sa = a === null ? null : seg(a);
  const sb = seg(b, sa);
  const text = encodeDelta(sb, sa, 2, sa === null ? 0 : 1);
  return segmentsToText(applyDelta(text, sa));
}

const board = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  tick: 120,
  primitives: [
    { id: 1, type: 3, pos: { x: 10.123456, y: 20.5 }, bonds: [0] },
    { id: 2, type: 1, pos: { x: 30, y: 40.987654 }, bonds: [0] },
    { id: 3, type: 2, pos: { x: 50, y: 60 }, bonds: [] },
  ],
  bonds: [{ id: 0, aId: 1, bId: 2, restLength: 58.891234 }],
  freeSparks: [],
  players: [{ id: 0, color: 3921919 }, { id: 1, color: 255 }],
  palette: [1, 2, 3],
  ...over,
});

describe('S195 codec — segmentation reproduces the legacy wire string exactly', () => {
  it('envelope fields before AND after the snapshot, rounding, empty and non-entity arrays', () => {
    const m = msg(board(), { epoch: 3, matchId: 'abc.1' });
    expect(segmentsToText(seg(m))).toBe(wire(m));
    // epoch/matchId omitted (the original host's term): the envelope still matches.
    const plain = msg(board());
    expect(segmentsToText(seg(plain))).toBe(wire(plain));
  });

  it('undefined properties are omitted exactly as JSON.stringify omits them', () => {
    const m = msg(board({ seagulls: undefined, note: 'x' }));
    expect(segmentsToText(seg(m))).toBe(wire(m));
  });

  it('arrays that are NOT entity collections ride as one atomic text (duplicate ids, no id, mixed)', () => {
    const m = msg(board({
      dupes: [{ id: 1 }, { id: 1 }],
      noIds: [{ a: 1 }],
      mixed: [{ id: 1 }, 2],
      strIds: [{ id: 'a', v: 1.005 }, { id: 'b' }],
    }));
    const s = seg(m);
    expect(s.vals.get('dupes')!.kind).toBe('a');
    expect(s.vals.get('noIds')!.kind).toBe('a');
    expect(s.vals.get('mixed')!.kind).toBe('a');
    expect(s.vals.get('strIds')!.kind).toBe('e');
    expect(s.vals.get('primitives')!.kind).toBe('e');
    expect(segmentsToText(s)).toBe(wire(m));
  });

  it('unchanged entity texts are SHARED with the previous frame (memory, and identity-first compares)', () => {
    const a = seg(msg(board()));
    const b = seg(msg(board({ tick: 121 })), a);
    const ta = (a.vals.get('primitives') as { texts: Map<number, string> }).texts;
    const tb = (b.vals.get('primitives') as { texts: Map<number, string> }).texts;
    expect(tb.get(1)).toBe(ta.get(1));
  });

  it('a message with no object snapshot is not segmentable (the caller sends it the legacy way)', () => {
    expect(segmentSnapshotMessage({ snapshot: null }, wireNumberReplacer)).toBeNull();
    expect(segmentSnapshotMessage({ snapshot: [1] }, wireNumberReplacer)).toBeNull();
  });
});

describe('S195 codec — deltas round-trip every kind of change', () => {
  it('keyframe (no base)', () => {
    const b = msg(board());
    expect(roundTrip(null, b)).toBe(wire(b));
  });

  it('an entity moved, one added, one REMOVED (explicitly), an atomic changed', () => {
    const a = msg(board());
    const nb = board({ tick: 121 });
    const prims = (nb.primitives as Array<Record<string, unknown>>).filter((p) => p.id !== 2);
    prims[0] = { ...prims[0], pos: { x: 11, y: 20.5 } };
    prims.push({ id: 9, type: 4, pos: { x: 1, y: 2 }, bonds: [] });
    nb.primitives = prims;
    const b = msg(nb);
    const sa = seg(a);
    const text = encodeDelta(seg(b, sa), sa, 2, 1);
    // Only what changed travels: id 3 is untouched, so its text is not in the frame.
    expect(text).not.toContain('"id":3');
    expect(text).toContain('[2]'); // the removed id, explicit
    const rebuilt = applyDelta(text, sa);
    expect(segmentsToText(rebuilt)).toBe(wire(b));
    // The removed entity is GONE from the rebuilt base, not just skipped by the id list — a stale text
    // left behind would break the next frame that names an explicit order (size check), and leak.
    const rebuiltPrims = rebuilt.vals.get('primitives') as { ids: readonly number[]; texts: ReadonlyMap<number, string> };
    expect(rebuiltPrims.texts.has(2)).toBe(false);
    expect(rebuiltPrims.texts.size).toBe(rebuiltPrims.ids.length);
  });

  it('a reordered collection sends its order; the natural order is not sent', () => {
    const a = msg(board());
    const nb = board();
    nb.primitives = [...(nb.primitives as unknown[])].reverse();
    const b = msg(nb);
    const sa = seg(a);
    const text = encodeDelta(seg(b, sa), sa, 2, 1);
    expect(segmentsToText(applyDelta(text, sa))).toBe(wire(b));
    expect(JSON.parse(text.split('\n')[0]!).c[0]).toHaveLength(5);
  });

  it('a key appearing, a key disappearing, and a value changing kind (atomic ↔ entity)', () => {
    const a = msg(board({ hunters: [{ id: 5, pos: { x: 1, y: 1 } }], palette: [1] }));
    const b = msg(board({ palette: [{ id: 1 }, { id: 2 }], gone: undefined, extra: { deep: [1, 2.333] } }));
    expect(roundTrip(a, b)).toBe(wire(b));
    expect(roundTrip(b, a)).toBe(wire(a));
  });

  it('nothing changed → the frame carries no ops and no keys', () => {
    const a = msg(board());
    const sa = seg(a);
    const text = encodeDelta(seg(a, sa), sa, 2, 1);
    expect(JSON.parse(text.split('\n')[0]!)).toEqual({ f: 2, b: 1, c: [] });
    expect(segmentsToText(applyDelta(text, sa))).toBe(wire(a));
  });

  it('the envelope (seq, epoch, matchId) always travels and is rebuilt', () => {
    const a = msg(board());
    const b = msg(board(), { snapshotSeq: 99, epoch: 2, matchId: 'zz.4' });
    expect(roundTrip(a, b)).toBe(wire(b));
  });
});

describe('S195 codec — a malformed frame is refused, never half-applied (NEGATIVE)', () => {
  const a = msg(board());
  const sa = seg(a);
  const good = encodeDelta(seg(msg(board({ tick: 5 })), sa), sa, 2, 1);

  it('a delta against the wrong kind of base, or a keyframe applied with a base', () => {
    expect(() => applyDelta(good, null)).toThrow(/base mismatch/);
    const key = encodeDelta(sa, null, 2, 0);
    expect(() => applyDelta(key, sa)).toThrow(/base mismatch/);
  });

  it('removing an id the base does not have', () => {
    const lines = good.split('\n');
    lines[0] = JSON.stringify({ f: 2, b: 1, c: [['e', 'primitives', [77], []]] });
    expect(() => applyDelta(lines.join('\n'), sa)).toThrow(/absent id/);
  });

  it('too few or too many payload lines', () => {
    expect(() => applyDelta(good + '\n{}', sa)).toThrow(/trailing/);
    const lines = good.split('\n');
    expect(() => applyDelta(lines.slice(0, -1).join('\n'), sa)).toThrow(/missing payload/);
  });

  it('an order naming an absent id, an op for a key not in the snapshot, unknown op', () => {
    const order = JSON.stringify({ f: 2, b: 1, c: [['e', 'primitives', [], [], [1, 2, 4]]] });
    expect(() => applyDelta([order, sa.prefix, sa.suffix].join('\n'), sa)).toThrow(/order/);
    const absent = JSON.stringify({ f: 2, b: 1, c: [['a', 'nope']] });
    expect(() => applyDelta([absent, sa.prefix, sa.suffix, '1'].join('\n'), sa)).toThrow(/absent key/);
    const unknown = JSON.stringify({ f: 2, b: 1, c: [['x', 'tick']] });
    expect(() => applyDelta([unknown, sa.prefix, sa.suffix].join('\n'), sa)).toThrow(/unknown op/);
  });

  it('a keyframe that leaves a key without a value', () => {
    const k = JSON.stringify({ f: 2, b: 0, k: ['tick'], c: [] });
    expect(() => applyDelta([k, sa.prefix, sa.suffix].join('\n'), null)).toThrow(/no value/);
  });

  it('readDeltaHeader refuses junk, a non-positive fid and a base not older than the frame', () => {
    expect(readDeltaHeader('not json\n')).toBeNull();
    expect(readDeltaHeader('{"f":0,"b":0}\n')).toBeNull();
    expect(readDeltaHeader('{"f":3,"b":3}\n')).toBeNull();
    expect(readDeltaHeader('{"f":3,"b":-1}\n')).toBeNull();
    expect(readDeltaHeader('{"f":3,"b":2}')).toBeNull(); // no newline: not a frame
    expect(readDeltaHeader('{"f":3,"b":2}\n')).toEqual({ fid: 3, baseFid: 2 });
  });
});

describe('S195 codec — compression (A)', () => {
  it('round-trips both formats; a deflated wave-sized text shrinks', async () => {
    const text = encodeDelta(seg(msg(board())), null, 1, 0).repeat(50);
    const plain = await packFrame(text, false);
    const z = await packFrame(text, true);
    expect(plain[0]).toBe(FRAME_TEXT);
    expect(z[0]).toBe(FRAME_DEFLATE);
    expect(z.byteLength).toBeLessThan(plain.byteLength / 5);
    expect(await unpackFrame(plain)).toBe(text);
    expect(await unpackFrame(z)).toBe(text);
  });

  it('an unknown format byte, an empty frame and corrupt deflate are refused', async () => {
    await expect(unpackFrame(new Uint8Array([0x7f, 1, 2]))).rejects.toThrow(/unknown format/);
    await expect(unpackFrame(new Uint8Array([]))).rejects.toThrow(/empty/);
    await expect(unpackFrame(new Uint8Array([FRAME_DEFLATE, 1, 2, 3, 4]))).rejects.toThrow();
  });

  it('⛔ a deflate BOMB is cut off at MAX_INFLATED_BYTES instead of inflating', async () => {
    const bomb = deflateSync(Buffer.alloc(MAX_INFLATED_BYTES + 1024 * 1024, 0x61));
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    const frame = new Uint8Array(bomb.byteLength + 1);
    frame[0] = FRAME_DEFLATE;
    frame.set(bomb, 1);
    await expect(unpackFrame(frame)).rejects.toThrow(/MAX_INFLATED_BYTES/);
  });
});

describe('S195 codec — the ack', () => {
  it('parses fail-closed', () => {
    expect(parseSnapAck('{"f":3,"z":1}')).toEqual({ f: 3, z: true, k: false });
    expect(parseSnapAck('{"f":0,"z":0,"k":1}')).toEqual({ f: 0, z: false, k: true });
    expect(parseSnapAck('{"f":-1}')).toBeNull();
    expect(parseSnapAck('{"f":1.5}')).toBeNull();
    expect(parseSnapAck('nope')).toBeNull();
    expect(parseSnapAck(42)).toBeNull();
    expect(parseSnapAck('x'.repeat(500))).toBeNull();
  });

  it('a node/browser with DecompressionStream advertises z=1', () => {
    expect(JSON.parse(buildSnapAck(4, true))).toEqual({ f: 4, z: 1, k: 1 });
  });
});
