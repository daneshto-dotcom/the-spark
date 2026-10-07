NEXT STEP: run `npx vitest run src/state/endgameAudit.test.ts --testTimeout=90000 > .tmp-gates/eg90.log 2>&1; echo $? > .tmp-gates/eg90.exit` (timeout-only red, untouched file; took 37 s alone under load), then write the FIX ROUND 3 REPORT at the top of this file and commit. Gates already done on merged tree b35368c6: typecheck 0, typecheck:server 0, build 0 (1259.5 KiB), vitest 1 (only endgameAudit timeout), e2e:gating 70/70 exit 0.

# FIX ROUND 2 REPORT (MED-A: a queued run id in two concurrent POSTs)
- SERVER (worker.js): the read-then-write dedupe (SELECT seen_runs, then fold + mark in one batch) is replaced by an atomic per-run claim: `INSERT OR IGNORE INTO seen_runs` run alone, and the run is folded ONLY if `meta.changes === 1`. Runs without an id are still folded. 24 h TTL unchanged. The claim comes before the fold, so a failed fold drops the run rather than double-counting it. Comment rewritten. Tests (server.worker.test.ts, 3 new): concurrent [r1,new] + [r1] → r1 folded once; 5 concurrent copies → once; NEGATIVE id-less runs folded every time. The fake DB now models INSERT OR IGNORE `changes` faithfully, plus a rendezvous so concurrent requests reach the id check together. Mutations: the old worker → both concurrency tests RED; ignoring `changes` → 3 RED.
- CLIENT (arcadeLeaderboard.ts): `RemoteLeaderboard.inFlight` (per board). submit marks its board for the POST (cleared in finally); if a flush already holds the board, submit sends ONLY the new run. flushAllPending skips marked boards and marks the board it posts. Both submit exits re-read the queue fresh, so a run the flush delivered is never resurrected. Tests (pendingFlush.test.ts, 2 new, deferred fetch): submit in flight then flush → 1 POST, no id twice; flush in flight then submit to the same board → submit sends only the new run, queue empty afterwards. Mutations: drop the flush's in-flight skip → RED (expected 1 POST, got 2); drop the submit's flushHolds → RED.
- Merged master ec57ef3d, no conflicts. Gates: typecheck 0 · build 0 (entry 1245.0 KiB) · e2e:gating 70/70 exit 0 · vitest exit 1 = 3 TIMEOUT-only reds (botFix 1, endgameAudit 2), files my branch does not touch. Re-run alone: botFix 7/7 exit 0. endgameAudit's "seats fall" REACH still times out alone at 20 s (6 node processes from sibling worktrees on the machine); with --testTimeout=90000, 18/18 exit 0, that test taking 20.2 s = BENIGN (load, not logic).

# FIX ROUND REPORT (audit: FIX FIRST — MED-1, LOW-1, LOW-2 only)
- MED-1: `RemoteLeaderboard.flushAllPending` + `flushAllPendingRuns()` (arcadeLeaderboard.ts) and `pendingBoardIds()` (arcadeScores.ts). Every board's queue is flushed after any successful submit AND on every NONET home open (`NonetHome.show`). Expired runs are pruned unsent; sent ids are removed from a fresh read so a run queued mid-flight is kept. Tests in src/nonet/pendingFlush.test.ts (5): daily delivered on home open (real page), stage delivered via a submit to another board, still-offline keeps the run, NEGATIVE expired run not sent, mid-flight run kept. Mutations: delete the submit-side call → stage test RED; delete the home-open call → daily test RED.
- LOW-1: e2e/nonet-home.spec.ts writes to the Desktop only with NONET_SHOTS=1; default is test-results/nonet-home (verified: the default run wrote nothing to the Desktop).
- LOW-2: e2e "one RANKED daily per device per UTC day" solves a DAILY through the real keyboard + solve handler, asserts spark.nonet.daily.v1 = the day, then the next DAILY is ZEN with boardId null. Mutation: delete `saveDailySolvedKey(day)` in main.ts → RED (Expected "20261007", Received null).
- Merged master acddf2de, no conflicts. Gates on the merged tree: typecheck 0 · build 0 (entry 1244.3 KiB) · vitest exit 1 = 7 TIMEOUT-only failures in firstTowerSpeed / endgameAudit / voltkinResummon (they ran alongside e2e on a shared machine); those 3 files re-run alone 45/45 exit 0 = BENIGN · e2e:gating 70/70 exit 0.

# FINAL REPORT — s196/nonet-home (backlog #16: Option A, then Option B per R196-D2)
- Option A checkpoint 1cf7f3b8; final tip = the commit carrying this report. Master merged twice (b7f1891d, 9ddf5027), no conflicts.
- Final merged tree: typecheck 0 · vitest 0 (620 files / 9291 passed) · build 0 (entry 1243.5 KiB, +8.0 vs 1235.5; home lazy chunk 11.3 kB) · e2e:gating exit 1 = 60 passed + 9 ERR_CONNECTION_REFUSED after the dev server died at test 60 → zones-visual re-run 11/11 exit 0 = ENVIRONMENTAL; nonet-home spec 2/2 inside the lane.
- Option A (1cf7f3b8): typecheck 0 · build 0 (1237.9 KiB) · vitest timeout-only red (endgameAudit 18/18 alone) · e2e:gating 68/68.
- Mutation-tested (RED then restored): ZEN submit guard · stage arm · pad routing.
- Bump: NONE (nothing on the wire; match call still generateSudoku(seed), pinned).
- Worker: additive self-registration of `nonet:dYYYYMMDD` (±1 UTC day) and the closed set `nonet:s01..s30`. OWNER ACTION: deploy the worker; until then DAILY/CAMPAIGN boards fall back to local + queue.
- Screenshots: C:/Users/onesh/OneDrive/Desktop/SPARK_S196_NonetHome/ (01..08).
- MINE: ranking = boards this device submitted to (R182-G gate) · one ranked daily per device/day, replay = ZEN · daily counts as played on solve · all campaign numbers except clues 16/13/10 · stage seeds frozen · fail → home + retry · no replay picker for old stages · stars not on initials screen (arcadeRunOverlay off-limits) · daily ranking keys accumulate · campaign code in entry (+8 KiB).
- Seams: main.ts, arcadeRun.ts, arcadeOverlay.ts (targetGivens only), sudokuOverlay.ts (pad), worker.js/.d.ts + server.worker.test.ts, e2e/zones-visual arcade test. uiSkinCensus does not scan src/nonet (own fill-count REACH test instead).
- NOT DONE: Option C, live race, Steam (out of scope); stage replay picker; stars on initials; canon §9 entry.

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
