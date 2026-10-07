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
import { MAX_INFLATING_PER_SENDER, encodeDelta, packFrame, segmentSnapshotMessage } from './snapshotCodec.ts';
import { NetTransport } from './transport.ts';
import { wireNumberReplacer } from '../state/save.ts';
import { runHostTick } from '../state/hostTick.ts';
import { startC5Match } from '../state/c5WaveFiveBoard.fixtures.ts';
import { HostSync } from './sync.ts';

const gate = { manual: false, started: 0, waiting: [] as Array<{ text: string; go: () => void }> };
vi.mock('./snapshotCodec.ts', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./snapshotCodec.ts')>();
  return {
    ...orig,
    unpackFrame: async (f: Uint8Array): Promise<string> => {
      if (!gate.manual) return orig.unpackFrame(f);
      gate.started++;
      const text = await orig.unpackFrame(f);
      await new Promise<void>((resolve) => gate.waiting.push({ text, go: resolve }));
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
  for (const w of go) w.go();
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
    // Optional-called so this file still RUNS against the pre-fix transport (the mutation check in the progress file).
    superseded: (p.joiner as Partial<Pick<NetTransport, 'snapRxStats'>>).snapRxStats?.().superseded ?? -1,
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
    // (a header's base must be < its fid, or it is malformed rather than base-less — hence fids past 99)
    expect(NetTransport.pickSnapFrame([t(105, 0), t(106, 99)], 104, holds([103]))).toBe(0);
    expect(NetTransport.pickSnapFrame([t(106, 99)], 104, holds([103]))).toBe(-1);
  });
});

// 80 real deflates + inflates per case: ~2 s alone, past vitest's 20 s default under a loaded 3-worker suite.
// Deterministic (no wall clock in any assertion), so a longer budget changes nothing it proves.
describe('S196 joiner-desync — REACH: host → codec → slow, impaired joiner', { timeout: 120_000 }, () => {
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
      const parked = gate.waiting.splice(0);
      gate.started = 0;
      const isBogus = (w: { text: string }): boolean => w.text.startsWith('{"f":1000000,');
      parked.find(isBogus)!.go(); // the bogus delta becomes ready FIRST
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(got, 'nothing applied while the keyframe is still inflating').toEqual([]);
      parked.find((w) => !isBogus(w))!.go();
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

/*
 * ⭐ S196 PLAYTEST-2 lead ("existing creatures FROZEN on the joiner for 30 s while new entities still land"): the
 * same freeze shows on the HOST in a real bots match, in every BUILD phase and only there — the sim parks creatures
 * through BUILD and stages the next wave's births (SPAWNING, ticksInState 0) — measured by a probe recorded in the
 * progress file. So the dumps describe BUILD, not the wire. This case pins the wire half anyway: during FIGHT, the
 * changes to EXISTING creatures (pos, state, ticksInState) reach a slow joiner through deltas, frame after frame.
 */
describe('S196 joiner-desync — REACH: existing creatures keep moving on a slow joiner during FIGHT', { timeout: 300_000 }, () => {
  it('every applied snapshot carries the host’s creatures exactly, the joiner stays within 4 frames, and EXISTING creatures do change', async () => {
    const { world: w, bots, deps, state } = startC5Match(false);
    while (w.tick < 5_500) { bots.tick(w); runHostTick(w, deps, state); } // into wave 1's FIGHT
    expect(w.matchPhase).toBe('FIGHT');
    const p = await slowJoinerPair();
    const sync = new HostSync();
    const hostCreatures = new Map<number, string>();
    let applied: { seq: number; creatures: string } | null = null;
    let prevApplied: Map<number, string> | null = null;
    let changedExisting = 0;
    p.joiner.on((m) => {
      if (m.kind !== 'NETSNAPSHOT') return;
      const cs = ((m.snapshot as unknown as { creatures?: Array<{ id: number }> }).creatures ?? []);
      applied = { seq: m.snapshotSeq, creatures: JSON.stringify(cs) };
      const now = new Map(cs.map((c) => [c.id, JSON.stringify(c)] as const));
      if (prevApplied !== null) for (const [id, t] of now) if (prevApplied.has(id) && prevApplied.get(id) !== t) changedExisting++;
      prevApplied = now;
    });
    try {
      let seq = 0;
      let pendingAcks: string[] = [];
      for (let frame = 1; frame <= 120; frame++) {
        for (let k = 0; k < 6; k++) { bots.tick(w); runHostTick(w, deps, state); }
        const msg = sync.buildSnapshotMessage(w, 0, 'm.1');
        seq = msg.snapshotSeq;
        hostCreatures.set(seq, JSON.stringify(JSON.parse(JSON.stringify(msg.snapshot, wireNumberReplacer)).creatures ?? []));
        const before = p.hostRoom.actions.get('snap')!.sent.length;
        p.host.send(msg);
        await until(() => p.hostRoom.actions.get('snap')!.sent.length > before, 'host transmitted');
        for (const f of p.takeFrames()) p.deliverFrame(f);
        if (frame % 2 === 0) {
          await renderTurn();
          for (const a of pendingAcks) p.deliverAck(a);
          pendingAcks = p.takeAcks();
          const a = applied as { seq: number; creatures: string } | null;
          expect(a).not.toBeNull();
          expect(seq - a!.seq).toBeLessThanOrEqual(4);
          expect(a!.creatures, `seq ${a!.seq}: the joiner's creatures differ from the host's`).toBe(hostCreatures.get(a!.seq));
        }
      }
      expect(w.matchPhase).toBe('FIGHT');
      // Anti-vacuity: modifications to EXISTING creatures genuinely flowed (not just additions).
      expect(changedExisting).toBeGreaterThan(20);
    } finally {
      gate.manual = false;
    }
  });
});

/*
 * ⛔ S196 FIX ROUND — the independent audit of this tree.
 *   MED-1: inflates start on arrival, so (a) nobody but the snapshot authority is ever inflated, and (b) one sender
 *          has at most MAX_INFLATING_PER_SENDER in flight, the newest extra frame held.
 *   LOW-2: "newest" is the highest frame id, not the latest arrival.
 *   LOW-3: a disconnect while frames are inflating delivers nothing afterwards.
 */
describe('S196 joiner-desync audit — inflate is bounded and authority-only; newest = highest fid; disconnect drops in-flight', { timeout: 120_000 }, () => {
  /** Release turns until everything from H is applied or dropped. */
  async function settle(p: LinkedPair): Promise<void> {
    let done = false;
    void p.joiner.snapFramesSettled('H').then(() => { done = true; });
    for (let i = 0; i < 100 && !done; i++) await renderTurn();
    expect(done, 'settled').toBe(true);
  }
  const seqsOf = (p: LinkedPair): number[] => {
    const got: number[] = [];
    p.joiner.on((m) => { if (m.kind === 'NETSNAPSHOT') got.push(m.snapshotSeq); });
    return got;
  };

  it('MED-1(b) — 50 deflate bombs from the authority: never more than MAX_INFLATING_PER_SENDER in flight, and the newest legitimate frame still applies', async () => {
    const p = await slowJoinerPair();
    const got = seqsOf(p);
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const bomb = await packFrame('a'.repeat(1 << 20), true); // 1 MiB of text in ~1 KiB
      expect(bomb.byteLength).toBeLessThan(8 * 1024);
      for (let i = 0; i < 50; i++) p.deliverFrame(bomb);
      p.host.send(snap(1));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 0, 'keyframe sent');
      p.deliverFrame(p.takeFrames()[0]!);
      await until(() => gate.waiting.length === gate.started, 'parked');
      expect(gate.started, 'inflates actually started').toBe(MAX_INFLATING_PER_SENDER);
      await settle(p);
      const st = p.joiner.snapRxStats();
      expect(st.maxInflating).toBeLessThanOrEqual(MAX_INFLATING_PER_SENDER);
      expect(MAX_INFLATING_PER_SENDER).toBeLessThan(50); // the burst genuinely exceeds the cap
      // 51 arrivals: MAX inflated, every later one but the newest (the real keyframe, held) superseded unread.
      expect(st.superseded).toBe(51 - MAX_INFLATING_PER_SENDER - 1);
      expect(got).toEqual([1]);
    } finally {
      quiet.mockRestore();
      gate.manual = false;
    }
  });

  it('MED-1(a) — a sender that is NOT the snapshot authority is never inflated (joiner: a stranger; host: everyone)', async () => {
    const p = await slowJoinerPair();
    const got = seqsOf(p);
    try {
      const evil = await packFrame('a'.repeat(1 << 20), true);
      for (let i = 0; i < 50; i++) p.joinerRoom.actions.get('snap')!.onMessage!(evil, { peerId: 'EVIL' });
      // On the host `session.hostPeerId` is null, so nobody is the authority.
      p.host.isSnapshotAuthority = () => false;
      p.hostRoom.actions.get('snap')!.onMessage!(evil, { peerId: 'J' });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(gate.started, 'not one inflate began').toBe(0);
      expect(p.joiner.snapRxStats().refused).toBe(50);
      expect(p.host.snapRxStats().refused).toBe(1);
      expect(got).toEqual([]);
      // ⛔ NEGATIVE — the authority's own frames still flow.
      p.host.send(snap(1));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 0, 'keyframe sent');
      p.deliverFrame(p.takeFrames()[0]!);
      await settle(p);
      expect(got).toEqual([1]);
    } finally {
      gate.manual = false;
    }
  });

  it('LOW-2 — frames delivered as [newer, older] in one turn apply the NEWER (highest fid), not the later arrival', async () => {
    const p = await slowJoinerPair();
    const got = seqsOf(p);
    try {
      p.host.send(snap(1));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 0, 'k1');
      const [older] = p.takeFrames();
      p.host.send(snap(2));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 1, 'k2');
      const [newer] = p.takeFrames();
      p.deliverFrame(newer!);
      p.deliverFrame(older!);
      await settle(p);
      expect(got).toEqual([2]);
    } finally {
      gate.manual = false;
    }
  });

  it('LOW-3 — a disconnect while frames are still inflating: nothing reaches the handlers afterwards', async () => {
    const p = await slowJoinerPair();
    const got = seqsOf(p);
    try {
      p.host.send(snap(1));
      await until(() => p.hostRoom.actions.get('snap')!.sent.length > 0, 'k1');
      p.deliverFrame(p.takeFrames()[0]!);
      await until(() => gate.waiting.length === gate.started && gate.started === 1, 'parked');
      p.joiner.disconnect();
      await renderTurn();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(got).toEqual([]);
      // ⛔ NEGATIVE (anti-vacuity) — the same frame with no disconnect is applied.
      const q = await slowJoinerPair();
      const got2 = seqsOf(q);
      q.host.send(snap(1));
      await until(() => q.hostRoom.actions.get('snap')!.sent.length > 0, 'k1b');
      q.deliverFrame(q.takeFrames()[0]!);
      await settle(q);
      expect(got2).toEqual([1]);
    } finally {
      gate.manual = false;
    }
  });
});
