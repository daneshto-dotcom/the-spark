/**
 * SPARK — S131 P2: the deploy gate's own guard.
 *
 * WHY A TEST FILE POLICES A YAML FILE. Until S131, `deploy.yml` gated a production deploy on
 * `npm run build` alone. Every "tsc 0 / vitest N passing" figure in every handoff was therefore
 * LOCAL and self-reported — a red test could not stop a deploy, and nothing in the repo would have
 * noticed if the gate were removed again. This file is the mechanical carrier for the carrier.
 *
 * It also cannot be dispatched to check itself: the `gh` token has no write auth, so the workflow
 * has not run since the gate was added. A static assertion is what is available, so it is what
 * ships — stated plainly rather than dressed up as a green CI run.
 *
 * ASSERTIONS ARE ON THE `run:` COMMANDS, NOT ON THE FILE TEXT. That distinction is load-bearing:
 * `deploy.yml` deliberately *mentions* `npm test` in a warning comment (it is bare `vitest`, i.e.
 * watch mode, which would hang the runner). A naive `expect(text).not.toContain('npm test')` would
 * fail on the very comment that prevents the mistake — a guard that punishes its own documentation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const YML = readFileSync(
  fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url)),
  'utf8',
);

/**
 * Every shell command the workflow actually executes, in file order. Comments are excluded.
 *
 * Both step spellings are matched — `run:` under a `- name:` step, and the compact `- run:` with no
 * name. S131 CHECK: the first version only handled the former, so a step written in the compact form
 * was invisible to every assertion here. It failed CLOSED (the "executes the unit suite" test goes
 * red because the command appears to be missing), so it could not have produced a false pass — but a
 * guard that reports the wrong reason for failing is a guard people learn to distrust.
 */
const RUN_COMMANDS: readonly string[] = YML.split('\n')
  .map((l) => /^\s*(?:-\s*)?run:\s*(.+?)\s*$/.exec(l)?.[1])
  .filter((c): c is string => c !== undefined);

/**
 * S131 CHECK (RALPH) — JOB STRUCTURE, not just file order.
 *
 * Flat `run:`-line order is NOT sufficient, and a reviewer proved it by mutation: move the two gating
 * steps into a NEW `test:` job placed textually ABOVE `build:`, leave `deploy: needs: build`
 * untouched, and every order-based assertion still passes — both commands are present and at lower
 * file offsets than the build — while `deploy` no longer depends on the job running the tests at all.
 * A red suite would ship to production with the guard green. Deleting `needs:` outright passed too.
 *
 * So the gate has TWO edges that must be pinned, and neither is expressible in file order: which JOB
 * owns the test step, and whether `deploy` actually waits on that job. This is a deliberately small
 * indentation-based parse rather than a YAML dependency — the file's shape is fixed and known, and
 * adding a devDependency to a guard is worse than parsing the four lines that matter.
 */
function jobBlocks(): ReadonlyMap<string, string> {
  const lines = YML.split('\n');
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const out = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (current !== null) out.set(current, buf.join('\n'));
      current = header[1];
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) out.set(current, buf.join('\n'));
  return out;
}

const JOBS = jobBlocks();

/**
 * The commands a single job executes. Extracted with the same regex as RUN_COMMANDS rather than
 * `body.includes(cmd)`, which would also match the command named inside a warning COMMENT — this
 * file's own `deploy.yml` mentions `npx vitest run` in prose, and the drain-order guard next door was
 * blinded by exactly that class of false match.
 */
function runCommandsIn(job: string): readonly string[] {
  return (JOBS.get(job) ?? '')
    .split('\n')
    .map((l) => /^\s*(?:-\s*)?run:\s*(.+?)\s*$/.exec(l)?.[1])
    .filter((c): c is string => c !== undefined);
}

/** Which job actually executes a given command. */
function jobsRunning(cmd: string): readonly string[] {
  return [...JOBS.keys()].filter((j) => runCommandsIn(j).includes(cmd));
}

/** `needs: x` and `needs: [a, b]` both appear in the wild; accept either. */
function needsOf(job: string): readonly string[] {
  const body = JOBS.get(job) ?? '';
  const m = /^\s*needs:\s*(.+?)\s*$/m.exec(body);
  if (!m) return [];
  return m[1]
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length > 0);
}

/** Every job `deploy` transitively waits on. */
function upstreamOf(job: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const walk = (j: string): void => {
    for (const dep of needsOf(j)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      walk(dep);
    }
  };
  walk(job);
  return seen;
}

describe('S131 P2 — deploy.yml gates the deploy on the test suite', () => {
  it('executes the unit suite, and with `vitest run` rather than the watch-mode script', () => {
    // `npm test` is bare `vitest` (package.json) = WATCH mode: it never exits. In CI that hangs the
    // job to its timeout and then reports `cancelled`, which produces no failure email — the exact
    // silent-signal failure that hid a dead e2e lane for 3+ weeks.
    expect(RUN_COMMANDS).toContain('npx vitest run');
    expect(RUN_COMMANDS).not.toContain('npm test');
    expect(RUN_COMMANDS).not.toContain('npm run test');
  });

  it('typechecks explicitly, so the gate is visible rather than transitive', () => {
    // NOT new coverage: `npm run build` is `tsc -b && vite build && check-bundle-size`, so types
    // have always been gated here — invisibly. An explicit step fails in seconds naming types as
    // the cause instead of surfacing as a generic build failure minutes later.
    expect(RUN_COMMANDS).toContain('npm run typecheck');
  });

  it('runs both gates BEFORE the build, cheapest-first', () => {
    const typecheck = RUN_COMMANDS.indexOf('npm run typecheck');
    const tests = RUN_COMMANDS.indexOf('npx vitest run');
    const build = RUN_COMMANDS.indexOf('npm run build');
    expect(build).toBeGreaterThan(-1);
    expect(typecheck, 'typecheck must precede the build').toBeLessThan(build);
    expect(tests, 'unit tests must precede the build').toBeLessThan(build);
    // A gate placed after the build would still fail the job, but only after paying for the build.
    expect(typecheck).toBeLessThan(tests);
  });

  it('still builds — the gates were ADDED, not swapped in for the build', () => {
    // Guards against a future edit that "simplifies" by replacing the build with the test step.
    expect(RUN_COMMANDS).toContain('npm run build');
    expect(RUN_COMMANDS).toContain('npm ci');
  });

  // NOTE — an earlier version of this file asserted `timeouts.toHaveLength(2)`, a whole-file
  // head-count. S131 CHECK (RALPH) showed that was backwards: it went RED on a legitimate 3-job
  // split while going GREEN on the dangerous mutation (a new job that is both ungated AND
  // unbounded). It is replaced by the per-job assertion further down, which pins the property
  // actually wanted — every job bounded — regardless of how the jobs are arranged.

  it('no step hides its command in a YAML block scalar this guard cannot read', () => {
    // GEMINI-AUDITOR asked what the extraction does with `run: |` / `run: >`. Answer: it would
    // capture the bare indicator and miss every line of the actual script, so the assertions above
    // would be reasoning about a command that is not there. Rather than grow a YAML parser, this
    // FAILS LOUDLY the moment anyone introduces the form — at which point the extraction gets fixed
    // deliberately instead of silently reading nothing.
    for (const cmd of RUN_COMMANDS) {
      expect(
        cmd,
        `a run: step uses a block scalar ("${cmd}"), so its real command is invisible to this guard`,
      ).not.toMatch(/^[|>][-+]?\d*$/);
    }
  });

  it('the DEPLOY job actually waits on the job that runs the tests', () => {
    // S131 CHECK (RALPH) — the assertion that flat file order could not make. Without this, moving
    // the gates into a sibling job (or simply deleting `needs:`) leaves every other test here green
    // while a red suite deploys to production.
    expect(JOBS.size, 'expected to parse at least the build + deploy jobs').toBeGreaterThanOrEqual(2);
    expect([...JOBS.keys()]).toContain('deploy');

    const testJobs = jobsRunning('npx vitest run');
    expect(testJobs, 'exactly one job should run the unit suite').toHaveLength(1);

    const upstream = upstreamOf('deploy');
    expect(
      upstream.size,
      'the deploy job must declare `needs:` — without it, deploy runs regardless of the gates',
    ).toBeGreaterThan(0);
    expect(
      [...upstream],
      `deploy must wait (transitively) on "${testJobs[0]}", the job that runs the tests`,
    ).toContain(testJobs[0]);
  });

  it('the typecheck gate lives in a job the deploy waits on, too', () => {
    const tcJobs = jobsRunning('npm run typecheck');
    expect(tcJobs).toHaveLength(1);
    expect([...upstreamOf('deploy')]).toContain(tcJobs[0]);
  });

  it('every job is bounded by its own timeout, however the jobs are split', () => {
    // Replaces a brittle "exactly 2 timeouts" head-count: that version would have gone RED on a
    // legitimate 3-job split while staying GREEN on the dangerous one (a new ungated, unbounded job).
    // Per-job is the property actually wanted.
    for (const [name, body] of JOBS) {
      const m = /^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(body);
      expect(m, `job "${name}" must set timeout-minutes (else it inherits the 6-hour default)`).not.toBeNull();
      const mins = Number(m![1]);
      expect(mins).toBeGreaterThan(0);
      expect(mins).toBeLessThan(360);
    }
  });

  it('fires on source changes, so the gate is reachable at all', () => {
    // A perfect gate behind a paths filter that excludes src/ would never run. The filter exists to
    // keep session-bookkeeping commits (.claude/, HANDOFF_*.md) from triggering deploys.
    expect(YML).toContain("- 'src/**'");
    expect(YML).toContain('branches: [master]');
  });
});
