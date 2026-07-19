/**
 * SPARK — S124 P3: F10 RENDER-SIDE heap/census audit (~10k sim ticks, DIRECT mode).
 *
 * The other half of F10: S123 P3 audited the `?worker=1` split (main thread as a render
 * MIRROR + the worker isolate) — this spec audits the DIRECT host path, where sim AND the
 * full Pixi render stack share one heap. The churn-heavy VS-BOTS run (3×MID bots building,
 * severing, raiding, dying) is the render-leak crucible: every entity's renderer creates/
 * destroys Graphics per lifecycle, and a missed destroy() is invisible in a static world.
 *
 * Instruments (S123 machinery + one NEW probe):
 *   • stabilized double-GC heap floors (`--expose-gc` + precise memory; repeat until two
 *     consecutive floors differ <1MB) — bounds RETAINED growth, not sawtooth;
 *   • __SPARK__.renderCensus — recursive display-object count over app.stage + Pixi
 *     managed-texture count. A renderer leak shows as census growth DECOUPLED from entity
 *     counts even when heap noise masks the bytes. Entity counts recorded alongside so
 *     legitimate world growth is distinguishable in the log.
 *
 * ASSERT: post-GC heap growth < GROWTH_LIMIT_MB; display-object growth < CENSUS_LIMIT
 * (generous absolute — bots worlds cap out structurally, they don't grow per-tick);
 * texture count growth < TEXTURE_LIMIT (atlases/sprites are load-time, not per-entity).
 */
import { test, expect, type Page } from '@playwright/test';
import { canvasToCss, waitForWorld, titleButtonCss } from './helpers';

// Merged with the project launchOptions (test.use REPLACES them, so repeat the GL args).
test.use({
  launchOptions: {
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
    ],
  },
});

const WARMUP_TICKS = 1_200;
const TARGET_TICKS = 10_000;
const WALL_CAP_MS = 300_000;
const MIN_MEASURED_TICKS = 4_000;
const GROWTH_LIMIT_MB = 10;
const CENSUS_LIMIT_OBJECTS = 1_500;
const TEXTURE_LIMIT = 64;

interface RenderSample {
  heapMB: number;
  floorRounds: number;
  tick: number;
  census: { displayObjects: number; textures: number };
  counts: { prims: number; bonds: number; sparks: number; creatures: number };
}

/** One double-GC floor read (first pass queues finalizers, second collects). */
async function readFloorMB(page: Page): Promise<number> {
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

/** Stabilized floor (S123 CHECK-hardened: repeat until two consecutive floors settle <1MB). */
async function stabilizedSample(page: Page): Promise<RenderSample> {
  let prev = await readFloorMB(page);
  let rounds = 1;
  for (; rounds < 10; rounds++) {
    const next = await readFloorMB(page);
    const settled = Math.abs(next - prev) < 1;
    prev = next;
    if (settled) break;
  }
  const rest = await page.evaluate(() => {
    const w = window as unknown as {
      __SPARK__: {
        renderCensus: { displayObjects: number; textures: number };
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
      census: w.__SPARK__.renderCensus,
      counts: {
        prims: world.primitives.size,
        bonds: world.bonds.size,
        sparks: world.freeSparks.size,
        creatures: world.creatures.size,
      },
    };
  });
  return { heapMB: prev, floorRounds: rounds, ...rest };
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

test.describe('S124 P3 — F10 render-side heap/census audit (direct mode)', () => {
  test('VS-BOTS direct run: bounded post-GC heap + display-object census over ~10k ticks', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await page.addInitScript({
      content: 'window.__TEST_SPAWN_RATE_PER_SECOND__ = 2;',
    });
    await page.goto('/?debug=1');
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

    // Warm-up so JIT/pools/first structures settle before the baseline.
    const t0 = await page.evaluate(
      () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
    );
    await waitForTick(page, t0 + WARMUP_TICKS, 90_000);

    const s0 = await stabilizedSample(page);
    await waitForTick(page, s0.tick + TARGET_TICKS, WALL_CAP_MS);
    const s1 = await stabilizedSample(page);

    const measured = s1.tick - s0.tick;
    const growthMB = s1.heapMB - s0.heapMB;
    const censusGrowth = s1.census.displayObjects - s0.census.displayObjects;
    const textureGrowth = s1.census.textures - s0.census.textures;
    const perKtickKB = (growthMB * 1024) / (measured / 1000);
    console.log(
      `[S124-P3 RENDER direct-bots] ticks=${measured} ` +
        `HEAP ${s0.heapMB.toFixed(1)}→${s1.heapMB.toFixed(1)}MB (Δ${growthMB.toFixed(2)}MB, ` +
        `${perKtickKB.toFixed(1)}KB/ktick, floors ${s0.floorRounds}/${s1.floorRounds}) ` +
        `CENSUS ${s0.census.displayObjects}→${s1.census.displayObjects} objects ` +
        `(Δ${censusGrowth}), textures ${s0.census.textures}→${s1.census.textures} ` +
        `counts ${JSON.stringify(s0.counts)}→${JSON.stringify(s1.counts)}`,
    );

    expect(measured).toBeGreaterThanOrEqual(MIN_MEASURED_TICKS);
    expect(growthMB).toBeLessThan(GROWTH_LIMIT_MB);
    expect(censusGrowth).toBeLessThan(CENSUS_LIMIT_OBJECTS);
    // Texture probe present (−1 = the Pixi internals moved; census invalid → fail loudly)…
    expect(s0.census.textures).toBeGreaterThanOrEqual(0);
    // …and load-time-bounded: entities reuse atlases, they never mint per-entity textures.
    expect(textureGrowth).toBeLessThan(TEXTURE_LIMIT);
  });
});
