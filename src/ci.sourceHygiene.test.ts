/**
 * SPARK — S182: no binary bytes in source files.
 *
 * ⛔ WHY THIS IS A POLICY GUARD AND NOT A ONE-LINE FIX.
 *
 * `arcadeScores.ts` shipped with **two raw NUL bytes (0x00)** committed inside a template literal —
 * an intended `\u0000` separator written as the literal character. It compiled, it ran, every test
 * passed, and the damage was entirely to the TOOLING: `grep` classifies a file containing a NUL as
 * BINARY and prints `Binary file ... matches` instead of the matching lines.
 *
 * That matters more here than it would in most repos, because **grep-based auditing is this
 * project's primary verification method.** The four-sites rule, the "enumerate a rule's call sites
 * before claiming it is applied" rule, and every `ci.*.test.ts` source-text tripwire are all built
 * on being able to read source as text. One invisible byte silently removes a file from all of it.
 *
 * Fixing the instance would leave the next one to be found by accident. This scans every source file
 * instead, so the class cannot come back.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTS = ['.ts', '.js', '.mjs', '.sql', '.toml', '.json', '.yml', '.md'];
const SKIP = new Set(['node_modules', 'dist', '.git', 'public', 'playwright-report', 'test-results']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

describe('S182 — source files are TEXT, so grep-based auditing keeps working', () => {
  const files = sourceFiles(join(ROOT, 'src'))
    .concat(sourceFiles(join(ROOT, 'server')))
    .concat(sourceFiles(join(ROOT, 'scripts')));

  it('CONTROL — the scan actually found files (else every assertion below is vacuous)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('⛔ no source file contains a NUL byte', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const buf = readFileSync(f);
      if (buf.includes(0)) offenders.push(f.slice(ROOT.length).split('\\').join('/'));
    }
    expect(
      offenders,
      'a NUL byte makes grep treat the file as binary and print "Binary file matches" instead of ' +
        'the matching lines — which silently removes it from every source-text audit in this repo. ' +
        'Write \u0000 as an escape sequence instead of the literal character.',
    ).toEqual([]);
  });
});
