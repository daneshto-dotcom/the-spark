═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-10-02 | Live: 77e2a00 (deploy #23, verify-deploy 4/4) | PROTOCOL 62
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════
## QUICK SUMMARY
S193 shipped 7 deploys (#17–#23): units-ai, zombies + every-blast falloff, CI health + relays, endgame pants waves, visuals-2,
an 8-branch train (magic resistance, bot personalities, goblin auto-build, visuals-4/5, carry fixes, end stats, weld repair jobs +
FIX ALL), and the owner's live playtest fixes (uniform castle keep-out, nearest enemy first). Teams, visuals-3, mres-card carried.
## WHAT TO DO NEXT (priority order)
1. Read SPARK_CANON.md + .claude/plans/S194_BACKLOG.md (§A = 8 worktrees with their priorities) + S194_OWNER_QUEUED.md.
2. Open the 8 trees per §A: T1 teams (lands LAST) · T2 visuals-3 combined re-bench · T3 mres-card audit + art · T4 visuals-6
   (aura rework, V28, hub arc) · T5 UI/UX upgrade of every clickable surface + home screen · T6 "Anthropic tax" entropy research ·
   T7 bots tune · T8 small fixes. Hand every agent .claude/plans/S193_AGENT_RULES.md.
3. Each: build → ONE independent audit (trial-merge vs CURRENT master, ≤3 concurrent) → fix-only round → merge one at a time with
   typecheck + full vitest between → bump (six sites) → fresh-server e2e (run DETACHED) → push → verify-deploy (commit logs after).
4. §B owner questions in ONE plain-words HTML on his Desktop, each with a recommendation.
## ACTIVE PLAN
→ .claude/plans/2026-10-01_S193_BATCH_PDR.md (IN-PROGRESS) · .claude/plans/S194_BACKLOG.md (start here)
## CARRY-FORWARD
s192/teams · s193/visuals-racial · s193/mres-card (worktrees + progress files)
## FULL HANDOFF → HANDOFF_S193_2026-10-02.md
## PRE-FLIGHT
- boot-snapshot.md ## Muscle memory · traces ~/.claude/traces/2026-10-02/The-Spark.jsonl
- git clean on master · 3 worktrees under .claude/worktrees/ · preserved-branches.json lists them + pm-*
- ⛔ Pitch Masters (src/arcade/**, pm-* branches) is OFF-LIMITS · gcp-vertex Imagen 404 (owner infra)
## SESSION RULES
⛔ Nothing merges without an auditor that did not write it · merge one branch at a time, gates after each
⛔ Exit codes from a captured $? · a bump = SIX sites · git fetch/push under `timeout` · long gates via nohup
⛔ Python file writes: encoding='utf-8', newline='' · never re-ask an answered question
⛔ The merge owner only routes/merges/bumps/gates — work runs in worktree agents (owner order)
═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
