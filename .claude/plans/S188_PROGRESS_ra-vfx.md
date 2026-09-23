# S188 — branch `s188/ra-vfx` — progress log (implementation agent)

Brief: the owner's new ART for the Ra sky strike (Pharaoh ritual + POWER OF RA share `drawRaColumns`)
and the WRATH OF RA upgrade card. MECHANICS DO NOT CHANGE.

## Steps
- [x] 15368ec — commit the two source images (ra-strike-sheet-v1.png, l10-mummies-raw.png)
- [x] npm install
- [ ] WRATH card: crop raw -> assets-source/upgrade-cards/l10-mummies.png; build 502x484 q82 webp
- [ ] strike atlas: intake script + spec -> public/art/ra-strike/ra-strike-atlas.png + -anim.json
- [ ] check:atlas wired for public/art/ra-strike (--no-size --dark-bg)
- [ ] renderer: sprite frames in drawRaColumns, derived from impact tick + world.tick, fallback kept
- [ ] tests: shared timing mapping (Pharaoh + player), missing-atlas fallback, manifest pinned
- [ ] gates: typecheck, vitest, build, check:atlas
- [ ] look at it in the browser pane

## Decisions / measurements
(filled in as they land)
