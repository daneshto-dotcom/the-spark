import { defineConfig } from 'vite';

const sessionPort = Number(process.env.SESSION_PORT);
const port = Number.isFinite(sessionPort) && sessionPort > 0 ? sessionPort : 5173;

export default defineConfig({
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
