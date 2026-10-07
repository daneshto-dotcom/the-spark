/**
 * SPARK — ⭐ S196 (s196/ci) — the CI watchdog's own guard (`.github/workflows/ci-watchdog.{yml,mjs}`).
 *
 * F6 (S195 deploy #7): GitHub's hosted pool never gave the `build` job a runner; it concluded `cancelled`
 * after 15 min with ZERO steps, mailed nobody, and the site sat stale until a manual re-run. The fixture
 * below is that job's real shape (run 37368664339 attempt 1, read with `gh api` in S196), annotation
 * verbatim. Pinned here: the decision table, the discriminator that keeps a concurrency-superseded job
 * from being resurrected, the stale-deploy guard, and — through a stubbed `fetch` — that the real I/O
 * path actually POSTs the re-run / the issue (a decision nobody acts on is a source-text guard).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Job = { id?: number; name?: string; conclusion: string | null; steps: unknown[] | null; runner_name: string | null };
type Verdict = { action: 'none' | 'rerun' | 'alert' | 'superseded'; reason: string };
type Watchdog = {
  DEPLOY_WORKFLOW: string;
  E2E_WORKFLOW: string;
  MAX_ATTEMPTS: number;
  isStarvedJob(job: Job, annotations: { message?: string | null }[]): boolean;
  isStarvedCandidate(job: Job): boolean;
  decide(r: { workflowName: string; conclusion: string | null; attempt: number; starvedJobs: string[]; newerDeployRun: boolean }): Verdict;
  alertTitle(workflowName: string, runId: number): string;
  handleRun(runId: number): Promise<Verdict>;
};

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string): string => readFileSync(path(rel), 'utf8').replace(/\r\n/g, '\n');
// a dynamic import of a computed URL: the script is plain .mjs outside `src`, so no declaration file is needed
const load = async (): Promise<Watchdog> => (await import(/* @vite-ignore */ pathToFileURL(path('../.github/workflows/ci-watchdog.mjs')).href)) as Watchdog;

/** run 37368664339 attempt 1, job `build` — the S195 #7 starvation, as `gh api` returned it. */
const STARVED_BUILD: Job = { id: 111959965747, name: 'build', conclusion: 'cancelled', steps: [], runner_name: '' };
const STARVED_ANNOTATIONS = [
  { message: 'The job was not acquired by Runner of type hosted even after multiple attempts' },
  { message: '"The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026. …"' },
];

describe('S196 F6 — which job is "starved"', () => {
  it('REACH (real fixture): the S195 #7 build job is starved', async () => {
    const w = await load();
    expect(w.isStarvedCandidate(STARVED_BUILD)).toBe(true);
    expect(w.isStarvedJob(STARVED_BUILD, STARVED_ANNOTATIONS)).toBe(true);
  });
  it('NEGATIVE: a job cancelled before it started because a newer push superseded it — same shape, no annotation — is NOT', async () => {
    const w = await load();
    expect(w.isStarvedCandidate(STARVED_BUILD)).toBe(true); // the cheap half cannot tell them apart …
    expect(w.isStarvedJob(STARVED_BUILD, [STARVED_ANNOTATIONS[1]!])).toBe(false); // … the annotation can
    expect(w.isStarvedJob(STARVED_BUILD, [])).toBe(false);
  });
  it('NEGATIVE: a job that ran (steps, or a runner) is never starved, whatever its annotations say', async () => {
    const w = await load();
    expect(w.isStarvedJob({ ...STARVED_BUILD, steps: [{}] }, STARVED_ANNOTATIONS)).toBe(false);
    expect(w.isStarvedJob({ ...STARVED_BUILD, runner_name: 'GitHub Actions 1000008809' }, STARVED_ANNOTATIONS)).toBe(false);
    expect(w.isStarvedJob({ ...STARVED_BUILD, conclusion: 'skipped' }, STARVED_ANNOTATIONS)).toBe(false);
  });
});

describe('S196 F6 — the decision table', () => {
  const base = { conclusion: 'failure', attempt: 1, starvedJobs: ['build'], newerDeployRun: false };
  it('starved → re-run until MAX_ATTEMPTS, then alert', async () => {
    const w = await load();
    expect(w.MAX_ATTEMPTS).toBe(3);
    for (const wf of [w.DEPLOY_WORKFLOW, w.E2E_WORKFLOW]) {
      expect(w.decide({ ...base, workflowName: wf, attempt: 1 }).action).toBe('rerun');
      expect(w.decide({ ...base, workflowName: wf, attempt: 2 }).action).toBe('rerun');
      expect(w.decide({ ...base, workflowName: wf, attempt: 3 }).action).toBe('alert');
    }
  });
  it('⛔ a starved DEPLOY with a newer deploy run is left alone (re-running it would publish an older bundle)', async () => {
    const w = await load();
    expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, newerDeployRun: true }).action).toBe('superseded');
  });
  it('a deploy that ended cancelled / timed_out WITHOUT starving still alerts (the silent-death class); an e2e one does not', async () => {
    const w = await load();
    for (const c of ['cancelled', 'timed_out']) {
      expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, conclusion: c, starvedJobs: [] }).action).toBe('alert');
      expect(w.decide({ ...base, workflowName: w.E2E_WORKFLOW, conclusion: c, starvedJobs: [] }).action).toBe('none');
    }
  });
  it('NEGATIVE: green, in-flight, ordinary reds and unwatched workflows are never touched', async () => {
    const w = await load();
    for (const c of ['success', 'skipped', 'neutral', null]) {
      expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, conclusion: c }).action).toBe('none');
    }
    expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, starvedJobs: [] }).action).toBe('none'); // failure mails itself
    expect(w.decide({ ...base, workflowName: 'CI watchdog' }).action).toBe('none');
  });
});

describe('S196 F6 — the workflow file is wired to the names and powers the script needs', () => {
  const yml = read('../.github/workflows/ci-watchdog.yml');
  it('watches the two workflows by their EXACT `name:` (a renamed workflow silently drops out of workflow_run)', async () => {
    const w = await load();
    const nameOf = (f: string): string => /^name:\s*(.+?)\s*$/m.exec(read(f))![1]!.replace(/^['"]|['"]$/g, '');
    expect(nameOf('../.github/workflows/deploy.yml')).toBe(w.DEPLOY_WORKFLOW);
    expect(nameOf('../.github/workflows/e2e.yml')).toBe(w.E2E_WORKFLOW);
    const watched = /workflows:\s*\[(.+)\]/.exec(yml)![1]!.split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(watched.sort()).toEqual([w.DEPLOY_WORKFLOW, w.E2E_WORKFLOW].sort());
    expect(yml).toMatch(/types:\s*\[completed\]/);
  });
  it('has the sweep, the permissions, a timeout, and runs the script', () => {
    expect(yml).toMatch(/schedule:\n\s+- cron: '\*\/30 \* \* \* \*'/);
    for (const p of ['actions: write', 'checks: read', 'issues: write']) expect(yml).toContain(p);
    expect(yml).toMatch(/^\s+timeout-minutes: 5$/m);
    expect(yml).toMatch(/run: node \.github\/workflows\/ci-watchdog\.mjs/);
    expect(yml).toMatch(/RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  });
});

describe('S196 F6 — REACH through the real I/O path (fetch stubbed with the GitHub API shapes)', () => {
  type Call = { method: string; url: string; body?: string };
  let calls: Call[];
  let runAttempt: number;
  let newerDeploy: boolean;
  beforeEach(() => {
    calls = [];
    runAttempt = 1;
    newerDeploy = false;
    vi.stubEnv('GITHUB_REPOSITORY', 'o/r');
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubGlobal('fetch', async (url: string, init: { method?: string; body?: string } = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: init.body });
      const u = url.replace('https://api.github.com/repos/o/r', '');
      const json = (status: number, body: unknown) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) });
      if (u === '/actions/runs/37368664339') {
        return json(200, { id: 37368664339, name: 'Deploy to GitHub Pages', status: 'completed', conclusion: 'failure', run_attempt: runAttempt, workflow_id: 9, head_branch: 'master', head_sha: 'a4a59b77', created_at: '2026-10-05T20:16:01Z', html_url: 'h' });
      }
      if (u.startsWith('/actions/runs/37368664339/attempts/')) return json(200, { jobs: [STARVED_BUILD, { id: 2, name: 'deploy', conclusion: 'skipped', steps: [], runner_name: null }] });
      if (u === `/check-runs/${STARVED_BUILD.id}/annotations`) return json(200, STARVED_ANNOTATIONS);
      if (u.startsWith('/actions/workflows/9/runs')) {
        const runs = [{ id: 37368664339, created_at: '2026-10-05T20:16:01Z' }];
        if (newerDeploy) runs.push({ id: 37384486434, created_at: '2026-10-05T22:45:31Z' });
        return json(200, { workflow_runs: runs });
      }
      if (u === '/actions/runs/37368664339/rerun') return json(201, {});
      if (u.startsWith('/issues')) return method === 'POST' ? json(201, { html_url: 'i' }) : json(200, []);
      return json(404, { message: `unexpected ${u}` });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const posts = (): string[] => calls.filter((c) => c.method === 'POST').map((c) => c.url.replace('https://api.github.com/repos/o/r', ''));

  it('the S195 #7 run, attempt 1 → it POSTs the re-run, and nothing else', async () => {
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('rerun');
    expect(posts()).toEqual(['/actions/runs/37368664339/rerun']);
  });
  it('NEGATIVE: the same run with a newer deploy behind it → no POST at all', async () => {
    newerDeploy = true;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('superseded');
    expect(posts()).toEqual([]);
  });
  it('attempt 3 still starved → it opens ONE issue titled for that run, and does not re-run', async () => {
    runAttempt = 3;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/issues']);
    const body = JSON.parse(calls.find((c) => c.method === 'POST')!.body!) as { title: string };
    expect(body.title).toBe(w.alertTitle('Deploy to GitHub Pages', 37368664339));
  });
});

describe('S196 audit HIGH-1 — the imported .mjs scripts survive a CRLF (core.autocrlf=true) checkout', () => {
  // A `#!` line ending in CRLF is a SyntaxError on dynamic import: 24 of these 25 tests went red on every
  // Windows checkout while this worktree's LF copies stayed green. Two walls: no shebang, and LF pinned.
  const SCRIPTS = ['../.github/workflows/ci-watchdog.mjs', '../scripts/verify-deploy.mjs'];
  it('neither script carries a shebang, and .gitattributes pins *.mjs to LF', () => {
    for (const s of SCRIPTS) expect(readFileSync(path(s), 'utf8').startsWith('#!'), s).toBe(false);
    expect(read('../.gitattributes')).toMatch(/^\*\.mjs text eol=lf$/m);
  });
  it('REACH: a CRLF copy of each script still imports (what a Windows checkout hands vitest)', async () => {
    // inside the repo (node_modules is gitignored and present wherever vitest runs): Vite's loader will not
    // resolve a module under the OS temp dir
    const dir = mkdtempSync(join(path('../node_modules'), '.spark-crlf-'));
    try {
      for (const s of SCRIPTS) {
        const crlf = readFileSync(path(s), 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        const copy = join(dir, s.split('/').pop()!);
        writeFileSync(copy, crlf);
        await expect(import(/* @vite-ignore */ pathToFileURL(copy).href), s).resolves.toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
