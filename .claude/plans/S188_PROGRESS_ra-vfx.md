# S188 — branch `s188/ra-vfx` — progress log (implementation agent)

Brief: the owner's new ART for the Ra sky strike (Pharaoh ritual + POWER OF RA share `drawRaColumns`)
and the WRATH OF RA upgrade card. MECHANICS DO NOT CHANGE.

STATUS: **STOPPED ON THE COORDINATOR'S SESSION-CLOSE ORDER.** The art, the card and the renderer
wiring are all committed and compile. The dedicated tests and the full gate run are NOT done yet.

## Done (committed)
- 15368ec — the two source images committed
- eed75b1 — WRATH OF RA card: `l10-mummies-raw.png` cropped to box (88,88,936,936) ->
  `assets-source/upgrade-cards/l10-mummies.png` 848x848; `build-upgrade-cards.py` lists `l10-mummies`;
  `public/art/upgrade-cards/l10-mummies.webp` 502x484 q82 = 59.1 KB (the other 16 rebuilt
  byte-identical). `draftOverlay.test.ts`: `AHEAD_OF_THEIR_PERK = ['l10-mummies']` (union with
  `referenced`, exactly 17 shipped either merge order). `check-upgrade-cards.mjs` + MANIFEST.md updated.
  draftOverlay + racialPerks tests: 66/66 green.
- 0090a0f — strike atlas: `scripts/build-light-sheet-atlas.mjs` (new third intake),
  `assets-source/ra-strike/atlas-specs.json`, `public/art/ra-strike/ra-strike-atlas.png`
  (2568x448, 1,680 KB) + `ra-strike-anim.json`; `check:atlas` extended with
  `--no-size --dark-bg public/art/ra-strike` (scenery 0 px, letterbox 0 px, exit 0).
- (this wip commit) — `src/render/raStrikeArt.ts` (timeline, loader, drawer) + `bossAuras.ts`
  `drawRaColumns` wired to it; the manifest's `beamTop` now records the CUT row (intake patched).
  `npm run typecheck` exit 0; `bossAuras.test.ts` + `powerOfRaRender.test.ts` 20/20 green (the
  fallback path is byte-for-byte the pre-S188 drawing, which is what those tests exercise).

## Frame mapping (relative to the column's impact tick, `raColumnImpactTick(until, k)`)
slots 0-3 = sheet 1-4 ring, 18 t each, -120..-49 · 4-5 = sheet 5-6 beam drop, 6 t, -48..-37 ·
6-8 = sheet 7-9 beam in ring, 12 t, -36..-1 · 9 = sheet 10 FLASH on the impact tick, 6 t ·
10-13 = sheet 11-14, 6 t · 14-18 = sheet 15-19 mushroom, 8 t · 19-22 = sheet 21-24 fade, 10 t
(ends +110). Sheet frame 20 DROPPED (23 frames ship). Pre-impact sum = 120 = RA_COLUMN_TICKS.

## NEXT SESSION MUST DO (in order)
1. Write `src/render/raStrikeArt.test.ts`:
   - timeline: pre-impact sum === RA_COLUMN_TICKS; `raStrikeFrameAt(impact, impact) === 9`;
     impact-1 -> 8; impact-120 -> 0; impact-121 -> null; impact+109 -> 22; impact+110 -> null.
   - manifest pinned: `frameTicks` === RA_STRIKE_FRAME_TICKS, `impactFrame` === 9, `sourceFrames`
     23 long without 20 and `sourceFrames[9] === 10`, states strike 12 / aftermath 11, PNG IHDR =
     cellW*12 x cellH*2, `beamTop` non-null exactly for sheet frames 5-14,
     `raStrikeDrawScale(blastWidthPx) * blastWidthPx === 2 * RA_COLUMN_RADIUS`.
   - sprite path via `setRaStrikeArtForTests(fakeArt)` (recorder needs `texture` + `setFillStyle`):
     a channelling Pharaoh and a player strike with the SAME `until` pick the SAME slot sequence,
     equal to `raStrikeFrameAt(tick, raColumnImpactTick(until,k))` at window start / impact-1 /
     impact / impact+50; the tail draws at impact+50 (fallback draws nothing there).
   - missing atlas: `setRaStrikeArtForTests(null)` -> Pharaoh ritual draws, no `texture` op, no throw.
   - `afterEach(() => setRaStrikeArtForTests(null))` so no other test file sees injected art.
2. Update the docblock of `build-light-sheet-atlas.mjs` point 3/4 to mention the POOL attenuation,
   the hue-preserving blend for bright pixels and the THIN-ink (erosion) rule (code has them; prose lags).
3. Gates, each exit code captured: `npm run typecheck`, `npx vitest run`, `npm run build`
   (report bundle KiB), `npm run check:atlas`.
4. Look at it in the browser pane (port from the random-port rule, never 5173), force a strike via
   `__SPARK__`, check the sky-continuation join (possible 1-px seam where the strip meets the cut).

## Findings to report to the merge owner (not fixed — out of scope)
- ⚠ The Pharaoh's 5th column never shows its explosion: `runPharaohRitual` removes him on the 5th
  impact tick, so `drawRaRitual` has nothing to derive from after it (pre-existing — the old code
  flash was equally lost). Needs a sim/wire change to fix; not an art change.
- ⚠ The strike draws into `goblinRenderer.graphics`, which is UNDER the unit sprites, so a mushroom
  cloud sits behind units standing north of it. Layering above units needs a new display layer
  (the fogHiddenLayer index hazard) or the arrowLayer path — left as is.
- The atlas is 1,680 KB (static, outside the bundle cap; the Pharaoh's own atlas is 4.4 MB). Fetched
  lazily on a Pharaoh on the board / a called strike / an aim.
