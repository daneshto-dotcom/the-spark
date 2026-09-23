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
- (nothing yet)

## IN PROGRESS / NEXT
- Bug 1: layer the tab under the open cards in `FooterBand.isOverCollapseTab` (the ONE predicate
  the click router, `isOverChip` and `isOverBandSurface` all read).
- Bug 2: `DraftOverlay.isOver` / `isOverChoosable`, `Controls.setDraftPanel`, gates in onDown /
  potato / PLACE_FROM_FREE / cursor, main.ts wiring.

## KNOWN-BROKEN
- nothing known.
