# S188 P2 · `s188/cards` — running progress (salvage file)

## DONE
- `scripts/build-upgrade-cards.py` — downscales the 16 source cards (4 general + 6 L0 + 6 L5) to
  502×484 lossy WebP (q82), cover-fit TOP-anchored. `l10-vampires` deliberately NOT built.
- `public/art/upgrade-cards/*.webp` — 16 cards, 1012.7 KB total (43–87 KB each).
- `src/render/draftOverlay.ts` rewritten: cards lazy-loaded, title hidden when a card is shown,
  `drawAxisGlyph` deleted, racial tile choosable when `opts.racial !== null`, `draftHitTest(x, y, opts)`,
  `pickForTile`, `draftTileViews`, `drawsOwnTitle`, `coverFitTop`, `seatMustStillPick` replaces `/ 5`,
  PLAYING gate, constructor seams `{ optionsFor, loadCard }` for tests.

- `src/render/draftOverlay.test.ts` rewritten — 50 tests: 3-arg hit-test in BOTH racial states,
  card files on disk (16, 502x484, <=150 KB, no l10, no strays), fill enumeration widened to any
  `.fill(` (5 fills), and the CLASS driven for real (stub OffscreenCanvas + injected offer/loader).
  typecheck 0, this file 50/50.

- Hover lighting tied to choosability (`litRacial = liveRacial && hover === 'racial'`), tested via
  the Graphics instruction list. 51/51.
- Mutation tests: 9 of 10 mutants killed (dead tile in hit-test, racial sprite given the general card,
  title always drawn, shared h2 style, a sneaky `.fill(0xffffff)`, `/ 5` arithmetic restored,
  stale lit tile, no lit tile, PLAYING gate removed). Survivor: the tap handler's `pickForTile`
  belt — an equivalent mutant, the hit-test already refuses the dead tile.

- MANIFEST.md updated (orcs L5 ruled, L5 cards landed, wiring decision implemented, WIRED table with
  KB per card, l10 not shipped). Canon notes in `.claude/plans/S188_CANON_NOTES_cards.md`.

- LOOKED at the running game (vite on port 22492, Browser pane, solo vs 1 Player):
  - registry as committed (all BUILT false): TOUGHER card, no overlay title, +10% HEALTH in the bottom
    band; right tile = dimmed COMING SOON + '?'; hovering it shows NO tip; hovering TOUGHER shows its tip.
  - registry flipped IN THE PAGE ONLY (module object, not the file): BLOOD DEBT card + LIFESTEAL 20%
    in race colour, hover tip = its RACIAL_PERK_COPY detail, click -> draftPicks ['racial'];
    wave 6 -> ARMOURED + CRIMSON TIDE, click -> ['racial','racial']; nagas L0 DEEP CURRENT;
    orcs L5 THE HORDE GROWS; demons wave 16 (L15) -> PIERCING + COMING SOON (correct, undesigned).
  - no general art on the racial tile, no race tint leaking onto the general line.
- A first full-gate run (before the cutoff) read TYPECHECK 0 / VITEST 0 (5664/343) / BUILD 0 (923.0 KiB);
  being RE-RUN now per the coordinator — do not trust it.

## IN PROGRESS
- re-run of the full gates.

## NEXT
- final clean commit + report.

## KNOWN BROKEN
- nothing known. Full vitest + build not yet run.
