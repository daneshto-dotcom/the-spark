# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-31 | Session: S59

## Next Steps
1. **Re-confirm the carried P2+P3 PDR** (Rule 11 — they were Council-designed + PRIME-AUDITed in S59 but need a fresh `go`), then execute:
   - **P2 — Last-seen STRUCTURE memory** (RISKIEST; the enemy-structure ghost-resolution state machine — Council #1 hazard). CPU last-seen `Map<PrimitiveId,…>` + a dim `memoryLayer` ABOVE `fogRenderer.container`, `.mask`=Sprite of `liveMaskRT`, gated by `isExplored && !live`. Exhaustive UNIT tests for the Map state machine + a dedicated memory pixel e2e.
   - **P3 — Fog polish**: (a) WIN-fade freeze recompose when `fogTargetAlpha==0`; (c) `fogRenderer.reset()` on RETURN_TO_TITLE (clears grid+Map+pool); (d) wire `fogRenderer.destroy()` + free textures. (b) world→screen DEFERRED (no camera).
2. **Verify P1 landed clean**: `gh run list` conclusion on `17772b4` (Deploy + E2E); run the FULL smoke/sim-rate e2e once (P1 is behind `__FOG_DISABLE__` so canary should be unaffected); re-measure bundle (<550).
3. **USER live 2-peer smoke** (carried S58): 4 S58 fixes + lossy run (P4 TTL edge); eyeball the new remembered-areas dim tier + tune `MEMORY_FOG_COLOR`/grid res.
4. Phase-2 next mechanic (D/E/A/G/Anvil) — design call. Opponent-view attract-drag parity (S52 Δ6) — still carried.

## Blockers
None code-side. P1 shipped + pushed. P2/P3 are approved-design / awaiting re-`go`.

## Watch-outs
- **Tool-output channel was degraded in S59** (delayed bursts). If it recurs: fewer/larger verification batches + node file-writes; JSON test reporters for ground truth.
- OneDrive path garbles raw terminal text → use Node/JSON reporters (PowerShell shows CP-1252 mojibake but Read is clean).
- `e2e/` is NOT in tsconfig → always run Playwright; tsc won't catch e2e arg errors.
- `session-state.json` is rewritten by a counter hook → atomic Node read-modify-write, never Edit.
- **Memory-fog rule (S59):** in screen-space fog a "dim" tier must be an OPAQUE colour change, never an alpha reduction (alpha reduction leaks the live board). P2's memory layer goes ABOVE the fog, masked by `liveMaskRT`.

## Recent Reflexion (S59)
- P1 #memory-fog-opaque-not-translucent — remembered-areas = opaque dim overlay over the dark base (source-over keeps mask alpha=1 → no leak); the partial-erase draft would have leaked.
- SESSION #method-prime-audit-refute-not-rubberstamp — PRIME-AUDIT refuted 2 reviewer claims (Gemini inverted-layer, Grok phantom bilinear-leak) + 1 false consensus, while catching 1 real coverage bug.
- SESSION #method-checkpoint-under-degraded-tooling — checkpoint at the clean priority boundary + carry the riskiest piece rather than grind through degraded tooling.
