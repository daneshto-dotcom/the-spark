# S191 — s191/perf progress (P12: the wave-5 host tick, next hotspots — outputs byte-identical)

Owner, verbatim (C5): *"it was lagging at about wave five. I thought we fixed the lags"*.
Branch `s191/perf`, from master 42cc2ee (src = deploy #4). Worktree agent; the main session is the merge
owner. Commits are LOCAL only. Brief: `.claude/plans/S191_BRIEFS/perf.md` (main checkout).

⚠ **Seven worktrees share this 32-core machine.** Every timing below is NOISY: each is repeated, reported
as mean and spread, and compared only against a before taken on the same machine in the same hour.

## Step 0 — setup  ✅
- `npm ci` in this worktree: **NPMCI_EXIT=0** (own install, no junction).

## Step 1 — measure (the S190 instrument, the same wave-5 board)  ✅
- Instrument REUSED, not re-invented: `src/state/c5HostTickMeasure.test.ts` + `c5WaveFiveBoard.fixtures.ts`
  (s190/perf) — a real four-seat bots match through `runHostTick`, pass A default draft, pass C all-HP +
  120 creatures held through wave 5's FIGHT. Commands (logs in `.tmp-gates/`, gitignored):
  `SPARK_C5_PERF=1 npx vitest run src/state/c5HostTickMeasure.test.ts` (×2) and
  `SPARK_C5_PERF=1 SPARK_C5_PROFILE=1 npx vitest run src/state/c5HostTickMeasure.test.ts` (×1). All EXIT=0.
- ⚠ The board is today's master, not S190's: pass A's wave-5 board is 171 prims / 356 bonds (S190: 259 /
  574) — deploy #4's other branches changed what the bots build. Pass C is 236 / 517 / 123 creatures.

### BEFORE (master 42cc2ee code), wave-5 FIGHT bucket, host tick only, ms — machine SHARED with 6 worktrees
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A default | 1 | 0.707 | 1.153 | 4.08 | 3.38 | 9.07 |
| A default | 2 | 0.534 | 0.776 | 1.88 | 2.19 | 3.76 |
| A default, PROFILED | 3 | 0.629 | 0.979 | 2.25 | 2.73 | 4.39 |
| C 120 held | 1 | 3.134 | 4.840 | 11.17 | 13.76 | 28.29 |
| C 120 held | 2 | 2.569 | 3.211 | 7.02 | 9.35 | 18.48 |
| C 120 held, PROFILED | 3 | 2.721 | 3.482 | 6.98 | 10.19 | 17.81 |
Unprofiled mean of 2: A 0.62 ms (spread ±0.09), C 2.85 ms (±0.28). Run 1 was the noisiest (its wave-2..5
BUILD maxima of 4.7-29 ms are in buckets where the creature loop is idle — machine noise).

### BEFORE profile (V8 sampler, 200 µs), wave-5 FIGHT first 2400 ticks
| function | C incl | C self | A incl | A self |
|---|---|---|---|---|
| stepPhysics | 39.8 % | 4.2 % | 56.5 % | 5.5 % |
| **computeTerritorialInfluence** (territory.ts) | **17.7 %** | **13.6 %** | **24.2 %** | **15.0 %** |
| · computeAllPlayerRadii → Complexities → ComponentRoots | 4.1 % | 2.4 + 1.5 % | 9.2 % | 5.3 + 3.4 % |
| structureTargets (S190's index; NOT in this brief) | 23.6 % | 7.6 % | 9.7 % | 1.7 % |
| · findNearestEnemyPrimitiveFrom (lone-shape scan; NOT in brief) | 7.5 % | 7.5 % | — | — |
| **pickNavUnit** (+ findNearestEnemyCreatureFrom 3.4 %) | **9.0 %** | 5.7 % | — | — |
| **solveBonds** | **8.2 %** | 8.0 % | **15.8 %** | 15.5 % |
| **tickScoring** (computeAllComplexities 5.9 / 10.4 %) | **7.3 %** | 1.4 % | **12.7 %** | 2.3 % |
| lookupCombo | 3.6 % | 3.5 % | 6.5 % | 6.5 % |
Rank for this brief: territory first (both passes), then pickNavUnit (pass C), then solveBonds / tickScoring.
## Step 2 — one hotspot per commit  — pending
## Step 3 — cache-invariant guards  — pending
## Step 4 — final gates, numbers, report  — pending
