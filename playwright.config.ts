/**
 * SPARK — Playwright config for 2-browser E2E harness.
 *
 * S46 P1 (BUG-CRITICAL-5) — installed to end the 4-consecutive-regression-
 * session pattern (S43/S44/S45/S46). Tests drive 2 separate Chromium browser
 * contexts (= 2 separate WebRTC peers over Trystero/Nostr) and assert real-
 * time 1v1 gameplay invariants (place primitive, bond same-color, score
 * progress). See e2e/smoke.spec.ts for the canonical baseline.
 *
 * Council R1+R2 + PRIME-AUDIT decisions baked in:
 *   - C6/Δ1: tests use explicit page.mouse.move()/down()/up() sequences with
 *     frame-exact timing; assertions read __SPARK__.world state via
 *     page.evaluate() (DEV-mode global only — see src/main.ts:412).
 *   - C11/Δ2: TDD-style — each Sym A-E assertion ships RED first and turns
 *     GREEN as the corresponding priority lands.
 *   - C9 REJECT: Playwright over Node-WebRTC polyfill is non-negotiable —
 *     Trystero P2P over real signaling/STUN/ICE is the WHOLE surface being
 *     tested; mocking it defeats the harness's purpose.
 *
 * webServer launches `npm run dev` on a fixed port (5173 — Vite default).
 * E2E tests target DEV build (NOT prod) so __SPARK__ debug accessor is
 * available. Prod deploy.yml is unrelated to e2e workflow.
 */
import { defineConfig, devices } from '@playwright/test';

// S126 — per-lane GLOBAL timeout, in MINUTES, supplied by each CI job's `env:`.
//
// Why this exists: when the runner's own `timeout-minutes` fires, GitHub SIGKILLs the
// step. Playwright never flushes its reporters, so (a) the run concludes `cancelled`
// rather than `failure` — no failure email, and `gh run list` reads it as a benign
// concurrency cancel — and (b) the upload step finds no playwright-report/, leaving no
// trace to debug. That combination hid a dead gating lane for 3+ weeks.
//
// Setting globalTimeout BELOW each job's timeout-minutes makes PLAYWRIGHT stop the
// overrun instead: it exits non-zero, flushes reporters, and writes the report — so an
// overrun reports honestly as a failure WITH artifacts. e2e.yml holds the invariant
// globalTimeout < timeout-minutes for every lane (12<18 · 44<50 · 17<20).
//
// The finite-and-positive guard is deliberate: a typo'd or empty env var degrades to
// "no global timeout" (previous behaviour) rather than Number('') === 0 or NaN
// instantly aborting every lane at startup.
const gtMin = Number(process.env.PW_GLOBAL_TIMEOUT_MIN);
const globalTimeout =
  Number.isFinite(gtMin) && gtMin > 0 ? gtMin * 60_000 : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 2-peer tests must run sequentially; each spec opens 2 contexts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker — 2-peer specs are inherently serialized
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // S46 P1 C6 — deterministic viewport for canvas coord math.
    viewport: { width: 1920, height: 1080 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // WebGL required for Pixi v8. Headless Chromium supports it but
        // some Linux CI runners need a software renderer fallback. The
        // launchOptions below cover both local + CI.
        launchOptions: {
          args: [
            '--use-gl=swiftshader', // Software WebGL fallback for headless CI
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5173 --host',
    url: 'http://localhost:5173/?debug=1',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
