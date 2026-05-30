# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-30 | Session: S57

## Next Steps
1. **USER — live 2-peer cross-network fog smoke** on https://spark-online.space/?debug=1: confirm each player sees only their own vision (cursor radius + own structures + spawner), the opponent's structures stay hidden until cruised over, and the fog lifts on win (reveal-all).
2. **Memory-fog** — the natural next PDR: StarCraft-style dimmed "remembered" areas after scouting (extends `src/state/vision.ts` + adds a dimmed last-observed render layer below the live fog).
3. **Fog CHECK carry-forwards (all LOW, non-blocking):** (a) freeze/snap the mask to full-reveal at WIN instead of letting cutouts drift during the 1s fade; (b) add a world→screen transform in `vision.ts` IF a camera/viewport is ever introduced (currently world==screen); (c) brush-pool `reset()` on RETURN_TO_TITLE (bounded ~≤52, tidy-only); (d) wire `fogRenderer.destroy()` (dev-only, static page so non-urgent).
4. **Phase-2 next mechanic** (D Inject Spiral / E Steal / A fog-variant / G Mega-combos / Anvil) — design call.
5. **Opponent-view attract-drag parity** (S52 Δ6) — host still sees P2's drag JUMP on placement (deferred from S56; needs a drag-stream intent + host handler).

## Blockers
None. (GitHub Actions billing was resolved this session → CI + Deploy green; Fog of War + the S56 attract-drag fix are both LIVE.)

## Pending Backlog
BACKLOG.md is a historical completed-session log (no open checkboxes). Forward work = the Next Steps carry-forwards above.

## Recent Reflexion (last 2 sessions)
**S57 (Fog of War MVP):**
- `#fog-render-pass-throttle-the-low-frequency-mask` — runtime-verify the GPU path (pixel-extraction, not tsc); a per-frame full-screen RT pass halved the swiftshader sim → fixed with half-res + 20Hz throttle + `__FOG_DISABLE__` e2e seam. Budget per-frame GPU cost for any new render layer.
- `#check-verify-audit-claims-against-source` — the post-ship CHECK's 2 scariest findings (BLOCKER pool-leak, HIGH coord-mismatch) both dissolved on PRIME-AUDIT vs real source. Verify audit claims line-by-line; loose summaries manufacture phantoms.
- `SESSION #s57-fog-of-war-mvp-shipped` — A.0 (4 parallel agents) + Council (Option A RenderTexture, VETO GLSL) + empirical Pixi v8 `'erase'`; 894 unit + e2e green; bundle 502.69 KB (cap 500→550). Shipped + deployed live.

**S56 (AttractDrag parity):** `#client-prediction-was-never-run-not-just-clobbered` — a preserve around a never-produced value is invisible to unit+tsc+Council; only the real-peer E2E proves the produce+preserve chain.
