# ADDING A TOWER TO THE DAMAGE RAMP — the exact cost

Written S182, after the lightning hub shipped as the pilot. The owner is bringing **24-frame ramps
for four more towers on TRANSPARENT backgrounds** and is deciding whether that is an afternoon or a
month. This is the number, counted rather than estimated.

> **Short answer: 17 lines of code + one ~20-line data file per tower, after ~23 one-time lines.
> Four towers is an afternoon — but two of the four you named are not spawners, and that is the one
> thing that is not a table row.** See §3.

---

## 1 · PER TOWER — what you actually write

| # | file | change | lines |
|---|---|---|---|
| 1 | `assets-source/<tower>/atlas-specs.json` | **NEW** — copy the hub's, edit 6 values (`name`, `source`, `outDir`, `grid`, `states[].name`, background) | ~20 (data) |
| 2 | `src/render/structureRamp.ts` | one `RAMP_SPECS` entry | **13** |
| 3 | `src/render/structureRamp.ts` | its 3 size constants — `<T>_ART_PX`, `<T>_SUBJECT_FILL`, `<T>_SPRITE_PX` | **3** |
| 4 | `package.json` | append `public/art/<tower>` to the `check:atlas` dark-bg group | **1** (edit) |
| 5 | `src/render/structureRamp.test.ts` | the "exactly one entry" registry assertion | **1** (edit) |
| | **TOTAL CODE** | | **17** |

And what you do **not** touch, which is the point of the seam:

| file | why zero |
|---|---|
| `src/render/structureRampRenderer.ts` | generic over `RAMP_SPECS`; it never names a tower |
| `src/main.ts` | the renderer is constructed, synced, cleared and exposed once — already done |
| `src/state/**` | the sim reads `starHealthFrac(world, anchorId)`, which is recipe-agnostic |
| `src/render/structureRampAtlas.test.ts` | **`describe.each(RAMP_SPECS)`** — the new tower is covered automatically |
| `e2e/` | the hub's spec is the pilot's proof; a second is optional |

⭐ **Line 5 of that second table is the one worth noticing.** The manifest/row-index/frame-count/
cadence/foot-anchor contract test is generic over the table, so tower five is as guarded as tower one
without anyone remembering to guard it.

### The build step

```bash
node scripts/build-sheet-atlas.mjs assets-source/<tower>/atlas-specs.json
```

It detects the grid from the drawn rules, strips a baked corner label (guarded: exactly one blob with
margin, or it fails loudly), mattes, aligns every cell on its **subject's ground line**, fits one
union bbox, and writes `public/art/<tower>/<tower>-{atlas.png,anim.json}` plus the `subjectFill` the
size constants are pinned against.

---

## 2 · ONE-TIME COST A — transparent sources: **~8 lines**

`build-sheet-atlas.mjs`'s matte keys **near-BLACK connected to the border**, because the hub's sheet
arrived on `(0,10,17)`. A sheet that is **already transparent** must skip the matte entirely and use
its own alpha — running the dark key over it would eat every dark pixel of the art (ink outlines,
shadow, the tower's own dark metal).

One branch in the Python payload, at the top of `matte()`:

```python
if spec.get('background') == 'alpha':
    return c_rgba, 0            # the source already carries the cut-out; trust it
```

plus `"background": "alpha"` in the spec. **Everything downstream is unchanged** — the label strip,
the ground-line alignment, the union bbox, the cell paste and the manifest all operate on RGBA and do
not care where the alpha came from.

⚠ **This is the cheaper case, not the harder one.** Transparent sources remove the two things that
cost the most in S182: no background colour to measure, and no matte tuning.

---

## 3 · ⛔ ONE-TIME COST B — **two of your four towers are NOT spawners: ~15 lines**

**Verified against the recipe registry**, not assumed:

| tower | `kind` | visible to the ramp renderer today? |
|---|---|---|
| goblin tower | `spawner` | ✅ yes — table row, done |
| lightning hub | `spawner` | ✅ already shipped |
| **Helga** | **`defender`** | ❌ **no** |
| **laser turret** | **`defender`** | ❌ **no** |

`StructureRampRenderer.sync` iterates `world.creatureSpawners` only. Helga and the laser turret live
in `world.defenders`, so **a table row alone will not draw them**.

⭐ **The fix is small, and the sim half is already free.** `Defender` carries the exact two fields the
draw loop reads from a spawner:

```ts
readonly anchorPrimitiveId: PrimitiveId;   // defender.ts:94
readonly recipeId: GodlyId;                // defender.ts:96
```

and `starHealthFrac(world, anchorId)` is recipe-agnostic — it walks whatever hub it is handed, so it
already works on a turret's degree-6 Line hub and Helga's degree-6 Triangle hub with no change at
all. Only the **source loop** widens: lift the per-structure body of `sync` into a private method and
call it for both maps.

⚠ **NOT built in S182, deliberately.** There is no defender ramp art yet, and this project's standing
lesson is that code written ahead of the art it serves ships unreachable and untested —
`t3TowerAtlasBase` was 7.4 MiB of matted, guarded, disk-tested art with **zero production callers**
for two sessions, and every gate was green the whole time. It is ~15 lines the day the first defender
sheet arrives, and it is guarded by the same generic atlas test the moment it has a spec.

---

## 4 · THE TOTAL

```
4 towers × 17 lines            =  68 lines of code
+ transparent matte mode       =   8 lines   (once)
+ defender source loop         =  15 lines   (once, only if Helga/turret are in the batch)
                               = ~91 lines + 4 data files
```

**An afternoon.** The expensive parts of S182 were not the wiring — they were the SHEET: an uneven
grid that had to be detected rather than computed, frame numbers baked into every cell, a dark matte
with a soft glow edge, and a ground line that drifted 23 px between source rows. All four now live in
`build-sheet-atlas.mjs` and are paid once.

## 5 · ⚠ WHAT WOULD MAKE IT A MONTH

Each of these turns a table row back into a project. Worth checking the art against them **before**
starting, because each is a re-export rather than a code fix:

- **Frames not in one grid** (separate files per frame, or per state) — the slicer assumes one sheet
  read in reading order.
- **Different frame counts per tower.** 24 is not required — `frames` and `rows` are per-spec — but
  the rows must partition the frames exactly, and the manifest must agree. A 20-frame ramp is fine; a
  20-frame ramp described as 24 fails the atlas test.
- **A tower whose art is not a building standing on its star** — the sprite is placed at the star's
  centroid with the art's ground line straddling it. A wall, or a tower drawn off-centre, needs its
  own placement rule.
- **⛔ Wanting the self-destruct on a second tower.** `selfDestructBelow` is a per-tower OWNER ruling
  (R182-A: *"we won't do it for every building"*). The ramp generalises; the threshold does not, and
  giving a second tower one is a balance decision, not a config line.
