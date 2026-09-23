# S187 — the prompts handed to the owner, archived for next session

## 1 · UPGRADE TILE ART — six cards

**The tile is 251 x 242 px, essentially square.** Generate 1024 x 1024; keep everything important
inside the centre 85%. The art fills the WHOLE tile — it replaces the painted axis glyph, which the
owner rejected ("just a hand drawn heart that looks gay").

Shared block, used by all six:

> A vertical game-UI upgrade card, 1024x1024, square. Dark moody background that fills the ENTIRE
> frame edge to edge — no white, no borders, no rounded corners, no drop shadow, no frame within the
> frame. Bold clean cel-shaded 2D game art, thick dark outlines, flat saturated colour, no gradients,
> no photorealism. Across the TOP of the card, [NAME] in heavy bold italic display lettering, clearly
> legible. Below it, filling the rest of the card: [SUBJECT]. [PALETTE]. Dark enough that pale text
> stays readable over the lower third.

| # | name | subject | palette |
|---|---|---|---|
| 1 | TOUGHER | a colossal armoured heart of dark iron plates, bound in riveted bands and chains, glowing molten red through the seams | charcoal / blood-red / hot orange |
| 2 | ARMOURED | a towering battered tower shield of layered steel, spikes along its rim, deflecting a storm of arrows and blades that shatter against it | steel-blue / gunmetal / white sparks |
| 3 | STRONGER | an enormous brutal cleaver-blade mid-swing, wreathed in a shockwave, the air cracking around its edge | molten amber / bronze / searing white |
| 4 | PIERCING | a black arrowhead punching through a steel plate, the metal peeling outward in a ring, light blazing through the hole | violet / near-black / white-hot beam |
| 5 | BLOOD DEBT (vampires L0) | an ornate crimson chalice overflowing, ribbons of red light curling up into a glowing heart sigil — the wound becoming the cure | crimson / wine-red / pale rose |
| 6 | THE RISEN (zombies L0) | skeletal hands bursting from cracked grave soil, one figure already standing, sickly green witch-light from the fissures | rotten green / grave-brown / bone-white |

⚠ If the baked-in lettering comes out garbled, the art is still usable — `draftOverlay` renders the
real title text and can draw it over the top band instead.

## 2 · BAT SWARM RE-ROLL — one grid for all four sheets

⛔ The first attempt used THREE different grids (fly 8x3, the rest 6x4) and `sheet-die-v1` had 0.0%
alpha. Pin the layout:

> A swarm of bats forming one creature-shaped cloud, on a PURE SOLID WHITE background, edge to edge.
> Bold clean cel-shaded 2D game art, thick dark outlines, flat saturated colour, no gradients, no
> photorealism, no grid lines, no borders, no captions.
>
> One image, a uniform grid of 6 columns x 4 rows = 24 frames, left to right, top row first. Every
> cell exactly the same size.
>
> Static locked camera. The swarm is the SAME SIZE in all 24 frames, occupies about 70% of the cell,
> centred, and must NEVER TOUCH ANY EDGE — clear margin on all four sides, so the cloud has room to
> spread.
>
> ACTION: [see below]

- **fly** — hovers and churns in place, bats wheeling within the mass, the outline rippling but the
  shape holding. LOOPS SEAMLESSLY: frame 24 flows back into frame 1.
- **attack** — lunges forward and snaps back, compressing to a spearhead and re-expanding. LOOPS.
- **die** — loses cohesion and disperses, thinning to nothing by frame 24. Does NOT loop.
  ⛔ Add: *"background pure white with the bats fully separated from it — no coloured wash, no glow
  filling the frame."* That clause is what `sheet-die-v1` needed and did not have.

## 3 · CORPSE EATER — ⭐ THE LOOP IS SOLVED WITHOUT A LOOP SHEET

Two generators refused the feeding prompt, and the one sheet that came back does not close: measured
frame 24 -> 1 at **46.0** mean delta against a ~20 baseline, plus a **57.4** jump at the row-1/row-2
boundary. It would snap twice a cycle.

⭐ **PING-PONG, which the owner proposed himself** (*"he's putting his head down, eating, bringing it
up, putting it down"*). Play a run of frames forward, then the SAME run backward. The last frame of
the reverse IS the first frame of the forward, so the loop closes **by construction** and needs no
cooperation from the generator at all.

**So the eat loop needs no new art.** Ping-pong the descent frames of `v2-crouch-in.png`. Only the
one-shot sheets have to be generated, and both already exist.

## 4 · THE FULL TILE SET — what still needs generating

⚠ **THE GENERAL TRACK NEEDS ONLY FOUR CARDS, NOT ONE PER LEVEL.** It cycles HP → DEF → ATK → PEN →
HP, so L0 = TOUGHER, L5 = ARMOURED, L10 = STRONGER, L15 = PIERCING, L20 = TOUGHER again. The four in
§1 cover every level forever. The owner asked for "seven per level"; it is four generals total plus
six racials per level.

Same preamble as §1. Subject and palette per card:

### Level 0 racials — the four beyond BLOOD DEBT and THE RISEN

| NAME | SUBJECT | PALETTE |
|---|---|---|
| POWER OF RA (mummies) | a colossal golden sun-disc eye opening in a black sky, firing one blinding pillar of light onto cracked desert ground that shatters and glows white at the impact | gold / obsidian / blinding white |
| BLOOD FRENZY (orcs) | a roaring orc warlord centre, veins blazing molten orange, the roar rippling outward through a pack behind him whose eyes ignite in sequence | rust-red / molten orange / smoke-grey |
| SCORCHED GROUND (demons) | a cracked hellscape floor at a low angle, fissures venting fire, the whole territory glowing from beneath | ember-red / charcoal / sulphur yellow |
| DEEP CURRENT (nagas) | a vortex of black water, a naga gatherer dissolving into it on one side and reforming out of a second vortex on the other, shapes carried through | deep teal / abyss black / cyan |

### Level 5 racials — the five he has ruled

| NAME | SUBJECT | PALETTE |
|---|---|---|
| CRIMSON TIDE (vampires, 50 % lifesteal) | a tidal wave of blood curling over a battlefield, a vampiric silhouette inside the curl drinking it in, wounds sealing | deep crimson / wine-black / pale rose |
| CORPSE EATER (zombies) | an enormous bloated zombie hunched over a heap, jaws impossibly wide, a sickly green aura pulling wisps of life into its mouth | rotten green / bruise-purple / bile yellow |
| ENDLESS DYNASTY (mummies) | a cracked pyramid with sarcophagi bursting open down its face, one pharaoh already striding out, more waking above | sandstone gold / tomb-black / turquoise |
| APEX PREDATOR (nagas) | one monstrous armoured piranha filling the card, dwarfing a shoal fleeing in its wake | steel-blue / blood-orange / deep-sea black |
| HELLSPAWN (demons) | a demonic pencil-creature splitting mid-shriek into two copies, and those two already splitting again | demon violet / ember red / graphite |

### Level 10 — the one he has ruled

| NAME | SUBJECT | PALETTE |
|---|---|---|
| THE SWARM (vampires) | a colossal bat-shaped cloud of thousands of bats, wings across the whole card, one pair of burning red eyes at its heart | wine-purple / crimson / near-black |

⛔ **ORCS LEVEL 5 IS THE ONLY GAP** — he has not ruled it. Everything else he has ruled now has a card.
