# S188 P9 — `s188/swarm` — THE SWARM (vampires level 10) — PROGRESS (running file, updated every commit)

Base: `4b52fdd` (tip of `s188/racial-d`). Brief: the merge owner's P9 prompt (scope amendment, owner-approved S188).

| step | status |
|---|---|
| 0 · read PDR §0–§8 + BRIEF P7, canon §2/§3d, ART_PIPELINE, bat-swarm FINDINGS + TILE §2 | ✅ done |
| 1 · registry: `vampires.l10` in `racialPerks.ts` (+ generic `perkDraftIndex`) | ✅ wip commit 1 (BUILT still false) |
| 2 · mechanic: `t3BatSwarm` (bat ×6), promotion in `towerUnitForSeat`, every consumer | ✅ wip commit 1 — typecheck exit 0 |
| 3 · tests (`racial/theSwarm.test.ts`) + flip `RACIAL_PERK_BUILT['vampires.l10']` | ✅ flipped; racial/ + racialPerks + draft* = 115/115 green. Mutations M1 (old `perkDraftIndex`) → 8 extra red; M2 (swarm arm without the perk guard) → 6 red; both restored. Art-existence tests land with the atlas commit. |
| 4 · art: swarm atlas (fly / attack / die) + renderer fallback to the bat | ✅ `t3-vampires-bat-swarm` packed (fly = sheet-fly, attack = sheet-attack ×0.8, die = sheet-die-v2 grid-inpainted); check:atlas on race-tier3-units exit 0, swarm clean on all 5 checks; idle/walk body 124 px vs the bat's 125 |
| 5 · card `public/art/upgrade-cards/l10-vampires.webp` (502×484, q82, cover top-anchored) | ✅ built with master's own `cover_fit_top` + save args (parity: rebuilding l5-vampires that way is byte-identical to master's shipped webp); 36.0 KB. Looked at 251×242: dark but NOT a black rectangle — the white title reads, the bat silhouette + red eyes read against the wine swarm. Not altered. `build-upgrade-cards.py` / the 16-card test live on master — merge owner reconciles |
| 6 · gates: typecheck · vitest · build · check:atlas | ✅ at de4d66d (captured `$?`): typecheck 0 · vitest 0 (5701 / 347 files) · build 0 (925.8 KiB, cap 1000, headroom 74.2 — racial-d tip 925.2, so this branch adds ~0.6 KiB JS) · check:atlas 0 |

## Sheet study (measured this session, before any packing)

| sheet | layout | alpha | verdict |
|---|---|---|---|
| `sheet-fly.png` | 8×3 (192×341 cells), gutters clean | soft (44.6 % a=0, 12 % mid) | candidate |
| `sheet-fly-matted.png` | 6×4 (the S187 re-roll, border-flood matte) | HARD (0 / ≥244 only) | ⚠ enclosed WHITE pockets survive the flood fill — visible white blotches on the black board |
| `sheet-attack.png` | 6×4 | soft (21 % a=0) | the only attack sheet |
| `sheet-die-v1.png` | **5×5** | **0 % transparent** — opaque magenta wash + grey grid baked in | ⛔ unusable (confirms FINDINGS) |
| `sheet-die-v2.png` | 6×4 | soft (16 % a=0) | ✅ usable, BUT a grey 2-px grid is baked in at x=256k/256k+1, y=255+256k (alpha ≈ 39/20) — must be erased before slicing |

## Chosen, and why (the art commit)

- **fly = `sheet-fly.png`**: the same soft-glow drawing as attack + die. The re-roll `sheet-fly-matted.png`
  fails the guard (largest near-white pocket 137 px > 60, 6,417 near-white px on the cut edge > 60 —
  measured); a colour-to-alpha re-matte of `raw-fly-v2.webp` removed the white but ghosted the swarm on black.
- **attack = `sheet-attack.png` × `scaleMul` 0.8**: drawn at a larger zoom (eye glow 27×31 vs fly 20×26).
  Without it the attack row is 1.28× wider than idle/walk (a check-2 WIDE fail).
- **die = `sheet-die-v2.png`** (the owner's "fourth one"); v1 is 0 % transparent. v2's baked 2 px grid
  inpainted (`inpaintLines`).
- `build-scattered-sheet-atlas.mjs` gained the two opt-in keys; the elite piranha and corpse-eater
  specs rebuild BYTE-IDENTICAL (sha256) with the change.
- Full unit suite after the mechanic commit: 5699 / 347 files, exit 0.

## Looked at (real GoblinRenderer, dev server on port 32474, in-page Pixi app — the shared browser pane was hidden)

- The swarm resolved ITS OWN sheet (`t3-vampires-bat-swarm-atlas.png`); sprite 119×119 vs the bat's 62×60 → 2× the bat.
- Fallback: with the swarm path pointed at a missing file, both swarms drew with the BAT's sheet at 2× (124×119),
  zero errors, no puppet.

## Merge-owner reconciliation owed (these live on master, not on this branch)

- `src/render/draftOverlay.test.ts` (cards): "at level 10 every race is COMING SOON" (line ~175), `referenced`
  `toHaveLength(16)` (~270 — now 17), "ships nothing else — no l10 card" (~280) — all go RED by design.
- `scripts/build-upgrade-cards.py` `CARDS` lacks `l10-vampires` (its docstring says deliberately not built).
- master's `racialPerks.test.ts` still pins 12 perks / `racialPerkFor(race, 2)` null — this branch re-pins it.

## S190 — fix round (PART A, no merge; the audit's confirmed findings, one commit each)

Brief: the merge owner's S190 phase-2 message. Base `b7ce6f6`. Baseline gates on the branch as-is (captured `$?`):
typecheck 0 · vitest 0 (5701 / 347) · build 0 (925.8 KiB, cap 1000). "Fix ONLY these."

| # | finding | status |
|---|---|---|
| 1 | SWARM-B1 — the card portrait ignored `atlasFallbackType` | ✅ `portraitTexture` falls back to the bat sheet exactly as the draw loop; 4 tests (real method, no Pixi stage); mutant (fallback removed) → 1 red, restored |
| 2 | SW-7 — the 7.32 MiB swarm sheet pre-warmed for every vampire seat at match start | ✅ out of `preloadRaceKit`; `warmPerkSheets` (from `sync`) fetches it the first frame any seat holds `vampires.l10`, once; the bat fallback covers the gap. `src/render/batSwarmSheetWarm.test.ts` (7, real `GoblinRenderer`, `loadAtlas` counted): nothing before the pick, once after, own sheet, general-at-wave-11 and other-race negatives. Mutants: preload line restored → 3 red; `sync` call removed → 2 red; restored |
| 3 | SW-4 / SW-5 — `build-upgrade-cards.py` CARDS + MANIFEST still say `l10-vampires` is not shipped | ✅ both files brought in AS MASTER HAS THEM (`5934d3b`, incl. `l10-mummies`) and edited on top: CARDS gains `l10-vampires`, docstring says it is built; MANIFEST level-10 heading / row 17 / shipped paragraph / WIRED runtime files / sizes (36.0 KB) / total **1107.7 KB for eighteen** / Landed-so-far / darkness verdict (lum 41.4 vs `l0-vampires` 38.3, measured). Art NOT regenerated: a temp copy of the edited script (sources read from the read-only main checkout, output to %TEMP%) wrote 18/18, exit 0, `l10-vampires.webp` sha256 `c0e6fafd…` = the committed file; `l10-mummies` / `l5-vampires` / `general-hp` identical to master's. `check-upgrade-cards.mjs` exit 0. ⚠ PART B: the script is an add/add and the MANIFEST a both-modified file at `git merge master` — resolve by taking this branch's version (it IS master's plus the l10-vampires lines), after checking master did not move them again. The "16 racial slots" count is left for the merge owner's canon (train E). |
| 4 | canon notes — R190-D ruling recorded, CRIMSON TIDE consequence, radar 10→12 noted, PROTOCOL 51 reasons | ✅ `S188_CANON_NOTES_swarm.md` (the branch's existing notes file, S188 naming kept): the ×11 question CLOSED by R190-D; CRIMSON TIDE heal 66 > pool 60 stated; radar ATK ceiling 10→12 measured and left as is (SHOT ceiling unchanged, Vlad 150 > swarm 132); the "covered by 49 → 50" claim corrected to train B's 51 with both reasons. `creature.ts`'s stale "49 → 50" docblock is NOT edited (not in the fix list) — flagged for the 51 commit |

**PART A gates at `4f05496` (captured `$?`):** typecheck 0 · vitest 0 (**5712 / 348**, +11 tests / +1 file over the baseline) · build 0 (**926.0 KiB**, cap 1000, headroom 74.0 — +0.2 KiB over the branch baseline). No e2e (brief).

**PART B (waits for the merge owner's "wrath is on master"):** `git merge master`; racialPerks.ts / .test.ts union (14 perks, both L10 rows, one `perkDraftIndex`); master's `draftOverlay.test.ts` four reds (:175, :270 count, :283, :624); the card script (add/add) and MANIFEST (both modified) → this branch's version; `atlasFallbackType` union with s189/render if it has landed.

## S190 PART B — `git merge s188/wrath` (beb7517, which carries master 5934d3b = train A)

Merge owner's change of plan: merge the local wrath tip now, do not wait for master.

| conflict | resolution |
|---|---|
| `scripts/build-upgrade-cards.py` (add/add) | OURS — wrath's blob = master 5934d3b's (`a9d6ac5`), and ours is exactly that + `l10-vampires` in CARDS + docstring. CARDS keeps `l10-mummies` AND `l10-vampires` |
| `assets-source/upgrade-cards/MANIFEST.md` | OURS — wrath's blob = master's (`1a21511`); ours is master's + the l10-vampires edits |
| `src/state/racialPerks.ts` | the **14-perk union**: `RACIAL_PERK_IDS` ends `'mummies.l10', 'vampires.l10'`; ONE `perkDraftIndex` (this branch's, `LEVELS_PER_DRAFT`; wrath's `lastIndexOf`/5 body is equivalent on every id and is noted, not kept). Stale "Thirteen / the one level-10 perk / only row three long / 17 slots" comments → fourteen / two / vampire + mummy rows / 16 |
| `src/state/racialPerks.test.ts` | registry test → 14 ids, vampires AND mummies rows three long; the offer test keeps wrath's `RACIAL_PERK_REQUIRES` loop + this branch's `race !== 'vampires'` exemption on the index-2 null (mummies is null there with no picks — requirement unmet) |
| `src/render/draftOverlay.test.ts` (no textual conflict — semantic) | the four level-10 tests re-pinned to BOTH perks: :175 real offer (vampires → THE SWARM, mummies → WRATH only with POWER OF RA, others COMING SOON); cards-on-disk count (derived, now 18) + `toContain('l10-vampires')`; "ships nothing else" now REQUIRES both l10 cards and no `-alt`; :624 production COMING SOON uses an ORC seat, plus a new production test: a vampire seat gets a choosable THE SWARM tile, fetches `l10-vampires`, click sends `'racial'` |
| `atlasFallbackType` | untouched (s189/render is not on master) |

Gates on the merged tree (captured `$?`): typecheck 0 · vitest **1** (6309 / 6311 — the 2 reds below, both `src/canon.test.ts`, merge owner's) · build 0 (**952.6 KiB**, cap 1100; wrath alone 951.6).

⛔ REDS LEFT FOR THE MERGE OWNER (never edited here — canon rule):
1. `src/canon.test.ts:415` §3d/§3e registry — wants SPARK_CANON §3e rows for all 14 titles; missing **THE SWARM** and **WRATH OF RA**.
2. `src/canon.test.ts:476` §3d offer — `pickIsOffered(vampires seat, wave 11, 'racial')` pinned `false` ("level 10+: COMING SOON"); it is `true` now (THE SWARM). ⚠ Re-pinning it exposes **:481** next: `autoPickFor(vampires, 11)` is now `'racial'`, not `generalPickForWave(11)`. Suggested re-pin: vampires true / `'racial'`, and a race with no level-10 perk (e.g. orcs) false / general; the canon sentence "`pickIsOffered` admits exactly two things" stays true.
