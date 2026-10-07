import { defineConfig } from '@playwright/test';
const PORT = 27196;
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.cap\.ts/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
