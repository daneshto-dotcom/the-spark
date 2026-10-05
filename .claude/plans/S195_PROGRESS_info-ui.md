NEXT STEP: N12 entropy rows in characterSheetModel (structure / welded tower / welded structure) + tests.

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
