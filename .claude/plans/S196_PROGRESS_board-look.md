# S196 PROGRESS — board-look (backlog #13)

## NEXT STEP
Review quad4 + team4 PNGs (`.tmp-gates/boardlook/<label>/`), then re-run with the mouse moved off-panel before
screenshots (game cursor dot sat at 960,940), copy PNGs → C:\Users\onesh\OneDrive\Desktop\SPARK_S196_MatchBoard\ + README.txt.

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
