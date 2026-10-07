# S196 PROGRESS — s196/joiner-lag

## ⏭ NEXT STEP
DONE — all gates green. Only remaining: when joiner-desync lands on master, git merge master + npm install, re-run after-profile (SPARK_LAG_TAG=after2) and the gates.

## FINAL REPORT
- Gates: typecheck 0 · vitest 0 (633 files / 9492 passed / 15 skipped) · build 0 (entry 1265.2 KiB / cap 1350; this tree's src share ~1–2 KiB) · e2e:gating 0 (72 passed, 1 skipped) · e2e:render 0 (10 passed)
- Bump verdict: NONE — render-only (graphicsTier knob, structureRenderer cache, comboView memo, keystone MINIMAL snap, damageNumbers watch in place); no wire, no hash, no sim read changed.
- MINE (owner questions): MINIMAL `motionRedrawsPerFrame` = 3 (connectors on a shaking structure trail it by a few frames on MINIMAL only; recommend keep) · `MINIMAL_LINK_SNAP_PX` = 4 (keystone link ends on a 4 px grid on MINIMAL; recommend keep).
- Handed to other trees: (1) sudokuOverlay redraws 2 Graphics every frame mid-match (~1–2 % of a MINIMAL frame) — ARCADE, off-limits; (2) `lookupCombo` builds a template-string key per call and the sim/joiner (`tickGameState` scoring, ~1–2 %) still pays it — src/combos.ts owner; (3) the replay harness bypasses the codec, so inflate/splice cost is NOT in these numbers — joiner-desync tree; (4) a CPU-starved joiner was PROMOTED to host mid-run in the harness (runHostTick + transmitSnapshot in a joiner profile, S196 first matrix) — worth a look by the net tree (host-liveness under main-thread starvation); (5) HUD scoreboard Text re-rasters ~0.7/frame (texSubImage2D ~4 %) — left alone while the score-staleness bug is open.
- NOT DONE: throttled (4x/6x) before/after numbers are unusable on this machine (100 % CPU all session; n=7–30 frames per half) — 1x interleaved A/B + work counters stand in; chewer/goblin/projectile per-frame Graphics (~240 instr/frame) not cached; Pixi render-group isolation measured (-4 % at 1x) and not shipped.

## AFTER (all 4 fixes, same harness, 1x, fog ON, single runs on a loaded machine — direction, not benchmark)
| | before (b1) | after |
|---|---|---|
| w10 MINIMAL frame p50/p95 | 15.8 / 66.8 ms | 8.9 / 21.2 ms |
| w10 MINIMAL long tasks / 15 s | 62 (4900 ms) | 10 (1292 ms) |
| w10 MINIMAL main thread busy | 94.9 % | 74.9 % |
| w5 MINIMAL frame p50/p95 | 10.0 / 30.7 ms | 9.6 / 19.2 ms |
| w5 MINIMAL long tasks | 13 | 2 |
| w10 Graphics instr/frame (MINIMAL) | 1121 | 779 |
After, w10 1x: LOW 14.8/31.4 ms (8 long tasks), HIGH 22.7/62.3 ms (51) — HIGH/LOW unchanged by design except F2/F3 (allocation-only).
Top-15 self after, w10 MINIMAL: buildContextBatches 6.9 · stroke 5.0 · (program) 4.9 · texSubImage2D 4.1 · break 3.4 · GC 3.0 · packAttributes 2.7 · toFillStyle 2.5 · pixi anon 2.5 · buildLine 2.3 · updateGpuContext 1.9 · collectRenderablesSimple 1.7+1.5 · damageNumbers.track 1.5 · main frame 1.4
LOW: stroke 6.8 · buildContextBatches 6.3 · anon 5.5 · break 4.2 · (program) 3.5 · texSubImage2D 3.2 · packAttributes 2.8 · GC 2.6 · updateGpuContext 2.6 · buildLine 2.5 · handleFillObject 2.0 · collectRenderablesSimple 1.9+1.9 · _callContextMethod 1.5 · bufferSubData 1.4
HIGH: stroke 8.4 · buildContextBatches 7.2 · anon 4.6 · buildLine 4.5 · break 4.3 · texSubImage2D 3.8 · (program) 3.1 · packAttributes 2.4 · GC 2.2 · updateGpuContext 2.1 · handleFillObject 1.8 · collectRenderablesSimple 1.4 · execute 1.3 · _callContextMethod 1.2 · toFillStyle 1.2

## FIXES (each measured)
- **F3 damageNumbers structure watch in place** (damageNumbers.ts): no key string / watch object / repair object / ends tuple per shape+connector per frame. Tests: damageNumbersWatchReuse.test.ts (mutation red).
- **F4 keystone links on MINIMAL snap to 4 px** (keystoneTelegraphRenderer.ts `MINIMAL_LINK_SNAP_PX` ⚠ MINE): interpolation jitter no longer redraws them every frame. Test in structureRenderer.tiers.test.ts (mutation red).
- **F1 MINIMAL connector motion budget** (graphicsTier.ts knob `motionRedrawsPerFrame` 3, structureRenderer.ts). Interleaved A/B in one page (1x): w10 frame med 12.6 -> 10.1 ms (-19.8 %), w5 11.2 -> 7.9 ms (-29.5 %); bucket redraws/frame 9.0 -> 3.3 (w10), 10.5 -> 3.4 (w5). Graphics instr/frame w10 1121 -> 779 (bonds 511 -> 193). Tests: 6 new in structureRenderer.tiers.test.ts, 3 mutations each red.
- **F2 comboView memo** (render/comboView.ts): connector + keystone walks no longer build a `${a}->${b}` string per bond per frame; keystone tests the cheap combo before vision. Zero visual change (HIGH byte-for-byte test green). Profile after F1+F2 (w10 MINIMAL 1x): idle 5.1 % -> 24.2 % of the window; structureRenderer share 11.2 -> 7.3 %.

## WHERE THE JOINER'S TIME GOES (MINIMAL, wave 10, fog ON, joiner page, CDP CPU profile; shares of BUSY main-thread time)
⚠ Machine at 100 % CPU the whole session (8 trees + a 4.6 GB python job): absolute fps/ms swing 3x between identical runs, so the
shares and the WORK COUNTERS (Graphics rebuilds / instructions per frame, `scripts/lag/gfxProbe.ts`) are the trustworthy numbers.

| owner | 1x share | 4x share | notes |
|---|---:|---:|---|
| Pixi Graphics — API calls (`stroke`/`toStrokeStyle`/`moveTo`…) + TESSELLATION (`buildContextBatches`/`buildLine`/`updateGpuContext`) | ~30 % | ~28 % | every cleared+redrawn Graphics; MINIMAL rebuilds 43.8 Graphics / 1121 instr per frame |
| Pixi batching (`break`/`packAttributes`/`packIndex`) + scene collect | ~16 % | ~10 % | a dirtied BATCHABLE Graphics forces the whole render group's instruction set to rebuild |
| structureRenderer (connector cache) | 11.2 % | 12.6 % | 8.5 buckets / 511 instr re-stroked per frame on MINIMAL (46 % of all Graphics instructions) |
| goblinRenderer + chewerRenderer + creatureProjectile | 8.5 % | 8.7 % | chewer 132 + projectiles 105 instr/frame redrawn every frame |
| keystoneTelegraphRenderer | 4.4 % | 3.2 % | MINIMAL already caches the drawing; the cost is `computeKeystonePulses` walking every bond each frame |
| damageNumbers | 3.9 % | 3.6 % | `track`/`syncStructures` per frame |
| texSubImage2D (Text re-raster upload) | 3.4 % | 3.0 % | ui.ts:677 0.75/frame + damage numbers 0.54/frame |
| GC | 2.6 % | 1.1 % | |
| NET receive (handleRawMessage + applyNetSnapshot + interpolateInto) | ~2.5 % | ~4.5 % | NOT the cost on the joiner's CPU (desync tree's area) |
| sudokuOverlay (redraws 2 Graphics every frame mid-match) | 0.8 % | 0.9 % | ARCADE — off-limits, reported |
| tickGameState / scoring complexities on the joiner | 0.9 % | 1.8 % | src/state — not this tree |

Top self (MINIMAL w10 1x): buildContextBatches 6.4 · toStrokeStyle 6.2 · pixi anon 5.0 · (program) 4.2 · break 4.0 · texSubImage2D 3.4 · stroke 3.2 · buildLine 3.1 · packAttributes 2.7 · GC 2.6 · updateGpuContext 2.4 · damageNumbers.track 2.3 · _initContextRenderData 1.6 · computeKeystonePulses 1.3 · collectRenderablesSimple 1.3
Graphics work per frame (w10, 1x): MINIMAL 43.8 rebuilds / 1121 instr · LOW 54.0 / 1609 · HIGH 36.4 / 2103.

## Log
- boot: merged master c78f5c58 (clean). Read S196_AGENT_RULES, S195_LAG_REPORT, R196-P1.
