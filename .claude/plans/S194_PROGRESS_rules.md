# S194 PROGRESS — T11 rules (branch `s194/rules`)

## ⏸ PAUSED (owner session limit, round 2) — EXACT NEXT STEP
- **Done this round (all committed):** R194-26 mega pants = 251st (slot floor(T·W/(T−1)): 2 seats 7214, 4 seats 7207; REACH + mutation); MED-2 botPersonality.test.ts reverted to master; LOW-1 stale docs; LOW-2 gatherer spawn beside the keep (x ±50+26c, y ∓13; 29.4 px from nearest slot; mutation-checked); R194-27 measured (`SPARK_PANTS_MEASURE=1 npx vitest run src/net/pantsLoadMeasure.test.ts`), perf fix (owned-unit index + living fast path, verdict-identical differential), cap MONSTER_MAX_LIVE_TOTAL 360 split over living seats; canon §3f rows + pins.
- **Just merged master 814f1871 (T7 bots-tune) — clean merge, NOT yet tested on the combined tree.**
- **NEXT:** on the merged tree run `npx vitest run --maxWorkers=3 src/bots src/state/endgame src/state/endgameS194Perf.test.ts`; handle the 3 T7 seams per coordinator: (1) `botFix.test.ts:135` count only sends with `w.tick >= stripGatherersFromTick`, mutation-check by deleting the gatherer guard; (2) any SABOTEUR pin (my IMBA pin is reverted — re-measure only if a T7 pin reds); (3) T7 pin "IMBA WARMONGER and TYCOON differ" — re-measure, REPORT numbers if red, never relax. Then full gates (typecheck, full vitest, build + entry KiB) and the final report.
- **Last gates (pre-merge):** tsc 0; endgame/canon/gatherer/castle suites 0 (targeted); full vitest last ran 0 (7868 passed) BEFORE R194-26/27; build last 0 (1122.2 KiB) before this round.
- No background processes running.

## R194-27 measurement (4 seats, wave 31, nobody killing; host ms p50/p95 · NETSNAPSHOT KiB · worker positions KiB/frame · mirror apply ms p50)
| live | before perf fix | after perf fix | wire | positions | mirror apply |
|---|---|---|---|---|---|
| 250 | 3.09 / 6.46 | 1.52 / 2.15 | 41.7 | 6.2 | 1.17 |
| 500 | 7.88 / 12.06 | 3.09 / 5.53 | 81.1 | 12.0 | 2.13 |
| 1000 | 23.18 / 36.12 | 6.12 / 11.07 | 160.1 | 23.7 | 7.31 |
Decision: cap stays (1000 live = 6.1 ms sim and 160 KiB/snapshot), measured value 360 total (~57 KiB pants + ~20 KiB board < 84 KiB; ~2.2 ms p50).

## ✅ FINAL REPORT (T11, `s194/rules`) — DONE
- Merge: `git merge master` fast-forward to ad812166, no conflicts.
- Gates (exit codes from files): typecheck 0 · vitest 0 (7868 passed / 11 skipped, 520 files) · build 0 — entry **1122.2 KiB** (+0.3 vs 1121.9), headroom 127.8.
- Bump verdict: **YES** — both are shared sim rules (placement reducer + stamp legality; pants schedule + FIGHT deadline in runHostTick). A stale peer's ghost/worker would disagree with the host.
- R194-16: porch row 74 → **42** (measured: art base +29 on all 6 atlases, Spiral top 11, +2 air); deposit = porch row; `CASTLE_PORCH_BUILD_CLEAR_RADIUS` 17 arm in `zones.castleKeepOutHitsBox` (reducer, drag ghost, stamp ghost CASTLE, bots). Reach: single shape S 61 / E 61 (was 61/61), SE/SW lobe 78.5; stamps S 61.0 unchanged, E laser 61.9→62.9, goblin 61.0→63.0.
- R194-17: `PANTS_WINDOW_SECONDS` 30/45/60/90/120; release r at floor(r·W/(T−1)); fight = max(60 s, W+10 s) set at the whistle; hold kept as safety net.
- Bot signatures: 3 measured asserts re-pinned (HARD Fortress no longer > Balanced on defence; IMBA Saboteur no pentagram in 300 s; lock anti-vacuity feeds = towers) — reported.
- Pre-existing finding (master too): HARD bots send ~6.5k PLACE_PRIMITIVE per seat per 300 s, ~11 land.

## ⏸ PAUSED (owner session limit) — EXACT NEXT STEP
- **State:** discovery only. `git merge master` done (fast-forward to ad812166, no conflicts). `npm install` done (exit 0). NO source edits yet. No gates run yet. No background processes left running.
- **Next step:** measure castle art opaque bounds (`public/art/castles/*-atlas.png`, 256 cells drawn at `CASTLE_SPRITE_PX` 96, foot at anchor.y + `KEEP_H`/2 = 29) to pick the new `CASTLE_PORCH_OFFSET_Y` (constants.ts:791); then add a porch-clearance arm to `zones.castleKeepOutHitsBox` (zones.ts:293 — the ONE predicate read by canBuildAt / stampRefusalAt / ghost / bots).
- **Findings so far:**
  - Only `castleBank.porchSlot` reads `CASTLE_PORCH_OFFSET_Y`; consumers of porchSlot: `firstFreePorchSlot`, `isOwnPorchSpark`, gathererLifecycle:208-212 (pull landing), botBrain:961-968 (porch-clear), pullFeedback.
  - `structureRepair` deliberately does NOT read the keep-out (FIX/SCRAP) — adding the porch arm to `castleKeepOutHitsBox` keeps that true.
  - R194-17 not started (next: grep `MONSTER_EMERGE_TICKS`, `MONSTER_HOLD_LEAD_TICKS`).
