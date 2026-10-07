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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  decide(r: { workflowName: string; conclusion: string | null; attempt: number; starvedJobs: string[]; newerDeployRun: boolean | 'unknown' }): Verdict;
  alertTitle(workflowName: string, runId: number, attempt: number): string;
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
  const base: { conclusion: string | null; attempt: number; starvedJobs: string[]; newerDeployRun: boolean | 'unknown' } = { conclusion: 'failure', attempt: 1, starvedJobs: ['build'], newerDeployRun: false };
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
  it('⭐ LOW-1: a cancelled / timed_out deploy with a NEWER deploy run is superseded, not an alert', async () => {
    const w = await load();
    for (const c of ['cancelled', 'timed_out']) {
      expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, conclusion: c, starvedJobs: [], newerDeployRun: true }).action).toBe('superseded');
    }
  });
  it('⭐ LOW-B: the newer-run lookup FAILED (unknown) → a starved deploy is NOT re-run but alerts; a cancelled deploy alerts', async () => {
    const w = await load();
    expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, newerDeployRun: 'unknown' }).action).toBe('alert');
    for (const c of ['cancelled', 'timed_out']) {
      expect(w.decide({ ...base, workflowName: w.DEPLOY_WORKFLOW, conclusion: c, starvedJobs: [], newerDeployRun: 'unknown' }).action).toBe('alert');
    }
    // an E2E run never consults it: unknown cannot block its re-run
    expect(w.decide({ ...base, workflowName: w.E2E_WORKFLOW, newerDeployRun: 'unknown' }).action).toBe('rerun');
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
  let conclusion: string;
  let starvedJob: boolean;
  let rerunStatus: number;
  let statusAfterRerun: string;
  let priorIssues: { title: string; state: string }[];
  let runGets: number;
  let deployListStatus: number;
  beforeEach(() => {
    calls = [];
    runAttempt = 1;
    newerDeploy = false;
    conclusion = 'failure';
    starvedJob = true;
    rerunStatus = 201;
    statusAfterRerun = 'completed';
    priorIssues = [];
    runGets = 0;
    deployListStatus = 200;
    vi.stubEnv('GITHUB_REPOSITORY', 'o/r');
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubGlobal('fetch', async (url: string, init: { method?: string; body?: string } = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: init.body });
      const u = url.replace('https://api.github.com/repos/o/r', '');
      const json = (status: number, body: unknown) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) });
      if (u === '/actions/runs/37368664339') {
        runGets++;
        return json(200, { id: 37368664339, name: 'Deploy to GitHub Pages', status: runGets > 1 ? statusAfterRerun : 'completed', conclusion, run_attempt: runAttempt, workflow_id: 9, head_branch: 'master', head_sha: 'a4a59b77', created_at: '2026-10-05T20:16:01Z', html_url: 'h' });
      }
      if (u.startsWith('/actions/runs/37368664339/attempts/')) return json(200, { jobs: [starvedJob ? STARVED_BUILD : { ...STARVED_BUILD, steps: [{}], runner_name: 'GitHub Actions 1' }, { id: 2, name: 'deploy', conclusion: 'skipped', steps: [], runner_name: null }] });
      if (u === `/check-runs/${STARVED_BUILD.id}/annotations`) return json(200, STARVED_ANNOTATIONS);
      if (u.startsWith('/actions/workflows/9/runs')) {
        if (deployListStatus !== 200) return json(deployListStatus, { message: 'boom' });
        const runs = [{ id: 37368664339, created_at: '2026-10-05T20:16:01Z' }];
        if (newerDeploy) runs.push({ id: 37384486434, created_at: '2026-10-05T22:45:31Z' });
        return json(200, { workflow_runs: runs });
      }
      if (u === '/actions/runs/37368664339/rerun') return json(rerunStatus, {});
      if (u.startsWith('/issues')) return method === 'POST' ? json(201, { html_url: 'i' }) : json(200, priorIssues);
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
    expect(body.title).toBe(w.alertTitle('Deploy to GitHub Pages', 37368664339, 3));
  });
  it('⭐ LOW-1 REACH: a deploy CANCELLED (not starved) with a newer deploy behind it → superseded, no issue', async () => {
    conclusion = 'cancelled';
    starvedJob = false;
    newerDeploy = true;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('superseded');
    expect(posts()).toEqual([]);
  });
  it('LOW-1 NEGATIVE: the same cancelled deploy with NOTHING newer still opens the alert', async () => {
    conclusion = 'cancelled';
    starvedJob = false;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/issues']);
  });
  it('⭐ LOW-2 REACH: a re-run REFUSED (403) and the run still idle → alert, with the real status in the issue', async () => {
    rerunStatus = 403;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/actions/runs/37368664339/rerun', '/issues']);
    const issue = JSON.parse(calls.filter((c) => c.method === 'POST')[1]!.body!) as { body: string };
    expect(issue.body).toMatch(/re-run was refused \(HTTP 403\)/);
  });
  it('LOW-2 NEGATIVE: refused because a racing watchdog already re-ran it (run now in_progress) → no alert', async () => {
    rerunStatus = 403;
    statusAfterRerun = 'in_progress';
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('rerun');
    expect(posts()).toEqual(['/actions/runs/37368664339/rerun']);
  });
  it('⭐ LOW-3 REACH: an alert for this run that a human already CLOSED is not filed again', async () => {
    runAttempt = 3;
    const w = await load();
    priorIssues = [{ title: w.alertTitle('Deploy to GitHub Pages', 37368664339, 3), state: 'closed' }];
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual([]);
    expect(calls.some((c) => c.url.includes('/issues?state=all')), 'dedupe reads closed issues too').toBe(true);
  });
  it('LOW-3 NEGATIVE: a closed alert for a DIFFERENT run does not suppress this one', async () => {
    runAttempt = 3;
    const w = await load();
    priorIssues = [{ title: w.alertTitle('Deploy to GitHub Pages', 1, 3), state: 'closed' }];
    await w.handleRun(37368664339);
    expect(posts()).toEqual(['/issues']);
  });
  it('⭐ LOW-A REACH: the attempt-1 alert was CLOSED (a human re-ran it); attempt 2 dies too → attempt 2 files its own alert', async () => {
    conclusion = 'cancelled';
    starvedJob = false;
    runAttempt = 2;
    const w = await load();
    priorIssues = [{ title: w.alertTitle('Deploy to GitHub Pages', 37368664339, 1), state: 'closed' }];
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/issues']);
    const body = JSON.parse(calls.find((c) => c.method === 'POST')!.body!) as { title: string };
    expect(body.title).toBe(w.alertTitle('Deploy to GitHub Pages', 37368664339, 2));
    expect(body.title).toMatch(/run 37368664339 attempt 2 /);
  });
  it('⭐ LOW-B REACH: the deploy-run lookup errors on a CANCELLED deploy → the alert still opens', async () => {
    conclusion = 'cancelled';
    starvedJob = false;
    deployListStatus = 500;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/issues']);
  });
  it('⭐ LOW-B REACH: the deploy-run lookup errors on a STARVED deploy → no re-run (it could be stale), but an alert', async () => {
    deployListStatus = 500;
    const w = await load();
    expect((await w.handleRun(37368664339)).action).toBe('alert');
    expect(posts()).toEqual(['/issues']);
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
    // ⚠ inside the repo but NOT under node_modules: Vite will not resolve a module under the OS temp dir, and
    // a node_modules path is externalised to plain Node, which tolerates a CRLF shebang — measured, that
    // made this test pass with the shebang put back. `test-results-*/` is gitignored.
    const base = path('../test-results-crlf');
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, 'run-'));
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
