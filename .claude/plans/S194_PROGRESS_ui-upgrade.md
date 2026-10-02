# S194 — T5 UI UPGRADE (`s194/ui-upgrade`) — PROGRESS

## STATUS: COMPLETE (tip = the commit carrying this report)

## ROUND 2 REPORT — audit fix round + R194-24 arcade menu + across-the-board census
- **Merge:** `git merge master` → `628b9072` (visuals-racial, intentStamp security fix), **no conflicts**. Merge-base for the bundle: `fbddede7`.
- **F1 fixed:** the refused cue on an illegal release now also requires NOT over panel / footer / card / draft / modal / downUnderModal — a UI drop is silent. New negative test (illegal spot under the panel → silent, nothing placed); mutation (guard dropped) → red.
- **F2 fixed:** the gear's `hitArea` is pinned from `settingsGearLocalHit()` = `settingsGearRect()` in local coordinates; the hover scale is gone (alpha only). Test sweeps the gear's neighbourhood: gear-hit ⇔ covered; mutation (+3px) → red; the wire is source-pinned (no `settingsIcon.scale.set`).
- **Nit fixed:** `.spark-settings button:focus-visible, input:focus-visible` outline (pinned). **Cosmetic:** castle row label 2px further from the icon.
- **R194-24 arcade MENU:** gold gradient glowing ARCADE title, NONET (violet, grid badge) / PITCH MASTERS (gold, ball badge) / BACK (back arrow) glass plates with sheen, the living backdrop behind. Menu drawing only — `hitTest`, plate rects and every game file untouched. Per-plate test: hit rect = plate; `hitTest` inside/outside; glass + badge + sheen inside the rest-size rect. Labels re-fitted so the blurb never runs past the plate.
  - Left alone (inside the games, per the brief): `arcadeRunOverlay.ts`, `arcadeLeaderboard.ts`, `arcadeScores.ts`, `arcadeRun.ts`, `sudokuOverlay.ts`, `nonet*.ts`, `src/arcade/**`.
- **Census (owner: "across the board"):** `src/render/uiSkinCensus.test.ts` — every clickable code line in `src/render/**` + `src/main.ts` (eventMode static/dynamic, pointer listener, `attachButtonFeedback(`, DOM button, pointer cursor) must be claimed SKINNED or EXEMPT-with-reason; a new unclaimed one is RED (mutation verified). The list:
  - SKINNED: title 5 buttons · arcade menu plates · VS-BOTS race / personality / difficulty chips, **− / + steppers and ✕ (owner's report)**, START · castle panel rows/slots/tiles · codex tabs, CLOSE, combo tiles · CONNECTION LOST Return · draft tiles · exit BACK TO MAIN / LEAVE / KEEP · lobby Connect, Host/Join/Begin/Back/Quick/Test/READY · own lobby seat · race-picker tiles · settings close/toggles/mutes/sliders (CSS) · Controls-driven: footer band, character card.
  - EXEMPT: settings gear (16-px HUD glyph; lights on hover; see F2) · modal scrims (bot setup, codex, connection lost, exit confirm, race picker root/scrim/panel, arcade menu scrim + tap fallback) · lobby JOIN pane body (a framed surface, not a button) · `buttonFeedback.ts` / `uiSkinButton.ts` internals · `debugOverlay.ts` (dev only) · `matchBoard.ts` (T10) · `arcadeRunOverlay.ts`, `sudokuOverlay.ts` (inside the games).
  - REACH `uiSkinReach.chips.test.ts`: Pixi's own hit rule takes each newly-skinned button 3px inside and refuses it 3px outside; sheen inside its rect; sheen rect == hit rect on feedback buttons (mutation +4px → red); a taken race tile does not light.
- **Gates (final tree):** typecheck exit 0 · vitest exit 0 — 535 files / 8304 passed / 11 skipped · build exit 0 · UI e2e gating lane exit 0 — 36/36.
- **Bundle:** entry **1148.4 KiB** vs merge-base master `fbddede7` built here at **1133.7 KiB** → **+14.7 KiB** total for T5 (title backdrop is a separate 1.9 kB lazy chunk, shared with the arcade menu). Headroom 101.6 KiB.
- **Bump verdict: still NO** — render/UI and local sound cues only.
- **Benign, recorded:** every full vitest run rewrites `pentagramBuildability.test.ts.snap` with EOL-only changes; restored each time, never committed.
- **Screenshots added:** `before/after-04-arcade`, `04b-arcade-hover`, `02b-bot-setup-hover-plus`, refreshed `after-02-bot-setup` in `C:/Users/onesh/OneDrive/Desktop/SPARK_S194_UI_Upgrade/`.

## FINAL REPORT (round 1)
- **Merge:** start `0a37175e` (no-op). Mid-run `git merge master` @ `2fe065fb` (mres-card + protocol 63 + vite worktree-ignore) → `86ce1e65`, **no conflicts**. T8 (buttonFeedback) and T9 (coherence) had NOT landed yet — the merge owner reconciles.
- **Gates on the merged tree:** `npm run typecheck` exit 0 · `npx vitest run --maxWorkers=3` exit 0 — 528 files / 8226 passed / 11 skipped · `npm run build` exit 0 · UI e2e (castle-panel, exit-match, smoke, click-to-build, feed-tower, footer-order-shapes, modal-layering, settings-toggles, lobby-construction) with the gating grep-invert: exit 0, **36/36 passed** on this worktree's own hashed port. An earlier run of the same files WITHOUT the grep-invert had 8 failures, all `@quarantine-flaky` networked smoke tests outside the gating lane — ruled benign (not a gating test; the 44 gating tests in that run passed).
- **Benign finding:** the full vitest run rewrote `pentagramBuildability.test.ts.snap` with line-ending changes only (empty content diff) — restored, not committed.
- **Bundle:** entry **1135.2 KiB** vs master `2fe065fb` measured on the same machine at **1123.1 KiB** → **+12.1 KiB**; plus a lazy `titleBackdrop` chunk of 1.9 kB. Headroom 114.8 KiB.
- **Bump verdict: NO.** Render/UI only plus two local refused-sound cues: no wire field, no action discriminant, no hashed or serialized state, nothing the sim reads.
- **Reusable module for T10:** `src/render/uiSkin.ts` (`skinButtonFx`, `skinPanelFx`, `skinIcon`, `skinSheen`, `skinBase`, `SKIN`, `shade`) + `src/render/uiSkinButton.ts` (`skinStaticPlate`, `attachHoverSheen`). matchBoard*.ts never touched.
- **Merge seams:** (1) `buttonFeedback.ts` NOT edited — `attachHoverSheen` only adds its own pointerover/out listeners and a non-interactive Graphics inside the REST-size hit rect, so T8's `hitRectAtScale` / pivot / `setScale` compose; (2) `controls.ts` two refused-cue branches (T9 finding) — the illegal-release gate is in `controls.ts onUp`, not `dragPreview.ts` (which only computes the ghost); (3) `main.ts` +3 lines (gear hover); (4) `draftOverlay.ts` adds a `glass` Graphics child — `isOver` asks every Graphics child; glass is inside the tiles (tested); (5) fill-count pins unchanged (footer 11, castle 4, draft 5) — the skin lives in `uiSkin.ts`, bounds-tested; the footer's 8 skin sites are pinned and paired to their plates by source.
- **MINE (owner questions):** the whole look ("forged glass": gloss, bevel, bottom lip, accent glow, rivet studs, hover sheen, hatch-desaturated disabled) — recommend he judges from the desktop screenshots; the castle-row icons (wrench / pick / chevrons / regen arrows / diamond-plus / sword / shield / arrowhead / rune star — deliberately NO heart for HP); the home backdrop (embers in the six race colours, the six shapes orbiting the logo) — recommend keep.
- **NOT DONE:** race-picker tiles, seat-rack banners and codex combo tiles left as they are (card art, not plates). A hovered footer chip/card still grows HOVER_GROW px past its hit rect — pre-existing R81 behaviour, untouched.
- **Screenshots:** before/after pairs in `C:/Users/onesh/OneDrive/Desktop/SPARK_S194_UI_Upgrade/` (match board excluded — T10's).

## NEXT STEP (exact)
Done except: owner screenshot review. Not skinned (art-led, left as they are): race-picker tiles, seat-rack banners, codex combo tiles.

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
