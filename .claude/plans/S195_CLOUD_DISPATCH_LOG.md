# S195 CLOUD DISPATCH LOG — continuation run on Claude Code cloud, 2026-10-05

**For the desktop merge owner on Saturday: READ THIS FIRST.** The owner opened this run while his desktop S195 session
was paused on the weekly limit (R195-0g had landed ci-perf as deploy S195-#5 `7ceae8eb`; `s195/teams` and `s195/lag`
were still in flight on the desktop and were NOT touched here — their file sets were declared off-limits in
`S195_CLOUD_AGENT_RULES.md`).

- Integration branch: **`ccr-26eaab43-fa9mg3`** (origin). It branches from master `f1ff4c6b` (the Pitch Masters
  Hebrew catch-up commit, = origin/master at 06:14 UTC 2026-10-05). Every tree that lands here is merged into it ONE AT
  A TIME with gates between, as the desktop integrator does on master. **Nothing on this run touches `master`.**
- Each landed tree is a merge commit `merge(s195/<tree>)` on the integration branch, so `git log --merges` lists them.
- Trees run here (owner's queue after ci-perf/teams/lag; see `S195_BACKLOG.md` §A and `S195_OWNER_RULINGS.md`):
  rules-2 (T25 + B-9/B-25/B-30/B-31 + N11) · fixes (T22 + B-17/B-18/B-19) · coherence-2 (T19 + N4 + sound slots) ·
  ui-4 (T18 + N5 + N14) · nonet-home (T13, report only) · then controls-macros (N6) · info-ui (N7 + N12 UI) · net-mp (T20).
- Environment caveats: Playwright runs on the container's Chromium 1194 (symlinked into the 1223 slot Playwright 1.60
  expects); no live relay network is assumed. Full e2e lanes on the desktop remain the final verdict.
- Bump verdicts are REPORTED per tree below; the bump itself (six sites + canon §6 + CLAUDE.md) is applied once on the
  integration branch by this run's merge owner before the final push, and is listed here.

## LANDED (on the integration branch)
_(none yet)_

## IN FLIGHT
_(filled as trees open)_

## NOT DONE / FOR THE DESKTOP SESSION
_(filled at close)_
