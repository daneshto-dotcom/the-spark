/**
 * SPARK — S195 (net-delta) TEST-ONLY FIXTURES: two REAL `NetTransport`s joined by an in-memory "room".
 *
 * Each transport is started through its own private `startStrategy` with a fake Trystero room, so the
 * actions it binds (`msg`, `snap`, `sack`), its `onPeerJoin` and its `onMessage` closures are the
 * production wiring — the fixture only decides WHEN a frame or an ack crosses, and whether it is lost.
 * ⛔ Never imported by production code (`.fixtures.ts` convention).
 */
import { NetTransport } from './transport.ts';

export interface FakeAction {
  onMessage: ((data: unknown, ctx: { peerId: string }) => void) | null;
  readonly sent: Array<{ data: unknown; target: string | undefined }>;
  send: (data: unknown, opts?: { target?: string }) => Promise<void>;
}

export interface FakeRoom {
  readonly actions: Map<string, FakeAction>;
  readonly room: Record<string, unknown> & { onPeerJoin: (id: string) => void; onPeerLeave: (id: string) => void };
}

export function fakeRoom(): FakeRoom {
  const actions = new Map<string, FakeAction>();
  const room = {
    onPeerJoin: (_id: string): void => {},
    onPeerLeave: (_id: string): void => {},
    getPeers: () => ({}),
    leave: () => Promise.resolve(),
    makeAction: (name: string) => {
      const a: FakeAction = {
        onMessage: null,
        sent: [],
        send(data, opts) {
          a.sent.push({ data, target: opts?.target });
          return Promise.resolve();
        },
      };
      actions.set(name, a);
      return a;
    },
  };
  return { actions, room };
}

export function startedTransport(r: FakeRoom, code = 'ROOMCODEC'): NetTransport {
  const t = new NetTransport();
  const priv = t as unknown as {
    connected: boolean;
    startStrategy: (name: string, code: string, joinFn: () => unknown, relays: string[], sockets: null) => void;
  };
  priv.connected = true;
  priv.startStrategy('nostr', code, () => r.room, [], null);
  return t;
}

/** Spin the event loop until `cond()` holds (deflate/inflate settle on the thread pool). */
export async function until(cond: () => boolean, label: string, maxSpins = 2000): Promise<void> {
  for (let i = 0; i < maxSpins; i++) {
    if (cond()) return;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  throw new Error(`until: ${label} never held`);
}

/** Deterministic PRNG for the lossy-link schedule (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A host and a joiner in one fake room. `H` and `J` are the peer ids each sees the other as. The
 * caller moves traffic with `deliverFrames` / `deliverAcks`; nothing crosses on its own, so a test can
 * lose, delay or reorder exactly what it means to.
 */
export interface LinkedPair {
  readonly host: NetTransport;
  readonly joiner: NetTransport;
  readonly hostRoom: FakeRoom;
  readonly joinerRoom: FakeRoom;
  /** Strings the joiner's receive path was handed (rebuilt snapshots and plain messages). */
  readonly rawSeen: string[];
  /** Frames the host has sent and the test has not yet consumed. */
  takeFrames(): Uint8Array[];
  /** Acks the joiner has sent and the test has not yet consumed. */
  takeAcks(): string[];
  deliverFrame(f: Uint8Array): void;
  deliverAck(a: string): void;
}

export function linkedPair(): LinkedPair {
  const hostRoom = fakeRoom();
  const joinerRoom = fakeRoom();
  const host = startedTransport(hostRoom);
  const joiner = startedTransport(joinerRoom);
  // As production wires it (`connectAsClient`): only the latched host's frames may become bases.
  joiner.isSnapshotAuthority = (peerId) => peerId === 'H';
  const rawSeen: string[] = [];
  const orig = joiner.handleRawMessage.bind(joiner);
  joiner.handleRawMessage = (data: string, peerId: string, strategyName = '', countBytes = true): boolean => {
    rawSeen.push(data);
    return orig(data, peerId, strategyName, countBytes);
  };
  hostRoom.room.onPeerJoin('J');
  joinerRoom.room.onPeerJoin('H');
  let framesTaken = 0;
  let acksTaken = 0;
  return {
    host,
    joiner,
    hostRoom,
    joinerRoom,
    rawSeen,
    takeFrames() {
      const sent = hostRoom.actions.get('snap')!.sent;
      const out = sent.slice(framesTaken).map((s) => s.data as Uint8Array);
      framesTaken = sent.length;
      return out;
    },
    takeAcks() {
      const sent = joinerRoom.actions.get('sack')!.sent;
      const out = sent.slice(acksTaken).map((s) => s.data as string);
      acksTaken = sent.length;
      return out;
    },
    deliverFrame(f) {
      joinerRoom.actions.get('snap')!.onMessage!(f, { peerId: 'H' });
    },
    deliverAck(a) {
      hostRoom.actions.get('sack')!.onMessage!(a, { peerId: 'J' });
    },
  };
}
