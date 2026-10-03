# S195 ART tree — progress (3-player team backdrop prompt sheet)

NEXT STEP: visual check of the Desktop HTML in the browser pane (copy button, checkbox persistence, mobile width), then final report.

## Log
- Worktree created at .claude/worktrees/s195-art on s195/art from master a06b538a.
- Read R195-T2 (3v1: solo NW; trio NE+SE+SW, walls removed; v1 uses each player's own 4p art; this sheet is the optional later art) and S192 2v2 sheet.
- MEASURED: board 1920x1080 (constants.ts:95-96) = 16:9; 4p quadrants 960x540 each, clock order 0=NW 1=NE 2=SE 3=SW (zoneBackgroundRenderer.ts:308-320); quarry (960,540) r125, cut r127; footer 84px (y 996+); 4p castles (130,130)(1790,130)(1790,950)(130,950); 4p art shipped 480x270, masters 1376x768 16:9; owner 2v2 jpgs 784x1168, mean max-ch 27-49.
- FINDINGS for wiring tree: arrangeTeamSeats fixes seat 0 (host) -> conflicts with R195-T2 'solo always NW' when host is in the trio; backdrop sprites are 0.55 alpha so a whole-board team image must have NW erased in the bake or it bleeds through the solo's art; NE/SW border the solo, SE (elbow) borders only teammates -> canonical race-order seating has a gameplay effect.
- 204eb2d7: generated .claude/plans/S195_TEAM3_BACKDROP_PROMPTS.md/.html (56 cards, all verified to name NE/SE/SW + NW px rule) via .claude/plans/s195-team3-gen/gen_team3.py; Desktop copy byte-identical at C:\Users\onesh\OneDrive\Desktop\SPARK_Team3_Backdrop_Prompts.html.
