NEXT STEP: fill in the final gate numbers below (vitest / e2e) — code complete, merged ccr-26eaab43-fa9mg3 (25b60c41, clean, lockfile unchanged, none of this tree's files touched by the merge).

# FINAL REPORT — s195/info-ui (N7 · N12 · N14 · ui-4 seams) — tip = `git log -1` (this commit)

## Gates (exit codes in `.tmp-gates/final-*.exit`, read from the files; merged tree)
- `npm run typecheck` → **0** (final-typecheck.exit)
- `npx vitest run --maxWorkers=2` → **VITEST_EXIT** — VITEST_COUNTS
- `npm run build` → **0** — entry **1191.7 KiB** (1220258 B); the integration tip `ccr-26eaab43-fa9mg3` built in a scratch worktree the same way = **1186.3 KiB** → **this tree uses +5.4 KiB** of the shared headroom (58.3 KiB left under 1250). The tooltip pulls no new chunk: `hoverPreview.ts` imports only modules already in the entry (`total initial JS (entry + 0 modulepreloads)`).
- `npx playwright test e2e/castle-panel.spec.ts e2e/feed-tower.spec.ts e2e/match-clock.spec.ts` (Chromium **build 1194** in the 1223 slot) → **E2E_EXIT** — E2E_COUNTS

## Bump verdict: **NO.** Render-only. Nothing on the wire (the board reads the T22 `lostToEntropy` field that already rides as `le`), nothing in the sim, no hashed field, no new action or discriminant. Two builds that shake hands compute identical state; only what the LOCAL pointer sees differs. `PROTOCOL_VERSION` untouched. `src/state/**` untouched (read only).

## What landed (owner's words → what is drawn)
1. **N7a — the goblin tower shows its contents** (`characterSheetModel.goblinContentsRows`): rows `GOBLINS n · in the tower` (BUILD) / `in the fight` (FIGHT), then one row per kind present — `· SHIELD 1 · from SQUARE` — in shape order (a total order), derived every frame from `world.creatures` whose `sourceSpawnerId` is the tower's. Keyed on the LIVE spawner (a hand-bonded tower has no `origin.blueprintId`). Hidden for a CONCEALED tower (fog). On the plain card and the welded-tower card.
2. **N7b — hover preview tooltip** (`hoverPreview.ts` pure + `CharacterSheet` draws it in its own container, above the card, `eventMode: none`):

   | pointer rests on | preview |
   |---|---|
   | a FEED chip on the open card | the unit THAT tower makes of THAT shape (`fedCreatureType`, APEX-promoted like the reducer): goblin tower Dot→SAPPER · Line→ARCHER · Triangle→MELEE · Square→SHIELD · Circle→HOUND · Spiral→BAT; a race tower's chip → its T3 unit, a wrong shape → nothing |
   | a creature on the board | its card's own numbers (own pool, own strike) — the click's own pick (fraction of drawn radius, ties to the lower id) |
   | a FREE shape (no bonds — quarry, carried out, built-and-unconnected) | what the viewer's goblin tower would make of it (viewer's APEX promotion) |
   | anything behind the fog, a bonded shape, the open card's body | nothing |

   Card: name · `GOBLIN · FROM SQUARE` + the shape glyph · ATK / PEN / HP / DEF with `N a swing` / `N pool` (the same `statRowsFor` rows as the full card). Appears after `HOVER_PREVIEW_DELAY_MS` (180) of rest on the SAME subject, hides the next frame the pointer leaves; (-1,-1) under a modal hides it. Plumbing: the existing `controls.onMove → characterSheet.setHover` — no new controls line was needed for hover.
3. **N12 — entropy readable** (`entropyRowsFor`, imports `entropyChance` / `ENTROPY_FREE_CONNECTORS` / `ENTROPY_SCALE` — never the formula): `ENTROPY %  4.4  ~2.4 lost/fight` (n = the WHOLE structure's connectors, what `planEntropy` prices — a welded tower's card reads its lattice's chance) or `ENTROPY %  0  4 of 10 free`; plus `LOST n to entropy` ⛔ owner-only (B-17: `owner === seat`). On all three structure cards (plain, welded tower, welded structure). The entropy toast is untouched.
4. **N14 — board polish**: (a) `textWidth` — Pixi's MEASURED width when a canvas exists (Kanit 900 renders wider than the 0.62 em estimate the old `fitTo` trusted — the probable cause of the text that ran out of its box), estimate as fallback; (b) `fit()` on EVERY text whose words come from the model (headline, subline, tabs, every overview cell, chart titles/captions/legends/y-labels/line ends, matrix labels and cells, player header, KPI tiles, unit ledger, damage split, versus, wave ledger, footer note), recorded per draw for the test; (c) **LOST TO ENTROPY** `N connectors` on the LOCAL seat's player page header (left of the status pill), never on another seat's page (B-17); (d) press latch (`pointerdown`/`pointerup`/`pointerupoutside`, in `drawnKey`) → `hot ? (pressed ? 'press' : 'hover') : 'rest'` at tabs / rows / CONTINUE. Badges, death counts, charts untouched (B-20..23 keep). No redesign.
5. **ui-4 seam on the card**: `pressed` + `setPressed` beside `setHover`; the state expression at `drawActionButton` (FIX/SCRAP/FEED/auto-build chips), the owned row, the weld icons and weld rows. `controls.ts`: `this.characterSheet?.setPressed?.(true)` after the footer's in `onDown`, `…(false)` in `onUp`, and ONE optional interface member `setPressed?(down: boolean): void` on `CharacterSheetLike` (so every harness stub stays assignable) — 4 lines total in `controls.ts`, nothing else.
6. **Censuses**: `uiPressCensus.test.ts` — characterSheet row → `via: "this.pressed ? 'press'"`; matchBoard rows → PRESS (STATE); `OTHER_TREE` empty, `OTHER_TREE_FILES` empty (the "gap still exists" assertion now iterates that set). `uiSkinCensus.test.ts` — the three board latch lines claimed E (the press half of the one listener pair). `uiSkinCensus.reach.test.ts` — the two board NOT_DONE rows removed; NEW `uiSkinReach.board.test.ts` carries the `CENSUS-REACH` markers (inside/outside == `hoverAt`, exactly one thing sinks).

## Tests (all REACH through real models / real Pixi objects; every number derived from a constant)
`characterSheetInfo.test.ts` 11 · `weldedSheetsR191A.test.ts` +1 · `hoverPreview.test.ts` 18 · `hoverPreview.reach.test.ts` 6 · `matchBoardPolish.test.ts` 13 · `uiSkinReach.board.test.ts` 3. Mechanical enumerations (S182 rule 2): every dynamic `this.texts.take(` must be followed by `this.fit(` (parsed from `matchBoard.ts`); the hover pick radii are parsed out of `controls.ts` (`CREATURE_PICK_DIST`, `prim.radius + 6`) so hover and click cannot drift. Mutations run and restored (each → RED): B-17 owner gate (card) · press expression on `drawActionButton` · overview name fit removed · B-17 gate on the board page.

## ⚠ MINE (each at its constant; recommendation in one line)
- `HOVER_PREVIEW_DELAY_MS` **180** (`hoverPreview.ts`) — a rest, not a wait; 0 strobes across a crowd. **Recommend keep**; owner may want 0 ("instant") or ~300.
- Tooltip placement: hung off the pointer (+16 px, flipped inside the canvas), 176 px wide, 4 rows; NOT anchored to the subject. **Recommend keep** (same grammar as the board's chart tooltip).
- Preview sources: a creature preview shows for EVERY visible creature (not goblins only) — the same pick as a click, so hover == what a click opens. A free shape previews the VIEWER's goblin map (his tower, his promotion). Recommend keep.
- Board fit rule: **shrink-to-fit, never ellipsis** (a cut number/name on a stat board is a wrong one); `LEGEND_LABEL_MAX` 120, `ENTROPY_BLOCK_W` 180. Recommend keep.
- Entropy row wording: `ENTROPY %` / `~2.4 lost/fight` / `n of 10 free` / `LOST n to entropy`; contents wording `in the tower` / `in the fight`. Cheap to rename.
- Known limit: the sheet is handed the cursor even over the footer band / castle panel, so a free shape or goblin UNDER those HUD surfaces can still preview (controls.ts only blanks the hover under a modal or the draft plate). Fix would be one more `-1,-1` branch in `updateHoverCursor` (controls-macros tree's file) — not done here.

## Seams for the merge owner
- `src/input/controls.ts` (shared with controls-macros): 4 lines — `CharacterSheetLike.setPressed?` (interface), `this.characterSheet?.setPressed?.(true)` in `onDown` right after `this.footerBand?.setPressed(true)`, `…(false)` in `onUp` right after `this.footerBand?.setPressed(false)`. No `onMove` change.
- `matchBoardModel.BoardRow.lostToEntropy` is a new REQUIRED field — any other tree building a `BoardRow` literal must add it (none in the tree today).
- `SPARK_WORD` and `tierOf` are now exported from `characterSheetModel.ts`.
- `MatchBoard.fitsDrawn()` / `isPressed()`, `CharacterSheet.hoverPreview()` / `isPreviewShown()` / `getUiPoints().preview` are test + e2e seams.

## NOT DONE
- Nothing from the brief. SPARK_CANON rows: none added (render-only; no constant the canon states moved). The known-limit above (HUD-covered previews) is a controls.ts hunk outside my three lines.


# S195 · s195/info-ui — progress (N7 tooltips + goblin tower contents · N12 entropy readable · N14 board polish · ui-4 seams)

## Plan
1. N12 — `characterSheetModel.ts`: ENTROPY % row (entropyChance from `state/entropy.ts`, free allowance in `derived`) + owner-only LOST row (`matchStats.seats.get(seat)?.lostToEntropy`). Tests: arithmetic from constants, REACH through the model, negative (another seat's structure).
2. N7a — goblin tower contents rows (creatures with `sourceSpawnerId === tower`, by type), derived per frame.
3. N7b — `hoverPreview.ts` (pure resolver: FEED chip / creature / free shape → unit preview) + tooltip drawn by `CharacterSheet` (own container), `HOVER_PREVIEW_DELAY_MS` ⚠ MINE. Tests: resolver table per shape, REACH through `sync`, negative (fog).
4. ui-4 seam — `pressed` on the card (FIX/SCRAP/FEED, owned, weld rows) + two `controls.ts` lines; census rows.
5. N14 — board: fit-to-width on every growable text (measured width when a canvas exists, estimate otherwise), LOST TO ENTROPY (local seat's page), press latch at the three sites; census rows → PRESS.
6. Final gates on the merged tree.

## Log
- (start) merged `ccr-26eaab43-fa9mg3` (1c5ce299, clean). Read rules, canon §2/§3g/§9d-3, rulings N7/N12/N14/B-17/B-20..23, ui-4 SEAMS, fixes seam (`lostToEntropy`).
- b3e490cd N12 + N7a: `entropyRowsFor` (ENTROPY % + owner-only LOST) and `goblinContentsRows` (GOBLINS total + per kind `· SHIELD 1 from SQUARE`), on the plain, welded-tower and welded-structure cards. Keyed on the live spawner, not `origin.blueprintId` (a hand-bonded tower has none). `characterSheetInfo.test.ts` 11 tests; mutation (owner gate → always) RED in B-17 + fog cases, restored.
- ec76d4f3 welded coverage in `weldedSheetsR191A.test.ts` (every card of the weld reads the WHOLE structure's n; LOST only on P0's view).
- 56f6b624 N7b: `hoverPreview.ts` (pure resolver: FEED chip → `fedCreatureType` + APEX promotion; creature → the click's own pick, own pool; free shape → viewer's goblin map; fog → null), tooltip drawn by `CharacterSheet` in its own container (`HOVER_PREVIEW_DELAY_MS` 180 ⚠ MINE), `getUiPoints().preview`. Card press latch (`pressed`/`setPressed`, 4 skin sites) + `controls.ts` 3 lines (interface member optional + onDown/onUp). Census: characterSheet row → PRESS.
- (this commit) `hoverPreview.test.ts` 18 (resolver table per shape, race chip, creature pick total order, fog negatives, radii parsed from controls.ts) + `hoverPreview.reach.test.ts` 6 (tooltip appears after the rest / hides at once / no fire through the card / free shape with no card / fog; press states through real sync; Controls.onDown/onUp → setPressed through the real class). Mutation (drawActionButton press expression removed) → RED, restored.
- (this commit) N14: `matchBoardModel.BoardRow.lostToEntropy`; `matchBoard.ts` — `textWidth` (Pixi's measured width when a canvas exists — Kanit 900 is wider than the 0.62 em estimate, the likely cause of the owner's overflow — estimate otherwise), `fit()` records every fitted text, EVERY dynamic `take` fitted (headline, subline, tabs, overview cells, chart titles/captions/legends/y labels, player header, KPI tiles, unit ledger, damage split, versus, wave ledger, footer note); LOST TO ENTROPY block on the LOCAL seat's page header only (B-17); press latch (`pointerdown`/`pointerup`/`pointerupoutside`, in `drawnKey`) at tabs / rows / CONTINUE. Census: matchBoard rows → PRESS (STATE), OTHER_TREE empty; skin census claims the three latch lines (E); census-reach NOT_DONE rows for the board removed, `uiSkinReach.board.test.ts` carries the markers (inside/outside == hoverAt, press sinks exactly one). `matchBoardPolish.test.ts` 13 (widest 4-seat fixture on every page: width×scale ≤ box, measured path, something shrinks; MECHANICAL take→fit pairing; B-17 page negative; press REACH). Mutations: name-cell fit removed → RED (page 0); B-17 gate → always → RED; restored.
