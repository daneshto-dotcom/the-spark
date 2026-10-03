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
/*
 * ⛔ RUN 1 WAS INVALID, AND THESE FLAGS ARE WHY RUN 2 IS NOT. Without them the JOINER page (the second
 * window) was treated as backgrounded: its timers and rAF ran at ~1.5-4 Hz even on a wave-1 board with a
 * 5.8 ms frame, so every fps number measured Chrome's background throttling, not the game. And the default
 * headless "gpu" project silently got SwiftShader — `--use-angle=d3d11 --enable-gpu` is what reaches the
 * real GPU headless on Windows (probed: RTX 4070 Ti SUPER, D3D11).
 */
const NO_BG_THROTTLE = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /joiner-replay\.spec\.ts$/,
  timeout: 3_600_000,
  retries: 0,
  reporter: 'list',
  use: { ...base.use, trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'gpu', use: { ...chrome, viewport: { width: 1920, height: 1080 }, launchOptions: { args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu', ...NO_BG_THROTTLE] } } },
    { name: 'swiftshader', use: { ...chrome, viewport: { width: 1920, height: 1080 }, launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', ...NO_BG_THROTTLE] } } },
  ],
  webServer: base.webServer === undefined ? undefined : { ...(base.webServer as object), cwd: fileURLToPath(new URL('../..', import.meta.url)) } as never,
});
