# Boot Snapshot (auto-generated at S24 close)
Generated: 2026-05-14 | Session closed: S24 → next: S25 | Last commit: 6337e34 (S24 P0 handoff prep)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (toggleable diagnostic overlay)

## Next Steps
1. **S25 P0** — Voltkin Phase 2A creature scaffold. Standard-tier PDR (~15-20K). Implement per blueprint § "S25 acceptance criteria": Creature interface + world.creatures: Map + SPAWN/DESPAWN/CREATURE_TICK actions + plain Sprite renderer + ?debug=1 overlay extension for creatures. NO movement, NO AI, NO attack. Read `.claude/plans/voltkin_phase2_blueprint_v1.md` FIRST.
2. **S25 P1** — Resolve 3 open user-facing questions from blueprint: (a) solo creature attacks own structures? (b) despawn audio source? (c) spritesheet generation timing?
3. **S25 P2 (or S26)** — 1v1 CONNECT retest with brother (5-session carry-over, was S24 P1).
4. **S26** — Phase 2B physics + locomotion per blueprint.
5. **S27** — Phase 2C AI + attack per blueprint, includes synchronous SEVER_BOND cascade deletion (Gap A migration).
6. **S28** — Phase 2D animation + 1v1 sync + polish, Imagen spritesheet side-session.

## Blockers
- None for S25. Read blueprint, then PDR.

## Pending Backlog
- [ ] **S25-S28 Voltkin Phase 2 implementation** (4-session series, blueprint approved S24)
- [ ] 1v1 CONNECT retest with brother (5-session carry-over)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred from S23 P2)
- [ ] Anvil (after Voltkin Phase 2 proven and architecture reusable)
- [ ] Pac-Predator (after Anvil)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 24 (P0 Voltkin Phase 2 blueprint — Full-tier Council pure-deliberation)
- S24 #full-tier-council-on-pure-deliberation-session: pure-deliberation Full-tier sessions are valid PDCA priorities — blueprint IS the deliverable. Cost of wrong-architecture S25+rewrite is 10x cost of S24 Council. Pattern: any feature spanning >3 sessions should open with pure-deliberation Council.
- S24 #cross-model-factcheck-caught-grok-blind-spot-on-per-player-cooldown: 3-way Council value isn't redundancy of correct answers — it's that each model has DIFFERENT blind spots. Quality Gate's job is to fact-check disagreements against the codebase (Grok claimed "cooldown prevents overlap"; check `godlyCooldown.ts:21` → per-player. Cost <500 tokens, saved 1v1 bug-fix cycle).
- S24 #quality-gate-surfaces-gaps-no-individual-R1-can-see: each R1 wrote about creature spawning + attack but NO R1 said "delete existing synchronous SEVER_BOND cascade." Cross-cutting concern only visible side-by-side. Schedule Quality Gate to ask "what existing code does this REPLACE?" not just "what does it ADD?"
- S24 #prime-audit-additive-deltas-become-blueprint-sections: PRIME-AUDIT's most common output isn't "you got the decision wrong" — it's "the decision is right but under-specified, here are the gaps." Almost always (b) under-specified + (c) edge cases; rarely (a) decision wrong.
- S24 #council-r2-accept-all-can-be-genuine-or-rubber-stamp-prime-audit-checks: when R2 ACCEPT ALL, PRIME-AUDIT MUST examine the most-emotionally-charged R1 disagreement to verify the model didn't just defer to consensus. Sometimes consensus IS correct; sometimes the model lost a battle. PRIME-AUDIT distinguishes them.
- S24 #deliberation-output-format-decision-rationale-rejected-risk-sketch-scales-to-10-questions: for multi-question Council deliberations (>5), enforce STRICT per-question template (DECISION/RATIONALE/ALTERNATIVES-REJECTED/RISK/SKETCH). Cost paid back 10x in Quality Gate efficiency. Variable-format responses are unauditable.

### 2026-05-13 — Session 23 (P1 chain rewrite + P2 debug overlay + P3 instr + P4 cursor fix)
- S23 #cursor-equality-bug-in-effect-drain: drainAudioEffects + runGodlyMatcher both used `<=` cursor; click-handler-dispatched BOND_FORMED at same world.tick was silently skipped → simultaneously broke Voltkin trigger + SFX. Fix: `<=` → `<`. AUDIT all cursor patterns with `<=` against tick-driven event streams.
- S23 #debug-overlay-as-root-cause-discovery-instrument: ?debug=1 panel surfacing 7 runtime gates + audio chain + chain progress + call counters collapsed multi-hour blind hunt into 5-min paste-and-fix. Build overlay BEFORE the first user-reported runtime bug, not after.
- S23 #prime-audit-Δ1-preemptive-vitest-fixture: writing user's exact reproduction as a unit test before deploying diagnostic is the cheapest highest-confidence step.
- S23 #scope-amendment-rule-16-fired-twice-in-one-session: scope amendments arrive at user's pace; finish one and immediately face another. Don't roll into closing summary — formally amend each.
- S23 #ship-cinematic-stamp-as-phase-1-defer-creature-actor-to-phase-2: Phase 1 minimum-viable trigger ships first; Phase 2 upgrades payoff. Phase 1 surfaces trigger bugs (S23 cursor) before Phase 2's surface hides them.
