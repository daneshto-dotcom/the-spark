# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-28 | Session: S127 (soak-lane CI viability — fix the INSTRUMENTS, not the budget, 1/1 shipped)

## CI STATUS — S127 IS FULLY VERIFIED, NOTHING LEFT OPEN
Dispatch run **30395046615** concluded **`success`**:
`e2e` (GATING) success 4m06s, 24 passed + 1 flaky · **`e2e-soak` SUCCESS 22m41s, 4 passed, 0 failed**
(was 44m + globalTimeout, so **-48%**) · `e2e-quarantine` failure 18m20s (expected, non-gating).

Every mechanism verified in the CI log, not inferred: warm-up now COMPLETES (1233/1284/1255 of 1200,
all `capped=false`, vs 648-693 pre-fix) · the two-regime gate fired and declared its own sensitivity
(2304→SHORT 4.4 KB/tick, 8598→STRICT 1.2, 2409→SHORT 4.3) · the scaled census exercised its floor path
(Δ-4 vs limit 27 = 25 floor, 0.35 × signal 77) · **the determinism oracle executed in CI for
worker-heap:333 for the FIRST time ever and PASSED** (that was RALPH's F2, the one place a new red
could appear).

⚠ The GATING lane's 1 flake was `worker-bots.spec.ts` asserting `hashMismatches === 0` — the
determinism oracle flaking under CI load (it retried and passed, which also proves `retries: 2`
survives outside the soak lane). Do NOT read a future soak oracle failure as a real determinism
regression without checking it reproduces.

## Next Steps
1. **Permanent window/threshold shape from the tick-rate curves** now logged every run. Decide from
   data, not from n=3-4 — that mistake cost three iterations this session. Curves are in run
   30395046615's soak artifacts and in every future run.
2. **Worker-isolate ceiling 10MB → ~3MB.** Direction right (spread 0.76MB vs main's 5.5MB ⇒ resolves
   ~1.4KB/tick, near the original design intent) but **BLOCKED**: `readWorkerFloorMB()` is a SINGLE
   read at `worker-heap.spec.ts:182`, OUTSIDE the `readMainFloorMB` stabilization loop at :174-181.
   Give it stabilization (or median-of-N) first, THEN re-measure. Magnitude is not yet earned.
3. **Unexplored legitimate lever: Playwright `deviceScaleFactor`** — cuts raster cost, buys real
   FPS ⇒ real ticks, zero `src/` change. Needs a before/after (rasterization is partly what the
   render-side audit measures).
4. OWNER: `?worker=1` weak-device playtest · BOT_INTELLIGENCE_DESIGN.md §7 (Q1-Q7) · Pages
   `build_type=workflow` flip then optional `origin/gh-pages` deletion, IN THAT ORDER.
5. Gated/optional: lane promotion off `continue-on-error` (needs multi-run retuning, NOT one green —
   e2e.yml:125-132 says so explicitly) · G1b MOTION · G2 traits · F9 QoS split · bit-exact (YAGNI).

## Blockers
- No technical blockers. Owner decisions as in step 4.
- **The census scaling law rests on n=7.** `0.35 × signal` with a `25` floor is the best-supported
  calibration so far, NOT settled. The next CI run adds samples at the ~2200-tick end, the sparsest region.
- ~~RALPH F3: thresholds calibrated against the truncated warm-up~~ **RESOLVED by the CI run** — with
  the full warm-up, measured ticks went slightly UP (2304/2409 vs the pre-fix 2154-2301), not down.
  `MIN_VALID_TICKS = 1300` has ~1.8× margin.
- Known-delta (v1-accepted, LOCKED §13.21): asymmetric-partition rogue-solo-host.

## Pending Backlog
- Permanent window/threshold shape from the tick-rate curves (CI verdict already CLOSED: success)
- Worker-isolate ceiling (blocked on instrument stabilization) · `deviceScaleFactor` lever
- Worker default-on flip (owner) · Bot-intelligence Phases A/B/C (owner §7)
- Pages `build_type=workflow` + optional gh-pages deletion (owner, in that order)
- `e2e/**` outside tsconfig coverage · lane promotion · G1b · G2 · F9 · bit-exact (YAGNI)

## CRITICAL TRAPS FOR THE NEXT SESSION
- **Audit CI run CONCLUSIONS at boot, not just that a workflow exists.** A job killed by
  `timeout-minutes` concludes `cancelled`, not `failure` — no email, reads as a benign concurrency
  cancel, and the SIGKILL destroys the artifacts that would explain it. Hid a dead gating lane for 3
  weekly runs behind an "OPEN ISSUES: None" handoff.
- **NEW S127 — a code comment is a CLAIM about external state, not evidence of it.** I copied "CI
  minutes are a hard constraint" out of `e2e.yml`'s own header into the A.0 packet as fact. Probe:
  `gh repo view --json isPrivate,visibility` → **PUBLIC** ⇒ Actions minutes are free/unlimited on
  standard runners. It had already anchored a Council recommendation to DELETE the lane. Probe every
  external-state noun in a premise, **including the ones a repo file appears to answer.**
- **NEW S127 — the SECOND time a threshold needs retuning, stop tuning and check the UNITS.** The
  census limit went 1500 → 75 → 30 → 40 (the last passing by ONE object) before the dimensional model
  appeared. Both signal (`t/30`) and noise (`~t/220`) scale with the window, so the correct assertion
  was a FRACTION of the signal all along — which is the shape GROK proposed and I rejected on n=4.
- **NEW S127 — an early `expect()` in a shared helper voids every assertion below it, invisibly on a
  `continue-on-error` lane.** The determinism oracle had NEVER executed in CI for `worker-heap:333`.
  When a test fails, the assertions after the failing line produced NO evidence — never cite them.
- **NEW S127 — `e2e/**` is NOT type-checked** (`tsconfig include: ["src"]`; both `typecheck` and
  `build` are `tsc -b`). After editing any spec run **`npx playwright test <spec> --list`** (~2s
  module evaluation) and/or `npx tsc --noEmit` pointed at the spec. A temporal-dead-zone
  `ReferenceError` cost a full 16-minute soak run to discover.
- **Do NOT trust `gh api repos/:owner/:repo/pages`** — it reports `build_type: "legacy"` + source
  `gh-pages`, which is STALE and NOT what serves. Trust the **deployments API** and the **live asset
  hash**. `npm run deploy` / `scripts/deploy-pages.sh` no longer exist — do not recreate them
  (LOCKED §DEPLOY-PATH).
- **`git push` on master == SHIPPING TO PRODUCTION** for any push touching `src/`, `public/`,
  `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `deploy.yml`.
  S127 touched NONE of those (verified: no deploy run fired). Note `package.json` is in that filter —
  so a "harmless" npm-script tweak ships a production deploy.
- **MCV bindings**: BACKLOG.md is diff-bound and needs an ABSOLUTE-path `verification[]` assertion on
  a **`completed`** priority. It fired in S125, S126, **and mid-S127** — while P1 was still
  `in_progress`, `completed=0` meant the binding was out of scope. Close the priority, don't relabel it.
- **Before touching the `PW_RETRIES` guard, read LOCKED §15.4.** It has THREE required properties and
  two reviewers pulled in OPPOSITE directions to get there; "simplifying" it re-opens either a silent
  degradation or an all-lane config-load outage.

## Recent Reflexion (last 2 sessions)
- S127-A0 #probe-external-state-even-when-a-code-comment-states-it: see trap 2 above. Rule 21 was
  applied to git/CI/service state but not to repo visibility, and the stale premise propagated into
  both Council legs before the probe ran.
- S127-P1 #a-threshold-that-moves-three-times-is-the-wrong-SHAPE-not-the-wrong-number: three constants
  died before the dimensional model appeared. A value repeatedly overtaken by the next sample is
  dimensionally wrong, not merely mis-sized.
- S127-CHECK #i-rejected-the-right-shape-using-too-little-data: I rejected GROK's tick-scaled census
  limit citing n=4-plus-an-outlier, in the same session whose PDR said n=3 can't support a threshold,
  then adopted the same shape after rediscovering it the long way. When rejecting a reviewer's SHAPE,
  the bar is a mechanism or a power-adequate sample.
- S127-CHECK #an-early-expect-in-a-shared-helper-voids-every-assertion-below-it: see trap 4.
- S127-P1 #cheap-module-evaluation-beats-a-16-minute-feedback-loop: see trap 5.
- S126-BOOT #audit-run-conclusions-not-just-that-the-workflow-exists: the S125 handoff's "e2e GREEN"
  was true of a LOCAL run and masked 3 weeks of dead CI. Fix pattern: set the test runner's own global
  timeout BELOW the job's `timeout-minutes` so the TOOL lands the kill, flushing artifacts.
- S126-P1 #measure-the-composition-before-you-tune-the-budget: never extrapolate a per-unit average
  across a heterogeneous population. **S127 repeated this exact error** (linear tick extrapolation)
  one session after it was written down.
