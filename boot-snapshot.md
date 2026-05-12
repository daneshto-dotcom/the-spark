# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-Session-13) | Session: 13 of 10+ — Playtest Feedback Batch

## Next Steps
1. **User re-playtest the post-S13 build** — refresh `localhost` (preview server, port assigned by session — default `15842` if launched via legacy alias). Verify the 4 closed fixes:
   - **Multi-structure merge**: place a primitive in the middle of 3 close-but-separate structures → all 3 should now merge (was: only 1).
   - **STRUCTURE_GROW physical**: place on existing structure → structure should visibly puff outward (was: flash only, no motion).
   - **MERGE_IMPULSE visibility**: cross-structure merge → candidate component should clearly snap inward (was: invisible at 1.2 px; now 3.0 px).
   - **SCORE_TIER visibility**: cross score 15/30/45 boundary → big pulse AT THE PLACEMENT (was: small pulse at bottom-left corner).
2. **Pick from Phase 2 design matrix** — read `docs/phase-2-design-options.md`. 7 mechanics × matrix template. Tiered rollout recommendation: S14 = B.2 Hotseat + A Fog (~450 LOC, foundation tier). Renderer is Phase-2-ready — new effect kinds plug in as new files in `src/render/effects/`.
3. **Tune cinematic feel constants if needed** (post-playtest): ATTRACT_FOLLOW_RATE (0.06), STRUCTURE_GROW_HOP_TICKS (4), STRUCTURE_FLASH_TICKS (18), **MERGE_IMPULSE_MAGNITUDE (3.0 — S13 bumped)**, **MERGE_REACH_RADIUS (100 — S13 new)**, **STRUCTURE_GROW_IMPULSE (0.8 — S13 new)**, **MIN_BOND_LENGTH_FOR_IMPULSE (25 — S13 new)**, SCORE_TIER_STEP (15), SCORE_TIER_DURATION_TICKS (48 — S13 bumped). All in `src/constants.ts` (and `src/render/effects/lifetime.ts` for the duration).
4. **Tune carry-over playtest constants if still needed**: AUTO_BOND_RADIUS=60, MAX_RELEASE_REACH=120, PHASE_1_WIN_SCORE=50, strain thresholds.
5. **Audio integration** when Suno didgeridoo trance track lands (deferred since S5).
6. **PRIME-AUDIT carry-forward**: `world.ts` grew to 587 LOC (17% over § XV 500-LOC soft charter) from S13's three additions in `placePrimitive`. Recommended S14 fix: extract `placePrimitive` into its own `src/state/placePrimitive.ts` file (same pattern as S12's per-kind effect-renderer split). Leaves world.ts at ~340 LOC. Not blocking S14 playtest.

## Blockers
**User re-playtest** of the post-S13 build (top priority) — gates further cinematics tuning. **User sign-off** on Phase 1 ("ship Phase 2") — gates Phase 2 implementation. The design matrix is ready for the conversation.

## Pending Backlog
- [ ] Session 14+ — Audio (when Suno track lands); Phase 2 implementation per `docs/phase-2-design-options.md` user pick; `placePrimitive` extraction (S13 PRIME-AUDIT carry-forward); any post-playtest re-tuning of S13's new constants.

## Git
Branch: `master`. Origin: `https://github.com/daneshto-dotcom/the-spark.git`. All S13 commits pushed.
- (S13 closeout commit at end of P5)
- 8b5ad3e — S13 P4: SCORE_TIER center pulse at placement (replaces corner anchor)
- 72caa22 — S13 P2: STRUCTURE_GROW outward verlet impulse (centroid-outward)
- 8e58cd2 — S13 P1+P3: multi-structure merge reach fix + MERGE_IMPULSE tuning
- c1314a9 — [state-autocommit] S12
- adbe7eb — [state-autocommit] S12
- 2293ced — [state-autocommit] S12
- 11e0d20 — S12 handoff: replace root HANDOFF, archive S11 copy, finalize session-state
- 59c7170 — S12 P3: closeout — BACKLOG + reflexion + boot snapshot + PDR archive
- 80f52e8 — S12 P2: effectsRenderer per-kind split (Council R1, § XV compliance)
- fc982af — [state-autocommit] S11 (P1 push — bookkeeping)

## Recent Reflexion (last 2 sessions)
## 2026-05-12 — Session 13 of 10+ (Playtest Feedback Batch)
- S13 #verify-council-claims-against-source-before-adoption: Grok DISRUPTOR returned 6 challenges; 3 of them (spatial index, constraint amplification, off-center dedup brittleness) were demonstrably wrong against the actual codebase. Reading `spatial.ts`, `bonds.ts:65`, and the placePrimitive dedup logic refuted each. Adopted only 2 of 6 Grok findings; the 4 Gemini concerns were higher-signal. **Lesson: Council outputs are proposals, not verdicts. Verify physics/code claims against actual source before adopting OR rejecting.**
- S13 #knob-splitting-when-one-constant-doubles-as-two-semantic-concepts: AUTO_BOND_RADIUS=60 was doubling as both primary-pick radius AND merge sweep radius. Use cases had diverged (primary precision vs merge reach). Split into separate constants: AUTO_BOND_RADIUS stays 60 (primary), new MERGE_REACH_RADIUS=100 (merge). **Lesson: when one constant serves two semantically distinct use cases and playtest reveals a tuning conflict, split the constant. Cheaper than one-knob optimization; clearer code.**
- S13 #impulse-direction-as-ux-framing: P2 original design pushed STRUCTURE_GROW prims outward from new-prim origin → reads as "recoil." Council Grok #2 revised to centroid-outward → reads as "growth." Same physics, different mental model. **Lesson: physics-impulse direction is a UX framing choice as much as a math choice. Check whether direction matches the conceptual frame the user described.**
- S13 #short-bond-clamp-prevents-teleport-not-strain-break: Gemini #1 flagged strain risk on short bonds; actually bonds.ts breaks on extension only and MERGE_IMPULSE is compression. But the clamp IS needed — prevents teleport-through-new-prim when impulse > idist. Adopted with corrected justification. **Lesson: a Council mitigation can be correct AND its stated reason can be wrong. Adopt; re-justify in the comment.**
- SESSION #per-priority-commit-vs-thematic-batching: P1 (merge refactor) and P3 (impulse bump) shared code path. Committed together as one atom with both priority labels in message; P2 + P4 separate. **Lesson: per-priority commits is a hygiene guideline, not a hard rule — when two priorities share a code path tightly, commit as thematic atom with labels in the message body.**

## 2026-05-11 — Session 12 of 10+ (effectsRenderer Per-Kind Split)
- S12 #per-kind-split-when-charter-breached-via-monolith: § XV breach on a file scheduled for additive growth (Phase 2 effect kinds) is refactor-along-the-additive-axis-NOW. Per-kind seam means new kinds plug in as new files. **Lesson: if a file is on the charter cliff AND will grow further, refactor along the growth axis before the growth lands.**
- S12 #dead-code-audit-before-code-motion: Grok #2 challenge → grep `combos.ts visualEffectId` vs 13 drawBondCommit cases pre-move. Zero deletions, but audit proves moved code is all live. **Lesson: refactoring is the right time to grep for unreachable code. Audit cheap; negative result is a positive — every byte moved is byte still used.**
- S12 #pure-fn-drawers-with-age-not-tick-state: Gemini flagged Graphics ownership + world.tick state risks. Resolution by design: parent owns Graphics (calls `g.clear()` once), drawers receive `(g, effect, age:number)` as pure-fn params. **Lesson: parameterize extracted drawers by time-derived value (age, t), not time source (world.tick). Class owns time; drawers own geometry.**
- SESSION #council-r1-vs-handoff-endorsement: Handoff endorsed per-kind split; Council R1 still surfaced 7 implementation-detail concerns I had not anticipated. Adopted 6 of 7. **Lesson: handoff endorsement is "WHAT"; Council R1 is "HOW done well." Don't skip Council even when handoff is direct.**
