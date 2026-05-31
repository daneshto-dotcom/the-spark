# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-31 | Session: S61

## Next Steps
1. **USER live 2-peer fog-feel tuning (needs your eye — NOT autonomous):** tune `MEMORY_GHOST_ALPHA` (0.5) / `MEMORY_FOG_COLOR` (0x161b2e) / `EXPLORED_GRID_COLS×ROWS` (48×27) in `src/constants.ts`; eyeball 2 cosmetics (≤40px ghost/real fade-band overlap; win-lift ghost fade-vs-persist) + the 4 S58 fixes + a lossy run for the P4 host-TTL edge. I'll spin up the dev server on `$SESSION_PORT` + tune live. (This was S61's approved PDR — preserved unexecuted because it needs your eye.)
2. **Pick the Phase-2 next mechanic (DESIGN CALL — you choose):** D Inject-Spiral / E Steal / G Mega-combos / Anvil → I execute under a PDR.
3. **main.ts hypertrophy (942 LOC, audit #1 HIGH) — do WITH you:** extract netMessageRouter / cinematicStateMachine / teardownNet (NOT autonomous-safe; e2e covers only happy paths).
4. **lobbyScreen.ts (548 LOC) refactor — add construction coverage FIRST (S61 Council unanimous defer):** Playwright e2e for the constructor (panes/input/begin-button/reset), THEN refactor under that net. The 19 lobby unit tests are pure-helper only.
5. **Further §XV (autonomous-OK):** world.ts is now 286 LOC (was 488). The remaining over-280 = the reducer-coupled `GameAction` union + dispatch — a clean cut needs design thought, not a mechanical move. Audit carry: vite/vitest CVE bump (risky, dedicated session) · knip 42 unused-exports (Chesterton) · opponent-view attract-drag parity (S52 Δ6).

## Blockers
None code-side. All S61 shipped + CI-green (P1 `19c1245`, P2 `e6690b0`, P3 `19e383e`, state `77c3e64`). Fog-feel tuning + the Phase-2 mechanic both need your input.

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = the Next Steps above + the handoff CARRY-FORWARD section.

## Recent Reflexion (last 2 sessions)
**S61** — autonomous §XV batch; pivoted from non-autonomous fog PDR:
- P1 #anti-bloat-orchestrator-extract-typeonly-no-cycle #prime-audit-refute-emitter-myth — severBond.ts extract; type-only World import = no cycle; PRIME-AUDIT refuted Grok's DEFER (world.effects is a data array, not an emitter).
- P2 #import-boundary-guard-with-teeth #council-harden-transitive-not-shallow — reducer→render guard; every static-analysis guard MUST ship a positive control (else a broken parser silently passes).
- P3 #anti-bloat-type-logic-split-facade #programmatic-block-move-zero-transcription — worldTypes.ts split; move large blocks PROGRAMMATICALLY (byte-exact), not via giant hand-typed edits; bundle byte-size is the no-leak arbiter for type-only moves.
- SESSION #s61-pivot-non-autonomous-pdr-to-safe-batch — "approve the batch + autonomous run" authorizes high-quality autonomous WORK, not literal execution of a PDR whose arbiter is the absent human; substitute the nearest autonomous-safe work + log the deferral.

**S60** — fog P2/P3 (structure-memory + polish) + autonomous §XV P4/P5:
- P2 #memory-fog-cpu-gate-not-gpu-mask — Pixi v8 sprite.mask is BRIGHTNESS-weighted not pure alpha (near-black fog crushed ghosts ~5%); CPU !isPointVisible gate is the way; pixel e2e is the arbiter for GPU-compositing claims.
- P4/P5 #anti-bloat-extract-with-reexport-facade — re-export facade keeps consumers unchanged; tsc is the exhaustive consumer-check.

## Gotchas (carried)
- **Pixi v8 sprite masks are BRIGHTNESS-weighted, not pure alpha** — don't reintroduce a Sprite(maskRT) mask for the memory layer; CPU !isPointVisible gate is correct.
- `session-state.json` is rewritten by a counter hook → atomic Node read-modify-write, never Edit.
- `e2e/` is NOT in tsconfig → wrong-arity e2e helper calls are invisible to `tsc -b`; run Playwright.
- OneDrive path intermittently garbles raw terminal text → Node/JSON reporters for ground truth.
- AUDIT.md (2026-05-21) is STALE — A.0-verify findings before acting.
