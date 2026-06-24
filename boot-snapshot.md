# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-24 | Session: S98

## Next Steps
1. **User playtest feedback on the S98 deploy (live at spark-online.space).**
   - **P2 combo order-symmetry:** connect the SAME two shapes in the *reverse* order (e.g. carry a Line onto a Dot) → it now makes the magic (Filament) just like Dot→Line. Open the Combo Codex (title → COMBOS) — symmetric pairs show `↔`, the Triangle↔Circle dual shows `→` (Wheel vs Star kept distinct). FEEL CHECK: do casual matches feel too fast now? If yes → apply the held micro-rebalance (#3).
   - **P3 Connection Preview:** drag a primitive out of the spawner toward your structure — a pulsating, faded preview of the bond(s) it will form shows BEFORE you release (shows connect distance + how many connectors). On release it snaps in at full opacity in your colour. FEEL CHECK: visibility / alpha / pulse rate / does it match what actually forms?
2. **Tower-defense combos (next major feature) — REMIND the user to share the plan, then build.** See `memory/spark-tower-defense-combos-next-feature.md`.
3. **(playtest-gated) P2 micro-rebalance** — only if casual matches feel too fast: raise `PHASE_1_WIN_SCORE` + `SCORE_TIER_STEP` in lockstep keeping the `/3` invariant (scoring.test.ts:330-331). Win-score shipped UNCHANGED (630) because the optimal-build income anchor is provably untouched by the additive symmetry; this is the floor-raise safety valve only.
4. **(optional)** add `needs: [e2e]` to deploy.yml (S46 migration note — E2E still doesn't gate deploy); de-flake WebRTC-in-CI (environmental net::ERR_ADDRESS_UNREACHABLE — quarantine is the LOCKED policy); combinatorial-depth 6^6 discussion; G4 build-feel juice.

## Blockers
- Tower-defense feature: needs the user's exact plan/vision.
- P2 micro-rebalance: gated on the user's playtest "feels too fast?" call (cannot self-approve a balance change).
- STEP-0 review gate reads a CROSS-PROJECT session (S166) — documented infra quirk, advisory until 2026-07-15 then BLOCKS.

## Pending Backlog (Tier-1, open)
- G1b MOTION (Wheel/Star rotation, Capsule glow-trail) — S90 Council DEFERRED (low player-value without a mechanical verb).
- G2 TRAITS (rule-based family traits for the 22 placeholders) — gated (needs LOCKED §6 amend).
- G2-PROMO behaviors (Anchor anti-drift / Spindle pull) — deferred Phase-2 PDR.
- G4 build-feel juice (bond-formation burst, pooped-reject cue, in-world leader crown).
- (DONE S98: combo order-symmetry Option B; Connection Preview. DONE S97: G3b Combo Codex.)

## Recent Reflexion (last 2 sessions)
- **S98**: CI-flake quarantine is a CLASS not a named list — verify on a REAL run (the whole real-WebRTC suite is CI-flaky, a different subset each run); job-level `continue-on-error` is the real email-stopper. Order-symmetry = mirror the TABLE (reuse the forward outcome) + canonicalize discovery by resultName, NOT sort the key; additive change leaves the optimal-build anchor provably unchanged → no win-score inflation. Preview==release by reusing the reducer's OWN pure pickers + an equivalence test; keep it purely additive vs refactoring a critical (now under-tested) path.
- **S97**: per-asset tighter mask beats baked-darken/reshoot for a matte-edge artifact; verify Pixi features via live stage introspection (not screenshots), pump app.ticker.update() when bg-rAF-throttled; asymmetric placement is data not code; winner-only celebration is netcode-safe when gated local-vs-synced; find the REAL gate before coding the user's theory, then mirror a proven pattern.
