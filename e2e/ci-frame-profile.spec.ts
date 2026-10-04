/**
 * SPARK — S195 T21: THE FRAME PROFILE, ON WHATEVER MACHINE RUNS IT (the CI runner is the point).
 *
 * WHY THIS EXISTS. Deploys #4, #5 and #6 went red in the gating e2e lane on CI while every local run was
 * green, and the CI traces showed the page's main thread answering one `page.evaluate` every 0.7–1.9 s
 * and the sim at ≈7.7 ticks/s (`hunter.spec.ts` has the numbers). The open question was whether the
 * S192–S194 fx stack (bloom + shockwaves on HIGH) is what starves the software-GL runner — in which case
 * CI should run an EXPLICIT fx quality — or whether the runner is simply that slow at everything.
 * Nobody can answer that from a laptop with a GPU, so this spec measures it where the reds happen.
 *
 * WHAT IT MEASURES, per mode (HIGH = the shipped default, LOW = the Settings "High-quality effects" row
 * off, LEGACY = `?fx=legacy`, the pre-S192 renderer), in a real solo match:
 *   · `__SPARK__.frameMs` — CPU time from the top of the game tick to the end of Pixi's render, per frame;
 *   · the delivered frame rate (rAF callbacks per wall second);
 *   · the sim rate (world ticks per wall second) — the number every tick-budgeted wait depends on.
 * One `[frame-profile]` line per mode goes to the log, and the numbers are attached as JSON.
 *
 * ⛔ IT ASSERTS ONLY THAT IT MEASURED. A perf number is a finding, never a gate: a slow runner must not
 * turn this red, and a fast one must not make it vacuous. Anti-vacuity: ≥ 10 frames and ≥ 1 tick per mode.
 * Tagged `@render-starved` so it runs in the `e2e-render` lane with fog + hunter (`ci.e2eLanes.test.ts`).
 */
import { test, expect } from '@playwright/test';
import { titleButtonCss, waitForWorld, holdInBuildPhase } from './helpers.ts';

/** The window per mode: 300 frames, or this much wall time if the machine cannot deliver them sooner. */
const TARGET_FRAMES = 300;
const MAX_SAMPLE_MS = 30_000;
/** Navigate + title + solo click + PLAYING at CI speed, plus the sample window, per mode. */
const PROFILE_TEST_BUDGET_MS = 90_000 + MAX_SAMPLE_MS;

type Mode = 'high' | 'low' | 'legacy';

interface Sample {
  frames: number;
  wallMs: number;
  ticks: number;
  frameMs: number[];
}

const q = (xs: readonly number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const k = (s.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(f + 1, s.length - 1);
  return s[f]! + (s[c]! - s[f]!) * (k - f);
};

test.describe('S195 T21 — CI frame profile @render-starved', () => {
  for (const mode of ['high', 'low', 'legacy'] as const satisfies readonly Mode[]) {
    test(`frame profile: ${mode}`, async ({ page }, info) => {
      test.setTimeout(PROFILE_TEST_BUDGET_MS);
      await page.goto(mode === 'legacy' ? '/?debug=1&fx=legacy' : '/?debug=1');
      await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE');
      const solo = await titleButtonCss(page, 'solo');
      await page.mouse.click(solo.x, solo.y);
      await waitForWorld(page, (w) => w.gameState === 'PLAYING' && w.gameMode === 'solo', 'PLAYING (solo)');
      await holdInBuildPhase(page);

      const s: Sample = await page.evaluate(
        async ({ mode, target, maxMs }) => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const S = (window as any).__SPARK__;
          if (mode !== 'legacy') S.fx.setHighQuality(mode === 'high');
          // Let one frame apply the quality switch before the window opens.
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          const t0 = performance.now();
          const tick0: number = S.world.tick;
          let frames = 0;
          await new Promise<void>((resolve) => {
            const step = (): void => {
              frames++;
              if (frames >= target || performance.now() - t0 >= maxMs) resolve();
              else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
          const all: number[] = S.frameMs;
          return {
            frames,
            wallMs: performance.now() - t0,
            ticks: S.world.tick - tick0,
            frameMs: all.slice(-Math.min(frames, all.length)),
          };
          /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { mode, target: TARGET_FRAMES, maxMs: MAX_SAMPLE_MS },
      );

      const fps = s.frames / (s.wallMs / 1000);
      const tps = s.ticks / (s.wallMs / 1000);
      const row = {
        mode,
        frames: s.frames,
        wallS: +(s.wallMs / 1000).toFixed(1),
        fps: +fps.toFixed(2),
        ticksPerS: +tps.toFixed(2),
        frameMsMedian: +q(s.frameMs, 0.5).toFixed(2),
        frameMsP25: +q(s.frameMs, 0.25).toFixed(2),
        frameMsP75: +q(s.frameMs, 0.75).toFixed(2),
        frameMsP90: +q(s.frameMs, 0.9).toFixed(2),
      };
      console.log(`[frame-profile] ${JSON.stringify(row)}`);
      info.annotations.push({ type: 'frame-profile', description: JSON.stringify(row) });
      await info.attach(`frame-profile-${mode}.json`, { body: JSON.stringify({ ...row, frameMs: s.frameMs }), contentType: 'application/json' });

      expect(s.frames, 'anti-vacuity: the window saw frames').toBeGreaterThanOrEqual(10);
      expect(s.frameMs.length, 'anti-vacuity: __SPARK__.frameMs recorded the window').toBeGreaterThanOrEqual(10);
      expect(s.ticks, 'anti-vacuity: the sim advanced during the window').toBeGreaterThanOrEqual(1);
    });
  }
});
