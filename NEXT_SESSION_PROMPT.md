═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-10-01 | Live: 10ec442 (deploy #16, verify-deploy 4/4) | PROTOCOL 56
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════
## QUICK SUMMARY
S192 landed all of S191's carries plus the owner's weekend-playtest fixes in 11 deploys (#6–#16: perf, addons, carry,
tune, Nagas song, 4-player lobby fix, Scorched Earth + stock, Voltkin re-summon, seamless audio, net, visual pilot), each
audited independently and verified live. Seven more branches are built on worktrees and carried.
## WHAT TO DO NEXT (priority order)
1. Read SPARK_CANON.md + .claude/plans/S193_BACKLOG.md + .claude/plans/S192_DISPATCH_LOG.md (agent ids, every verdict).
2. Land the carried branches ONE at a time (§A): zombies → units-ai → weld (re-audit X1/X2/L1 + SEAM-C7) → magic → endgame → endstats → teams (LAST).
   Each: merge master in → one independent audit (trial-merge vs CURRENT master) → fix-only round → merge → six-site bump if earned → gates + e2e → fetch → push → verify-deploy.
3. New worktrees: weld round 6 (FIX-by-gatherer + castle FIX ALL), goblin tower auto-build (T4), visuals-2..5, MRES draft card (wave-26 slot).
4. §B owner questions in ONE plain-words batch (zombie blast 312, endgame 9 Qs, magic Q1, chewer cap, welded Voltkin TV).
## ACTIVE PLAN
→ .claude/plans/2026-10-01_S192_BATCH_PDR.md (IN-PROGRESS) · .claude/plans/S193_BACKLOG.md (start here)
## CARRY-FORWARD
s192/zombies · s192/units-ai · s189/weld · s192/magic · s192/endgame · s191/endstats · s192/teams (worktrees + progress files)
## FULL HANDOFF → HANDOFF_S192_2026-10-01.md
## PRE-FLIGHT
- boot-snapshot.md ## Muscle memory · traces ~/.claude/traces/2026-10-01/The-Spark.jsonl
- git clean on master · 7 worktrees under .claude/worktrees/ · preserved-branches.json lists them + pm-*
- ⛔ Pitch Masters (src/arcade/**, pm-* branches, F:/pm-s2-work) is OFF-LIMITS — separate project sharing the domain
## SESSION RULES
⛔ Nothing merges without an auditor that did not write it · one audit at a time · merge one branch at a time, gates after each
⛔ Exit codes from a captured $? · a bump = SIX sites in protocol.ts · git fetch/push under `timeout`
⛔ Python file writes: always encoding='utf-8' (S192 wrote cp1252 into session-state) · never re-ask an answered question
⛔ The merge owner only routes/merges/bumps/gates — work runs in worktree agents (owner order)
═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
