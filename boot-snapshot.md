# Boot Snapshot (auto-generated at S27 close)
Generated: 2026-05-14 | Session closed: S27 → next: S28 | Last commit: ea4b459 (S27 P0 Voltkin Phase 2C AI + attack — Standard-tier Council)

## Live URL
**https://spark-online.space/** (HTTPS, cert exp 2026-08-10 auto-renew)
**https://spark-online.space/?debug=1** (debug overlay includes `=== CREATURES ===` section with state + targetPos + targetBondId post-S27)

## Next Steps
1. **S28 P0** — Voltkin Phase 2D animation + 1v1 sync + polish (Standard-tier, ~20-25K). Read `.claude/plans/voltkin_phase2_blueprint_v1.md` § "S28 acceptance criteria" FIRST. Implement: (a) Imagen side-session for 14-frame spritesheet (128×128 each, 4 idle + 4 walk + 4 attack + 2 despawn); (b) `AnimationController` class (~50 LOC, reusable for Anvil/PacPredator); (c) `AnimatedSprite` swap in creatureRenderer.ts (frame selection via `state + ticksInState`); (d) NetSnapshot v2 schema extension `creatures: []` (~36 bytes/creature × max 2 = ~72 B per snapshot); (e) 1v1 net sync verified (host runs FSM, client renders mirror only — fixes RALPH Δ8 visual regression from S27); (f) spawn scale-pulse `1.0 → 1.15 → 1.0` over SPAWNING window; (g) despawn power-down (last 2 frames + alpha-fade 1.0 → 0.0 over CREATURE_FADE_TICKS); (h) procedural Web Audio zap synth (~50 LOC) on BOND_SEVERED cause='creature' (S27 Δ6 carry-forward); (i) ATTACKING wind-up frames 0-29 + zap-frame 30 + recovery 31-59 (S27 Δ7 carry-forward); (j) wall-clock-state-mutation → tick-deterministic pending-spawn flag refactor (S25/S26 carry). Bundle target +4 KB code + 14 KB asset → 479.87 KB / 500 KB (~20 KB margin). Council Standard-tier 1 round + Battle Ledger + PRIME-AUDIT + CHECK Triumvirate.
2. **AC11 manual smoke (S27 substantially upgraded)** — open https://spark-online.space/?debug=1, build SQ-SQ-SQ-SQ-TR-TR-TR-TR chain, observe: (a) cinematic plays as before, (b) chain STAYS INTACT post-cinematic (cascade DELETED), (c) `=== CREATURES === C0: type=voltkin state=SPAWNING` for 1s, (d) state → SEEKING + creature drifts toward nearest bond midpoint, (e) at ~180 px range state → ATTACKING for 60 ticks, (f) at tick 30 of ATTACKING: ARC_FLASH visible lightning arc from creature → bond + bond severs, (g) state → SEEKING + finds next nearest bond, (h) loop ~7 times across 8s active window, (i) state → DESPAWNING + alpha-fade, (j) creature gone at tick 480. Visual: bright cyan jittered polyline per attack.
3. **S28 P1 (or later)** — 1v1 CONNECT brother retest (7-session carry, unblocked, manual playthrough only — NetSnapshot v2 in S28 fixes the visual regression where client sees bonds vanish without creature/ARC_FLASH).
4. **S29+** — Anvil + Pac-Predator creature types using the proven Phase 2 architecture (per-type CreatureConfig table — S26 Δ6 + S27 carry-forward from Gemini Q2 minority position).

## Blockers
- None for S28 start. Read blueprint § "S28 acceptance criteria" first.

## Manual Smoke Carry-Forward (AC11 substantially upgraded by S27)
- Pre-S27: cascade fired instantly; static creature drifted aimlessly for 8s (no AI).
- Post-S27: chain stays intact; creature seeks → attacks → severs bond-by-bond with visible ARC_FLASH per zap over 8s.
- S28 will add: walking-frame animation + scale-pulse on spawn + procedural zap audio + 1v1 client mirror.

## Pending Backlog
- [ ] S28 Voltkin Phase 2 finale (1 session remaining; blueprint LOCKED + APPROVED + S25 + S26 + S27 all DONE)
- [ ] 1v1 CONNECT brother retest (7-session carry, unblocked; pairs naturally with S28 NetSnapshot v2 verification)
- [ ] RALPH Δ8 1v1 client visual regression (S27 CHECK carry-forward — resolved by S28 NetSnapshot v2)
- [ ] Bond UX: RMB-drag multi-target for polygon frames (deferred since S23 P2)
- [ ] Per-type CreatureConfig table (S29+ when Anvil ships — Gemini Q2 carry-forward, reinforced by S27)
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

### 2026-05-14 — Session 27 (P0 Voltkin Phase 2C AI + attack — Standard-tier Council CODE-EXECUTION)
- S27 #council-unanimous-overrules-claude-default-when-future-state-architecture-cleaner: Q1 R1 UNANIMOUS B (extend SEVER_BOND.cause + re-dispatch) overruled Claude default A (inline mirror). Council saw POST-migration codebase (GODLY_TRIGGER cascade DELETED → only one severance path) and chose for that future state. Past-codebase-consistency is weak signal when past code is about to be deleted.
- S27 #council-q-compromise-tunable-constant-defers-the-fight-cheaply: Q2 Grok-A vs Gemini-B split → VOLTKIN_ATTACK_FIRE_TICK=30 as NAMED TUNABLE CONSTANT. S28 retunes single-LOC. Numeric-magnitude Q-disagreements should ALWAYS become named constants, never inlined magic numbers.
- S27 #state-discovery-probe-finds-blueprint-vs-actual-deltas-before-impl: Blueprint claimed "5-8 cascade tests to remove"; A.0 grep found ZERO. Revised PDR scope at gate-time. Every blueprint claim touching EXISTING files needs a State-Discovery probe BEFORE PDR scope locks.
- S27 #check-triumvirate-relitigation-of-r1-design-must-reject-with-cite: Gemini G1 CHECK contradicted same-Gemini Q1 R1 vote (re-dispatch pattern). This is 2nd observation of pattern (S26 had Gemini Q7+G2). Systematic — CHECK pass is stateless, lacks R1 deliberation context. Reject with R1 cite.
- S27 #cross-council-unanimous-check-finding-multi-creature-determinism: Grok C4 + Gemini G5 independently surfaced ARC_FLASH same-tick visual duplication. UNANIMOUS cross-Council CHECK findings = highest-confidence accepts. arcSeed(tick, sx, sy) folded origin into seed.
- S27 #boundary-off-by-one-check-catches-what-prime-audit-missed: Δ4 wind-up abort `<` should have been `<=` at exact FIRE_TICK boundary. R1 + PRIME-AUDIT + RALPH missed it; CHECK Gemini G3 caught. Integer-boundary checks in diff are highest-yield CHECK targets — always probe X-1 / X / X+1.

### 2026-05-14 — Session 26 (P0 Voltkin Phase 2B physics + locomotion — Standard-tier Council CODE-EXECUTION)
- S26 #cross-resolve-delta-better-than-two-separate-mitigations: Δ4 single rule (ZERO_ACCEL when state !== SEEKING) cross-resolves BOTH R1 Q7 concerns. Pattern: when 2 R1s flag related-but-different failure modes around state-machine transitions, look for the single rule that gates BOTH.
- S26 #council-q-compromise-better-than-either-2of3-option: Q4 compromise (combined public + 3 exported per-behavior helpers) gets Gemini's testability + Grok's simple API at ~0 LOC cost. When 2/3 Council split is about surface area, expose MORE not less.
- S26 #prime-audit-explicit-carry-forward-vs-silent-drop: Δ6 (S29 config-table) + Δ7 (S28 NetSnapshot serialization) made minority Council positions explicit carry-forward rather than silently dropped.
- S26 #check-triumvirate-zero-fixes-is-a-signal-not-a-failure: S26 CHECK found 0 actionable changes (vs S25's 3). Positive quality signal when R1 + PRIME-AUDIT do their job well; don't manufacture fixes to justify CHECK pass.
- S26 #same-model-r1-vs-check-contradiction-r1-deeper-deliberation-wins: Gemini R1 Q7 contradicted Gemini CHECK G2 from the SAME model. R1 deeper deliberation wins — CHECK should find IMPLEMENTATION bugs, not relitigate DESIGN.
- S26 #grok-api-timeout-retry-with-condensed-prompt: Grok timeout at 120s with 6KB prompt; retry with ~4KB condensed prompt succeeded. ≤5KB rule of thumb per Council R1 model. Retry once before falling back to 2-way.
