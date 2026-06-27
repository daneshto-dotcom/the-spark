# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-27 | Session: S110

## Next Steps
1. **🚨 OWNER ACTION — unblock the deploy.** ALL of S110 is committed/pushed to `master` (tsc 0, vitest 1710/1710, build under cap) but the GitHub Actions deploy is BLOCKED (private-repo Actions spending-limit cap → `startup_failure`/0 jobs). spark-online.space STILL SERVES S109. Fix: GitHub → Settings → Billing & plans → Actions → raise the spending limit (or wait for monthly reset, or make the repo public). It deploys on the next push once unblocked. Verify with `gh run list` (want a green "Deploy to GitHub Pages").
2. **Owner playtest S110 once live** — dials to confirm: in-world Voltkin sprite scale (`VOLTKIN_SPRITE_BASE_SCALE=0.17`), Helga walk speed (`PRINCESS_MOVE_ACCEL=150`) + leash (`PRINCESS_SLAP_RANGE=380`), win-points pace (1500).
3. **Batch C — now front of the line.** New "5 circles + dot" lightning-drone building → suicide drones → self-destruct after 3. Needs its OWN PDR + 3-way Council + the 9 owner design Qs answered first. PROTOCOL_VERSION 12→13. Plan: `.claude/plans/2026-06-26_PLAN_S108_Batch_C_Lightning_Drone_Building.md`.
4. **Carry-forward: Helga Veo walk-cycle** — first-pass P5 kept in-world Helga procedural (she walks); a proper imagen/Veo walk-cycle for her matted art is deferred until reference-conditioning works in this auth.
5. After C: resume ROADMAP — Tier-1 G-series (G1b motion / G2 family traits / G3b silhouettes / G4 crown+BOND_COMMIT), then Tier-3 host-migration.

## Blockers
- **Deploy** blocked on owner billing action (GitHub Actions spending-limit cap) — code is safe on master; deploys on next push once the limit is raised.
- **Batch C** blocked on its own PDR + 3-way Council + 9 owner design Qs.
- Owner-gated (unchanged): anti-coast structure-loss CLAWBACK (own PDR); worker-sim `?worker=1` cutover (WORKER_SIM_FOUNDATION.md).
- (Optional follow-up) gate the heavy `e2e.yml` to not run on every push so Actions minutes last — own small PDR.

## Pending Backlog
- [ ] Batch C — lightning-drone building (own PDR + Council + 9 design Qs; v12→13) — FRONT OF LINE
- [ ] Helga Veo/multi-pose walk-cycle (P5 carry-forward; once veo conditioning works)
- [ ] Optional: e2e.yml run-less-often (CI minutes prevention)
- [ ] ROADMAP Tier-1 G-series + Tier-3 host-migration (resume after C)

## Recent Reflexion (last 2 sessions)
## 2026-06-27 — Session 110: Shipped a 5-priority owner-playtest batch (P1 win 786→1500, P2 uniform speed 12, P3 codex avatar visible, P4 Batch B Helga walk v12→13, P5 Batch D matted Voltkin/Helga art). tsc 0, vitest 1710/1710, build under cap. 🚨 DEPLOY BLOCKED on a private-repo Actions spending-limit cap (startup_failure/0 jobs) — S110 not live; owner billing action needed.
- #commit-and-push-is-not-the-same-as-deployed: `gh run list` at close caught all S110 deploys at startup_failure/0 jobs. Root cause = private-repo Actions minutes cap (the ~35min/push Playwright e2e), NOT code. 'Done' = DEPLOYED; a 0-job startup_failure surviving a manual dispatch = billing, not a code fix.
- #engage-the-pdr-lock-WHEN-you-present-not-after: glue_pdr_unlock mints unlock_source=user only when a lock file + an in_progress priority exist at the approval prompt; engage the lock WHEN presenting the PDR. A multi-priority batch must be ONE in_progress entry (S109 PLAN-A pattern).
- #border-connected-component-matte-beats-luma-key: matte white-bg imagen stills by removing ONLY border-connected white (scipy label) → preserves interior whites, no box (the S106 failure mode). Verify via a dark-bg preview before wiring; public/ assets are unbundled.

## 2026-06-26 — Session 109: Executed S108 Batch A (4/4 shipped + deployed, PROTOCOL_VERSION 12 held) — codex Esc/toggle, 10s spark TTL despawn, poop rework, Helga anti-cross-map-laser interim (range→380). vitest 1702/1702. Then Batch D art SPIKE (6 candidates, owner-pick pending).
- #host-only-field-needs-no-wire-bump-when-the-serializer-is-a-whitelist: read the serializer before assuming a new field forces a protocol bump (serializeCreature is a field whitelist).
- #the-unlock-hook-vocabulary-vs-the-final-gate-vocabulary: reconcile priority_state to 'in_progress' after the hook mints unlock_source:user (the load-bearing field).
