# S193 · `s193/visuals-combat` (visuals-4) · progress

## ROUND 2 (merge-owner ruling on MINE #1) — supersedes the numbers below where they differ
- V08 now KEEPS the shipped 0.5 -> 2.0 -> 1.0 pop in fx mode too (owner's R185-D praise). Only the big-hit ±2 px shake (60 fifths, MINE) and the 3 heal sparkle motes remain on top. `floaterPopScale` and its constants are deleted. **Owner question, NOT built: the S192 plan's softer 0.6 -> 1.15 -> 1 pop.**
- Tests: `floaterFxReach.test.ts` pins the shipped curve frame for frame in fx mode (mutation: forcing scale 1 in the fx branch -> red); new reach case for the big-hit shake vs. small hit. Pure pop test removed.
- Fix commit `93248142`; merge of master `b72e7790` (deploy #20, PROTOCOL 59, includes visuals-2) = `781a8393`, clean, no conflicts; npm install 0.
- Gates on merged tree: typecheck 0 · vitest 0 (488 files passed / 4 skipped; 7473 passed / 11 skipped) · build 0, entry 1070.5 KiB (cap 1250) · e2e:gating 0 (71/71) on own port 34243.
- V08 screenshots re-shot with the shipped pop (Desktop visuals-4/v08-*).
- Bump verdict unchanged: NONE.

## FINAL REPORT
- **Branch tip**: the commit carrying this report (`git log -1 s193/visuals-combat`). Merge of master (`ff109025`+) = `5c405dbd`.
- **Merge conflict (1, source)**: `src/render/damageNumbers.ts` `place()` — master's S192 T12 heal drift 0 (straight-up heal column) kept, plus this branch's V08 fields (`amount`, `heal`, `seed`). No other conflicts.
- **Gates on the merged tree**: typecheck 0 · vitest 0 (487 files passed / 4 skipped; 7450 tests passed / 11 skipped) · build 0, **1059.6 KiB** entry (cap 1250) · e2e:gating **0 (71/71)** on this worktree's own port 34243.
- **Bundle delta of this branch**: **+8.8 KiB** (1035.9 -> 1044.7, measured pre-merge against base `f576a801` by building the base `src`).
- **Bench** (GPU, 120 creatures + 2 pinned-firing turrets + 2 slapping Helgas + 6 new arcs every 4 frames + bites; last 300 frames, 2 runs): legacy 9.19 / 8.47 ms avg · HIGH 6.83 / 6.53 · LOW 7.06 / 6.01. New path is faster than legacy (pooled sprites replace multi-stroke Graphics paths), ~1330 fx sprites live. Contract (<= +1.0 ms) met. Shared machine: only paired comparisons mean anything.
- **Protocol bump verdict: NONE.** Render-only; no sim write, no wire field, no hash, no new GameEffect kind. Every seed is synced integers (effect tick, creature/defender id, ticksInState, world.tick).
- **No new fogHiddenLayer/groundLayer child** (existing fxTop / fxTopShade sinks only), so `e2e/fog.spec.ts` is unchanged.
- Screenshots: `C:/Users/onesh/OneDrive/Desktop/SPARK_Visuals_Pilot/visuals-4/` — 12 BEFORE (?fx=legacy) | AFTER (HIGH) pairs; `raw/` singles; `first-pass-before-tuning/` superseded first run.

### MINE (owner questions, with recommendation)
1. V08 pop now 0.6->1.15->1 (S192 plan) instead of the shipped 0.5->2.0->1.0 — rec: keep the plan's pop; `?fx=legacy` keeps the old one.
2. Big-hit shake threshold `FLOATER_BIG_HIT_FIFTHS = 60` (12 HP) — rec: keep.
3. All lightning / projectile / bite / slap tuning numbers — rec: owner LOOK at the pairs.
4. Voltkin TV crackle intensity per row (spawning 1, critical 0.8, explosion 0.35) — rec: keep; not screenshotted (needs a built chain).

### Merge seams
- `damageNumbers.ts` also touched by `s192/magic` (RESIST floater, not yet on master): V08 adds 3 Floater fields, the fields in `place()`, and one `if (fx)` block in `advance()`. A new FloaterKind needs nothing from V08.
- No overlap with `s193/visuals-boss` (no displacement, no new substrate export).
- Benign churn: vitest rewrites `pentagramBuildability.test.ts.snap` line endings; reverted before each commit.

### NOT DONE
- **Lightning hub**: no arc drawer exists in this batch's file set; its only effect is the BOMB_EXPLODE blast (V04, already rebuilt). Needs `structureRenderer.ts` (outside the boundary).
- Lightning-cloud and TV crackle wiring are pinned by source (Node cannot drive their atlas renderers); layouts are tested pure; the cloud is screenshotted.
- A killing arrow lands with no impact puff (victim gone; documented at `resolveProjectileImpact`).


Worktree `.claude/worktrees/s193-visuals-combat`, branch `s193/visuals-combat`, base master `f576a801`. Merge owner: main session.

## Next step
- Read the target renderers (arcFlash, turretRenderer, creatureRenderer, voltkinTowerRenderer, damageNumbers, creatureProjectile, chewBite, princessRenderer), then build `fx/lightningFx.ts` (V07).

## Log
- worktree created from master f576a801, npm install exit 0.
- 95bb4325 V07 lightning (lightningFx.ts; arcFlash, turret beam, lightning clouds, Voltkin TV crackle) · 7a949ed7 V08/V13/V23 (floaterFx.ts, combatFx.ts) · pure tests + reach tests 0680edfc (33 tests green, 2 mutations red-checked).
- NEXT: screenshot harness .tmp-gates/fx (port 34243), bench, full gates, merge master.
- a11f98d2 tuned after first screenshots. Screenshots composed → Desktop SPARK_Visuals_Pilot/visuals-4/ (12 pairs; raw/ = latest singles; first-pass-before-tuning/ = superseded first run).
- NEXT: bench (.tmp-gates/fx/bench.spec.ts), full gates, git merge master, re-gate, final report.
- merge master 5c405dbd; gates green on merged tree; e2e 71/71. DONE, awaiting merge-owner audit.
