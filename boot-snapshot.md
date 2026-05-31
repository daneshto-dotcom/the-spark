# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-31 | Session: S60

## Next Steps
1. **USER live 2-peer smoke (fog FEEL — needs your eye, NOT autonomous):** tune `MEMORY_GHOST_ALPHA` (0.5) / `MEMORY_FOG_COLOR` (0x161b2e) / grid res if the enemy-ghost or dim remembered tier reads off; 2 cosmetics to eyeball — a ≤40px ghost/real fade-band overlap at the live-vision edge + win-lift ghost fade-vs-persist (I chose fade = clean reveal); + the 4 S58 fixes + a lossy-network run for the P4 host-TTL edge.
2. **Phase-2 next mechanic — DESIGN CALL (you pick):** D Inject-Spiral / E Steal / G Mega-combos / Anvil. Pick one and I execute it.
3. **main.ts hypertrophy (942 LOC) — audit #1 HIGH, DEFERRED to a session WITH you:** extract netMessageRouter / cinematicStateMachine / teardownNet. Not autonomous-safe (the e2e covers only happy paths — cinematics/audio/settings uncovered).
4. **Further §XV (safe, autonomous-OK next time):** world.ts 488 (>280 — SEVER_BOND orchestrator is the next clean extract) · lobbyScreen 548 (>500 — a pane builder). Audit carry: vite/vitest CVE bump (risky → dedicated session) · knip 42 unused-exports (Chesterton review) · state→render import-boundary guard (`622a7c7f`).
5. Opponent-view attract-drag parity (S52 Δ6) — gameplay feel, needs your eye.

## Blockers
None code-side. All shipped + CI-green (P2 `1709d0d`, P3 `16d4c18`, P4 `9746080`, P5 `1105b5c`). Fog FEEL-tune + the Phase-2 mechanic both need your input.

## Watch-outs
- **Pixi v8 sprite masks are BRIGHTNESS-weighted, not pure alpha** — do NOT reintroduce a `Sprite(maskRT)` mask for the memory layer; a near-black fog mask crushes masked content to ~5%. The CPU `!isPointVisible` per-sprite gate is the working approach (S60 P2).
- AUDIT.md (2026-05-21) is STALE — its parseNetMessage/allowlist micros were already fixed; always A.0-verify audit findings against current code before acting.
- `session-state.json` is rewritten by a counter hook → atomic Node read-modify-write, never Edit · `e2e/` not in tsconfig → run Playwright · OneDrive path can garble raw terminal text → Node/JSON reporters for ground truth.

## Recent Reflexion (this session — full log at .claude/reflexion_log.md)
- P2 #memory-fog-cpu-gate-not-gpu-mask — Pixi sprite.mask is brightness-weighted (false "=alpha"); pixel e2e caught it → CPU gate pivot.
- P3 #fog-polish-reuse-existing-state-edge — win-freeze 1-liner; reset() co-located on the existing `*→TITLE` teardown edge.
- P4 #anti-bloat-reexport-facade — lobbyGeometry extract; re-export facade kept consumers unchanged; tsc as the consumer-check.
- P5 #anti-bloat-reducer-cycle-refuted — godlyActions extract; PRIME-AUDIT 1-grep refuted Grok's cycle BLOCKER (setCooldown ∈ godlyCooldown.ts).
