# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-11 (post-Session-11) | Session: 11 of 10+ — Buffer: Drift Cleanup + Phase 2 Design Matrix

## Next Steps
1. **User playtest the post-S10 build** — refresh `localhost:15842` and play. Verify: AttractDrag smooth follow (no swing); STRUCTURE_GROW outward pulse on every place; STRUCTURE_MERGE nudge+flash on cross-structure place; SCORE_TIER corner pulse at score 15/30/45; `C` key toggles cinematics.
2. **Pick from Phase 2 design matrix** — read `docs/phase-2-design-options.md`. 7 mechanics × matrix template + Mermaid prereq DAG. Tiered rollout recommendation: S12 = B.2 Hotseat + A Fog (~450 LOC, foundation tier).
3. **Tune cinematic feel constants if needed** (post-playtest): ATTRACT_FOLLOW_RATE (0.06), STRUCTURE_GROW_HOP_TICKS (4), STRUCTURE_FLASH_TICKS (18), MERGE_IMPULSE_MAGNITUDE (1.2 px), SCORE_TIER_STEP (15). All in `src/constants.ts`.
4. **Tune carry-over playtest constants if still needed**: AUTO_BOND_RADIUS=60, MAX_RELEASE_REACH=120, PHASE_1_WIN_SCORE=50, strain thresholds.
5. **Audio integration** when Suno didgeridoo trance track lands (deferred since S5).
6. **PRIME-AUDIT carry-forward**: `effectsRenderer.ts` at 569 LOC exceeds 500-LOC § XV charter. Refactor candidate when Phase 2 adds more effect kinds (split per-kind drawers into separate files).

## Blockers
**User playtest** of the post-S10 build (top priority) — gates all cinematics tuning. **User sign-off** on Phase 1 ("ship Phase 2") — gates Phase 2 implementation. The design matrix is ready for the conversation.

## Pending Backlog
- [ ] Session 12+ — Audio (when Suno track lands); Phase 2 implementation per `docs/phase-2-design-options.md` user pick; any post-playtest tuning.

## Git
Branch: `master`. Origin: `https://github.com/daneshto-dotcom/the-spark.git`. All S11 commits pushed.
- (S11 close commit at end of P3)
- 2329dcf — S11 P2: Phase 2 design decision matrix (7 mechanics, Council-deliberated)
- 60e588a — [state-autocommit] S10 (P1 push — bookkeeping)
- 5410e4d — [state-autocommit] S10
- c672bb3 — [state-autocommit] S10
- f46f56e — [state-autocommit] S10 final
- c31c25e — S10 P6: fill closeout checkpoint_commit
- f9fb8ad — S10 close: handoff + boot snapshot + PDR archive + BACKLOG + reflexion
- 02e5308 — S10 P5: cinematics debug toggle (world.cinematicsEnabled + C keybind)
- 79c0e0c — S10 P4: SCORE_TIER corner pulse at every-15 boundary crossing
- 2d3e4e7 — S10 P3: STRUCTURE_MERGE with real verlet impulse on candidate component
- 479fb5a — S10 P2: STRUCTURE_GROW outward pulse with BFS hop timing
- 3f599b5 — S10 P1: AttractDrag follow tuning — position-lerp replaces impulse pendulum

## Recent Reflexion (last 2 sessions)
## 2026-05-11 — Session 11 of 10+ (Buffer: Drift Cleanup + Phase 2 Design Matrix)
- S11 #council-r1-surfaces-spec-mechanic-pdr-omitted: Council R1 against § VIII.3 surfaced that 7 disruption actions exist (3 in spec), not 6 mechanics — added Sever-as-disruption as 7th. **Lesson: bound design-doc scope by SPEC enumeration, not PDR enumeration.**
- S11 #cost-anchors-staleness-checked-via-live-loc: Handoff numbers (world.ts 370, effectsRenderer 470) were pre-S10; live `wc -l` showed 481/569. Updated table + flagged charter breach. **Lesson: anchor design-doc costs to LIVE LOC at PRIME-AUDIT, not handoff snapshot. Catches charter breaches as side effect.**
- S11 #design-doc-overage-justified-by-council-additions: Doc landed at 523 lines (over 280-400 target) because Gemini's REVISE added Risks + Playtest-Readiness blocks. Accepted as "materially better." **Lesson: when Council adds quality dimensions, line-count budget grows proportionally. Measure better/longer by content density.**
- SESSION #buffer-session-doc-prep-when-everything-gated: All 3 backlog items user-gated; only doable work was Phase 2 design-doc prep. **Lesson: in buffer sessions where all gates are user-controlled, design-doc prep for the next-session conversation is highest-leverage non-gated work.**

## 2026-05-11 — Session 10 of 10 (Tuning + Cinematics Implementation)
- S10 #attract-impulse-to-lerp-when-user-feels-pendulum: User described physics as "stupid magnet slowly swinging" — switch from impulse to direct pos-lerp when user names the artifact, not the outcome. They want UI tracking, not attraction.
- S10 #bfs-hop-map-as-effect-payload: STRUCTURE_GROW carries precomputed Map<PrimitiveId, hop> + Map<BondId, hop>. Renderer looks up live positions per frame; severed-mid-effect IDs silently skipped. Robust against mutation during effect lifetime.
- S10 #verlet-impulse-via-prevpos-offset: Push prevPos AWAY from target → next-step velocity = (pos - prevPos) points TOWARD target. Single-line impulse primitive; magnitude in px directly visible. Conservative 1.2px = 2% strain at LOW-tier worst case.
- S10 #cinematic-physics-half-stays-unconditional: P5 toggle gates EMISSIONS only. P3 verlet impulse is a designed mechanic (user picked physics-over-visual) and stays on regardless of toggle.
- S10 #test-via-pure-helper-export: Extract algorithm as exported pure function when surrounding class is hard to instantiate. Unit tests verify lerp math without Pixi Application + DOM mock.
- S10 #cross-cutting-gate-deferred-to-last-priority: Ship N priorities unconditional first, then add the gate priority that wraps each emission site. Beats threading the gate through every priority.
- S10 #anchor-place-emits-grow-too: New ubiquitous emission breaks legacy "no effects emitted" assertions. Audit tests asserting on effects.length vs effects.filter(kind).length before cross-cutting emissions.
- SESSION #playtest-confirmed-bug-fix-as-first-priority: Sort mixed-confidence batches ascending by tuning-vs-design-confidence — empirical-feel priorities first, pre-designed priorities later.
