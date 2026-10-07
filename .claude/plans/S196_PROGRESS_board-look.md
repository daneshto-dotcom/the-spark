# S196 PROGRESS — board-look (backlog #13)

## NEXT STEP
Live run driver `.tmp-gates/boardlook.mjs <label> <bots> <win> [teams]` (gitignored) against own vite on port 30734
(`npx vite --port 30734 --strictPort`). Run duo2 (1 bot) in flight → read `.tmp-gates/boardlook/duo2/log.txt` +
evidence.json; then quad4 (3 bots), team (teams [0,0,1,1]). Copy PNGs to C:\Users\onesh\OneDrive\Desktop\SPARK_S196_MatchBoard\.

## Notes
- Port 30734 = the playwright.config FNV hash of this worktree path.
- MatchBoard instance captured by patching MatchBoard.prototype.render via `import('/src/render/matchBoard.ts')` in the page (same vite module the lazy host loads).
- Sim runs ~21 ticks/s headless swiftshader → BUILD (90 s sim) ≈ 4.3 min wall.
- Code read: portraits = main.ts:1428 → goblinRenderer.portraitTexture(type, ROW race) / voltkin. Suspect: a KILLED `raceUnit` line resolves with the ROW's race (victim race unknown — kills keyed by type only).

## Log
- 28837ff8 progress file
