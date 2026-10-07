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
 *         node scripts/verify-deploy.mjs --sha <sha>        (override the SHA to check; abbreviated is fine)
 *         node scripts/verify-deploy.mjs --expect-asset <f> (override the expected asset)
 * EXIT:   0 = every carrier passed | 1 = at least one carrier FAILED
 *         3 = ⭐ S196 LOCAL BUILD STALE — carriers 1-3 passed, but LIVE could not be judged against this
 *             commit because `dist/` is older than the source it should hold. Rebuild (`npm run build`)
 *             and re-run. NEVER a pass.
 *
 * ⭐ S196 (s196/ci) — two false FAILs fixed, both measured on S196 deploys:
 *   · F5 — an abbreviated `--sha` reported REMOTE FAIL for a deploy that had landed: it was compared
 *     character-for-character with the 40-char remote ref (and the RUN carrier with each run's full
 *     `head_sha`). It is now expanded with `git rev-parse` first (`resolveSha`).
 *   · S196-#4 — LIVE compared the live entry asset with the LOCAL `dist/`, which still held the S196-#3
 *     build (the land step had not rebuilt): "prod is NOT what you built" for a correct deploy. A `dist/`
 *     older than the newest build input is now its own verdict, LOCAL BUILD STALE
 *     (`localBuildFreshness`, make-style: any file under deploy.yml's paths newer than
 *     `dist/index.html` means the local bundle is not the one this checkout builds). It is consulted
 *     only when LIVE mismatches — a matching hash is byte equality whatever the clocks say — and BEFORE
 *     the TURN-injection diagnosis, because a stale artifact is the one case that diagnosis cannot rule
 *     out (see the S160 note below).
 * The logic is exported and pinned by `src/ci.verifyDeploy.test.ts`; `runVerify` only runs on its own when
 * this file is executed directly.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'daneshto-dotcom/the-spark';
const WORKFLOW = 'deploy.yml';
const LIVE_URL = 'https://daneshto-dotcom.github.io/the-spark/';
export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_STALE = 3;

const realSh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * ⭐ S196 F5 — the SHA every carrier compares is always the full 40 hex. `git rev-parse --verify
 * <x>^{commit}` expands an abbreviation (or a ref name) and refuses an ambiguous or unknown one, so an
 * abbreviated `--sha` can never again fail REMOTE by its length alone.
 * @param {string | null} input
 * @param {(args: string[]) => string} git
 * @returns {{ sha: string, error: string | null }}
 */
export function resolveSha(input, git) {
  if (!input) return { sha: git(['rev-parse', 'HEAD']), error: null };
  try {
    return { sha: git(['rev-parse', '--verify', '--quiet', `${input}^{commit}`]), error: null };
  } catch {
    return {
      sha: input,
      error: `--sha ${input} does not resolve to a commit in this clone (unknown, ambiguous, or not fetched yet — git fetch first)`,
    };
  }
}

/**
 * deploy.yml's `push: paths:` globs as git pathspecs ('src/**' → 'src'). PARSED out of the workflow rather
 * than copied, so it cannot drift from the filter it mirrors. Null if the block cannot be found.
 */
export function deployPathspecs(yml) {
  // `\r?\n` throughout, and [ \t] instead of \s for indentation: these workflow files are
  // CRLF, and a bare \n anchor matched NOTHING on the first attempt — the third time the
  // CRLF trap bit an edit in this session. \s also swallows newlines, which makes an
  // indentation matcher quietly wrong.
  const block = yml.match(/\r?\n[ \t]{4}paths:\r?\n((?:[ \t]{6}-[ \t]*'[^']+'\r?\n)+)/);
  if (block === null) return null;
  const globs = [...block[1].matchAll(/-\s*'([^']+)'/g)].map((m) => m[1]);
  return globs.map((g) => g.replace(/\/\*\*$/, ''));
}

/** The newest file (by mtime) under `paths` (files or directories, relative to `root`), or null. */
export function newestMtime(root, paths) {
  let best = null;
  const visit = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) visit(join(rel, name));
    } else if (best === null || st.mtimeMs > best.mtimeMs) {
      best = { path: rel.replace(/\\/g, '/'), mtimeMs: st.mtimeMs };
    }
  };
  for (const p of paths) visit(p);
  return best;
}

/**
 * ⭐ S196 — was `dist/` built from what this checkout holds? STALE iff a BUILD INPUT is newer than
 * `dist/index.html` (Vite writes it last). The inputs are deploy.yml's own paths filter minus `.github/`
 * (the workflow file never reaches the bundle). A checkout, merge or edit after the last build moves an
 * input's mtime past the build's — exactly the S196-#4 case (#4 merged, #3's dist/ still on disk).
 * ⚠ One-directional, and it says so: a `dist/` NEWER than every input is not thereby proven fresh (built on
 * another branch, then a checkout that touched no input) — that case falls through to the ordinary LIVE
 * verdict, exactly as before this check existed.
 * @returns {{ known: boolean, stale: boolean, detail: string }}
 */
export function localBuildFreshness(root = '.') {
  const wf = join(root, '.github/workflows/deploy.yml');
  const index = join(root, 'dist/index.html');
  if (!existsSync(wf) || !existsSync(index)) {
    return { known: false, stale: false, detail: 'no deploy.yml or no dist/index.html' };
  }
  const specs = deployPathspecs(readFileSync(wf, 'utf8'));
  if (specs === null) return { known: false, stale: false, detail: 'could not parse the deploy.yml paths filter' };
  const inputs = specs.filter((p) => !p.startsWith('.github/'));
  const built = statSync(index).mtimeMs;
  const newest = newestMtime(root, inputs);
  if (newest === null) return { known: false, stale: false, detail: 'no build inputs found' };
  const stale = newest.mtimeMs > built;
  return {
    known: true,
    stale,
    detail: stale
      ? `dist/index.html was built ${Math.round((newest.mtimeMs - built) / 1000)} s BEFORE ${newest.path} last changed`
      : `dist/index.html is newer than every build input (newest: ${newest.path})`,
  };
}

/**
 * All four carriers. Every effect is injectable so the test can drive the real decision path; the
 * defaults are the real git / gh / network / disk.
 */
export async function runVerify({
  argv = process.argv.slice(2),
  sh = realSh,
  fetchImpl = globalThis.fetch,
  freshness = () => localBuildFreshness('.'),
  readLocal = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null),
  log = console.log,
} = {}) {
  const argOf = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };

  const results = [];
  const record = (carrier, ok, detail, status = ok ? 'PASS' : 'FAIL') => {
    results.push({ carrier, ok, detail, status });
    log(`  ${status.padEnd(5)} ${carrier.padEnd(8)} ${detail}`);
  };

  log(`[verify-deploy] ${REPO} — four independent carriers\n`);

  // ── 1. REMOTE ──────────────────────────────────────────────────────────────
  let sha = argOf('--sha');
  try {
    const resolved = resolveSha(sha, (args) => sh('git', args));
    sha = resolved.sha;
    if (resolved.error !== null) throw new Error(resolved.error);
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

  /**
   * Is a deploy run even REQUIRED for this SHA?
   *
   * `deploy.yml`'s paths filter exists on purpose (S40 P2): session-bookkeeping commits
   * (.claude/, HANDOFF_*.md, boot-snapshot.md) must NOT trigger deploys, because a
   * close/handoff push landing minutes after a code push would cancel the in-flight code
   * deploy via the github-pages environment's concurrency. So "no run for HEAD" is the
   * CORRECT outcome for a docs-only commit, and demanding one would make this script cry
   * wolf on every handoff — a check that is usually wrong gets ignored, which is worse
   * than no check.
   *
   * The path list is PARSED OUT OF deploy.yml (`deployPathspecs`) rather than copied here, so it
   * cannot drift from the workflow it is meant to mirror. (Drift between a claim and its
   * enforcement is the exact defect class S133 spent its whole budget on.)
   */
  function deployRelevantChanges(sinceSha) {
    const wf = '.github/workflows/deploy.yml';
    const yml = readLocal(wf);
    if (yml === null) return { known: false, files: [], paths: [] };
    const pathspecs = deployPathspecs(yml);
    if (pathspecs === null) return { known: false, files: [], paths: [] };
    try {
      const out = sh('git', ['diff', '--name-only', `${sinceSha}..HEAD`, '--', ...pathspecs]);
      return { known: true, files: out ? out.split('\n').filter(Boolean) : [], paths: pathspecs };
    } catch {
      return { known: false, files: [], paths: pathspecs };
    }
  }

  // ── 2+3. RUN + VERDICT ─────────────────────────────────────────────────────
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
      // Before calling this a failure, ask whether a deploy was OWED for this SHA at all.
      const lastGood = runs.find((r) => r.status === 'completed' && r.conclusion === 'success');
      const delta = lastGood ? deployRelevantChanges(lastGood.sha) : { known: false, files: [] };
      if (delta.known && delta.files.length === 0) {
        record(
          'RUN',
          true,
          `no run for ${sha.slice(0, 8)}, and none is OWED — nothing under deploy.yml's paths filter ` +
            `changed since the last successful deploy (${lastGood.sha.slice(0, 8)}). Docs/session-only commit.`,
        );
        record('VERDICT', true, `inherited from ${lastGood.sha.slice(0, 8)} (still the deployed SHA)`);
        runOk = true;
      } else {
        const why = delta.known
          ? `${delta.files.length} deploy-relevant file(s) changed since ${lastGood.sha.slice(0, 8)}: ` +
            delta.files.slice(0, 5).join(', ') + (delta.files.length > 5 ? ', …' : '')
          : 'could not compute the path delta, so a run is assumed required';
        record(
          'RUN',
          false,
          `no ${WORKFLOW} run exists for ${sha.slice(0, 8)} — THE FALSIFIED-TRIGGER CASE. ${why}. ` +
            `Remedy: gh workflow run ${WORKFLOW} --ref master`,
        );
        record('VERDICT', false, 'skipped — there is no run to judge');
      }
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

  // ── 4. LIVE ────────────────────────────────────────────────────────────────
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
      const localHtml = readLocal(local);
      if (localHtml === null) {
        throw new Error(`${local} missing — run \`npm run build\` first so there is a local build to compare`);
      }
      const m = localHtml.match(/<script[^>]+type="module"[^>]+src="[^"]*?(index-[A-Za-z0-9_-]+\.js)"/);
      if (m === null) {
        throw new Error(`could not find a module entry <script> in ${local}`);
      }
      expected = m[1];
    }
    const html = await fetchImpl(LIVE_URL, { redirect: 'follow' }).then((r) => {
      if (!r.ok) throw new Error(`live site returned HTTP ${r.status}`);
      return r.text();
    });
    const found = [...html.matchAll(/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]);
    const ok = found.includes(expected);

    if (ok) {
      record('LIVE', true, `live entry asset == local build (${expected}) — content-hash equality, so the bytes match`);
    } else {
      /*
       * ⛔ S160 — A MISMATCH IS NOT AUTOMATICALLY A BAD DEPLOY ANY MORE, AND THIS GATE LIED THE
       * MOMENT THE OWNER PROVISIONED TURN.
       *
       * `deploy.yml` injects VITE_TURN_URLS / _USERNAME / _CREDENTIAL at BUILD TIME, and
       * `iceConfig.ts` reads them through Vite's `define`, so the values are INLINED INTO THE BUNDLE.
       * A machine without those secrets — every dev machine, and CI on a fork — produces empty
       * strings there, different bytes, and therefore a different Vite content-hash filename. By
       * construction. Nothing is wrong with the deploy.
       *
       * Before this branch existed the gate reported *"prod is NOT what you built"* and
       * *"Do NOT report this as shipped"* for a deploy that was in fact correct. That is worse than
       * no gate: the next session either panics or, having panicked once, learns to ignore a red
       * LIVE carrier — which is exactly the state this whole script exists to prevent.
       *
       * So the divergence is DIAGNOSED rather than assumed. It is the expected secret-injection case
       * only if ALL of these hold, and it stays a hard FAIL otherwise:
       *   · the LOCAL bundle carries no relay literal (it was built without the secrets), AND
       *   · the LIVE bundle DOES carry one (the secrets reached production), AND
       *   · the size delta is tiny — a credential set is tens of bytes, not a different build.
       * Carriers 1-3 have already established that the live artifact came from a SUCCESSFUL run of
       * the CURRENT commit, so "same commit, same pipeline, differs only by injected secrets" is a
       * complete account of the difference.
       */
      const liveName = found[0];
      let diagnosed = false;
      // ⭐ S196 — a STALE local build says nothing about prod. Checked FIRST: it is the one case the
      // injection diagnosis below admits it cannot rule out. (Not with --expect-asset: no dist/ is read.)
      const fresh = argOf('--expect-asset') ? { known: false, stale: false, detail: '' } : freshness();
      if (fresh.stale) {
        diagnosed = true;
        record(
          'LIVE',
          false,
          `live serves [${found.join(', ') || 'NO index asset found'}], local dist/ has ${expected} — but ` +
            `LOCAL BUILD STALE: ${fresh.detail}. That compares prod with an OLD build, not with this commit. ` +
            'Run `npm run build` and re-run verify-deploy.',
          'STALE',
        );
      }
      if (!diagnosed && liveName !== undefined) {
        try {
          const localPath = `dist/assets/${expected}`;
          const localJs = readLocal(localPath) ?? '';
          const liveJs = await fetchImpl(new URL(`assets/${liveName}`, LIVE_URL), { redirect: 'follow' })
            .then((r) => (r.ok ? r.text() : ''));
          const hasRelay = (js) => /["']turns?:[^"']+["']/.test(js);
          const localHasRelay = hasRelay(localJs);
          const liveHasRelay = hasRelay(liveJs);
          const delta = Math.abs(liveJs.length - localJs.length);
          /*
           * ⭐ THE CODE SKELETON IS THE REAL CHECK, AND WITHOUT IT THIS BRANCH WOULD BE A RUBBER STAMP.
           *
           * "local lacks a relay, live has one, sizes are close" is ALSO true of a genuinely STALE
           * production build once the secrets exist — which is precisely the failure the LIVE carrier
           * is here to catch, so diagnosing on those three conditions alone would have widened a hole
           * while closing another.
           *
           * Stripping every string literal from both bundles leaves the CODE. Build-time secret
           * injection changes only literal VALUES, so the skeletons must be byte-identical; a stale
           * artifact built from different source is not, because minified identifiers and structure
           * move. Cheap, and it is the property that actually distinguishes the two cases.
           */
          /*
           * ⛔ S160 — WHAT THIS CARRIER CAN AND CANNOT PROVE ONCE SECRETS ARE INJECTED. READ THIS
           * BEFORE "IMPROVING" THE CHECK, BECAUSE I TRIED THE OBVIOUS IMPROVEMENT AND IT WAS WRONG.
           *
           * First attempt: compare the two bundles with all string literals blanked, on the theory
           * that secret injection changes only literal VALUES so the code skeleton must match.
           * MEASURED, IT DOES NOT. With no secrets, `HAS_TURN_CONFIGURED` is a build-time `false`, so
           * Rollup TREE-SHAKES the relay logging branch out of the bundle entirely; with real secrets
           * it is retained. The live bundle therefore carries whole string literals the local one has
           * never heard of (`urls: `, `username: `, ` credential: `), and the skeletons differ
           * legitimately. Injection changes WHICH CODE SURVIVES, not just what the literals say.
           *
           * ⚠ SO THIS BRANCH IS A DIAGNOSIS, NOT A PROOF, AND IT SAYS SO OUT LOUD. It establishes
           * "the divergence is consistent with secret injection" — local has no relay, live does, and
           * the size delta is a credential set rather than a different build. Combined with carriers
           * 1-3 (a SUCCESSFUL run exists for the CURRENT remote SHA) that is a complete and coherent
           * account. What it cannot rule out is a stale artifact whose size happens to land inside the
           * same window.
           *
           * ⭐ THE REAL FIX IS A BUILD STAMP, and it is filed as a carry-forward rather than smuggled
           * in at session close: emit the commit SHA into `index.html` at build time and have this
           * carrier compare THAT to remote master. Exact, cheap, and immune to injection. Until then,
           * byte-identity is simply not available on a machine without the three secrets, and pretending
           * otherwise is how a gate starts lying.
           */
          if (!localHasRelay && liveHasRelay && delta < 512) {
            diagnosed = true;
            record(
              'LIVE',
              true,
              `live [${liveName}] != local [${expected}] — CONSISTENT WITH BUILD-TIME TURN INJECTION ` +
                `(local has no relay, live does, delta ${delta} B) and carriers 1-3 prove the live ` +
                `artifact came from a successful run of this commit. ⭐ RELAY IS SHIPPED. ` +
                `⚠ NOT byte-identity — that is unavailable without the secrets; see the note in this ` +
                `script and the build-stamp carry-forward.`,
            );
          }
        } catch {
          // fall through to the hard failure below — an unreachable asset is not a diagnosis
        }
      }
      if (!diagnosed) {
        record(
          'LIVE',
          false,
          `live serves [${found.join(', ') || 'NO index asset found'}] but local build is ${expected} — prod is NOT what you built`,
        );
      }
    }
  } catch (err) {
    record('LIVE', false, `could not compare live asset: ${err.message.split('\n')[0]}`);
  }

  // ── verdict ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  log('');
  if (failed.length === 0) {
    log(`[verify-deploy] PASS — all ${results.length} carriers agree the deploy landed.`);
    return { results, exitCode: EXIT_PASS };
  }
  if (failed.every((f) => f.status === 'STALE')) {
    log('[verify-deploy] LOCAL BUILD STALE — carriers 1-3 passed; LIVE was NOT judged against this commit.');
    log('[verify-deploy] Rebuild (`npm run build`) and re-run. Not a pass: do not report this as verified yet.');
    return { results, exitCode: EXIT_STALE };
  }
  log(
    `[verify-deploy] FAIL — ${failed.length}/${results.length} carrier(s) failed: ` +
      failed.map((f) => f.carrier).join(', '),
  );
  log('[verify-deploy] Do NOT report this as shipped. A push is not a deploy (see the header).');
  return { results, exitCode: EXIT_FAIL };
}

const invokedDirectly = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const { exitCode } = await runVerify();
  process.exit(exitCode);
}
