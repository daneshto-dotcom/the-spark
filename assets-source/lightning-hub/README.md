# `assets-source/lightning-hub/` — what each file is, and which one ships

## `hub-transitions-24.png` — **THE SOURCE. This is the one that ships.**

1908×824, 8 cols × 3 rows, read in reading order as ONE continuous 24-frame ramp: frame 1 pristine →
frame 24 rubble. `scripts/build-sheet-atlas.mjs` turns it into
`public/art/lightning-hub/lightning-hub-{atlas.png,anim.json}` (2 rows × 12).

⛔ **Its grid does NOT divide evenly** — measured cell widths 254·255·252·253·252·246·**198·184** and
heights 270·265·285. Cell bounds are DETECTED from the drawn rules; `grid: {cols: 8, rows: 3}` in
`atlas-specs.json` is an ASSERTION against that detection, never its source.

## `hub-drone-states.png` — **REFERENCE ONLY. Deliberately not packed.**

1536×1024, 2 rows × 3 cols: hub full/damaged/destroyed on top, drone healthy/hurt/explosion beneath.

⭐ **It is not used, and that is a decision rather than an oversight.** Three reasons, in order of
how hard each would be to undo:

1. ⛔ **Its top row is already in the sheet that ships, and worse.** The three hub states here are
   three stills; `hub-transitions-24.png` carries the same three conditions as a 24-frame ramp
   between them, which is what R182-D asks for (*"you don't skip them, you just run them through"*).
   Packing the stills would give the hub a second, coarser source of truth for its own damage state.
2. ⛔ **It is not packable as it stands.** It is a presentation plate, not art: engraved LABEL PLATES
   ("LIGHTNING HUB", "— FULL HEALTH —"), grass tufts, a rubble skirt, and **a red/black HEALTH BAR
   drawn over the HURT drone**. The matte has no way to tell a drawn health bar from the drone, so it
   would ship welded to the sprite — and the game draws the real bar itself.
3. ⚠ **Its background is CREAM (231,231,218), not the (0,10,17) of the transitions sheet.** MEASURED —
   and worth stating because the S182 brief asserted both files shared the dark background. A
   `--dark-bg` matte pointed at this file would key nothing and ship the whole cream rectangle.

⭐ **What it IS good for: the DRONE.** The bottom row (healthy / hurt / explosion) is the only art
that exists for the lightning drone, which today borrows the Voltkin zap sprite. When the owner wants
the drone done, this is the reference to generate from — as a UNIT sheet (`ART_PIPELINE.md`: a unit
needs idle/walk/attack/die), not as the building sheet this directory otherwise holds.

## `atlas-specs.json`

The build spec. `node scripts/build-sheet-atlas.mjs assets-source/lightning-hub/atlas-specs.json`.
