# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-24 | Session: S99

## Next Steps
1. **User playtest feedback on the S99 + S98 deploy (live at spark-online.space).**
   - **S99 P1 NONET spirits:** the 3 shared-mask spirits (kami/owl-a/moss-b) now show FULL outlines + wings with a warm backing glow (was: faded into the bg). FEEL CHECK: do they read naturally? Glow too strong/weak?
   - **S99 P2 Voltkin-on-delete:** build a structure then DELETE bonds down to a CLEAN isolated line of 4 squares then 4 triangles (endpoints degree-1, middles degree-2, NO leftover stubs/junctions) → Voltkin now fires. (Bomb/creature severs intentionally don't trigger it. `?debug=1` shows how close the chain is via findLongestVoltkinPartial.)
   - **S98:** combo order-symmetry (reverse-order pairs now make magic; Codex shows `↔`) + Connection Preview (drag a primitive → pulsating preview of the bond(s) before release).
2. **Tower-defense combos (next major feature) — REMIND the user to share the plan, then build.** See `memory/spark-tower-defense-combos-next-feature.md`.
3. **(playtest-gated) S98 P2 combo micro-rebalance** — only if casual matches feel too fast post-symmetry: raise `PHASE_1_WIN_SCORE` + `SCORE_TIER_STEP` in lockstep (keep `/3`). Win-score shipped unchanged (the optimal-build anchor is provably untouched).
4. **(optional)** Voltkin UX: surface the strict isolated-chain requirement to players (tooltip / findLongestVoltkinPartial outside ?debug=1) — Council suggestion. NONET glow strength tuning. de-flake WebRTC-in-CI; deploy.yml `needs:[e2e]`; combinatorial-depth 6^6; G4 build-feel juice.

## Blockers
- Tower-defense feature: needs the user's exact plan/vision.
- S98 P2 micro-rebalance: gated on the user's playtest "feels too fast?" call.
- Relaxing the Voltkin topology to "any 4S+4T blob" is a SEPARATE design decision (reopens the S48 5-blob false-positive) — only if the user explicitly wants it.
- STEP-0 review gate reads a CROSS-PROJECT session (S166) — documented infra quirk, advisory until 2026-07-15 then BLOCKS.

## Pending Backlog (Tier-1, open)
- G1b MOTION (Wheel/Star rotation, Capsule glow-trail) — S90 Council DEFERRED (low player-value without a mechanical verb).
- G2 TRAITS (rule-based family traits for the 22 placeholders) — gated (needs LOCKED §6 amend).
- G2-PROMO behaviors (Anchor anti-drift / Spindle pull) — deferred Phase-2 PDR.
- G4 build-feel juice (bond-formation burst, pooped-reject cue, in-world leader crown).
- (DONE S99: NONET sprite visibility + Voltkin-on-delete. DONE S98: combo order-symmetry + Connection Preview. DONE S97: G3b Combo Codex.)

## Recent Reflexion (last 2 sessions)
- **S99**: NONET sprite fade = a mask peaking at alpha 231 (not 255) + an 81px blur eating the whole subject → fix in the mask GENERATOR (plateau-clamp for a flat-255 core + soft rim), sweep params empirically (too-high plateau = 100% opaque hard rectangle), keep owl-b's bespoke flame-cropping mask untouched. Voltkin-on-delete = the godly matcher only ran on BOND_FORMED, never on sever → also act on PLAYER-caused BOND_SEVERED (cause-filter excludes bomb/creature; existing loop+break already prevents double-fire); keep the strict topology gate; an event-driven matcher must listen to ALL topology mutations.
- **S98**: CI-flake quarantine is a CLASS not a named list — verify on a REAL run; job-level `continue-on-error` is the real email-stopper. Order-symmetry = mirror the TABLE + canonicalize discovery by resultName, NOT sort the key; additive change leaves the optimal-build anchor provably unchanged → no win-score inflation. Preview==release by reusing the reducer's OWN pure pickers + an equivalence test; keep it purely additive vs refactoring a critical (now under-tested) path.
