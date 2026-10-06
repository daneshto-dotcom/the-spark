/**
 * S195 (net-delta) MEASUREMENT INSTRUMENT — what A (deflate), B (delta vs the acked frame) and A+B cost
 * on the wire and on the CPU, wave by wave, on the SAME match as `lagWaveMeasure.test.ts` (the S195 lag
 * report's numbers): a real four-seat bots match through `runHostTick`, the win bar lifted so it reaches
 * wave 15, 30 consecutive 10 Hz snapshots taken 30 s into each listed wave's FIGHT.
 *
 * ⛔ OPT-IN, NOT A GATE (minutes of CPU):
 *     SPARK_NETDELTA_MEASURE=1 npx vitest run src/net/netDeltaMeasure.test.ts
 *
 * Per snapshot it measures, with the production codec functions (`snapshotCodec.ts`) and the browser's
 * own `CompressionStream` (Node's implementation of the same API):
 *   · full   — the legacy wire string (`JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer)`)
 *   · A      — that string deflated (a keyframe frame, compressed)
 *   · B      — a delta frame against the PREVIOUS snapshot (an ack one cadence step old), uncompressed
 *   · A+B    — the same delta, deflated
 *   · host ms  — segment + encode + deflate of the A+B frame (vs stringify for full)
 *   · joiner ms — inflate + rebuild + JSON.parse + applyNetSnapshot (vs parse + apply for full)
 * and the A+B stream AMORTISED with one keyframe every KEYFRAME_INTERVAL frames.
 */
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runHostTick } from '../state/hostTick.ts';
import { makeWorld } from '../state/world.ts';
import { applyNetSnapshot, stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import { startC5Match, WAVE_TICKS, fightStartTick } from '../state/c5WaveFiveBoard.fixtures.ts';
import { HostSync } from './sync.ts';
import {
  KEYFRAME_INTERVAL, applyDelta, encodeDelta, packFrame, segmentSnapshotMessage, segmentsToText, unpackFrame,
  type Segments,
} from './snapshotCodec.ts';

vi.mock('../constants.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../constants.ts')>();
  return { ...real, winScoreForWave: () => Number.MAX_SAFE_INTEGER };
});

const MEASURE = process.env.SPARK_NETDELTA_MEASURE === '1';
const OUT = process.env.SPARK_NETDELTA_OUT ?? '';
const WAVES = (process.env.SPARK_NETDELTA_WAVES ?? '1,5,8,10,15').split(',').map(Number);
const BURST = 30;

interface Row {
  wave: number; prims: number; bonds: number; creatures: number;
  full: number; a: number; b: number; ab: number; key: number; abAmortised: number;
  hostFullMs: number; hostAbMs: number; joinerFullMs: number; joinerAbMs: number;
  /** ⭐ S195 audit F2 — the largest INFLATED frame (a keyframe's text, bytes): what MAX_INFLATED_BYTES must hold. */
  keyTextMax: number;
}
const median = (xs: number[]): number => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? 0; };
const kib = (n: number): string => (n / 1024).toFixed(1);
const mbit = (n: number): string => ((n * 8 * 10) / 1e6).toFixed(2);

describe.skipIf(!MEASURE)('S195 net-delta — A / B / A+B, measured wave by wave', () => {
  it('prints the table', async () => {
    const { world: w, bots, deps, state } = startC5Match(false);
    const sync = new HostSync();
    const clientFull = makeWorld(0);
    const clientAb = makeWorld(0);
    const rows: Row[] = [];
    const maxWave = Math.max(...WAVES);
    let fid = 1;
    for (const wave of WAVES) {
      const start = fightStartTick(wave) + 1800;
      while (w.tick < start) {
        if (w.tick % 3000 === 0) await new Promise<void>((r) => setImmediate(r));
        bots.tick(w);
        runHostTick(w, deps, state);
      }
      expect(w.waveNumber).toBe(wave);
      const s: Record<string, number[]> = { full: [], a: [], b: [], ab: [], key: [], hf: [], ha: [], jf: [], ja: [] };
      let prevSegs: Segments | null = null;
      let keyTextMax = 0;
      let prevFid = 0;
      for (let k = 0; k < BURST; k++) {
        for (let t = 0; t < 6; t++) { bots.tick(w); runHostTick(w, deps, state); }
        const msg = sync.buildSnapshotMessage(w, 0, 'm.1');
        const h0 = performance.now();
        const full = JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer);
        const h1 = performance.now();
        const segs: Segments = segmentSnapshotMessage(stripWirePrevPos(msg), wireNumberReplacer, prevSegs)!;
        const keyText = encodeDelta(segs, null, fid, 0);
        keyTextMax = Math.max(keyTextMax, new TextEncoder().encode(keyText).byteLength);
        const deltaText = prevSegs === null ? keyText : encodeDelta(segs, prevSegs, fid, prevFid);
        const abFrame = await packFrame(deltaText, true);
        const h2 = performance.now();
        expect(segmentsToText(segs)).toBe(full);
        const aFrame = await packFrame(full, true);
        const keyFrame = await packFrame(keyText, true);
        const bFrame = await packFrame(deltaText, false);
        // joiner, full: parse + apply
        const j0 = performance.now();
        applyNetSnapshot(JSON.parse(full).snapshot, clientFull);
        const j1 = performance.now();
        // joiner, A+B: inflate + rebuild + parse + apply
        const text = await unpackFrame(abFrame);
        const rebuilt = segmentsToText(applyDelta(text, prevSegs === null ? null : prevSegs));
        applyNetSnapshot(JSON.parse(rebuilt).snapshot, clientAb);
        const j2 = performance.now();
        expect(rebuilt).toBe(full);
        if (prevSegs !== null) {
          s.full!.push(full.length); s.a!.push(aFrame.byteLength); s.b!.push(bFrame.byteLength);
          s.ab!.push(abFrame.byteLength); s.key!.push(keyFrame.byteLength);
          s.hf!.push(h1 - h0); s.ha!.push(h2 - h1); s.jf!.push(j1 - j0); s.ja!.push(j2 - j1);
        }
        prevSegs = segs;
        prevFid = fid++;
      }
      const ab = median(s.ab!);
      const key = median(s.key!);
      rows.push({
        wave, prims: w.primitives.size, bonds: w.bonds.size, creatures: w.creatures.size,
        full: median(s.full!), a: median(s.a!), b: median(s.b!), ab, key,
        abAmortised: (ab * (KEYFRAME_INTERVAL - 1) + key) / KEYFRAME_INTERVAL,
        hostFullMs: median(s.hf!), hostAbMs: median(s.ha!), joinerFullMs: median(s.jf!), joinerAbMs: median(s.ja!),
        keyTextMax,
      });
      if (wave === maxWave) break;
    }
    const lines = [
      '| wave | shapes / connectors / creatures | full | A deflate | B delta | A+B | A+B incl. keyframe/' + KEYFRAME_INTERVAL + ' | Mbit/s/joiner full → A+B | cut | host ms full → A+B | joiner ms full → A+B |',
      '|---:|---|---:|---:|---:|---:|---:|---|---:|---|---|',
      ...rows.map((r) =>
        `| ${r.wave} | ${r.prims} / ${r.bonds} / ${r.creatures} | ${kib(r.full)} KiB | ${kib(r.a)} | ${kib(r.b)} | ${kib(r.ab)} | ${kib(r.abAmortised)} | ${mbit(r.full)} → ${mbit(r.abAmortised)} | ${(r.full / r.abAmortised).toFixed(1)}× | ${r.hostFullMs.toFixed(2)} → ${r.hostAbMs.toFixed(2)} | ${r.joinerFullMs.toFixed(2)} → ${r.joinerAbMs.toFixed(2)} |`),
    ];
    console.log('\n[netDeltaMeasure]\n' + lines.join('\n'));
    if (OUT !== '') {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, 'netDeltaMeasure.json'), JSON.stringify(rows, null, 2));
      writeFileSync(join(OUT, 'netDeltaMeasure.md'), lines.join('\n') + '\n');
    }
    console.log('[netDeltaMeasure] largest inflated keyframe per wave (KiB): ' + rows.map((r) => `w${r.wave}=${kib(r.keyTextMax)}`).join(' '));
    expect(rows.length).toBe(WAVES.length);
    void WAVE_TICKS;
  }, 3_600_000);
});
