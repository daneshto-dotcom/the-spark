═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-09-25 | Live: 7404a49 (deploy #4, verify-deploy 4/4) | PROTOCOL 51
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════
## QUICK SUMMARY
S190 dispatched the S189 batch on parallel worktrees with independent audits and shipped two deploys: #3 (C9
footer arrow, Ra strike art, canon) and #4 (WRATH OF RA, THE SWARM, C1/C7/render, C8/C10/units, C5 perf fix,
drafted ATK/PEN, PROTOCOL 51). s189/weld and s189/net are audited but NOT merged.
## WHAT TO DO NEXT (priority order)
1. Take the owner's NEW list (written after his playtest) — read SPARK_CANON.md + .claude/plans/S190_OWNER_RULINGS.md first.
2. Deploy #5: re-audit + merge s189/weld (18769b4, bump 51→52); fix NETFR-1 (HIGH), NETFR-2, NETFR-3 on s189/net,
   audit, merge; e2e incl. reconnect-hard-blip/reconnect/exit-match/hostmigration; verify-deploy; LOOK at live.
3. C4 retry tuning (S191_BACKLOG §E); then the §A owner questions in ONE plain-words batch.
4. §B add-ons (orc rage 25 s, Alt footer toggle, magic-attack class, A1 CI fix) and §C carry-forwards.
## ACTIVE PLAN
→ .claude/plans/S191_BACKLOG.md (§FIRST = deploy #5) · S189 PDR marked IN-PROGRESS (net + weld carried)
## CARRY-FORWARD
P0 s189/net · P8 s189/weld · P10 remainder (CLAUDE.md bundle line 948.1 → measure)
## FULL HANDOFF → HANDOFF_S190_2026-09-25.md
## PRE-FLIGHT
- boot-snapshot.md ## Muscle memory · traces ~/.claude/traces/2026-09-25/The-Spark.jsonl
- git clean on master · worktrees: only s189-net and s189-weld
- ⚠ verify session-state.json's session_id in a SEPARATE call before trusting it
## SESSION RULES
⛔ Nothing merges without an auditor that did not write it · merge one branch at a time, gates after each
⛔ Exit codes from a captured $? — never a pipe · one protocol bump per deploy · no unapproved spec changes
⛔ Never re-ask an answered question (R190-A..M) · commit after EVERY step (spend limits kill agents)
═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
