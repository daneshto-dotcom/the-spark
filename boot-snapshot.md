# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-12 | Session: S123 (worker default-on prereqs + bot-intelligence design — 4/4 shipped)

## Next Steps
1. **OWNER (blocks the flip):** weak-device playtest of spark-online.space/?worker=1 — the ONLY remaining default-on gate (S123 closed VS-BOTS worker support, networked-duel e2e, GC audit).
2. **OWNER:** answer `BOT_INTELLIGENCE_DESIGN.md` §7 (Q1 tier matrix · Q2 raid cap · Q3 reclaim verb · Q4 VOLTKIN chase · Q5 phasing · Q6 starvation · Q7 collateral) → then Bot-intelligence **Phase A** PDR (knowledge book + combo-aware pick/placement + raid, Standard tier, no new FSM).
3. **OWNER:** pick ONE deploy path (Actions auto vs manual gh-pages — both ran S122; dual-writer race pending).
4. **Worker default-on flip** (after playtest passes): remove the flag gate + add fallback-latency/message-queue-depth telemetry (GEMINI S123 risk).
5. **Host-migration D4:** zombie demotion, claim-timeout, simultaneous-claim demotion, POSTGAME/WIN, LOCKED amendments, PROTOCOL bump, reconnect reconciliation + lastRoster lifecycle (+ pause-and-buffer during the migration window — GEMINI S123).
6. **B2 phase (c)** collision-grid 64→8 hoist (still open, now worker-side); **F9** INTENT token-bucket; **F10** render-side heap probe (worker side CLOSED by S123 P3).

## Blockers
- **Owner weak-device `?worker=1` playtest** — gates default-on.
- **Owner answers to `BOT_INTELLIGENCE_DESIGN.md` §7** — gates bot-intelligence Phase A.
- **Owner deploy-path decision** (Actions vs manual — both alive since S121/S122).

## Pending Backlog
BACKLOG.md uses the STATUS-banner format (no `- [ ]` checkboxes) — updated this session to STATUS S123. Front of line: owner playtest/answers → worker default-on flip → host-mig D4 → bot-intelligence Phase A → B2 phase (c). The B2 WORKER-SIM ARC is dev-complete (a✅S119 · b✅closed-S120 · c open · d✅S122 · **default-on prereqs✅S123**); host-mig D1✅S115 D2✅S118 D3✅S122 (D4 open).

## Recent Reflexion (last 2 sessions)

## 2026-07-12 — Session 123: worker default-on prereqs + owner bot-intelligence amendment, 4/4 shipped. P1 VS-BOTS worker support fresh-from-seed (9f48d50) · P2 networked worker-duel e2e cross-mode (a8e073a) · P3 dual-isolate GC audit no-leak (c0eca11) · P4 BOT_INTELLIGENCE_DESIGN.md (3ba5cf3). tsc 0, vitest 1884/1884, bundle 635.5/750.

- S123-P1 #verify-the-gates-mechanism-before-trusting-consensus: BOTH Council seats voted bit-exact serialization on the same claim that "(A) breaks the differential gate" — collapsed on a 10-line read (gate is fresh-vs-fresh, not a handoff). Consensus from a shared unverified premise ≈ 1 seat; read the test before the vote.
- S123-P2 #probe-the-pipeline-before-blaming-the-new-layer: worker-duel red (joiner sparks=0) was e2e-environment starvation (fps-capped sim × 0.15/s spawn = 1 spark/18s), NOT the wire — host+joiner were in perfect lockstep. Measure the substrate rate first; sibling specs' spawn-seam convention was the fix.
- S123-P3 #a-suspicious-pass-is-a-finding: the v1 heap audit "passed" at −39MB growth = instrument indictment (unsettled floor + wrong isolate). Record the actuals a threshold consumes; probe what the platform DOES expose (Chromium /json/list lists worker targets → 25-line raw-CDP read).
- S123-P4 #fix-degeneracy-by-sequencing-not-by-knobs: sacrifice-thrash + raid-dogpile both dissolved under sequencing constraints (in-hand-only sacrifice; pure-function designated raider) instead of tuned cooldowns/quotas. Make the bad interleaving unrepresentable, don't damp it.

## 2026-07-11 — Session 122: 4/4 shipped + live. P1 worker cutover (?worker=1, measured-first) 82ea2c3 · P2 hostmig D3 (kill-host e2e green first run, 3 real peers) 5f53b3a · P3 pulse cap 999e530 · P4 live. vitest 1882/1882.

- S122-P1 #cross-check-oracle-catches-your-own-layer: order integrity checks to validate EXACTLY the layer under test before deliberate divergences re-enter.
- S122-P1 #measure-first-changed-the-design: the pre-registered ROI rule + contingency ladder made escalation mechanical — the positions-buffer format came FROM the measurement.
- S122-P2 #suppress-competing-recovery-paths: serialize recovery protocols sharing a transport; never let timers interleave.
- S122 #both-deploy-paths-ran: dual-writer deploys converged harmlessly once; surface the owner decision until one is retired.
- S122 #feed-platform-constraints-into-council-prompts: PLATFORM CONSTRAINTS block in R1 prompts — APPLIED S123, worked (zero SAB bets this session).
