# S196 PROGRESS — s196/ci

## NEXT STEP (top, always current)
- T1: re-run mutant matrix (bash .tmp-gates/mut.sh) on new file; then before/after timings alone + full-suite maxWorkers=3. R194-27 cut REVERTED (mutants C@3121, D@3840 need 4000).

## Log
- boot: merged master; progress file created.
- T1 profile (2026-10-07): ALL time is runHostTick at ~350 live pants (~1.4–2.5 ms/tick, linear per creature: stepPhysics 16%, steering 10%, applyCreatureTick 8% — real sim work, no hot spot to fix test-side). MED-1 = 7200 ticks (W), R194-27 = 4000. R194-27 hits 360 at t=2659. MED-1 fixed peak 351 @ e=3610.
  Mutants vs MED-1 REACH: A (total check off) NOT caught (peak 351); B (count by monsterSeat) NOT caught (peak 360); A+B caught, crosses 360 at e=2759, peak 561 @5339. (each half pinned by the direct finalFight tests.)
  PLAN: R194-27 stop 4000→3000 ticks; MED-1 stop at W/2+600 (=4200) + regime anti-vacuity asserts; re-run mutants against real file.
