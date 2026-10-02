# S194 — T5 UI UPGRADE (`s194/ui-upgrade`) — PROGRESS

## FINAL REPORT
_(filled at the end)_

## NEXT STEP (exact)
Draft overlay (#21) → exit button + confirm (#22) → title/home (#1-2, lazy backdrop) → lobby (#6-8) → bot setup (#5) → settings DOM (#4) → codex/conn-lost (#24-25). Then gates + screenshots.

⚠ FILE BOUNDARY (coordinator, mid-run): `matchBoard.ts`, `matchBoardModel.ts`, `matchBoardHost.ts` + tests now belong to T10 — NOT touched by this branch (never were). T10 can import `src/render/uiSkin.ts` (`skinButtonFx`, `skinPanelFx`, `skinIcon`, `skinBase`, `SKIN`).

## Merge
`git merge master` at start: already up to date (master = `0a37175e`). No conflicts.

## The surface enumeration (mechanical: `pointertap` / `attachButtonFeedback(` / `isOver*(x,y)` / `*At(x,y)` greps over `src/render`, `src/input`, `src/main.ts`, arcade excluded)

| # | surface | file:line (at 0a37175e) | how it is hit-tested |
|---|---|---|---|
| 1 | TITLE: 1 Player / Multiplayer / VS Bots / CODEX / ARCADE buttons | `titleScreen.ts:290-315` (makeButton) | `attachButtonFeedback` hitArea, centred rect |
| 2 | TITLE: the screen itself (home backdrop, logo) | `titleScreen.ts` constructor | not clickable |
| 3 | Settings gear | `main.ts:476` (Text icon) | Pixi bounds of the glyph |
| 4 | Settings overlay (DOM) | `settingsOverlay.ts:63-146` | DOM buttons/checkboxes |
| 5 | VS BOTS setup: count -/+, persona, difficulty, START, close, race chip | `botSetupOverlay.ts:289,424,447,485,521` | Pixi children bounds + one hitArea |
| 6 | LOBBY: Host/Join/Begin/Back/Ready/Quick buttons | `lobbyScreen.ts:996` (makeButton), join pane `:323`, join button `:370`, `:450` | hitArea / child bounds |
| 7 | LOBBY: seat rack (own seat = race picker opener) | `seatRack.ts:240` | cell bounds |
| 8 | Race picker tiles + scrim | `racePicker.ts:87,96,170` | tile root bounds |
| 9 | FOOTER: tier chips 3-9 | `footerBand.ts:613` | `chipAt` |
| 10 | FOOTER: tower cards | `footerBand.ts:794` | `cardAt` |
| 11 | FOOTER: shape palette + queue chips | `footerBand.ts:644,674` | `paletteAt` / `queueChipAt` |
| 12 | FOOTER: carry readout plate (readout, not a control) | `footerBand.ts:739` | `isOverCarryBill` |
| 13 | FOOTER: collapse tab | `footerBand.ts:918` | `isOverCollapseTab` |
| 14 | FOOTER: POWER OF RA / WRATH skill square (WoW-style) | `footerBand.ts:955` | `isOverRaButton` |
| 15 | FOOTER: SCORCHED EARTH skill square | `footerBand.ts:1090` | `isOverScorchedEarthButton` |
| 16 | CASTLE PANEL: plate | `castlePanel.ts:1587` | `isOverPanel` |
| 17 | CASTLE PANEL: inventory slots (6) | `castlePanel.ts:1614` | slot box Graphics child |
| 18 | CASTLE PANEL: build tiles (grid disabled since S149) | `castlePanel.ts:1656` | tile box Graphics child |
| 19 | CASTLE PANEL: rows FIX ALL / BUY GATHERER / SPEED / REGEN / HP / ATK / DEF / PEN / MRES | `castlePanel.ts:1719` | row box Graphics child |
| 20 | CHARACTER SHEET (unit / tower / castle card): plate, owned rows, actions FIX/SCRAP/FEED + goblin auto-build chips | `characterSheet.ts:361,519,657,669` | `isOver` / `ownedRowAt` / `actionAt` / `autoFeedAt` |
| 21 | DRAFT panel: plate + two tiles + hover detail | `draftOverlay.ts:563-621` | `draftHitTest` / `isOver` |
| 22 | EXIT (BACK TO MAIN) button + confirm modal (LEAVE / KEEP PLAYING) | `exitButton.ts:180-263` | `attachButtonFeedback` hitArea |
| 23 | MATCH BOARD: CONTINUE + rows hover | `matchBoard.ts:153,251` | `matchBoardLayout(..).cont` inRect |
| 24 | CODEX: tabs, close, combo tiles | `codexOverlay.ts:527,551,988` | hitArea / tile bounds |
| 25 | CONNECTION LOST: return button | `connectionLostOverlay.ts:85` | child bounds |
| — | `structurePanel.ts` | retired S181 (model only); not drawn | — |
| — | arcade / NoNet / sudoku / Pitch Masters | EXCLUDED by owner rule | — |

## The visual language — "FORGED GLASS"
One module, `src/render/uiSkin.ts`, used by every surface so tuning moves them together (the S155 one-grammar rule, applied to looks):
- **Body**: each surface keeps its OWN opaque base fill at its site (so every existing fill-count pin keeps counting the real surfaces).
- **Skin overlay** (`skinButtonFx`): translucent only, and geometrically INSIDE the rect it is handed (a bounds test proves it) — top gloss, inner top bevel line, bottom lip shadow (reads as a raised key), accent inner glow, corner studs, and an animated diagonal SHEEN while hovered / armed. Pressed = lip gone + darker (sinks). Disabled = grey wash + hatch (desaturated), no gloss.
- **Panels** (`skinPanelFx`): header gloss band, inner hairline frame, accent corner brackets.
- **Icons** (`skinIcon`): procedural stroked glyphs (sword, shield, arrowhead, rune, regen arrows, chevrons, pick, wrench, door…), inside their box.
- **Accent** = the race / seat colour where the surface belongs to a seat, otherwise the surface's own existing accent.
- Animation: render-only clock (`performance.now()`), never the sim; no `Math.random`.
- Home screen: lazy-loaded animated backdrop on the fx substrate (deterministic hashed motes, halo, orbiting spark glyphs).

## Log
- step 1 — `uiSkin.ts` + bounds test (305 cases; mutation: lip moved 3px out → 106 red).
- step 2 — footer skinned (8 sites, fill count 11 unchanged); REACH `uiSkinReach.footer.test.ts` (mutation → 2 red).
- step 3 — castle panel (fill count 4 unchanged, row icons); REACH `uiSkinReach.castle.test.ts` (mutation → 3 red).
- step 4 — character card; REACH `uiSkinReach.sheet.test.ts` on a real goblin tower.
- step 0 — worktree, npm install (exit 0), before-shots in `.tmp-gates/before/` (harness `.tmp-gates/shots.mjs`, private port 31947).
