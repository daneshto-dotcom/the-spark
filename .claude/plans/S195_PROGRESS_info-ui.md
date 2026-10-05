NEXT STEP: N14 — matchBoard: model `lostToEntropy`, fit-to-width (measured width when a canvas exists, estimate otherwise, recorded for the test), LOST TO ENTROPY on the local seat's page header, press latch at the three sites; census rows → PRESS; `matchBoardFit.test.ts`.

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
