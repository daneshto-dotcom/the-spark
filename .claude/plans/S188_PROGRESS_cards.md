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

## IN PROGRESS
- mutation tests of the guards.

## NEXT
- MANIFEST.md stale lines; `.claude/plans/S188_CANON_NOTES_cards.md`.
- Gates: typecheck, vitest, build. Dev server on a random port + screenshot of the panel.

## KNOWN BROKEN
- nothing known. Full vitest + build not yet run.
