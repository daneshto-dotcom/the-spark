# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-19 | Session: S124 (host-migration D4 production-ON batch, 3/3 shipped + live)

## Next Steps
1. OWNER: weak-device playtest of spark-online.space/?worker=1 — still the ONLY worker default-on gate. NOTE: the live site now runs S124/PROTOCOL 15 (D4 migration live); stale tabs get the refresh prompt.
2. OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 (Q1–Q7) → unlocks bot-intelligence Phase A PDR (knowledge book + combo-aware pick/placement + raid; Standard, no new FSM).
3. OWNER: pick ONE deploy path — Actions auto-deploy is the ACTING DEFAULT (verified S124: every master push ships to production, runs 29662201361/29682517245 SUCCESS) vs manual `npm run deploy`. Decide + kill the other.
4. Worker default-on flip (after playtest): remove flag gate + fallback-latency/queue-depth telemetry.
5. Hostmig v2 (owner-optional): zombie auto-rejoin-as-client (epoch demotion path); the v1 terminal-overlay behavior is LOCKED §13.21.
6. F9 INTENT token-bucket (owner-gated, before public matchmaking) · G1b MOTION verb · G2 family traits.

## Blockers
- All three top items are OWNER decisions (playtest / §7 answers / deploy path). No technical blockers.
- Known-delta (v1-accepted, documented): asymmetric-partition rogue solo host — a survivor partitioned ONLY from the host can self-promote and host alone, unfollowed (victim-only impact, converges on its own overlay).

## Pending Backlog
- Worker default-on flip (owner playtest gate)
- Bot-intelligence Phases A/B/C (owner §7 answers)
- Host-mig v2 zombie auto-rejoin (owner-optional)
- F9 INTENT token-bucket (owner-gated) · G1b MOTION · G2 traits (playtest-gated)
- Bit-exact bot serialization (YAGNI unless replay/spectator ships)

## Recent Reflexion (last 2 sessions)
- S124-P1 #triage-external-criticals-against-the-exact-arithmetic: the only real CHECK CRIT (post-sign yield window) was found by checking WHERE the await yields; two others died on exact arithmetic (rival fires the SAME epoch → different, safe code path) and one was fabricated. Re-derive interleaving numbers yourself against shipped lines; external severity labels carry zero evidential weight.
- S124-P2 #probe-the-backlog-against-git-before-planning: B2(c) was listed as open work; a 2-minute grep found it shipped 4 sessions earlier. Roadmap prose drifts; git+code never do. State-probe every priority candidate before it enters a PDR (2nd instance — a pattern).
- S124-P3 #census-decoupling-beats-heap-noise: heap deltas can't distinguish leaks from organic growth; the display-object census made the verdict decisive (leaks = census decoupled from entity counts). Instrument the subsystem's OWN object population, not just bytes.
- S123-P1 #verify-the-gates-mechanism-before-trusting-consensus: 2-seat consensus is ~1 seat when arguments share a load-bearing unverified premise; read your own test before the vote.
- S123-P2 #probe-the-pipeline-before-blaming-the-new-layer: measure the substrate's rate first; sibling tests encode prior fights with the same environment.
- S123-P3 #a-suspicious-pass-is-a-finding: record the actuals a threshold consumes; a too-good pass indicts the instrument.
- S123-P4 #fix-degeneracy-by-sequencing-not-by-knobs: make bad interleavings unrepresentable instead of damping them with tuned state.
