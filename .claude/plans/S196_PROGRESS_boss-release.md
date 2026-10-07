# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- Captures DONE (Desktop/SPARK_S196_BossRelease: 6 GIFs, strips, 1920x1080 PNGs, BEFORE orcs/demons). Bench RUNNING
  (.tmp-gates/bench.exit, bench-orcs.json). Then e2e:gating + e2e:render (own port, detached, exits to .tmp-gates/e2e-*.exit),
  README in the Desktop folder, final report at top of this file. Gates on merged tree so far: tc 0, vitest 0 (624 files /
  9388 passed), build 0 (entry 1264.1 KiB; my modules ~11.7 KiB minified standalone). Census fix done.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
- unit tests 23/23 + reach 7/7 + fxGuards green. SELF-AUDIT FIX: matching was greedy per fall (in Map order) -> a fall stole its neighbour's boss; now a global total order (d2, spawnerId, creatureId).
- MUTATIONS (all RED, restored, status clean): M1 vanish unprimed -> gap test red; M2 release drawn when !released -> destroyed reach red; M3 fog gate dropped -> fog reach red; M4 syncBossReleases not called -> 5 reach red.
