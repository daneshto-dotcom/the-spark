# S196 PROGRESS — s196/ci

## NEXT STEP (top, always current)
- T2: write .github/workflows/ci-watchdog.yml + ci-watchdog.mjs (annotation-gated rerun, max 3 attempts, issue alert) + src/ci.watchdog.test.ts.

## Log
- boot: merged master; progress file created.
- T1 profile (2026-10-07): ALL time is runHostTick at ~350 live pants (~1.4–2.5 ms/tick, linear per creature: stepPhysics 16%, steering 10%, applyCreatureTick 8% — real sim work, no hot spot to fix test-side). MED-1 = 7200 ticks (W), R194-27 = 4000. R194-27 hits 360 at t=2659. MED-1 fixed peak 351 @ e=3610.
  Mutants vs MED-1 REACH: A (total check off) NOT caught (peak 351); B (count by monsterSeat) NOT caught (peak 360); A+B caught, crosses 360 at e=2759, peak 561 @5339. (each half pinned by the direct finalFight tests.)
  PLAN: R194-27 stop 4000→3000 ticks; MED-1 stop at W/2+600 (=4200) + regime anti-vacuity asserts; re-run mutants against real file.
- T1 mutant matrix old==new kill set: AB→MED-1(483>360)+both direct; A→TOTAL direct; B→VICTIM direct; C→R194-27+VICTIM; D→R194-27. Timings alone (R194-27 / MED-1): old 3.9/8.5, 4.7/9.3 s; new 4.5/4.9, 5.0/5.3 s.
- T1 full suite --maxWorkers=3 (new file): exit 0, 9450 passed / 14 skipped, 629 files. R194-27 5.4 s, MED-1 6.6 s (was 17–30 s under load). T1 DONE.
- T2 cause: run 37368664339 attempt 1 — build job runner_name "", 0 steps, cancelled 20:16:01→20:31:04, annotation "The job was not acquired by Runner of type hosted even after multiple attempts" = GitHub hosted-pool acquisition failure, NOT our YAML (timeout-minutes 30, concurrency started fine). Same minute: all 7 e2e jobs of 37368664346 identical. Only incident in last 200 runs.
