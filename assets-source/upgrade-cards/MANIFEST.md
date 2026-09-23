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
