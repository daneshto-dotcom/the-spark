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
  superseded by the re-run below.

- RE-RUN after the cutoff, exit codes captured: TYPECHECK_EXIT=0 · VITEST_EXIT=0 (5664 tests / 343
  files) · BUILD_EXIT=0 (main entry 923.0 KiB; base 87f3dc4 measured 919.8 KiB -> +3.2 KiB; 77.0 KiB
  headroom). vitest rewrites `pentagramBuildability.test.ts.snap` with CRLF on Windows — content
  identical ignoring CR, restored, not committed.

- FIX ROUND (independent audit):
  - F2 `2d8bd6a` — pointertap ignores every button but 0 (Pixi v8 taps on RMB/MMB; RMB is put-it-back
    / raid). `tap()` helper sends button 0; new test: buttons 1 and 2 pick nothing on either tile.
    Mutant (guard removed) -> 1 failed / 51 passed.
  - F3 `07eb0d4` — `pointerleave` clears hover. New test. Mutant (handler removed) -> 1 failed / 52.
  - F4 — this file's stale gate line, and the FILLS row for the hover plate (drawn BELOW the panel).
  - Per the coordinator: NO is-over-panel predicate, controls.ts untouched (`s188/input-layer` owns F1).
  - ⚠ Correction: git-bash `grep -c $''` reported these files as CRLF; a Python byte count shows
    they are LF on disk and in every blob (base included). No EOL change was ever made.

## IN PROGRESS
- final gates after the fix round.

## NEXT
- merge owner: land `.claude/plans/S188_CANON_NOTES_cards.md`; run e2e on the merged tree.

## KNOWN BROKEN
- nothing known. Full gates were run and exit 0 (see above); re-run after the fix round below.
