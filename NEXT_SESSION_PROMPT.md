═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-09-24 | Commit: 5c6615f (deploy #1, LIVE, verify-deploy 4/4)
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════

⛔ The BOOT-READ GATE is live: Edit/Write/Agent/Workflow stay blocked until every
required boot file is opened with the Read tool. Do the boot first.
⛔ SPARK_CANON.md §3d is STALE — it says no racial is built. ALL TWELVE level-0/5
racials are LIVE. The corrected canon is on branch s188/canon. PROTOCOL = 50.

QUICK SUMMARY
S188 shipped all twelve level-0/5 racial mechanics, the 16 upgrade cards and the
castle HP/ATK/DEF/PEN buttons — six parallel worktrees, each independently
audited, merged one at a time. Deploy #1 is live and verified. Eight branches
are carried (pushed to origin): deploy #2's fix rounds, your footer arrow fix,
THE SWARM, WRATH OF RA, the Ra beam sprite, the ATK/PEN draft picks, the canon.

WHAT TO DO NEXT
1. YOUR REPORT: "CONNECTION LOST — peer dropped" in multiplayer. First: were
   BOTH tabs reloaded onto protocol 50? If yes, hunt it as a regression.
2. Deploy #2: re-run e2e:gating on s188/deploy2-candidate (3 @visual reds seen
   under load; the re-run could not start), then merge + push + verify-deploy.
3. Audit + merge one at a time: input-layer → wrath → swarm → ra-vfx →
   draft-atk → canon. Each branch's .claude/plans/S188_PROGRESS_<name>.md says
   where it stopped.
4. Confirm two numbers: APEX PREDATOR bites ×4, THE SWARM bites ×11 (ATK×(5+PEN)).
5. SANDWORM (mummies L10 without POWER OF RA): ruled, needs your art.

ACTIVE PLAN → .claude/plans-archive/2026-09-24_2026-09-23_S188_BATCH_PDR.md
STATUS: IN-PROGRESS (P8–P11 carried)
FULL HANDOFF → HANDOFF_S188_2026-09-24.md

PRE-FLIGHT
 boot-snapshot.md incl. ## Muscle memory · traces ~/.claude/traces/2026-09-24/The-Spark.jsonl
 git status — clean on master · git branch — master + 8 s188/* branches (expected)

SESSION RULES
⛔ Read every gate's exit code from a captured $? — never a pipe, never the wrapper
⛔ Merge one branch at a time; typecheck + full suite after EVERY merge
⛔ Detect a file's EOL before patching; many src files are CRLF
═══════════════════════════════════════════════════════════
