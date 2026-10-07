/**
 * S196 #16 — ⛔ THE MATCH TRIAL IS UNTOUCHED BY THE NONET HOME.
 *
 * `stateHashFull.ts` hashes `JSON.stringify(world.sudoku)`, which INCLUDES the generated puzzle, so a
 * change to what the match generates is a cross-sim divergence AND a protocol bump
 * (`S195_NONET_HOME_OPTIONS.md` §(a).10). The home must call the generator with the match's own
 * single argument, and R182-H's difficulty dial (the second argument) stays unwired everywhere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSudoku, SUDOKU_DEFAULT_GIVENS } from '../state/sudoku.ts';
import { makeArcadeNonet } from '../render/arcadeOverlay.ts';
import { dailySeed } from './dailySeed.ts';
import { planLaunch } from './nonetModes.ts';

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
  }
  return out;
}

/** Strip comments so a doc mention of `generateSudoku(seed)` is not counted as a call. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every `generateSudoku(...)` CALL in `src` (definitions skipped), with its top-level argument count. */
function callsIn(raw: string): Array<{ args: number; text: string }> {
  const src = code(raw);
  const out: Array<{ args: number; text: string }> = [];
  let i = src.indexOf('generateSudoku(');
  while (i >= 0) {
    const isDef = /function\s+$/.test(src.slice(Math.max(0, i - 12), i));
    let depth = 0;
    let commas = 0;
    let j = i + 'generateSudoku'.length;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        depth--;
        if (depth === 0) break;
      } else if (c === ',' && depth === 1) commas++;
    }
    if (!isDef) out.push({ args: commas + 1, text: src.slice(i, j + 1) });
    i = src.indexOf('generateSudoku(', j);
  }
  return out;
}

function generatorCalls(): Array<{ file: string; args: number; text: string }> {
  return walk(SRC).flatMap((f) => callsIn(readFileSync(f, 'utf8')).map((c) => ({ file: relative(SRC, f).split('\\').join('/'), ...c })));
}

describe('S196 — ⛔ the match call is still single-argument (and so is every other call)', () => {
  const calls = generatorCalls();

  it('anti-vacuity: the scan finds the match trial, the snapshot regen and the arcade', () => {
    const files = calls.map((c) => c.file).sort();
    expect(files).toEqual(['render/arcadeOverlay.ts', 'state/save.ts', 'state/sudokuEvent.ts']);
  });

  it('the match trial (`sudokuEvent.ts`) and its snapshot regen (`save.ts`) pass exactly the seed', () => {
    expect(calls.find((c) => c.file === 'state/sudokuEvent.ts')?.text).toBe('generateSudoku(seed)');
    expect(calls.find((c) => c.file === 'state/save.ts')?.text).toBe('generateSudoku(snap.sudoku.seed)');
  });

  it('R182-H: no production call passes the difficulty dial', () => {
    expect(calls.filter((c) => c.args !== 1)).toEqual([]);
  });

  it('negative control: the scanner DOES count a second argument when one is present', () => {
    // Guard the guard — the SAME parser, fed a dial call, a nested call, a definition and a comment.
    expect(callsIn('const x = generateSudoku(seed, 12);')).toEqual([{ args: 2, text: 'generateSudoku(seed, 12)' }]);
    expect(callsIn('generateSudoku(mix(a, b))')[0]!.args).toBe(1);
    expect(callsIn('generateSudoku(mix(a, b), 10)')[0]!.args).toBe(2);
    expect(callsIn('export function generateSudoku(seed: number, t = 16) {}')).toEqual([]);
    expect(callsIn('// generateSudoku(seed, 12)\n/* generateSudoku(a, b) */')).toEqual([]);
  });

  it('src/nonet never calls the generator itself — every NONET home puzzle goes through makeArcadeNonet', () => {
    expect(calls.some((c) => c.file.startsWith('nonet/'))).toBe(false);
  });
});

describe('S196 — a home puzzle is the shipped generator at its default givens', () => {
  it('DAILY / PLAY / ZEN puzzles = generateSudoku(seed), 16 givens', () => {
    for (const door of ['PLAY', 'DAILY', 'ZEN'] as const) {
      const p = planLaunch(door, 4242, Date.UTC(2026, 9, 7), null);
      const ev = makeArcadeNonet(p.seed);
      expect(ev.puzzle).toEqual(generateSudoku(p.seed));
      expect(ev.puzzle.givens.filter((g) => g !== 0).length).toBe(SUDOKU_DEFAULT_GIVENS);
    }
    expect(makeArcadeNonet(dailySeed('20261007')).puzzle.seed).toBe(dailySeed('20261007'));
  });
});
