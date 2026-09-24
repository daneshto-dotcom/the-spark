# S190 — s190/perf progress (C5, part of approved P0)

Owner, verbatim: *"it was lagging at about wave five. I thought we fixed the lags"*.
Branch `s190/perf`, from master 554dbd7. Worktree agent; the main session is the merge owner.
Commits are LOCAL only.

## Step 0 — setup
- `npm ci` in this worktree: **EXIT=0** (own install, no junction).

## Step 1 — the instrument, and the BEFORE numbers  ✅
- `src/state/c5HostTickMeasure.test.ts` — opt-in (`SPARK_C5_PERF=1`, profiler with `SPARK_C5_PROFILE=1`).
  A copy of the s189/net idea (b72a4c4 `src/net/c5WaveFiveMeasure.test.ts`) under a different path;
  CPU only, profiler opt-in so the timing is not inflated by the sampler.
- `src/state/c5WaveFiveBoard.fixtures.ts` — the shared match + the 120-creature top-up lever, so the
  board the fix is MEASURED on and the board it is PROVEN on are the same board.
- ⚠ FINDING, RESOLVED: the first run exited **1** with both tests passed — vitest's
  `[vitest-worker]: Timeout calling "onTaskUpdate"`, because a 40 s synchronous test starved the
  worker's RPC. The loop now yields (`setImmediate`) every 500 ticks, outside the timed window; the
  re-run exited 0.

### BEFORE (master 554dbd7 code), wave-5 FIGHT bucket, host tick only (bots excluded), ms
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max | creatures | prims | bonds |
|---|---|---|---|---|---|---|---|---|---|
| A default (≤17 creatures) | 1 | 1.942 | 2.820 | 4.99 | 8.09 | 13.03 | 17 | 259 | 574 |
| A default | 2 | 1.781 | 2.454 | 4.20 | 7.19 | 10.35 | 17 | 259 | 574 |
| C 120 held | 1 | 6.613 | 9.160 | 14.40 | 26.44 | 40.12 | 123 | 236 | 517 |
| C 120 held | 2 | 7.058 | 9.942 | 14.45 | 29.01 | 42.07 | 123 | 236 | 517 |
| C 120 held, PROFILED | 3 | 8.768 | 11.946 | 19.88 | 34.78 | 50.17 | 123 | 236 | 517 |

(The s189/net figure was 8.22 / 12.5 / 96 with its profiler running; this machine's profiled run is
8.77 / 11.9 / 19.9 — same shape. A 3-tick frame at p95 is 26-29 ms: the sim alone blows the 16.7 ms
frame budget.)

### BEFORE profile, pass C wave-5 FIGHT (first 2400 ticks), inclusive
structureTargets 67.0 % → findNearestBondTarget 63.2 % → spreadEnemyTarget **41.0 % self**;
findNearestBondTarget 22.2 % self; stepPhysics 15.8 % (computeTerritorialInfluence 7.0 %, solveBonds
3.3 %); pickNavUnit 3.9 %; tickScoring 3.0 %.

## Step 2 — identity oracle — (pending)
## Step 3 — the change — (pending)
## Step 4 — AFTER numbers — (pending)
## Step 5 — gates — (pending)
