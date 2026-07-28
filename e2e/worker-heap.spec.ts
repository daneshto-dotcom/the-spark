/**
 * SPARK — S123 P3: worker-mode GC/heap audit (~10k sim ticks, real browser).
 *
 * Council S123 instrument (synthesis): `--js-flags=--expose-gc` + double `window.gc()` +
 * `performance.memory.usedJSHeapSize` (precise via --enable-precise-memory-info) as the
 * PRIMARY read; CDP HeapProfiler stays an optional deep-dive if a read is ambiguous.
 * MEASURES THE MAIN THREAD — the worker-mode-specific leak surface main pays for:
 * per-frame transferable positions buffers, ~10Hz structuredClone'd snapshot results,
 * effects arrays, mirror map churn (the F10 heap-probe domain). Worker-side sim heap is
 * bounded by the world (differential-gated code, no unbounded structures) and is NOT
 * readable from page performance.memory — documented scope bound, not an oversight.
 *
 * TWO runs (Council ordering — non-bot baseline FIRST, then bots):
 *   1. BASELINE: solo `?worker=1` on a TD-HEAVY transplanted world (the perf-snapshot
 *      S122 recipe: template-cloned prim/bond grids + 48-chewer swarm) — built in a
 *      DIRECT boot, then restored AT TITLE under the worker flag so the first PLAYING
 *      frame's adoption snapshot carries the heavy world INTO the worker (the S122
 *      "restoreWorld acts on the mirror" delta only applies post-adoption).
 *   2. BOTS: `?worker=1` VS-BOTS (3 MID) — the worker-owned BotManager allocation path.
 *
 * Protocol per run: adopt → warm-up ≥WARMUP_TICKS (JIT/pools/first batches settle) →
 * gc()×2 → h0 → run ≥TARGET_TICKS (wall-capped; actuals recorded) → gc()×2 → h1.
 * ASSERT: (h1−h0) < GROWTH_LIMIT_MB (post-double-GC growth; the double GC removes
 * sawtooth, so this bounds RETAINED growth) + the run doubles as a long-soak oracle
 * check (worker !failed, 0 hash mismatches). Entity counts at both samples are recorded
 * so legitimate world growth is distinguishable from leak growth in the log.
 *
 * GROWTH_LIMIT_MB=10 — CALIBRATION CORRECTED IN S127. The original claim here was "a real
 * per-frame leak (≥1KB/tick) shows as ≥10MB over the window; organic world/entity growth
 * measures ~1-3MB". That is only true at a 10 000-tick window, which the BOTS run never reaches
 * (2 154-2 301 in CI, 8 073 locally) — though the non-bots BASELINE does (8 487 in CI, and 10 307
 * locally with capped=false). The honest statement: this ceiling resolves 10*1024/measured KB/tick, so the
 * ≥1KB/tick intent needs 10 240 ticks; at the bots CI window it resolves only ~4.7KB/tick, where
 * the observed same-test noise band (±2.7MB) already exceeds a 1KB/tick signal (2.2MB). It is
 * therefore a MACRO-leak detector at short windows, and each run LOGS which regime it was in.
 * The tick-INSENSITIVE checks (worker-isolate bound + the determinism oracle) carry the signal
 * on slow hardware. Longtask count recorded (not asserted).
 */
import { test, expect, type Page } from '@playwright/test';
import { canvasToCss, titleButtonCss, waitForWorld } from './helpers';

// The debug port for the raw-CDP worker-isolate reads (see readWorkerFloorMB). Kept off
// the common dev ranges; override with SPARK_CDP_PORT on collision.
const CDP_PORT = Number(process.env.SPARK_CDP_PORT ?? 39221);

// Merged with the project launchOptions (test.use REPLACES them, so repeat the GL args).
test.use({
  launchOptions: {
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
      `--remote-debugging-port=${CDP_PORT}`,
    ],
  },
});

const WARMUP_TICKS = 1_200;
const TARGET_TICKS = 10_000;
const WALL_CAP_MS = 300_000; // measurement window wall cap; actual ticks recorded
const GROWTH_LIMIT_MB = 10;

// ── S127 calibration — IDENTICAL reasoning to render-heap.spec.ts; kept in sync deliberately ──
//
// THE GOVERNING FACT: sim ticks are FRAME-bound, not time-bound. src/main.ts:1389 clamps
// `dtSec = min(deltaMS/1000, 0.05)` and src/constants.ts:169 sets PHYSICS_HZ = 60 ⇒ at most 3
// ticks advance per RENDERED FRAME. Measured: the VS-BOTS run manages ~7.2-7.7 ticks/s on a
// 2-core SwiftShader CI runner, while the non-bots TD-heavy BASELINE below manages ~28.3 and
// reached 8 487 ticks — i.e. the bots world is ~3.8x more expensive PER TICK, which is why
// :333 failed in CI run 30374235685 and :243 passed. TARGET_TICKS = 10_000 is never reached BY THE
// BOTS TEST (:424) — 8 073 locally, 2 154-2 301 in CI, always capped=true. The BASELINE (:334) DOES
// reach it: 10 307 ticks with capped=false in 176 s. (S127 CHECK, RALPH:PATROL C2 — an earlier draft
// of this very file claimed "never reached", full stop, while owning the counter-example.)
// More ticks CANNOT be bought with wall-clock; do NOT "fix" a short window by raising WALL_CAP_MS.
//
// WARM-UP WALL CAP: was a hardcoded 90_000 ms, needing 13.3 ticks/s to cover WARMUP_TICKS —
// above what CI achieves, so CI warm-ups were truncated to ~648-693 of 1 200 ticks (54-58 %) and
// the s0 baseline was sampled MID-JIT/pool-settling. That is a second, independent source of the
// byte-heap noise band. 240 s ⇒ 1.4x margin at the observed CI floor, and whether the cap bound
// is now LOGGED rather than silently swallowed.
const WARMUP_WALL_CAP_MS = 240_000;

// Floor of MEANING, hard-asserted: below this nothing here carries information, so a red is honest
// — the run produced NO measurement and must be RE-RUN, never re-tuned.
//
// This file has NO census assertion (census is render-side only), so the floor is PURELY a
// liveness/meaning tripwire — a frozen sim or dead worker. The VALUE is matched to
// render-heap.spec.ts so the two soak files agree on what "too short to mean anything" is.
// 1_300 sits 1.66x under the observed CI minimum (2 154) and ~6x under local (8 484-10 315).
const MIN_VALID_TICKS = 1_300;

// Gate for the STRICT byte-heap regime — NOT a pass/fail criterion. The old
// `MIN_MEASURED_TICKS = 4_000` was, and it is the assertion that failed both :333 attempts
// (2 301 / 2 154) while every substantive threshold PASSED. Honesty note: the docblock's
// "≥1KB/tick" intent needs 10 240 ticks at GROWTH_LIMIT_MB = 10 — unreachable on any platform
// here — so each regime logs the sensitivity it ACTUALLY resolves.
const MIN_STRICT_TICKS = 4_000;

interface HeapSample {
  heapMB: number;
  workerHeapMB: number;
  floorRounds: number;
  tick: number;
  counts: { prims: number; bonds: number; sparks: number; creatures: number };
  longtasks: number;
}

/** One double-GC floor read on the MAIN isolate (first pass queues finalizers, second collects). */
async function readMainFloorMB(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const w = window as unknown as {
      gc?: () => void;
      performance: { memory?: { usedJSHeapSize: number } };
    };
    if (typeof w.gc !== 'function') throw new Error('window.gc missing — --expose-gc did not take');
    if (w.performance.memory === undefined) throw new Error('performance.memory unavailable');
    w.gc();
    await new Promise((r) => setTimeout(r, 150));
    w.gc();
    await new Promise((r) => setTimeout(r, 150));
    return w.performance.memory.usedJSHeapSize / (1024 * 1024);
  });
}

/**
 * One forced-GC floor read INSIDE the sim worker's isolate (GROK+GEMINI S123 CHECK,
 * CONFIRMED + adopted: main-side performance.memory is thread-local — a worker-side
 * accumulator is invisible to it, and auditing `?worker=1` demands the worker isolate).
 * performance.memory does NOT exist in WorkerGlobalScope (probed), so this is the
 * Council's CDP deep-dive instrument for real: modern Chromium lists dedicated workers
 * in /json/list with their own webSocketDebuggerUrl (probed OK) → raw WS →
 * HeapProfiler.collectGarbage ×2 → Runtime.getHeapUsage.usedSize.
 */
async function readWorkerFloorMB(): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = (await res.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>;
  const wt = targets.find((t) => t.type === 'worker' && t.url.includes('simWorker'));
  if (wt?.webSocketDebuggerUrl === undefined) {
    throw new Error('sim worker CDP target not found in /json/list — worker dead or port collision');
  }
  const ws = new WebSocket(wt.webSocketDebuggerUrl);
  try {
    return await new Promise<number>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('worker CDP timeout')), 15_000);
      let step = 0;
      const send = (id: number, method: string): void => ws.send(JSON.stringify({ id, method }));
      ws.onopen = () => send(1, 'HeapProfiler.collectGarbage');
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: { usedSize?: number };
        };
        if (msg.id === undefined) return;
        step = msg.id;
        if (step === 1) setTimeout(() => send(2, 'HeapProfiler.collectGarbage'), 150);
        else if (step === 2) setTimeout(() => send(3, 'Runtime.getHeapUsage'), 150);
        else if (step === 3) {
          clearTimeout(to);
          const used = msg.result?.usedSize;
          if (used === undefined) reject(new Error('getHeapUsage returned no usedSize'));
          else resolve(used / (1024 * 1024));
        }
      };
      ws.onerror = () => { clearTimeout(to); reject(new Error('worker CDP ws error')); };
    });
  } finally {
    ws.close();
  }
}

/**
 * Stabilized floor sample (GROK+GEMINI S123 CHECK, CONFIRMED + adopted): a single
 * post-GC read during a descending transient (the −39MB baseline observation) leaves a
 * negative buffer a real leak could hide inside. Repeat double-GC reads until two
 * consecutive MAIN floors differ by <1MB (max 10 rounds — the last read wins and the
 * round count is recorded, so a non-converging floor is visible in the log).
 */
async function stabilizedSample(page: Page): Promise<HeapSample> {
  let prev = await readMainFloorMB(page);
  let rounds = 1;
  for (; rounds < 10; rounds++) {
    const next = await readMainFloorMB(page);
    const settled = Math.abs(next - prev) < 1;
    prev = next;
    if (settled) break;
  }
  const workerHeapMB = await readWorkerFloorMB();
  const rest = await page.evaluate(() => {
    const w = window as unknown as {
      __LT_COUNT__?: number;
      __SPARK__: {
        world: {
          tick: number;
          primitives: Map<number, unknown>;
          bonds: Map<number, unknown>;
          freeSparks: Map<number, unknown>;
          creatures: Map<number, unknown>;
        };
      };
    };
    const world = w.__SPARK__.world;
    return {
      tick: world.tick,
      counts: {
        prims: world.primitives.size,
        bonds: world.bonds.size,
        sparks: world.freeSparks.size,
        creatures: world.creatures.size,
      },
      longtasks: w.__LT_COUNT__ ?? 0,
    };
  });
  return { heapMB: prev, workerHeapMB, floorRounds: rounds, ...rest };
}

interface WaitResult {
  tick: number;
  /** true ⇒ the WALL CAP ended the wait, not the tick target (the window was truncated). */
  capped: boolean;
  /** `<elapsed>s:<tick>` samples — the declining-rate curve. */
  curve: string;
}

/**
 * S127 — now REPORTS how the wait ended instead of returning void and hiding it: a truncated
 * warm-up silently invalidated the s0 baseline in CI, and the frame-bound tick curve is the
 * evidence a future session needs to set a permanent window (rather than extrapolating one
 * average across a run whose throughput declines as the world grows).
 */
async function waitForTick(page: Page, target: number, wallCapMs: number): Promise<WaitResult> {
  const start = Date.now();
  const samples: string[] = [];
  for (;;) {
    const tick = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    const elapsed = Date.now() - start;
    samples.push(`${Math.round(elapsed / 1000)}s:${tick}`);
    if (tick >= target || elapsed >= wallCapMs) {
      return { tick, capped: tick < target, curve: samples.join(' ') };
    }
    await page.waitForTimeout(5_000);
  }
}

async function waitForWorkerAdoption(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = (window as unknown as {
        __SPARK__: { simWorker: { ready: boolean; failed: boolean } | null };
      }).__SPARK__;
      return s.simWorker !== null && s.simWorker.ready && !s.simWorker.failed;
    },
    { timeout: 20_000 },
  );
}

async function auditWindow(page: Page, tag: string): Promise<void> {
  // Warm-up from adoption so JIT/pools/first structural batches settle pre-baseline.
  const t0 = await page.evaluate(
    () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
  );
  const warm = await waitForTick(page, t0 + WARMUP_TICKS, WARMUP_WALL_CAP_MS);
  // Never swallow a truncated warm-up: it invalidates the s0 baseline below.
  console.log(
    `[S123-P3 ${tag} warm-up] ticks=${warm.tick - t0}/${WARMUP_TICKS} ` +
      `capped=${warm.capped} curve=[${warm.curve}]`,
  );
  // S127 CHECK (RALPH:PATROL A2) — annotate, not just log: a truncated warm-up invalidates the s0
  // baseline, which is strictly worse than the short-window case below and must not report weaker.
  if (warm.capped) {
    test.info().annotations.push({
      type: 'truncated-warmup',
      description:
        `${tag}: only ${warm.tick - t0}/${WARMUP_TICKS} warm-up ticks in ${WARMUP_WALL_CAP_MS}ms — ` +
        `s0 baseline sampled MID-SETTLING, so the heap deltas below are inflated by JIT/pool churn`,
    });
  }

  const s0 = await stabilizedSample(page);
  const meas = await waitForTick(page, s0.tick + TARGET_TICKS, WALL_CAP_MS);
  console.log(`[S123-P3 ${tag} window] capped=${meas.capped} curve=[${meas.curve}]`);
  const s1 = await stabilizedSample(page);

  const measured = s1.tick - s0.tick;
  const growthMB = s1.heapMB - s0.heapMB;
  const workerGrowthMB = s1.workerHeapMB - s0.workerHeapMB;
  const perKtickKB = (growthMB * 1024) / (measured / 1000);
  // The recorded actuals — the Council-mandated evidence line.
  console.log(
    `[S123-P3 ${tag}] ticks=${measured} ` +
      `MAIN ${s0.heapMB.toFixed(1)}→${s1.heapMB.toFixed(1)}MB (Δ${growthMB.toFixed(2)}MB, ${perKtickKB.toFixed(1)}KB/ktick, floors ${s0.floorRounds}/${s1.floorRounds}) ` +
      `WORKER ${s0.workerHeapMB.toFixed(1)}→${s1.workerHeapMB.toFixed(1)}MB (Δ${workerGrowthMB.toFixed(2)}MB) ` +
      `counts ${JSON.stringify(s0.counts)}→${JSON.stringify(s1.counts)} ` +
      `longtasks ${s0.longtasks}→${s1.longtasks}`,
  );

  // ── S127 two-regime validity gate (replaces the hard MIN_MEASURED_TICKS floor) ───────────
  // The old `expect(measured).toBeGreaterThanOrEqual(4_000)` made the RUNNER'S RENDER THROUGHPUT
  // a pass/fail criterion — it is what failed both :333 attempts in CI run 30374235685 while
  // every substantive threshold PASSED. Liveness is still asserted; hardware speed is not.
  expect(measured).toBeGreaterThanOrEqual(MIN_VALID_TICKS);
  const resolvedKBPerTick = (GROWTH_LIMIT_MB * 1024) / measured;
  if (measured < MIN_STRICT_TICKS) {
    console.log(
      `[S123-P3 ${tag} SHORT-WINDOW] measured=${measured} < ${MIN_STRICT_TICKS}: a per-tick ` +
        `byte-leak claim is NOT honest at this window. MAIN Δ${growthMB.toFixed(2)}MB / WORKER ` +
        `Δ${workerGrowthMB.toFixed(2)}MB are RECORDED AS MEASUREMENTS; the ${GROWTH_LIMIT_MB}MB ` +
        `ceilings resolve only ≥${resolvedKBPerTick.toFixed(1)}KB/tick here (macro-leak ` +
        `detectors). The determinism oracle + isolate bounds below are STILL ASSERTED.`,
    );
    // Annotated AND logged. NOTE (S127 CHECK, RALPH:PATROL E2): the annotation does NOT reach an
    // HTML report in this lane — `e2e:soak` passes `--reporter=list`, which REPLACES the config
    // reporters. The console.log above is the load-bearing record; the annotation is
    // forward-compatible. See the fuller note in render-heap.spec.ts.
    test.info().annotations.push({
      type: 'short-window',
      description:
        `${tag}: measured=${measured} < MIN_STRICT_TICKS=${MIN_STRICT_TICKS}; byte-heap ` +
        `sensitivity degraded to ≥${resolvedKBPerTick.toFixed(1)}KB/tick (frame-bound)`,
    });
  } else {
    console.log(
      `[S123-P3 ${tag} STRICT-WINDOW] measured=${measured} ⇒ the ${GROWTH_LIMIT_MB}MB ceilings ` +
        `resolve ≥${resolvedKBPerTick.toFixed(1)}KB/tick.`,
    );
  }
  // Asserted UNCONDITIONALLY, as macro-leak detectors at short windows. Deliberately NOT
  // re-derived: n=2 CI samples per test cannot support a new threshold value.
  expect(growthMB).toBeLessThan(GROWTH_LIMIT_MB);
  // The worker isolate — the sim's own heap — must be bounded too (the F2 CHECK fix). This one
  // is the QUIETEST instrument of the set: observed Δ+0.38 / +0.43 / −0.33MB across all runs.
  expect(workerGrowthMB).toBeLessThan(GROWTH_LIMIT_MB);

  // Long-soak oracle verdict: the worker survived the whole window, zero mismatches.
  const wk = await page.evaluate(
    () =>
      (window as unknown as {
        __SPARK__: { simWorker: { ready: boolean; failed: boolean; hashMismatches: number } | null };
      }).__SPARK__.simWorker,
  );
  expect(wk).not.toBeNull();
  expect(wk!.failed).toBe(false);
  expect(wk!.hashMismatches).toBe(0);
}

// S126 — ` @soak` routes this file to the non-gating `e2e-soak` CI job. These two
// 10k-tick audits cost ~9.3m locally and, with render-heap, made up 15.2m of a 16.8m
// suite — which is why the 15m gating job was timeout-CANCELLED for 3+ weeks instead
// of ever reporting. Slow soak/measurement work belongs on its own runner.
test.describe('S123 P3 — worker-mode GC/heap audit @soak', () => {
  test('baseline: TD-heavy solo worker world, bounded post-GC heap growth over ~10k ticks', async ({
    page,
  }) => {
    // S127 CHECK (RALPH:PATROL F1, HIGH) — DERIVED from the two sequential wall caps, never a bare
    // literal. Raising WARMUP_WALL_CAP_MS 90s→240s pushed caps alone to 540s of a hardcoded 600s
    // budget, leaving ~50s for browser launch + goto + the bots-setup flow + TWO stabilizedSample
    // calls (each up to 10 double-GC rounds, and here also a CDP /json/list + WS handshake). A 30%
    // throughput dip would then time out DURING s1 — and with PW_RETRIES: 0 and the evidence line
    // printed only AFTER s1, that yields a red with NO measurement, the exact outcome S127 exists
    // to prevent. Written as an expression so it cannot drift when a cap is retuned.
    test.setTimeout(WARMUP_WALL_CAP_MS + WALL_CAP_MS + 120_000);
    await page.addInitScript({
      content:
        'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' +
        'window.__LT_COUNT__ = 0;' +
        "try { new PerformanceObserver((l) => { window.__LT_COUNT__ += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch {}",
    });

    // ── Phase 0 (DIRECT boot): build the TD-heavy save via the perf-snapshot recipe. ──
    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
    const solo = await titleButtonCss(page, 'solo');
    await page.mouse.click(solo.x, solo.y);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING (direct)', 20_000);
    // One real placement = the template primitive for cloning.
    const { placeFreeSparkAndConfirm } = await import('./helpers');
    await placeFreeSparkAndConfirm(page, 560, 420);
    const heavyJson = await page.evaluate(() => {
      interface AnyRec { [k: string]: unknown }
      const spark = (window as unknown as {
        __SPARK__: { snapshotWorld(): string };
      }).__SPARK__;
      const snap = JSON.parse(spark.snapshotWorld()) as AnyRec & {
        primitives: AnyRec[]; bonds?: AnyRec[]; creatures?: AnyRec[];
        nextPrimitiveId?: number; tick?: number;
      };
      const primT = snap.primitives[snap.primitives.length - 1];
      if (!primT) throw new Error('no template primitive');
      let maxPrimId = Math.max(0, ...snap.primitives.map((p) => p.id as number));
      const newPrims: AnyRec[] = [];
      for (let i = 0; i < 100; i++) {
        const p = JSON.parse(JSON.stringify(primT)) as AnyRec;
        p.id = ++maxPrimId;
        const x = 300 + (i % 10) * 60;
        const y = 220 + Math.floor(i / 10) * 60;
        (p.pos as { x: number; y: number }).x = x;
        (p.pos as { x: number; y: number }).y = y;
        if (p.prevPos !== undefined) {
          (p.prevPos as { x: number; y: number }).x = x;
          (p.prevPos as { x: number; y: number }).y = y;
        }
        if (Array.isArray(p.bonds)) p.bonds = [];
        newPrims.push(p);
      }
      snap.primitives = snap.primitives.concat(newPrims);
      const tick = (snap.tick as number) ?? 0;
      const creatures: AnyRec[] = (snap.creatures ?? []).slice();
      let cid = 1 + Math.max(0, ...creatures.map((c) => c.id as number));
      for (let i = 0; i < 48; i++) {
        creatures.push({
          id: cid++,
          type: 'chewer',
          pos: { x: 400 + (i % 12) * 90, y: 300 + Math.floor(i / 12) * 100 },
          state: 'SEEKING',
          ticksInState: 3 + (i % 7),
          ownerPlayerId: 0,
          sourceSpawnerId: 99990 + (i % 4),
          despawnAtTick: tick + 200_000,
        });
      }
      snap.creatures = creatures;
      if (typeof snap.nextPrimitiveId === 'number') snap.nextPrimitiveId = maxPrimId + 1;
      for (const k of Object.keys(snap)) {
        if (k.startsWith('nextCreature')) (snap as AnyRec)[k] = cid + 1;
      }
      return JSON.stringify(snap);
    });

    // ── Phase 1 (?worker=1 boot): transplant at TITLE → adoption carries it INTO the worker.
    await page.goto('/?debug=1&worker=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE (worker boot)', 30_000);
    await page.evaluate((json) => {
      (window as unknown as { __SPARK__: { restoreWorld(j: string): void } }).__SPARK__.restoreWorld(json);
    }, heavyJson);
    await waitForWorld(page, (w) => w.gameState === 'PLAYING', 'PLAYING (transplanted)', 10_000);
    await waitForWorkerAdoption(page);
    // The adoption INIT must have carried the heavy world (not a fresh/light one).
    const primsInWorker = await page.evaluate(
      () =>
        (window as unknown as { __SPARK__: { world: { primitives: Map<number, unknown> } } })
          .__SPARK__.world.primitives.size,
    );
    expect(primsInWorker).toBeGreaterThanOrEqual(100);

    await auditWindow(page, 'BASELINE td-heavy');
  });

  test('bots: VS-BOTS worker run, bounded post-GC heap growth over ~10k ticks', async ({
    page,
  }) => {
    // S127 CHECK (RALPH:PATROL F1, HIGH) — DERIVED from the two sequential wall caps, never a bare
    // literal. Raising WARMUP_WALL_CAP_MS 90s→240s pushed caps alone to 540s of a hardcoded 600s
    // budget, leaving ~50s for browser launch + goto + the bots-setup flow + TWO stabilizedSample
    // calls (each up to 10 double-GC rounds, and here also a CDP /json/list + WS handshake). A 30%
    // throughput dip would then time out DURING s1 — and with PW_RETRIES: 0 and the evidence line
    // printed only AFTER s1, that yields a red with NO measurement, the exact outcome S127 exists
    // to prevent. Written as an expression so it cannot drift when a cap is retuned.
    test.setTimeout(WARMUP_WALL_CAP_MS + WALL_CAP_MS + 120_000);
    await page.addInitScript({
      content:
        'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;' +
        'window.__LT_COUNT__ = 0;' +
        "try { new PerformanceObserver((l) => { window.__LT_COUNT__ += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch {}",
    });
    await page.goto('/?debug=1&worker=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE', 30_000);
    const vsBots = await titleButtonCss(page, 'vsBots');
    await page.mouse.click(vsBots.x, vsBots.y);
    await page.waitForFunction(
      () => {
        const s = (window as unknown as {
          __SPARK__: { botSetupOverlay: { getUiPoints?: () => unknown } | null };
        }).__SPARK__;
        return s.botSetupOverlay !== null && s.botSetupOverlay.getUiPoints !== undefined;
      },
      { timeout: 20_000 },
    );
    const startPt = await page.evaluate(() => {
      const s = (window as unknown as {
        __SPARK__: { botSetupOverlay: { getUiPoints: () => { start: { x: number; y: number } } } };
      }).__SPARK__;
      return s.botSetupOverlay.getUiPoints().start;
    });
    const startCss = await canvasToCss(page, startPt.x, startPt.y);
    await page.mouse.click(startCss.x, startCss.y);
    await waitForWorld(
      page,
      (w) => w.gameState === 'PLAYING' && w.players.length === 4,
      'bots PLAYING',
      20_000,
    );
    await waitForWorkerAdoption(page);

    await auditWindow(page, 'BOTS 3xMID');
  });
});
