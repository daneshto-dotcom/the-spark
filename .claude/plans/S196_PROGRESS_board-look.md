# S196 PROGRESS — board-look (backlog #13)

## NEXT STEP
Live run driver `.tmp-gates/boardlook.mjs <label> <bots> <win> [teams]` (gitignored) against own vite on port 30734
(`npx vite --port 30734 --strictPort`). Run duo2 (1 bot) in flight → read `.tmp-gates/boardlook/duo2/log.txt` +
evidence.json; then quad4 (3 bots), team (teams [0,0,1,1]). Copy PNGs to C:\Users\onesh\OneDrive\Desktop\SPARK_S196_MatchBoard\.

## Notes
- Port 30734 = the playwright.config FNV hash of this worktree path.
- MatchBoard instance captured by patching MatchBoard.prototype.render via `import('/src/render/matchBoard.ts')` in the page (same vite module the lazy host loads).
- Sim was ~10-21 ticks/s at full res; driver now drops renderer resolution to 0.25 during play (`app.renderer.resize(1920,1080,0.25)`) → ~50 ticks/s, back to 1 at POSTGAME before screenshots.
- Code read: portraits = main.ts:1428 → goblinRenderer.portraitTexture(type, ROW race) / voltkin. Suspect: a KILLED `raceUnit` line resolves with the ROW's race (victim race unknown — kills keyed by type only).

## Log
- 28837ff8 progress file
