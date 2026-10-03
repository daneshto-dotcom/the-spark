/**
 * SPARK — S195 (N9, LAG tree) MEASUREMENT INSTRUMENT: what a wave-1 … wave-15 board costs on the WIRE
 * and on a JOINER's CPU. Owner, S195: *"The game fucking lags for other players … after wave five …
 * even worse … after wave eight or nine, it's unplayable for him."*
 *
 * ⛔ OPT-IN, NOT A GATE. It drives a real four-seat bots match through `runHostTick` to wave 15 (~22 000
 * ticks per wave-group, minutes of CPU), so it runs only with `SPARK_LAG_MEASURE=1`:
 *
 *     SPARK_LAG_MEASURE=1 npx vitest run src/net/lagWaveMeasure.test.ts
 *
 * It prints a table and writes, when `SPARK_LAG_OUT` names a directory, a JSON of every number plus
 * 30-snapshot 10 Hz WIRE sequences (exactly what `NetTransport.send` emits) at waves 5/8/10/15 so the
 * browser half (`scripts/lag/joiner-replay.spec.mjs`) can replay them into a REAL joiner page under CPU
 * throttling. Same match fixture as the S189/S190 C5 instruments (`c5WaveFiveBoard.fixtures.ts`), so
 * the numbers are comparable with theirs.
 *
 * What it measures, per sample (every 600 ticks from wave 1, plus a 10 Hz burst at each wave's
 * mid-FIGHT):
 *   · wire bytes, and bytes per section / per entity family, with the entity counts
 *   · host: netSnapshot build ms, stringify ms (once per snapshot — the host serialises once)
 *   · joiner: JSON.parse ms, applyNetSnapshot ms onto a WARM client world (what a joiner really does)
 *   · deflate-raw size + ms at levels 1 and 6 (node:zlib here; the browser's CompressionStream is the
 *     same DEFLATE) — the "compress the snapshot" option
 *   · DELTA: the bytes of only the entities whose wire JSON changed since the previous 10 Hz snapshot,
 *     plus the removed ids — the "send what MOVED, not what EXISTS" option, measured, not argued
 */
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { deflateRawSync, constants as zc } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runHostTick } from '../state/hostTick.ts';
import { makeWorld } from '../state/world.ts';
import { applyNetSnapshot, netSnapshot, stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import { startC5Match, WAVE_TICKS, fightStartTick, topUpCreatures } from '../state/c5WaveFiveBoard.fixtures.ts';

/*
 * ⚠ THE WIN BAR IS LIFTED, ON PURPOSE AND ONLY HERE. The first run ended in a bot WIN at wave 9 (natural)
 * and wave 4 (120-creature floor), so it could never see the waves the owner names ("wave eight or nine,
 * it's unplayable"; this brief asks for 10 and 15). A human match that runs long does so because nobody
 * reaches the bar; the board that results is what we want to weigh. Nothing else in the sim is touched.
 */
vi.mock('../constants.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../constants.ts')>();
  return { ...real, winScoreForWave: () => Number.MAX_SAFE_INTEGER };
});

const MEASURE = process.env.SPARK_LAG_MEASURE === '1';
const OUT = process.env.SPARK_LAG_OUT ?? '';
const MAX_WAVE = Number(process.env.SPARK_LAG_MAX_WAVE ?? 15);
const BURST_WAVES = new Set([1, 5, 8, 10, 12, 15]);
const BURST_LEN = 30; // 3 s of 10 Hz snapshots
const SNAP_EVERY = 6; // PHYSICS_HZ 60 / NET_SNAPSHOT_HZ 10

/** Per-entity wire JSON keyed by section + id, for the delta estimate. */
function entityMap(snap: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(snap)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 'id' in (v[0] as object)) {
      for (const e of v as Array<{ id: unknown }>) m.set(`${k}#${String(e.id)}`, JSON.stringify(e));
    } else {
      m.set(k, JSON.stringify(v));
    }
  }
  return m;
}

interface Sample {
  tick: number; wave: number; phase: string; burst: boolean;
  bytes: number; deflate1: number; deflate6: number; deflate1Ms: number; deflate6Ms: number;
  buildMs: number; stringifyMs: number; parseMs: number; applyMs: number;
  counts: Record<string, number>;
  sections: Record<string, number>;
  deltaBytes: number | null; changedEntities: number | null; totalEntities: number;
}

async function runMatch(label: string, creatureFloor: number): Promise<{ samples: Sample[]; bursts: Record<number, string[]>; reached: string }> {
  const { world: w, bots, deps, state } = startC5Match(false);
  const samples: Sample[] = [];
  const bursts: Record<number, string[]> = {};
  const client = makeWorld(0);
  let prevEntities: Map<string, string> | null = null;
  let prevTick = -1;
  let seq = 1;
  const endTick = MAX_WAVE * WAVE_TICKS;

  while (w.tick < endTick && (w.gameState as string) === 'PLAYING') {
    if (creatureFloor > 0 && w.matchPhase === 'FIGHT' && w.tick % 60 === 0) topUpCreatures(w, creatureFloor);
    // Yield to the event loop now and then: a minutes-long synchronous block starved vitest's worker RPC
    // ("Timeout calling onTaskUpdate") on the first run, which turned a PASSING instrument's exit code red.
    if (w.tick % 3000 === 0) await new Promise<void>((r) => setImmediate(r));
    bots.tick(w);
    runHostTick(w, deps, state);

    const midFight = fightStartTick(w.waveNumber) + 1800; // 30 s into the 60 s FIGHT
    const inBurst = BURST_WAVES.has(w.waveNumber) && w.tick >= midFight && w.tick < midFight + BURST_LEN * SNAP_EVERY
      && (w.tick - midFight) % SNAP_EVERY === 0;
    const periodic = w.tick % 600 === 0;
    if (inBurst || periodic) {
      const tb0 = performance.now();
      const ns = netSnapshot(w);
      const tb1 = performance.now();
      const json = JSON.stringify(stripWirePrevPos({ kind: 'NETSNAPSHOT' as const, snapshotSeq: seq++, snapshot: ns }), wireNumberReplacer);
      const tb2 = performance.now();
      const buf = Buffer.from(json, 'utf8');
      const td0 = performance.now();
      const d1 = deflateRawSync(buf, { level: 1 }).length;
      const td1 = performance.now();
      const d6 = deflateRawSync(buf, { level: 6, strategy: zc.Z_DEFAULT_STRATEGY }).length;
      const td2 = performance.now();
      const tp0 = performance.now();
      const parsed = JSON.parse(json) as { snapshot: Record<string, unknown> };
      const tp1 = performance.now();
      applyNetSnapshot(parsed.snapshot as never, client);
      const tp2 = performance.now();
      const snap = parsed.snapshot;
      const sections: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(snap)) {
        sections[k] = JSON.stringify(v).length;
        if (Array.isArray(v)) counts[k] = v.length;
      }
      counts.effectsLive = w.effects.length;
      const ents = entityMap(snap);
      let deltaBytes: number | null = null;
      let changed: number | null = null;
      // A delta is only meaningful against the snapshot one cadence step (6 ticks) earlier.
      if (prevEntities !== null && w.tick - prevTick === SNAP_EVERY) {
        deltaBytes = 0; changed = 0;
        for (const [k, v] of ents) {
          if (prevEntities.get(k) !== v) { deltaBytes += v.length + k.length + 4; changed++; }
        }
        for (const k of prevEntities.keys()) if (!ents.has(k)) deltaBytes += k.length + 4;
      }
      prevEntities = ents;
      prevTick = w.tick;
      if (inBurst) (bursts[w.waveNumber] ??= []).push(json);
      samples.push({
        tick: w.tick, wave: w.waveNumber, phase: w.matchPhase, burst: inBurst,
        bytes: json.length, deflate1: d1, deflate6: d6, deflate1Ms: td1 - td0, deflate6Ms: td2 - td1,
        buildMs: tb1 - tb0, stringifyMs: tb2 - tb1, parseMs: tp1 - tp0, applyMs: tp2 - tp1,
        counts, sections, deltaBytes, changedEntities: changed, totalEntities: ents.size,
      });
    }
    // ⛔ THE RENDERER'S WIPE, MODELLED (the C5 instrument's lesson): the game empties `world.effects`
    // every render frame; headless nothing does. Sampled BEFORE the wipe, so a sample carries one tick.
    w.effects.length = 0;
  }
  const reached = `tick ${w.tick}, wave ${w.waveNumber} ${w.matchPhase}, state ${w.gameState}`;
  console.log(`\n══════ LAG ${label} — reached ${reached}`);
  return { samples, bursts, reached };
}

function summarise(label: string, samples: Sample[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const waves = [...new Set(samples.map((s) => s.wave))].sort((a, b) => a - b);
  console.log('wave  n   KiB(med/max)  defl1 KiB  defl6 KiB  delta KiB  changed/total  build  strfy  parse  apply  d1ms  creat prims bonds spawn defnd effects  top sections');
  for (const wave of waves) {
    const ss = samples.filter((s) => s.wave === wave && s.phase === 'FIGHT');
    const pool = ss.length > 0 ? ss : samples.filter((s) => s.wave === wave);
    const burst = pool.filter((s) => s.burst);
    const use = burst.length > 0 ? burst : pool;
    const med = (f: (s: Sample) => number): number => { const a = use.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };
    const max = (f: (s: Sample) => number): number => Math.max(...use.map(f));
    const deltas = use.filter((s) => s.deltaBytes !== null);
    const dMed = deltas.length ? deltas.map((s) => s.deltaBytes!).sort((a, b) => a - b)[Math.floor(deltas.length / 2)]! : NaN;
    const chMed = deltas.length ? deltas.map((s) => s.changedEntities!).sort((a, b) => a - b)[Math.floor(deltas.length / 2)]! : NaN;
    const big = use.reduce((a, s) => (s.bytes > a.bytes ? s : a), use[0]!);
    const top = Object.entries(big.sections).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)}K`).join(' · ');
    const row = {
      label, wave, n: use.length, burst: burst.length > 0,
      kibMed: med((s) => s.bytes) / 1024, kibMax: max((s) => s.bytes) / 1024,
      deflate1KiB: med((s) => s.deflate1) / 1024, deflate6KiB: med((s) => s.deflate6) / 1024,
      deltaKiB: dMed / 1024, changed: chMed, total: big.totalEntities,
      buildMs: med((s) => s.buildMs), stringifyMs: med((s) => s.stringifyMs), parseMs: med((s) => s.parseMs), applyMs: med((s) => s.applyMs),
      deflate1Ms: med((s) => s.deflate1Ms), deflate6Ms: med((s) => s.deflate6Ms),
      counts: big.counts, sectionsKiB: Object.fromEntries(Object.entries(big.sections).map(([k, v]) => [k, +(v / 1024).toFixed(2)])),
    };
    rows.push(row);
    const c = big.counts;
    console.log(
      `${String(wave).padStart(4)} ${String(use.length).padStart(3)}  ${row.kibMed.toFixed(1).padStart(5)}/${row.kibMax.toFixed(1).padStart(5)}  ${row.deflate1KiB.toFixed(1).padStart(8)}  ${row.deflate6KiB.toFixed(1).padStart(8)}  ${Number.isNaN(row.deltaKiB) ? '     -' : row.deltaKiB.toFixed(1).padStart(8)}  ${String(chMed).padStart(5)}/${String(big.totalEntities).padStart(5)}  ${row.buildMs.toFixed(2).padStart(5)}  ${row.stringifyMs.toFixed(2).padStart(5)}  ${row.parseMs.toFixed(2).padStart(5)}  ${row.applyMs.toFixed(2).padStart(5)}  ${row.deflate1Ms.toFixed(2).padStart(4)}  ${String(c.creatures ?? 0).padStart(5)} ${String(c.primitives ?? 0).padStart(5)} ${String(c.bonds ?? 0).padStart(5)} ${String(c.creatureSpawners ?? 0).padStart(5)} ${String(c.defenders ?? 0).padStart(5)} ${String(c.effects ?? 0).padStart(7)}  ${top}`,
    );
  }
  return rows;
}

describe.runIf(MEASURE)('S195 N9 — wave 1…15 wire + joiner CPU (opt-in)', () => {
  it('a natural four-seat bots match, and the same match held at the brother\'s 120 creatures', async () => {
    const out: Record<string, unknown> = {};
    for (const [label, floor] of [['natural', 0], ['floor120', 120]] as const) {
      const { samples, bursts, reached } = await runMatch(label, floor);
      const rows = summarise(label, samples);
      out[label] = { reached, rows };
      if (OUT !== '') {
        mkdirSync(OUT, { recursive: true });
        for (const [wave, seqs] of Object.entries(bursts)) writeFileSync(join(OUT, `burst-${label}-w${wave}.json`), JSON.stringify(seqs));
      }
      expect(samples.length).toBeGreaterThan(0);
    }
    if (OUT !== '') writeFileSync(join(OUT, 'lag-measure.json'), JSON.stringify(out, null, 1));
  }, 3_600_000);
});

