# S193 · `s193/visuals-racial` (visuals-3) · progress

## ⏸ PAUSED (S194 owner pause order) — RESUME HERE
- EXACT NEXT STEP: (1) screenshots — run `.tmp-gates/shots/shots.spec.ts` in BOTH this tree and the scratch master tree
  `.tmp-gates/master-tree` (a `git worktree add --detach` of master 18560cd8, npm-installed), with env
  `FX_GPU=1 FX_SHOT_DIR=<abs .tmp-gates/shots> FX_SHOT_TAG=master|merged`, dev servers on 30914 (master tree) / 23871 (this tree)
  — start them with `npm run dev -- --port <p> --strictPort --host`; (2) full gates: typecheck · `npx vitest run --maxWorkers=3` ·
  `npm run build` (entry KiB) · `npm run e2e:gating` on this worktree's port; (3) final report; (4) `git worktree remove .tmp-gates/master-tree`.
- DONE: merge (b72b7857) · haze fold (2e42864c) · bench A and bench B (results below). Perf VERDICT: within budget, no trim needed.
- HALF-DONE: nothing in source. The scratch master worktree is still registered (remove at the end).
- Gates last run: tsc 0 (after the fold) · vitest on `src/render/fx` + perkFxReach + untargetableCallSites 0 (17 files / 181 tests).
  Full vitest, build, e2e NOT yet run on the merged tree.
- BENCH B (paired, in-page: one page, 6 cycles × legacy/high/low, 2.5 s frameMs windows, 5 pages per tree, real GPU, interleaved trees;
  board = 120-creature horde + 3 Pharaohs + 8 Krakens + 20 stunned + 3 locusts + Vlad + zombie + a blast every 0.5 s, demons scorch FIGHT, vampires lifesteal, 1/4 enraged):
  · master alone: HIGH−legacy avg median **+0.21 ms** (IQR −0.08..+0.72, n=30); LOW **−0.30** (IQR −0.93..+0.40)
  · master+v3:    HIGH−legacy avg median **+0.54 ms** (IQR +0.19..+0.87, n=30); LOW **+0.34** (IQR −0.36..+0.58)
  · frame p50 deltas agree: master +0.30 / −0.05, merged +0.50 / +0.30. v3's own share ≈ +0.33 HIGH, +0.64 LOW (LOW is CPU sprite count).
  Both modes ≤ +1.0 ms → contract MET; no trim, no HIGH-only gating needed.

## S194 ROUND (T2) — log, newest last
- Merge of master `0a37175e` = `b72b7857`. ONE conflict: `src/state/untargetableCallSites.test.ts` NOT_ACQUISITION — kept both
  (this branch's goblinRenderer/zoneBackgroundRenderer verdicts + master's `state/magicResistCue.ts`). npm install 0.
- MERGE SEAM fixed: master made `damageEntity`'s `cls` REQUIRED (S192 R192-M1); `perkFxReach.test.ts` (2 calls) failed tsc → `'physical'` added.
- Heat-shimmer FOLD done: `zoneBackgroundRenderer` no longer owns a DisplacementFilter / map / HIGH gate; it calls
  `fxHaze().haze(sprite, tick)` (new hook in `fxState.ts`, new section in `fxRuntime.ts` beside the V10 ripple: shared map,
  one filter, HIGH-only + legacy + fxClear strip it, applied at `fxEndFrame`). `SCORCH_SHIMMER_PX` → `FX_HAZE_PX` (5). `fxStats().haze`.
  Haze stays on the zone SPRITE (zone-sized filter bounds), not on `groundArt` (that would be a full-screen pass). REACH test + 2 mutations red.
- Bench A (separate page per mode, interleaved master/merged, 8 rounds, real GPU, CPU 31-91 % from other worktrees — noisy):
  master HIGH−legacy median +1.15 (−0.31..+5.37), LOW +0.43 (−2.25..+2.30) · merged HIGH +0.84 (−0.21..+1.83), LOW +0.86 (−0.90..+2.34).
  Spread ≫ effect, so a PAIRED in-page bench (B: one page, 6 cycles of legacy/high/low, 2.5 s windows) is running next.
- NEXT: analyse bench B (`.tmp-gates/bench2/b-*.jsonl`), then screenshots (`.tmp-gates/shots/`), then full gates.

## FINAL (merge owner: full report is in the agent's hand-back)
- DONE, all 8 items built (V11 V12 V14 V18 V19 V21 V22 V26). Merge `1469893b` of master `e693dac0` resolved one conflict, in
  `untargetableCallSites.test.ts` NOT_ACQUISITION, by keeping both sides.
- Merged-tree gates: tc 0 · vitest 0 (7363 passed) · build 0, 1055.2 KiB (branch +14.5 KiB) · e2e:gating 0 (70/70) on port 23871.
  e2e:races 0 (5/5) was run before the merge.
- Bench: HIGH is +0.76/+0.99 ms over legacy (that is all S192+S193 effects together); LOW is +0.2/+0.5 ms. NO protocol bump. fog.spec unchanged (no new direct child).
- Screenshots: `C:\Users\onesh\OneDrive\Desktop\SPARK_Visuals_Pilot\visuals-3\index.html`.
- V26 deviates from the plan: the grade is BAKED into the backdrop texture, not applied as an AdjustmentFilter, to avoid a per-frame full-zone filter on CI software GL.

Worktree `.claude/worktrees/s193-visuals-racial`, branch `s193/visuals-racial`, base master `29e12571`
(the rules file says 8693fdd; master had moved on to 29e12571, which contains it — `git merge master` is a no-op).
Not the merge owner. Batch: V11 V12 V14 V18 V19 V21 V22 V26 (S192_VISUALS_PLAN.md §4/§5).

## NEXT STEP
- [x] worktree + npm install (exit 0)
- [x] studied sources; `fx/perkFx.ts` layouts written (all 7 sprite layouts)
- [ ] NEXT: wire goblinRenderer (V11 lifesteal walk, V14 rage, V18 feed, V21 elite), then chewer V22, gatherer V19, zone V12+V26
- [x] wired: goblinRenderer (V11 V14 V18 V21) · chewerRenderer (V22) · gathererRenderer (V19) · zoneBackgroundRenderer (V12 V26)
- [x] tests: `src/render/fx/perkFx.test.ts` (pure, 22) + `src/render/perkFxReach.test.ts` (REACH via real renderers + real sim, 15); 7 mutations each turned red
- [ ] NEXT: Playwright screenshot/bench harness in `.tmp-gates/fx/` (own port), before/after shots, bench, full gates

## AUDIT FIX ROUND (perf FIX FIRST + 2 LOW)
- Merged master `14927078` (visuals-2 + endgame) as `c1c00c53`. One conflict, in the goblinRenderer.ts class fields; kept both sides (master's pantsState/lastPantsSfxMs and this branch's healSeen/lifestealBursts). npm install was re-run.
- Perf: `BURN_FLICKER_LIFE` 18→12 (3 sprites per burning unit) and `RAGE_SPARK_LIFE` 30→15 (4 per raging unit). New cap `BURN_FLICKER_MAX_UNITS` = 24 (⚠ MINE): at most 24 units carry flames per frame, lowest ids first, creatures before Helgas.
- LOW: an enemy HELGA in burning ground now gets flames (`isHelgaBurning`, which uses burnHelgas' own gates: live, not DORMANT, `isScorchImmune`). Tests are REACH plus mutation-checked.
- LOW, carried for later (not refactored): the V12 heat shimmer is a second displacement mechanism (a per-zone sprite `DisplacementFilter` with its own 64 px noise map) next to visuals-2's `fxDisplace` pool on groundLayer. FOLD LATER: move the shimmer onto `fxDisplace`'s pool and map so one mechanism owns ground distortion.
- Also: `SCORCH_EMBER_PERIOD` 3→4 (30 embers a zone, not 40), to give LOW real margin.
- BENCH (the auditor's `.tmp-audit/bench` harness on the merged tree, real GPU; each pass started only after CPU load was below 40 %; 8 paired, interleaved runs):
  HIGH−legacy median **+0.85 ms**, LOW−legacy median **+0.60 ms**. Both include master's own effects. Top-layer sprites fell from ~780 to ~530 (master alone is ~355).
  Runs taken while other worktrees held the CPU at 100 % (legacy 7.5–12 ms) are discarded as not meaningful.
- Gates after the fix (tip below): tc 0 · vitest 0 (487 files, 7475 passed). A full-suite run under 100 % CPU had failed
  `structureComponents.test.ts`, a wall-clock ratio test; it passed 9/9 when re-run alone, so it is ruled benign (load).
  build 0, 1072.2 KiB · e2e:gating 0 (71/71) on port 23871.
