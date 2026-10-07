# S196 PROGRESS — board-look (backlog #13)

## NEXT STEP
e2e:gating running on port 30734 (own vite) → `.tmp-gates/e2e.exit` / `e2e.log`. Then final report at top of this file.
Gates so far (merged master 06ba8ae9, docs-only): typecheck 0 · vitest 1 = 9219 passed / 1 failed (endgameAudit MED-1 REACH,
"Test timed out in 20000ms" under 3 browsers + vitest load; alone → 0, 18/18 — timeout-only, benign) · build 0, entry 1235.5 KiB (+0.0).
Screenshots DONE → C:\Users\onesh\OneDrive\Desktop\SPARK_S196_MatchBoard\.

## FIX 1 (271a6cf5 + tests) — SCORE RACE line-end labels overlapped (live team4 run 1: "BOT 3" over "BOT 4", ends 4 px apart)
`spreadLabelBottoms` (matchBoardLayout.ts, pure, total order y→index, LINE_LABEL_GAP 16 = measured label height) used in
`drawChart` 'lines'. Tests `matchBoardLineLabels.test.ts` 7: arithmetic ×4, REACH ×2 through real MatchBoard.render, NEGATIVE
(clear labels unmoved). Mutation (drawn y back to the raw line end) → 2 RED, restored. Board suites 29 files / 540 passed.

## Findings so far
- duo2 (1 bot, REAL points win at wave 2, bar 300), quad4 (3 bots, real win wave 3), team4 ([0,0,1,1], real team win
  wave 3): portraits DRAW on every seat page — icon sprites carry real atlas textures (`unit-nagas-atlas.png`,
  `t3-nagas-piranha-atlas.png`, `unit-vampires-atlas.png`, scarab/hound sheets; 200×200 idle frames); a zoomed crop shows
  the art. Every fitted text 0 over its box, measured=true on every fit. 0 page errors.
- ⚠ MINE candidate: a KILLED `raceUnit` ("CASTLE UNIT") on a seat's page draws THAT seat's race portrait though the
  victims were another race (kills keyed by CreatureType only; raised+killed merge in one line). Data limitation, not a
  draw defect — fixing needs a victim-race key on the wire → recommend to owner.

## Notes
- Port 30734 = the playwright.config FNV hash of this worktree path.
- MatchBoard instance captured by patching MatchBoard.prototype.render via `import('/src/render/matchBoard.ts')` in the page (same vite module the lazy host loads).
- Sim was ~10-21 ticks/s at full res; driver now drops renderer resolution to 0.25 during play (`app.renderer.resize(1920,1080,0.25)`) → ~50 ticks/s, back to 1 at POSTGAME before screenshots.
- Code read: portraits = main.ts:1428 → goblinRenderer.portraitTexture(type, ROW race) / voltkin. Suspect: a KILLED `raceUnit` line resolves with the ROW's race (victim race unknown — kills keyed by type only).

## Log
- 28837ff8 progress file
