/// <reference types="vitest" />
import { defineConfig } from 'vite';

const sessionPort = Number(process.env.SESSION_PORT);
const port = Number.isFinite(sessionPort) && sessionPort > 0 ? sessionPort : 5173;

// S17 P0: base='/' for custom-domain deploy at https://spark-online.space/.
// Paired with public/CNAME so GH Pages serves the apex domain after user
// configures Squarespace DNS (4 A records + www CNAME) + Settings → Pages →
// Custom domain. S16 carry-forward (Scope Amendment #2) closed. The
// github.io fallback URL https://daneshto-dotcom.github.io/the-spark/ will
// 301-redirect to the custom domain once Pages Custom Domain is set.
// Dev server is unaffected (base only applies at build time).
export default defineConfig({
  base: '/',
  server: {
    port,
    strictPort: false,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // S46 P1 — exclude e2e/ from vitest collection. e2e/*.spec.ts is for
  // Playwright (npm run e2e), not vitest unit tests. Without this, vitest
  // discovers e2e specs (because vitest defaults to *.test.ts AND *.spec.ts)
  // and imports them in Node, where @playwright/test fails to load.
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
