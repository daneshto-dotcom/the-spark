NEXT STEP: final gates on merged tree (typecheck, vitest, build, e2e:gating) for A+B, then final report at top of this file.

## OPTION A CHECKPOINT = 1cf7f3b8 (merged master b7f1891d). Gates on that tree: typecheck 0 · build 0 (entry 1237.9 KiB, +2.4 vs 1235.5; homeScreen lazy chunk 8.3 kB) · vitest 1 failed/9257 passed — the one red is src/state/endgameAudit.test.ts TIMEOUT (20 s) under shared-machine load, re-run alone 18/18 exit 0 = BENIGN · targeted e2e nonet-home + zones-visual arcade 2/2 · e2e:gating 68/68 exit 0 (10.5 min, own port; incl. nonet-home + zones-visual arcade). OPTION A GREEN.


## R196-D2 (coordinator, S196): owner answered all 10 questions = the recommendations. After A is green+committed, build Option B in this tree:
campaign.ts (30 stages as DATA, pure nextStage/stars), bands 16/13/10 via targetGivens in the ARCADE call only, fixed seed per stage, fail=retry, clock per stage over all its puzzles, 1-3 stars by per-stage thresholds,
progress localStorage spark.nonet.progress.v1 ('this device'), STAGE_CLEARED->next puzzle arm in arcadeRun.ts, stage/star strip on home, main.ts solve branch, board per stage nonet:s07,
on-screen number pad in sudokuOverlay.ts (the ONE shared edit, additive; 13 overlay tests + e2e zones-visual green). No live race, no Steam, match trial unchanged. Campaign screenshots to Desktop folder.


# S196 PROGRESS — s196/nonet-home (backlog #16, Option A "a front door")

- [ ] npm install
- [ ] read code (arcadeOverlay, arcadeRun, main glue, uiScreenChrome, leaderboard client)
- [ ] src/nonet/dailySeed.ts + test
- [ ] run mode field (arcadeRun.ts) — ZEN never submits
- [ ] src/nonet/homeScreen.ts + mount
- [ ] arcade NONET row onSelect -> home
- [ ] tests (reach, negative, mutation, match call single-arg)
- [ ] gates
- [ ] screenshots
