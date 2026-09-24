/**
 * SPARK — S190 P0 (C5) — WHAT A WAVE-5 BOARD COSTS THE HOST TICK, ON THE CPU. The instrument the
 * s190/perf fix is measured with, before and after.
 *
 * Owner, S189: *"it was lagging at about wave five. I thought we fixed the lags"*.
 *
 * ⚠ A COPY OF AN IDEA, NOT OF A FILE. The measurement was first built by the s189/net branch
 * (`src/net/c5WaveFiveMeasure.test.ts`, commit b72a4c4). That branch owns its file; two branches
 * adding the same path is a merge hazard, so this is a separate instrument under `src/state/`,
 * trimmed to the CPU question (the wire sampling stays on the net branch) and with the profiler made
 * opt-in, so the timing numbers are not inflated by the sampler.
 *
 * ⛔ OPT-IN, NOT A GATE. It drives a real four-seat bots match through `runHostTick` for 45 000 ticks
 * per pass (minutes of CPU), so it runs only with `SPARK_C5_PERF=1`:
 *
 *     SPARK_C5_PERF=1 npx vitest run src/state/c5HostTickMeasure.test.ts
 *     SPARK_C5_PERF=1 SPARK_C5_PROFILE=1 npx vitest run src/state/c5HostTickMeasure.test.ts
 *
 * It prints numbers and asserts only anti-vacuity (the match really reached wave 5, and pass C really
 * held its creature count). Timing on a shared machine is noisy — run it more than once, and compare
 * a before and an after on the same machine in the same hour.
 *
 *   A · DEFAULT  — every seat takes the deadline's draft pick. The wave-5 board carries ≤ ~17
 *       creatures: the ordinary case.
 *   C · 120 HELD — all-HP draft AND the board topped up to 120 live creatures through wave 5's FIGHT
 *       (the brother's S182 count), the case that could not hold 60 Hz.
 */
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';

import { runHostTick } from './hostTick.ts';
import { PHASE_DURATION_TICKS } from '../constants.ts';
import { startC5Match, topUpCreatures, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';

const MEASURE = process.env.SPARK_C5_PERF === '1';
const PROFILE = process.env.SPARK_C5_PROFILE === '1';

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}
const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

interface Bucket { host: number[]; creatures: number[]; primitives: number[]; bonds: number[] }

type CpuProfile = {
  nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }>;
  samples: number[]; startTime: number; endTime: number;
};

/** Self + inclusive time by function over a V8 CPU profile — what DOMINATES a window, not a guess. */
function summarise(profile: CpuProfile): void {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const totalHits = profile.nodes.reduce((a, n) => a + (n.hitCount ?? 0), 0);
  const usPerHit = (profile.endTime - profile.startTime) / Math.max(1, totalHits);
  const key = (n: (typeof profile.nodes)[number]): string =>
    `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const self = new Map<string, number>();
  for (const n of profile.nodes) self.set(key(n), (self.get(key(n)) ?? 0) + (n.hitCount ?? 0));
  const subtree = new Map<number, number>();
  const sub = (id: number): number => {
    const c = subtree.get(id);
    if (c !== undefined) return c;
    const n = byId.get(id)!;
    let t = n.hitCount ?? 0;
    for (const ch of n.children ?? []) t += sub(ch);
    subtree.set(id, t);
    return t;
  };
  const incl = new Map<string, number>();
  const walk = (id: number, onStack: Set<string>): void => {
    const n = byId.get(id)!;
    const k = key(n);
    const fresh = !onStack.has(k);
    if (fresh) { incl.set(k, (incl.get(k) ?? 0) + sub(id)); onStack.add(k); }
    for (const ch of n.children ?? []) walk(ch, onStack);
    if (fresh) onStack.delete(k);
  };
  walk(profile.nodes[0]!.id, new Set());
  const top = (m: Map<string, number>, n: number): string =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v]) => `    ${((100 * v) / totalHits).toFixed(1).padStart(5)} %  ${((v * usPerHit) / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`  PROFILE: ${totalHits} samples, ${((profile.endTime - profile.startTime) / 1000).toFixed(0)} ms`);
  console.log('  top SELF:\n' + top(self, 25));
  console.log('  top INCLUSIVE:\n' + top(incl, 40));
}

async function runPass(label: string, allHp: boolean, creatureTarget = 0): Promise<void> {
  const { world: w, bots: m, deps: d, state: st } = startC5Match(allHp);
  const buckets = new Map<string, Bucket>();
  const endTick = 5 * WAVE_TICKS; // the end of wave 5's FIGHT
  const fightStart = 4 * WAVE_TICKS + PHASE_DURATION_TICKS;

  const session = PROFILE ? new Session() : null;
  session?.connect();
  let profiling = false;
  let profile: CpuProfile | null = null;
  while (w.tick < endTick && (w.gameState as string) === 'PLAYING') {
    /*
     * ⚠ YIELD TO THE EVENT LOOP, OUTSIDE THE TIMED WINDOW. The first run of this instrument held the
     * worker thread for 40 s straight and vitest failed the run (exit 1) on
     * `[vitest-worker]: Timeout calling "onTaskUpdate"` — its RPC never got a turn. Both tests had
     * passed; the red was the harness, and yielding every 500 ticks is what makes the exit code mean
     * something again. The await sits outside `t1..t2`, so it costs the numbers nothing.
     */
    if (w.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
    if (creatureTarget > 0 && w.waveNumber === 5 && w.matchPhase === 'FIGHT' && w.tick % 60 === 0) {
      topUpCreatures(w, creatureTarget);
    }
    if (session !== null && !profiling && profile === null && w.waveNumber === 5 && w.matchPhase === 'FIGHT') {
      session.post('Profiler.enable');
      session.post('Profiler.setSamplingInterval', { interval: 200 });
      session.post('Profiler.start');
      profiling = true;
    }
    if (session !== null && profiling && (w.tick >= endTick - 1 || w.tick >= fightStart + 2400)) {
      session.post('Profiler.stop', (err, res) => { if (!err) profile = res.profile as unknown as CpuProfile; });
      profiling = false;
    }
    const key = `w${w.waveNumber}-${w.matchPhase}`;
    let b = buckets.get(key);
    if (b === undefined) buckets.set(key, (b = { host: [], creatures: [], primitives: [], bonds: [] }));
    m.tick(w);
    const t1 = performance.now();
    runHostTick(w, d, st);
    const t2 = performance.now();
    b.host.push(t2 - t1);
    /*
     * ⛔ THE RENDERER'S WIPE, MODELLED (the s189/net instrument's finding). In the game
     * `effectsRenderer.sync` empties `world.effects` every render frame; headless, nothing does, and
     * an unbounded effects array is a cost production never pays.
     */
    w.effects.length = 0;
    b.creatures.push(w.creatures.size);
    b.primitives.push(w.primitives.size);
    b.bonds.push(w.bonds.size);
  }
  if (session !== null) {
    if (profiling) session.post('Profiler.stop', (err, res) => { if (!err) profile = res.profile as unknown as CpuProfile; });
    session.disconnect();
  }

  console.log(`\n══════ C5 PERF PASS ${label} — reached tick ${w.tick}, wave ${w.waveNumber} ${w.matchPhase}, state ${w.gameState}`);
  console.log('bucket          ticks  host mean  host p95  host max  3-tick p95  3-tick max  creatures(max)  prims(max)  bonds(max)');
  for (const [key, bk] of buckets) {
    // The main loop runs up to 3 ticks per render frame: the sum of three consecutive ticks is what
    // one frame of catch-up costs the host.
    const triples: number[] = [];
    for (let i = 0; i + 2 < bk.host.length; i++) triples.push(bk.host[i]! + bk.host[i + 1]! + bk.host[i + 2]!);
    console.log(
      `${key.padEnd(14)} ${String(bk.host.length).padStart(6)}  ${mean(bk.host).toFixed(3).padStart(9)}  ${pct(bk.host, 0.95).toFixed(3).padStart(8)}  ${Math.max(...bk.host).toFixed(2).padStart(8)}  ${pct(triples, 0.95).toFixed(2).padStart(10)}  ${(triples.length ? Math.max(...triples) : 0).toFixed(2).padStart(10)}  ${String(Math.max(...bk.creatures)).padStart(14)}  ${String(Math.max(...bk.primitives)).padStart(10)}  ${String(Math.max(...bk.bonds)).padStart(10)}`,
    );
  }
  if (profile !== null) summarise(profile);
  expect(w.waveNumber, 'the match reached wave 5').toBeGreaterThanOrEqual(5);
  const fight5 = buckets.get('w5-FIGHT');
  expect(fight5, 'wave 5 FIGHT was measured').toBeDefined();
  if (creatureTarget > 0) {
    expect(Math.max(...fight5!.creatures), 'pass C really held its creature count').toBeGreaterThanOrEqual(creatureTarget - 5);
  }
}

describe.runIf(MEASURE)('S190 C5 — the host tick on a wave-5 board, measured (opt-in)', () => {
  it('PASS A — default draft (the ordinary wave-5 board)', async () => {
    await runPass('A default', false);
  }, 1_800_000);
  it("PASS C — all-HP AND the brother's 120 creatures, held through wave 5's FIGHT", async () => {
    await runPass('C all-HP + 120 creatures', true, 120);
  }, 1_800_000);
});
