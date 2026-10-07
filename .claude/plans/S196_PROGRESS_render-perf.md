# S196 PROGRESS — render-perf (branch s196/render-perf)

## NEXT STEP (top, always current)
Census done (renderCensus.ts + main.ts getter hunk). Next: render-heap.spec cycle assertions (residual = displayObjects−pooled; pooled ≤ poolCap; match→title→match returns to baseline) then run diag v2 on a STABLE tree (no edits while it runs — HMR reloads the page).

## Log
- boot: merged master 7a596837 (fast-forward of plans/session-state only).
- npm install exit 0. Wrote e2e/render-census-diag.spec.ts (scratch diag: per-path census + textures by source across m1 long run, title, m2, title).
- Hypothesis to test: FxLayer pools are HIGH-WATER (cap 2400/layer, never shrink, hidden sprites stay children) → census counts pooled hidden sprites.
- diag partial (m1 to tick ~3800): census FLAT ~1870 (bots world small: 4-8 creatures). title-embers pools (~950 hidden sprites) are created at title and persist hidden. Waiting for m2 + title2.
- L1 plan: ZoneBackgroundRenderer — release loaded textures no plan piece uses (on bake-signature change) + release all on TITLE; NEVER Assets.unload a url lobbyBackdrop's texCache holds (shared Texture object; a destroyed texture on a lobby sprite would null-deref source). Export `lobbyHoldsTexture(tex)` from lobbyBackdrop.
- diag v1 RESULT (m1 6300 ticks): census flat ~1870 until the FIGHT starts (tick ~5600), then +270: fxTopLight +141, fxGround +60, fxTopShade +15 (= +216 FxLayer pool HIGH-WATER; pools never shrink, cap 2400/layer) + ~30 entity sprites. Textures +24 at the same step = lazily-loaded race atlases (t3 units/towers, ra-strike) — S169 design.
- ⭐ FINDING: Pixi 8.19 `managedTextures` = Object.values(GCManagedHash.items) and a REMOVED texture is set to NULL, not deleted (compacted only at 10 000 nulls). So the census `textures` = .length is an EVER-UPLOADED counter that can never go down — a released texture still counts. Diag v1 crashed on such a null.
- L1 FIXED (uncommitted→this commit): ZoneBackgroundRenderer.releaseLoaded (plan change) + releaseAll (TITLE); lobby-held textures never unloaded (new src/render/backdropTextureShare.ts; lobbyBackdrop registers). Tests src/render/zoneBackdropRelease.test.ts 7/7; 4 mutations each caught (onSprite guard, lobby guard, title call, plan-change call). Related suites 9 files/122 pass.
- diag v2 run KILLED by me (benign verdict: my own edits to main.ts/zoneBackgroundRenderer mid-run HMR-reloaded the page under it; data invalid, not a finding). Lesson: no edits while an e2e runs on this worktree.
- Census: src/render/renderCensus.ts {displayObjects, pooled, poolCap, textures(LIVE), textureSlots}; FxLayer registers in a WeakMap (fxPoolOf) + poolSize getter; main.ts renderCensus getter delegates (MERGE SEAM: main.ts DEV block, 5 lines). Test renderCensus.test.ts 4/4; mutations (null count, pooled sum) caught.
