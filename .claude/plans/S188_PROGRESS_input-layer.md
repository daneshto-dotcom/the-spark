# S188 · `s188/input-layer` — two input-layering bugs — running progress

Updated with every wip commit. The merge owner can salvage from here if this session is cut off.
Branch base: 3b63c92 (tip of `s188/racial-c`, POWER OF RA).

## THE TWO BUGS
1. **Footer collapse arrow beats the tower menu above it** (owner, S188). With a tier's menu open,
   a tower card drawn over the S187 collapse tab must win the click; the tab is one layer below.
2. **Clicks through the draft panel reach the board** (S187 bug; finding + verifier design in
   `.claude/plans/S188_F1_draft_clickthrough_finding.txt`).

## MEASURED GEOMETRY (probe, real code, this tree)
- Collapse tab (expanded): x 922-998, y 976-996.
- EVERY tier's menu covers it: tiers 3,4,6,8,9 are one 226-wide card at x 847-1073 (tab fully
  covered); tiers 5 and 7 are two cards, 729-955 and 965-1191, so only the 10 px gap x 955-965
  shows the tab (the chevron's tip) while those menus are open. Card row y 941-1003.
- Draft panel plate 681,405 559x270 (bounds incl. stroke 680,404 561x272); general tile
  695,419 251x242; racial tile 976,419 251x242; tip plate (hovering general) 680.5,680.5 560x47.
- Legal t3 stamp under the panel (PITCH_2P, wave-1 BUILD): seat 0 at (709,540) and (688,540);
  seat 1 at (1213,540) and (1233,540). Tile CENTRES are inside the quarry keep-out (not stampable),
  but gatherer / raid / sheet picks still reach them.

## DONE (committed)
- BUG 1 FIX: `FooterBand.isOverCollapseTab` answers false where an open card covers the tab (only
  while expanded). That predicate is read by `handleFooterChipClick`, `isOverChip` (cursor) and
  `isOverBandSurface` (placement refusal), so all three agree. `controls.ts` comment at the tab
  test corrected (it claimed the tab floats above the menu). typecheck 0. Tests NOT yet written.
- BUG 2 FIX: `DraftOverlay.isOver` (every Graphics child's `containsPoint`, i.e. plate + tiles +
  hover-tip plate as drawn this frame) and `isOverChoosable` (visible && offered && draftHitTest);
  a block appended at the END of the class, nothing else in the file touched. `Controls`:
  `DraftPanelLike`, `setDraftPanel`, `isPointerOverDraftPanel` / `isPointerOverDraftChoice`;
  onDown early return right after the castle-panel guard; potato + PLACE_FROM_FREE gates; cursor.
  main.ts `controls.setDraftPanel(draftOverlay)`. typecheck 0. Tests NOT yet written.

- BUG 1 TESTS: `src/input/controls.footerArrowLayer.test.ts` (15 green) — real Controls + real
  FooterBand; tiers 5/6/7 + every tier: the card over the tab arms and the footer stays up; cursor
  / click / surface agree; same point with no menu collapses; re-click the chip then the tab works;
  the two-card SEAM is the tab's (pinned, flagged); collapsed with a stale selection.
  MUTATION (by hand, restored): `isOverCollapseTab` layer clause -> `return true` => 7 red.
  footerCollapse.test.ts BandModel transcription follows the new clause (openCards, empty).
- S182 tripwires (`s182UiSurfaceGuards.test.ts`, 12 green): draft predicates by name; GATE A draft
  guard precedes every acting handler (whole onDown, bounded by onMove); GATE B/C/D; wiring.

- BUG 2 TESTS: `src/input/controls.draftPanel.test.ts` (150 green) — real Controls + real
  DraftOverlay + real FooterBand. 7 scenarios (armed stamp, own gatherer, RMB raid, LMB card,
  spark drag release, potato release, Ra cast) x seats x 6 derived points, each run PRE-FIX (panel
  drawn, unwired: anti-vacuity), OPEN (no board action; tower stays armed; Ra keeps aiming) and
  CLOSED (wired == unwired). One-click test: pick + nothing else. isOver covers every drawn Graphics
  incl. the tip plate below the panel; tip swallows only while drawn; cursor pointer on live tiles.
  MUTATIONS (by hand via scratchpad/mutate.py, each restored byte-for-byte): onDown guard -> 42 red;
  PLACE_FROM_FREE clause -> 6 red; potato clause -> 6 red; cursor clause -> 1 red; isOver
  plate-only -> 2 red; isOver ignoring visibility -> 1 red.

## IN PROGRESS / NEXT
- GATES on this tree (f46ac49): TYPECHECK_EXIT=0; VITEST_EXIT=0 (349 files / 5866 tests);
  BUILD_EXIT=0, entry 926.4 KiB (cap 1000, headroom 73.6; racial-c was 925.6 -> +0.8 KiB).
  Benign, ruled: the vitest run rewrote `pentagramBuildability.test.ts.snap` with LF endings only
  (`git diff --stat` empty); restored with `git checkout --`.
- MERGE PREVIEW (`git merge-tree --write-tree master HEAD`, no refs touched): ONE conflict, in
  `src/render/draftOverlay.ts`, at the end of the class — master's (s188/cards) `layoutText` vs this
  branch's `isOver` / `isOverChoosable`. Resolution: keep both; on master's panel `isOverChoosable`
  must read `this.opts !== null && draftHitTest(x, y, this.opts) !== null` (`offered` is gone there;
  tsc fails loudly until it is changed). main.ts auto-merges.
- NEXT: browser look on a random port.

## KNOWN-BROKEN
- nothing known.
