═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-07-28
Session: S127 — soak-lane CI viability: fix the INSTRUMENTS, not the budget (1/1 shipped, CI-CONFIRMED)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (geometric builder duel) · Working dir: …/Founder DNA/Extension Projects/The Spark
- Git branch: master · Latest: 331ba16 (close) · Feature: fae8c75 · Prior: e52a4b2 (S126)
- Tech: TypeScript / Vite / Pixi 8.19 / Trystero (WebRTC P2P) · host-authoritative deterministic sim

## CURRENT STATE
- Build: tsc 0 · vitest 1914/1914 · bundle 640.8/750 KiB · PROTOCOL_VERSION 15 — **ALL UNCHANGED**
  (zero `src/` files touched this session, so the shipped game is byte-identical to S126)
- Deployment: LIVE on https://spark-online.space, still serving the S126 build (sha 162b40f).
  **This session's push deliberately shipped NO deploy** — verified empirically, not just claimed:
  the newest "Deploy to GitHub Pages" run is still S126's 15:36 one.
- Local soak: **3/3 passed (15.2m)**, all three in the STRICT regime
- **CI soak: SUCCESS, 22m41s** (was 44m + globalTimeout) — see the CI section below

## ✅ CI DISPATCH 30395046615 — **CONFIRMED, RUN CONCLUSION `success`. NOTHING LEFT UNVERIFIED.**
```
e2e (GATING)     success   4m06s   24 passed + 1 flaky
e2e-soak         SUCCESS  22m41s   4 passed (21.9m), 0 failed, 0 flaky   <- was 44m + globalTimeout
e2e-quarantine   failure  18m20s   expected, non-gating (CI can't hold P2P data channels)
```
**Soak: 44m0s → 22m41s (−48%), and it now reports a real verdict instead of aborting.** Every
mechanism is individually visible in the CI log, not merely inferred from the exit code:
1. **The warm-up now COMPLETES on the runner** — `1233/1200`, `1284/1200`, `1255/1200`, all
   `capped=false`. Pre-fix it silently truncated to 648-693 of 1200 (54-58 %) and `s0` was sampled
   mid-JIT-settling. This was the defect nobody had noticed for two sessions.
2. **The two-regime gate fired correctly and stated its own sensitivity**: render 2304 ticks →
   `SHORT-WINDOW` declaring 4.4 KB/tick; baseline 8598 → `STRICT-WINDOW` at 1.2 KB/tick; bots-worker
   2409 → `SHORT-WINDOW` at 4.3 KB/tick.
3. **The scaled census exercised its floor path**: `Δ-4 vs limit 27 (25 floor, 0.35 × signal 77)`.
4. **The determinism oracle EXECUTED in CI for `worker-heap:333` for the first time ever — and
   PASSED.** That was RALPH's F2, the single place a genuinely NEW red could appear. Resolved.
5. **RALPH's F3 worry did NOT materialize**: with the full warm-up, measured ticks went slightly UP
   (2304/2409 vs the pre-fix 2154-2301), not down. `MIN_VALID_TICKS = 1300` has ~1.8× margin.

## GATING LANE DETAIL (worth reading — one flake matters)
- **`e2e` (GATING) ✓ success** — 20:08:57→20:13:03 (4m06s), **24 passed + 1 flaky (3.3m)**.
  Two things this proves, both worth having:
  1. **RALPH's D1 risk is closed empirically.** My `PW_RETRIES` throw could have killed this lane at
     config-load with zero artifacts; it did not. The guard's empty-is-unset path works on a real runner.
  2. **`retries: 2` is genuinely preserved outside the soak lane** — the flaky test retried and passed,
     which is exactly the per-lane scoping the change intended (soak 0, gating/quarantine 2).
- ⚠ **The flaky test is `worker-bots.spec.ts` asserting `hashMismatches === 0`** — i.e. the
  DETERMINISM ORACLE flaked in CI under load. That is direct evidence for **RALPH's F2 known-unknown**:
  the soak lane's newly-reachable oracle (never executed in CI before this change) is the one place a
  NEW red can appear, and the same oracle class is demonstrably flaky on this hardware. The lane is
  `continue-on-error`, so it cannot red the run — but do not read a soak oracle failure as a real
  determinism regression without checking whether it reproduces.

## DO THIS FIRST NEXT SESSION
Nothing from S127 is left hanging. The first real decision is **carry-forward #1 below** — set the
permanent window/threshold shape from the tick-rate curves now being logged every run. Pull them from
run 30395046615's soak artifacts (or the next weekly run) and decide from data, not from n=3-4.

## WHY THIS SESSION EXISTED, AND WHAT THE HANDOFF GOT WRONG
S126 framed the 44m soak timeout as a per-ktick slope going noise-dominated. The raw CI job log says
otherwise: **all 5 failures are ONE assertion**, `expect(measured).toBeGreaterThanOrEqual(4000)`
(render-heap:183 ×3 → 2268/2184/2217; worker-heap:221 ×2 → 2301/2154), with **ZERO** heap, census or
texture threshold breaches. The per-ktick slope is **never asserted** — it exists only in a
`console.log`. ⇒ handoff option (b) ("assert an absolute ceiling instead of the slope") was a **FALSE
PREMISE**: the assertion was already absolute. 3/3 Council converged on rejecting it.

## THE ROOT MECHANISM (verified in source; now LOCKED §15.1)
`src/main.ts:1389` clamps `dtSec = min(deltaMS/1000, 0.05)`; `src/constants.ts:169` sets
`PHYSICS_HZ = 60`; `src/main.ts:1413` fully drains the accumulator ⇒ **at most 3 sim ticks advance per
RENDERED FRAME.** Measured: bots worlds 7.2-7.7 ticks/s on a 2-core SwiftShader runner (~2.5 fps) vs
~26 local; non-bots baseline 28.3 in CI.
**⇒ "ticks achieved" measures the runner's GPU, not the code under test** — which is precisely why
that assertion is the one that failed. Every option that tries to buy ticks with wall-clock is
structurally doomed, **including the raise-`WALL_CAP_MS` variant I proposed myself and retracted**.
Relaxing the dt clamp is REJECTED, not deferred: `src/main.ts` is production sim code on the deploy
path, and worker mode has a second ceiling anyway (`simWorkerDriver.ts:20 MAX_CARRIED_TICKS = 10`).

## WHAT SHIPPED (fae8c75 — 6 files, ZERO src/)
- **`PW_RETRIES` env override** (playwright.config.ts), `PW_RETRIES: 0` on `e2e-soak` only. 3 retry
  attempts at a structural shortfall burned ~21.2 of the 44 minutes. **The guard has THREE required
  properties — see LOCKED §15.4 before touching it**; two reviewers pulled opposite ways.
- **Tick floor is no longer pass/fail.** `MIN_VALID_TICKS = 1300` (liveness tripwire) +
  `MIN_STRICT_TICKS = 4000` which now only SELECTS whether a per-tick byte claim is honest. Short
  windows log `SHORT-WINDOW` and push a `test.info()` annotation; the tick-insensitive invariants and
  the determinism oracle are asserted in **BOTH** regimes.
- **Census limit NORMALIZED to the window**: `max(25, 0.35 × signal)`, `signal = 2×measured/60`.
- **`WARMUP_WALL_CAP_MS = 240_000`** (was a hardcoded 90_000 needing 13.3 ticks/s, so CI warm-ups
  silently ran **54-58%** of `WARMUP_TICKS` and `s0` was sampled mid-JIT-settling — a second,
  independent noise source). `waitForTick` now returns `{tick, capped, curve}`.
- **`test.setTimeout` derived from the wall caps**, not a literal.
- **Stale in-repo claims corrected**: the "PRIVATE repo minutes" premise and an advertised `paths:`
  filter that does not exist.
- Docs: `BACKLOG.md` S127 entry · new **`LOCKED_DECISIONS.md §15 SOAK-CALIBRATION`**.

## FIVE OF MY OWN ERRORS, ALL CAUGHT PRE-SHIP (the most useful part of this handoff)
1. I stated **"CI minutes are a hard constraint"** in the A.0 packet, lifted from e2e.yml's own
   comment. Probed: `gh repo view` → **`isPrivate: false, PUBLIC`** ⇒ Actions minutes are FREE. It had
   already reached BOTH Council peers and **anchored Grok's entire delete-the-lane recommendation.**
2. Extrapolated a tick rate **linearly** across a run whose throughput declines (S126's own reflexion,
   repeated one session later).
3. Sized the census limit from **wall-clock instead of SIM time** ⇒ 75, above the ~73 signal.
4. Recorded the determinism oracle as passing in CI when it had **NEVER EXECUTED** for
   `worker-heap:333` — an earlier `expect()` in the shared helper threw first, voiding everything
   below it. (This makes the fix MORE valuable than the PDR claimed.)
5. Claimed `TARGET_TICKS` is never reached on ANY platform — **falsified by the very logging this
   priority added**, on its first run (baseline 10307, `capped=false`).

## THE JUDGEMENT I REVERSED (read before the next Council)
I **rejected GROK-ANALYST's tick-SCALED census limit** in CHECK, calling it "empirically refuted"
using n=4-plus-an-outlier — in the same session whose PDR said "n=3 cannot support a new threshold".
Three constants then died in sequence: 1500 (115× slack, vacuous) → 75 (above the signal) → 30 (then
Δ20 landed ⇒ 1.5×) → 40 (then **Δ39** landed ⇒ **passed by ONE object**). At n=7 the delta clearly
scales with the window (max 13 at ~2.2k vs max 39 at ~7.6-8.9k). **Grok had the right SHAPE from the
start.** Both signal (`t/30`) and noise (`~t/220`) scale, so their ratio is window-independent (~7.3×)
⇒ assert a FRACTION of the signal. That holds ~2.6× over noise AND ~2.9× under signal at every
window, and **structurally dissolves** both Gemini's blind spot and RALPH's coupling concern.
**Generalisable trigger: the SECOND time a threshold needs retuning, stop tuning and check the units.**

## CHECK — Triumvirate (RALPH:PATROL + GROK-ANALYST + GEMINI-AUDITOR)
5 adopted / 3 rejected; RALPH returned **SHIP-WITH-FIXES**, all 5 applied.
- **RALPH F1 (HIGH, best finding of the session):** raising the warm-up cap pushed the two sequential
  wall caps to 540s of a *hardcoded* 600s `test.setTimeout`. A 30% dip times out DURING `s1`, and
  since the evidence line prints AFTER `s1` that is a red with **no measurement**.
- **RALPH D1:** my throw-on-malformed would have killed the **GATING** lane at config-load with zero
  artifacts (Actions renders an undefined var as `""`, not unset).
- **RALPH E2:** my "the HTML report shows it" justification is false — `--reporter=list` REPLACES the
  config reporters. Fixed the comment, **not** `package.json` (it is in `deploy.yml`'s filter and
  would have shipped a prod deploy for a reporting tweak).
- **Gemini HIGH:** `MIN_VALID_TICKS=500` blind spot — a TOTAL leak yields ~17 objects, UNDER the
  then-limit of 30, so a 100%-destroy-miss would have PASSED.
- **Rejected:** Grok M2 (compares against a 4000-tick CI window that never existed — at HEAD the test
  failed outright and detected nothing; Gemini concurred independently) and L1 (prompt artifact).
- **Reviewer-signal update:** RALPH — which read the actual post-edit files — produced the most
  valuable finding and noted the files changed 3× mid-review. **Give the local file-reading reviewer
  the LAST word, after edits settle.**

## OPEN ISSUES
- ~~CI verdict unknown~~ **CLOSED: run 30395046615 concluded `success`, soak green in 22m41s.**
- **The census scaling law rests on n=7**, all local-or-CI-mixed. `0.35` and the `25` floor are the
  best-supported values so far, NOT settled. The next CI run adds 2-3 samples at the ~2200-tick end,
  which is the sparsest region.
- ~~RALPH F3 (thresholds calibrated against the truncated warm-up)~~ **RESOLVED by the CI run**:
  measured ticks went slightly UP with the full warm-up (2304/2409 vs 2154-2301), so floor 1300 has
  ~1.8× margin rather than the ~1.4× feared.
- `e2e/**` is outside `tsconfig` (`include: ["src"]`) — no `tsc` safety net (see LOCKED §15.4).
- Cosmetic (carried from S126): a `[GATE LOCKED]` banner fires for an in-progress priority; the
  ENFORCING hook passes. Source string not in `~/.claude/hooks/` or `scripts/`.

## BLOCKED ON (all OWNER — unchanged from S126)
- Weak-device `?worker=1` playtest · BOT_INTELLIGENCE_DESIGN.md §7 (Q1-Q7)
- Pages config, IN THIS ORDER: `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow`,
  verify live, THEN optionally delete `origin/gh-pages`

## NEXT STEPS (priority order)
1. **Permanent window/threshold shape from the tick-rate curve** now being logged. Decide from data.
2. **Tighten the worker-isolate ceiling 10MB → ~3MB** — direction right (spread 0.76MB vs main's
   5.5MB ⇒ would resolve ~1.4KB/tick, near the original design intent) but **BLOCKED on instrument
   repeatability**: `readWorkerFloorMB()` is a SINGLE read at worker-heap:182, outside the :174-181
   stabilization loop. Give it stabilization or median-of-N first, THEN re-measure.
3. **Unexplored legitimate lever: Playwright `deviceScaleFactor`** to cut raster cost and buy real
   FPS ⇒ real ticks. Zero `src/` change. Needs a before/after, since rasterization is partly what the
   render audit measures.
4. Owner gates above · lane promotion off `continue-on-error` (needs multi-run retuning, not one green)
5. Gated/optional: G1b MOTION · G2 traits · F9 QoS split · bit-exact bot serialization (YAGNI)

## CHANGED FILES (e52a4b2..331ba16)
 e2e/render-heap.spec.ts 199± · e2e/worker-heap.spec.ts 148± · playwright.config.ts 43±
 .github/workflows/e2e.yml 32± · LOCKED_DECISIONS.md 170+ (§15 NEW) · BACKLOG.md 143+
 .claude/session-state.json 249± · **src/: ZERO**

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 1/1 complete | Standard tier | GREEN
P1 soak-lane CI viability — completed — fae8c75
Context at close: 387,448 / 1,000,000 (38.7% GREEN)
API: Grok 2 calls, Gemini 2 calls (1 PLAN + 1 CHECK each) · 17 workflow agents (1.73M subagent
tokens) + 1 RALPH:PATROL · gitleaks: 807 commits, NO LEAKS
Rule-22 runtime audit: BUG-A/B/C all triaged FALSE POSITIVE (details in session-state.analyze_result)

## REFLEXION ENTRIES (this session)
- S127-A0 #probe-external-state-even-when-a-code-comment-states-it
- S127-P1 #a-threshold-that-moves-three-times-is-the-wrong-SHAPE-not-the-wrong-number
- S127-CHECK #i-rejected-the-right-shape-using-too-little-data
- S127-CHECK #an-early-expect-in-a-shared-helper-voids-every-assertion-below-it
- S127-P1 #cheap-module-evaluation-beats-a-16-minute-feedback-loop

## CARRY-FORWARD PRIORITIES
1. Permanent window/threshold shape from the tick-rate curves now logged every run — PDR: not started
2. Worker-isolate ceiling tightening — BLOCKED on giving `readWorkerFloorMB` stabilization first
3. `deviceScaleFactor` raster lever — unexplored, zero-src, needs before/after
4. Worker default-on flip — owner playtest gate
5. Bot-intelligence Phase A — owner §7 answers
6. Pages `build_type=workflow` flip, then optional gh-pages deletion — OWNER-GATED, in that order
7. `e2e/**` outside tsconfig coverage · lane promotion · G1b/G2/F9/bit-exact (gated/YAGNI)
═══════════════════════════════════════════════════════════
