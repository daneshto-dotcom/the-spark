# S195 PROGRESS — s195/fixes (T22)

NEXT STEP: item 5 — re-run `npx vitest run src/bots --maxWorkers=2` (bg) and RE-MEASURE the signature pins that moved (Q-E: IMBA WARMONGER feeds vs TYCOON — first run showed TYCOON s3 fed 13, relation 18 ≥ 2×15+5 failed); then item 3 worker-heap CDP snapshot metric.

DONE: item 2 (cap 150 s, commit), item 8 (framed reads, e2e 1/1 + 1/1), item 4 (lostToEntropy + tests + ffa golden re-pinned with proof), item 5 code + tests (botEntropy.test 10/10; aware HARD max component 12/10/10 vs unaware 29/23/11), item 6 verified (refused PLACE 0/0/0; sent=landed 26/31/38), item 7 verified (settings-toggles ×3: 9/9 on Chromium 1194).

## Findings so far
- Item 1 (draftOverlay sheen clock): ALREADY LANDED on the integration branch by s195/ci-perf (b9f2143) — `hoverGlassAt(SKIN_SHEEN_MS/2)` pins `performance.now`, plus a scan test proving the clamped-out phases exist. Grep of every other sheen test (uiSkinReach.{chips,teams,arcade,buttons}, uiSkin.test, uiSkinCensus): none reads the wall clock — `uiSkin.test` passes `t` explicitly; the four REACH sweeps drive `Ticker.shared.update(lastTime + 50)` for 40 frames (2000 ms > one 1600 ms cycle) and assert `drew > 5`, so a ≤0.4 % clamped-out slice (≤1 frame of 40) cannot flake them. Verdict: nothing further to pin.
- Item 7 (settings-toggles race-music): product fix ALREADY LANDED by s195/ci-perf (d6806da: `playMusic` follows the wanted URL; audioManager.test "a track change mid-load"; bounded polls; da39ae4 fresh Saw list). Remaining here: run the spec ×3 on this box and record.
- Item 2 measurement: `npx vitest run src/bots/botFix.test.ts` ALONE on this 4-core box: file 47.8 s wall (real 48.8 s); the "restored" test 18.7 s (cap 60 s); HARD tier test 9.3 s, IMBA 9.7 s. Exit 0 (.tmp-gates/botfix-alone.exit). Under 8-tree load it took 79 s = 4.2× → load-only.
