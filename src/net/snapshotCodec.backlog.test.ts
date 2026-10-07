/**
 * ⛔⛔ S196 (joiner-desync, owner playtest R196-P1) — THE JOINER MUST NOT FALL BEHIND THE HOST.
 *
 * Mark (P2, remote joiner) placed six buildings he never saw, kept seeing 100 / 2,500 for ~45 s after the host had
 * spent it, and could not build with shapes he had. Measured in two real Chromium pages over WebRTC
 * (`scripts/live-mp/live-joiner-lag.mjs`): the joiner's applied tick fell behind the host WITHOUT BOUND (1.6 s →
 * 25 s and climbing) because S195's receive path decoded every frame through ONE serial promise chain — frame N+1's
 * inflate could not start until frame N was applied, and each inflate waits on the joiner's main thread for several
 * task hops. Fix (`transport.ts` onSnapFrame / drainSnapFrames): inflate starts on ARRIVAL, concurrently, and only
 * the NEWEST rebuildable frame is applied.
 *
 * THE MODEL. A real inflate settles on the thread pool, so a unit test cannot be slow the way a busy browser is.
 * `unpackFrame` is wrapped so every inflate, once its bytes are ready, WAITS FOR A MAIN-THREAD TURN (`gate`), and the
 * test hands out turns explicitly: one `renderTurn()` = one joiner frame, in which every inflate waiting for the
 * main thread advances — exactly what a browser does. Deterministic: no wall clock anywhere.
 */
import { describe, expect, it, vi } from 'vitest';
import type { NetMessage, NetSnapshotMsg } from './protocol.ts';
import { linkedPair, prng, until, type LinkedPair } from './snapshotCodec.fixtures.ts';
import { encodeDelta, packFrame, segmentSnapshotMessage } from './snapshotCodec.ts';
import { NetTransport } from './transport.ts';
import { wireNumberReplacer } from '../state/save.ts';

const gate = { manual: false, started: 0, waiting: [] as Array<() => void> };
vi.mock('./snapshotCodec.ts', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./snapshotCodec.ts')>();
  return {
    ...orig,
    unpackFrame: async (f: Uint8Array): Promise<string> => {
      if (!gate.manual) return orig.unpackFrame(f);
      gate.started++;
      const text = await orig.unpackFrame(f);
      await new Promise<void>((resolve) => gate.waiting.push(resolve));
      return text;
    },
  };
});

/** One joiner main-thread turn: every inflate that has reached the main thread completes, then the turn's work runs. */
async function renderTurn(): Promise<void> {
  // Let every STARTED inflate finish its thread-pool part and park at the gate.
  await until(() => gate.waiting.length === gate.started, 'started inflates parked');
  const go = gate.waiting.splice(0);
  gate.started -= go.length;
  for (const r of go) r();
  for (let i = 0; i < 20; i++) await Promise.resolve(); // the turn's microtasks (drain, apply, ack)
}

/** A snapshot shaped like the real one where it matters: a structure family + a per-seat bank. */
function snap(seq: number, opts: { tower?: boolean; bank?: number } = {}): NetSnapshotMsg {
  const primitives = [];
  for (let i = 1; i <= 120; i++) primitives.push({ id: i, type: i % 6, pos: { x: 100 + i + seq * 0.5 * (i % 3), y: 200 + (i % 17) }, radius: 8 });
  const structures = [{ id: 500, kind: 'castle', seat: 0 }];
  if (opts.tower === true) structures.push({ id: 900, kind: 'stink', seat: 1 });
  return {
    kind: 'NETSNAPSHOT',
    snapshotSeq: seq,
    snapshot: {
      schemaVersion: 1,
      tick: seq * 6,
      primitives,
      structures,
      players: [{ id: 0, bank: 0 }, { id: 1, bank: opts.bank ?? 100 }],
    } as never,
    matchId: 'm.1',
  };
}

interface Run {
  readonly maxLagFrames: number;
  readonly lagAtEnd: number;
  readonly applied: number[];
  readonly towerSeenAfterTurns: number | null;
  readonly superseded: number;
}

/**
 * The opening of the owner's match, on a SLOW joiner (`perTurn` snapshots arrive per joiner frame — 2 = a 5 fps
 * joiner against the host's 10 Hz), over an impaired link: `loss` of frames lost, acks returned one turn late (the
 * round trip). At snapshot `placeAt` the host's board holds the joiner's freshly placed tower and its spent bank.
 */
async function runOpening(p: LinkedPair, opts: { frames: number; perTurn: number; loss: number; placeAt: number }): Promise<Run> {
  const got: number[] = [];
  let towerAt: number | null = null;
  let turns = 0;
  let placedTurn: number | null = null;
  p.joiner.on((m: NetMessage) => {
    if (m.kind !== 'NETSNAPSHOT') return;
    got.push(m.snapshotSeq);
    const s = m.snapshot as unknown as { structures: Array<{ id: number }>; players: Array<{ id: number; bank: number }> };
    if (towerAt === null && s.structures.some((x) => x.id === 900) && s.players[1]!.bank === 0) towerAt = turns;
  });
  const rnd = prng(196);
  let pendingAcks: string[] = [];
  let maxLag = 0;
  for (let seq = 1; seq <= opts.frames; seq++) {
    const placed = seq >= opts.placeAt;
    if (seq === opts.placeAt) placedTurn = turns;
    const before = p.hostRoom.actions.get('snap')!.sent.length;
    p.host.send(snap(seq, { tower: placed, bank: placed ? 0 : 100 }));
    await until(() => p.hostRoom.actions.get('snap')!.sent.length > before, 'host transmitted');
    for (const f of p.takeFrames()) if (rnd() >= opts.loss) p.deliverFrame(f);
    if (seq % opts.perTurn === 0) {
      await renderTurn();
      turns++;
      for (const a of pendingAcks) p.deliverAck(a); // one turn of round trip
      pendingAcks = p.takeAcks();
      maxLag = Math.max(maxLag, seq - (got.at(-1) ?? 0));
    }
  }
  return {
    maxLagFrames: maxLag,
    lagAtEnd: opts.frames - (got.at(-1) ?? 0),
    applied: got,
    towerSeenAfterTurns: towerAt === null || placedTurn === null ? null : towerAt - placedTurn,
    superseded: p.joiner.snapRxStats().superseded,
  };
}

async function slowJoinerPair(): Promise<LinkedPair> {
  const p = linkedPair();
  for (const a of p.takeAcks()) p.deliverAck(a); // the joiner's capability hello (z=1)
  gate.manual = true;
  gate.started = 0;
  gate.waiting.length = 0;
  return p;
}

describe('S196 joiner-desync — the decision: pickSnapFrame', () => {
  const t = (f: number, b: number): { done: boolean; text: string } => ({ done: true, text: `${JSON.stringify({ f, b })}\n` });
  const holds = (set: number[]) => (fid: number) => set.includes(fid);

  it('picks the NEWEST frame it can rebuild — a keyframe or a delta on a held base', () => {
    expect(NetTransport.pickSnapFrame([t(5, 0), t(6, 3), t(7, 3)], 4, holds([3]))).toBe(2);
    expect(NetTransport.pickSnapFrame([t(5, 3), t(6, 0)], 4, holds([3]))).toBe(1);
  });

  it('skips a frame still inflating, an undecodable one, and one already applied (fid ≤ lastFid)', () => {
    expect(NetTransport.pickSnapFrame([t(5, 0), { done: false, text: null }], 4, holds([]))).toBe(0);
    expect(NetTransport.pickSnapFrame([t(5, 0), { done: true, text: null }], 4, holds([]))).toBe(0);
    expect(NetTransport.pickSnapFrame([t(3, 0), t(4, 0)], 4, holds([]))).toBe(-1);
  });

  it('⛔ NEGATIVE — a newer delta whose base is NOT held never wins over an older rebuildable frame', () => {
    expect(NetTransport.pickSnapFrame([t(5, 0), t(6, 99)], 4, holds([3]))).toBe(0);
    expect(NetTransport.pickSnapFrame([t(6, 99)], 4, holds([3]))).toBe(-1);
  });
});

describe('S196 joiner-desync — REACH: host → codec → slow, impaired joiner', () => {
  it('a 5 fps joiner on a lossy, delayed link stays within a few frames of the host, and sees its own tower + spent bank within ~1 s', async () => {
    const p = await slowJoinerPair();
    try {
      const r = await runOpening(p, { frames: 80, perTurn: 2, loss: 0.02, placeAt: 30 });
      // ⛔ The S195 serial chain applied ONE frame per turn here, so the lag grew by one frame every turn: 40 frames
      // (4 s of play) behind by the end, ~45 s after four minutes. Bounded now: what arrived is applied next turn.
      expect(r.maxLagFrames, `applied ${r.applied.join(',')}`).toBeLessThanOrEqual(4);
      expect(r.lagAtEnd).toBeLessThanOrEqual(4);
      // The owner's symptoms: P2's own building and his spent bank. ≤ 3 joiner frames at 5 fps = 0.6 s.
      expect(r.towerSeenAfterTurns).not.toBeNull();
      expect(r.towerSeenAfterTurns!).toBeLessThanOrEqual(3);
      // Never out of order, never twice.
      for (let i = 1; i < r.applied.length; i++) expect(r.applied[i]!).toBeGreaterThan(r.applied[i - 1]!);
    } finally {
      gate.manual = false;
    }
  });

  it('LATEST WINS: when several frames are ready in one turn only the newest is applied — the rest are superseded unapplied', async () => {
    const p = await slowJoinerPair();
    try {
      const r = await runOpening(p, { frames: 60, perTurn: 3, loss: 0, placeAt: 20 });
      expect(r.superseded).toBeGreaterThan(0);
      // One apply per turn (plus the odd keyframe request), not one per frame: 20 turns, not 60 applies.
      expect(r.applied.length).toBeLessThanOrEqual(25);
      expect(r.applied.at(-1)).toBe(60);
      expect(r.towerSeenAfterTurns!).toBeLessThanOrEqual(2);
    } finally {
      gate.manual = false;
    }
  });

  it('⛔ NEGATIVE — a delta on a base the joiner does not hold, ready BEFORE an older keyframe, cannot discard that keyframe', async () => {
    const p = await slowJoinerPair();
    const got: number[] = [];
    p.joiner.on((m) => { if (m.kind === 'NETSNAPSHOT') got.push(m.snapshotSeq); });
    try {
      p.host.send(snap(1));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 0, 'keyframe sent');
      const [key] = p.takeFrames();
      // A delta naming base 999 — a frame this joiner never had.
      const s2 = segmentSnapshotMessage(snap(2) as never, wireNumberReplacer)!;
      const bogus = await packFrame(encodeDelta(s2, s2, 1_000_000, 999), false);
      p.deliverFrame(key!);
      p.deliverFrame(bogus);
      await until(() => gate.waiting.length === gate.started, 'both parked');
      const [kRelease, dRelease] = gate.waiting.splice(0);
      gate.started = 0;
      dRelease!(); // the bogus delta becomes ready FIRST
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(got, 'nothing applied while the keyframe is still inflating').toEqual([]);
      kRelease!();
      await p.joiner.snapFramesSettled('H');
      expect(got).toEqual([1]);
      const acks = p.takeAcks().map((a) => JSON.parse(a) as { f: number; k?: number });
      expect(acks.some((a) => a.k === 1), 'the bogus delta asks for a keyframe').toBe(true);
      expect(acks.some((a) => a.f > 0), 'the keyframe is acked').toBe(true);
    } finally {
      gate.manual = false;
    }
  });
});
