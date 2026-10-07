/**
 * ⭐⭐ S195 (R195-N1, owner: *"A plus B for slow connections for sure. Definitely need to run them
 * now."*) — THE SNAPSHOT WIRE CODEC: delta frames against an ACKNOWLEDGED base (B) + DEFLATE (A).
 *
 * ## WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It lives at the TRANSPORT boundary, exactly where `stripWirePrevPos` and `wireNumberReplacer`
 * already live (canon §6). The sim never sees it; `netSnapshot()` is untouched, so the worker→main
 * mirror transfer, the disk save and every hash are untouched by construction.
 *
 * The host takes the string `NetTransport.send` has always produced —
 * `JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer)` — and SEGMENTS it:
 *   · the envelope around `"snapshot":` (prefix + suffix: kind, snapshotSeq, epoch, matchId);
 *   · the snapshot's top-level keys, in order;
 *   · for every top-level array whose elements are all objects carrying a unique `id` (shapes,
 *     connectors, creatures, sparks …) one TEXT PER ENTITY; every other value is one atomic text.
 * Concatenating the segments gives back that exact string — `segmentsToText(segment(msg))` ===
 * the legacy wire string, pinned by `snapshotCodec.test.ts` over a long real match.
 *
 * A frame then carries only what differs from a BASE frame the receiver has ACKNOWLEDGED: changed
 * atomic values, changed/added entity texts, removed ids (EXPLICIT), and the id order only when it
 * is not the natural one. A KEYFRAME is the same encoding against an empty base. The receiver
 * splices the segments back into the FULL STRING and hands it to the unchanged receive path
 * (`handleRawMessage` → JSON.parse → parseNetMessage → ClientSync), so a reconstructed snapshot is
 * byte-identical to the full snapshot BY CONSTRUCTION, not by a field-by-field mirror that the next
 * new field would silently miss. That is the property the four-sites rule keeps failing on, and it
 * is the reason this codec is generic over the snapshot's shape instead of knowing its families:
 * a field added to `NetSnapshot` tomorrow rides the delta with no change here.
 *
 * ## THE TEXT FORMAT (before compression)
 *
 * Newline-delimited. `JSON.stringify` never emits a raw `\n` (it escapes it), so every segment is
 * exactly one line:
 *   line 0  header JSON: {"f":fid,"b":baseFid|0,"k"?:[keys],"c":[ops]}
 *   line 1  envelope prefix (ends with `"snapshot":`)
 *   line 2  envelope suffix (starts after the snapshot object; usually `}`)
 *   then one line per op payload, in op order:
 *     ["a", key]                        → 1 line: the value's JSON text
 *     ["e", key, removed, upserts, order?] → upserts.length lines: each entity's JSON text
 * `k` is present when the key list differs from the base's (always on a keyframe). Keys dropped
 * from the snapshot (an optional array omitted when empty) are dropped by `k` — explicit.
 *
 * ## THE BINARY FRAME
 *
 * byte 0 = format: `FRAME_TEXT` (UTF-8 text follows) or `FRAME_DEFLATE` (deflate of the UTF-8 text,
 * the browser's own `CompressionStream` — no package). Compression is used only toward a peer that
 * said, in its ack, that it can inflate; a browser without `DecompressionStream` still plays, on
 * uncompressed deltas. See `transport.ts` for acks, keyframe policy and per-peer state.
 */

/** An entity id as it appears on the wire. Every id-bearing family uses numbers today. */
export type WireId = number | string;

/** One top-level snapshot value, segmented. */
export type SegValue =
  | { readonly kind: 'a'; readonly text: string }
  | { readonly kind: 'e'; readonly ids: readonly WireId[]; readonly texts: ReadonlyMap<WireId, string> };

/** A snapshot message in segments. Immutable once built — both rings share strings between frames. */
export interface Segments {
  readonly prefix: string;
  readonly suffix: string;
  readonly keys: readonly string[];
  readonly vals: ReadonlyMap<string, SegValue>;
}

export const FRAME_TEXT = 0x11;
export const FRAME_DEFLATE = 0x12;

/**
 * ⚠ MINE — the most a frame may inflate to, so a hostile or broken peer cannot hand a joiner a deflate
 * bomb. ⭐ S195 audit F2: lowered 8 → 2 MiB on a MEASUREMENT — the largest inflated frame (a keyframe's
 * text) is 179.3 KiB at wave 10 and 291.0 KiB at wave 15 on the C5 bots match (`netDeltaMeasure.test.ts`,
 * `keyTextMax`); 2 MiB is ~7× the wave-15 keyframe, room for the pants endgame (+~57 KiB computed) and a
 * far bigger human board.
 */
export const MAX_INFLATED_BYTES = 2 * 1024 * 1024;

const SNAPSHOT_MARK = '"snapshot":';

type Replacer = (key: string, value: unknown) => unknown;

/** Every element a plain object with a number/string `id`, ids unique → an entity collection. */
function entityIds(arr: readonly unknown[]): WireId[] | null {
  if (arr.length === 0) return null;
  const ids: WireId[] = [];
  const seen = new Set<WireId>();
  for (const el of arr) {
    if (el === null || typeof el !== 'object' || Array.isArray(el)) return null;
    if (typeof (el as { toJSON?: unknown }).toJSON === 'function') return null;
    const id = (el as { id?: unknown }).id;
    if (typeof id !== 'number' && typeof id !== 'string') return null;
    // A non-finite number id would stringify as null in the header and never match again.
    if (typeof id === 'number' && !Number.isFinite(id)) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Segment a wire-ready snapshot message (already through `stripWirePrevPos`). `prev` (optional) is
 * the previous frame's segments: an entity text equal to its previous text REUSES the previous
 * string object, so unchanged entities share memory across the ring and compare by identity first.
 *
 * Returns null when the message is not shaped like a snapshot envelope (no object `snapshot`) —
 * the caller then sends it the legacy way. ⛔ Never throws on shape: `NetTransport.send` must not.
 */
export function segmentSnapshotMessage(
  msg: { readonly snapshot: unknown },
  replacer: Replacer,
  prev: Segments | null = null,
): Segments | null {
  const snap = msg.snapshot;
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) return null;
  const env = JSON.stringify({ ...msg, snapshot: 0 }, replacer);
  const at = env.indexOf(SNAPSHOT_MARK + '0');
  if (at < 0) return null;
  const prefix = env.slice(0, at + SNAPSHOT_MARK.length);
  const suffix = env.slice(at + SNAPSHOT_MARK.length + 1);
  const keys: string[] = [];
  const vals = new Map<string, SegValue>();
  for (const key of Object.keys(snap)) {
    // The replacer is key-independent today (`wireNumberReplacer` reads only the value), but it is
    // called here exactly as JSON.stringify would call it on this property, so a key-aware one
    // tomorrow still produces the same text.
    const raw = replacer.call(snap, key, (snap as Record<string, unknown>)[key]);
    if (Array.isArray(raw)) {
      const ids = entityIds(raw);
      if (ids !== null) {
        const before = prev?.vals.get(key);
        const prevTexts = before !== undefined && before.kind === 'e' ? before.texts : null;
        const texts = new Map<WireId, string>();
        for (let i = 0; i < raw.length; i++) {
          // JSON.stringify calls the replacer on the element with its INDEX as key; mimic it.
          const el = replacer.call(raw, String(i), raw[i]);
          let text = JSON.stringify(el, replacer);
          const old = prevTexts?.get(ids[i]);
          if (old !== undefined && old === text) text = old;
          texts.set(ids[i], text);
        }
        keys.push(key);
        vals.set(key, { kind: 'e', ids, texts });
        continue;
      }
    }
    const text = JSON.stringify(raw, replacer) as string | undefined;
    if (text === undefined) continue; // undefined / function: JSON.stringify omits the property
    keys.push(key);
    const before = prev?.vals.get(key);
    vals.set(key, { kind: 'a', text: before !== undefined && before.kind === 'a' && before.text === text ? before.text : text });
  }
  return { prefix, suffix, keys, vals };
}

/** The full wire string a set of segments stands for. */
export function segmentsToText(s: Segments): string {
  const parts: string[] = [s.prefix, '{'];
  for (let i = 0; i < s.keys.length; i++) {
    const key = s.keys[i];
    const v = s.vals.get(key);
    if (v === undefined) throw new Error(`segments: key ${key} has no value`);
    if (i > 0) parts.push(',');
    parts.push(JSON.stringify(key), ':');
    if (v.kind === 'a') {
      parts.push(v.text);
    } else {
      parts.push('[');
      for (let j = 0; j < v.ids.length; j++) {
        if (j > 0) parts.push(',');
        parts.push(v.texts.get(v.ids[j]) as string);
      }
      parts.push(']');
    }
  }
  parts.push('}', s.suffix);
  return parts.join('');
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Encode `next` as a delta against `base` (null = keyframe). `fid`/`baseFid` ride in the header. */
export function encodeDelta(next: Segments, base: Segments | null, fid: number, baseFid: number): string {
  const ops: unknown[] = [];
  const lines: string[] = [];
  for (const key of next.keys) {
    const v = next.vals.get(key) as SegValue;
    const b = base?.vals.get(key);
    if (v.kind === 'a') {
      if (b !== undefined && b.kind === 'a' && b.text === v.text) continue;
      ops.push(['a', key]);
      lines.push(v.text);
      continue;
    }
    const bTexts = b !== undefined && b.kind === 'e' ? b.texts : null;
    const bIds = b !== undefined && b.kind === 'e' ? b.ids : [];
    const removed: WireId[] = [];
    for (const id of bIds) if (!v.texts.has(id)) removed.push(id);
    const upserts: WireId[] = [];
    for (const id of v.ids) {
      const t = v.texts.get(id) as string;
      if (bTexts !== null && bTexts.get(id) === t) continue;
      upserts.push(id);
      lines.push(t);
    }
    // The order the receiver derives on its own: the base order without the removed ids, then the
    // ids new to this frame in frame order. Only a different order is sent.
    let natural = true;
    {
      let i = 0;
      for (const id of bIds) {
        if (!v.texts.has(id)) continue;
        if (v.ids[i] !== id) { natural = false; break; }
        i++;
      }
      if (natural) {
        for (const id of v.ids) {
          if (bTexts !== null && bTexts.has(id)) continue;
          if (v.ids[i] !== id) { natural = false; break; }
          i++;
        }
      }
    }
    if (removed.length === 0 && upserts.length === 0 && natural && b !== undefined && b.kind === 'e') continue;
    ops.push(natural ? ['e', key, removed, upserts] : ['e', key, removed, upserts, v.ids]);
  }
  const header: Record<string, unknown> = { f: fid, b: base === null ? 0 : baseFid };
  if (base === null || !sameKeys(base.keys, next.keys)) header.k = next.keys;
  header.c = ops;
  return [JSON.stringify(header), next.prefix, next.suffix, ...lines].join('\n');
}

/** The header of a delta text — read first so a duplicate or base-less frame costs no splice. */
export interface DeltaHeader {
  readonly fid: number;
  readonly baseFid: number;
}

function isWireId(v: unknown): v is WireId {
  return (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
}

/** Parse only line 0. Null on anything malformed. */
export function readDeltaHeader(text: string): DeltaHeader | null {
  const nl = text.indexOf('\n');
  if (nl < 0) return null;
  let h: unknown;
  try {
    h = JSON.parse(text.slice(0, nl));
  } catch {
    return null;
  }
  if (h === null || typeof h !== 'object') return null;
  const { f, b } = h as { f?: unknown; b?: unknown };
  if (typeof f !== 'number' || !Number.isInteger(f) || f <= 0) return null;
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= f) return null;
  return { fid: f, baseFid: b };
}

/**
 * Rebuild the segments a delta stands for. `base` must be the frame named by its header (null for a
 * keyframe, `b === 0`). Throws a descriptive Error on ANY inconsistency — the caller drops the frame
 * and asks for a keyframe; a frame from a host is untrusted input.
 */
export function applyDelta(text: string, base: Segments | null): Segments {
  const lines = text.split('\n');
  if (lines.length < 3) throw new Error('delta: truncated');
  const h = JSON.parse(lines[0]) as { b?: unknown; k?: unknown; c?: unknown };
  if (h === null || typeof h !== 'object') throw new Error('delta: bad header');
  if ((h.b === 0) !== (base === null)) throw new Error('delta: base mismatch');
  if (!Array.isArray(h.c)) throw new Error('delta: no ops');
  let keys: readonly string[];
  if (h.k !== undefined) {
    if (!Array.isArray(h.k) || !h.k.every((k) => typeof k === 'string')) throw new Error('delta: bad keys');
    if (new Set(h.k).size !== h.k.length) throw new Error('delta: duplicate keys');
    keys = h.k as string[];
  } else {
    if (base === null) throw new Error('delta: keyframe without keys');
    keys = base.keys;
  }
  const prefix = lines[1];
  const suffix = lines[2];
  if (!prefix.endsWith(SNAPSHOT_MARK)) throw new Error('delta: bad envelope');
  let next = 3;
  const take = (): string => {
    if (next >= lines.length) throw new Error('delta: missing payload line');
    return lines[next++];
  };
  const vals = new Map<string, SegValue>();
  const keySet = new Set(keys);
  for (const op of h.c as unknown[]) {
    if (!Array.isArray(op) || typeof op[1] !== 'string') throw new Error('delta: bad op');
    const key = op[1];
    if (!keySet.has(key)) throw new Error(`delta: op for absent key ${key}`);
    if (vals.has(key)) throw new Error(`delta: two ops for ${key}`);
    if (op[0] === 'a') {
      vals.set(key, { kind: 'a', text: take() });
      continue;
    }
    if (op[0] !== 'e') throw new Error('delta: unknown op');
    const removed = op[2];
    const upserts = op[3];
    const order = op[4];
    if (!Array.isArray(removed) || !removed.every(isWireId)) throw new Error('delta: bad removed');
    if (!Array.isArray(upserts) || !upserts.every(isWireId)) throw new Error('delta: bad upserts');
    const b = base?.vals.get(key);
    const bIds = b !== undefined && b.kind === 'e' ? b.ids : [];
    const texts = new Map<WireId, string>(b !== undefined && b.kind === 'e' ? b.texts : []);
    for (const id of removed as WireId[]) {
      if (!texts.delete(id)) throw new Error(`delta: removing absent id ${String(id)} from ${key}`);
    }
    if (new Set(upserts as WireId[]).size !== (upserts as WireId[]).length) throw new Error('delta: duplicate upsert');
    const fresh: WireId[] = [];
    for (const id of upserts as WireId[]) {
      if (!texts.has(id)) fresh.push(id);
      texts.set(id, take());
    }
    let ids: WireId[];
    if (order !== undefined) {
      if (!Array.isArray(order) || !order.every(isWireId)) throw new Error('delta: bad order');
      if (order.length !== texts.size || new Set(order).size !== order.length) throw new Error('delta: order size');
      for (const id of order as WireId[]) if (!texts.has(id)) throw new Error('delta: order names an absent id');
      ids = order as WireId[];
    } else {
      const removedSet = new Set(removed as WireId[]);
      ids = [];
      for (const id of bIds) if (!removedSet.has(id)) ids.push(id);
      for (const id of fresh) ids.push(id);
    }
    if (ids.length === 0) throw new Error(`delta: empty collection ${key}`);
    vals.set(key, { kind: 'e', ids, texts });
  }
  if (next !== lines.length) throw new Error('delta: trailing payload lines');
  for (const key of keys) {
    if (vals.has(key)) continue;
    const b = base?.vals.get(key);
    if (b === undefined) throw new Error(`delta: no value for ${key}`);
    vals.set(key, b);
  }
  return { prefix, suffix, keys, vals };
}

// ── compression (A) ────────────────────────────────────────────────────────────────────────────

/** The `CompressionStream` format. `deflate` (zlib-wrapped) has the widest support (Chrome 80+). */
const DEFLATE_FORMAT = 'deflate';

/** True when this browser can INFLATE a frame — what a joiner advertises in its ack. */
export function canInflate(): boolean {
  return typeof DecompressionStream === 'function' && typeof Response === 'function';
}

/** True when this browser can DEFLATE a frame. */
export function canDeflate(): boolean {
  return typeof CompressionStream === 'function' && typeof Response === 'function';
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Build a binary frame from a delta text. `compress` true needs `canDeflate()`. */
export async function packFrame(text: string, compress: boolean): Promise<Uint8Array> {
  const utf8 = encoder.encode(text);
  if (!compress) {
    const out = new Uint8Array(utf8.byteLength + 1);
    out[0] = FRAME_TEXT;
    out.set(utf8, 1);
    return out;
  }
  const stream = new Blob([utf8]).stream().pipeThrough(new CompressionStream(DEFLATE_FORMAT));
  const deflated = new Uint8Array(await new Response(stream).arrayBuffer());
  const out = new Uint8Array(deflated.byteLength + 1);
  out[0] = FRAME_DEFLATE;
  out.set(deflated, 1);
  return out;
}

/** Read a binary frame back into its delta text. Throws on an unknown format, bad deflate or a bomb. */
export async function unpackFrame(frame: Uint8Array): Promise<string> {
  if (frame.byteLength < 1) throw new Error('frame: empty');
  const body = frame.subarray(1);
  if (frame[0] === FRAME_TEXT) return decoder.decode(body);
  if (frame[0] !== FRAME_DEFLATE) throw new Error(`frame: unknown format ${frame[0]}`);
  if (!canInflate()) throw new Error('frame: cannot inflate here');
  const reader = new Blob([body as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream(DEFLATE_FORMAT)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INFLATED_BYTES) {
      void reader.cancel();
      throw new Error('frame: inflates past MAX_INFLATED_BYTES');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return decoder.decode(all);
}

// ── policy (used by transport.ts) ──────────────────────────────────────────────────────────────

/**
 * ⚠ MINE — the kill switch. `false` sends every snapshot the pre-S195 way (one JSON string on the
 * `msg` action). Both peers of a match must agree, which PROTOCOL_VERSION already guarantees.
 */
export const SNAPSHOT_CODEC_ENABLED = true;

/**
 * ⚠ MINE (measured, S195 net-delta) — a full keyframe at least every this many snapshots per peer
 * even while acks flow. Correctness does not need it (every delta names an ACKNOWLEDGED base, and a
 * receiver missing a base asks for a keyframe); it bounds how long any undiscovered defect could
 * keep a joiner's board wrong. 100 = 10 s at 10 Hz: at wave 10 a keyframe is ~22 KiB deflated vs a
 * ~4 KiB delta, so it costs ~5 % of the stream (see the progress file's table).
 */
export const KEYFRAME_INTERVAL = 100;

/** Frames the HOST remembers to delta against (3.2 s at 10 Hz). An older ack ⇒ keyframe. */
export const HOST_RING = 32;

/** Frames a JOINER remembers per sender. Larger than HOST_RING, so an ack the host can use is held. */
export const JOINER_RING = 64;

/**
 * ⚠ MINE (S196 joiner-desync audit MED-1) — the most frames one sender may have INFLATING at once on a receiver.
 * Inflates start on arrival (concurrently, the lag fix), so without a cap a burst of tiny deflate bombs would all
 * expand at once — up to MAX_INFLATED_BYTES each. Beyond the cap only the NEWEST not-yet-started frame is held;
 * the rest are superseded unread. Only the latched snapshot AUTHORITY is ever inflated (`onSnapFrame`), so this
 * bounds what the host itself can cost a joiner: 16 × 2 MiB = 32 MiB worst case (the unbounded 500-frame burst
 * was ~1 GB).
 * ⛔ MEASURED, NOT GUESSED — 4 WAS TOO FEW. A throttled joiner (CPU 6×, ~2 fps, `live-joiner-lag.mjs`) needs its
 * inflates to OVERLAP: each one waits on the main thread for several hops, so throughput is concurrency ÷ latency.
 * The uncapped run peaked at 14 queued and stayed flat; with a cap of 4 the joiner went seconds without an apply,
 * tripped HOST SNAPSHOT STARVATION, and in one run took over as host (trace `S196_joiner-desync_lag-FIXROUND-
 * cap4-RED.jsonl`). 16 sits above the measured 14.
 */
export const MAX_INFLATING_PER_SENDER = 16;

/** ⚠ MINE — the fastest a joiner re-asks one sender for a keyframe while it has no usable base. */
export const KEY_REQUEST_MIN_MS = 500;

/**
 * The ack a joiner returns on the `sack` action, targeted to the sender. `f` = the frame it rebuilt
 * (0 = none: a capability hello or a pure keyframe request), `z` = 1 when it can inflate, `k` = 1 to
 * ask for a keyframe. Parsed fail-closed.
 */
export interface SnapAck {
  readonly f: number;
  readonly z: boolean;
  readonly k: boolean;
}

export function parseSnapAck(data: unknown): SnapAck | null {
  if (typeof data !== 'string' || data.length > 200) return null;
  let o: unknown;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  if (o === null || typeof o !== 'object') return null;
  const { f, z, k } = o as { f?: unknown; z?: unknown; k?: unknown };
  if (typeof f !== 'number' || !Number.isInteger(f) || f < 0) return null;
  return { f, z: z === 1, k: k === 1 };
}

export function buildSnapAck(f: number, k: boolean): string {
  return JSON.stringify({ f, z: canInflate() ? 1 : 0, ...(k ? { k: 1 } : {}) });
}
