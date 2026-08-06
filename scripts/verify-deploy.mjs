#!/usr/bin/env node
/**
 * SPARK — verify a deploy ACTUALLY landed (S133 P3).
 *
 * ============================== WHY THIS EXISTS ==============================
 * `SPARK_Blueprint.md` §XV.7 asserts "Every push to `master` ships to production."
 * On 2026-08-06 that assertion was EMPIRICALLY FALSIFIED. A 45-commit push
 * (`f0b8144..d2d1c34`) landed on the remote, GitHub logged the PushEvent, the paths
 * filter matched 32 files, Actions was enabled and all workflows were `active` — and
 * NO workflow run was ever created. No email, no red run, nothing to notice. The
 * deploy only happened after an explicit `gh workflow run deploy.yml`.
 *
 * That is the same silent-failure family as the `cancelled` CI runs already logged in
 * this repo (2026-07-20, 2026-07-27): a job that dies as `cancelled` is not `failure`,
 * so it sends no mail and produces no artifacts. **"It looked fine" is not a signal.**
 *
 * So: never infer a deploy. Verify it, across FOUR independent carriers, each of which
 * fails on its own and says which one broke:
 *
 *   1. REMOTE   — remote `master` == local HEAD (a push that never landed at all)
 *   2. RUN      — a deploy.yml run exists FOR THAT SHA (the falsified-trigger case)
 *   3. VERDICT  — that run concluded `success`; `cancelled` is treated as FAILURE
 *   4. LIVE     — the live site's entry asset filename == the local `dist/` build
 *
 * Carrier 4 is the only one that proves the bytes a player downloads are the bytes you
 * built; 1-3 can all pass while the CDN still serves something older. Vite content-hashes
 * the entry chunk, so filename equality IS content equality.
 *
 * ⚠ Deliberately does NOT trust `gh api repos/:owner/:repo/pages` — this repo has
 * measured it reporting a stale legacy/gh-pages source. The deployments API + the live
 * asset hash are the carriers that told the truth.
 *
 * USAGE:  npm run verify-deploy
 *         node scripts/verify-deploy.mjs --sha <sha>        (override the SHA to check)
 *         node scripts/verify-deploy.mjs --expect-asset <f> (override the expected asset)
 * EXIT:   0 = every carrier passed | 1 = at least one carrier FAILED
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const REPO = 'daneshto-dotcom/the-spark';
const WORKFLOW = 'deploy.yml';
const LIVE_URL = 'https://daneshto-dotcom.github.io/the-spark/';

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const results = [];
const record = (carrier, ok, detail) => {
  results.push({ carrier, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${carrier.padEnd(8)} ${detail}`);
};

console.log(`[verify-deploy] ${REPO} — four independent carriers\n`);

// ── 1. REMOTE ────────────────────────────────────────────────────────────────
let sha = argOf('--sha');
try {
  const localHead = sh('git', ['rev-parse', 'HEAD']);
  if (!sha) sha = localHead;
  const remoteLine = sh('git', ['ls-remote', 'origin', 'refs/heads/master']);
  const remoteSha = remoteLine.split(/\s+/)[0];
  const ok = remoteSha === sha;
  record(
    'REMOTE',
    ok,
    ok
      ? `remote master == ${sha.slice(0, 8)}`
      : `remote master is ${remoteSha.slice(0, 8)} but expected ${sha.slice(0, 8)} — the push did not land (or HEAD moved since)`,
  );
} catch (err) {
  record('REMOTE', false, `could not read git/remote: ${err.message.split('\n')[0]}`);
}

// ── 2+3. RUN + VERDICT ───────────────────────────────────────────────────────
// `cancelled` is explicitly NOT success: a timeout-killed job reports cancelled,
// sends no mail and uploads no artifacts, which is how a dead gate hides.
let runOk = false;
try {
  const raw = sh('gh', [
    'api',
    `repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=40`,
    '--jq',
    '[.workflow_runs[] | {sha: .head_sha, status, conclusion, id, created_at, event}]',
  ]);
  const runs = JSON.parse(raw);
  const mine = runs.filter((r) => r.sha === sha);
  if (mine.length === 0) {
    record(
      'RUN',
      false,
      `no ${WORKFLOW} run exists for ${sha.slice(0, 8)} — THE FALSIFIED-TRIGGER CASE. ` +
        `Remedy: gh workflow run ${WORKFLOW} --ref master`,
    );
    record('VERDICT', false, 'skipped — there is no run to judge');
  } else {
    record('RUN', true, `${mine.length} run(s) for ${sha.slice(0, 8)} (newest event=${mine[0].event})`);
    const good = mine.find((r) => r.status === 'completed' && r.conclusion === 'success');
    const worst = mine[0];
    runOk = Boolean(good);
    record(
      'VERDICT',
      runOk,
      runOk
        ? `run ${good.id} concluded success`
        : `no successful run: newest is status=${worst.status} conclusion=${worst.conclusion} ` +
          `(NB: 'cancelled' is a silent death — no mail, no artifacts)`,
    );
  }
} catch (err) {
  record('RUN', false, `gh api failed (auth? network?): ${err.message.split('\n')[0]}`);
  record('VERDICT', false, 'skipped — run lookup failed');
}

// ── 4. LIVE ──────────────────────────────────────────────────────────────────
// The only carrier that proves what a player actually downloads.
let expected = argOf('--expect-asset');
try {
  if (!expected) {
    // Read the entry from dist/index.html rather than globbing dist/assets. This is the
    // repo's established idiom (check-bundle-size.mjs:39 does the same, "so it is robust
    // to Vite's content-hash filenames") and it matters for a REAL reason found on this
    // script's first run: dist/ can hold ORPHANED entry chunks from an interrupted build,
    // and globbing then finds 2+ candidates with no way to know which is current. The
    // built index.html is the authoritative local pointer — and reading it makes this
    // comparison exactly symmetric with how the live side is read below.
    const local = 'dist/index.html';
    if (!existsSync(local)) {
      throw new Error(`${local} missing — run \`npm run build\` first so there is a local build to compare`);
    }
    const localHtml = readFileSync(local, 'utf8');
    const m = localHtml.match(/<script[^>]+type="module"[^>]+src="[^"]*?(index-[A-Za-z0-9_-]+\.js)"/);
    if (m === null) {
      throw new Error(`could not find a module entry <script> in ${local}`);
    }
    expected = m[1];
  }
  const html = await fetch(LIVE_URL, { redirect: 'follow' }).then((r) => {
    if (!r.ok) throw new Error(`live site returned HTTP ${r.status}`);
    return r.text();
  });
  const found = [...html.matchAll(/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]);
  const ok = found.includes(expected);
  record(
    'LIVE',
    ok,
    ok
      ? `live entry asset == local build (${expected}) — content-hash equality, so the bytes match`
      : `live serves [${found.join(', ') || 'NO index asset found'}] but local build is ${expected} — prod is NOT what you built`,
  );
} catch (err) {
  record('LIVE', false, `could not compare live asset: ${err.message.split('\n')[0]}`);
}

// ── verdict ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(`[verify-deploy] PASS — all ${results.length} carriers agree the deploy landed.`);
  process.exit(0);
}
console.log(
  `[verify-deploy] FAIL — ${failed.length}/${results.length} carrier(s) failed: ` +
    failed.map((f) => f.carrier).join(', '),
);
console.log('[verify-deploy] Do NOT report this as shipped. A push is not a deploy (see the header).');
process.exit(1);
