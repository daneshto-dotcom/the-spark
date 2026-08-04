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

/** Every shell command the workflow actually executes, in file order. Comments are excluded. */
const RUN_COMMANDS: readonly string[] = YML.split('\n')
  .map((l) => /^\s*run:\s*(.+?)\s*$/.exec(l)?.[1])
  .filter((c): c is string => c !== undefined);

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

  it('bounds both jobs with a timeout instead of inheriting the 6-hour default', () => {
    // Before S131 this file set no timeout at all, so one hung step could burn six hours.
    const timeouts = [...YML.matchAll(/^\s*timeout-minutes:\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
    expect(timeouts).toHaveLength(2); // the build job and the deploy job
    for (const t of timeouts) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(360); // strictly better than the inherited default
    }
  });

  it('fires on source changes, so the gate is reachable at all', () => {
    // A perfect gate behind a paths filter that excludes src/ would never run. The filter exists to
    // keep session-bookkeeping commits (.claude/, HANDOFF_*.md) from triggering deploys.
    expect(YML).toContain("- 'src/**'");
    expect(YML).toContain('branches: [master]');
  });
});
