# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-Session-15) | Session: 15 of 10+ — S14 § XV charter extraction + Phase-2 1v1 networked play (Trystero/Nostr)

## Next Steps
1. **User playtest the post-S15 build** — Vite at localhost:31183 (already running per S14 close; restart with `npx vite --port 31183 --strictPort` if killed). Verification path for the new 1v1 multiplayer:
   - **Title screen**: page load → "SPARK" + "1 Player" / "1v1 (2 Player)" buttons.
   - **Solo mode (back-compat)**: click "1 Player" → identical post-S14 gameplay (avatar pulse, multi-endpoint bonding, all 36 combos).
   - **1v1 host path**: click "1v1 (2 Player)" → lobby → click "Host New Room" → 6-char alphanumeric code displayed (no 0/O/1/I) → share code with friend.
   - **1v1 join path**: from friend's machine (or second browser tab on different network), click "1v1" → lobby → type code → "Connect" → handshake completes → "Begin Match" enables on host.
   - **In-game**: P1 (red) places primitive → P2 (blue) sees it within ~RTT/2 + 100ms (snapshot delay + lerp window) → P2 hits SPACE → END_TURN flips → P2's turn now → loop. Turn indicator badge top-center; per-player score readouts top-left (RED / BLUE vs 50).
   - **Win**: first to PHASE_1_WIN_SCORE=50 → WIN banner in winner's color → POSTGAME → click/R returns to TITLE.
   - **Connection lost**: kill one peer's tab → other peer sees full-screen "CONNECTION LOST" overlay → "Return to Title" button.
2. **Known v1 limitations** (documented in LOCKED § 13.7):
   - AttractDrag on P2 (client) lags ~RTT/2 — physics is host-authoritative; client renders interpolated snapshots only.
   - No host-migration; transient disconnects end the session (S16 may add stub if playtest shows annoyance).
   - Tab-hidden host pauses sim; clients see stale snapshots until tab refocused.
   - Save format break: pre-S15 saves load but lose per-player score / gameMode state (solo defaults applied).
3. **Tune feel constants if needed** (post-playtest):
   - `NET_SNAPSHOT_HZ` (10) — raise to 15-20 if remote motion feels choppy at typical RTT; halves bandwidth headroom.
   - `NET_INTERPOLATION_MS` (100) — match the snapshot interval; raising adds smoothness at the cost of perceived lag.
   - Carry-overs from S14: `AVATAR_PULSE_HZ` (1.2), `REDUNDANT_BOND_K` (3), `REDUNDANT_BOND_MIN_ANGLE_RAD` (25°). Carry-overs from S13: `STRUCTURE_GROW_IMPULSE`, `MERGE_IMPULSE_MAGNITUDE`, `MERGE_REACH_RADIUS`, `SCORE_TIER_*`.
4. **CHARTER (S15 P2 PRIME-AUDIT carry-forward)**: `world.ts` grew 228 → 357 LOC (+129) — over the 280 LOC trip-wire from PDR. Recommended S16 small priority: extract S15 new dispatch handlers (`START_GAME`, `END_TURN`, `RETURN_TO_TITLE`, `UPDATE_AVATAR_POS`) + `addScore` helper to `src/state/gameMode.ts`. ~80 LOC moved; brings world.ts back to ~280 LOC. Same Micro pattern as S14 P2.0 / S15 P1.
5. **S16 carry-forward optional**: client-side AttractDrag prediction + reconciliation buffer (~150 LOC, Grok R1 ask); delta-encoded NetSnapshot for bandwidth (Council R1 nice-to-have); host-migration stub if disconnects feel intrusive (Grok R2 ask); live cursor-move sync for remote avatar (~50 LOC).
6. **Audio integration** when Suno didgeridoo trance track lands (deferred since S5).

## Blockers
**User playtest** of the post-S15 build — top S16 gate. Hosts the validation of: 1v1 connection establishment cross-network; turn flow with SPACE; per-player scoring + WIN attribution; "Connection lost" overlay UX; solo regression intact. **Friend in different country** needed for the cross-network test (or two devices on different networks).

## Pending Backlog
- [ ] Session 16+ — S15 P2 PRIME-AUDIT carry-forward (world.ts → gameMode.ts extraction); S15 client-side prediction + delta encoding + host-migration stub (per playtest signal); Phase-2 Tier-1+ disruption suite (Sever-as-disruption / Inject Spiral / Steal / Multi-color rendering / Mega-combos per `docs/phase-2-design-options.md`); Audio (Suno track upload); any post-S15-playtest re-tuning of `NET_SNAPSHOT_HZ`, `NET_INTERPOLATION_MS`.

## Git
Branch: `master`. Origin: `https://github.com/daneshto-dotcom/the-spark.git`. All S15 commits pushed.
- (S15 closeout commit at end of P3)
- add497f — S15 P2: networked 1v1 multiplayer MVP (Trystero/Nostr WebRTC, host-authoritative 10Hz NetSnapshot + lerp + per-direction seq, title + lobby, solo preserved)
- b9c4b20 — S15 P1: extract pickRedundantBondTargets + angularDistance from controls.ts to src/input/redundantBondTargets.ts
- 8daafc6 — [state-autocommit] S14
- 1764900 — S14 /handoff: archive copy of root HANDOFF to .handoff-archive/
- 8d08e58 — S14 /handoff: state churn (1 line)
- b8a236f — [state-autocommit] S14
- f430710 — S14: session-state — P3 completed + active_pdr -> archive
- 05c5d72 — S14 P3: closeout — BACKLOG + reflexion + boot snapshot + PDR archive + HANDOFF
- ab40447 — S14 P2.1: multi-endpoint redundant bonding (K=3, 25° spread, no-score)
- 9bb784e — S14 P2.0: extract placePrimitive from world.ts to src/state/placePrimitive.ts
- 0ccb3fe — S14 P1: avatar disambiguation — anti-phase outer/inner alpha pulse

## Recent Reflexion (last 2 sessions)
## 2026-05-12 — Session 15 of 10+ (S14 Charter Extraction + Phase-2 1v1 Networked Play)
- S15 #user-amendment-mid-session-as-2nd-council-cycle: User amended scope twice in-session (original "Hotseat + Fog Tier-0" → "drop fog + add lobby same-machine hotseat" → "friend in different country, networked"). Each amendment fired its own deliberation cycle: R1 on original; R1 amend on hotseat+lobby (carry-forward applied); R1+R2 on networked. **Lesson: user amendments are LEGITIMATE PDR-cycle re-entry points, not papering-over. The pipeline (draft → Council → PRIME-AUDIT → user gate) re-runs cleanly per amendment; carry-forward findings from prior rounds compose with new ones.**
- S15 #locked-decision-amendment-via-user-authority: User authorized breaking LOCKED § 1 ("Phase-3 net: Colyseus or Geckos.io later") for Phase-2 1v1 ("friend in different country"). Amendment documented in same session (LOCKED § 1 row split into Phase-2 net + Phase-3 net + new § 13 Networked Play v1). **Lesson: LOCKED_DECISIONS sections are USER-AUTHORITY-amendable not implementation-frozen. When user authorizes amendment, document it in the same session (don't defer the doc update) so future sessions don't act on stale lock.**
- S15 #council-r2-converges-disagreements-not-restarts: R1 returned REVISE/REVISE with Trystero vs PeerJS as the major disagreement. R2 closed cleanly: Grok conceded Trystero on Gemini's specific counter (multi-strategy fallback + PeerJS-broker-is-only-for-signaling distinction). Host-migration split persisted (Gemini won "Connection lost overlay"; Grok mandatory stub deferred to S16). **Lesson: R2 is a CONVERGENCE round, not a fresh deliberation. Frame R2 prompts as "defend or concede your R1 stance against the other member's counter" — the AI peers act symmetrically (each gets the other's R1) and the disagreement either resolves via concrete data or persists with documented carry-forward.**
- S15 #test-contract-as-implementation-surface: addScore helper initially broke 3 tests (session10 SCORE_TIER, session13 SCORE_TIER, gameState.test.ts indirectly) because they directly mutate `world.scoreProgress` as part of their fixture setup. First fix attempt (reset scoreProgress = scoreByPlayer.get(playerId)) preserved 1v1 semantics but broke solo. Resolution: branch on `gameMode` — solo path stays ADDITIVE (`world.scoreProgress += delta`; test contract preserved); 1v1 path uses max-of-scoreByPlayer (winner attribution semantics). **Lesson: existing test contracts are PART of the implementation surface, not external to it. New features must preserve them (additive new path while keeping old path identical) OR explicitly amend the tests with rationale. Don't treat tests as collateral damage of a refactor.**
- SESSION #trip-wire-as-judgment-signal-not-hard-gate: world.ts at 357 LOC vs 280 trip-wire in PDR. Decision: ship + log carry-forward (S16 extraction), not split. Rationale: ~80 LOC of growth is documentation/comments (new fields + actions are well-documented); splitting would require two more commits to half-finish integration; the work is coherent + complete + tested. **Lesson: trip-wires from the PDR are SIGNALS for "stop and reconsider," not hard gates. When the over-trip is mostly documentation and the integration is at a clean stopping point, ship + log > fragment. When the over-trip is genuine logic creep, split.**

## 2026-05-12 — Session 14 of 10+ (Avatar Disambiguation + Multi-Endpoint Redundant Bonding)
- S14 #council-led-restructuring-as-prerequisite: Both Grok #7 and Gemini § 7.1 independently flagged "refactor first, feature second" for world.ts charter compliance. Restructured P2 → P2.0 (mechanical extract; world.ts 587→228 LOC) + P2.1 (feature in new file). **Lesson: when two Council members independently flag a sequencing issue, that's high-signal AGAINST deferring instinct. Restructure-before-feature.**
- S14 #no-score-for-redundancy-clean-frame: Council G5/G8 challenged the scoring-of-redundancy-bonds + threshold-bump combo. Adopted: zero score for redundancy bonds, keep PHASE_1_WIN_SCORE=50. **Lesson: one concern per feature; one knob per concern. Threshold bumps that compensate for feature additions indicate the feature is doing too much.**
- S14 #pure-function-extraction-for-class-method-testability: `pickRedundantBondTargets` extracted as top-level pure function so 10 unit tests cover the geometric algorithm without Pixi/DOM mock. **Lesson: when a class method has nontrivial geometry/math, extract as a pure function taking a parameter struct. Test surface grows; class method becomes a 5-line wrapper.**
- S14 #verify-council-claim-with-source-not-narrative: Grok G4 used force-domain Σk framing on a Verlet position-domain solver. Verified bonds.ts:58 (extension-only break) + clamp ratio; rejected the framing while adopting the test mitigation. **Lesson: verify which solver model Council is reasoning in before adopting OR rejecting — force-domain vs position-domain produce wildly different safety analyses.**
- SESSION #prime-audit-as-revision-gate-not-decoration: PRIME-AUDIT caught 3 material findings (save/load test, BOND_COMMIT visualEffectId explicit assertion, anchor-place S10 regression check). **Lesson: PRIME-AUDIT is the last revision-gate where "did I miss anything" produces concrete diffs. Empty PRIME-AUDIT = rubber-stamp, not run.**
