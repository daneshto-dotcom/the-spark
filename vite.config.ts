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
/*
 * ⭐ S158 P8 — THE THREE TURN KEYS ARE ALWAYS DEFINED, SO THE BUILD IS REPRODUCIBLE.
 *
 * ⛔ THIS IS A FIX FOR A REGRESSION S158 P1 CAUSED, caught by `npm run verify-deploy` at the session
 * close and worth recording rather than quietly patching.
 *
 * P1 gave the CI build step an `env:` block so repository secrets can reach the bundle. GitHub
 * expressions always produce a STRING, so an unset secret arrives as `''` rather than as nothing —
 * and Vite inlines `import.meta.env` as an object literal containing exactly the VITE_ keys it found.
 * CI therefore emitted `{VITE_TURN_URLS: "", …}` while a plain local build emitted an object without
 * those keys at all. Same source, same behaviour, **different bytes** — measured: CI shipped
 * `index-BpAMsFnW.js`, a local build produced `index-C3Yn9Lmv.js`.
 *
 * That broke `verify-deploy`'s LIVE carrier, which proves the deployed bundle IS the bundle you built
 * by comparing content hashes. A gate that cries wolf on every green deploy is worse than no gate:
 * it trains its reader to skip the one run where it is right.
 *
 * Declaring the keys here makes them present with the same value in EVERY environment — a bare local
 * build, a `.env` dev build and a CI build with unset secrets all agree. The build now states its
 * inputs instead of inheriting whatever the ambient environment happens to define, which is the
 * property a deploy verifier needs in order to mean anything.
 *
 * ⚠ Once real credentials ARE set, CI's bundle legitimately differs from a local build without them —
 * it contains a relay and the local one does not. That is a true difference, not this bug, and
 * `verify-deploy` should be run with the same `.env` in place (see TURN_SETUP.md § Local development).
 */
const TURN_ENV_KEYS = ['VITE_TURN_URLS', 'VITE_TURN_USERNAME', 'VITE_TURN_CREDENTIAL'] as const;
const turnDefines = Object.fromEntries(
  TURN_ENV_KEYS.map((k) => [`import.meta.env.${k}`, JSON.stringify(process.env[k] ?? '')]),
);

export default defineConfig({
  define: turnDefines,
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
