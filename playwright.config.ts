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
 * webServer launches `npm run dev` on a PER-WORKTREE port (see `e2ePort` below — it was a fixed
 * 5173 until S182, which made parallel worktrees run each other's code).
 * E2E tests target DEV build (NOT prod) so __SPARK__ debug accessor is
 * available. Prod deploy.yml is unrelated to e2e workflow.
 */
import { defineConfig, devices } from '@playwright/test';

/**
 * ⛔⛔ S182 — **THE DEV-SERVER PORT IS PER-WORKTREE, AND A FIXED ONE SILENTLY RAN THE WRONG CODE.**
 *
 * This was `--port 5173` with `reuseExistingServer: !CI`. With several git worktrees open at once
 * (the S182 parallel-branch pattern in CLAUDE.md), the SECOND session to run `npm run e2e:gating`
 * did not start a server — it ADOPTED whichever branch's Vite already held 5173 and ran its specs
 * against that branch's code.
 *
 * ⛔ IT FAILS IN BOTH DIRECTIONS, AND THE QUIET ONE IS WORSE. Measured on `s182/damage-truth`: one
 * run produced failure stack traces rooted in `worktrees/s182-mp-identity-*` and
 * `worktrees/s182-placement-*`; a later run reported 8 scattered failures that vanished completely
 * (65/65) when re-run on a private port. A branch can go falsely RED — a session then chases a
 * phantom — or falsely GREEN, having proved nothing about its own code.
 *
 * ⭐ DERIVED FROM THE WORKTREE PATH, not from an env var or a dotfile, because neither is reliable
 * here: `SESSION_PORT` is not exported into the Node process, and `.claude/session-port.json` is
 * gitignored and gets auto-cleaned between sessions. A hash of `process.cwd()` needs no plumbing,
 * is STABLE for a given worktree across runs (so a debugging URL keeps working), and is distinct
 * for every sibling. CI has a single checkout, so it simply gets its own stable port.
 *
 * ⚠ `reuseExistingServer` stays on locally and is now SAFE: the only server that can be listening
 * on this port is this worktree's own.
 *
 * Range 20000-39999: clear of the well-known ports, clear of Vite's 5173, ~0.06% collision chance
 * across six worktrees. Override with SPARK_E2E_PORT when you want a fixed one.
 */
function e2ePort(): number {
  const override = Number(process.env.SPARK_E2E_PORT ?? '');
  if (Number.isInteger(override) && override > 0 && override < 65536) return override;
  // FNV-1a over the absolute worktree path — tiny, dependency-free, well-spread.
  let h = 0x811c9dc5;
  const cwd = process.cwd();
  for (let i = 0; i < cwd.length; i++) {
    h ^= cwd.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 20000 + (h % 20000);
}

const E2E_PORT = e2ePort();
const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;

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

// S127 — per-lane RETRIES override, supplied by each CI job's `env:` (same idiom as
// PW_GLOBAL_TIMEOUT_MIN above). Only `e2e-soak` sets it, to 0.
//
// Why: a retry only helps a NON-deterministic failure. The soak lane's failure mode is
// structural — sim ticks are FRAME-bound (src/main.ts:1389 clamps dt to 0.05s and
// PHYSICS_HZ=60, so at most 3 ticks advance per rendered frame), so a tick shortfall on a
// 2-core SwiftShader runner reproduces identically every attempt. In run 30374235685 that
// burned ~21.2 of the lane's 44 minutes on 3 such attempts, and the 44m globalTimeout then
// cut the suite off before the last test finished.
//
// The guard is a strict non-empty all-digits test, NOT `Number.isInteger(Number(x)) && x >= 0`:
// `Number('') === 0` and `Number.isInteger(0)` is true, so a DEFINED-BUT-EMPTY variable would
// silently drop retries to 0 in EVERY lane — the exact opposite of degrading to current
// behaviour. (PW_GLOBAL_TIMEOUT_MIN above is immune only because it additionally requires > 0.)
// S127 CHECK — this guard is the synthesis of two reviewers who pulled in OPPOSITE directions, and
// both were right about their own failure mode:
//
//  • GROK-ANALYST H1 (HIGH): a silent fallback means a typo'd/renamed value quietly restores
//    retries: 2 in the soak lane, the ~21-minute saving evaporates, and NOTHING says so — the same
//    silent-degradation class as the S126 `cancelled` bug. ⇒ a genuine typo must FAIL LOUDLY.
//  • RALPH:PATROL D1 (MEDIUM): but throwing on the EMPTY string is dangerous, because empty is
//    GitHub Actions' idiom for "unset" — `env: PW_RETRIES: ${{ vars.PW_RETRIES }}` with an
//    undefined var yields "" , not an absent var. This module loads for EVERY Playwright
//    invocation, so a throw here kills the GATING lane too, at config-load, before any test runs
//    ⇒ no playwright-report/, nothing for upload-artifact to find. That is precisely the
//    red-with-no-trace outcome the globalTimeout work above exists to eliminate — reintroduced one
//    step earlier in the pipeline. A stray local `export PW_RETRIES=` does the same.
//
// Synthesis: trim, treat absent-or-empty as the well-defined "no override" case, and throw ONLY on
// a non-empty value that is genuinely unparseable. Typos still fail loudly; the most likely
// misconfiguration can no longer take down all three lanes.
const retriesRaw = process.env.PW_RETRIES?.trim();
if (retriesRaw !== undefined && retriesRaw !== '' && !/^\d+$/.test(retriesRaw)) {
  throw new Error(
    `PW_RETRIES is set but not a non-negative integer: ${JSON.stringify(process.env.PW_RETRIES)}. ` +
      `Leave it UNSET (or empty) for the default (CI ? 2 : 0), or set an integer like "0".`,
  );
}
const retriesOverride =
  retriesRaw !== undefined && retriesRaw !== '' ? Number(retriesRaw) : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 2-peer tests must run sequentially; each spec opens 2 contexts
  forbidOnly: !!process.env.CI,
  retries: retriesOverride ?? (process.env.CI ? 2 : 0),
  workers: 1, // single worker — 2-peer specs are inherently serialized
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: E2E_ORIGIN,
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
    command: `npm run dev -- --port ${E2E_PORT} --host`,
    url: `${E2E_ORIGIN}/?debug=1`,
    // Safe now that the port is this worktree's alone — see `e2ePort`.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
