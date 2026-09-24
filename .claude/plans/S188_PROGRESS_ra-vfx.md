# S188 — branch `s188/ra-vfx` — progress log (implementation agent)

Brief: the owner's new ART for the Ra sky strike (Pharaoh ritual + POWER OF RA share `drawRaColumns`)
and the WRATH OF RA upgrade card. MECHANICS DO NOT CHANGE.

STATUS: **S190 — READY FOR THE MERGE OWNER (merge AFTER `s188/wrath`, train B).** Tests written,
gates green before AND after `git merge master`, mechanics diff empty — see the S190 section. Still
OPEN (not in the S190 brief): NEXT-SESSION item 2 (atlas-script docblock) and item 4 (browser look).
(S188 status, superseded: stopped on the coordinator's session-close order, tests + gates not done.)

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

## S190 — worktree agent `s188-ra-vfx` (brief: PDR §5.5 of `2026-09-24_S189_BATCH_PDR.md`)

Scope of THIS run, exactly: (1) the owed `raStrikeArt.test.ts`, (2) gates on the branch as-is,
(3) `git merge master` into the branch + gates again, (4) mechanics-unchanged diff check. NOT in
scope, left for the merge owner / a later session: NEXT-SESSION items 2 (atlas-script docblock) and
4 (browser-pane look) above. Never pushed; never touched `master`, wrath, or sibling worktrees.

### Step 1 — DONE — `src/render/raStrikeArt.test.ts`, 15 tests, 15/15 green (new file, LF)
- THE CLOCK: pre-impact sum === `RA_COLUMN_TICKS` (and `RA_STRIKE_LEAD_TICKS`); impact → 9,
  impact−1 → 8, impact−120 → 0, impact−121 → null, impact+109 → 22, impact+110 → null.
- THE MANIFEST (read from `public/art/ra-strike/`): `frameTicks` === code, `impactFrame` 9,
  `sourceFrames` 23 w/o 20, `droppedFrames` [20], `sourceFrames[9]` 10, states strike 12 /
  aftermath 11, PNG IHDR 2568×448 = cellW×12 × cellH×2, `beamTop` non-null for sheet 5-14 exactly,
  `raStrikeDrawScale(196)×196 ≈ 140`; `raStrikeArtFrom` on the shipped manifest slices 23 frames
  (strips exactly where `beamTop`); a re-timed manifest / wrong `impactFrame` is REFUSED (null).
- REACH (real code path, `drawBossAuras` → `drawRaColumns` → `drawRaStrikeFrame`, with the REAL
  sliced art injected via `setRaStrikeArtForTests`): a called strike and a channelling Pharaoh with
  the SAME `until` put the same (column, slot) pairs on screen at window start / impact−1 / impact /
  impact+50, equal to `raStrikeFrameAt(tick, raColumnImpactTick(until,k))`; column 0 reads
  [0, 8, 9, 16] (anti-vacuity). Each sprite is inverted back to its anchor and matched to the sim's
  own landing spot. The beam continuation: 16 strips (`RA_BEAM_SKY_BANDS`), strictly fading, first
  band's bottom AT the cut; none at impact+50. The tail: at impact+50 the fallback draws nothing on
  column 0 while the art draws slot 16. Painter's order: a pair where the LATER column is farther up
  the screen is painted later-column-first.
- NEGATIVE: art null → the Pharaoh telegraph + the pre-S188 code shaft draw, zero `texture` ops, no
  throw; a Graphics with NO `texture`/`setFillStyle` methods does not throw across three ticks.
- `afterEach(() => setRaStrikeArtForTests(null))`.
- ⭐ MUTATION-TESTED (then restored byte-identical, `cmp` verified):
  · M1 `raColumnImpactTick(until, k)` → `(until, 0)` in `bossAuras.ts` → 2 tests RED (the same-slot
    REACH test and the beam-strip test). This is the ONE guard the brief asks for.
  · M2 the painter's-order `sprites.sort(...)` removed → the painter test RED.
- ⚠ Design note (MINE): a column lives 230 ticks and they fall 120 apart, so at most TWO strike
  sprites are ever on screen at once — the painter test was first written for 3 and went red on
  anti-vacuity, which is how that number was found.

### Step 2 — DONE — gates on the branch AS-IS (at 046791a, before the master merge)
Each exit read from a captured `$?`, output redirected to a file (never a pipe):
- `npm run typecheck` → **TYPECHECK_EXIT=0**
- `npx vitest run` → **VITEST_EXIT=0** — 356 files / **5866 tests** passed, 0 failed
- `npm run build` → **BUILD_EXIT=0** — main entry **936.5 KiB**, cap 1000 KiB, headroom 63.5 KiB
  (this is the branch's OLD base b5c9fc9 + the branch; master's own number is measured after the merge)
- ⭐ The branch's own bundle cost (MINE, measured with `esbuild --minify` on the module alone):
  `raStrikeArt.ts` 2,280 B + the `bossAuras.ts` delta 476 B (3,804 → 4,280 B) ≈ **2.7 KiB** — well
  inside the 10 KiB allowance. The 1,680 KB atlas PNG + 1.4 KB manifest are STATIC assets under
  `public/art/ra-strike/`, fetched lazily by `ensureRaStrikeArt()` (`fetch` + `Assets.load`) on the
  first Pharaoh drawn / strike drawn — never in the initial bundle.
- Benign, named: git's `LF will be replaced by CRLF` warnings on `git add` (autocrlf on a new LF
  file — the index stores LF; not a failure). Grep for `×` in the logs also matches the test TITLE
  "IHDR = cellW×12", not a failure.

### Step 3 — DONE — `git merge master` (cf40f41) into the branch → merge commit a7a894b
- **ZERO textual conflicts.** The branch's 17 files and master's 158 changed files since b5c9fc9
  are DISJOINT (`comm -12` of the two `--name-only` lists is empty). The one master change on the
  Ra path is `src/state/racial/powerOfRa.ts` (racial-a's `damageConnector(..., null)` attacker arg)
  — sim-side, no render-path effect. Master changed no `package.json` / lockfile, so no reinstall.
- Gates on the MERGED tree (a7a894b), each from a captured `$?`:
  · `npm run typecheck` → **TYPECHECK_EXIT=0**
  · `npx vitest run` → **VITEST_EXIT=0** — 368 files / **6011 tests** passed, 0 failed
  · `npm run build` → **BUILD_EXIT=0** — main entry **946.3 KiB**, cap **1100 KiB**, headroom
    **153.7 KiB**. Against the brief's master headroom of 155.8 KiB, this branch costs **2.1 KiB**.
- Benign, named: `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` showed as
  ` M` after the merge with an EMPTY `git diff` — the unit suite rewrote the checked-out snapshot
  with LF during the pre-merge run (mtime 16:10:09 = that run); content identical to HEAD's blob
  (0 CRs in both). `git add` refreshed the index stat; nothing staged, tree clean.
- Follow-up commit (post-merge): the four `.raStrike!` reads in `raStrikeArt.test.ts` folded into
  ONE helper `castStrike(w)` — see the wrath prediction below. Typecheck 0, file 15/15.
  Re-run on the tip bc37cdb: `npx vitest run` → **VITEST_EXIT=0**, 368 files / 6011 tests.
  (Build not re-run: bc37cdb changes only a test file and this log; a7a894b's build stands.)
  `npm run check:atlas` on the merged tree → **ATLAS_EXIT=0** (ra-strike: scenery 0 px, letterbox 0 px).

### Step 4 — DONE — mechanics unchanged
- `git diff b5c9fc9 11ab8ac -- src/state src/net src/bots` (the branch's OWN commits) → **empty** (0 lines).
- `git diff master HEAD -- src/state src/net src/bots` (after the merge) → **empty** (0 lines).

### ⭐ For the merge owner — the Ra drawing path, and the `s188/wrath` prediction (READ-ONLY)
Files this branch touches on the Ra drawing path / the `l10-mummies` card:
`src/render/bossAuras.ts` (`drawRaRitual` + `drawRaColumns` + one import), `src/render/raStrikeArt.ts`
(new), `src/render/raStrikeArt.test.ts` (new), `src/render/draftOverlay.test.ts`
(`AHEAD_OF_THEIR_PERK = ['l10-mummies']`), `public/art/upgrade-cards/l10-mummies.webp`,
`assets-source/upgrade-cards/{l10-mummies.png,l10-mummies-raw.png,MANIFEST.md}`,
`scripts/{build-upgrade-cards.py,check-upgrade-cards.mjs}`, `public/art/ra-strike/*`,
`assets-source/ra-strike/*`, `scripts/build-light-sheet-atlas.mjs`, `package.json` (`check:atlas`).
Prediction against the CURRENT `s188/wrath` tip c72b7ad, by `git merge-tree --write-tree` (writes no
ref, merges nothing):
- `bossAuras.ts` is the ONLY file both branches touch, and it **auto-merges cleanly** (wrath's hunks
  are the `raCastsInWave` import and `drawPowerOfRa`; mine are the `raColumnImpactTick` /
  `raStrikeArt` imports, `drawRaRitual` and `drawRaColumns`).
- ⚠ `draftOverlay.ts` + `save.ts` conflict for wrath-vs-master ALREADY (same result with or without
  this branch) — that is wrath's merge, not this one.
- ⛔ **SEMANTIC break, not textual: wrath turns `Player.raStrike` into `Player.raStrikes: RaStrike[]`.**
  After wrath lands, `raStrikeArt.test.ts` fails `tsc` at ONE line — `castStrike()`'s
  `return w.players.get(P0)!.raStrike!;` → `return w.players.get(P0)!.raStrikes[0]!;` (the same edit
  wrath made in `powerOfRaRender.test.ts`). wrath's `raStrikeColumnPos(seat, k, aim, charge = 0)`
  defaults the charge to 0 (read at c72b7ad), and the test's single cast IS charge 0, so its 3-arg
  calls stand unchanged. Nothing in `bossAuras.ts`'s merged `drawRaColumns` needs touching: wrath
  calls it once per charge with that charge's `untilTick`, and every frame is derived from `until`.

## S190 FIX ROUND — the coordinator's audit (RAVFX-1, -8, -7, -10, -5), one commit each
Order worked: 1 → 8 → 7 → 10 → 5. Gates + `check:atlas` after the last one. RAVFX-6 (painter's order
across separate `drawRaColumns` calls) is NOT in this round — it becomes real only once wrath's
per-charge calls exist; the merge owner handles it after wrath. ⭐ MERGE ORDER CHANGED: wrath relies
on THIS branch to ship `l10-mummies.webp`, so `s188/ra-vfx` now merges BEFORE `s188/wrath`.

### RAVFX-1 (MED) — DONE — the sawn-off flat tops on sheet frames 21-23 (slots 19-21)
- Confirmed first by probing the shipped atlas: slot 19's cell-top row was alpha 241 across 73 px,
  slot 20's 84 across 99 px, slot 21's 30-42 — three hard horizontal tops (the source cell edge).
- Baseline: the UNCHANGED script rebuilt the committed atlas **byte-identically** (`cmp`), so every
  pixel that moved below is this fix and nothing else.
- `scripts/build-light-sheet-atlas.mjs`: `process(..., feather_top)` — the top edge is feathered
  over `featherPx` for every frame NOT in `beamFrames` (beam tops stay hard: the renderer continues
  them). ⛔ New TOP-EDGE GUARD: the build FAILS (exit 2) if any non-beam kept frame has alpha >
  `topEdgeMaxAlpha` (40) in its first `topEdgeGuardRows` (2) source rows. Both dials are explicit in
  `atlas-specs.json`. The manifest gains `cellTop` (per slot, the output row the source cell's top
  landed on; a beam slot's `beamTop` equals it). The docblock's feather bullet is corrected here
  (the rest of the intake docblock is RAVFX-10).
- Rebuilt: pixels changed ONLY in slots 19-21 rows 2-9 (the feather ramp: slot 19 now 0/32/64/…/255
  by row 10) and one stray alpha-8 row in slot 17 (now floored). 2,417 px total. PNG 1,719,388 →
  1,720,130 B. Build log: `touching the cell top` is now exactly the beam frames 5-14 (21 dropped out).
- `raStrikeArt.test.ts` re-pinned where it pins the manifest: a new test DECODES the shipped PNG
  (`node:zlib`, 8-bit RGBA only — the unit suite has no pixel toolchain) and asserts every non-beam
  slot's top rows ≤ the spec's limit, every beam slot's `beamTop === cellTop`, plus anti-vacuity
  (the fire column is still ≥ 200 alpha `featherPx` rows down; a beam top is still ≥ 200). 16/16.
- ⭐ MUTATION-TESTED: (a) the top feather disabled → the intake build exits **2** on the guard
  ("frame 21 reaches its cell top at alpha 255"); (b) the OLD atlas put back → the new unit test RED
  ("slot 19 … expected 241 to be ≤ 40"). Both restored, `cmp`-verified.
- `check-atlas-scenery.mjs --no-size --dark-bg public/art/ra-strike` → exit 0 (clean).
- Benign, named: Windows Python cannot open a `/c/...` POSIX path (FileNotFoundError on a probe
  script) — re-run with the `C:/...` form; a `—` in a Python print showed as `�` under the console
  code page, so the new print/fail strings are ASCII.

### RAVFX-8 (LOW) — DONE — the seam at the sky-continuation join
- Confirmed on the shipped atlas: slots 6-11's cut row (`beamTop` 11) is alpha 72-96 of 255 (row
  max) with row 12 at 255 — the gutter's anti-aliased edge row, left translucent between the opaque
  strip above and the opaque beam below.
- `src/render/raStrikeArt.ts` `drawRaStrikeFrame`: band 0 of the continuation now reaches DOWN under
  the cut by `RA_BEAM_STRIP_INSET × scale` (the two atlas rows between the cut and the strip's own
  sample row); it is drawn before the sprite, so the sprite composites over an opaque beam there.
  `RA_BEAM_STRIP_INSET`'s docblock and the intake's matching comment corrected (both said the
  continuation stops AT the cut so nothing is drawn twice).
- Test re-pinned (the join assertion): band 0 at full alpha, top = cut − band, bottom = cut + inset ×
  scale, every other band abutting the one below (no gap), and the sky drawn before the sprite.
- ⭐ MUTATION-TESTED: `under = 0` → RED ("expected 283.569 to be close to 284.998"); restored, `cmp`.

### RAVFX-7 (LOW) — DONE, IMPLEMENTED (not a docblock retreat) — prefetch before the first strike
- Confirmed: `ensureRaStrikeArt()` was called only from `drawRaRitual` (a sighted Pharaoh) and
  `drawRaColumns` (a strike's first frame); the aim path never asked, so the docblock and this file
  claimed a prefetch that did not exist.
- `src/render/bossAuras.ts` `drawPowerOfRa` (render-only, my own file): `ensureRaStrikeArt()` when any
  seat's `raceId` is `'mummies'`, and again on entering the aim branch (before the refusal check —
  the aim preview only exists once the player has pressed the Ra button). The loader latches, so this
  is one fetch per session. `raStrikeArt.ts`'s `ensureRaStrikeArt` docblock now names every caller.
- Tests (3, `vi.resetModules()` + a fresh module per case, `document` and a never-answering `fetch`
  stubbed AFTER import): a mummies seat in BUILD with no strike/Pharaoh/aim fetches the anim JSON
  exactly once across two frames; an orc-only board with an aim set fetches; an orc-only board with
  nothing fetches nothing and draws nothing (negative). 19/19. `npm run typecheck` exit 0.
- ⭐ MUTATION-TESTED: the mummies-seat call removed → that test RED; the aim call removed → the aim
  test RED. Restored, `cmp`-verified.

### RAVFX-10 (LOW) — DONE — the intake docblock now says what the code does
- `scripts/build-light-sheet-atlas.mjs` points 3-4 rewritten against the Python they describe:
  the wash is estimated only from the left/right edge columns — and the old reason ("the top of every
  cell is black sky") was FALSE (beam frames 5-14 and the fire column of 21-23 cross it), now
  replaced by the true one; THE POOL (edge-lit rows, monotone-down weight, ellipse attenuation,
  alpha-ramped so art is untouched, ink never attenuated); the top feather + guard; `alphaFloor`;
  the HUE blend for bright pixels; the THIN-ink (two-erosion) rule and why a dim BLOB is background.
  The manifest contract paragraph now lists `cellTop` (added in RAVFX-1). This closes S188's
  NEXT-SESSION item 2.
- Comment-only: the rebuild's atlas PNG and manifest are `cmp`-identical to RAVFX-7's; `node --check`
  exit 0.

## Findings to report to the merge owner (not fixed — out of scope)
- ⚠ The Pharaoh's 5th column never shows its explosion: `runPharaohRitual` removes him on the 5th
  impact tick, so `drawRaRitual` has nothing to derive from after it (pre-existing — the old code
  flash was equally lost). Needs a sim/wire change to fix; not an art change.
- ⚠ The strike draws into `goblinRenderer.graphics`, which is UNDER the unit sprites, so a mushroom
  cloud sits behind units standing north of it. Layering above units needs a new display layer
  (the fogHiddenLayer index hazard) or the arrowLayer path — left as is.
- The atlas is 1,680 KB (static, outside the bundle cap; the Pharaoh's own atlas is 4.4 MB). Fetched
  lazily, once: on a Pharaoh on the board, a mummies seat in the match, a player aiming, or (last
  resort) a strike's first frame. ⚠ S190 RAVFX-7: until then the "an aim" part of this line was
  FALSE — only the Pharaoh and a strike's first frame asked; it is now implemented and tested.
