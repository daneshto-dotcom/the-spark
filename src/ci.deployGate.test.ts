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

/**
 * ⭐ S158 P1 — THE BUILD MUST ACTUALLY RECEIVE THE TURN CREDENTIALS.
 *
 * S157 shipped a runbook that told the owner to put three values in a `.env` file and redeploy. The
 * live site is built by `actions/checkout` from a clean tree and `.env` is git-ignored, so those
 * values could never have reached the deployed bundle — the owner would have done the signup, seen a
 * green deploy, and still been unable to reach his brother. The build step simply had no `env:`.
 *
 * ⚠ THE DRIFT THIS EXISTS TO CATCH IS A TYPO, NOT A DELETION. If the workflow ever says
 * `VITE_TURN_URL` while `iceConfig.ts` reads `VITE_TURN_URLS`, everything still builds, deploys and
 * reports green — and ships STUN-only forever. So the guard pins the two sides AGAINST EACH OTHER
 * rather than against a hard-coded list of its own.
 */

/** The `env:` mapping attached to the step that runs `cmd`. Empty map when the step has none. */
function envOfStepRunning(cmd: string): ReadonlyMap<string, string> {
  const lines = YML.split('\n');
  const at = lines.findIndex((l) => /^\s*(?:-\s*)?run:\s*(.+?)\s*$/.exec(l)?.[1] === cmd);
  const out = new Map<string, string>();
  if (at === -1) return out;
  const stepIndent = /^(\s*)/.exec(lines[at])?.[1].length ?? 0;
  let inEnv = false;
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') continue;
    const indent = /^(\s*)/.exec(line)?.[1].length ?? 0;
    if (indent < stepIndent || /^\s*-\s/.test(line)) break; // next step — stop
    if (indent === stepIndent) {
      inEnv = /^\s*env:\s*$/.test(line);
      continue;
    }
    if (!inEnv) continue;
    const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/.exec(line);
    if (kv) out.set(kv[1], kv[2]);
  }
  return out;
}

const ICE_CONFIG_SRC = readFileSync(
  fileURLToPath(new URL('./net/iceConfig.ts', import.meta.url)),
  'utf8',
);

/** The `VITE_`-prefixed names `src/net/iceConfig.ts` actually reads. The other side of the contract. */
const ICE_CONFIG_ENV_NAMES: readonly string[] = [
  ...new Set(
    (ICE_CONFIG_SRC.match(/env\.(VITE_[A-Z0-9_]+)/g) ?? []).map((m) => m.replace('env.', '')),
  ),
].sort();

describe('S158 P1 — the TURN credentials reach the production build', () => {
  it('CONTROL — iceConfig.ts really does read VITE_ env vars (else every test below is vacuous)', () => {
    expect(ICE_CONFIG_ENV_NAMES.length).toBeGreaterThanOrEqual(3);
    expect(ICE_CONFIG_ENV_NAMES).toContain('VITE_TURN_URLS');
  });

  it('⭐ the build step passes EVERY env var iceConfig reads — the two sides cannot drift', () => {
    const env = envOfStepRunning('npm run build');
    expect(
      env.size,
      'the build step has no env: block, so a clean CI checkout ships STUN-only no matter what secrets exist',
    ).toBeGreaterThan(0);
    for (const name of ICE_CONFIG_ENV_NAMES) {
      expect([...env.keys()], `deploy.yml must pass ${name} to the build`).toContain(name);
    }
  });

  it('the values come from repository secrets/variables, never a literal baked into the workflow', () => {
    const env = envOfStepRunning('npm run build');
    for (const [name, value] of env) {
      if (!name.startsWith('VITE_TURN_')) continue;
      expect(value, `${name} must be a secrets/vars expression, never a literal credential`).toMatch(
        /\$\{\{[^}]*(secrets|vars)\./,
      );
    }
  });

  it('the wiring REPORT sees the same names as the build, so a green log cannot lie', () => {
    // The report step is what the owner reads to confirm their secrets landed. If it were given a
    // different (or smaller) set than the build, it could print "RELAY WILL BE SHIPPED" for a build
    // that shipped nothing — worse than no report at all.
    const build = [...envOfStepRunning('npm run build').keys()].sort();
    const report = [...envOfStepRunning('node scripts/turn-wiring-report.mjs').keys()].sort();
    expect(report).toEqual(build);
  });

  it('an UNSET secret is a supported state — iceConfig refuses a half-filled config rather than shipping it', () => {
    // The behavioural half of "a missing secret cannot break the deploy": without this, a future
    // edit could let an absent credential produce a malformed RTCIceServer, which is another silent
    // `400 allocate error` — the exact failure this whole change exists to end.
    expect(ICE_CONFIG_SRC).toMatch(/urls\.length === 0 \|\| username === '' \|\| credential === ''/);
  });

  it('.env.example documents the same three names, and says it does NOT affect the live site', () => {
    const example = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');
    for (const name of ICE_CONFIG_ENV_NAMES) expect(example).toContain(name);
    expect(example.toUpperCase()).toContain('GIT-IGNORED');
  });

  it('the runbook points at repository secrets — the mechanism that actually reaches production', () => {
    const doc = readFileSync(fileURLToPath(new URL('../TURN_SETUP.md', import.meta.url)), 'utf8');
    for (const name of ICE_CONFIG_ENV_NAMES) expect(doc).toContain(name);
    expect(doc).toMatch(/Secrets and variables/i);
  });
});

describe('S160 P1 — the DOTTED read matches the define, so the inlining is true by construction', () => {
  /**
   * ⛔ WHY THIS EXISTS. `vite.config.ts` defines the three DOTTED keys
   * (`'import.meta.env.VITE_TURN_URLS'`), but `iceConfig.ts` used to alias the object first
   * (`const env = import.meta.env; env.VITE_TURN_URLS`) — which has NO textual match for that
   * define. It worked only because Vite additionally merges user `import.meta.env.*` defines into
   * its whole-object env replacement: internal behaviour, not a documented contract.
   *
   * S160 P1 proved it worked by reading the emitted bundle — and that is the problem. It was true
   * by measurement, not by construction. Had a Vite major dropped the merge, `turnFromEnv` would
   * read `{}`, every build would ship STUN-only, the deploy would stay green, and the only symptom
   * would be the owner's cross-country match failing exactly as it did before any of this shipped.
   *
   * These two assertions make the explicit define load-bearing on its own.
   */
  const VITE_CONFIG_SRC = readFileSync(
    fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    'utf8',
  );

  it('CONTROL — vite.config.ts really does define the dotted `import.meta.env.<KEY>` form', () => {
    // If this ever stops being true the test below is vacuous rather than failing, so assert it.
    expect(VITE_CONFIG_SRC).toMatch(/import\.meta\.env\.\$\{k\}|['"]import\.meta\.env\./);
    expect(VITE_CONFIG_SRC).toContain('VITE_TURN_URLS');
  });

  it('⭐ every name iceConfig reads is read in the DOTTED form, never off an aliased env object', () => {
    for (const name of ICE_CONFIG_ENV_NAMES) {
      expect(
        ICE_CONFIG_SRC,
        `${name} must be read as import.meta.env.${name} so vite.config.ts's define is what replaces it`,
      ).toContain(`import.meta.env.${name}`);
    }
  });

  it('iceConfig does NOT alias import.meta.env into a local binding', () => {
    // The specific regression: `const env = (import.meta as …).env ?? {}`. An alias re-introduces
    // the dependency on Vite's whole-object merge, and it would defeat the test above by leaving a
    // dotted mention in a comment while the real read goes through the alias.
    //
    // ⚠ SCAN THE CODE, NOT THE PROSE. The first cut of this assertion failed on iceConfig's own
    // docblock, which quotes the banned form verbatim in order to explain it — so the guard was
    // reading the explanation as the defect. Comments are stripped first, and the CONTROL below
    // proves the stripping did not simply empty the haystack.
    const code = ICE_CONFIG_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code, 'comment-stripping must not have eaten the module').toContain('function turnFromEnv');
    expect(code).toMatch(/import\.meta\.env\.VITE_TURN_URLS/);
    expect(code).not.toMatch(/(?:const|let|var)\s+\w+\s*=\s*\(?\s*import\.meta\b[^;]*\.env\b/);
  });
});

describe('S158 P8 — the build is REPRODUCIBLE, so verify-deploy can mean something', () => {
  /**
   * ⛔ THIS GUARD EXISTS BECAUSE S158 P1 BROKE THE DEPLOY VERIFIER AND ONLY THE VERIFIER NOTICED.
   *
   * Giving the CI build step an `env:` block means an UNSET secret arrives as `''`, not as nothing —
   * GitHub expressions always produce a string. Vite inlines `import.meta.env` as an object literal
   * containing exactly the VITE_ keys it found, so CI emitted `{VITE_TURN_URLS: "", …}` while a plain
   * local build emitted an object without those keys. Same source, same behaviour, DIFFERENT BYTES:
   * CI shipped `index-BpAMsFnW.js` and a local build produced `index-C3Yn9Lmv.js`.
   *
   * `verify-deploy`'s LIVE carrier proves the deployed bundle IS the bundle you built, by content
   * hash. It went red on a perfectly good deploy — and a gate that cries wolf every time is worse
   * than no gate, because it trains its reader to skip the run where it is right.
   *
   * Declaring the keys in `vite.config.ts` makes them present with the same value everywhere. This
   * test keeps the declaration in step with what `iceConfig.ts` actually reads, so adding a fourth
   * VITE_ variable cannot silently reintroduce the divergence.
   */
  const VITE_CONFIG = readFileSync(
    fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    'utf8',
  );

  it('⭐ every VITE_ key iceConfig reads is DECLARED in vite.config, so an unset one is not "absent"', () => {
    for (const name of ICE_CONFIG_ENV_NAMES) {
      expect(
        VITE_CONFIG,
        `${name} is read by iceConfig but not declared in vite.config — CI (which always defines it, ` +
          `possibly as "") and a local build will emit different bytes, and verify-deploy's LIVE ` +
          `carrier will fail on every green deploy`,
      ).toContain(name);
    }
  });

  it('the declaration DEFAULTS to a value rather than leaving the key out when unset', () => {
    // `?? ''` is the load-bearing half: without it an unset variable is still an absent key, which is
    // the exact divergence this guard exists to prevent.
    expect(VITE_CONFIG).toMatch(/process\.env\[[^\]]+\]\s*\?\?\s*''/);
  });

  it('and it is wired through `define`, not merely mentioned in a comment', () => {
    // ⚠ LINE-ANCHORED, AND THE FIRST VERSION WAS NOT. A bare /define:\s*turnDefines/ matched the
    // COMMENTED-OUT form too, so the mutation test that should have proven this guard — commenting
    // the line out — passed. That is the exact false-match this file's own extraction notes warn
    // about two screens up, committed by the guard written to avoid it.
    // The `m` flag anchors ^ to each LINE, so `// define: …` cannot satisfy it.
    expect(VITE_CONFIG).toMatch(/^\s*define:\s*turnDefines\s*,?\s*$/m);
  });
});

describe('S162 P0 — the wiring report and iceConfig share ONE definition of a usable TURN value', () => {
  /**
   * ⛔ WHY THIS EXISTS. `turn-wiring-report.mjs` printed `✅ RELAY WILL BE SHIPPED` for the build
   * whose ICE config THREW, because it validated `v.trim() !== ''` and nothing else — the same
   * insufficient test as the code it was watching. **A watchdog that shares the watched code's blind
   * spot is not a watchdog.** The owner lost multiplayer on every network, same-LAN included, behind
   * a green deploy and a green report.
   *
   * The two now run the same shape rules. These assertions are what stop them drifting apart again.
   */
  const REPORT_SRC = readFileSync(
    fileURLToPath(new URL('../scripts/turn-wiring-report.mjs', import.meta.url)),
    'utf8',
  );

  const iceUrlRe = (src: string): string | undefined =>
    /const ICE_URL_RE = (\/.*\/[a-z]*);/.exec(src)?.[1];

  it('CONTROL — both files declare an ICE_URL_RE (else the comparison below is vacuous)', () => {
    expect(iceUrlRe(ICE_CONFIG_SRC)).toBeDefined();
    expect(iceUrlRe(REPORT_SRC)).toBeDefined();
  });

  it('⭐ the two ICE_URL_RE literals are byte-identical', () => {
    expect(iceUrlRe(REPORT_SRC)).toBe(iceUrlRe(ICE_CONFIG_SRC));
  });

  it('the report validates SHAPE, not merely presence — the S162 regression cannot return', () => {
    expect(REPORT_SRC).toContain('unwrapPastedSecret');
    expect(REPORT_SRC).toContain('cleanUrlToken');
    // It must be ABLE to say the words for "all three set, none of them usable" — the state that
    // previously rendered as a green tick.
    expect(REPORT_SRC).toMatch(/ALL THREE SECRETS ARE SET BUT NO RELAY/);
  });

  it('iceConfig degrades to STUN-only rather than shipping a config that can throw', () => {
    expect(ICE_CONFIG_SRC).toContain('export function parseTurnConfig');
    expect(ICE_CONFIG_SRC).toMatch(/ICE_URL_RE\.test/);
  });

  it('the runbook documents the paste shape the report points readers at', () => {
    const doc = readFileSync(fileURLToPath(new URL('../TURN_SETUP.md', import.meta.url)), 'utf8');
    expect(doc).toContain('The shape of the values');
  });
});
