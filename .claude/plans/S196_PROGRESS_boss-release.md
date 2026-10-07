# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- Write `src/render/fx/bossRelease.test.ts` (tracker unit: release / destroyed / scrapped / joiner / two towers one
  tick / gap re-prime; drawer: deterministic, LOW lighter per race, BOSS_CRUMBLE_FX_TICKS === TOWER_CRUMBLE_FRAMES,
  no normal-blend on top), then run mutations (M1 drop `primed` guard on vanish, M2 draw release when !released,
  M3 drop isConcealed in syncBossReleases), then capture tooling.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
