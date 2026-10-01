/**
 * SPARK — S165: WHICH E2E TAGS GATE, PINNED, because a tag has been lying for sessions.
 *
 * ⛔ THE DEFECT. `e2e/zones-visual.spec.ts` opened with *"Tagged `@visual` so it stays out of the
 * gating lane"*. It never was: `package.json`'s `e2e:gating` inverts
 * `@quarantine-flaky|@soak|@perf-measure|@archived-hazard`, and `@visual` has never appeared in
 * that list. Eleven screenshot-capture tests — several of which assert almost nothing — have been
 * running in the blocking lane on every push, while the file that owns them said the opposite.
 *
 * ⚠ AND NOTHING COULD HAVE CAUGHT IT. `ci.e2eTriggers.test.ts` polices the workflow's TRIGGERS;
 * `ci.deployGate.test.ts` polices the deploy job. Neither knows what is IN a lane. A tag is just a
 * substring of a test title, so adding one is silent, and believing it excludes you is free.
 *
 * ⭐ WHAT THIS PINS. Every `@tag` that appears in `e2e/` must be declared here as EXCLUDED (it is
 * in the invert list) or GATING (it is not). A new tag, or a tag moved in or out of the invert
 * list, fails this test — which is the moment to decide deliberately rather than to discover it
 * from a comment two sessions later.
 *
 * ⚠ SOURCE-TEXT, NOT `--list`. Spawning Playwright from a vitest run would be slow and would need a
 * browser; the invert list and the tag literals are both plain text, and the drift being guarded is
 * textual. What this consequently CANNOT catch is a tag applied via a computed title — no test in
 * `e2e/` does that today, and if one ever does this guard will not see it.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/**
 * The declared lane for every tag used in `e2e/`.
 *
 * ⚠ PINNED AS LITERALS, NOT DERIVED. Deriving "excluded" from the invert list would make the whole
 * test assert `x === x` — it would agree with whatever `package.json` happens to say, which is the
 * thing under test. These are the decisions; `package.json` is checked AGAINST them.
 */
/*
 * S165 - A THIRD STATE, ADDED THE DAY THIS GUARD FIRST EARNED ITS KEEP.
 *
 * The binary EXCLUDED/GATING split could not describe `@races`: those specs are inverted OUT of
 * the shared `e2e:gating` lane (they observe a 1800-tick cadence and their budget starved it) and
 * are STILL GATING, via their own `e2e-races` job with no continue-on-error. Collapsing that into
 * 'EXCLUDED' would have recorded a gating lane as non-gating, which is the kind of quiet
 * inaccuracy this whole file exists to prevent.
 *
 *   EXCLUDED  - in the invert list, and NOT gating anywhere.
 *   GATING    - not in the invert list; runs in the shared lane.
 *   OWN_JOB   - in the invert list AND gating, on a dedicated job named below.
 */
const LANE: Readonly<Record<string, 'EXCLUDED' | 'GATING' | 'OWN_JOB'>> = {
  // Real multi-peer WebRTC that the CI sandbox cannot hold open. Non-gating by long-standing design.
  '@quarantine-flaky': 'EXCLUDED',
  // 10k-tick heap/census audits — 15 of 17 minutes of the old suite. Split to their own lane S126.
  '@soak': 'EXCLUDED',
  // Opt-in benchmarks, skipped unless SPARK_PERF=1.
  '@perf-measure': 'EXCLUDED',
  // Tests for the archived hazard subsystem, dormant behind HAZARD_SPAWN_ENABLED.
  '@archived-hazard': 'EXCLUDED',
  /*
   * ⭐ GATING, AND DELIBERATELY SO AFTER S165 LOOKED AT IT. The name suggests a capture lane, and
   * most of the file is one — but three of its eleven tests carry real assertions with positive
   * controls (the empty-opening check and the two HUD-overlap sweeps). Excluding the tag to match
   * an inaccurate comment would have cut live coverage to tidy up prose. If these are ever moved
   * out, the three substantive tests must be re-tagged FIRST, not carried along with the captures.
   */
  '@visual': 'GATING',
  /*
   * S165 - the castle emitter, the zone backdrops and the two settings toggles. Split out because
   * each observation costs ~30 s of SIM time (the emit cadence is 1800 ticks and the first slot is
   * missed while `gameState` is not yet PLAYING), which took the shared lane past its 720 s
   * Playwright cap on two runs. Gating on its own runner instead of slow in a shared one.
   */
  '@races': 'OWN_JOB',
  /*
   * ⭐ S191 A-4 (A1, R190-L) — the VS-BOTS `?worker=1` smoke. ONE 360 s test with no retries, i.e. up
   * to half of the shared lane's 720 s cap by itself, and every red run of that lane since S187 ran
   * the cap out with specs never started. Gating on its own runner, the `@races` shape.
   */
  '@worker-bots': 'OWN_JOB',
};

/** For each OWN_JOB tag, the workflow job that must run it and the script it must call. */
const OWN_JOBS: Readonly<Record<string, { job: string; script: string }>> = {
  '@races': { job: 'e2e-races', script: 'e2e:races' },
  '@worker-bots': { job: 'e2e-worker-bots', script: 'e2e:worker-bots' },
};

/** Tag-shaped strings that are not lane tags: decorator/rule names that live in comments. */
// S192 — `@vite-ignore` is the magic comment on a dev-server dynamic import (`e2e/poolSafePc.spec.ts`).
const NOT_A_LANE_TAG = new Set(['@param', '@playwright', '@typescript-eslint', '@seat', '@returns', '@see', '@vite-ignore']);

function invertList(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const gating = pkg.scripts['e2e:gating'];
  expect(gating, 'package.json must still have an e2e:gating script').toBeTruthy();
  const m = /--grep-invert\s+"([^"]+)"/.exec(gating);
  expect(m, `could not parse --grep-invert out of: ${gating}`).not.toBeNull();
  return (m as RegExpExecArray)[1].split('|');
}

function tagsUsedInE2e(): string[] {
  const dir = join(ROOT, 'e2e');
  const found = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    for (const t of readFileSync(join(dir, f), 'utf8').match(/@[a-z][a-z-]+/g) ?? []) {
      if (!NOT_A_LANE_TAG.has(t)) found.add(t);
    }
  }
  return [...found].sort();
}

describe('e2e lane composition is a decision, not an accident', () => {
  it('every tag used in e2e/ has a declared lane', () => {
    const used = tagsUsedInE2e();
    // Anti-vacuity: an empty scan would satisfy every assertion below.
    expect(used.length, 'found no tags at all — the scan is broken, not the tree').toBeGreaterThan(3);
    for (const t of used) {
      expect(
        LANE[t],
        `${t} appears in e2e/ but has no declared lane. Add it to LANE in this file as EXCLUDED `
          + `(and to e2e:gating's --grep-invert) or GATING — deliberately.`,
      ).toBeDefined();
    }
  });

  it('the EXCLUDED tags are exactly the ones e2e:gating inverts', () => {
    const inverted = invertList().sort();
    // OWN_JOB tags are inverted out of the shared lane too - that is what makes them their own job.
    const declaredExcluded = Object.entries(LANE)
      .filter(([, lane]) => lane === 'EXCLUDED' || lane === 'OWN_JOB')
      .map(([t]) => t)
      .sort();
    expect(inverted).toEqual(declaredExcluded);
  });

  it('⛔ a GATING tag is NOT in the invert list — the trap that caught @visual', () => {
    const inverted = new Set(invertList());
    for (const [tag, lane] of Object.entries(LANE)) {
      if (lane !== 'GATING') continue;
      expect(
        inverted.has(tag),
        `${tag} is declared GATING but e2e:gating inverts it. One of the two is wrong.`,
      ).toBe(false);
    }
  });

  it('⛔ and no spec claims a tag keeps it out of the gating lane while it does not', () => {
    /*
     * The exact sentence that was false for sessions. Guarded as SOURCE TEXT because the failure
     * was a comment, and a comment is the one thing no behavioural test can reach.
     */
    const dir = join(ROOT, 'e2e');
    const gatingTags = Object.entries(LANE).filter(([, l]) => l === 'GATING').map(([t]) => t);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      for (const tag of gatingTags) {
        const claim = new RegExp(`Tagged \`?${tag}\`? so it stays out of the gating lane`);
        expect(
          claim.test(src),
          `${f} claims ${tag} keeps it out of the gating lane, but ${tag} is GATING.`,
        ).toBe(false);
      }
    }
  });
  it('⛔ every OWN_JOB tag has a real, GATING workflow job that runs it', () => {
    /*
     * The claim that makes OWN_JOB different from EXCLUDED, and it is worth machine-checking because
     * the failure is invisible: invert a tag out of the shared lane, forget the job, and those tests
     * simply never run anywhere while every other gate stays green.
     *
     * Three things are asserted per tag: the job exists, it calls the right script, and it does NOT
     * carry `continue-on-error` - a non-gating "own job" is a lane that cannot fail.
     */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    /*
     * ⛔ S182 — **NORMALISE LINE ENDINGS AT THE READ, AND THAT IS WHY IT IS DONE HERE RATHER THAN IN
     * THE ONE REGEX BELOW.**
     *
     * SPARK has no `.gitattributes` and this project's Windows checkout has `core.autocrlf=true`, so
     * `e2e.yml` arrives CRLF while git stores LF. The job-boundary search below is
     * `/\n {2}[a-z][a-z0-9-]*:\n/` — a trailing `:\r\n` does not match `:\n`, so `nextJob` came back
     * `-1`, the "block" for `e2e-races` silently became THE WHOLE REST OF THE FILE, and it picked up
     * a `continue-on-error` belonging to an entirely different job. The lane is gating; the parse was
     * not.
     *
     * ⚠ THE FAILURE IS WINDOWS-ONLY AND CI IS GREEN, which is the dangerous half: the ubuntu runner
     * checks out LF, so this only ever reddened the local pre-commit run and read as somebody else's
     * broken test. That is the "gate that cries wolf" shape — it trains its reader to skip the run
     * where the gate is right. It went unfixed across at least two sessions for exactly that reason.
     *
     * Normalising once at the read fixes every pattern in this block at once, including the two
     * sibling `.includes('\n  ' + job + ':')` probes, rather than leaving the next one to be found.
     */
    const readText = (p: string): string => readFileSync(p, 'utf8').split('\r\n').join('\n');
    const yml = readText(join(ROOT, '.github', 'workflows', 'e2e.yml'));
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    const ownJobTags = Object.entries(LANE).filter(([, l]) => l === 'OWN_JOB').map(([t]) => t);
    // Anti-vacuity: with no OWN_JOB tags this test would assert nothing at all.
    expect(ownJobTags.length).toBeGreaterThan(0);

    for (const tag of ownJobTags) {
      const spec = OWN_JOBS[tag];
      expect(spec, `${tag} is OWN_JOB but names no job in OWN_JOBS`).toBeDefined();
      const { job, script } = spec as { job: string; script: string };

      expect(yml.includes(`\n  ${job}:`), `e2e.yml has no ${job} job for ${tag}`).toBe(true);
      expect(pkg.scripts[script], `package.json has no \`${script}\` script`).toBeTruthy();
      expect(
        (pkg.scripts[script] ?? '').includes(tag),
        `\`${script}\` must select ${tag}`,
      ).toBe(true);
      expect(yml.includes(`npm run ${script}`), `\`${job}\` must run \`${script}\``).toBe(true);

      // The gating half: slice this job's block and require no continue-on-error inside it.
      const start = yml.indexOf(`\n  ${job}:`);
      const rest = yml.slice(start + 1);
      /*
       * ⛔ S182 — `[\r\n]`, NOT `\n`. This anchor was `\n  name:\n`, and git checks `e2e.yml` out
       * with CRLF on Windows (`core.autocrlf=true`), so the trailing `\n` never matched: the search
       * returned -1, the block ran to END OF FILE, and it swallowed a LATER job's
       * `continue-on-error` comment. The test was RED on every Windows checkout and green in CI,
       * which reads as somebody else's broken test rather than an anchor bug.
       *
       * Measured before fixing: CRLF gave a 15394-char block that matched; LF gave 1136 and did not.
       * `e2e-races` carries no `continue-on-error` and always gated correctly.
       */
      const nextJob = rest.search(/[\r\n]  [a-z][a-z0-9-]*:[\r\n]/);
      const block = nextJob === -1 ? rest : rest.slice(0, nextJob);
      expect(
        block.includes('continue-on-error'),
        `\`${job}\` carries continue-on-error, so ${tag} is not actually gating anywhere`,
      ).toBe(false);
      /*
       * ⭐ S191 A-4 (Council, S191 ledger) — AND PLAYWRIGHT, NOT THE RUNNER, ENDS AN OVERRUN. An own
       * job with no `PW_GLOBAL_TIMEOUT_MIN` below its `timeout-minutes` concludes `cancelled` on an
       * overrun — no failure, no email, no report — which is a gating lane that cannot fail loudly.
       */
      const cap = /\n {4}timeout-minutes:\s*(\d+)/.exec(block);
      const pw = /\n {6}PW_GLOBAL_TIMEOUT_MIN:\s*'?(\d+)'?/.exec(block);
      expect(cap, `\`${job}\` must set a job-level timeout-minutes`).not.toBeNull();
      expect(pw, `\`${job}\` must set PW_GLOBAL_TIMEOUT_MIN in its env:`).not.toBeNull();
      expect(
        Number((pw as RegExpExecArray)[1]),
        `\`${job}\`: PW_GLOBAL_TIMEOUT_MIN must be strictly below timeout-minutes`,
      ).toBeLessThan(Number((cap as RegExpExecArray)[1]));
    }
  });

  it('⭐ S191 A-4 — every job’s Checkout is bounded, so a hung checkout FAILS instead of eating the lane', () => {
    /*
     * Run 36059057491 (deploy #3): `actions/checkout` hung for 9m23s on the gating job, the tests got
     * ~9 of their 18 minutes, and the job concluded `cancelled` — the silent non-signal. A normal
     * checkout takes ~14 s; 3 minutes is a hang detector, not a budget.
     */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const yml = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8').split('\r\n').join('\n');
    const jobs = yml.slice(yml.indexOf('\njobs:\n')).match(/\n {2}[a-z][a-z0-9-]*:\n/g) ?? [];
    const bare = yml.match(/- name: Checkout\n/g) ?? [];
    const bounded = yml.match(/- name: Checkout\n\s+uses: actions\/checkout@[^\n]+\n\s+timeout-minutes: (\d+)/g) ?? [];
    expect(jobs.length, 'anti-vacuity: the jobs were parsed').toBeGreaterThanOrEqual(9);
    expect(bare.length, 'one Checkout per job').toBe(jobs.length);
    expect(bounded.length, 'every Checkout step carries a timeout-minutes').toBe(bare.length);
    for (const c of bounded) expect(Number((/timeout-minutes: (\d+)/.exec(c) as RegExpExecArray)[1]), c).toBeLessThanOrEqual(3);
  });
});

/*
 * ⭐ S192 T1 — THE 4-PLAYER LATE-JOINER MESH IS GATING, AND THIS PINS HOW.
 *
 * It keeps `@quarantine-flaky` (so it stays out of the SHARED lane's budget — 1–2 min locally, 3–5×
 * that on CI) and gates through `e2e:lobby` on the `e2e-lobby` job, the S155 precedent. Both halves of
 * that are text, so both are pinned: if the title is edited or the grep loses it, the owner's
 * "the 4th player can't connect" regression would silently go back to the non-gating lane it was red
 * in, unnoticed, from 2026-08-11 to S192.
 */
describe('S192 T1 - the 4-player late-joiner mesh gates via e2e-lobby', () => {
  const norm = (s: string): string => s.replace(/\r\n/g, '\n');
  it('e2e:lobby greps the nplayer late-4th-joiner describe, and e2e-lobby carries no continue-on-error', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const m = /--grep\s+"([^"]+)"/.exec(pkg.scripts['e2e:lobby'] ?? '');
    expect(m, 'could not parse --grep out of e2e:lobby').not.toBeNull();
    const grep = new RegExp((m as RegExpExecArray)[1]);
    const spec = norm(readFileSync(join(ROOT, 'e2e/nplayer.spec.ts'), 'utf8'));
    const titles = [...spec.matchAll(/test\.describe\('([^']+)'/g)].map((x) => x[1]!);
    const lateJoiner = titles.filter((t) => t.includes('late 4th joiner'));
    expect(lateJoiner, 'the S192 late-4th-joiner describe is missing from nplayer.spec.ts').toHaveLength(1);
    expect(grep.test(lateJoiner[0]!), `e2e:lobby's grep does not select: ${lateJoiner[0]}`).toBe(true);
    // The forced-staleness core of the test is still there (otherwise it is a coin flip again).
    expect(spec).toContain('Date.now = () => real() + 60_000;');
    expect(spec).toContain("peer ${i} has the full mesh (3 peers)");
    const yml = norm(readFileSync(join(ROOT, '.github/workflows/e2e.yml'), 'utf8'));
    const start = yml.indexOf('\n  e2e-lobby:\n');
    expect(start).toBeGreaterThan(-1);
    const rest = yml.slice(start + 1);
    // The job ends at the next 2-space-indented line — a job key OR the comment block above the next
    // job (which talks about the quarantine lane's continue-on-error and must not be read as this one's).
    const end = rest.search(/\n  (?:#|[a-z][a-z0-9-]*:)/);
    const block = end === -1 ? rest : rest.slice(0, end);
    expect(block).toContain('run: npm run e2e:lobby');
    expect(block.includes('continue-on-error'), 'e2e-lobby is not gating').toBe(false);
  });

  /*
   * ⛔ S193 — THE BUDGET, PINNED AGAINST WHAT CI MEASURED. The test's own cap was 150 s; on CI it fired
   * in 11 of 12 attempts, 4 of them AFTER the 4-way mesh had formed (traces of runs 36882836513,
   * 36877965841, 36875812341, 36871399300 — `LATE_JOINER_BUDGET_MS` in nplayer.spec.ts has the table).
   * A gate whose time limit is below the runner's measured speed cannot pass even when the code is
   * right, so it trains everyone to ignore it. Three numbers have to agree, and each can drift alone:
   *   1. the test budget ≥ the slowest measured critical path (147 s to the 3-mesh + 135 s after = 282 s);
   *   2. the lane's PW_GLOBAL_TIMEOUT_MIN holds every attempt of it (retries 2 ⇒ 3) + the other four lobby
   *      tests at the 60 s config default, or the retries that exist for the relay flake never run;
   *   3. the runner sits ≥ 8 min above Playwright: setup (checkout + npm ci + browser install) took
   *      7.5 min in run 36882836513, and a runner kill is `cancelled`, not `failure` (S126).
   */
  it('S193 - the late-joiner budget fits CI, and the e2e-lobby lane fits three attempts of it', () => {
    const MEASURED_CI_CRITICAL_PATH_MS = 282_000;
    const LANE_RETRIES = 2; // playwright.config.ts: `process.env.CI ? 2 : 0`, and e2e-lobby sets no PW_RETRIES
    const OTHER_LOBBY_TESTS = 4; // S46 Baseline + 2 x S155 join-stall + S155 exit-from-multiplayer
    const DEFAULT_TEST_TIMEOUT_MS = 60_000;
    const SETUP_HEADROOM_MIN = 8;
    const spec = norm(readFileSync(join(ROOT, 'e2e/nplayer.spec.ts'), 'utf8'));
    const b = /\nconst LATE_JOINER_BUDGET_MS = ([\d_]+);/.exec(spec);
    expect(b, 'LATE_JOINER_BUDGET_MS is missing from nplayer.spec.ts').not.toBeNull();
    const budget = Number((b as RegExpExecArray)[1]!.replace(/_/g, ''));
    // The constant must be what the late-joiner test actually USES, not a number sitting beside it.
    const lateAt = spec.indexOf("late 4th joiner @quarantine-flaky', () => {");
    expect(lateAt, 'late-joiner describe not found').toBeGreaterThan(-1);
    const lateBody = spec.slice(lateAt);
    const firstTimeout = /test\.setTimeout\(([^)]+)\)/.exec(lateBody);
    expect(firstTimeout?.[1], 'the late-joiner test must call test.setTimeout(LATE_JOINER_BUDGET_MS)').toBe(
      'LATE_JOINER_BUDGET_MS',
    );
    expect(budget, 'the budget is below the slowest CI critical path measured in S193').toBeGreaterThanOrEqual(
      MEASURED_CI_CRITICAL_PATH_MS,
    );

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['e2e:lobby'], 'e2e:lobby must not override retries').not.toMatch(/--retries/);
    const yml = norm(readFileSync(join(ROOT, '.github/workflows/e2e.yml'), 'utf8'));
    const rest = yml.slice(yml.indexOf('\n  e2e-lobby:\n') + 1);
    const end = rest.search(/\n  (?:#|[a-z][a-z0-9-]*:)/);
    const block = end === -1 ? rest : rest.slice(0, end);
    expect(block, 'e2e-lobby must not override retries').not.toContain('PW_RETRIES');
    const cap = Number((/\n {4}timeout-minutes:\s*(\d+)/.exec(block) as RegExpExecArray)[1]);
    const pw = Number((/\n {6}PW_GLOBAL_TIMEOUT_MIN:\s*'?(\d+)'?/.exec(block) as RegExpExecArray)[1]);
    const laneNeedMs = (LANE_RETRIES + 1) * budget + OTHER_LOBBY_TESTS * DEFAULT_TEST_TIMEOUT_MS;
    expect(pw * 60_000, `e2e-lobby PW_GLOBAL_TIMEOUT_MIN=${pw} cannot hold ${laneNeedMs} ms`).toBeGreaterThanOrEqual(
      laneNeedMs,
    );
    expect(cap - pw, `e2e-lobby: runner ${cap} min must sit >= ${SETUP_HEADROOM_MIN} min above Playwright ${pw}`).toBeGreaterThanOrEqual(
      SETUP_HEADROOM_MIN,
    );
  });
});

/** The `  <job>:` block of e2e.yml, up to the next 2-space-indented line (a job key or the next job's comment). */
function jobBlock(job: string): string {
  const yml = readFileSync(join(ROOT, '.github/workflows/e2e.yml'), 'utf8').replace(/\r\n/g, '\n');
  const at = yml.indexOf(`\n  ${job}:\n`);
  expect(at, `job ${job} not found in e2e.yml`).toBeGreaterThan(-1);
  const rest = yml.slice(at + 1);
  const end = rest.slice(1).search(/\n  (?:#|[a-z][a-z0-9-]*:)/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}
function laneMinutes(job: string): { cap: number; pw: number } {
  const block = jobBlock(job);
  return {
    cap: Number((/\n {4}timeout-minutes:\s*(\d+)/.exec(block) as RegExpExecArray)[1]),
    pw: Number((/\n {6}PW_GLOBAL_TIMEOUT_MIN:\s*'?(\d+)'?/.exec(block) as RegExpExecArray)[1]),
  };
}

/*
 * ⛔ S193 — THE WORKER-BOTS WALL BACKSTOPS ARE DERIVED FROM THEIR OWN TICK BUDGETS. CI run 36867560496
 * failed `WALL BACKSTOP BOUND FIRST — 1104/1800 ticks in 180.3s (≈6.12 ticks/s)`: one 180 s backstop,
 * sized for the 1200-tick growth wait, was reused for the 1800-tick first-build wait. The game was never
 * given its runway and the run emailed the owner as a failure. This pins, mechanically:
 *   · EVERY `waitForWorldWithinTicks` call in the spec passes `X_BUDGET_TICKS, wallCapFor(X_BUDGET_TICKS)` —
 *     the same X twice, so a backstop cannot be borrowed from another budget again;
 *   · the slowest rate it assumes is no faster than the 6 ticks/s measured;
 *   · the test budget is derived (not a literal), and the lane holds it with ≥ 8 min of runner headroom.
 */
describe('S193 - e2e-worker-bots: each tick-budgeted wait carries a backstop derived from its own budget', () => {
  it('every waitForWorldWithinTicks pairs X_BUDGET_TICKS with wallCapFor(X_BUDGET_TICKS); lane fits the derived budget', () => {
    const spec = readFileSync(join(ROOT, 'e2e/worker-bots.spec.ts'), 'utf8').replace(/\r\n/g, '\n');
    const calls = [...spec.matchAll(/await waitForWorldWithinTicks\(([\s\S]*?)\n\s*\);/g)].map((m) => m[1]!);
    expect(calls.length, 'expected the first-build and growth waits').toBe(2);
    for (const c of calls) {
      const m = /([A-Z_]+_BUDGET_TICKS),\s*wallCapFor\(([A-Z_]+_BUDGET_TICKS)\),?\s*$/.exec(c);
      expect(m, `a waitForWorldWithinTicks call does not end in X_BUDGET_TICKS, wallCapFor(X_BUDGET_TICKS):\n${c}`).not.toBeNull();
      expect((m as RegExpExecArray)[2], 'backstop borrowed from another budget').toBe((m as RegExpExecArray)[1]);
    }
    const rate = /\nconst SLOWEST_CI_TICKS_PER_S = (\d+);/.exec(spec);
    expect(rate, 'SLOWEST_CI_TICKS_PER_S missing').not.toBeNull();
    expect(Number((rate as RegExpExecArray)[1]), 'assumed rate is faster than the 6.12 ticks/s CI measured').toBeLessThanOrEqual(6);
    const ticks = (name: string): number =>
      Number((new RegExp(`\\nconst ${name} = ([\\d_]+);`).exec(spec) as RegExpExecArray)[1]!.replace(/_/g, ''));
    const rateN = Number((rate as RegExpExecArray)[1]);
    const setup = ticks('SETUP_WAITS_MS');
    const budgetMs =
      setup + Math.ceil((ticks('FIRST_BUILD_BUDGET_TICKS') / rateN) * 1000) + Math.ceil((ticks('GROWTH_BUDGET_TICKS') / rateN) * 1000);
    expect(spec, 'the test must use the derived budget').toContain('test.setTimeout(WORKER_BOTS_TEST_BUDGET_MS);');
    const { cap, pw } = laneMinutes('e2e-worker-bots');
    // retries are 0 on this spec (`describe.configure({ retries: 0 })`), so ONE attempt must fit.
    expect(spec).toContain('test.describe.configure({ retries: 0 });');
    expect(pw * 60_000, `e2e-worker-bots PW_GLOBAL_TIMEOUT_MIN=${pw} cannot hold the ${budgetMs} ms test`).toBeGreaterThanOrEqual(budgetMs);
    expect(cap - pw, `e2e-worker-bots: runner ${cap} must sit >= 8 min above Playwright ${pw}`).toBeGreaterThanOrEqual(8);
  });
});
