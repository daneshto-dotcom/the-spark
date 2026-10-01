/**
 * S192 `s192/visuals` — **MECHANICAL GUARDS FOR THE FX SUBSTRATE.**
 *
 * 1. No render effect calls `Math.random`. Every file under `src/render/**` is scanned (comments
 *    stripped); the only allowed callers are named below, each for a reason that is not an effect.
 *    A new caller fails this test until it is either made deterministic or argued into the list.
 * 2. The fx LAYOUTS are pure: no Pixi, no DOM, no clock — so the suite can run them, and so they
 *    cannot drift between two screens.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RENDER = join(__dirname, '..');
const ROOT = join(RENDER, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** Callers that are NOT effects. Each is a reason, not a convenience. */
const MATH_RANDOM_ALLOWED: Readonly<Record<string, string>> = {
  // A leaderboard run id: uniqueness across players is the point; it is never drawn.
  'src/render/arcadeScores.ts': 'a unique run id',
  // The NONET menu's decorative background drift, on a local-only overlay with no shared board.
  'src/render/sudokuOverlay.ts': 'local menu decoration',
};

describe('S192 fx guards', () => {
  const files = walk(RENDER).map((p) => ({ path: relative(ROOT, p).split('\\').join('/'), text: strip(readFileSync(p, 'utf8')) }));

  it('anti-vacuity: the walk sees the render tree and the new fx folder', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.path === 'src/render/fx/sapFx.ts')).toBe(true);
  });

  it('⛔ no render module calls Math.random, except the named non-effect callers', () => {
    const callers = files.filter((f) => /Math\.random\s*\(/.test(f.text)).map((f) => f.path).sort();
    expect(callers).toEqual(Object.keys(MATH_RANDOM_ALLOWED).sort());
  });

  it('⛔ S192 audit V-2 — nothing normal-blend (smoke, soot, stains) is ever emitted on the bloomed TOP layer', () => {
    const layouts = files.filter((f) => /^src\/render\/fx\/\w+Fx\.ts$/.test(f.path));
    for (const f of layouts) {
      const topEmits = [...f.text.matchAll(/\btop\.emit\(([^;]*)\);/g)].map((m) => m[1]!);
      for (const e of topEmits) expect(e, `${f.path}: a normal-blend sprite on the bloomed layer`).not.toMatch(/'normal'/);
    }
  });

  it('⛔ the fx layouts are pure: no pixi, no DOM, no wall clock, no Math.random', () => {
    const layouts = files.filter((f) => /^src\/render\/fx\/(emitter|fxState|\w+Fx)\.ts$/.test(f.path));
    expect(layouts.length, 'emitter + fxState + every *Fx layout').toBeGreaterThanOrEqual(4);
    for (const f of layouts) {
      expect(f.text, `${f.path} imports pixi`).not.toMatch(/from 'pixi/);
      expect(f.text, `${f.path} touches the DOM`).not.toMatch(/\bdocument\.|\bwindow\./);
      expect(f.text, `${f.path} reads a clock`).not.toMatch(/performance\.now|Date\.now/);
      expect(f.text, `${f.path} rolls Math.random`).not.toMatch(/Math\.random/);
    }
  });
});
