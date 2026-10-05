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

## IN FLIGHT (wave 1, opened 06:30 UTC 2026-10-05, each on `.claude/worktrees/s195-<tree>` in the cloud container)
- `s195/rules-2` — T25 + B-9 chewer attacks the keep · B-10 drone splash = one pool 30 split · B-32 corpse-eater loop · B-31 welded TV keeps summoning (+ new welded TV mints) · B-25/B-30 every blast spares own side (enumerated) · N11 smarter chasing. BUMP expected YES.
- `s195/fixes` — T22: draftOverlay sheen clock pin · botFix timeout measured · worker-heap CDP metric (10 MB untouched) · B-17 per-seat `lostToEntropy` counter in matchStats (board row = later tree) · B-18/19 bots learn entropy by level+personality · PLACE-refused re-measure · settings-toggles race-music flake (product path + poll) · §E F2 pixel-read framing. No bump expected.
- `s195/coherence-2` — T19: B-7 Helga death cue (additive-optional) · shared departure rule (chewer + goblin corpse) · chewer stun-star scale · SILENT sound slots (unit-death, stink fire, castle gun, entropy boing owner-only) · N4 Helga-heard-by-two-seats verify · stink ramp wiring behind manifest · refused-placement REACH · B-3 repaired sparkle · B-1 pin · §E F1 render-leak measurement.
- `s195/ui-4` — T18 + N5: mechanical clickable→press enumeration + wiring · census REACH tests · R81 hover-grow inside hit rect (⚠ MINE) · hover-highlight proposal only.
- `s195/nonet-home` — T13 research report `S195_NONET_HOME_OPTIONS.md`, nothing built.
- Wave 2 (opens as wave-1 trees land): `s195/controls-macros` (N6) · `s195/info-ui` (N7 + N12 UI + N14 board polish + the entropy board row) · `s195/net-mp` (T20).

## NOT DONE / FOR THE DESKTOP SESSION
_(filled at close)_
