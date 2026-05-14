# Boot Snapshot (auto-generated at S26 close)
Generated: 2026-05-14 | Session closed: S26 → next: S27 | Last commit: f77739c (S26 close: P0 complete + reflexion + state)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay includes `=== CREATURES ===` section with state + targetPos)

## Next Steps
1. **S27 P0** — Voltkin Phase 2C AI + attack (Standard-tier, ~20-25K). Read `.claude/plans/voltkin_phase2_blueprint_v1.md` § "S27 acceptance criteria" + § "S27 migration notes" FIRST. Implement target-selection (nearest enemy bond / fallback own per blueprint Q12 LOCKED), `CREATURE_ATTACK` action + reducer, `ARC_FLASH` effect kind + renderer, SEEKING → ATTACKING / ATTACKING → SEEKING FSM transitions. **CRITICAL: synchronous SEVER_BOND cascade DELETION migration** in `GODLY_TRIGGER` reducer (blueprint Gap A — test surgery: ~5-8 cascade tests REMOVED, ~12-15 attack tests ADDED). Bundle +8 KB target. Cumulative: 459.48 → 467.48 KB. Council Standard-tier 1 round + Battle Ledger + PRIME-AUDIT + CHECK Triumvirate.
2. **AC11 manual smoke** — open https://spark-online.space/?debug=1, build SQ-SQ-SQ-SQ-TR-TR-TR-TR chain, watch `=== CREATURES ===` section: spawn → 1s SPAWNING (stationary) → SEEKING (creature drifts toward stub target) → DESPAWNING fade → auto-despawn over 8s. S26 deferred (same as S25 — requires live cinematic trigger).
3. **S27 P1 (or later)** — 1v1 CONNECT brother retest (7-session carry, unblocked, manual playthrough only).
4. **S28 P0** — Phase 2D: spritesheet (Imagen side-session) + AnimatedSprite swap + NetSnapshot v2 (`creatures: []`) + 1v1 net sync + polish. Bundle +4 KB code + 14 KB asset. Final projected: 459.48 + 8 + 22 = 489.48 KB / 500 KB cap (~10.5 KB margin).

## Blockers
- None for S27 start. Read blueprint § "S27 acceptance criteria" + § "S27 migration notes" first.

## Manual Smoke Carry-Forward (AC11)
- S25 P0 + S26 P0 boot smoke verified (page loads, world.creatures Map initialized, no console errors). **User-side smoke deferred**: build SQ4-TR4 chain → cinematic → at ~4s mark debug overlay shows `=== CREATURES === C0: type=voltkin owner=P0 state=SPAWNING …` → at ~5s state flips to SEEKING + pos starts moving toward targetPos → at ~11s state flips to DESPAWNING → at ~12s count=0.

## Pending Backlog
- [ ] S27-S28 Voltkin Phase 2 implementation (2 sessions remaining; blueprint LOCKED + APPROVED + S25 P0 + S26 P0 DONE)
- [ ] 1v1 CONNECT brother retest (7-session carry, unblocked)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred since S23 P2)
- [ ] Per-type CreatureConfig table (S29+ when Anvil ships — Gemini Q2 carry-forward)
- [ ] Wall-clock-state-mutation → tick-deterministic pending-spawn flag (S28 paired w/ NetSnapshot v2)
- [ ] Anvil (after Voltkin Phase 2 proven + architecture reusable in S29+)
- [ ] Pac-Predator (after Anvil)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] cutsceneOverlay.test.ts DOM-env-gated 3 tests (future when jsdom added)

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 26 (P0 Voltkin Phase 2B physics + locomotion — Standard-tier Council CODE-EXECUTION)
- S26 #cross-resolve-delta-better-than-two-separate-mitigations: Δ4 single rule (ZERO_ACCEL when state !== SEEKING) cross-resolves BOTH R1 Q7 concerns. Pattern: when 2 R1s flag related-but-different failure modes around state-machine transitions, look for the single rule that gates BOTH.
- S26 #council-q-compromise-better-than-either-2of3-option: Q4 compromise (combined public + 3 exported per-behavior helpers) gets Gemini's testability + Grok's simple API at ~0 LOC cost. When 2/3 Council split is about surface area, expose MORE not less.
- S26 #prime-audit-explicit-carry-forward-vs-silent-drop: Δ6 (S29 config-table) + Δ7 (S28 NetSnapshot serialization) made minority Council positions explicit carry-forward rather than silently dropped.
- S26 #check-triumvirate-zero-fixes-is-a-signal-not-a-failure: S26 CHECK found 0 actionable changes (vs S25's 3). Positive quality signal when R1 + PRIME-AUDIT do their job well; don't manufacture fixes to justify CHECK pass.
- S26 #same-model-r1-vs-check-contradiction-r1-deeper-deliberation-wins: Gemini R1 Q7 contradicted Gemini CHECK G2 from the SAME model. R1 deeper deliberation wins — CHECK should find IMPLEMENTATION bugs, not relitigate DESIGN.
- S26 #grok-api-timeout-retry-with-condensed-prompt: Grok timeout at 120s with 6KB prompt; retry with ~4KB condensed prompt succeeded. ≤5KB rule of thumb per Council R1 model. Retry once before falling back to 2-way.

### 2026-05-14 — Session 25 (P0 Voltkin Phase 2A creature scaffold — Standard-tier Council CODE-EXECUTION)
- S25 #standard-tier-council-on-code-shipping-priority-found-critical-1v1-bug: PRIME-AUDIT Δ1 host-gate on SPAWN_CREATURE would have shipped a 1v1 zombie-creature bug. Never waive Council for any code priority touching multiplayer paths.
- S25 #hallucinated-precedent-in-council-r1-fact-check-against-actual-codebase: Gemini R1 cited `godlyReducer.ts` precedent that doesn't exist. Always grep for cited files before adopting renames or "established conventions" from R1.
- S25 #full-state-union-landed-in-s25-vs-subset-2of3-council-majority-overruled-claude: Claude proposed 2-state subset; Council unanimous for full 4-state union. Type widening for zero runtime cost is correct future-proofing for blueprint-spec'd unions.
- S25 #pdr-explicit-out-of-scope-section-prevented-council-scope-creep: Explicit 9-item "out of scope" list deflected Council scope-expansion attempts. Pattern: count carry-forward bullets; >5 = right-sized multi-session feature.
- S25 #check-triumvirate-found-different-bugs-than-r1-not-redundant: CHECK pass on landed code found 3 issues R1 didn't. R1 audits design; CHECK audits implementation.
- S25 #vitest-dom-env-gap-pragmatic-skipif-vs-config-scope-creep: When Council recommends a tool the env can't run, `describe.skipIf` is the pragmatic gate vs scope-creeping the build config.
