# Boot Snapshot (auto-generated at handoff)
Generated: 2026-07-28 | Session: S126 (CI E2E gating revival via 3-lane split + ONE deploy path, 2/2 shipped + CI-validated)

## Next Steps
1. **Soak-lane CI-viability follow-up PDR** — the one concrete NEW item. Measured: the lane hit its 44m
   globalTimeout; CI reaches only ~2150–2300 of the designed ~10k ticks, so the per-ktick slope is
   noise-dominated (same test: +2249.6 / +523.2 / −308.6 KB/ktick). Options, rough preference order:
   (a) reduced CI tick budget with thresholds derived from it; (b) assert an absolute post-GC ceiling
   instead of a per-ktick slope; (c) drop `retries` for this lane (3×~7m is what burned the 44m);
   (d) keep heap audits local-only and delete the CI lane.
2. OWNER: weak-device playtest of spark-online.space/?worker=1 — still the ONLY worker default-on gate.
3. OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 (Q1–Q7) → unlocks bot-intelligence Phase A (Standard, no new FSM).
4. OWNER-GATED deploy config, IN THIS ORDER: `gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow`
   (fixes stale legacy metadata at root), verify live, THEN optionally delete `origin/gh-pages`.
5. Optional/low: move or duplicate the rAF box diagnostic to run LATE in the GATING lane, to test the
   cumulative-shared-worker hypothesis (`workers:1`). The shipped fix bypasses `stable` regardless.
6. Gated/optional: G1b MOTION verb · G2 family traits · F9 movement/action QoS split IF telemetry
   (world.diagnostics.intentThrottled) shows action-drops · bit-exact bot serialization (YAGNI).

## Blockers
- Owner decisions: `?worker=1` playtest · §7 answers · the two Pages-config follow-ups. No technical blockers.
- **The soak lane is NOT CI-viable as written** — non-gating, so it installs NO permanent red (run
  conclusion is still `success`). Treat its failure as a measurement result, not a regression.
- Known-delta (v1-accepted, LOCKED §13.21): asymmetric-partition rogue-solo-host — a survivor partitioned
  ONLY from the host can self-promote and host alone, unfollowed (victim-only impact).

## Pending Backlog
- Soak-lane CI viability (evidence-backed options above)
- Worker default-on flip (owner playtest gate)
- Bot-intelligence Phases A/B/C (owner §7 answers)
- Pages `build_type=workflow` flip + optional gh-pages deletion (owner-gated, in that order)
- rAF diagnostic re-placement (low) · G1b MOTION · G2 traits · F9 QoS split · bit-exact serialization (YAGNI)

## CRITICAL TRAPS FOR THE NEXT SESSION
- **Audit CI run CONCLUSIONS at boot, not just that a workflow exists.** A job killed by
  `timeout-minutes` concludes **`cancelled`, not `failure`** → no failure email, looks like a benign
  concurrency cancel, and the SIGKILL destroys the artifacts that would explain it. That combination hid
  a dead gating lane for 3 weekly runs behind an "OPEN ISSUES: None" handoff.
- **Do NOT trust `gh api repos/:owner/:repo/pages`.** It reports `build_type: "legacy"` +
  `source.branch: "gh-pages"`, which is STALE and NOT what serves. Trust the **deployments API** and the
  **live asset hash**. `npm run deploy` and `scripts/deploy-pages.sh` no longer exist — do not recreate
  them; see `LOCKED_DECISIONS.md §DEPLOY-PATH` for the recovery procedure if Actions ever dies.
- **`git push` on master == SHIPPING TO PRODUCTION** for any push touching src/public/index.html/
  vite.config.ts/tsconfig.json/package.json/package-lock.json/deploy.yml.
- **MCV bindings**: BACKLOG.md is diff-bound and needs an ABSOLUTE-path `verification[]` assertion on a
  **completed** priority, or the Stop hook hard-fails as the "fabrication" class even when all claims are
  true. This has now fired in BOTH S125 and S126.

## Recent Reflexion (last 2 sessions)
- S126-BOOT #audit-run-conclusions-not-just-that-the-workflow-exists: the S125 handoff's "e2e GREEN" was
  true of a LOCAL run and masked 3 weeks of dead CI. Three masking layers, all of which look like nothing
  happened. Fix pattern: set the test runner's own global timeout BELOW the job's `timeout-minutes` so the
  TOOL lands the kill (flushing artifacts, exiting non-zero) instead of the runner.
- S126-P1 #measure-the-composition-before-you-tune-the-budget: first diagnosis extrapolated a per-test
  average (25.5s/test) and proposed raising the cap 15m→25m. The full local run refuted it — 15.2m of a
  16.8m suite was 3 soak tests, and the unmeasured tail held the most expensive files. CI later confirmed
  the fast tests were never slow (1.6m, same as local). Never extrapolate a per-unit average across a
  population known to be heterogeneous, especially when the unmeasured members never got to run.
- S126-CHECK #a-dissolving-streak-is-not-a-license-to-auto-dismiss: Grok's CRITICAL proved CORRECT
  (the soak lane really wasn't CI-viable), breaking a 17-run streak of external findings dissolving.
  Discriminator: it targeted an UNMEASURED empirical unknown, while dissolving findings target mechanisms
  shipped code already determines. Triage by that distinction, not by the reviewer's track record.
- S126-P2 #read-the-thing-before-you-justify-deleting-it: the PDR's stated hazard for deleting
  deploy-pages.sh ("serves 17-day-old code") was refuted by reading it — it builds fresh. The real hazard
  is that it force-pushes gh-pages AND triggers the LEGACY builder, flipping production onto the branch
  mechanism. Right conclusion, wrong mechanism — and only the mechanism gets written down and reused.
- S125-P1 #reuse-a-shipped-proven-path-beats-new-migration-machinery: Council high-sev criticals on the
  zombie-rejoin all dissolved once it was seen as a REUSE of the shipped/e2e-proven S82 reconnect path.
- S125-CLOSE #bind-completion-claims-with-verification-not-just-prose: a rich prose check_method can mask
  a missing machine-checkable `verification[]` binding; the gate only trusts needles it can re-read.
