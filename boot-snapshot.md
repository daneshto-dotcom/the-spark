# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-26 | Session: S49

## Next Steps

1. 🔴 **USER ACTION — 2-peer smoke on Sym F.** Hard-refresh https://spark-online.space/?debug=1 on both browsers after deploying S49. Verify the new territory mechanic:
   - **Sym F Hard Block:** Build a structure (3+ prims). Enemy cannot place within the territory radius (DEBUG overlay shows R for your player). Attempt should be silently blocked (spark stays carried).
   - **Sym F Engulf-warp:** Place enough enemy prims inside your territory to have a bond there. That bond should feel sluggish/limp compared to bonds outside territory (stiffnessMultiplier=0.3).
   - **Sym F SHRINK (Q):** With 1 disruption charge, press Q in 1v1 PLAYING. Enemy radius halves for 5s (debug overlay shows "shrink until tN (Xt left)" for enemy). Verify charge consumed (dot goes hollow).

2. **Sym E — score "/50" occlusion** (user-deferred S47/S48). Charge dots + godly cooldown indicator crowd the score text on RED row. Pixi Graphics bounds needed for precise layout.

3. **E2E harness stabilization (S50 recommend).** `continue-on-error: true` removed in S49 P3 — CI now blocks on E2E failures. Monitor first few deploys post-S49. If flaky, diagnose Trystero/Nostr WebRTC handshake in GH Actions networking vs test fixture. Playwright `test.fixme()` flips for Sym I (win-condition) and Sym F (territory hard-block) are next candidates.

4. **main.ts hypertrophy refactor.** main.ts is growing beyond 500 LOC charter. Extract: `stepPhysics` + `computeTerritorialInfluence` loop → `src/physics/physicsLoop.ts`; network send/recv handlers → `src/net/hostHandlers.ts` + `src/net/clientHandlers.ts`. Standard tier.

5. **vite/vitest CVE major bump.** Carry-forward from S48 boot-snapshot. `npm audit` first to assess severity.

## Blockers

None blocking. User 2-peer smoke gates S49 close.

## Pending Backlog

- [ ] Sym E score "/50" occlusion polish (user-deferred S47/S48/S49)
- [ ] E2E harness: flip test.fixme() for Sym I + Sym F + real-WebRTC paths
- [ ] main.ts hypertrophy refactor (~500+ LOC, charter = 500)
- [ ] vite/vitest CVE major bump
- [ ] Phase-2 next mechanic: Inject Spiral (D), Steal (E), Fog (A), Mega-combos (G), Anvil second-creature
- [ ] Audio polish: OGG compression for mobile (~10MB mp3 → ~2MB), PannerNode + auto-duck
- [ ] Phase-3 net (Colyseus / Geckos.io) — reserved for >2-player scalability

## Recent Reflexion (last 2 sessions)

## 2026-05-26 — Session 49 (S49 autonomous full-batch: P1 Sym F territorial repulsion NEW MECHANIC + P2 latent audits CLEAN + P3 housekeeping; 2 commits 463df39..ba54c3e + push)

- S49 #territory-base-radius-equals-auto-bond-radius-creates-geometric-Sym-D-defense-in-depth: TERRITORY_BASE_RADIUS=60 = AUTO_BOND_RADIUS=60 means territory always gates before Sym D color gate fires. Document this in LOCKED_DECISIONS.md — future constant changes (raising AUTO_BOND_RADIUS above TERRITORY_BASE_RADIUS) would weaken the invariant.

- S49 #dead-code-deletion-requires-test-audit-not-just-code-audit: Removing dead production code also means removing tests that specifically exercise those dead paths. Before deleting a branch, grep the test file for inputs that trigger it (e.g. `colorA !== colorB`) and remove those tests explicitly.

- S49 #ephemeral-per-tick-physics-annotation-pattern-for-territory-engulf-warp: Non-readonly Bond field + `?? 1.0` fallback in solveBonds = ephemeral annotation without game-state persistence. Pattern reusable for future per-tick physics overlays (damping zones, acceleration fields, collision multipliers).

- S49 #latent-audit-clean-sweep-saves-scope: Schedule latent audits BEFORE assuming fixes are needed. A clean audit saves session scope. The audioCursor.ts `lastDrainedTick` cursor was specifically designed for this — trust the existing architecture first.

- SESSION #s49-autonomous-sym-f-territorial-repulsion-shipped-783-tests-green: 2 commits 463df39..ba54c3e + push. Bundle 492.22 → 494.45 KB (+2.23 KB, 5.55 KB headroom). Tests 770 → 783 (+13 net). Context 13.05% GREEN.

## 2026-05-25 — Session 48 (S47/S48 regression triage SHIPPED autonomous overnight RALPH:HUNT mode; P1-P5 fixed all 6 confirmed bugs from S47 live smoke — Sym A/B/C/G/I + Sym E deferred; 5 commits daa750d..3c615a6 + deploy run 26416265601)

- S48 #wire-envelope-scaffolded-but-not-connected-is-now-3-instance-anti-pattern: ENDGAME envelope existed since S15 but never had send/recv sites. Pattern: when adding a new NetMessage kind to protocol.ts, verify BOTH send site AND recv-side dispatch before merging.

- S48 #per-reason-diagnostic-counters-beat-aggregate-counters-for-silent-drop-localization: Split raceRejects into named buckets (pickupPosShape, pickupSparkNotFree, pickupReachFail, placeTargetMissing). One bucket per failure mode beats one bucket per category.

- S48 #strict-spec-changes-INVERT-existing-tests-mark-them-explicitly: When a spec change inverts test expectations, REWRITE the test (renamed + new comment citing spec change + inverted assertion) rather than delete it — preserves the audit trail.
