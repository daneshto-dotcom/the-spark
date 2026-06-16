# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-16 | Session: S91

## Next Steps
1. ⭐ **PLAYTEST on https://spark-online.space/** — the live verification the harness CANNOT drive (Pixi multiplayer/input). S91 shipped **G2-PROMO Phase 1**:
   - **Anchor (Dot→Square)** + **Spindle (Line→Circle)** are now magic combos — build each: does the silhouette read (Anchor = shaft + crossbar stock + flukes; Spindle = a spun lens), does the "NEW COMBO!" toast fire, does "Combos N/14" tick up, and does the magic income premium feel worth building?
   - **PACING (the #1 thing to judge):** the win-score rebalance (`PHASE_1_WIN_SCORE` 210→630, `SCORE_TIER_STEP` 70→210) holds *combo-builder* matches ~constant (~157s) but makes a **pure non-combo/blob match ~3× longer (≈10.5 min)**. If that feels bad, the **damped-premium fallback** is logged (keep WIN 210 + a `+0.05` per-promoted-bond term — its own PDR).
   - **S90/S89 carry (still un-playtested):** Filament income feel (knob `FILAMENT_INCOME_COMPLEXITY`) · Diamond/Lattice anti-sabotage (knob `DEFENSIVE_SEVER_CHARGE_COST`) · Vortex pull · joiner smoothness · structure self-heal.
2. **G2-PROMO Phase 2 (separate PDR):** Anchor anti-drift (`stiffnessMultiplier` lift, ordered after `computeTerritorialInfluence`) + anti-sabotage (extend `isDefensiveCombo` to Anchor) + Spindle tangential `applyVortexPull` clone (~0.4× accel, all determinism guards). Spec captured in the PDR APPROACH §3.5.
3. **G2-TRAITS (deferred, gated):** rule-based family stiffness — needs a `LOCKED_DECISIONS §6` lock-amendment + watch territorial `stiffnessMultiplier` stacking.
4. **G1b MOTION (deferred):** Wheel/Star rotation — build only once it earns a mechanical verb (both reviewers rated pure rotation low-value).
5. **DEFENSE-v2 + G4 juice:** Voltkin-bolt/bomb absorb-first-hit + resist clang · **BOND_COMMIT commit-pop flair for Anchor/Spindle** (they currently use the default ring creation-pop; the persistent silhouette IS distinct — only the one-shot pop is generic — flagged by the S91 CHECK test-net lens).
6. **Optional hygiene (both LOW, S91 CHECK):** decouple `session15.test.ts:348` loop from `PHASE_1_WIN_SCORE` (now 630 dispatches); rename `MAGIC_12_KEYS`→`MAGIC_COMBO_KEYS` (now maps 14).
7. **DISCUSS (deferred, user-confirmed):** combinatorial DEPTH 6^6 ≈ 46k — `memory/combinatorial-depth-discussion.md`.

## Blockers
None. S91 shipped 3 commits (feature 1cd7e3b · session-state 59df666 · post-CHECK doc cleanup 7fa2017 = tip), all pushed. tsc 0, vitest 1433/1433, bundle 548.3 KiB < 550, **E2E 2-browser GREEN on tip (37 passed / 1 intentional skip / 0 fail)**. Transient `.claude/session-state.json.lockdir*` dirs + a stray root file `0` may linger — ignore.

## Pending Backlog
- [ ] PLAYTEST S91 (Anchor/Spindle feel + the rebalanced pacing) + S90/S89 carry (Filament · Diamond/Lattice · Vortex · joiner smoothness · self-heal)
- [ ] TIER-1 G2 Phase 2: Anchor/Spindle behaviors (own PDR) · G2-TRAITS (§6 lock-amend)
- [ ] TIER-1 G1b MOTION: Wheel/Star rotation (deferred until it earns a mechanical verb)
- [ ] DEFENSE-v2 (Voltkin/bomb absorb + resist clang) · BOND_COMMIT commit-pop flair for Anchor/Spindle (G4 juice)
- [ ] TIER-1 G3b: Codex marks used combos; undiscovered render as silhouettes
- [ ] DISCUSS: combinatorial depth 6^6 ≈ 46k — memory/combinatorial-depth-discussion.md
- [ ] TIER-3 (after Tier-1): host-migration D1–D4 · S73 colour-shift · periodic-scoreboard knob

## Recent Reflexion (last 2 sessions)
**S91** — G2-PROMO Phase 1 (Anchor/Spindle → magic, visual-only) + Option A rebalance. #recover-an-orphaned-workflow-from-its-journal-dont-rerun · #a-relative-test-still-breaks-on-a-fixed-iteration-budget · #verify-the-serialization-SHAPE-not-just-the-no-bump-claim · #passing-green-gates-still-warrant-the-doc-drift-sweep · #a-doc-sweep-can-MANUFACTURE-a-false-claim.
**S90** — G1b ECONOMY Filament + DEFENSE Diamond/Lattice. #the-cue-already-half-existed · #a-special-combo-breaks-the-generic-combo-test · #derive-the-gate-from-the-cost-fn · #the-armor-cue-fought-three-geometry-tests · #refute-first-CHECK-needs-supervisor-triage · #the-final-audit-earned-its-keep-on-the-test-NET · #ship-doesnt-mean-skip-the-doc-drift-sweep.
