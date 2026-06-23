# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-23 | Session: S97

## Next Steps
1. **Fix the E2E CI lane (stops the GitHub failure emails) — DO FIRST.** Run 28031530523: gating 30 passed / 4 failed, job CANCELLED at the 15m cap. ALL failures are real-WebRTC multiplayer tests (S62 3-player FFA, S63 4-player FFA, S82 reconnect) dying on `net::ERR_ADDRESS_UNREACHABLE` (CI sandbox can't hold P2P data channels) — NOT app logic. The "cancelled" is because the non-gating `@quarantine-flaky` suite runs in the SAME job after the gating suite + retries overrun 15m. FIX: move `@quarantine-flaky` to its own job/workflow (or raise the gating timeout) so a non-gating suite can't cancel the gating result; quarantine the 4 flaky gating WebRTC tests (established environmental flakes since S96) so the gating lane goes green. Deeper WebRTC-in-CI-sandbox flakiness is a separate hard infra problem.
2. **User playtest feedback on the S97 deploy** — P3 (NONET spirit asymmetric placement: feel?), P4 (NONET winner jackpot: solve a NONET → fireworks+gold-glow+banner+fanfare; loser sees nothing), P5 (try Voltkin AFTER NONET → should now fire). If P5 still fails it's the Voltkin recipe PREDICATE (the user's exact structure), not a lock — get their build.
3. **Combo order-symmetry** — PARKED on the user's A/B/C pick (`docs/combo-order-symmetry-PDR.md`). Recommend B+rebalance, or C as zero-risk.
4. **Tower-defense-style combos** (next major feature) — REMIND the user to share the plan; then build. See `memory/spark-tower-defense-combos-next-feature.md`.
5. (optional Tier-1) G4 build-feel juice; combinatorial-depth 6^6 discussion (deferred).

## Blockers
- Combo order-symmetry: needs the user's A/B/C design pick + (A/B) a rebalance go — cannot self-approve (LOCKED §V.1 amend).
- Tower-defense feature: needs the user's exact plan.
- E2E WebRTC flakiness is environmental (CI runner UDP/STUN) — the lane can be made green by quarantining, but the underlying P2P-in-CI limitation persists.
- STEP-0 review gate reads a CROSS-PROJECT session (S166) — documented infra quirk, advisory until 2026-07-15 then BLOCKS.

## Pending Backlog (Tier-1, open)
- G1b MOTION (Wheel/Star rotation, Capsule glow-trail) — S90 Council DEFERRED (low player-value without a mechanical verb).
- G2 TRAITS (rule-based family traits for the 22 placeholders) — gated (needs LOCKED §6 amend).
- G2-PROMO behaviors (Anchor anti-drift / Spindle pull) — deferred Phase-2 PDR.
- G4 build-feel juice (bond-formation burst, pooped-reject cue, in-world leader crown).
- (G3b Combo Codex — DONE S97 P2.)

## Recent Reflexion (last 2 sessions)
- **S97**: per-asset tighter mask beats baked-darken/reshoot for a matte-edge artifact; verify Pixi features via live stage introspection (not screenshots) + mind bg-rAF throttling (pump app.ticker.update()); asymmetric placement is data not code; winner-only celebration is netcode-safe when gated local-vs-synced; find the REAL gate before coding the user's theory, then mirror a proven pattern (godlyFiredThisMatch ← sudokuFiredThisMatch).
- **S96**: image-to-video beats procedural twitch for character life; a flagged "bug" can be a LOCKED design decision in disguise (surface a decision-ready PDR); a version bump breaks more tests than the one flagged.
