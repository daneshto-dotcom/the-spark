# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- Run mutations by hand (M1 drop `primed &&` on the vanish in bossReleaseTrack.observe step 2; M2 draw bossReleaseFx even when
  !f.released in spawnerZoneRenderer.syncBossReleases; M3 drop the isConcealed gate there), record RED, `git checkout` each.
  Then capture tooling (Playwright, own port) for BEFORE + per-race GIFs.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
- unit tests 23/23 + reach 7/7 + fxGuards green. SELF-AUDIT FIX: matching was greedy per fall (in Map order) -> a fall stole its neighbour's boss; now a global total order (d2, spawnerId, creatureId).
