# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-11 | Session: S122 (worker cutover + hostmig D3 + pulse cap + deploy — 4/4 SHIPPED + LIVE)

## Next Steps
1. **Owner playtest `?worker=1`** on a weak device — spark-online.space/?worker=1 (the "Player One lags" fix, live opt-in). Default-ON decision gates on this + the S123 items below.
2. **Worker default-on prereqs (S123 candidates):** VS-BOTS worker support (botManager reconstruction in INIT) · networked worker-host duel e2e (@quarantine-flaky) · 10k-frame GC-creep audit of the positions-buffer loop (GEMINI ANALYZE risk) · overlay abort-vs-fade pop under lag (M3, cosmetic).
3. **Host-migration D4:** zombie demotion, claim-timeout next-successor, simultaneous-claim demotion, POSTGAME/WIN interplay, LOCKED amendments (§13.7/§13.20/epoch), PROTOCOL_VERSION bump at default-on, reconnect-vs-migration reconciliation + lastRoster/teardown lifecycle (GEMINI M3 note).
4. **F9** INTENT token-bucket (before public matchmaking); **F10** Pixi-leak long-match heap probe (UNVERIFIED).
5. **Gated Tier-1 (owner design):** G1b MOTION verb; G2 family traits.

## Blockers
- **OWNER DECISION (2 sessions running):** GitHub Actions are ALIVE (master-push deploy succeeded S121 + S122). BOTH deploy paths ran and converged in S122 — dual-writer race waiting to diverge. Pick ONE: restore Actions-mode Pages + retire `npm run deploy`, or disable the workflow.
- **S123 PDR template addition (ANALYZE-adopted):** feed a PLATFORM CONSTRAINTS block (GH Pages = no COOP/COEP → no SAB; bundle charter; worker availability) into Council R1 prompts — both seats bet on SAB blind in S122.

## Pending Backlog
BACKLOG.md uses a STATUS-banner format (no `- [ ]` checkboxes). Front of line per the S120 banner + S122 close: worker default-on track → host-mig D4 → F9/F10. The B2 WORKER-SIM ARC IS COMPLETE (a✅S119 b✅closed-S120 c✅S120 d✅S122); host-mig D1✅S115 D2✅S118 D3✅S122.

## Recent Reflexion (last 2 sessions)

## 2026-07-11 — Session 122: 4/4 shipped + live. P1 worker cutover (?worker=1, measured-first — ROI rule FAILED honestly → positions-buffer format; differential HARD gate; hash oracle caught its first real bug = the author's own ordering mistake) 82ea2c3. P2 hostmig D3 (kill-host e2e green FIRST RUN, 3 real peers) 5f53b3a. P3 pulse cap 999e530. P4 live. vitest 1882/1882.

- S122-P1 #cross-check-oracle-catches-your-own-layer: order integrity checks to validate EXACTLY the layer under test (apply), before deliberate divergences (prediction/UX) re-enter.
- S122-P1 #measure-first-changed-the-design: the pre-registered ROI rule + contingency ladder made the escalation mechanical — the positions-buffer format came FROM the measurement, not deliberation.
- S122-P2 #suppress-competing-recovery-paths: reconnect-cycling and migration grace COMPETE for the transport; serialize recovery protocols explicitly, never let timers interleave.
- S122 #both-deploy-paths-ran: dual-writer deploy paths converged harmlessly once; surface the owner decision every close until one is retired.
- S122 #feed-platform-constraints-into-council-prompts: both Council seats bet on SAB without knowing GH Pages can't set COOP/COEP; add a PLATFORM CONSTRAINTS block to R1 prompts (S123 template).

## 2026-07-10 — Session 121: B3 symbiotic batch (4 priorities, all live) — telegraph 1ba7cdc, income keystone c77a817, deploy, codex coherence 87cdc35.

- S121-P1 #telegraph-cross-peer-by-derivation: recompute ephemeral host quantities from synced inputs render-side; never sync the derived value.
- S121-P2 #income-keystone-replay-self-consistent-not-byte-identical: check whether replay tests are self-consistency vs golden BEFORE assuming a scoring change needs fixture regen.
- S121 #council-plan-value-check-value-refute: 10th #empirical-refutes-plausible-criticals — verify determinism criticals against language semantics + the passing suite before conceding.
- S121-P4 #copy-budgets-beat-fit-guards: kill text-overflow at authoring time with tested char budgets; fitText is only the net.
- S121-P4 #placeholder-art-is-a-liability: prefer procedural representations derived from game truth over borrowed art; encode coherence as a test.
