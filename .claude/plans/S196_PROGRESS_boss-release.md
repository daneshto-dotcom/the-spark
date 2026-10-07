# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- Gates running detached (.tmp-gates/g1-*.exit). Next: capture tooling — a Playwright script under .tmp-gates/cap/ that boots
  vite on $SESSION_PORT-like own port, starts a solo match via __SPARK__, builds a t9 tower per race (dev seam), captures
  BEFORE (git stash/master build) + per-race 16-frame strips -> GIFs into C:/Users/onesh/OneDrive/Desktop/SPARK_S196_BossRelease/.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
- unit tests 23/23 + reach 7/7 + fxGuards green. SELF-AUDIT FIX: matching was greedy per fall (in Map order) -> a fall stole its neighbour's boss; now a global total order (d2, spawnerId, creatureId).
- MUTATIONS (all RED, restored, status clean): M1 vanish unprimed -> gap test red; M2 release drawn when !released -> destroyed reach red; M3 fog gate dropped -> fog reach red; M4 syncBossReleases not called -> 5 reach red.
