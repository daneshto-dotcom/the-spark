# UPGRADE CARD ART — the manifest

Every draft tile's background art. **Drop the generated PNGs in this folder using the FILENAME in the
table below**, then run:

```bash
node scripts/check-upgrade-cards.mjs      # what landed, what is missing, what fails size/shape
python scripts/build-upgrade-cards.py     # S188 — builds the runtime cards into public/art/upgrade-cards/
```

The checker reports; it never gates. The build script is what turns a source PNG into the card the
game actually loads (see **WIRED — S188** below).

## ⚠ THE TILE IS 251 × 242 PX — ESSENTIALLY SQUARE

`draftOverlay.ts` computes the tile from the spawn disc: `PANEL_W` 559 × `PANEL_H` 270, split in two
with 14 px padding. So each card is drawn into **251 × 242** (`draftOverlay.test.ts` pins both
numbers). Generate at **1024 × 1024** or larger and keep the NAME in the top band; the build
cover-fits **top-anchored**, so the ~4 % a square source loses comes off the BOTTOM, never the
lettering.

## ⭐ THE GENERAL TRACK IS FOUR CARDS TOTAL, NOT ONE PER LEVEL

`GENERAL_TRACK` cycles `hp → def → atk → pen → hp`, so L0 = TOUGHER, L5 = ARMOURED, L10 = STRONGER,
L15 = PIERCING, L20 = TOUGHER again. The same four images serve every level forever. The owner asked
for "seven per level"; it is **four generals plus six racials per level**.

| # | file | shown at | tile | name on the card |
|---|---|---|---|---|
| 1 | `general-hp.png` | L0, L20, L40 … | left | TOUGHER |
| 2 | `general-def.png` | L5, L25 … | left | ARMOURED |
| 3 | `general-atk.png` | L10, L30 … | left | STRONGER |
| 4 | `general-pen.png` | L15, L35 … | left | PIERCING |

### Level 0 racials — all six ruled

| # | file | race | name | what it does |
|---|---|---|---|---|
| 5 | `l0-vampires.png` | vampires | BLOOD DEBT | all spawned units heal 20 % of damage dealt |
| 6 | `l0-zombies.png` | zombies | THE RISEN | every unit you kill spawns a 1/1/1/1 zombie at your castle |
| 7 | `l0-mummies.png` | mummies | POWER OF RA | once per fight, an aimed sky-strike you place yourself |
| 8 | `l0-orcs.png` | orcs | BLOOD FRENZY | the warlord's rage spreads to every orc you own |
| 9 | `l0-demons.png` | demons | SCORCHED GROUND | your quadrant burns enemies for 2 % max HP per second |
| 10 | `l0-nagas.png` | nagas | DEEP CURRENT | gatherers teleport home instead of walking back |

### Level 5 racials — all six ruled (orcs closed S187)

| # | file | race | name | what it does |
|---|---|---|---|---|
| 11 | `l5-vampires.png` | vampires | CRIMSON TIDE | lifesteal rises 20 % → 50 % |
| 12 | `l5-zombies.png` | zombies | CORPSE EATER | the boss gains a third skill: at ≤20 % HP it feeds for 8 s with 100 % lifesteal |
| 13 | `l5-mummies.png` | mummies | ENDLESS DYNASTY | a pharaoh spawns for every 1,000 castle HP lost, for the rest of the match |
| 14 | `l5-nagas.png` | nagas | APEX PREDATOR | the tier-3 piranha upgrades to the elite piranha at 3× stats |
| 15 | `l5-demons.png` | demons | HELLSPAWN | a pencil chewer's death splits it into 2 at 50 %, and those into 2 at 25 % |
| 16 | `l5-orcs.png` | orcs | THE HORDE GROWS | goblin towers hold 20 instead of 10; the castle emits its base unit twice as fast |

### Level 10 racials — built (THE SWARM in `s188/swarm`, WRATH OF RA in `s188/wrath`)

| # | file | race | name | what it does |
|---|---|---|---|---|
| 17 | `l10-vampires.png` | vampires | THE SWARM | the tier-3 bat tower becomes a bat-swarm generator at 6× base — ⭐ S188 `s188/swarm` builds the mechanic (`vampires.l10`) and ships the card |
| 18 | `l10-mummies.png` | mummies | WRATH OF RA | ⭐ S188 — the card ships from `s188/ra-vfx`; the mechanic `mummies.l10` is built in `s188/wrath` |

⭐ `l10-mummies.png` is a CROP, not the owner's file as delivered. `l10-mummies-raw.png` (1024 × 1024) came with a
white outer margin and a rounded black frame; the master is its dark inner panel, box (88, 88, 936, 936) →
848 × 848, edge to edge with the baked WRATH OF RA title intact in the top band. The raw file stays here as the
untouched original (`check-upgrade-cards.mjs` knows it as a raw source, not a stray).

✅ `l10-vampires.png` **is shipped** (S188 `s188/swarm`, reconciled S190). The owner moved THE SWARM into
S188 (scope amendment SA1) and its mechanic `vampires.l10` is built, so the card no longer precedes it.
`build-upgrade-cards.py` builds it from the 784 × 756 top-anchored crop, and the rebuild is byte-identical
to the committed `public/art/upgrade-cards/l10-vampires.webp` (sha256 `c0e6fafd…`, measured S190).

## ⛔ A CARD IS NOT A MECHANIC — THE TILE FOLLOWS `RACIAL_PERK_BUILT`, NOT THE ART

S187 shipped every racial tile as `COMING SOON` because none of the mechanics existed. S188 builds
the twelve level-0/5 mechanics in separate branches, and each branch flips its own entries in
`RACIAL_PERK_BUILT` (`src/state/racialPerks.ts`). **The draft tile reads that table through
`draftOptionsFor`, and nothing else:** a built perk's tile is choosable and draws its card; an unbuilt
one stays the dimmed `COMING SOON` tile, absent from the hit-test, with no card — however good its art
is. See `SPARK_CANON.md` §3d.

## ⛔ ONE WIRING DECISION THE ART FORCES — ✅ IMPLEMENTED S188

**The cards carry their own name in baked lettering, and it came out clean on all sixteen** — no
garbling. But the overlay ALSO draws its own title text at the top-left of each tile
(`generalTitle`, `racialTitle` in `draftOverlay.ts`). **They collide.**

The rule, as built: a tile whose card is ON SCREEN does not draw the overlay's own title
(`drawsOwnTitle`); a tile without one — the `COMING SOON` tile, or a card that has not arrived yet or
failed to load — keeps the text title, so the name is always shown exactly once. The effect line
(`+10% HEALTH`, `LIFESTEAL 20%`, …) and the hover detail panel stay in both states; with a card on
screen the effect line moves to the tile's bottom band, clear of the lettering.

⭐ And `drawAxisGlyph` is **deleted**, not left dormant. The owner rejected it (*"just a hand drawn
heart that looks gay"*), and a dead painter that still compiles is exactly the kind of thing a later
session re-enables by accident. `draftOverlay.test.ts` asserts it is gone.

## ⭐ WIRED — S188

| | |
|---|---|
| runtime files | `public/art/upgrade-cards/<name>.webp` — the 16 cards of levels 0 and 5, plus `l10-vampires` (THE SWARM, S188) and `l10-mummies` (WRATH OF RA, S188) |
| built by | `python scripts/build-upgrade-cards.py` — 502 × 484 (2× the tile), cover-fit top-anchored, lossy WebP q82 |
| loaded by | `DraftOverlay` in `src/render/draftOverlay.ts`, **lazily** through Pixi `Assets`, one card per tile, on first draw |
| general tile | `general-<axis>` for the wave's axis |
| racial tile | `RACIAL_PERK_COPY[perk].card` — only while a perk is on offer |
| missing / slow card | the tile draws its text title until it arrives; a failed card is final and harmless — the panel is never blocked on art |

Shipped sizes (static payload — the bundle cap does not count these; a seat fetches two per draft):

| card | KB | card | KB | card | KB | card | KB |
|---|---:|---|---:|---|---:|---|---:|
| `general-hp` | 49.0 | `general-def` | 59.8 | `general-atk` | 78.3 | `general-pen` | 54.0 |
| `l0-vampires` | 46.0 | `l0-zombies` | 64.9 | `l0-mummies` | 69.7 | `l0-orcs` | 76.5 |
| `l0-demons` | 72.4 | `l0-nagas` | 76.7 | `l5-vampires` | 57.6 | `l5-zombies` | 63.0 |
| `l5-mummies` | 86.6 | `l5-orcs` | 60.5 | `l5-demons` | 54.4 | `l5-nagas` | 43.3 |
| `l10-vampires` | 36.0 | `l10-mummies` | 59.1 | | | | |

**Total 1107.7 KB** for all eighteen (1012.7 KB for the sixteen of levels 0/5, + 36.0 KB THE SWARM, + 59.1 KB WRATH OF RA — the build script's own total, S190), against ~35 MB of source PNGs that stay here as the lossless
masters.

## Landed so far

| state | files |
|---|---|
| ✅ generated, all pass the checker | the four generals, all six level-0 racials, all six level-5 racials, THE SWARM |
| ✅ built and wired (S188) | the sixteen level-0/5 cards, and `l10-vampires` (THE SWARM) — see **WIRED** |
| ⚠ alternates kept | `l0-demons-alt.png` — SCORCHED GROUND was generated twice. The primary is the one with more foreground rock and stronger diagonal fissures, which survives the shrink to a 251 px tile better. Swapping them is a rename. `l5-demons-alt.png` — see below. Neither is shipped. |

## ⭐ ORCS LEVEL 5 — RULED S187, the last gap at that level

`l5-orcs.png` — **THE HORDE GROWS**. Goblin towers allow **20** spawned goblins instead of 10, and
the castle emits its base unit **twice as fast**.

⚠ The goblin ceiling is documented as LOAD-BEARING rather than cosmetic: `GOBLIN_MELEE_CONFIG.persistent`
is true, so goblins never age out. Raising 10 → 20 is fine; removing the ceiling is not.

**Levels 0 and 5 are now fully ruled for all six races.** Levels 10–20 have 16 racial slots still
undesigned — vampires L10 (THE SWARM) is designed and built (S188 `s188/swarm`).

## ⚠ THE FIVE GROK CARDS WERE PORTRAIT AND HAD TO BE CROPPED

`l5-zombies`, `l5-nagas`, `l5-demons`, `l5-demons-alt` and `l10-vampires` arrived at **784 × 1168**
(ratio 0.671) against a tile of 1.037 — a 35 % drift. They were cropped **top-anchored** to 784 × 756:
the title is baked into the top ~15 % and the subject sits directly beneath it, so a centred crop
would have shaved the lettering and a bottom crop would have lost the subject. The loss is spent on
the lower background. Verified by eye afterwards — all four keep their title and their subject.
(`l5-orcs.png` is also 784 × 756 — the tile's own ratio — so the build crops nothing from it.)

⚠ `l10-vampires.png` (THE SWARM) is **very dark**. At 251 px it may read as a near-black rectangle.
Look at it in-game before accepting it; a brightness lift or a re-roll may be wanted.
✅ S188 `s188/swarm` looked at it at 251 × 242: dark, but NOT a black rectangle — the white title reads, and
the bat silhouette and red eyes read against the wine swarm. Mean luminance 41.4, brighter than the shipped
`l0-vampires` at 38.3 (measured S190). Shipped unaltered; the owner's eye is still the final word.

⚠ `l5-demons-alt.png` is the second HELLSPAWN. The owner picked the other one (`isESS`) and the pick
is right for a reason worth keeping: the primary's radiating composition reads as ONE thing becoming
MANY, which is what the upgrade does; the alternate is an undifferentiated pile.

## ⛔⛔ GOBLINS DO NOT ENRAGE — read this before implementing BLOOD FRENZY

Owner, S187: *"Goblins do not enrage, right? We said enraging works only on orc units, any racial
units. Goblins are not — goblins can be built by anyone … they don't change their colour and enrage
like the orcs would."*

`BLOOD FRENZY` (orcs L0) spreads the warlord's rage to that seat's **orc RACIAL units only**. A
goblin is a GLOBAL tower unit that any race can build, so a goblin owned by an orc seat is still not
an orc.

⚠ **THE OBVIOUS IMPLEMENTATION IS THE WRONG ONE.** Filtering by `ownerPlayerId` alone enrages that
seat's goblins too, because they pass the ownership test. The predicate is ownership **AND** creature
type, and the visual follows it — no rage tint on a goblin.

⚠ This does NOT conflict with `THE HORDE GROWS` raising the goblin cap at L5. The owner named the
reason himself: *"orcs and goblins do tend to work together."* Orcs get more goblins; the goblins
just never rage.
