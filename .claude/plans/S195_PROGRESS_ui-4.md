NEXT STEP: DONE (fix round 1 applied) — merge owner: apply the SEAMS section in the other trees.

## FIX ROUND 1 (independent audit, 2 defects) — tip = this commit
1. MED collapse tab: `footerBand.ts` `hoverTab` set in `setHover` from `isOverCollapseTab`; `drawCollapseTab` state = hoverTab ? (pressed ? 'press' : 'hover') : 'rest' (stroke 2 while hovered). R81 pin no longer skips `tab` (only the carry READOUT, with its reason). `uiPressCensus.test.ts`: new test — a Controls-driven `skinButtonFx(` with a bare literal `'rest'` fails unless in `BARE_REST_EXEMPT` (carry readout; characterSheet portrait frame), exemptions stale-checked. Mutation (tab back to 'rest') → RED in both the pin ("tab hovered: hover/press state reached") and the census ("bare 'rest' on a control"); restored.
2. LOW seat rack REACH (`uiSkinReach.chips.test.ts`): now drives `rack.update` with a YOU seat, proves exactly one clickable cell, runs `checkButtons` (inside/outside by Pixi's children-bounds rule + sheen sweep inside) on your cell + team chip, and that another seat's cell never lights. `seatRack.ts` untouched.
Gates (this round, touched files only, box loaded): typecheck 0 · vitest (uiSkinReach.footer, footerBand, uiPressCensus, uiSkinReach.chips, uiSkinCensus, uiSkinCensus.reach) 0 — 72 passed; after restore (footer pin + census) 0.
Entry KiB: not re-measured this round (a few bytes in footerBand); the 1184.6 figure below stands within rounding.


# FINAL REPORT — s195/ui-4 (T18) — tip = see `git log -1` (this commit); merged `ccr-26eaab43-fa9mg3` (911bc30, clean, docs only, lockfile unchanged)

## Gates (exit codes captured in .tmp-gates/*.exit, read from the files)
- `npm run typecheck` → **0**
- `npx vitest run --maxWorkers=2` (full) → **1**: 585 files / 8811 tests — 578 files passed, 8797 tests passed, 12 skipped, **2 failed**, both in files this tree never touched and both LOAD-ONLY on the shared 4-core box: `structureComponents.test.ts` (perf ratio: 90 ms vs 66 ms budget) and `bots/botFix.test.ts` (60 s timeout). Re-run alone (`.tmp-gates/rerun-vitest.exit`) → **0**, 16/16. Verdict: benign (load), per the cloud rule "timeout-only red under load → re-run that file alone".
- `npm run build` → **0**: entry **1184.6 KiB** (master 1183.4 → **+1.2 KiB**; cap 1250, headroom 65.4 KiB shared).
- `npx playwright test e2e/button-press-edge e2e/castle-panel e2e/feed-tower e2e/footer-order-shapes` → **1**: **14 passed, 1 failed** (Chromium **build 1194** in the 1223 slot). The failure is `feed-tower.spec.ts:129` at its LAST line (218), `expect(errors).toEqual([])` receiving one console error `Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID`; every functional assertion (goblin walks out, bank debited, :216) passed. Cause: the matchmaking relays (`src/net/iceConfig.ts` `wss://…`) go through the container proxy, whose CA this Chromium does not trust. Re-run alone → same 1 failed / 1 passed. **Verdict: NOT DONE (environment)** — the cloud rule's relay case; the spec's sibling test passes only because it does not collect console errors. Not caused by this tree (render-only; no network code touched). The merge owner's desktop lane should show it green.

## Bump verdict: **NO** — render-only. Nothing on the wire, nothing in the sim, no hashed field; two builds that shake hands compute identical state (only pointer-down LOOKS differ). PROTOCOL_VERSION untouched.

## N5 — the clickable enumeration (mechanical, `uiPressCensus.test.ts`, 11 tests, mutation-tested 3×)
23 SKINNED census rows (parsed from `uiSkinCensus.test.ts` source) + 2 Controls-driven surfaces. Press mechanism per row: GRAMMAR 7 (title, arcade, botSetup −/+/✕ and START, codex tabs+CLOSE, exit, lobby buttons) · CHIP 10 (botSetup race/team/persona/diff, codex combo tiles, CONNECTION LOST, lobby Connect, seat cell + seat TEAM chip, race tiles) · STATE 2 (castle panel rows/slots/tiles, draft tiles) · CSS 2 (settings close/toggles) · OTHER_TREE 2 (matchBoard) + Controls-driven: footer STATE (already had it), characterSheet NOT DONE.
**Unwired before this tree**: every CHIP site (10 — `attachChipHover` had hover only), the castle panel (all three kinds — the owner's "castle upgrades e.g. gatherer speed"), the draft tiles. Still unwired, other trees: characterSheet FIX/SCRAP/FEED/auto-build (the owner's "goblin feed, tier-3 tower feeds"), matchBoard tabs/rows/CONTINUE, main.ts HUD gear (hover-only), settings range/label `:active`. All stale-checked in the test; exact hunks under SEAMS.
REACH (`uiSkinReach.press.test.ts`, 12 tests, mutation-tested): castle rows/slots through real `sync` + real Pixi handlers (down→press, up→hover, out→rest, upoutside clears; a disabled slot stays disabled; rect unchanged), draft tiles through real `render` (right button is not a press), chips (CONNECTION LOST plate chip, race tiles null-plate incl. inert taken tile, 14 codex tiles) — veil inside the rect, tint below rest, lifted on up/upoutside/out. T8 kept: no press scales a children-bounds hit; the rest-size plate stays the target.

## Census hardening (`uiSkinCensus.reach.test.ts`, 6 tests, mutation-tested 2×)
Every SKINNED row needs a `// CENSUS-REACH <file> :: <match>` marker in a `uiSkinReach.*` file (stale-checked both ways). NEW REACH: `uiSkinReach.codex.test.ts` (tabs+CLOSE hitArea = sheen rect, inside/outside, sweep; combo tiles children-bounds hit), `uiSkinReach.draft.test.ts` (glass == the two `draftHitTest` tiles; panel frame inside `isOver`). Markers added to buttons/arcade/chips/teams/castle/footer/sheet. **NOT DONE rows (6)**: lobbyScreen ×2 (teams tree), matchBoard ×2 (match board tree), settingsOverlay ×2 (lag tree owns settings*.ts; a DOM REACH also needs jsdom — no new packages).

## ⚠ MINE
1. **R81 `HOVER_GROW` 2 → 0** (`footerBand.ts:191`): a hovered chip/card/palette/queue/Ra/SE no longer draws 2 px past its hit rect (a ring that looked clickable and was not — uiSkin contract 2). Lift still reads via the skin's hover state, plate alpha and the thicker stroke; press sink (−1) unchanged. Pinned: `uiSkinReach.footer.test.ts` "R81 — hovered/held drawn rect ⊆ hit rect" (mutation back to 2 → RED). **Recommend keep-inside.** Alternative if he misses the pop: grow the HIT with the picture (chipAt & co. read `hoverChip`), T8-style.
2. Chip press look (`uiSkinButton.ts`): `CHIP_PRESS_TINT 0x8c9cb8` + veil alpha 0.3 inside the rect. Recommend as is; one constant each if he wants it deeper.

## Hover-highlight proposal (T18 #4) — see the section below; build nothing until he says yes.
## Nit (T18 #5) — NOT DONE (off-limits file); exact replacement text in the section below.
## NOT DONE: characterSheet press (sheet tree), matchBoard press (board tree), main.ts gear press, settings `:active` for range/label (lag tree), 6 census REACH rows above, feed-tower e2e console-error line (environment).

# S195 · s195/ui-4 — progress (T18 UI follow-ups)

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
