/**
 * SPARK — S192 T15: AUDIO IS CLIENT-ONLY PRESENTATION. The sim cannot reach it.
 *
 * The voice cap and the loop region read `AudioContext.currentTime`, a wall-ish clock. That is only
 * safe because nothing the host simulates (or the worker re-simulates) can import them. This walks the
 * RUNTIME import graph (type-only imports erased) from every sim entry and fails if any audio module
 * is reachable — the reducer-wide version of this is `state/reducerRenderBoundary.test.ts`; this one
 * adds the host tick and both worker entries, and names the audio files explicitly.
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SIM_ROOTS = ['state/world.ts', 'state/hostTick.ts', 'state/workerSim.ts', 'simWorker.ts'];
const AUDIO_FILES = ['render/audioManager.ts', 'render/musicLoop.ts', 'render/sfxVoices.ts', 'render/raceMusic.ts'];

function runtimeRelativeImports(src: string): string[] {
  const specs: string[] = [];
  const stmtRe = /(?:^|\n)[ \t]*(?:import|export)\b([\s\S]*?);/g;
  for (let m; (m = stmtRe.exec(src)); ) {
    const body = m[1]!;
    if (/^\s+type\b/.test(body)) continue;
    const fromM = /\bfrom\s*['"]([^'"]+)['"]/.exec(body);
    if (fromM) { specs.push(fromM[1]!); continue; }
    const sideM = /^\s*['"]([^'"]+)['"]/.exec(body);
    if (sideM) specs.push(sideM[1]!);
  }
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m; (m = dynRe.exec(src)); ) specs.push(m[1]!);
  return specs.filter((s) => s.startsWith('.'));
}

const rel = (abs: string): string => relative(SRC, abs).split(sep).join('/');

/**
 * Every file reachable from `root` at runtime, mapped to the chain that reached it.
 *
 * ⛔ S192 audit A6 — AN IMPORT THE WALKER CANNOT READ IS A FAILURE, NOT A SKIP. It used to `continue`,
 * so a renamed file, an extensionless specifier or a moved directory silently pruned that whole
 * subtree from the walk — and an audio import hiding under it would have left this guard green.
 */
function reachable(root: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const stack: Array<{ file: string; chain: string[] }> = [{ file: resolve(SRC, root), chain: [root] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    const key = rel(file);
    if (seen.has(key)) continue;
    seen.set(key, chain);
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`audioSimBoundary: cannot read ${key} (reached via ${chain.join(' → ')}): ${String(err)}`);
    }
    for (const spec of runtimeRelativeImports(src)) {
      const target = resolve(dirname(file), spec);
      stack.push({ file: target, chain: [...chain, rel(target)] });
    }
  }
  return seen;
}

describe('S192 T15 — no sim entry reaches an audio module at runtime', () => {
  for (const root of SIM_ROOTS) {
    it(`${root} cannot reach ${AUDIO_FILES.join(', ')}`, () => {
      const r = reachable(root);
      expect(r.size, `${root} parsed nothing — the walker is broken, not the boundary clean`).toBeGreaterThan(5);
      for (const audio of AUDIO_FILES) {
        const chain = r.get(audio);
        expect(chain, chain ? `sim → audio: ${chain.join(' → ')}` : undefined).toBeUndefined();
      }
    });
  }

  it('NEGATIVE CONTROL (A6): an unresolvable import THROWS, it does not prune the walk', () => {
    expect(() => reachable('render/__does_not_exist__.ts')).toThrow(/cannot read render\/__does_not_exist__\.ts/);
  });

  it('POSITIVE CONTROL: from main.ts (the client) the walker DOES reach audioManager', () => {
    expect(reachable('main.ts').has('render/audioManager.ts')).toBe(true);
  });
});
