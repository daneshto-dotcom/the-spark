# S195 PROGRESS — s195/fixes (T22)

NEXT STEP: final build + full vitest running in bg (.tmp-gates/final-build.*, final-vitest.*); then write the final report at the top.

WORKER-HEAP MEASURED (Chromium 1194, this box, 30.7 min, exit 0, 2/2): BASELINE td-heavy ticks=2307 snapshot 58.8→63.0 MB (Δ4.28; native +3.32 = GL/batcher buffers, code +0.85, object +0.01) vs usedJSHeapSize Δ4.93; BOTS 3×MID ticks=2088 snapshot 147.2→148.1 (Δ0.92; code +0.61) vs usedJSHeapSize Δ3.08; worker Δ0.20 / 0.33; snapshots 3.4–7.3 s each (budget +60 s holds).

(old) wait for `.tmp-gates/e2e-worker-heap.{log,exit}` (bg run of e2e/worker-heap.spec.ts, Chromium 1194); record the snapshot-metric numbers; then FINAL GATES on the merged tree (merge 18b5bf1 of ccr-26eaab43-fa9mg3, docs only, clean): `npm run typecheck` · `npx vitest run --maxWorkers=2` · `npm run build` (entry KiB) — each exit to .tmp-gates/; then write the final report at the top of this file.

DONE: item 2 (cap 150 s, commit), item 8 (framed reads, e2e 1/1 + 1/1), item 4 (lostToEntropy + tests + ffa golden re-pinned with proof), item 5 code + tests (botEntropy.test 10/10; aware HARD max component 12/10/10 vs unaware 29/23/11), item 6 verified (refused PLACE 0/0/0; sent=landed 26/31/38), item 7 verified (settings-toggles ×3: 9/9 on Chromium 1194).

## Findings so far
- Item 1 (draftOverlay sheen clock): ALREADY LANDED on the integration branch by s195/ci-perf (b9f2143) — `hoverGlassAt(SKIN_SHEEN_MS/2)` pins `performance.now`, plus a scan test proving the clamped-out phases exist. Grep of every other sheen test (uiSkinReach.{chips,teams,arcade,buttons}, uiSkin.test, uiSkinCensus): none reads the wall clock — `uiSkin.test` passes `t` explicitly; the four REACH sweeps drive `Ticker.shared.update(lastTime + 50)` for 40 frames (2000 ms > one 1600 ms cycle) and assert `drew > 5`, so a ≤0.4 % clamped-out slice (≤1 frame of 40) cannot flake them. Verdict: nothing further to pin.
- Item 7 (settings-toggles race-music): product fix ALREADY LANDED by s195/ci-perf (d6806da: `playMusic` follows the wanted URL; audioManager.test "a track change mid-load"; bounded polls; da39ae4 fresh Saw list). Remaining here: run the spec ×3 on this box and record.
- Item 2 measurement: `npx vitest run src/bots/botFix.test.ts` ALONE on this 4-core box: file 47.8 s wall (real 48.8 s); the "restored" test 18.7 s (cap 60 s); HARD tier test 9.3 s, IMBA 9.7 s. Exit 0 (.tmp-gates/botfix-alone.exit). Under 8-tree load it took 79 s = 4.2× → load-only.
