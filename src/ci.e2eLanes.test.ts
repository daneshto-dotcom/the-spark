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
};

/** For each OWN_JOB tag, the workflow job that must run it and the script it must call. */
const OWN_JOBS: Readonly<Record<string, { job: string; script: string }>> = {
  '@races': { job: 'e2e-races', script: 'e2e:races' },
};

/** Tag-shaped strings that are not lane tags: decorator/rule names that live in comments. */
const NOT_A_LANE_TAG = new Set(['@param', '@playwright', '@typescript-eslint', '@seat', '@returns', '@see']);

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
    const yml = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');
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
      const nextJob = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
      const block = nextJob === -1 ? rest : rest.slice(0, nextJob);
      expect(
        block.includes('continue-on-error'),
        `\`${job}\` carries continue-on-error, so ${tag} is not actually gating anywhere`,
      ).toBe(false);
    }
  });
});
