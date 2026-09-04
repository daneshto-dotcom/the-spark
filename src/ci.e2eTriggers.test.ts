/**
 * SPARK — S163 P7: **the e2e workflow's own trigger guard.**
 *
 * WHY A TEST FILE POLICES A YAML FILE — the `ci.deployGate.test.ts` argument, applied to the other
 * workflow. Until this session `e2e.yml` was schedule + pull_request + workflow_dispatch, so a push
 * to master ran no lanes and the GATING `e2e` job could sit RED for an unbounded time with nobody
 * notified. That is measured, not hypothetical: master was red on 2026-08-13 (worker-bots, 3/3) and
 * only a manual `gh workflow run` found it, and S161+S162 shipped ~20 commits of net/sim work with
 * zero e2e CI coverage until a hand-triggered run at S162's close.
 *
 * ⛔ THE SECOND ASSERTION IS THE IMPORTANT ONE, AND IT IS THE REASON THIS FILE EXISTS RATHER THAN
 * JUST THE TRIGGER EDIT. Restoring `push` under an unconditional `cancel-in-progress: true` would
 * have re-armed the failure `e2e.yml` already documents twice in its own comments: a cancelled run
 * concludes `cancelled`, NOT `failure` — no email, no artifacts, no red — so two pushes a minute
 * apart would leave master with no e2e signal while LOOKING like it had coverage. That is strictly
 * worse than no trigger. This test makes re-arming it fail here first.
 *
 * Assertions are on the PARSED yaml, not on the file text, so a comment that merely mentions
 * `cancel-in-progress: true` (this docblock's own sibling in the yml, for instance) cannot trip it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const YML = readFileSync(
  fileURLToPath(new URL('../.github/workflows/e2e.yml', import.meta.url)),
  'utf8',
);

/**
 * The `on:` block, read WITHOUT a yaml library (the repo has none as a dep). Returns the set of
 * top-level trigger keys — two-space-indented, colon-terminated, comments skipped.
 */
function triggerKeys(): Set<string> {
  const lines = YML.split('\n');
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  expect(start, 'e2e.yml must have a top-level `on:` block').toBeGreaterThanOrEqual(0);
  const out = new Set<string>();
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\S/.test(l) && l.trim() !== '') break; // dedented to column 0 → block over
    const m = /^ {2}([a-z_]+):/.exec(l);
    if (m) out.add(m[1]!);
  }
  return out;
}

describe('S163 P7 — e2e.yml trigger invariants', () => {
  it('⛔ runs on PUSH to master, so master cannot sit red between weekly sweeps', () => {
    const keys = triggerKeys();
    expect(keys.has('push'), 'the per-push trigger is the whole point — see the file header').toBe(true);
    // The pre-existing three must survive: the weekly sweep is the unfiltered safety net, and
    // workflow_dispatch is how a human forces a run.
    expect(keys.has('schedule')).toBe(true);
    expect(keys.has('pull_request')).toBe(true);
    expect(keys.has('workflow_dispatch')).toBe(true);
  });

  it('⛔ a master push is NEVER cancelled by a later one — `cancelled` is a SILENT non-signal', () => {
    /*
     * A cancelled run concludes `cancelled`, not `failure`: no email, no artifacts, nothing red.
     * With an unconditional cancel, two pushes a minute apart leave master with NO e2e signal —
     * the "three weeks with no E2E signal" incident already recorded in e2e.yml. PR branches may
     * still cancel: there a re-push genuinely supersedes, and the author is watching.
     */
    const m = /^\s*cancel-in-progress:\s*(.+?)\s*$/m.exec(YML);
    expect(m, 'e2e.yml must declare cancel-in-progress explicitly').not.toBeNull();
    const value = m![1]!;
    expect(value, 'an unconditional `true` re-arms the silent-cancel hazard').not.toBe('true');
    expect(value).toContain('refs/heads/master');
  });

  it('the PUSH trigger is path-filtered so bookkeeping commits do not burn a run', () => {
    // Mirrors deploy.yml. ⚠ The filter is on `push` ONLY — the weekly sweep stays unfiltered so it
    // covers everything regardless of what changed.
    expect(YML).toMatch(/push:\s*\n\s*branches: \[master\]\s*\n\s*paths:/);
    for (const p of ["'src/**'", "'e2e/**'", "'.github/workflows/e2e.yml'"]) {
      expect(YML, `${p} must be able to trigger the lanes that test it`).toContain(p);
    }
  });
});
