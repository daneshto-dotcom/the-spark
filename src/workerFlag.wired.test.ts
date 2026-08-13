/**
 * SPARK — S143 P1: THE WORKER FLAG IS READ IN EXACTLY ONE PLACE, AND BOTH HOST INTENT PATHS
 * ARE WORKER-AWARE.
 *
 * ## Why these are filesystem scans and not behavioural tests
 *
 * Both defects this file guards were invisible to every behavioural test in the repo, for the
 * same reason: they are properties of WHICH CODE CALLS WHICH, not of what any function returns.
 *
 *   1. `probeHarness` asked `get('worker') === '1'` when it needed "is the worker active?".
 *      Its 19 unit tests all passed, because they exercise the harness in the regime where the
 *      two questions happen to agree. A unit test of the new shared predicate does not help
 *      either — the predicate can be perfect while the harness goes on not calling it. Only a
 *      scan can assert the ABSENCE of a second, independent parse.
 *
 *   2. The migration successor open-coded `dispatch(world, stamped)` while the original host
 *      routed through a worker-aware thunk. Both are correct today (a promoted host has no
 *      driver), so no test could distinguish them; the divergence only becomes a bug in a
 *      regime that does not exist yet. Again: a property of the call graph.
 *
 * This is the `damage.wired.test.ts` idiom — that file exists because a fully-tested damage
 * dispatcher shipped with zero production call sites for an entire session. Same failure class:
 * everything static-parses, nothing is wired.
 *
 * ## What a failure here means
 *
 * NOT "adjust the regex". A failure means someone has reintroduced an independent reading of the
 * worker flag, or made a host apply path that bypasses the worker route — and the next default-on
 * flip will silently arm a broken instrument or drop every remote player's input on a promoted
 * host. Route the new call site through `workerFlag.ts` / `applyRemoteIntentAuthoritatively`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;

/** Every non-test .ts file under src/, recursively. */
function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) productionFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/**
 * Strip line and block comments, so a docblock QUOTING the old broken expression — as several in
 * this change deliberately do, to record what was wrong — cannot masquerade as a live parse. The
 * repo has been bitten by the inverse (an assertion matching the comment that explains the code
 * rather than the code itself), so every scan here runs on comment-free source.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const FLAG_MODULE = join(SRC, 'workerFlag.ts');

describe('S143 P1 — the sim-worker flag has exactly one reader', () => {
  const files = productionFiles(SRC);

  it('finds production files to scan (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('NO production file outside workerFlag.ts parses the `worker` URL param itself', () => {
    // The exact shape of the original bug: a second, independent reading of the flag that goes
    // on answering the old question after the default moves.
    const rogue = files
      .filter((f) => f !== FLAG_MODULE)
      .filter((f) => /\.get\(\s*['"`]worker['"`]\s*\)/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));

    expect(
      rogue,
      `these files parse ?worker= directly instead of calling isSimWorkerRequested(): ${rogue.join(', ')}`,
    ).toEqual([]);
  });

  it('both known consumers call the shared predicate', () => {
    // Named explicitly rather than counted, so deleting one consumer and adding an unrelated
    // caller elsewhere cannot keep this green.
    for (const rel of [join('main.ts'), join('dev', 'probeHarness.ts')]) {
      const src = stripComments(readFileSync(join(SRC, rel), 'utf8'));
      expect(
        /\bisSimWorkerRequestedHere\s*\(/.test(src),
        `${rel} no longer calls isSimWorkerRequestedHere()`,
      ).toBe(true);
    }
  });

  it('the probe harness refuses to arm on WORKER ACTIVATION, not on a URL spelling', () => {
    const src = stripComments(readFileSync(join(SRC, 'dev', 'probeHarness.ts'), 'utf8'));
    // The guard and the predicate must be the same expression. If someone reintroduces a literal
    // comparison here the harness arms while the worker owns the world.
    expect(/if\s*\(\s*isSimWorkerRequestedHere\s*\(\s*\)\s*\)/.test(src)).toBe(true);
    expect(/===\s*['"`]1['"`]/.test(src)).toBe(false);
  });
});

describe('S143 P1 — every host INTENT apply path is worker-aware', () => {
  const mainSrc = stripComments(readFileSync(join(SRC, 'main.ts'), 'utf8'));

  it('the shared authoritative-apply thunk exists', () => {
    expect(/const\s+applyRemoteIntentAuthoritatively\s*=/.test(mainSrc)).toBe(true);
    // It must actually consult the worker, not merely exist.
    const body = /const\s+applyRemoteIntentAuthoritatively\s*=[\s\S]{0,400}/.exec(mainSrc)?.[0] ?? '';
    expect(/workerSimActive\s*\(\s*\)/.test(body)).toBe(true);
    expect(/postIntent\s*\(/.test(body)).toBe(true);
  });

  it('the migration successor does NOT dispatch a remote intent straight into `world`', () => {
    // The precise expression that shipped: `dispatch(world, stamped)` in the TAKEOVER handler.
    expect(
      /\bdispatch\s*\(\s*world\s*,\s*stamped\s*\)/.test(mainSrc),
      'the migration-successor INTENT arm bypasses the worker route again (see this file\'s docblock)',
    ).toBe(false);
  });

  it('the migration successor routes through the shared thunk', () => {
    expect(/applyRemoteIntentAuthoritatively\s*\(\s*stamped\s*\)/.test(mainSrc)).toBe(true);
  });

  it('the original host path routes through the same thunk', () => {
    expect(/dispatchAction:\s*applyRemoteIntentAuthoritatively/.test(mainSrc)).toBe(true);
  });
});
