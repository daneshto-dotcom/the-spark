# Boot Snapshot (auto-generated at S25 close)
Generated: 2026-05-14 | Session closed: S25 → next: S26 | Last commit: 9181b0b (S25 close: P1 lock 3 Qs + reflexion + state)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay now includes `=== CREATURES ===` section)

## Next Steps
1. **S26 P0** — Voltkin Phase 2B physics + locomotion (Standard-tier, ~15-20K). Read `.claude/plans/voltkin_phase2_blueprint_v1.md` §"S26 acceptance criteria" first. Implement `src/physics/creatureVerlet.ts`, steering behaviors (seek, arrive, spawner-zone repulsion), phase-through prims. Creature MOVES with stub target. Bundle target +5 KB. Cumulative budget: 458.30 → 463.30 KB.
2. **S26 P1 (or later)** — 1v1 CONNECT brother retest (6-session carry-over; unblocked since S23, manual playthrough only).
3. **S27 P0** — Phase 2C: AI + attack. FSM transitions wired (SEEKING/ATTACKING used), `CREATURE_ATTACK` action + `ARC_FLASH` effect, target selection. **CRITICAL**: includes synchronous `SEVER_BOND` cascade DELETION in `GODLY_TRIGGER` reducer (Gap A migration — blueprint § "S27 migration notes"). Test surgery: ~5-8 cascade tests REMOVED, ~12-15 attack tests ADDED. Bundle +8 KB.
4. **S28 P0** — Phase 2D: spritesheet (Imagen side-session) + AnimatedSprite swap + NetSnapshot v2 + 1v1 net sync + polish. Bundle +4 KB code + 14 KB asset. Final projected: 494 KB / 500 KB (6 KB margin).

## Blockers
- None for S26 start. Read blueprint § Q1 (Verlet body integration) and § "S26 acceptance criteria" first.

## Manual Smoke Carry-Forward (AC11)
- S25 P0 boot smoke verified (page loads, `world.creatures` Map initialized, debug panel mounted, no console errors). **User-side smoke deferred**: build SQ-SQ-SQ-SQ-TR-TR-TR-TR chain in solo → cinematic plays → at ~4s mark `?debug=1` overlay shows `=== CREATURES === count: 1 C0: type=voltkin owner=P0 state=SPAWNING …` → at ~11s state flips to `DESPAWNING` → at ~12s count back to 0.

## Pending Backlog
- [ ] S26-S28 Voltkin Phase 2 implementation (3 sessions remaining; blueprint LOCKED + APPROVED + S25 P0 DONE)
- [ ] 1v1 CONNECT brother retest (6-session carry, unblocked)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred from S23 P2)
- [ ] Anvil (after Voltkin Phase 2 proven + architecture reusable in S29+)
- [ ] Pac-Predator (after Anvil)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 25 (P0 Voltkin Phase 2A creature scaffold — Standard-tier Council CODE-EXECUTION)
- S25 #standard-tier-council-on-code-shipping-priority-found-critical-1v1-bug: PRIME-AUDIT Δ1 host-gate on SPAWN_CREATURE would have shipped a 1v1 zombie-creature bug. Both Grok CH7 + Gemini CH7 surfaced from different angles. Never waive Council for any code priority touching multiplayer paths.
- S25 #hallucinated-precedent-in-council-r1-fact-check-against-actual-codebase: Gemini R1 cited `godlyReducer.ts` precedent that doesn't exist. Always grep for cited files before adopting renames or "established conventions" from R1.
- S25 #full-state-union-landed-in-s25-vs-subset-2of3-council-majority-overruled-claude: Claude proposed 2-state subset; Council unanimous for full 4-state union. Type widening for zero runtime cost is correct future-proofing for blueprint-spec'd unions.
- S25 #pdr-explicit-out-of-scope-section-prevented-council-scope-creep: Explicit 9-item "out of scope" list deflected Council scope-expansion attempts (NetSnapshot v2, save.ts serialization deeper than minimum). Pattern: count carry-forward bullets; >5 = right-sized multi-session feature.
- S25 #check-triumvirate-found-different-bugs-than-r1-not-redundant: CHECK pass on landed code found 3 issues R1 didn't (save.ts nextCreatureId reset, abort() docstring, AC7 test gap). R1 audits design; CHECK audits implementation.
- S25 #vitest-dom-env-gap-pragmatic-skipif-vs-config-scope-creep: When Council recommends a tool the env can't run, `describe.skipIf` is the pragmatic gate vs scope-creeping the build config.

### 2026-05-14 — Session 24 (P0 Voltkin Phase 2 blueprint — Full-tier Council pure-deliberation)
- S24 #full-tier-council-on-pure-deliberation-session: pure-deliberation Full-tier sessions are valid PDCA priorities — blueprint IS the deliverable. 10x cheaper than wrong-architecture S25+rewrite.
- S24 #cross-model-factcheck-caught-grok-blind-spot-on-per-player-cooldown: 3-way Council value isn't redundancy of correct answers — it's that each model has DIFFERENT blind spots. Quality Gate fact-checks disagreements against codebase.
- S24 #quality-gate-surfaces-gaps-no-individual-R1-can-see: ask "what existing code does this REPLACE?" not just "what does it ADD?"
- S24 #prime-audit-additive-deltas-become-blueprint-sections: usually under-specified + edge cases, rarely decision-wrong.
- S24 #council-r2-accept-all-can-be-genuine-or-rubber-stamp-prime-audit-checks: examine emotional-investment R1 positions.
- S24 #deliberation-output-format-decision-rationale-rejected-risk-sketch-scales-to-10-questions: STRICT template = auditability.
