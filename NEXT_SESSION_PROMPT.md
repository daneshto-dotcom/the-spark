═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-10-01 | Live: d5c9c49 (deploy #5, verify-deploy 4/4) | PROTOCOL 52
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════
## QUICK SUMMARY
S191 ran the owner-approved batch on seven worktrees with independent audits and a Council, and shipped deploy #5
(weld C2 "welding no longer dissolves a tower" + DORMANT Helga, net C4/C5/C6 + per-match id, PROTOCOL 52, merged with the
Pitch Masters arcade work another session pushed). Everything else is built-or-started on branches and CARRIED.
## WHAT TO DO NEXT (priority order)
1. Take the owner's NEW list (weekend playtest bugs) — read SPARK_CANON.md + S190_OWNER_RULINGS + the S191 PDR §0 first.
2. Land the carried branches one at a time per .claude/plans/S192_BACKLOG.md §A (merge master in first — all are 83-115
   behind; then gates → audit → fix → merge → one bump per deploy → e2e → FETCH → push → verify-deploy → look at live).
3. Suggested order: perf → addons → carry → owner → tune → weld round 5 (then round 6) → net remainder + C4 → endstats.
4. S192_BACKLOG §B owner questions in ONE plain-words batch; §C carry-forwards.
## ACTIVE PLAN
→ .claude/plans/2026-09-25_S191_BATCH_PDR.md (IN-PROGRESS) · .claude/plans/S192_BACKLOG.md (start here)
## CARRY-FORWARD
P11 carry · P12 perf · P13 addons · P14 owner · P15 endstats · P16 tune · weld round 5/6 · net remainder
Audit findings: .claude/plans/S191_AUDIT_DIGEST.md · briefs: .claude/plans/S191_BRIEFS/
## FULL HANDOFF → HANDOFF_S191_2026-10-01.md
## PRE-FLIGHT
- boot-snapshot.md ## Muscle memory · traces ~/.claude/traces/2026-10-01/The-Spark.jsonl
- git clean on master · worktrees: s189-net, s189-weld, s191-{carry,perf,addons,owner,endstats,tune}
- ⚠ Pitch Masters lives on pm-* branches / F:/pm-s2-work worktrees — never touch; fetch before every push
- ⚠ verify session-state.json's session_id in a SEPARATE call before trusting it
## SESSION RULES
⛔ Nothing merges without an auditor that did not write it · merge one branch at a time, gates after each
⛔ Exit codes from a captured $? — never a pipe · one protocol bump per deploy · no unapproved spec changes
⛔ Run ONE audit workflow at a time (verify MED/HIGH only) — S191 hit the org spend limit twice with three in parallel
⛔ Never re-ask an answered question (S190 R190-A..M, S191 PDR §0) · commit after EVERY step
═══════════════════════════════════════════════════════════
