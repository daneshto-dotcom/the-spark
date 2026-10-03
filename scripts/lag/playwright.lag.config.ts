/**
 * SPARK — S195 (N9) — the LAG instrument's own Playwright config. NOT a gate, never in CI.
 *
 *     npx playwright test -c scripts/lag/playwright.lag.config.ts
 *
 * Inherits the repo config (so the dev server is on THIS worktree's hashed port, never 5173 and never a
 * sibling worktree's server), and changes only: the test dir, a long timeout, and — per project — the GL
 * backend, because the question is what a WEAK joiner sees:
 *   · `gpu`        — the machine's real GPU (ANGLE default). The owner's own experience.
 *   · `swiftshader`— software GL on the CPU, the repo's CI setting. A floor: a PC whose GPU does nothing.
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config.ts';

const chrome = devices['Desktop Chrome'];

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /joiner-replay\.spec\.ts$/,
  timeout: 3_600_000,
  retries: 0,
  reporter: 'list',
  use: { ...base.use, trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'gpu', use: { ...chrome, viewport: { width: 1920, height: 1080 }, launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] } } },
    { name: 'swiftshader', use: { ...chrome, viewport: { width: 1920, height: 1080 }, launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } } },
  ],
  webServer: base.webServer === undefined ? undefined : { ...(base.webServer as object), cwd: fileURLToPath(new URL('../..', import.meta.url)) } as never,
});
