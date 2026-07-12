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
 * GROWTH_LIMIT_MB=10: a real per-frame leak (≥1KB/tick) shows as ≥10MB over the window;
 * organic world/entity growth measures ~1-3MB. Longtask count recorded (not asserted).
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
const MIN_MEASURED_TICKS = 4_000; // the window must be meaningful even if wall-capped
const GROWTH_LIMIT_MB = 10;

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

async function waitForTick(page: Page, target: number, wallCapMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    const tick = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    if (tick >= target || Date.now() - start >= wallCapMs) return;
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
  await waitForTick(page, t0 + WARMUP_TICKS, 90_000);

  const s0 = await stabilizedSample(page);
  await waitForTick(page, s0.tick + TARGET_TICKS, WALL_CAP_MS);
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

  expect(measured).toBeGreaterThanOrEqual(MIN_MEASURED_TICKS);
  expect(growthMB).toBeLessThan(GROWTH_LIMIT_MB);
  // The worker isolate — the sim's own heap — must be bounded too (the F2 CHECK fix).
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

test.describe('S123 P3 — worker-mode GC/heap audit', () => {
  test('baseline: TD-heavy solo worker world, bounded post-GC heap growth over ~10k ticks', async ({
    page,
  }) => {
    test.setTimeout(600_000);
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
    test.setTimeout(600_000);
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
