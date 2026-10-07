# S196 PROGRESS — render-perf (branch s196/render-perf)

## NEXT STEP (top, always current)
Diag run in flight: `npx playwright test e2e/render-census-diag.spec.ts` (log .tmp-gates/diag1.log, data .tmp-gates/census-diag.jsonl). Next: analyse buckets (hidden=pooled vs visible growth), textures by source; then fix + census tighten.

## Log
- boot: merged master 7a596837 (fast-forward of plans/session-state only).
- npm install exit 0. Wrote e2e/render-census-diag.spec.ts (scratch diag: per-path census + textures by source across m1 long run, title, m2, title).
- Hypothesis to test: FxLayer pools are HIGH-WATER (cap 2400/layer, never shrink, hidden sprites stay children) → census counts pooled hidden sprites.
- diag partial (m1 to tick ~3800): census FLAT ~1870 (bots world small: 4-8 creatures). title-embers pools (~950 hidden sprites) are created at title and persist hidden. Waiting for m2 + title2.
- L1 plan: ZoneBackgroundRenderer — release loaded textures no plan piece uses (on bake-signature change) + release all on TITLE; NEVER Assets.unload a url lobbyBackdrop's texCache holds (shared Texture object; a destroyed texture on a lobby sprite would null-deref source). Export `lobbyHoldsTexture(tex)` from lobbyBackdrop.
