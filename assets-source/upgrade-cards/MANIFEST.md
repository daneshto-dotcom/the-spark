# UPGRADE CARD ART — the manifest

Every draft tile's background art. **Drop the generated PNGs in this folder using the FILENAME in the
table below**, then run:

```bash
node scripts/check-upgrade-cards.mjs
```

It reports what landed, what is missing, and which files fail the size/shape checks. Nothing is
packed or wired until it passes.

## ⚠ THE TILE IS 251 × 242 PX — ESSENTIALLY SQUARE

`draftOverlay.ts` computes the tile from the spawn disc: `PANEL_W` 560 × `PANEL_H` 270, split in two
with 14 px padding. So each card is drawn into **251 × 242**. Generate at **1024 × 1024** and keep
everything important inside the centre 85 %; the renderer cover-fits and crops ~4 % off the height.

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

### Level 5 racials — five ruled, one open

| # | file | race | name | what it does |
|---|---|---|---|---|
| 11 | `l5-vampires.png` | vampires | CRIMSON TIDE | lifesteal rises 20 % → 50 % |
| 12 | `l5-zombies.png` | zombies | CORPSE EATER | the boss gains a third skill: at ≤20 % HP it feeds for 8 s with 100 % lifesteal |
| 13 | `l5-mummies.png` | mummies | ENDLESS DYNASTY | a pharaoh spawns for every 1,000 castle HP lost, for the rest of the match |
| 14 | `l5-nagas.png` | nagas | APEX PREDATOR | the tier-3 piranha upgrades to the elite piranha at 3× stats |
| 15 | `l5-demons.png` | demons | HELLSPAWN | a pencil chewer's death splits it into 2 at 50 %, and those into 2 at 25 % |
| — | ⛔ `l5-orcs.png` | orcs | **UNRULED** | the owner has not specified this one |

### Level 10 racials — one ruled

| # | file | race | name | what it does |
|---|---|---|---|---|
| 16 | `l10-vampires.png` | vampires | THE SWARM | the tier-3 bat tower becomes a bat-swarm generator at 6× base |

## ⛔ THE ART IS THE EASY HALF. NONE OF THESE MECHANICS EXIST.

Every racial buff above is **specified and unbuilt**. The draft substrate carries them — the pick
list, the wire, the hash, the buff maths, the panel — and every racial tile currently renders
`COMING SOON` and is deliberately absent from the hit-test. Adding one is a data entry plus its own
mechanic, and the mechanic is the real work. See `SPARK_CANON.md` §3d, which says so in as many
words and has a test asserting that sentence is present.

## Where the art gets consumed

`src/render/draftOverlay.ts` currently paints a vector axis emblem per tile (`drawAxisGlyph`). The
owner rejected it — *"just a hand drawn heart that looks gay"* — so these cards REPLACE it. When they
land, the tile draws the card as a texture and the emblem function is deleted, not left dormant.

⚠ The card carries its own name in baked lettering. If a generator garbles the letters, the art is
still usable: the overlay renders the real title text and can draw it over the card's top band.

## ⛔ ONE WIRING DECISION THE ART FORCES — READ BEFORE IMPLEMENTING

**The cards carry their own name in baked lettering, and it came out clean on all ten** — no
garbling, so the fallback in the note above is not needed. But the overlay ALSO draws its own title
text at the top-left of each tile (`generalTitle`, `racialTitle` in `draftOverlay.ts`).
**They will collide.**

When the cards are wired: stop drawing the overlay's own title for any tile that HAS a card, and keep
drawing it for any tile that does not — the racial tiles stay text-only until their card lands, so
both states must work. The effect line (`+10% HEALTH`) and the hover detail panel stay in both cases;
only the NAME is duplicated.

⭐ And `drawAxisGlyph` gets deleted at the same time, not left dormant. The owner rejected it
(*"just a hand drawn heart that looks gay"*), and a dead painter that still compiles is exactly the
kind of thing a later session re-enables by accident.

## Landed so far (S187)

| state | files |
|---|---|
| ✅ generated, all 1254×1254, all pass the checker | the four generals + all six level-0 racials |
| ⏳ owner generating now | the five level-5 racials + THE SWARM |
| ⛔ unruled | orcs level 5 — no mechanic, so no card |
| ⚠ alternate kept | `l0-demons-alt.png` — SCORCHED GROUND was generated twice. The primary is the one with more foreground rock and stronger diagonal fissures, which survives the shrink to a 251 px tile better. Swapping them is a rename. |

## ⭐ ORCS LEVEL 5 — RULED S187, the last gap at that level

`l5-orcs.png` — **THE HORDE GROWS**. Goblin towers allow **20** spawned goblins instead of 10, and
the castle emits its base unit **twice as fast**.

⚠ The goblin ceiling is documented as LOAD-BEARING rather than cosmetic: `GOBLIN_MELEE_CONFIG.persistent`
is true, so goblins never age out. Raising 10 → 20 is fine; removing the ceiling is not.

**Levels 0 and 5 are now fully ruled for all six races.** Levels 10–20 have 16 racial slots still
undesigned — only vampires L10 (THE SWARM) exists.

## ⚠ THE FIVE GROK CARDS WERE PORTRAIT AND HAD TO BE CROPPED

`l5-zombies`, `l5-nagas`, `l5-demons`, `l5-demons-alt` and `l10-vampires` arrived at **784 × 1168**
(ratio 0.671) against a tile of 1.037 — a 35 % drift. They were cropped **top-anchored** to 784 × 756:
the title is baked into the top ~15 % and the subject sits directly beneath it, so a centred crop
would have shaved the lettering and a bottom crop would have lost the subject. The loss is spent on
the lower background. Verified by eye afterwards — all four keep their title and their subject.

⚠ `l10-vampires.png` (THE SWARM) is **very dark**. At 251 px it may read as a near-black rectangle.
Look at it in-game before accepting it; a brightness lift or a re-roll may be wanted.

⚠ `l5-demons-alt.png` is the second HELLSPAWN. The owner picked the other one (`isESS`) and the pick
is right for a reason worth keeping: the primary's radiating composition reads as ONE thing becoming
MANY, which is what the upgrade does; the alternate is an undifferentiated pile.
