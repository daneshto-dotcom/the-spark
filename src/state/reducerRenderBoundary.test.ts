/**
 * SPARK — reducer-core ↔ render import-boundary guard (S61 P2 §XV determinism).
 *
 * The deterministic REDUCER CORE (world.ts dispatch + every apply* action
 * module it transitively pulls) must NEVER import a render module at RUNTIME:
 * a render import drags in Pixi + DOM/GPU side effects and would make the
 * reducer non-deterministic, breaking save.replay and host↔client snapshot
 * sync. This test walks world.ts's transitive RUNTIME import graph and fails
 * if any path reaches src/render/.
 *
 * Hardened per the S61 Council (Grok + Gemini both flagged it): a shallow
 * "does this file's text mention ../render/" check gives false confidence — it
 * misses TRANSITIVE coupling (state → util → render) and dynamic import(). So
 * this walks the FULL graph (static imports, value re-exports, dynamic
 * import(), side-effect imports) and IGNORES `import type` / `export type`
 * (erased at runtime → zero determinism cost, a legitimate render-type ref).
 *
 * There is deliberately NO filename allowlist. godlyOrchestration.ts (the
 * cinematic ticker-glue seam — a documented state→render exception) is simply
 * NOT reachable from world.ts's dispatch graph (it is wired from main.ts, not
 * from dispatch). If a reducer ever imports it — or anything render-bound — at
 * runtime, that IS a real violation and this guard reports the offending chain.
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const STATE_DIR = dirname(fileURLToPath(import.meta.url)); // src/state
const SRC_DIR = resolve(STATE_DIR, '..'); // src
const RENDER_DIR = resolve(SRC_DIR, 'render');

/**
 * Entry roots for the scan. world.ts is the dispatch hub — it transitively
 * imports every reducer module — so rooting here covers the whole core.
 */
const ROOTS = ['world.ts'].map((f) => resolve(STATE_DIR, f));

/** Pull RUNTIME relative import specifiers from a source file (type-only skipped). */
function runtimeRelativeImports(src: string): string[] {
  const specs: string[] = [];
  // Whole import/export statements, bounded at the terminating semicolon.
  const stmtRe = /(?:^|\n)[ \t]*(?:import|export)\b([\s\S]*?);/g;
  for (let m; (m = stmtRe.exec(src)); ) {
    const body = m[1];
    if (/^\s+type\b/.test(body)) continue; // `import type` / `export type` — erased at runtime
    const fromM = /\bfrom\s*['"]([^'"]+)['"]/.exec(body);
    if (fromM) {
      specs.push(fromM[1]);
      continue;
    }
    const sideM = /^\s*['"]([^'"]+)['"]/.exec(body); // side-effect import 'x'
    if (sideM) specs.push(sideM[1]);
  }
  // Dynamic imports anywhere in the file: import('x')
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m; (m = dynRe.exec(src)); ) specs.push(m[1]);
  return specs.filter((s) => s.startsWith('.')); // relative only; bare node_modules ignored
}

function isUnderRender(absPath: string): boolean {
  const r = relative(RENDER_DIR, absPath);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

function toSrcRel(absPath: string): string {
  return relative(SRC_DIR, absPath).split(sep).join('/');
}

/** DFS the runtime import graph; return the first chain reaching src/render/, else null. */
function findRenderCoupling(rootFile: string): string[] | null {
  const visited = new Set<string>();
  const stack: Array<{ file: string; chain: string[] }> = [
    { file: rootFile, chain: [toSrcRel(rootFile)] },
  ];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue; // unresolved (e.g. non-.ts) — nothing to follow
    }
    for (const spec of runtimeRelativeImports(src)) {
      const target = resolve(dirname(file), spec);
      const nextChain = [...chain, toSrcRel(target)];
      if (isUnderRender(target)) return nextChain;
      if (!visited.has(target)) stack.push({ file: target, chain: nextChain });
    }
  }
  return null;
}

describe('reducer-core → render import boundary (S61 P2 §XV determinism guard)', () => {
  for (const root of ROOTS) {
    it(`${toSrcRel(root)} has NO transitive runtime import into src/render/`, () => {
      const chain = findRenderCoupling(root);
      expect(
        chain,
        chain ? `reducer→render coupling found: ${chain.join(' → ')}` : undefined,
      ).toBeNull();
    });
  }
});

/**
 * DETECTOR TEETH — prove the guard above actually parses imports + detects
 * render coupling, so a future regression can't make it silently PASS (the
 * exact false-confidence failure mode Grok + Gemini flagged in CHECK). Without
 * these, a broken parser that returns [] would make every boundary test green.
 */
describe('reducer→render guard — detector self-verification', () => {
  it('parses runtime specifiers and skips type-only / bare modules', () => {
    const sample = [
      "import { a } from './val.ts';",
      "import type { T } from './type-only.ts';",
      "export type { U } from './type-reexport.ts';",
      "export { b } from './val-reexport.ts';",
      "import { type C, d } from './mixed.ts';",
      "import 'pixi.js';",
      "import './side.ts';",
      "const p = import('./dyn.ts');",
      "import { z } from 'vitest';",
    ].join('\n');
    const specs = runtimeRelativeImports(sample);
    expect(specs).toEqual(
      expect.arrayContaining(['./val.ts', './val-reexport.ts', './mixed.ts', './side.ts', './dyn.ts']),
    );
    expect(specs).not.toContain('./type-only.ts'); // erased at runtime
    expect(specs).not.toContain('./type-reexport.ts');
    expect(specs).not.toContain('pixi.js'); // bare module, not relative
    expect(specs).not.toContain('vitest');
  });

  it('classifies src/render/ as out-of-bounds and reducer/domain paths as in-bounds', () => {
    expect(isUnderRender(resolve(STATE_DIR, '../render/audioManager.ts'))).toBe(true);
    expect(isUnderRender(resolve(STATE_DIR, './world.ts'))).toBe(false);
    expect(isUnderRender(resolve(STATE_DIR, '../game/structure.ts'))).toBe(false);
  });

  it('positive control: scanning the godlyOrchestration seam DOES report render coupling', () => {
    // godlyOrchestration.ts is the documented state→render ticker-glue seam (it
    // imports cinematicVignette/codexOverlay/cutsceneOverlay/audioManager at
    // runtime). It is NOT reachable from world.ts's dispatch graph (it CALLS
    // dispatch; main.ts wires it) — but pointed straight at it the walker MUST
    // still see the coupling. This proves the clean result above is real signal,
    // not a parser that silently found nothing.
    const seam = resolve(STATE_DIR, 'godlyOrchestration.ts');
    const chain = findRenderCoupling(seam);
    expect(chain).not.toBeNull();
    expect(chain?.[chain.length - 1]).toMatch(/^render\//);
  });
});
