# S196 PROGRESS — boss-release (branch s196/boss-release)

## NEXT STEP (exact)
- RESUMED: merged master fb8f6b42 (485dbddc, no conflicts). Pre-pause vitest found a REAL red: teams.sites census
  (seat compare in bossReleaseTrack) -> fixed via releaseKey (identity, documented merge seam). Now: dev seam + capture.
- NEXT (capture, nothing written yet): write `.tmp-gates/cap/capture.spec.ts` + `.tmp-gates/cap/pw.config.ts`
  (testDir .tmp-gates/cap, viewport 1920x1080, webServer `npx vite --port 27196 --strictPort`, reuseExistingServer:false so
  vite is fresh). In the spec: `page.clock.install()` before goto; bootSolo (copy from e2e/tower-art.spec.ts); per race:
  set `w.players.get(0).raceId = race`, seedBank(shape,9), click 9 chip + card, place at canvas (420,400), wait ~4 s for
  the sprite; `page.clock.pauseAt(fakeNow+50)`; trigger release: `w.matchPhase='FIGHT'; sp.nextSpawnTick=w.tick`;
  `clock.runFor(17)`; `w.matchPhase='BUILD'`; then 16 screenshots with `clock.runFor(150)` between (9 ticks each);
  `w.creatures.clear()` before the next race. Crop around the tower + assemble GIFs with Pillow (python) into
  C:/Users/onesh/OneDrive/Desktop/SPARK_S196_BossRelease/. BEFORE = same run with `this.syncBossReleases(world);` line
  commented out in src/render/spawnerZoneRenderer.ts (restore with git checkout after).
- Bench: `__SPARK__.fx.benchRender(frames)` + `__SPARK__.frameMs` exist (src/dev/fxLab.ts). For interleaved on/off add a
  dev knob object in bossReleaseTrack.ts (e.g. `export const BOSS_RELEASE_DEV = { off: false }`, checked in
  syncBossReleases), toggled via `await import('/src/render/fx/bossReleaseTrack.ts')` in the page; add a test that it
  defaults false and nothing in src writes it. Then gates: typecheck, vitest, build (entry KiB), e2e:gating, e2e:render
  (own port), git merge master first. Then README + final report.

## Log
- boot: worktree on b35368c6 + master merged; progress file created.
- bossReleaseFx.ts (pure drawers: crumble + 6 race releases) written.
- bossReleaseTrack.ts (deriver) + spawnerZoneRenderer.syncBossReleases wired; typecheck 0.
- reach test written (src/render/bossReleaseReach.test.ts), not yet run.
- reach test GREEN (7/7): release reaches peer at age 0 + 6; host too; joiner nothing; destroyed crumbles not release; fog; LOW<HIGH; legacy 0. (Fix: spawners only emit in FIGHT.)
- unit tests 23/23 + reach 7/7 + fxGuards green. SELF-AUDIT FIX: matching was greedy per fall (in Map order) -> a fall stole its neighbour's boss; now a global total order (d2, spawnerId, creatureId).
- MUTATIONS (all RED, restored, status clean): M1 vanish unprimed -> gap test red; M2 release drawn when !released -> destroyed reach red; M3 fog gate dropped -> fog reach red; M4 syncBossReleases not called -> 5 reach red.
