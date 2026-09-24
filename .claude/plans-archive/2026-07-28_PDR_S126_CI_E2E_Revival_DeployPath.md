═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S126 Batch: CI E2E gating revival + deploy-path consolidation
═══════════════════════════════════════════════════════════
Status: AWAITING APPROVAL
Tier: Standard (~28K est, 8 files) → 3-way Council R1 (Battle Ledger) MANDATORY
Date: 2026-07-28

OBJECTIVE
  Restore SPARK's only automated regression gate over a real browser. The CI `e2e`
  (gating) job has hit its 15m cap and been CANCELLED on all 3 scheduled runs
  (2026-07-13, -07-20, -07-27), so no green/red E2E signal has existed for ≥3 weeks.
  The suite cannot fit that cap by construction — 5 of its 30 tests are 10k-tick
  soak/measurement runs costing ~15.2m of a 16.8m local wall-clock. Fix = split the
  slow soak lane off the fast regression lane, repair 3 CI-only test failures, and make
  any future overrun report as a FAILURE with artifacts instead of a silent `cancelled`.
  Second, execute the owner's now-settled deploy decision (Actions auto-deploy) by
  retiring the manual gh-pages path, which is a live production-rollback footgun.

CURRENT STATE (all empirically probed this session — Rule 21 A.0)
  Gates reproduce the S125 handoff exactly:
    · tsc 0 · vitest 1914/1914 · bundle 640.8/750 KiB (109.2 headroom)
    · master HEAD d7bd548; origin/master 433793a (d7bd548 = docs-only, local-only)
    · No IN-PROGRESS plans, no open GH issues
    · Live deploy content-verified: site serves assets/index-BD5X8Lx1.js == fresh local
      build of master HEAD.

  A. CI gating lane — MEASURED from run 30248805897 job 89921854161:
    · "Running 30 tests using 1 worker" 08:10:25 → "operation was canceled" 08:24:56
      = 14m31s of test time, killed by the runner's `timeout-minutes: 15`
    · Progress glyphs: 13 tests completed (all PASSED), 3 FAILED, 14 NEVER RAN
    · The 3 failures = e2e/lobby-construction.spec.ts :67, :204, :263 — each burns
      60s × 3 attempts (retries:2) = 180s → 540s = 9m00s of the 15m budget
    · The IDENTICAL 3 tests failed on the 2026-07-13 run (job 86790916495) ⇒
      long-standing, PREDATES S124/S125; not a regression from recent work
    · No "N passed/N failed" summary ever printed, and the artifact step logged
      "No files were found with the provided path: playwright-report/" ⇒ the runner
      SIGKILL pre-empts the reporter flush, so there is NO report/trace to debug from
    · A timeout-cancel concludes `cancelled`, NOT `failure` ⇒ no failure email, and
      `gh run list` reads it as a benign concurrency cancel. Structural mask.

  B. Suite composition — MEASURED by a full local `npm run e2e:gating` (exit 0):
    · 28 passed + 2 skipped in **16.8m** (on Windows with a real GPU)
    · Slow FILES: worker-heap.spec.ts **9.3m** · render-heap.spec.ts **5.9m** = 15.2m
    · `--list` ⇒ 30 tests in 13 files. Five are soak/measurement, not regression:
        worker-heap :239 + :329  (10k-tick GC/heap audits, S123 P3)
        render-heap :121         (10k-tick census audit, S124 P3)
        perf-snapshot :159 + :344 (benchmarks, ALREADY tagged @perf-measure)
    · The other 25 regression tests total only ~1.6m locally.
    · REFINEMENT (probed): the 2 "skipped" tests ARE the @perf-measure pair — both carry
      `test.skip(process.env.SPARK_PERF !== '1', 'opt-in measurement (SPARK_PERF=1)')`,
      so they are already inert in CI and contribute ~0 to the timeout. The REAL soak
      cost is the 3 heap tests (15.2m). Routing @perf-measure into the soak lane is
      therefore cosmetic tidying, not a budget fix — stated so no one credits it with
      savings it does not produce.
    · Lane-routing mechanics VERIFIED (not assumed), using the pre-existing tag so no
      files had to change first: `--grep-invert "@quarantine-flaky|@perf-measure"` ⇒
      28 tests in 12 files; `--grep "@perf-measure"` ⇒ 2 tests in 1 file. Regex
      alternation over full test titles works as the design requires.
    ⇒ CORRECTION TO AN EARLIER ESTIMATE IN THIS SESSION: I first extrapolated CI pace
      (13 passes / 5m31s ≈ 25.5s/test) to ~12m45s for 30 tests and proposed simply
      raising the cap to 25m. That was WRONG — it assumed uniform per-test cost, and
      the 14 tests that never ran include the two most expensive files by a wide
      margin. The suite is ~17m LOCALLY; CI is ~3.4× slower on the tests we can
      compare (13 tests: ~1.6m local-equivalent vs 5m31s CI). A cap large enough to
      hold the soak tests in CI is plausibly 40m+, and guessing it is the wrong move.
      The composition, not the number, is the defect.

  C. The 3 failures are CI-environment-only:
    · All 7 lobby-construction tests PASS locally in ~23s, and ALSO with CI=true ⇒
      specific to ubuntu-latest (--use-gl=swiftshader software WebGL @1920×1080, no GPU)
    · FAILING SUB-CHECK — CONFIRMED EMPIRICALLY (not inferred). All 3 sit on
      `await input.click()`. Playwright click actionability requires
      visible+enabled+STABLE, where `stable` compares the element box across two
      consecutive requestAnimationFrame callbacks. A throwaway probe was run against
      THIS EXACT Playwright (1.60.0) using an element moved on every rAF (permanently
      unstable). Result — all three claims held:
        (a) `fill()` SUCCEEDS on a permanently-unstable element ⇒ its actionability is
            visible+enabled+editable and excludes `stable`;
        (b) `fill()` FOCUSES the element ⇒ a following `press('Enter')` works;
        (c) `click()` TIMES OUT on that same element, emitting a call log whose
            signature matches the CI failure line-for-line, including the distinctive
            "2 × waiting for element to be visible, enabled and stable".
      ⇒ The failing gate is `stable`, and `fill()` is structurally immune to it.
      (Probe lived in the session scratchpad; it is NOT added to the repo.)
    · Corroboration: `expect(input).toBeVisible()` PASSES on the line immediately
      before (visible/enabled are fine), and the sibling test at :183 drives the SAME
      input via coordinate-based `page.mouse.click()` and PASSES in CI.
    · VERIFIED, not assumed: lobbyScreen repositioning is NOT per-frame. `updatePeerStatus`
      (the per-frame caller from main.ts) has a churn guard — `lobbyReduce` returns the
      SAME state reference when nothing changed and the method returns before
      `applyView()` — so `updateInputPosition()` runs only on show/resize/transition.
      "Unstable" is therefore not animation jitter.
    · RESIDUAL OPEN QUESTION (does NOT block the fix): why the box fails `stable` on the
      runner at all — rAF STARVATION (frames so slow the 2-frame probe cannot complete
      in 60s) vs genuine box OSCILLATION (canvas getBoundingClientRect flapping across
      resize events). Both produce an identical call log, so local evidence cannot
      discriminate them. The chosen fix is immune to BOTH because it never consults
      `stable`. If oscillation is the truth there is a latent app-level issue worth a
      follow-up — logged as a carry-forward, NOT silently dropped.

  D. Deploy path — probed, and it CONTRADICTS the assumed model:
    · gh api .../pages ⇒ build_type "legacy", source {branch: gh-pages, path: /}
    · deploy.yml uses actions/upload-pages-artifact@v5 + actions/deploy-pages@v5 —
      the ARTIFACT mechanism, which nominally requires build_type "workflow"
    · origin/gh-pages EXISTS at a321609, dated 2026-07-11 ("deploy: 999e530") =
      17 days / ~4 sessions STALE
    · DISCRIMINATOR: gh-pages index.html → assets/index-KQaaBM--.js; LIVE →
      assets/index-BD5X8Lx1.js; fresh local build → assets/index-BD5X8Lx1.js
      ⇒ LIVE IS SERVED BY THE ACTIONS ARTIFACT DEPLOYMENT. The Pages `legacy`/
      `gh-pages` config is stale metadata that does not reflect serving traffic.
    · Deployments API confirms Actions github-pages deployments at 433793a (07-19),
      5756060 (07-19), 80f1058 (07-18), 9f48d50 (07-12).
    ⇒ `npm run deploy` writes the stale gh-pages branch that the Pages config STILL
      nominally points at. Running it risks serving 17-day-old S122 code as production.
      A footgun, not merely a redundant path. This INVERTS the assumed risk direction
      of retiring it.

SCOPE (2 priorities, 8 changes, 8 files)
──────────────────────────────────────────────────────────

P1 — Revive the CI E2E gating lane (lane split + 3 test repairs + de-mask)

0. CI VALIDATION RUN — now an ACCEPTANCE GATE, not a prerequisite
   The scratchpad probe (§C) already confirmed the failing gate is `stable` and that
   `fill()` is immune to it, so a "before" CI run is no longer needed to CHOOSE the fix.
   Therefore: implement changes 1–5, then spend ONE `gh workflow run e2e.yml` validating
   the whole batch (cheaper than two runs, and the acceptance criteria need it anyway).
   While reading that run, also try to settle the residual rAF-starvation-vs-oscillation
   question from the uploaded trace. If it turns out to be genuine box oscillation, the
   app-level follow-up gets logged as a carry-forward — it does not retro-invalidate
   this fix, which bypasses `stable` either way.

1. .github/workflows/e2e.yml (modify) — THREE-LANE SPLIT
   Add a third job `e2e-soak` running ONLY the slow tests (`--grep "@soak|@perf-measure"`),
   on its own runner with a generous `timeout-minutes: 50`. Jobs run in PARALLEL, so
   this costs no wall-clock. Existing `e2e` (fast gating) keeps `timeout-minutes: 18`
   for margin; `e2e-quarantine` unchanged at 20m + continue-on-error.
   `e2e-soak` gets `continue-on-error: true` INITIALLY — its heap/census thresholds were
   tuned on local hardware (S123/S124) and have NEVER executed on a 2-core CI runner, so
   gating on them today would just install a new permanent red. Promote to gating only
   after 2–3 consecutive green CI runs establish CI-side headroom; recorded as an
   explicit carry-forward, not dropped.

2. e2e/lobby-construction.spec.ts (modify)
   Remove the 3 redundant `await input.click()` calls (~lines 83, 210, 271). Each is
   immediately followed by `await input.fill(...)`; Playwright's `fill` actionability is
   visible+enabled+EDITABLE — it does NOT include the rAF-based `stable` check — and
   `fill` focuses the element, which is all the subsequent `press('Enter')` needs. Add a
   one-line comment recording why, so it is not "helpfully" restored later.
   COVERAGE ARGUMENT: no assertion is lost. The click is not the subject of any
   expect(); click-to-focus has its OWN dedicated test at :183 (Pixi-tap → toBeFocused),
   which is the CI-proven pattern. `fill` still dispatches the `input` event, so the
   sanitizeRoomCodeValue path under test is exercised unchanged.

3. e2e/worker-heap.spec.ts + e2e/render-heap.spec.ts (modify — 2 files)
   Append ` @soak` to each describe title so the lane greps route them. Tag-based lane
   routing is EXISTING precedent in this repo (@quarantine-flaky, @perf-measure), not a
   new mechanism.

4. playwright.config.ts (modify)
   Add a MINUTES→ms globalTimeout with an explicit finite-positive guard, so a typo'd
   env var degrades to "no global timeout" instead of aborting the suite instantly:
     const gtMin = Number(process.env.PW_GLOBAL_TIMEOUT_MIN);
     globalTimeout: Number.isFinite(gtMin) && gtMin > 0 ? gtMin * 60_000 : undefined,
   Set per-job in e2e.yml via `env:`, ALWAYS below that job's `timeout-minutes`:
     e2e            → PW_GLOBAL_TIMEOUT_MIN: 12  (timeout-minutes 18)
     e2e-soak       → PW_GLOBAL_TIMEOUT_MIN: 44  (timeout-minutes 50)
     e2e-quarantine → PW_GLOBAL_TIMEOUT_MIN: 17  (timeout-minutes 20)
   This makes PLAYWRIGHT stop an overrun — exiting non-zero, flushing reporters, writing
   playwright-report/ — instead of the runner SIGKILLing it. Closes D2 (`cancelled`
   masquerade) and D3 (no artifacts) structurally, independent of change 2's fix.

5b. e2e/lobby-construction.spec.ts (add ONE diagnostic test, ` @soak`-tagged)
   ADOPTED FROM GEMINI FINDING 1 (its alternative fix, not its primary one). Add a
   non-gating diagnostic that samples the code-input's boundingClientRect across ~10
   consecutive requestAnimationFrame callbacks and logs the sequence plus the observed
   frame intervals. This converts the §C RESIDUAL UNKNOWN into data on the very next CI
   run: identical boxes + huge frame intervals ⇒ rAF starvation; differing boxes ⇒
   genuine oscillation (a real app-level defect worth its own follow-up). It is
   report-oriented and lives in the non-gating soak lane, so it can never red the build.

5. package.json (modify)
   `e2e:gating` → `--grep-invert "@quarantine-flaky|@soak|@perf-measure"`; add
   `e2e:soak` → `--grep "@soak|@perf-measure"` with its own --output dir and
   --reporter=list (mirroring the quarantine lane's isolation so reports never collide).

P2 — Deploy-path consolidation (owner decision made: Actions auto-deploy)

6. package.json (modify) — remove `"deploy": "bash scripts/deploy-pages.sh"`.
7. scripts/deploy-pages.sh (delete) — remove the footgun outright rather than leave a
   loaded gun with a warning label.
8. Docs (modify) — BACKLOG.md STATUS + LOCKED_DECISIONS.md deploy entry: record ONE
   deploy path (Actions artifact on master push, paths-filtered), that origin/gh-pages
   is abandoned S122-era code, that the Pages API MIS-reports legacy/gh-pages, and the
   recovery procedure if Actions ever dies again (re-add script OR flip Pages source).

NO CHANGES TO
  · src/** — zero production/runtime code in this batch. Nothing ships to players.
    (Unless change 0 confirms the rival cause — which requires a Scope Amendment first.)
  · Any test ASSERTION — only a redundant driver call is removed and describe titles
    gain a tag. No expect() is added, changed, weakened, or deleted.
  · PROTOCOL_VERSION (stays 15), wire format, LOCKED game decisions.
  · deploy.yml — the Actions path is the keeper and is working; not touched.
  · The quarantine lane's tags, its continue-on-error, or the gating/quarantine split.
  · origin/gh-pages branch and the GitHub Pages `build_type` setting — see OWNER-GATED.

OWNER-GATED (explicitly NOT in this batch; needs a separate, explicit go)
  · `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow` — the change that
    actually fixes the stale config at root. Mutates production hosting config.
  · Deleting origin/gh-pages. Remote-destructive, and it is also the standing rollback
    copy. Correct ORDER if ever done: flip build_type FIRST, verify live, THEN delete.
    Recommendation: do NEITHER this session; document both.

RISK ASSESSMENT
  · R1 — RETIRED as a fix-selection risk. The scratchpad probe on Playwright 1.60
    confirmed the failing gate is `stable` and that `fill()` excludes it, so the fix is
    immune to BOTH candidate sub-causes. What remains is diagnostic curiosity (which
    sub-cause) plus the possibility of a latent app-level oscillation issue — carried
    forward, not fix-blocking. Changes 1/3/4 deliver the lane-split and de-masking value
    independently of change 2.
  · R2 — Dropping `.click()` silently loses coverage. MITIGATION: coverage argument in
    change 2; :183 retains explicit click-to-focus coverage; the CI validation run is
    the proof, not the local run.
  · R3 — The 14 CI-unrun tests may hide their OWN failures, surfacing once the budget
    frees. PARTIALLY RETIRED: the full local gating run passed 28/2-skipped, so they are
    green on local hardware; CI-specific failures remain possible (that is exactly the
    §C failure class). Any newly-revealed failure gets triaged or logged as an explicit
    carry-forward — never silently dropped.
  · R4 — The soak tests have NEVER run in CI; their locally-tuned heap thresholds may
    not hold on a 2-core SwiftShader runner, and they may exceed even 44m. MITIGATION:
    the lane is continue-on-error from day one precisely so this cannot red the build,
    and globalTimeout 44m guarantees Playwright flushes a report even on overrun, so an
    overrun still yields data. SHARPENED after Council (Grok CRITICAL): the first soak
    run is explicitly a MEASUREMENT with an UNKNOWN outcome — this PDR does NOT claim
    the soak lane will pass. Promotion to gating therefore requires CI-side threshold
    RETUNING against observed runner numbers, NOT merely "2-3 green runs"; the original
    wording would have been a rubber-stamp. If the numbers prove unusable on
    GitHub-hosted runners, the honest outcome is to keep the lane advisory and say so.
  · R5 — CI minutes on a repo that hit a spending cap in S110. MITIGATION: E2E is
    weekly-schedule + PR + dispatch only (the per-push trigger was removed in S110).
    A green fast lane is ~6m; the soak lane is the new cost and is the reason it is
    weekly, not per-push. Net vs today: we currently BURN 15m+20m on a double-cancel
    that yields zero signal.
  · R6 — Removing `npm run deploy` strands the only fallback if Actions dies again
    (the S110 billing-lock scenario). MITIGATION: change 8 documents the recovery
    procedure; gh-pages persists as a branch, so the capability is fully recoverable.
  · R7 — LOW overall: CI/test/docs only. No player-visible surface, no wire change, no
    runtime code. Rollback is a single `git revert`.
  · R8 — Pushing any commit from this session also pushes the local-only d7bd548. That
    is unavoidable and harmless: it is docs-only and excluded by deploy.yml's `paths:`
    allowlist, so it triggers no deploy. Flagged because the approved option was the
    one that did NOT push d7bd548 — mechanically, committing P1/P2 carries it along.

DELIBERATION — Council R1 Battle Ledger (Standard tier, 3-way: Claude + GROK-DISRUPTOR
grok-4.20-0309-reasoning + GEMINI-AUDITOR gemini-3.1-pro-preview)

  GROK CRITICAL — soak lane may exceed 50m and/or produce non-representative numbers on
  a SwiftShader runner, making "promote after 2-3 green runs" impossible.
    → ADOPTED (as a wording/claim correction, not a design change). R4 sharpened: first
      run is a MEASUREMENT with unknown outcome; promotion requires CI-side retuning.
      Grok's "use a GPU runner" is not actionable on GitHub-hosted ubuntu-latest (it
      correctly self-flagged UNKNOWN on the runner label) — not adopted.

  GROK HIGH — a non-gating soak lane leaves 5 soak/perf tests unenforced; memory/GC or
  render regressions would not block anything.
    → ADOPTED IN PART. Substantively true, but note the baseline: those tests enforce
      NOTHING TODAY (they have never executed in CI). Non-gating-but-running is a strict
      improvement over never-running. Adopted as a concrete logged carry-forward with a
      retuning-based promotion criterion rather than a vibes-based one.

  GROK MED — the per-job globalTimeout plumbing was under-specified (no e2e.yml fragment).
    → ADOPTED. Change 4 now states the exact per-job env values and the invariant
      (globalTimeout < timeout-minutes for every lane). Grok also called the globalTimeout
      approach itself CORRECT.

  GEMINI HIGH (F1) — deleting `click()` removes the only stability check; if the cause is
  genuine oscillation we would "silently ship a UI a real human cannot click."
    → PRIMARY FIX REJECTED, ALTERNATIVE ADOPTED. Rejected because (a) the deleted call was
      never an assertion — no expect() depends on it and no comment marks stability as
      under test; it is incidental plumbing whose actionability check accidentally coupled
      the test to frame stability; (b) Playwright's `stable` gate (two consecutive rAF
      frames with an identical box) is far stricter than human clickability, so "a human
      cannot click it" does not follow; (c) Gemini's proposed `click({timeout:5000})` would
      STILL FAIL in CI — just 15s faster per test — reinstalling a permanent gating red and
      defeating the entire priority. Its ALTERNATIVE suggestion was good and is adopted as
      change 5b: an rAF box-sampling diagnostic that finally discriminates the residual
      cause.

  GEMINI MED (F2) — job-level `continue-on-error: true` makes the job report success
  regardless of exit code, so every run "appears green" and promotion is unmeasurable.
    → REFUTED by direct observation IN THIS REPO. Run 30248805897 has the
      continue-on-error `e2e-quarantine` job, and `gh run view` renders it as
      "X e2e-quarantine in 20m22s" — the failing conclusion is plainly visible in the CLI
      and jobs API; only the RUN-level conclusion ignores it. So promotion IS measurable by
      reading the job conclusion. Gemini's proposed fix (drop continue-on-error, gate via
      branch-protection required-checks) is also inapplicable today: master is NOT
      branch-protected in this repo, so there is no required-checks list to omit from, and
      dropping continue-on-error would make a soak failure red the whole run — precisely
      the permanent red being avoided. Noted as the correct long-term mechanism IF master
      ever gains branch protection.

  GEMINI MED (F3) — unit mismatch: globalTimeout expects ms, so passing 12/44/17 raw would
  abort after milliseconds.
    → ALREADY HANDLED; its stated fix is verbatim what the PDR already specified
      (`* 60_000`). Kept explicit, and HARDENED beyond the finding with a
      `Number.isFinite && > 0` guard so a typo'd env var degrades to "no global timeout"
      instead of instantly aborting all lanes.

  CONVERGED: the three-lane tag-based split and all of P2 were called CORRECT by both
  seats independently.

PRIME-AUDIT (Rule 20) — adversarial self-audit of the above synthesis
  · Rubber-stamped? Both seats blessed the lane split and P2 without challenge. Probed for
    what that consensus could be hiding: moving heap tests out of gating could let a heap
    regression land unnoticed. Verdict — no real loss, because those tests have not
    executed in CI for 3+ weeks; the change makes them run and report for the first time.
  · Claim-addressed-not-fixed? Yes, and now stated: Grok's soak-duration CRITICAL is
    MEASURED, not fixed. This PDR must not be read as validating the soak lane.
  · Consensus masking disagreement? Grok HIGH and Gemini F2 attack the same seam
    (non-gating soak) from opposite directions — one says it under-enforces, the other that
    it is unobservable. Both resolve against the same evidence: the job conclusion stays
    visible, and non-gating-but-running beats never-running.
  · Runtime-Verifiability (boot-then-smoke, mandatory for CI infra): would this work after
    an actual dispatch, or does it only static-parse? Three runtime assumptions were
    identified and TWO have already been empirically discharged locally — regex alternation
    over full titles (verified: 28/12 and 2/1 counts) and Playwright 1.60 fill-vs-click
    actionability (verified by scratchpad probe). The third — per-job env → globalTimeout
    plumbing — will be verified locally with the env var set BEFORE the CI dispatch, since
    a static read of the config cannot prove it. No claim of CI success will be made until
    `gh run view` shows it.
  · Mtime cutoff: N/A — no leak or patch-landing-time claims in this batch.
  · Materially better than R1? Yes: R1 proposed raising the cap to 25m, which the 16.8m
    local measurement showed to be insufficient AND aimed at the wrong defect (composition,
    not budget). The synthesis also gained the diagnostic that resolves the residual cause.

TESTING PLAN
  1. Local: `npx playwright test e2e/lobby-construction.spec.ts` → 7/7 green.
  2. Local: `npm run e2e:gating` (new grep) → 25 tests green, wall-clock ≈ 1.5–2m
     (baseline for comparison: 28 passed + 2 skipped in 16.8m pre-split).
  3. Local: `npm run e2e:soak` → 5 tests, record wall-clock (expect ≈ 15–16m).
  4. `npx tsc --noEmit` → 0; `npx vitest run` → 1914/1914 (no unit regression).
  5. `npm run build` → bundle MUST be byte-identical at 640.8/750 KiB. No src/ change,
     so any delta means the scope leaked.
  6. THE REAL GATE — `gh workflow run e2e.yml`, then `gh run view`:
     · job `e2e` conclusion **success**, all 25 fast tests run, wall-clock < 12m,
       playwright-report/ uploaded as an artifact
     · job `e2e-soak` RUNS and reports (pass or fail); record its wall-clock and any
       threshold breach as the CI-side baseline
     · overall run conclusion is **success** or **failure** — never `cancelled`
  7. De-mask proof: confirm globalTimeout yields `failure` + an uploaded report rather
     than a silent cancel. Cheapest honest check = one scratch dispatch with
     PW_GLOBAL_TIMEOUT_MIN set very low, confirm failure+artifact, then restore. If that
     is judged not worth the CI minutes, it will be reported as reasoned-not-run, NOT
     implied to have been verified.
  8. P2: `npm run deploy` gone · `git grep deploy-pages.sh` clean · next master push
     still auto-deploys (content-verify the live asset hash against a fresh build).

TOOL TRIAGE
  Visual output needed?      No — CI config, test drivers, and docs. Nothing rendered.
  Research/external data?    Yes, largely done: gh run/job logs, gh api pages +
                             deployments, git ls-remote, live-site curl, playwright
                             --list. One doc lookup is warranted to confirm that
                             Playwright's `fill` actionability excludes the `stable`
                             check — that is the load-bearing assumption of change 2.
  Artifact delivery needed?  No — nothing leaves the repo; results land in the handoff,
                             BACKLOG STATUS, and LOCKED_DECISIONS.

DIFFERENTIAL_TEST_REQUIRED: false   # no lib/, hooks/, router.sh, LLM-prompt, or schema changes
HOT_PATH_REFACTOR: false            # CI/test config only; zero src/ runtime code

EST: ~28K | MODEL: claude-fable-5 (ALWAYS-STRONGEST)

ACCEPTANCE CRITERIA
  1. A dispatched e2e.yml run has job `e2e` conclude **success** with all 25 fast
     gating tests executed in < 12m.
  2. That job uploads a playwright-report/ artifact (D3 closed).
  3. An overrun can no longer conclude `cancelled` with no artifacts (D2 closed).
  4. The soak lane RUNS in CI and its wall-clock + heap results are recorded as the
     first-ever CI baseline (promotion to gating logged as a carry-forward).
  5. tsc 0 · vitest 1914/1914 · bundle 640.8/750 unchanged.
  6. Exactly one deploy path exists; `npm run deploy` removed; the gh-pages rollback
     hazard + recovery procedure documented; live site still current after the next
     master push.
  7. Any newly-revealed failure among the previously-unrun tests is triaged and either
     fixed or explicitly logged as a carry-forward — never silently dropped.

═══ GATE: Awaiting approval ═══
