═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-07-28
Session: S126 — CI E2E gating revival (3-lane split) + ONE deploy path (2/2 shipped + CI-validated)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (geometric builder duel) · Working dir: …/Founder DNA/Extension Projects/The Spark
- Git branch: master · Latest: 162b40f (feature+docs, S126) · Prior: d7bd548 (S125 close, was local-only)
- Tech: TypeScript / Vite / Pixi 8.19 / Trystero (WebRTC P2P) · host-authoritative deterministic sim

## CURRENT STATE
- Build: tsc 0 · vitest 1914/1914 (unchanged) · bundle 640.8/750 KiB (109.2 headroom), entry hash
  BYTE-IDENTICAL across the batch (assets/index-BD5X8Lx1.js) = proof zero src/ changed
- Deployment: LIVE on https://spark-online.space — deploy run 30374220506 SUCCESS, content-verified
- PROTOCOL_VERSION 15 (UNCHANGED — zero runtime code this session)
- **CI E2E: ALIVE AGAIN.** 3 lanes, run 30374235685 conclusion **success**:
  · `e2e` (GATING)     ✓ success 2m24s — **25 passed (1.6m)** + playwright-report artifact (241 KB)
  · `e2e-soak`         ✗ failure 44m54s — non-gating; a MEASUREMENT, see OPEN ISSUES
  · `e2e-quarantine`   ✗ failure 17m41s — non-gating; expected (CI can't hold P2P data channels)

## WHY THIS SESSION EXISTED (read this part)
The S125 handoff said "OPEN ISSUES: None" and "e2e GREEN" — both true of a LOCAL run, which masked
that **CI's gating lane had been dead for 3 consecutive weekly runs** (2026-07-13/-07-20/-07-27).
Three independent layers hid it:
  1. A job killed by `timeout-minutes` concludes **`cancelled`, not `failure`** → no failure email.
  2. `gh run list` renders that as a row indistinguishable from a benign concurrency cancel.
  3. The runner's SIGKILL pre-empts the reporter flush → "No files were found with the provided
     path: playwright-report/" → the evidence that would have explained it was destroyed too.
**Lesson for every future boot: audit run CONCLUSIONS, not just that the workflow exists.**

## THIS SESSION'S WORK
- **P1 — CI E2E gating revival (162b40f).** Root cause was **composition, not budget**: a full local
  `e2e:gating` measured **16.8m**, of which **15.2m was 3 soak tests** (worker-heap 9.3m +
  render-heap 5.9m). No cap could have held it. Separately 3 tests in `lobby-construction.spec.ts`
  burned **9m00s** of the 15m on `await input.click()`.
  · **Three-lane split**: new non-gating `e2e-soak` (own runner, parallel, 50m) takes
    `@soak`+`@perf-measure`; fast `e2e` lane = **25 tests/10 files**, 18m cap. Verified 25/6/19.
  · **3 redundant `input.click()` removed.** Root cause CONFIRMED (not guessed) by a scratchpad probe
    on Playwright 1.60: `fill()` — already the next line — succeeds on a permanently-unstable element
    AND focuses it, while `click()` reproduces the CI call log line-for-line incl.
    "2 × waiting for element to be visible, enabled and stable". No assertion lost; click-to-focus
    keeps its own dedicated test at :190.
  · **De-mask**: per-job `globalTimeout` always BELOW `timeout-minutes` (12<18 / 44<50 / 17<20).
    **Proven in CI**: quarantine now ends "Process completed with exit code 1" at 17m41s (was
    20m22s "operation was canceled"), soak ends on Playwright's own "Timed out waiting **2640s**"
    = exactly the configured 44m. **3 artifacts ≈ 328 MB now survive** where ZERO did before.
  · Added a non-gating rAF box-sampling diagnostic (adopted from Gemini's alternative fix).
- **P2 — ONE deploy path (owner decision).** `npm run deploy` + `scripts/deploy-pages.sh` DELETED.
  That script force-pushed `gh-pages` AND POSTed `pages/builds` to trigger the **legacy** builder,
  which would flip production onto the branch mechanism = two competing publishers. Full entry:
  `LOCKED_DECISIONS.md §DEPLOY-PATH`.
  · **TRAP for future sessions:** `gh api repos/:owner/:repo/pages` reports `build_type: "legacy"` +
    `source.branch: "gh-pages"` — **stale metadata that does NOT reflect what serves.** Verified by
    asset hash: stale gh-pages tip a321609 (07-11) → `index-KQaaBM--.js`, vs LIVE and a fresh build
    of master HEAD both → `index-BD5X8Lx1.js`. Trust the **deployments API + live asset hash**.

## OPEN ISSUES
- **The soak lane is NOT CI-viable as written** (measured, run 30374235685). It hit the 44m
  globalTimeout: `render-heap :124` failed 3× (6.9/7.3/6.9m) and `worker-heap :333` failed 2×
  (6.9/7.4m); `worker-heap :243` baseline PASSED (6.0m, ticks=8487). **Mechanism:** the audits are
  written for ~10k ticks but CI reaches only **~2150–2300 ticks** per attempt, so the per-ktick slope
  becomes noise-dominated — the SAME test produced **+2249.6, +523.2 and −308.6 KB/ktick** across
  attempts. This is a MEASUREMENT, not a regression: the lane is `continue-on-error`, so the run
  still concludes **success** and no permanent red was installed.
- **Residual, PARTIALLY resolved:** the diagnostic RULED OUT bounding-box oscillation
  (`distinctBoxes=1`, all 12 samples identical; `maxFrameGapMs=67` ≈15fps vs ~33fps local) ⇒ there is
  **NO latent lobbyScreen positioning defect**, and frames are nowhere near starvation (2 frames
  ≈130ms « 60s). But it did **not reproduce** the original failure. Leading UNPROVEN hypothesis:
  cumulative state in the shared single worker (`workers:1`) — the diagnostic ran first-and-fresh in
  soak, whereas the 3 originals failed after ~13 prior tests in the gating lane. Self-critique: to
  catch a late-in-suite condition the diagnostic must run LATE in the GATING lane.
- Cosmetic: a `[GATE LOCKED] … PDR not approved` banner fires for an in-progress priority even with
  all 3 gate fields set. The ENFORCING hook (`pdca-final-gate.sh`) passes via its `pdr_approved`
  fallback — every write succeeded. The banner's source string is not in `~/.claude/hooks/` or
  `scripts/`. Deliberately NOT "fixed" by adding a partial v3 `priority_state` field, since other
  consumers key off `status`.

## BLOCKED ON (all OWNER)
- Weak-device `?worker=1` playtest · BOT_INTELLIGENCE_DESIGN.md §7 answers (Q1–Q7)
- OWNER-GATED deploy follow-ups: `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow`
  (fixes the stale config at root), then OPTIONALLY delete `origin/gh-pages` — **in that order**.

## NEXT STEPS (priority order)
1. **Soak-lane follow-up PDR** (the one concrete new item). Options, rough preference order:
   (a) reduced CI tick budget with thresholds derived from it; (b) assert an absolute post-GC ceiling
   instead of a per-ktick slope so short runs aren't noise-amplified; (c) drop `retries` for this lane
   (3 attempts × ~7m is what actually burned the 44m); (d) keep heap audits local-only, delete the lane.
2. OWNER: `?worker=1` weak-device playtest → flips worker default-on.
3. OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 → unlocks bot-intelligence Phase A.
4. OWNER: the two deploy config follow-ups above.
5. Optional: move/duplicate the rAF diagnostic to run LATE in the gating lane to test the
   cumulative-worker-state hypothesis. Low priority — the fix bypasses `stable` regardless.
6. Gated/optional: G1b MOTION · G2 traits · F9 QoS split (telemetry-gated) · bit-exact bot
   serialization (YAGNI).

## CHANGED FILES (session, d7bd548..162b40f)
 .github/workflows/e2e.yml 93± (3-lane split) · playwright.config.ts 21+ (globalTimeout)
 package.json 4± (lane greps, `deploy` removed) · e2e/lobby-construction.spec.ts 82±
 e2e/worker-heap.spec.ts 6± · e2e/render-heap.spec.ts 5± · .gitignore 1+
 scripts/deploy-pages.sh −68 (DELETED) · + docs: BACKLOG.md, LOCKED_DECISIONS.md §DEPLOY-PATH

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 2/2 complete | Standard tier | GREEN
P1 CI E2E gating revival — completed — 162b40f · P2 deploy-path consolidation — completed — 162b40f
MCV exit 0 (12 assertions, BACKLOG.md diff-bound). API: Grok 2, Gemini 2.

## REFLEXION ENTRIES (this session)
- S126-P2 #read-the-thing-before-you-justify-deleting-it
- S126-BOOT #audit-run-conclusions-not-just-that-the-workflow-exists
- S126-CHECK #a-dissolving-streak-is-not-a-license-to-auto-dismiss
- S126-P1 #measure-the-composition-before-you-tune-the-budget

## CALIBRATION NOTE (worth reading before the next Council)
Two of the four reflexions record **my own** errors, both caught before becoming doctrine:
an extrapolated per-test average that pointed at the wrong fix (raise the cap) instead of the right
one (fix the composition), and a deletion rationale whose mechanism was wrong though its conclusion
held. Separately — and importantly — **Grok's R1 CRITICAL about the soak lane proved CORRECT**,
breaking a 17-run streak of external high-sev findings dissolving under triage. The discriminator:
Grok's finding targeted an **unmeasured empirical unknown**, whereas the dissolving ones target
**mechanisms shipped code already determines**. Triage by that distinction, not by track record.

## CARRY-FORWARD PRIORITIES
1. Soak-lane CI viability — evidence-backed options above — PDR: not started
2. Worker default-on flip — owner playtest gate — PDR: not started
3. Bot-intelligence Phase A — owner §7 answers — PDR: not started
4. Deploy config: build_type=workflow flip, then optional gh-pages deletion — OWNER-GATED
5. rAF diagnostic re-placement (late in gating lane) — low priority
6. G1b MOTION · G2 traits · F9 QoS split · bit-exact serialization — gated/YAGNI
═══════════════════════════════════════════════════════════
