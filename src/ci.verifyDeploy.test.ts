/**
 * SPARK — ⭐ S196 (s196/ci) — `scripts/verify-deploy.mjs`'s two false FAILs, pinned.
 *
 *   F5       — an abbreviated `--sha` failed REMOTE (and found no RUN) for a deploy that had landed: it was
 *              compared character-for-character with full 40-hex SHAs. Now expanded by `git rev-parse`.
 *   S196-#4  — LIVE compared prod with a STALE local `dist/` (built before the merge it was meant to hold)
 *              and said "prod is NOT what you built". Now its own verdict: LOCAL BUILD STALE, exit 3.
 *
 * `resolveSha` runs against THIS repo's real git; the freshness check against a real temp tree with set
 * mtimes; `runVerify` (all four carriers) with git-remote / gh / network injected, so the REACH tests drive
 * the script's real decision path, not a copy of it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Result = { carrier: string; ok: boolean; detail: string; status: 'PASS' | 'FAIL' | 'STALE' };
type Fresh = { known: boolean; stale: boolean; detail: string };
type VerifyDeploy = {
  EXIT_PASS: number;
  EXIT_FAIL: number;
  EXIT_STALE: number;
  resolveSha(input: string | null, git: (args: string[]) => string): { sha: string; error: string | null };
  deployPathspecs(yml: string): string[] | null;
  localBuildFreshness(root: string): Fresh;
  runVerify(deps: {
    argv?: string[];
    sh?: (cmd: string, args: string[]) => string;
    fetchImpl?: (url: string | URL, init?: unknown) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
    freshness?: () => Fresh;
    readLocal?: (p: string) => string | null;
    log?: (s: string) => void;
  }): Promise<{ results: Result[]; exitCode: number }>;
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// a dynamic import of a computed URL: the script is plain .mjs outside `src`, so no declaration file is needed
const load = async (): Promise<VerifyDeploy> =>
  (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'scripts/verify-deploy.mjs')).href)) as VerifyDeploy;
const realGit = (args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('S196 F5 — an abbreviated --sha is expanded before any carrier compares it', () => {
  it('REACH (this repo\'s real git): the 8-char HEAD resolves to the full 40-hex HEAD; no --sha → HEAD', async () => {
    const v = await load();
    const head = realGit(['rev-parse', 'HEAD']);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(v.resolveSha(head.slice(0, 8), realGit)).toEqual({ sha: head, error: null });
    expect(v.resolveSha(null, realGit)).toEqual({ sha: head, error: null });
  });
  it('NEGATIVE: a SHA this clone does not have is an error that says why, not a silent mismatch', async () => {
    const v = await load();
    const r = v.resolveSha('0000000', realGit);
    expect(r.error).toMatch(/does not resolve to a commit/);
  });
});

describe('S196 — the stale-dist check (`localBuildFreshness`) on a real tree', () => {
  let dir: string;
  const at = (rel: string, secondsAgo: number): void => {
    const t = new Date(Date.now() - secondsAgo * 1000);
    utimesSync(join(dir, rel), t, t);
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spark-vd-'));
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    copyFileSync(join(ROOT, '.github/workflows/deploy.yml'), join(dir, '.github/workflows/deploy.yml'));
    mkdirSync(join(dir, 'dist'));
    mkdirSync(join(dir, 'src/state'), { recursive: true });
    writeFileSync(join(dir, 'dist/index.html'), '<html></html>');
    writeFileSync(join(dir, 'src/state/world.ts'), 'export {};');
    writeFileSync(join(dir, 'index.html'), '<html></html>');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('the inputs are deploy.yml\'s own paths filter (parsed, not copied)', async () => {
    const v = await load();
    const specs = v.deployPathspecs(execFileSync('git', ['show', 'HEAD:.github/workflows/deploy.yml'], { cwd: ROOT, encoding: 'utf8' }));
    // ⛔ S196 — this assertion found a real bug: the parser stopped at the S162 comment inside the list and
    // returned ['src', 'public'] only, so the RUN carrier's "none OWED" ignored 7 of the 9 trigger paths.
    expect(specs).toEqual(['src', 'public', 'scripts', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json', '.github/workflows/deploy.yml']);
  });
  it('REACH: a source file changed AFTER the build → stale, naming the file', async () => {
    const v = await load();
    at('index.html', 600);
    at('dist/index.html', 300);
    at('src/state/world.ts', 60); // the merge landed after the build — the S196-#4 shape
    const f = v.localBuildFreshness(dir);
    expect(f.known).toBe(true);
    expect(f.stale).toBe(true);
    expect(f.detail).toMatch(/src\/state\/world\.ts/);
  });
  it('NEGATIVE: a build newer than every input is not stale; the workflow file alone never makes it stale', async () => {
    const v = await load();
    at('index.html', 600);
    at('src/state/world.ts', 500);
    at('dist/index.html', 60);
    at('.github/workflows/deploy.yml', 1); // newer than dist, but it never reaches the bundle
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/verify-deploy.mjs'), '');
    at('scripts/verify-deploy.mjs', 1); // nor does a gate script
    expect(v.localBuildFreshness(dir)).toMatchObject({ known: true, stale: false });
  });
  it('REACH: a dependency change (package-lock.json, a path the old parser dropped) after the build → stale', async () => {
    const v = await load();
    at('index.html', 600);
    at('src/state/world.ts', 500);
    at('dist/index.html', 300);
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    at('package-lock.json', 10);
    expect(v.localBuildFreshness(dir)).toMatchObject({ known: true, stale: true });
  });
  it('no dist/ → unknown (the LIVE carrier then fails on "dist/index.html missing", as before)', async () => {
    const v = await load();
    rmSync(join(dir, 'dist'), { recursive: true });
    expect(v.localBuildFreshness(dir)).toMatchObject({ known: false, stale: false });
  });
});

describe('S196 — REACH through `runVerify` (all four carriers; git-remote, gh and the network injected)', () => {
  const FULL = 'c78f5c58' + 'a'.repeat(32);
  const LOCAL_ASSET = 'index-LOCAL123.js';
  const LIVE_ASSET = 'index-LIVE4567.js';
  const fetched: string[] = [];
  const deps = (opts: { argv?: string[]; live?: string; stale?: boolean; remote?: string }) => ({
    argv: opts.argv ?? ['--sha', 'c78f5c58'],
    sh: (cmd: string, args: string[]): string => {
      if (cmd === 'git' && args[0] === 'rev-parse') {
        if (args.includes('HEAD') || args.some((a) => a.startsWith('c78f5c58'))) return FULL;
        throw new Error('unknown revision');
      }
      if (cmd === 'git' && args[0] === 'ls-remote') return `${opts.remote ?? FULL}\trefs/heads/master`;
      if (cmd === 'gh') return JSON.stringify([{ sha: FULL, status: 'completed', conclusion: 'success', id: 1, event: 'push' }]);
      throw new Error(`unexpected ${cmd} ${args.join(' ')}`);
    },
    fetchImpl: async (url: string | URL) => {
      fetched.push(String(url));
      return { ok: true, status: 200, text: async () => `<script type="module" src="/the-spark/assets/${opts.live ?? LIVE_ASSET}"></script>` };
    },
    freshness: () => ({ known: true, stale: opts.stale ?? false, detail: 'dist/index.html was built 42 s BEFORE src/main.ts last changed' }),
    readLocal: (p: string) => (p === 'dist/index.html' ? `<script type="module" crossorigin src="/the-spark/assets/${LOCAL_ASSET}"></script>` : null),
    log: () => undefined,
  });
  beforeEach(() => {
    fetched.length = 0;
  });
  const byCarrier = (r: Result[]) => Object.fromEntries(r.map((x) => [x.carrier, x.status]));

  it('F5 REACH: `--sha c78f5c58` (8 chars) → REMOTE, RUN and VERDICT all PASS against full SHAs', async () => {
    const v = await load();
    const { results, exitCode } = await v.runVerify(deps({ live: LOCAL_ASSET }));
    expect(byCarrier(results)).toEqual({ REMOTE: 'PASS', RUN: 'PASS', VERDICT: 'PASS', LIVE: 'PASS' });
    expect(exitCode).toBe(v.EXIT_PASS);
  });
  it('F5 NEGATIVE: a remote that really moved still FAILS REMOTE, abbreviated or not', async () => {
    const v = await load();
    const { results, exitCode } = await v.runVerify(deps({ live: LOCAL_ASSET, remote: 'f'.repeat(40) }));
    expect(byCarrier(results).REMOTE).toBe('FAIL');
    expect(exitCode).toBe(v.EXIT_FAIL);
  });
  it('S196-#4 REACH: live ≠ local AND dist/ stale → LIVE is STALE (not FAIL), exit 3, and the injection diagnosis is never consulted', async () => {
    const v = await load();
    const { results, exitCode } = await v.runVerify(deps({ stale: true }));
    expect(byCarrier(results)).toEqual({ REMOTE: 'PASS', RUN: 'PASS', VERDICT: 'PASS', LIVE: 'STALE' });
    expect(results.find((r) => r.carrier === 'LIVE')!.detail).toMatch(/LOCAL BUILD STALE: dist\/index\.html was built 42 s BEFORE/);
    expect(exitCode).toBe(v.EXIT_STALE);
    expect(exitCode).not.toBe(v.EXIT_PASS);
    expect(fetched.filter((u) => u.includes('/assets/')), 'no live-asset fetch: the diagnosis was skipped').toEqual([]);
  });
  it('NEGATIVE: live ≠ local with a FRESH dist/ is still a hard FAIL — the stale verdict cannot launder a bad deploy', async () => {
    const v = await load();
    const { results, exitCode } = await v.runVerify(deps({ stale: false }));
    expect(byCarrier(results).LIVE).toBe('FAIL');
    expect(exitCode).toBe(v.EXIT_FAIL);
  });
  it('NEGATIVE: STALE plus any other failing carrier is a FAIL (exit 1), never the softer exit 3', async () => {
    const v = await load();
    const { exitCode } = await v.runVerify(deps({ stale: true, remote: 'f'.repeat(40) }));
    expect(exitCode).toBe(v.EXIT_FAIL);
  });
  it('a MATCHING live hash passes even when the clocks call dist/ stale — byte equality outranks mtimes', async () => {
    const v = await load();
    const { exitCode } = await v.runVerify(deps({ stale: true, live: LOCAL_ASSET }));
    expect(exitCode).toBe(v.EXIT_PASS);
  });
});
