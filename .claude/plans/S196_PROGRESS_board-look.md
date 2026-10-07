# S196 PROGRESS — board-look (backlog #13)

## NEXT STEP
None — DONE. Merge owner audits + lands.

# FINAL REPORT — s196/board-look (backlog #13)
- **Tip**: this commit (`git log -1`). Master merged at 06ba8ae9 (master b7f1891d, docs-only: S196_OWNER_RULINGS.md + session-state.json; no conflicts).
- **Portrait verdict: THEY DRAW.** 6 real vs-bots matches at 1920×1080 on this worktree's own vite (port 30734), played to POSTGAME
  by MID bots (win bar 300 via `__TEST_WIN_SCORE__`; every win a REAL points win, the driver's forced-win seam never fired). Proof the
  atlases were loaded: the board's live `iconLayer` sprites carry the atlas textures themselves — `unit-nagas-atlas.png`,
  `unit-vampires-atlas.png`, `t3-nagas-piranha-atlas.png`, scarab/hound sheets, 200×200 idle frames — and the board's own portrait
  source answered non-null for EVERY unit line on EVERY seat page (castle unit, piranha, scarab, hound); 0 initial-letter chips;
  zoomed crop shows the art. 0 page errors. No fix needed.
- **Screenshots**: `C:\Users\onesh\OneDrive\Desktop\SPARK_S196_MatchBoard\` — 18 PNG + README.txt: duo2_page0..3 (2 seats),
  quad4_page0..5 (4 seats), team4_page0..5 (2v2, "TEAM 2 WINS"), ZOOM_portraits_P2_page.png, BEFORE_FIX_team4_overview_labels_overlap.png.
- **Text fit**: every fitted text measured with the real font in-browser (measured=true on all) — 0 wider than its box on all 16 pages;
  plus a bounds check: 0 texts outside the panel; pairwise overlap check found ONE defect (below), 0 after the fix.
- **FIX 1** — SCORE RACE line-end labels printed on top of each other when two lines finish level (live 2v2: 301 vs 298 → "BOT 3" over
  "BOT 4"). `spreadLabelBottoms` + `LINE_LABEL_GAP` 16 (= measured label height) in `matchBoardLayout.ts`, used in `matchBoard.ts`
  `drawChart` 'lines'. Tests `matchBoardLineLabels.test.ts` 7 (arithmetic 4 · REACH 2 through real `MatchBoard.render` · NEGATIVE: clear
  labels drawn exactly at their line end). Mutation (drawn y back to the raw line end) → 2 RED, restored.
- **Gates** (exit codes in `.tmp-gates/*.exit`): typecheck **0** · vitest `--maxWorkers=3` **1** → 9219 passed / 14 skipped / 1 failed
  (`state/endgameAudit.test.ts` MED-1 REACH, "Test timed out in 20000ms" while 3 browsers ran; alone → **0**, 18/18 — timeout-only, benign)
  · build **0**, entry **1235.5 KiB** (+0.0 — the fix lives in the lazy matchBoard chunk) · e2e:gating on 30734 **0**, 67 passed (9.8 min).
- **Bump verdict: NONE.** Render-only (label y positions in a lazy view chunk); no sim, wire, hash or action change; counters stay inert.
- **MINE (owner questions, recommendation each)**:
  1. A KILLED castle unit on a seat's page draws THAT seat's race portrait though the victims were another race (kills are counted by
     unit TYPE; one "CASTLE UNIT" line merges raised (own race) + killed (enemy races)). Rec: leave it — splitting needs a victim-race key
     in the stats payload (a wire-shape change); ask only if he notices.
  2. In a TEAM match the overview ranks individuals by score: a losing-team bot can sit 2nd above a winning-team member (team4: BOT 2,
     team 1, placed 2nd). Rec: ask whether team games should group rows by team (winning team first) — a spec call, not a defect.
  3. Portraits are 30 px in a 15 px-radius disc; the t3 sheets' creatures sit small inside their 200×200 cell, so scarab/hound read tiny.
     Rec: keep; if he wants them bigger, crop to the sprite's alpha bounds (render-only).
- **NOT DONE**: nothing from the brief. Driver script `.tmp-gates/boardlook.mjs` is gitignored scratch (not a committed spec — a
  ~10 min live match is too slow for the gating lane).

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
