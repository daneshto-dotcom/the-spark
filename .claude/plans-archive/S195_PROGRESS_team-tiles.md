# S195 PROGRESS — team-tiles (N19)

**NEXT STEP:** DONE (fix round) — handed back to the merge owner.
Fix-round gates (exit codes from files): typecheck 0 · vitest --maxWorkers=3 0 (9151 passed / 13 skipped, 610 files) · build 0, entry 1223.3 / 1350 KiB (+3.5 vs #8) · e2e:gating 0 (67 passed, hashed port) · teams-lobby 0 (2 passed). Bump NO. With the flag OFF the deploy is visually byte-identical to #8.

## FIX ROUND (auditor: main `.tmp-audit/AUDIT_team-tiles.md`)
- MED-1: `TEAM_SEAM_BLEND_LEGACY_ART = false` (OFF until he approves `SPARK_S195_TeamTiles/COMPARE_*`) — the deploy changes nothing visible; tests drive the blend with the flag explicitly / via the tile path; defaults test pins `false`; new test pins the plain 3v1 plan.
- LOW-1: `pruneBaked` keeps a bake still ON a sprite (not a loaded asset) so it is freed on a later prune after the swap; new test "2v2 → 3v1 rematch whose SE race loads late" (stub 2D canvas): 0 orphans while waiting, 0 after, labels = this match's art. Mutations: M5 (revert prune) RED, M6 (flag on) RED (`.tmp-gates/mutate2.log`). Also cures master's pre-existing single-orphan path.
- LOW-2: Desktop README corrected (the session converts to 480x270; blend OFF until approval); manifest test asserts each listed WebP header is 480x270.


## FINAL REPORT (team-tiles, N19)
- Branch `s195/team-tiles`; master d712ad1a merged (docs only, no conflicts); tip = the commit carrying this line.
- Item 1: 29 files = 27 usable trios (cards 1–13, 15–28, generated in sheet order) + `mLOs2 (1)` byte-identical dup + `hqBp3` 0-byte (card 14 Demons·Nagas·Vampires MISSING). All kept the NW quarter plain; ~9 paint an oversized dark quarry disc; 9vbUs puts it on the south seam.
- Item 2 verdict: side-by-side with today's art + the new seam cross-fade beats the hard step, but today's 4p art is HORIZON-VIEW (sky per quadrant) → a trio reads as stacked postcards; his Grok trios (top-down) read as one world → generate the SIX top-down tiles. Pair art beats tiles for pairs. Frames + COMPARE sheets + README: `C:/Users/onesh/OneDrive/Desktop/SPARK_S195_TeamTiles/`.
- Item 3: `C:/Users/onesh/OneDrive/Desktop/SPARK_Six_Race_Tiles_Prompts.html` (Grok, 6 cards).
- Item 4: `TEAM_TILE_RACES` manifest (EMPTY) + `teamTileUrl` → `public/art/race-zones/tiles/<race>.webp` (480×270; folder holds `.gitkeep`); trio uses tiles when every trio race has one; seam cross-fade baked once (`blendSeams`, reflected teammate band, 0.5→0 over `TEAM_SEAM_FEATHER` 0.22) only between TEAMMATES on single-quadrant art; listed tile that fails to load → `failed` set → today's art. FFA / pitch / solos / 2v1 solo half / pairs unchanged.
- Tests: `src/render/teamTiles.test.ts` (resolver table, defaults pinned, REACH via real `sync` + real `Assets.load` path, missing-file fallback, wait-for-neighbour, FFA negative ×2); `zoneBackgroundRenderer.test.ts` bake-call guard re-pinned; `teams.sites.test.ts` census +2 predicate / +1 seat-var (classified). Mutations M1 enemy-seam, M2 all-or-none, M3 failed-fallback, M4 legacy flag → all RED (`.tmp-gates/mutate.log`).
- Gates (exit codes from files): typecheck 0 · vitest --maxWorkers=3 0 (9149 passed / 13 skipped, 610 files; round 1 had 2 census reds → fixed) · build 0, entry 1223.2 / 1350 KiB (+3.4 vs #8's 1219.8) · e2e:gating 0 (67 passed, hashed port) · teams-lobby 0 (2 passed). fog.spec roll call untouched (no new layer).
- BUMP: NO — render-only, reads synced state, writes nothing.
- MINE: `TEAM_SEAM_BLEND_LEGACY_ART = true` (today's 3v1 art now cross-faded — the only visible change on deploy); `TEAM_TILES_FOR_PAIRS = false`; trio tiles all-or-none; `TEAM_SEAM_FEATHER = 0.22`; tiles stored 480×270; FFA keeps today's art.
- Merge seams: canon §5d BACKDROPS line still says the trio seam returns null / "N19 plans six tiles" — add the cross-fade + manifest; `teams.sites.test.ts` pin counts for zoneBackgroundRenderer (4 / 2).
- NOT DONE: no tiles exist yet (owner generates); his 27 trio images are not wired (trioBackdropUrl stays null pending his choice); visual check of the cross-fade at ?fx=legacy not screenshotted (code path = ungraded blend).


Branch `s195/team-tiles` from master 2ab8e73a (deploy S195-#8, PROTOCOL 69). npm install running.

## Items
1. [x] 29 trio images — identify + judge
2. [x] side-by-side prototype + screenshots -> Desktop/SPARK_S195_TeamTiles
3. [x] six-tile Grok prompt sheet -> Desktop/SPARK_Six_Race_Tiles_Prompts.html
4. [ ] tile path behind a manifest (render-only, no bump)

## Item 1 — the 29 trio files (viewed by eye via contact sheets `.tmp-gates/trio/sheet1-7.jpg`)

**He generated in the sheet's card order**: download time (oldest first) matches card 1, 2, 3 … exactly,
verified by eye on every image (NE / SE / SW race read from the terrain: demons = black cracked rock +
violet fissures + ribcage; mummies = amber sand + step pyramids; nagas = teal drowned ruins + wreck;
orcs = rust earth + palisade camp; vampires = misty pine mountains + red glints; zombies = green bog).

| # | file | card (NE · SE · SW) | notes |
|---|---|---|---|
| 1 | qwb0Y | Demons · Demons · Demons | one continuous hell; small drawn quarry disc at centre |
| 2 | Y209P | Demons · Demons · Mummies | good |
| 3 | 7u6BS | Demons · Demons · Nagas | good, nagas a bit faint |
| 4 | Xn4YJ | Demons · Demons · Orcs | good |
| 5 | Cti5A | Demons · Demons · Vampires | good |
| 6 | GIlwP | Demons · Demons · Zombies | good |
| 7 | mTNsB | Demons · Mummies · Mummies | good (one sand sea across the south) |
| 8 | F9nFS | Demons · Mummies · Nagas | good |
| 9 | bxt40 | Demons · Mummies · Orcs | good |
| 10 | gOsXj | Demons · Mummies · Vampires | big drawn disc |
| 11 | b0OyK | Demons · Mummies · Zombies | good |
| 12 | CMK8y | Demons · Nagas · Nagas | good |
| 13 | OsCDw | Demons · Nagas · Orcs | drawn disc |
| — | hqBp3 | (card 14: Demons · Nagas · Vampires) | ⛔ **0-byte file — failed download, card 14 MISSING** |
| 14 | T7xpW | Demons · Nagas · Zombies (card 15) | good |
| 15 | 9vbUs | Demons · Orcs · Orcs (card 16) | ⚠ quarry disc drawn at BOTTOM-centre (on the S seam), not canvas centre |
| 16 | O8ULO | Demons · Orcs · Vampires (17) | drawn disc |
| 17 | 06oWF | Demons · Orcs · Zombies (18) | drawn disc |
| 18 | XFhrY | Demons · Vampires · Vampires (19) | one forest across the south; faint disc low |
| 19 | 00Z0A | Demons · Vampires · Zombies (20) | good |
| 20 | Vafnh | Demons · Zombies · Zombies (21) | good |
| 21 | XEOoT | Mummies · Mummies · Mummies (22) | good |
| 22 | 0nA6Y | Mummies · Mummies · Nagas (23) | good |
| 23 | KHeex | Mummies · Mummies · Orcs (24) | big drawn crater |
| 24 | EeN9B | Mummies · Mummies · Vampires (25) | 1712×1152 (all others 1168×784); big soft disc |
| 25 | oLzl8 | Mummies · Mummies · Zombies (26) | big drawn disc |
| 26 | l5Ren | Mummies · Nagas · Nagas (27) | good |
| 27 | mLOs2 | Mummies · Nagas · Orcs (28) | good |
| dup | mLOs2 (1) | = mLOs2 | byte-identical (md5 607616cc), re-download |

**Summary:** 29 files = 27 usable unique + 1 duplicate + 1 empty. Cards 1–13 and 15–28 done; card 14 and
cards 29–56 (28 more) not generated. **Every image kept the NW quarter plain** (dark, low-detail). Quality is
consistent and on-style; the regions BLEND naturally across the quadrant lines (the thing tiles cannot do for
free). Defects: ~9 images paint a dark "quarry" disc far larger than the game's 72 px portal hole (so a dark
blob would sit around the portal), one (9vbUs) puts it on the south seam; aspect 1168×784 = 1.49 vs the
board's 1.78, so cover-scale crops ~8 % top and bottom.

## Item 2 — prototype (real game, `.tmp-gates/proto.mjs`, vite on private port 31957)
Frames + COMPARE sheets + README in `C:/Users/onesh/OneDrive/Desktop/SPARK_S195_TeamTiles/`.
Verdict: cross-fade removes the hard step (kept ON for today's 3v1 art, `TEAM_SEAM_BLEND_LEGACY_ART` ⚠ MINE)
but today's 4p art is HORIZON-VIEW (sky at the top of every quadrant) so a trio reads as stacked postcards;
his Grok trios are top-down and read as one world → generate SIX top-down tiles. Pair art beats tiles for
pairs → `TEAM_TILES_FOR_PAIRS = false` ⚠ MINE.
⚠ Finding during the run: the first pass was stale HMR (old class instance) — labels showed blend on the
"today" variant; restarted vite --force and re-ran; labels now match each variant (proto.log).

## Item 3 — `C:/Users/onesh/OneDrive/Desktop/SPARK_Six_Race_Tiles_Prompts.html` (Grok; 6 cards, Copy + localStorage ticks, smoke-tested headless: no page errors, tick counter works). Race worlds reused verbatim from his trio sheet; 16:9, top-down, plain 15-18 % edge band on all 4 sides, landmarks in the central half, corners quiet; game reads `public/art/race-zones/tiles/<race>.webp` at 480x270.
