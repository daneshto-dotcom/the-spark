# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-20 | Session: S125 (host-migration v2 zombie auto-rejoin + F9 INTENT token-bucket, 2/2 shipped + live)

## Next Steps
1. OWNER: weak-device playtest of spark-online.space/?worker=1 — still the ONLY worker default-on gate.
2. OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 (Q1–Q7) → unlocks bot-intelligence Phase A PDR (Standard, no new FSM).
3. OWNER: pick ONE deploy path — Actions auto-deploy is the ACTING DEFAULT (every master push ships; S125 deploy run 29699637227 SUCCESS) vs manual `npm run deploy`. Decide + kill the other.
4. Worker default-on flip (after playtest): remove flag gate + fallback-latency/queue-depth telemetry.
5. Bot-intelligence Phase A (after §7): knowledge book + combo-aware pick/placement + raid w/ 1-raider cap.
6. Gated/optional: G1b MOTION verb · G2 family traits (playtest/owner-design) · F9 movement/action QoS split IF telemetry (world.diagnostics.intentThrottled) shows action-drops · bit-exact bot serialization (YAGNI).

## Blockers
- All three top items are OWNER decisions (playtest / §7 answers / deploy path). No technical blockers.
- Known-delta (v1-accepted, documented §13.21): asymmetric-partition rogue-solo-host — a survivor partitioned ONLY from the host can self-promote and host alone, unfollowed (victim-only impact). Orthogonal to v2 rejoin.

## Pending Backlog
- Worker default-on flip (owner playtest gate)
- Bot-intelligence Phases A/B/C (owner §7 answers)
- Deploy-path decision (owner: Actions auto vs manual gh-pages)
- G1b MOTION · G2 traits (playtest/owner-design gated) · F9 QoS split (telemetry-gated)
- Bit-exact bot serialization (YAGNI unless replay/spectator ships)

## Recent Reflexion (last 2 sessions)
- S125-P1 #reuse-a-shipped-proven-path-beats-new-migration-machinery: Council high-sev criticals on the zombie-rejoin all dissolved once it was seen as a REUSE of the shipped/e2e-proven S82 reconnect path — the deposed host is a seat-0 (warrant-excluded) peer re-running connectAsClient, so correctness reduces to two existing tested invariants. The freeze-thaw e2e passed first run because the mechanism was 90% shipped code. Re-pointing a wired path collapses the review surface to the seam.
- S125-P2 #size-the-guard-to-the-measured-legit-ceiling: the proportionate F9 fix was to SIZE one bucket above the measured worst legit burst (avatar-pos 10Hz-throttled → ~38 « 90), not build a two-bucket QoS subsystem. Measure the legit ceiling first; reach for structure only when the number says the simple guard can't hold.
- S125-CLOSE #bind-completion-claims-with-verification-not-just-prose: the close initially hard-failed MCV because verification[] bindings were omitted (claims were all TRUE — a process miss, not fabrication). At completion ALWAYS author verification[] binding each modified watch-root + representative files; a rich prose check_method can mask a missing binding.
- S124-P1 #triage-external-criticals-against-the-exact-arithmetic: re-derive a failing interleaving's numbers against the shipped lines yourself; external severity labels carry zero evidential weight (two D4 CRITs died on exact arithmetic, one was fabricated).
- S124-P2 #probe-the-backlog-against-git-before-planning: roadmap prose drifts; git+code never do — state-probe every priority candidate before it enters a PDR.
- S124-P3 #census-decoupling-beats-heap-noise: instrument a subsystem's OWN object population, not just bytes — leaks show as census growth decoupled from entity counts.
