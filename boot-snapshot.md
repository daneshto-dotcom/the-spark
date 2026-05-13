# Boot Snapshot (auto-generated at S23 final close)
Generated: 2026-05-13 | Session closed: S23 → next: S24 | Last commit: e0d2a2c (S23 handoff close)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (toggleable diagnostic overlay)

## Next Steps
1. **S24 P0** — Full-tier Council deliberation on Voltkin Phase 2 (autonomous creature actor). ZERO CODE this session. Output: blueprint design doc. See `.claude/plans/ACTIVE_PLAN_voltkin_phase2.md`.
2. **S25-S28** — Phased implementation per blueprint (entity infra → physics/locomotion → AI behavior → polish+1v1 sync).
3. **S24 P1 (carry-over)** — 1v1 CONNECT retest with brother on ed090fd. Has carried 4 sessions; user said will revisit once Phase 1 stable. Phase 1 IS stable now (Voltkin fires, SFX plays).
4. **Backlog** — Anvil (after Voltkin Phase 2 architecture proven), Pac-Predator, bond UX (multi-target RMB), 1v1 NetSnapshot enhancements.

## Blockers
- None for S24. ACTIVE_PLAN must be read before any work.

## Pending Backlog
- [ ] **Voltkin Phase 2: autonomous creature actor** (S24 blueprint + S25-S28 impl) — 5-session series
- [ ] 1v1 CONNECT retest (S24 P1 carry, 4-session carry)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred from S23 P2)
- [ ] Anvil (after Voltkin Phase 2 architecture is proven and reusable)
- [ ] Voltkin v2 asset pack side session (only if blueprint decides per-frame PNG approach)
- [ ] Pac-Predator (after Anvil)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish

## Recent Reflexion (last 2 sessions)

### 2026-05-13 — Session 23 (P1 chain rewrite + P2 debug overlay + P3 instr + P4 cursor fix)
- S23 #cursor-equality-bug-in-effect-drain: drainAudioEffects + runGodlyMatcher both used `<=` cursor; click-handler-dispatched BOND_FORMED at same world.tick was silently skipped → simultaneously broke Voltkin trigger + SFX. Fix: `<=` → `<`. Audit all cursor patterns with `<=` against tick-driven event streams.
- S23 #debug-overlay-as-root-cause-discovery-instrument: ?debug=1 panel surfacing 7 runtime gates + audio chain + chain progress + call counters collapsed multi-hour blind hunt into 5-min paste-and-fix.
- S23 #prime-audit-Δ1-preemptive-vitest-fixture: writing user's exact reproduction as a unit test before deploying diagnostic is the cheapest highest-confidence step.
- S23 #scope-amendment-rule-16-fired-twice-in-one-session: scope amendments arrive at user's pace; finish executing one and immediately face another. Don't roll into closing summary — formally amend each.
- S23 #ship-cinematic-stamp-as-phase-1-defer-creature-actor-to-phase-2: Phase 1 minimum-viable trigger ships first; Phase 2 upgrades payoff. Phase 1 surfaces trigger bugs (like S23 cursor) before Phase 2's surface area hides them.

### 2026-05-13 — Session 23 (Micro PDR P1 — Voltkin recipe rewrite to typed chain)
- S23 #continuous-threshold-predicates-are-undiscoverable-without-HUD: any predicate built on continuous-parameter thresholds (aspect, adjacency distance) needs PAIRED debug HUD shipped in the same session.
- S23 #bond-graphs-are-bidirectional-the-spec-is-not: DFS over bond graph matches chain in either direction; mental build sequence ≠ structural symmetry.
- S23 #micro-tier-PDR-with-user-explicit-go-skips-Council-cleanly: ~150 LOC single-file rewrite + user-go = Micro auto-waive, ~10 min cycle.
