# S196 RESUME POINT — read this FIRST after a usage limit (merge owner)

Written 2026-10-07 before an expected limit hit. Plan: `.claude/plans/2026-10-07_S196_BATCH_PDR.md` · rulings `S196_OWNER_RULINGS.md` · log `S196_DISPATCH_LOG.md` · state `.claude/session-state.json`.

## LIVE
- S196-#1 `7e9d241c` board-look · S196-#2 `6907fb22` net-blip (silent-drop split fix) · S196-#3 `b35368c6` tower-fx — each verify-deploy 4/4.
- ✅ S196-#4 `5055efd5` ui-5 click-offset — verify-deploy 4/4 (UI5 closed).

## TREES IN FLIGHT (each agent keeps its exact next step at the TOP of its own progress file; resume by SendMessage to the agent, or a fresh agent given its brief + progress file)
| tree | worktree | state | progress file |
|---|---|---|---|
| s196/team-art | `.claude/worktrees/s196-team-art` | building: (1) 12 single-race prompts → Desktop `SPARK_Team3_Backdrop_Prompts.html` (2) wire his Grok trio JPGs from Downloads into 3v1 (3) `TEAM_SEAM_BLEND_LEGACY_ART` ON | `.claude/plans/S196_PROGRESS_team-art.md` in the worktree |
| s196/nonet-home | `.claude/worktrees/s196-nonet-home` | fix round 3 DONE (b02157c2) → RE-AUDIT 3 running. If CLEAN: LAND — ⛔ `npx wrangler deploy` in `server/leaderboard/` BEFORE pushing master (owner approved R196-D3; login = owner signs in). No D1 migration. Then canon §9 doc. | `.claude/plans/S196_PROGRESS_nonet-home.md` in the worktree |
| s196/boss-release | `.claude/worktrees/s196-boss-release` | building race release flash + crumble rework, derived on peers | `.claude/plans/S196_PROGRESS_boss-release.md` in the worktree |
| s196/accounts-design | `.claude/worktrees/s196-accounts-design` | DESIGN only: reuse Legacy+CNC auth (read-only), cross-domain one login, payments research → `.claude/plans/S196_ACCOUNTS_DESIGN.md` + Desktop `SPARK_Accounts_Design.html` | `.claude/plans/S196_PROGRESS_accounts-design.md` in the worktree |

## QUEUE (open in order as slots free; cap FOUR trees — R196-0b)
#3 s196/ci (incl. ⚠ `endgameAudit.test.ts` MED-1 now times out even alone under load — shorten the run or give it a measured cap, never relax the assertion; F5 F6 F8, tickClock) → #4 s196/net-cpu (+ R196-N1 strongest-machine host: measure CPU + upload + ping in lobby; shared delta package when even) → #11 s196/render-perf.

## OWNER QUESTIONS OPEN (ask in chat)
- Hover-highlight (`?hover=1`, screenshots `Desktop\SPARK_S196_HoverHighlight\`): switch on?
- tower-fx look items (laser glow size; pentagram fire violet on demons) — `Desktop\SPARK_S196_TowerFx\`.
- board-look MINE (team rows grouped by team?), NONET MINE campaign numbers (after landing), ui-5 MINE (button hover-grow 4 % → tint; lobby join font at half-screen; castle BUILD grid points).

## HOUSEKEEPING
- `.claude/worktrees/audit-tower-fx` folder left on disk (git deregistered; recursive delete blocked by the guard — needs `ALLOW-DESTRUCTIVE-CONFIRMED` or the handoff prune).
- Pitch Masters note branch `notes/s196-one-login-network` (local, PM repo).
