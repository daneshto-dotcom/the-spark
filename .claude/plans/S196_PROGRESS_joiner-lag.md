# S196 PROGRESS — s196/joiner-lag

## ⏭ NEXT STEP
Gates running detached (.tmp-gates/gate-*.log/.exit): typecheck, vitest --maxWorkers=3, build. Then after-profile (SPARK_LAG_TAG=after) + gfx probe at MINIMAL w5/w10 1x, then e2e:gating + e2e:render, then final report.

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
