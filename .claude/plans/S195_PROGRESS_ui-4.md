NEXT STEP: census hardening — `uiSkinCensus.reach.test.ts` (SKINNED rows parsed from the census; each needs a `CENSUS-REACH` marker in a uiSkinReach.* file or a NOT_DONE row), markers into existing reach tests, new `uiSkinReach.codex.test.ts` + `uiSkinReach.draft.test.ts`.

# S195 · s195/ui-4 — progress (T18 UI follow-ups)

## Plan (brief order)
1. N5 press everywhere — enumeration test FIRST (`uiPressCensus.test.ts`), then wire: castlePanel (rows / slots / tiles), chips via `attachChipHover` (codex combo tiles, CONNECTION LOST, race picker; botSetup/seatRack/lobby inherit the helper untouched), draftOverlay tiles. REACH: `uiSkinReach.press.test.ts`.
2. Census hardening — derive SKINNED rows from `uiSkinCensus.test.ts` mechanically; each needs a `CENSUS-REACH` marker in a `uiSkinReach.*.test.ts`; off-limits rows listed NOT DONE (teams tree).
3. R81 HOVER_GROW — keep-inside (⚠ MINE), pin drawn ⊆ hit while hovered.
4. World-space hover highlight — PROPOSAL only (below, when written).
5. botSetupOverlay docblock nit — NOT DONE (off-limits), text in report.

## Log
- (start) read rules, backlog T18, N5/B-24, R81 sites, buttonFeedback/uiSkin/uiSkinButton, census + 7 REACH tests, castlePanel/footerBand/codex/draft/connectionLost/racePicker pointer models.
- c3e999e feat: press wired — `attachChipHover` press half (tint below rest + veil inside rect, pointerup/upoutside/out lift), castlePanel rows/slots/tiles press latch, draftOverlay press latch.
- (next commit) `uiPressCensus.test.ts`: 11 tests, mechanical — SKINNED rows parsed from uiSkinCensus source; each needs GRAMMAR/CHIP/STATE/CSS claim verified in code; hover-without-press skinButtonFx sites fail; OTHER_TREE rows (matchBoard x2, characterSheet) stale-checked. Mutation-tested: castle row press removed → RED; chip upoutside removed → RED; draft press removed → RED.
- `uiSkinReach.press.test.ts`: 12 REACH tests — castle rows/slots (real sync; down→press, up→hover, out→rest, upoutside clears), draft tiles (real render; button 2 is not a press), chips (CONNECTION LOST plate chip, race picker null-plate tiles incl. inert taken tile, 14 codex combo tiles). Mutation (castle latch + chip sink + draft latch removed) → 6 RED.
- R81: `HOVER_GROW` 2 → 0 (⚠ MINE, keep-inside; docblock names the alternative: grow the HIT with the picture). Pin in uiSkinReach.footer.test.ts: every control hovered and held → drawn rect corners claimed by the same hit-test. Mutation (back to 2) → RED on the Ra square corner.
