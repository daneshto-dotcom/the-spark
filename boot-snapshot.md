# Boot Snapshot (auto-generated at S28 close)
Generated: 2026-05-14 | Session closed: S28 → next: S29 | Last commit: a2f5b8e (S28 P0 Voltkin Phase 2D polish — Standard-tier Council, **Phase 2 FINALE**)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay includes `=== CREATURES ===` section)

## Status

**VOLTKIN PHASE 2 SHIPPED** — S25 (entity scaffold) + S26 (Verlet physics + locomotion) + S26 (AI + attack + ARC_FLASH + cascade DELETION) + S28 (procedural animation transforms + lightning-crackle audio + NetSnapshot v2 1v1 mirror + tick-deterministic spawn refactor). End-to-end user delivery: cinematic intro → creature spawns + scale-pulses → SEEKING with idle bob → ATTACKING with ease-in yellow tint wind-up → fire-tick white flash + scale punch + cyan ARC_FLASH lightning + audible crackle → recovery → ~7 bonds severed at 1/sec → DESPAWNING with shrink-and-fade. Both solo and 1v1 client paths supported (NetSnapshot v2 mirrors host's creatures to client renderer).

Plans archived to `.claude/plans-archive/` as `2026-05-14_*_S28close_PHASE2_FINALE.md`.

## Next Steps (S29+ — Phase 3 candidates)

1. **S29 P0 candidate — Anvil creature**: apply proven Voltkin Phase 2 architecture (FSM + Verlet body + AI + attack + NetSnapshot v2 mirror) to second godly. Per-type CreatureConfig table comes online here (Gemini Q2 minority position carry-forward from S26+S27+S28). Likely Standard-tier ~25K based on S27+S28 budgets.

2. **S29 alt — Pac-Predator creature**: different AI behavior (pursue player vs attack structures).

3. **S29 alt — Bond UX RMB-drag multi-target**: long-standing S23 P2 carry-forward; smaller scope.

4. **S29 alt — P3 NET enhancements**: client prediction, delta NetSnapshot, host migration, live cursor. Larger scope, likely Full-tier.

5. **Lower priority backlog**: bond-hover cost preview (P7), OGG compression (P9), PannerNode + auto-duck audio polish.

## Blockers
- None for S29. Phase 2 finale closed cleanly.

## Manual Smoke (AC11 ready)
- Build SQ4-TR4 chain in solo at `?debug=1`. Observe:
  - Cinematic plays (Phase 1, unchanged since S22).
  - Chain stays intact post-cinematic (S27 cascade-DELETION).
  - `=== CREATURES === C0: type=voltkin state=SPAWNING` for 1s with sprite scale-pulsing 1.0→1.15→1.0.
  - State → SEEKING; creature drifts toward nearest bond midpoint with subtle 2 Hz bob (5% scale wobble).
  - At ~180 px range: state → ATTACKING.
  - During ATTACKING ticks 0-29: sprite tints from white → yellow with ease-in `t²` curve (slow start, accelerating).
  - At tick 30: tint reverts to white + sprite scales to 1.20× for the fire moment + ARC_FLASH cyan lightning arc + audible `lightning-crackle.ogg` zap audio + target bond severs.
  - Ticks 31-59: scale lerps smoothly back from 1.20 to 1.0; tint stays neutral white.
  - State → SEEKING + finds next nearest bond. Loop ~7 times across 8s active window.
  - State → DESPAWNING: scale shrinks from 1.0 to 0.8 over 0.5s + alpha fades 1.0→0.0 in same window.
  - Creature gone at tick 480.
- Verify: lightning-crackle.ogg audibly plays on each bond severance (M key toggles SFX mute).
- 1v1: brother retest (7+ session carry, NOW unblocked with NetSnapshot v2). Client should see the creature mirror.

## Pending Backlog
- [ ] Anvil + Pac-Predator (S29+ using proven Phase 2 architecture)
- [ ] 1v1 CONNECT brother retest (7+ session carry, S28 NetSnapshot v2 unblocks)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred since S23 P2)
- [ ] Per-type CreatureConfig table (S29+ when Anvil ships — Gemini Q2 carry-forward S26+S27+S28)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D/E/A/G)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 REJECTED documentational — creatures are 8s ephemeral; low-priority)

## Recent Reflexion (last 2 sessions)

### 2026-05-14 — Session 28 (P0 Voltkin Phase 2D polish — Standard-tier Council CODE-EXECUTION; Phase 2 FINALE)
- S28 #a-0-state-discovery-should-enumerate-assets-not-just-code: Biggest A.0 delta wasn't in code — it was in `assets-source/godly-voltkin/`. 5 character sprites archived as off-model-v1; lightning-crackle.ogg existed but undeployed. Probes for "where does X live?" should grep both `src/` AND `assets-source/` + `public/`.
- S28 #council-q-compromise-game-feel-at-equal-loc-cost: Q3 Gemini-B ease-in `t²` over Grok+Claude-A linear at equal 1-LOC cost. "Simplicity" defense moot when costs are equal.
- S28 #trimmed-wire-shape-when-consumer-is-render-only: Q4 trimmed 36 B over full 80 B mirror. Render-only consumer doesn't need AI fields.
- S28 #cross-council-unanimous-check-finding-now-3x-observed: 2 cross-Council UNANIMOUS CHECK findings (C1/G1 + C2/G4). Third observation total — codify as auto-accept signal.
- S28 #gemini-check-redesign-self-contradiction-now-3x-observed: G2 array-queue contradicts same-Gemini Q2 R1 vote. Third consecutive session pattern. Reject with R1 cite, no debate.
- S28 #wall-clock-state-mutation-refactor-pays-prime-audit-dividend: Wall-clock setTimeout → tick-deterministic flag refactor caught Δ4 round + Δ5 abort clear BEFORE landing. PRIME-AUDIT scrutinizes state-mutation seams.

### 2026-05-14 — Session 27 (P0 Voltkin Phase 2C AI + attack — Standard-tier Council CODE-EXECUTION)
- S27 #council-unanimous-overrules-claude-default-when-future-state-architecture-cleaner: Q1 UNANIMOUS B over Claude default A — post-migration architecture wins over past-codebase-consistency.
- S27 #council-q-compromise-tunable-constant-defers-the-fight-cheaply: Q2 VOLTKIN_ATTACK_FIRE_TICK=30 as named constant. Numeric-magnitude Q-disagreements → always named constants.
- S27 #state-discovery-probe-finds-blueprint-vs-actual-deltas-before-impl: Blueprint "5-8 cascade tests" was empirically zero. Every blueprint claim touching EXISTING files needs A.0 probe.
- S27 #check-triumvirate-relitigation-of-r1-design-must-reject-with-cite: Gemini G1 CHECK contradicted same-Gemini Q1 R1 vote (2nd observation of pattern, S26 had Q7+G2). REJECT with R1 cite.
- S27 #cross-council-unanimous-check-finding-multi-creature-determinism: Grok C4 + Gemini G5 independent same-fix on ARC_FLASH determinism. UNANIMOUS cross-Council CHECK = highest-confidence accept.
- S27 #boundary-off-by-one-check-catches-what-prime-audit-missed: Δ4 `<` should have been `<=`. Integer-boundary checks at X-1 / X / X+1 are highest-yield CHECK targets.
