# Tiers 4–7 — where the owner's generated art goes

Created S168 when the owner began generating the mid-tier roster himself.

> Owner: *"next in backlog after we complete the current priorities that we need to complete next
> session is building more tiered towers but i want to do the generating - so we stop using so many
> api calls and so much money. here i already generate the next tier monsters for the Mummies. well
> go race by race. tier 4 is Sand Crawler, Tier 5 is Anubis Warior, Tier 6 is Djinn and Tier 7 is
> Sand Guardian/Golem. I will generate each of them healthy, hurt and dying, then their buildings in
> the three states. the we will talk about the video loops and graphics generation. for now save
> those in the correct hero folders for when we will be working them"*

## ⛔ I could not save the two images you pasted

They arrive in the conversation, not on the filesystem, so I have no file to copy. **The folders and
the exact filenames are below — drop the PNGs in and nothing else needs deciding.** Everything from
that point (matte, atlas, spec) is automated by the existing pipeline.

## The mummies roster, as ruled

| Tier | Unit | Shown in the images you sent |
|---|---|---|
| 4 | **Sand Crawler** | the bandaged burrowing worm, gold-and-blue wraps, rearing out of sand |
| 5 | **Anubis Warrior** | jackal-headed, khopesh in hand, gold collar |
| 6 | **Djinn** | hooded, blue spirit-flame in both palms, ankh at the chest |
| 7 | **Sand Guardian / Golem** | the heavy one — sun-disc on the chest, glowing eyes |

## Filenames — mirror the tier-3 convention exactly

Tier-3 is the working precedent (`t3-mummies-scarab.png`, `t3-mummies-intact.png`), so tiers 4–7
follow it character for character. The pipeline reads these paths from `atlas-specs.json` /
`clip-spec.json`, so a name that drifts is a name the build cannot find.

### Units — `assets-source/race-tier<N>-units/`

```
t4-mummies-sandcrawler.png
t5-mummies-anubiswarrior.png
t6-mummies-djinn.png
t7-mummies-sandguardian.png
```

⚠ **YOU SAID "healthy, hurt and dying" FOR THE MONSTERS, AND THAT IS NEW.** Every shipped unit tier
carries ONE seed still, and its idle / walk / attack / die come from veo clips built off that seed.
Three stills per unit is a different shape. Both readings are workable and they cost differently, so
this is worth one word from you before you generate 12 more images:

- **(a) One seed still per unit** — matches tiers 3 and 9 exactly, and the pipeline needs no change.
  "Hurt" and "dying" then come from the clips, as they do today.
- **(b) Three stills per unit** — a genuinely new capability: damage-state art for UNITS, which the
  game has never had (only TOWERS change with damage). It would need a renderer that swaps a unit's
  sheet by HP band, which is real work and worth doing on purpose rather than by accident.

If you want (b), the names are `t4-mummies-sandcrawler-healthy.png` / `-hurt.png` / `-dying.png`.

### Buildings — `assets-source/race-tier<N>-towers/`

Three states, exactly as tier 3 already does it:

```
t4-mummies-intact.png      t4-mummies-damaged.png      t4-mummies-destroyed.png
t5-mummies-intact.png      t5-mummies-damaged.png      t5-mummies-destroyed.png
t6-mummies-intact.png      t6-mummies-damaged.png      t6-mummies-destroyed.png
t7-mummies-intact.png      t7-mummies-damaged.png      t7-mummies-destroyed.png
```

⭐ Tier 3 also carries a **`-spawning.png`** fourth state. It exists in the art and, as of S168, the
tower finally emits on a cadence — so a spawning frame is now drawable where before it was orphaned.
Optional, but if you generate it the game can use it.

## ⚠ Two things the pipeline will want from these stills

Both are cheap at generation time and expensive afterwards:

1. **A plain solid WHITE background, edge to edge.** The matte keys on near-white connected to the
   frame border. A grey floor, a vignette or a drop shadow survives the matte and ships as a visible
   box — the owner rejected exactly that in S106 and again in S168.
2. **No letterbox, no pillarbox, no inset frame.** veo did this twice to the Kraken in S168 and cost
   a re-roll plus a `sampleStart` workaround. The images you sent look clean on both counts.

## What happens once they land

Per race, per tier: matte → `build-atlas-set.mjs` → `check:atlas` → a `CreatureType` + config + the
four-sites walk + a protocol bump. The tier-3 and tier-9 rounds are the worked precedent for all of
it, and the tier ladder itself (which tier is FED, which emits, what a tower costs) is owner-ruled
territory that does not exist yet for 4–7.
