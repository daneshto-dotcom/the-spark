═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt (S196)
Generated: 2026-10-06 | Live: S195-#10 81dfb8d3, PROTOCOL 70
Working dir: C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark
═══════════════════════════════════════════════════════════

## QUICK SUMMARY
SPARK is the live multiplayer builder game (spark-online.space). S195 shipped ten verified deploys (PROTOCOL 66→70): the four S194 carries, ci-perf, the owner's 11-tree cloud run, graphics tiers HIGH/LOW/MINIMAL, teams (layout map, shared vision, team points), team tiles (dormant), and the network codec (27× less bandwidth per joiner).

## WHAT TO DO NEXT (priority order)
1. Verify the lag fix live: owner + brother one match with `?debug=1`, brother on Settings → Graphics → MINIMAL; read `snap rx`/`snap gap` and `net out` at waves 8–10 (expect ~0.5 Mbit/s per joiner).
2. Ask `.claude/plans/S196_BACKLOG.md` §A owner decisions IN CHAT (N20 Voltkin Blender pilot + Blender install, team-tile blend approval, six race tiles, NONET option, MINE defaults, TURN re-paste).
3. CI tree `s196/ci`: runner 15-min queue cancellation, tickClock CI starvation, nplayer:140 late-joiner, verify-deploy short-SHA (F5/F6/F8).
4. Net follow-ups: host CPU with 3+ joiners (F7), hard-blip silent-drop reproduction.
5. Art as the owner delivers it (six tiles → `public/art/race-zones/tiles/` + `TEAM_TILE_RACES`; team music `s194/team-music`; MRES/stink stills).

## ACTIVE PLAN
→ `.claude/plans/S196_BACKLOG.md` (S195 PDR archived COMPLETED)

## FULL HANDOFF DOC
→ C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark\HANDOFF_S195_2026-10-06.md

## PRE-FLIGHT CHECKLIST
- [ ] Read the handoff, boot-snapshot.md (incl. ## Muscle memory), SPARK_CANON.md, S195_OWNER_RULINGS.md
- [ ] `git status` clean; master == origin/master
- [ ] Copy S195_AGENT_RULES.md → S196_AGENT_RULES.md (new master SHA) — ⛔ every agent commits every ≤5 min
- [ ] Skim last 5 jsonl records for The-Spark (summarize — no raw dump)
- [ ] Unverified carry-forward: #10 CI per-lane colours (integrator's reading) — re-check `gh run list`

## SESSION RULES
- Parallel worktrees, one audited merge at a time, deploy every landing; re-audit every fix round
- A protocol bump is TEN sites; `verify-deploy --sha` needs the FULL sha
- Pitch Masters is off-limits
═══════════════════════════════════════════════════════════
Paste this into your next Claude session's first message.
═══════════════════════════════════════════════════════════
