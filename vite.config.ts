import { defineConfig } from 'vite';

const sessionPort = Number(process.env.SESSION_PORT);
const port = Number.isFinite(sessionPort) && sessionPort > 0 ? sessionPort : 5173;

// S16 P2 Step 1: base='/the-spark/' for GitHub Pages project-page deploy at
// https://daneshto-dotcom.github.io/the-spark/. Step 2 (S17 ready-to-ship)
// flips base='/' + adds public/CNAME for custom domain spark-online.space.
// Dev server is unaffected (base only applies at build time).
export default defineConfig({
  base: '/the-spark/',
  server: {
    port,
    strictPort: false,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
