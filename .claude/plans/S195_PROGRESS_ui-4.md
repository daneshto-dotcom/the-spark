NEXT STEP: write the hover-highlight PROPOSAL + botSetupOverlay docblock text into this file; then `git merge ccr-26eaab43-fa9mg3`, final gates (typecheck, full vitest --maxWorkers=2, build, 4 e2e specs), final report.

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
- Census hardening: `uiSkinCensus.reach.test.ts` (6 tests) parses SKINNED rows from the census source; each needs a `// CENSUS-REACH <file> :: <match>` marker in a uiSkinReach.* file or a NOT_DONE row (stale-checked both ways). Markers added to buttons/arcade/chips/teams/castle/footer/sheet; NEW `uiSkinReach.codex.test.ts` (tabs+CLOSE hitArea = sheen rect, inside/outside, sweep; 14 combo tiles children-bounds hit) and `uiSkinReach.draft.test.ts` (glass == the two draftHitTest tiles; panel frame inside isOver). NOT DONE rows: lobbyScreen ×2 (teams tree), matchBoard ×2 (match board tree), settingsOverlay ×2 (lag tree + no jsdom). Mutation: marker removed → RED; marker on a NOT_DONE row → RED.

## T18 #4 — PROPOSAL: one world-space hover / selection highlight for every family (build nothing until he says yes)
Today: `characterSheet.selection()` is read by `controls.ts:1348` and `main.ts:4515` only; NO renderer draws a ring under the
selected or hovered thing, for any family (T9 matrix). The pointer's world hit is computed only on `onDown` (controls.ts:1123
creatures, :1178 primitives — squared distance then id, a total order) — `onMove` (controls.ts:1733) sets only the CSS cursor.

Proposal — `src/render/selectionHighlightRenderer.ts` (render-only, ~120 lines + ~80 test lines, no bump: nothing on the wire,
read from synced state + local selection):
- ONE grammar for four families: a ring (race/seat accent, alpha 0.35 hover / 0.7 selected, width 2/3) drawn by the SAME
  `skinSheen`-style clock on a Graphics in a new layer right above `groundLayer` (under units, so it reads as a floor mark,
  the groundDecal precedent — `fog.spec.ts` roll call must list it; do it ON PURPOSE as S185 did).
- Radius per family from what each already has: structure → `componentOf(...)` bounds of the primitives (same box the card's
  "whole structure" uses); creature → its body radius from `CREATURE_*` constants via a `creatureRadiusOf(kind)` helper the
  renderers already derive their sprite scale from; castle → the keep-out radius; stink cloud → `bag.radius`.
- HOVER: factor the two `onDown` picks (controls.ts:1123 / :1178) into one pure `pickWorldTargetAt(world, x, y)` and call it from
  `onMove` too (throttled to once per render frame; it is already the click's rule so hover == what a click would select — the
  footer's "a highlight computed a second way is a highlight that can land on a control a click would miss" rule). Pure, so a
  REACH test can prove hover == click target for every family.
- Cost: ~1 session-hour for the renderer + a REACH test (ring drawn on the rect/radius `pickWorldTargetAt` claims), ~30 min for
  the controls refactor (touches `controls.ts` — coordinate with T19 which may hold `controls.ts` hunks), plus the `fog.spec.ts`
  roll-call line. Determinism: render-only; the pick is already a total order. Bundle: ~2 KiB.
- Owner questions (one line each): (a) ring vs. outline-glow (ring is cheapest and reads at every zoom); (b) should hover show on
  enemy units during FIGHT or own-side only (recommend: everything a click would open a sheet for — same rule as the click).

## T18 #5 — NIT (NOT DONE here, `botSetupOverlay.ts` is the teams tree's): stale docblock, exact replacement
File `src/render/botSetupOverlay.ts`, docblock in `makeStartButton`/START (currently ~:641–645). Replace the sentence
  `The race / difficulty chips still do not pop (\`attachChipHover\` never scales).`
with
  `The race / team / personality / difficulty chips still do not SCALE (\`attachChipHover\` never moves a children-bounds hit — T8), but since S195 N5 they do SINK on press: the shared helper drops the plate tint below rest and lays a dark veil inside the chip rect on \`pointerdown\`, lifted on \`pointerup\` / \`pointerupoutside\`.`

## SEAMS — one-line hunks another tree must apply (ui-4 must not touch these files)
1. `src/render/characterSheet.ts` (sheet tree) — the owner's "goblin feed, tier-3 tower feeds": add `private pressed = false;` +
   `setPressed(down: boolean): void { this.pressed = down; }` beside `setHover` (~:290), and in `drawActionButton` (~:665):
   `state: !b.enabled ? 'disabled' : hot ? (this.pressed ? 'press' : 'hover') : 'rest',` — same for the owned rows (~:525,
   `ownedHot ? (this.pressed ? 'press' : 'hover') : 'rest'`) and weld rows (~:878/:893, `lit ? (this.pressed ? 'press' : 'hover') : 'rest'`).
   Plumbing in `src/input/controls.ts` next to the footer's: `this.characterSheet?.setPressed(true);` after :1361 and
   `this.characterSheet?.setPressed(false);` after :1840. Then move the `characterSheet.ts` row in `uiPressCensus.test.ts`
   from `CONTROLS_DRIVEN_PRESS` (via: null) to `via: "this.pressed ? 'press'"` and drop it from `OTHER_TREE_FILES`.
2. `src/render/matchBoard.ts` (match board tree) — tabs / rows / CONTINUE: a `pressed` latch on the board's `pointerdown` /
   `pointerup` / `pointerupoutside`, then `hot ? (this.pressed ? 'press' : 'hover')` at :356 / :377 / :404; then move its two
   `OTHER_TREE` rows in `uiPressCensus.test.ts` into `PRESS` as STATE.
3. `src/main.ts` (merge owner) — the HUD gear is hover-only (alpha .55 → 1): add
   `settingsIcon.on('pointerdown', () => { settingsIcon.alpha = 0.8; });` and `settingsIcon.on('pointerup', () => { settingsIcon.alpha = 1; });`
   `settingsIcon.on('pointerupoutside', () => { settingsIcon.alpha = 0.55; });` after :488; then drop the `HOVER_ONLY_KNOWN` row.
4. `src/render/settingsOverlay.ts` (lag tree) — the range slider and the row labels have `:hover` but no `:active`: add
   `'.spark-settings input[type=range]:active{filter:drop-shadow(0 0 6px #3bd7ff) brightness(1.2)}'` and
   `'.spark-settings label:active{color:#3bd7ff}'` to `installSettingsSkinCss`.
