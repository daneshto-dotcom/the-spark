# S196 PROGRESS — render-perf (branch s196/render-perf)

## NEXT STEP (top, always current)
Diag run in flight: `npx playwright test e2e/render-census-diag.spec.ts` (log .tmp-gates/diag1.log, data .tmp-gates/census-diag.jsonl). Next: analyse buckets (hidden=pooled vs visible growth), textures by source; then fix + census tighten.

## Log
- boot: merged master 7a596837 (fast-forward of plans/session-state only).
- npm install exit 0. Wrote e2e/render-census-diag.spec.ts (scratch diag: per-path census + textures by source across m1 long run, title, m2, title).
- Hypothesis to test: FxLayer pools are HIGH-WATER (cap 2400/layer, never shrink, hidden sprites stay children) → census counts pooled hidden sprites.
