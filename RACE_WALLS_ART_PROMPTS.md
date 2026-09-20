# RACE WALLS — six generation prompts, and the technical rules that make them usable

Owner, S185: *"Instead of having just your colour wall in between you and your enemy, it has to be
race specific with art … that line, let's say the orange line of the orcs, it should look like
orcish wooden palisades. For nagas it should be like a coral reef wall … for demons maybe like
openings in the ground with fire going through them … they should be actively looping. They come up
during build phase, then they just do their thing, and on fight they disappear."*

---

## ⛔ READ THIS BEFORE GENERATING — five rules, and breaking any one wastes the generation

**1 · TWELVE FRAMES PER LOOP, NOT TWENTY-FOUR.** `ART_PIPELINE.md` is explicit: the packer takes a
stride and packs **12 frames per row**. A 24-frame sheet is *two rows* (two different states), not a
longer loop. So each wall wants **one row of 12** for its idle loop. Frame 12 must lead back into
frame 1 or the loop will hitch once per cycle.

**2 · TRANSPARENT BACKGROUND, AND NOTHING ELSE IN THE IMAGE.** No ground, no sky, no terrain, no
cast shadow onto a surface, no border, no text, no watermark. The matte is connected-component from
the image border — anything touching an edge that is not the wall itself gets eaten or, worse,
keeps a halo. Leave **8–10 px of empty margin** above and below the wall so the cutout has room.

**3 · IT MUST TILE SEAMLESSLY LEFT↔RIGHT.** The wall is drawn as a LINE of arbitrary length along a
zone border, so one segment is repeated end to end. The pixels at the extreme left edge must
continue the pixels at the extreme right edge. Say so in the prompt (every one below does) and
check it by butting two copies together before packing.

**4 · SIDE-ON, FLAT TO CAMERA, CONSISTENT BASELINE.** The game reads the wall as a horizontal
barrier. Every frame must keep the same overall height and the same bottom line — if the silhouette
grows or drifts between frames the union bounding box inflates and the wall visibly bobs.

**5 · ⛔ ORIGINAL ART ONLY.** Do not name or evoke any game, film or franchise, and do not ask for
"in the style of" any studio. This project has already had to rework a shipped asset for exactly
that. Describe the *materials and the mood*, never a reference work.

⭐ **SUGGESTED CANVAS: 1536 × 128 px per row** (12 cells of 128 × 128), matching the stink-bag sheet
that already ships. If the generator will not do a strip, generate **one 128 × 128 tile per frame**
and hand me the twelve — I will pack them.

⚠ **KEEP THE MOTION SMALL.** These sit on screen for the whole BUILD phase. A flag-snapping,
fire-roaring wall becomes noise across a whole border. Aim for *breathing*, not *performing*.

---

## THE SIX PROMPTS

Each already contains the technical clauses. Paste one whole; do not trim the last paragraph.

### 1 · ORCS — `0xff8c1a` burnt orange

> A seamless side-on horizontal segment of a crude orc palisade wall, built from rough-hewn timber
> logs lashed together with frayed rope and iron banding, tops hacked to uneven sharpened points,
> scarred with old axe marks and char. Weathered grey-brown wood with warm **burnt-orange** iron
> fittings and rope. Hand-painted game art, saturated colours, strong dark outline, moderate
> contrast, no realism.
> Animate a 12-frame seamless loop of very subtle motion: the rope bindings creak and shift a few
> pixels, loose splinters sway, a faint ember glow pulses in the iron banding. The silhouette must
> stay the same height in every frame.
> **Transparent background. Nothing in the image except the wall — no ground, no sky, no shadow, no
> text, no border.** The segment must tile seamlessly left to right: the left edge pixels must
> continue the right edge pixels. Leave a small empty margin above and below the wall. Original
> design, not based on any existing game or film.

### 2 · NAGAS — `0x3bd7ff` cyan

> A seamless side-on horizontal segment of a living coral reef wall, grown rather than built: fused
> brain coral and staghorn branches, encrusted shell, ribbons of kelp, small barnacles and anemones.
> Cool **cyan and aquamarine** with deep teal shadows and pale bleached highlights. Hand-painted game
> art, saturated colours, strong dark outline, no realism.
> Animate a 12-frame seamless loop: kelp ribbons drift as if in a slow current, anemone tendrils
> curl and uncurl, a soft bioluminescent glow breathes through the coral. Keep the overall
> silhouette height identical in every frame.
> **Transparent background. Nothing in the image except the wall — no water, no seabed, no ground,
> no shadow, no text, no border.** The segment must tile seamlessly left to right. Leave a small
> empty margin above and below. Original design, not based on any existing game or film.

### 3 · ZOMBIES — `0x44ff5e` sickly green

> A seamless side-on horizontal segment of a derelict barricade built from scavenged rotted wood:
> mismatched planks, warped fence boards and broken pallets nailed together at careless angles, bent
> rusted nails, strips of stained cloth, patches of creeping mould. Grey-brown decayed timber with
> **sickly yellow-green** mould and ooze in the seams. Hand-painted game art, saturated colours,
> strong dark outline, no realism.
> Animate a 12-frame seamless loop: a loose plank sags and settles, cloth strips stir, thick green
> ooze slowly drips and beads between the boards, flies flick in and out. Keep the silhouette height
> identical in every frame.
> **Transparent background. Nothing in the image except the barricade — no ground, no debris field,
> no shadow, no text, no border.** The segment must tile seamlessly left to right. Leave a small
> empty margin above and below. Original design, not based on any existing game or film.

### 4 · MUMMIES — `0xffe23b` gold

> A seamless side-on horizontal segment of an ancient desert wall built from weathered sandstone
> blocks, edges rounded by wind, faces carved with worn geometric relief and inlaid with tarnished
> **gold** trim. Drifted sand banked along the base and caught in the joints. Warm ochre and pale
> limestone with deep amber shadow. Hand-painted game art, saturated colours, strong dark outline,
> no realism.
> Animate a 12-frame seamless loop: fine sand streams off the top edge and drifts, a thin veil of
> dust crosses the stone face, the gold inlay catches a slow travelling glint. The stone itself must
> not move, and the silhouette height must be identical in every frame.
> **Transparent background. Nothing in the image except the wall — no dunes, no ground, no sky, no
> shadow, no text, no border.** The segment must tile seamlessly left to right. Leave a small empty
> margin above and below. Original design, not based on any existing game or film.

### 5 · VAMPIRES — `0xff3b6b` crimson

> A seamless side-on horizontal segment of a line of tall iron-tipped impaling pikes driven into a
> row, bound with black chain and tattered crimson banners, crowned with iron spikes and hanging
> ragged cloth. Dark wrought iron and near-black timber with **deep crimson** cloth and a cold
> highlight on the metal. Menacing and heraldic rather than gory — **no bodies, no corpses, no blood,
> no gore.** Hand-painted game art, saturated colours, strong dark outline, no realism.
> Animate a 12-frame seamless loop: the banners ripple slowly, chains sway a few pixels, a cold red
> glint travels along the pike tips. Keep the silhouette height identical in every frame.
> **Transparent background. Nothing in the image except the pikes — no ground, no sky, no shadow, no
> text, no border.** The segment must tile seamlessly left to right. Leave a small empty margin above
> and below. Original design, not based on any existing game or film.

⚠ *He described this one as impaled pikes "with corpses on them". I have written it as pikes,
banners and chains — same silhouette and the same threat, without human remains. Generators refuse
that content and it would also put an age rating on the game. If you want it grimmer, ask for more
iron, more tattered cloth and a darker palette rather than bodies.*

### 6 · DEMONS — `0xd73bff` violet-magenta

> A seamless side-on horizontal segment of a jagged fissure torn open in blackened rock, edges
> raised into broken basalt teeth, with molten light burning up out of the crack and heat-glow
> licking the stone. Charcoal-black rock with a searing **violet-magenta** core fading to hot pink
> at the edges. Hand-painted game art, saturated colours, strong dark outline, no realism.
> Animate a 12-frame seamless loop: the molten light pulses and churns along the fissure, small
> flames rise and fall, embers drift upward and fade. The rock must not move and the silhouette
> height must be identical in every frame.
> **Transparent background. Nothing in the image except the fissure and its flame — no ground plane,
> no landscape, no smoke cloud filling the frame, no shadow, no text, no border.** The segment must
> tile seamlessly left to right. Leave a small empty margin above and below. Original design, not
> based on any existing game or film.

⚠ *The demon colour is the one to watch. He said "cracks with fire", which reads orange — but the
shipped demon identity is **violet-magenta** (`RACE_COLORS.demons = 0xd73bff`) and the demon zone
backdrop already glows violet in its fissures. The prompt keeps the violet core so the wall matches
the ground it stands on. If he wants literal orange fire, that is a one-word change and a deliberate
break with the race's colour.*

---

## WHAT HAPPENS AFTER HE GENERATES

1. Hand over the twelve frames (or the strip) per race.
2. They go through the **alpha intake** (`build-alpha-sheet-atlas.mjs`), NOT the dark-matte intake —
   the sources arrive already transparent, and running the dark key over them would eat every dark
   pixel of the art. ⚠ That intake selection is the single most common way a good sheet is ruined.
3. `wallRenderer.ts` currently draws two flat colour strips (`STRIP_HALF_W` 5) per shared border.
   It becomes a tiled sprite row per zone side, keyed by `raceId`, with the frame index derived from
   `world.tick` — never a wall clock, or the two peers animate out of step.
4. Phase behaviour needs **no work**: `wallsAreUp(world)` already raises them in BUILD and drops
   them in FIGHT, which is exactly the behaviour he described wanting.
