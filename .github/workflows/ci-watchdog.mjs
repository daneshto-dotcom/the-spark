#!/usr/bin/env node
/**
 * SPARK — ⭐ S196 (s196/ci) — THE CI WATCHDOG: a run GitHub never started is re-run, or it is LOUD.
 *
 * THE CAUSE (S195 deploy #7, run 37368664339 attempt 1, measured S196): the `build` job sat 15 min with
 * `runner_name: ""` and ZERO steps, then concluded `cancelled`, carrying the annotation
 *   "The job was not acquired by Runner of type hosted even after multiple attempts".
 * In the same minute all seven E2E jobs of run 37368664346 died identically. That is GitHub's hosted
 * runner pool failing to hand out a machine — NOT our YAML: `deploy.yml`'s `timeout-minutes` is 30 (the
 * kill came at 15), and the concurrency group admitted the run (its job was created at once). Nothing in
 * a workflow file can prevent it. The site then sat STALE until a human ran `gh run rerun` — because a
 * `cancelled` job sends no failure mail, and nobody was looking (memory: "CI can die silently as cancelled").
 *
 * WHAT THIS DOES — `ci-watchdog.yml` runs it on every completed Deploy / E2E run (`workflow_run`) and on a
 * 30-min cron sweep:
 *   · a run whose attempt has a STARVED job (cancelled · 0 steps · no runner · that exact annotation) is
 *     RE-RUN, up to `MAX_ATTEMPTS` attempts in total;
 *   · at the cap — or a Deploy run that ended `cancelled` / `timed_out` for any other reason — it opens
 *     an ISSUE (GitHub mails the repo owner on a new issue; a cancelled run mails nobody);
 *   · ⛔ a STALE deploy is never re-run over a newer one: re-running deploy X after deploy Y landed would
 *     publish X's older bundle over Y. A starved deploy that is not the newest deploy run on its branch is
 *     reported SUPERSEDED and left alone.
 * The annotation is the discriminator, on purpose: a job cancelled before it started because a newer push
 * superseded it (e2e.yml `cancel-in-progress` off master) ALSO has zero steps and no runner — re-running
 * that would resurrect a run the concurrency rule meant to kill.
 *
 * ⚠ WHY A CRON AS WELL AS `workflow_run`: a re-run requested with GITHUB_TOKEN may not fire
 * `workflow_run` again when it completes (GitHub suppresses most GITHUB_TOKEN-caused events), so a SECOND
 * starvation would go unseen without the sweep. And the watchdog's own job can starve in the same outage;
 * the next sweep is what catches that.
 *
 * Pure decision functions are exported and pinned by `src/ci.watchdog.test.ts`; `main()` only runs when
 * this file is executed directly. No dependencies — Node's global `fetch` only.
 */

import { pathToFileURL } from 'node:url';

export const DEPLOY_WORKFLOW = 'Deploy to GitHub Pages';
export const E2E_WORKFLOW = 'E2E (2-browser harness)';
export const WATCHED_WORKFLOWS = [DEPLOY_WORKFLOW, E2E_WORKFLOW];
/** The message GitHub attaches to a job its hosted pool never picked up (run 37368664339, verbatim). */
export const STARVED_ANNOTATION = /not acquired by Runner/i;
/** Attempts in total (the original + 2 re-runs). The S195 outage cleared on the first manual re-run. */
export const MAX_ATTEMPTS = 3;
/** The sweep looks back this far; older runs are history, not an outage in progress. */
export const SWEEP_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * A job GitHub never started: cancelled, no steps, no runner, AND the acquisition-failure annotation.
 * @param {{conclusion?: string|null, steps?: unknown[]|null, runner_name?: string|null}} job
 * @param {{message?: string|null}[]} annotations
 */
export function isStarvedJob(job, annotations) {
  return (
    job.conclusion === 'cancelled' &&
    (job.steps?.length ?? 0) === 0 &&
    !job.runner_name &&
    annotations.some((a) => STARVED_ANNOTATION.test(a.message ?? ''))
  );
}

/** A job worth fetching annotations for (the cheap half of `isStarvedJob`). */
export function isStarvedCandidate(job) {
  return job.conclusion === 'cancelled' && (job.steps?.length ?? 0) === 0 && !job.runner_name;
}

/**
 * @param {{workflowName: string, conclusion: string|null, attempt: number, starvedJobs: string[],
 *          newerDeployRun: boolean}} r
 * @returns {{action: 'none'|'rerun'|'alert'|'superseded', reason: string}}
 */
export function decide(r) {
  if (!WATCHED_WORKFLOWS.includes(r.workflowName)) return { action: 'none', reason: 'not a watched workflow' };
  if (r.conclusion === null || r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral') {
    return { action: 'none', reason: `conclusion ${r.conclusion}` };
  }
  const isDeploy = r.workflowName === DEPLOY_WORKFLOW;
  if (r.starvedJobs.length > 0) {
    if (isDeploy && r.newerDeployRun) {
      return { action: 'superseded', reason: `starved (${r.starvedJobs.join(', ')}) but a newer deploy run exists — re-running would publish an older bundle` };
    }
    if (r.attempt < MAX_ATTEMPTS) {
      return { action: 'rerun', reason: `starved: ${r.starvedJobs.join(', ')} never got a hosted runner (attempt ${r.attempt}/${MAX_ATTEMPTS})` };
    }
    return { action: 'alert', reason: `starved on all ${MAX_ATTEMPTS} attempts: ${r.starvedJobs.join(', ')} — GitHub's hosted pool is down or this repo is blocked from it` };
  }
  if (isDeploy && (r.conclusion === 'cancelled' || r.conclusion === 'timed_out')) {
    return { action: 'alert', reason: `deploy ended ${r.conclusion} (not starved) — a cancelled run sends no mail, so the site may be stale` };
  }
  return { action: 'none', reason: `conclusion ${r.conclusion} — an ordinary red, GitHub's own failure mail covers it` };
}

/** The issue title, one per run id, so a re-fire of the watchdog never opens a duplicate. */
export function alertTitle(workflowName, runId) {
  return `[ci-watchdog] ${workflowName} run ${runId} needs a human`;
}

/* ─────────────────────────────────────────── I/O ─────────────────────────────────────────── */

async function gh(path, init = {}) {
  const repo = process.env.GITHUB_REPOSITORY;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text ? JSON.parse(text) : null };
}

async function starvedJobsOf(run) {
  const jobs = await gh(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (!jobs.ok) throw new Error(`jobs for run ${run.id}: HTTP ${jobs.status}`);
  const out = [];
  for (const job of jobs.body.jobs) {
    if (!isStarvedCandidate(job)) continue;
    const ann = await gh(`/check-runs/${job.id}/annotations`);
    if (ann.ok && isStarvedJob(job, ann.body)) out.push(job.name);
  }
  return out;
}

async function newerDeployRunExists(run) {
  const list = await gh(`/actions/workflows/${run.workflow_id}/runs?branch=${encodeURIComponent(run.head_branch)}&per_page=20`);
  if (!list.ok) return true; // ⛔ fail SAFE: unknown → never re-run a deploy that might be stale
  return list.body.workflow_runs.some((x) => x.id !== run.id && Date.parse(x.created_at) > Date.parse(run.created_at));
}

async function openAlert(run, reason) {
  const title = alertTitle(run.name, run.id);
  const open = await gh('/issues?state=open&per_page=100');
  if (open.ok && open.body.some((i) => i.title === title)) {
    console.log(`alert already open: ${title}`);
    return;
  }
  const body = [
    `**${run.name}** run [${run.id}](${run.html_url}) — attempt ${run.run_attempt}, conclusion \`${run.conclusion}\`, commit \`${run.head_sha}\` on \`${run.head_branch}\`.`,
    '',
    `**Why this issue exists:** ${reason}`,
    '',
    'A `cancelled` run sends no failure mail, so this issue is the alert. Check the run, re-run it if it is still the newest, then run `npm run verify-deploy -- --sha <full sha>` to confirm the live site.',
    '',
    '_Opened by `.github/workflows/ci-watchdog.yml` (S196)._',
  ].join('\n');
  const res = await gh('/issues', { method: 'POST', body: JSON.stringify({ title, body }) });
  console.log(`alert issue: HTTP ${res.status} ${res.body?.html_url ?? ''}`);
  if (!res.ok) console.log(`::error::ci-watchdog could not open the alert issue (HTTP ${res.status}): ${title} — ${reason}`);
}

export async function handleRun(runId) {
  const r = await gh(`/actions/runs/${runId}`);
  if (!r.ok) throw new Error(`run ${runId}: HTTP ${r.status}`);
  const run = r.body;
  if (run.status !== 'completed') return { action: 'none', reason: `status ${run.status}` };
  const isDeploy = run.name === DEPLOY_WORKFLOW;
  const starved = WATCHED_WORKFLOWS.includes(run.name) && run.conclusion !== 'success' ? await starvedJobsOf(run) : [];
  const newer = isDeploy && starved.length > 0 ? await newerDeployRunExists(run) : false;
  const verdict = decide({ workflowName: run.name, conclusion: run.conclusion, attempt: run.run_attempt, starvedJobs: starved, newerDeployRun: newer });
  console.log(`run ${run.id} (${run.name}, attempt ${run.run_attempt}, ${run.conclusion}): ${verdict.action} — ${verdict.reason}`);
  if (verdict.action === 'rerun') {
    const res = await gh(`/actions/runs/${run.id}/rerun`, { method: 'POST' });
    console.log(`::warning::ci-watchdog re-ran ${run.name} run ${run.id}: ${verdict.reason} (HTTP ${res.status})`);
    if (!res.ok && res.status !== 403) await openAlert(run, `${verdict.reason} — and the automatic re-run was refused (HTTP ${res.status})`);
  } else if (verdict.action === 'alert') {
    console.log(`::error::ci-watchdog: ${run.name} run ${run.id}: ${verdict.reason}`);
    await openAlert(run, verdict.reason);
  } else if (verdict.action === 'superseded') {
    console.log(`::notice::ci-watchdog left ${run.name} run ${run.id} alone: ${verdict.reason}`);
  }
  return verdict;
}

async function sweep() {
  const since = Date.now() - SWEEP_WINDOW_MS;
  const list = await gh('/actions/runs?status=completed&per_page=100');
  if (!list.ok) throw new Error(`run list: HTTP ${list.status}`);
  for (const run of list.body.workflow_runs) {
    if (!WATCHED_WORKFLOWS.includes(run.name) || run.conclusion === 'success') continue;
    if (Date.parse(run.updated_at) < since) continue;
    await handleRun(run.id);
  }
}

async function main() {
  const runId = process.env.RUN_ID;
  if (runId) await handleRun(runId);
  else await sweep();
}

const invokedDirectly = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((e) => {
    console.log(`::error::ci-watchdog crashed: ${e?.message ?? e}`);
    process.exitCode = 1; // not process.exit(): let pending sockets close (Windows libuv asserts otherwise)
  });
}
