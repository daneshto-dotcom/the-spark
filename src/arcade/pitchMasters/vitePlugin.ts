/**
 * PITCH MASTERS (arcade) — builds the `/pitch-masters/` page as its OWN Vite pass, after SPARK's.
 *
 * Why not a second `rollupOptions.input`: SPARK's `main.ts` statically imports Trystero and
 * `net/iceConfig.ts`, and so does this page. One Rollup graph with two entries would hoist those
 * shared modules out of SPARK's index chunk into a shared chunk: a different index chunk, a new
 * modulepreload, and a bundle-charter number that no longer measures what it says. A separate pass
 * leaves SPARK's output byte-identical.
 *
 * The pass gets the SAME `define` block (the VITE_TURN_* keys), so the deployed page inherits the
 * TURN relay SPARK's CI build injects. Output: `dist/pitch-masters/index.html` +
 * `dist/pitch-masters/assets/*`. The Godot files come from `public/pitch-masters/game/` through
 * SPARK's normal public-dir copy.
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/`.
 */

import { build, type Plugin } from 'vite';

export function pitchMastersPage(define: Record<string, string>): Plugin {
  let root = '';
  let outDir = '';
  let done = false;
  return {
    name: 'pitch-masters-page',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    async closeBundle() {
      if (done) return;
      done = true;
      await build({
        configFile: false,
        root,
        base: '/',
        define,
        publicDir: false,
        logLevel: 'warn',
        build: {
          target: 'es2022',
          sourcemap: true,
          outDir: outDir.startsWith('/') || /^[A-Za-z]:/.test(outDir) ? outDir : `${root}/${outDir}`,
          emptyOutDir: false,
          assetsDir: 'pitch-masters/assets',
          rollupOptions: { input: { pitchMasters: `${root}/pitch-masters/index.html` } },
        },
      });
    },
  };
}
