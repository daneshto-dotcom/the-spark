/**
 * ⛔⛔ S195 (net-delta) — THE ORACLE: over a long REAL match, every snapshot a joiner rebuilds from
 * keyframe + deltas is BYTE-IDENTICAL to the full snapshot the host would have sent, and applying it
 * gives the same `hashWorldState`.
 *
 * REACH: the match is a real four-seat bots match on `runHostTick` (the C5 fixture). Every snapshot is
 * pushed through the REAL `NetTransport.send` on the host and the REAL `snap`/`sack` action closures
 * on both transports (`linkedPair`); the link between them is a deterministic LOSSY schedule — frames
 * dropped, acks dropped and delayed, frames duplicated — so deltas run against stale bases (the newest
 * ACKED frame, often several behind) and periodic keyframes interleave, on a board that grows past 100
 * shapes. ⭐ A lost frame never costs a later one: every delta names a base the joiner ACKNOWLEDGED,
 * so it holds it — `compared === delivered` below is that property, measured.
 *
 * What the oracle compares, per delivered frame:
 *   · the string the joiner's receive path was handed  ===  JSON.stringify(stripWirePrevPos(msg),
 *     wireNumberReplacer) — the exact pre-S195 wire string for that snapshot;
 *   · hashWorldState(client world after applying the rebuilt snapshot) === hashWorldState(client world
 *     after applying the full one), on the same warm client worlds a joiner keeps.
 */
import { describe, expect, it, vi } from 'vitest';

import { runHostTick } from '../state/hostTick.ts';
import { makeWorld } from '../state/world.ts';
import { applyNetSnapshot, netSnapshot, stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import { hashWorldState } from '../state/stateHash.ts';
import { startC5Match } from '../state/c5WaveFiveBoard.fixtures.ts';
import { HostSync } from './sync.ts';
import { linkedPair, prng, until } from './snapshotCodec.fixtures.ts';
import { FRAME_DEFLATE, FRAME_TEXT, readDeltaHeader, unpackFrame } from './snapshotCodec.ts';

/*
 * The win bar is lifted (as in `lagWaveMeasure.test.ts`) so an opt-in long run
 * (`SPARK_CODEC_ORACLE_TICKS=90000`, wave 10) is not cut short by a bot win at wave ~9. It changes
 * nothing before the bar would have been reached, and the codec never reads the score.
 */
vi.mock('../constants.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../constants.ts')>();
  return { ...real, winScoreForWave: () => Number.MAX_SAFE_INTEGER };
});

/**
 * ⚠ How long the match runs: 24 000 ticks = into wave 3's FIGHT (a wave is 9 000 ticks), ~5 000
 * snapshots, a board past 100 shapes, ~70 s. Opt-in longer runs via SPARK_CODEC_ORACLE_TICKS.
 */
const TICKS = Number(process.env.SPARK_CODEC_ORACLE_TICKS ?? 24_000);
/** Production cadence is every 6 ticks (10 Hz); the first stretch snapshots EVERY tick as well. */
const EVERY_TICK_UNTIL = 1_200;

describe('⛔ S195 net-delta — keyframe + deltas rebuild the full snapshot exactly, over a long real match', () => {
  it('byte-identical wire string AND identical hashWorldState for every delivered frame', async () => {
    const { world: w, bots, deps, state } = startC5Match(false);
    const pair = linkedPair();
    const sync = new HostSync();
    const rnd = prng(0x5195);
    const expectedBySeq = new Map<number, string>();
    const clientFull = makeWorld(0);
    const clientDelta = makeWorld(0);
    // Acks in flight: [deliverAtFrame, ack].
    const ackQueue: Array<[number, string]> = [];
    let sentFrames = 0;
    let delivered = 0;
    let keyframes = 0;
    let deltas = 0;
    let deflated = 0;
    let compared = 0;
    let maxPrims = 0;
    let checkedRaw = 0;

    pair.takeAcks(); // the joiner's capability hello on join
    pair.deliverAck(JSON.stringify({ f: 0, z: 1 }));

    while (w.tick < TICKS && (w.gameState as string) === 'PLAYING') {
      bots.tick(w);
      runHostTick(w, deps, state);
      if (w.tick > EVERY_TICK_UNTIL && w.tick % 6 !== 0) continue;
      if (w.tick % 2000 === 0) await new Promise<void>((r) => setImmediate(r));

      const msg = sync.buildSnapshotMessage(w, 0, 'match.1');
      expectedBySeq.set(msg.snapshotSeq, JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer));
      maxPrims = Math.max(maxPrims, msg.snapshot.primitives.length);
      pair.host.send(msg);
      await until(() => pair.hostRoom.actions.get('snap')!.sent.length > sentFrames, 'host transmits');
      const frames = pair.takeFrames();
      sentFrames += frames.length;

      for (const f of frames) {
        const header = readDeltaHeader(await unpackFrame(f));
        expect(header).not.toBeNull();
        if (header!.baseFid === 0) keyframes++;
        else deltas++;
        if (f[0] === FRAME_DEFLATE) deflated++;
        else expect(f[0]).toBe(FRAME_TEXT);
        // The lossy link: 8 % of frames lost, 3 % delivered twice.
        const r = rnd();
        if (r < 0.08) continue;
        pair.deliverFrame(f);
        if (r > 0.97) pair.deliverFrame(f);
        delivered++;
      }
      await pair.joiner.snapFramesSettled('H');

      // Acks: 10 % lost, the rest arrive 0-4 snapshots later (a long round trip, in frames).
      for (const a of pair.takeAcks()) {
        const r = rnd();
        if (r < 0.1) continue;
        ackQueue.push([sentFrames + Math.floor(rnd() * 5), a]);
      }
      for (let i = ackQueue.length - 1; i >= 0; i--) {
        if (ackQueue[i]![0] <= sentFrames) {
          pair.deliverAck(ackQueue[i]![1]);
          ackQueue.splice(i, 1);
        }
      }

      // The oracle, for every string the joiner's receive path got since last time.
      while (checkedRaw < pair.rawSeen.length) {
        const raw = pair.rawSeen[checkedRaw++]!;
        const seq = Number(/"snapshotSeq":(\d+)/.exec(raw)![1]);
        const expected = expectedBySeq.get(seq);
        expect(raw === expected, `seq ${seq}: rebuilt string differs from the full wire string`).toBe(true);
        applyNetSnapshot(JSON.parse(raw).snapshot, clientDelta);
        applyNetSnapshot(JSON.parse(expected!).snapshot, clientFull);
        expect(hashWorldState(clientDelta)).toBe(hashWorldState(clientFull));
        compared++;
      }
    }

    console.info(`[codec-oracle] ticks=${w.tick} frames=${sentFrames} delivered=${delivered} compared=${compared} key=${keyframes} delta=${deltas} maxPrims=${maxPrims}`);
    // ── anti-vacuity: the run must have exercised what it claims ──────────────────────────────
    expect(w.tick).toBeGreaterThanOrEqual(Math.min(TICKS, 6_000));
    expect(maxPrims).toBeGreaterThan(Math.min(TICKS, 24_000) >= 24_000 ? 80 : 0); // a real board
    expect(compared).toBeGreaterThan(1_000);
    expect(deltas).toBeGreaterThan(keyframes * 20); // deltas are the norm …
    expect(keyframes).toBeGreaterThan(3); // … and the periodic keyframes interleaved
    expect(deflated).toBe(sentFrames); // the joiner said z=1, so every frame went deflated
    // ⭐ Every delivered frame rebuilt, despite 8 % of frames and 10 % of acks lost: bases are ACKED.
    expect(compared).toBe(delivered);
  }, 600_000);
});
