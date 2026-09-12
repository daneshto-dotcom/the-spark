# S174 — THE ART PLAN (four items, researched S173, to be executed S174)

**RESEARCH AND PLAN ONLY.** Nothing in this file was implemented in the session that wrote it: no
production file was edited and no art was generated. Every measurement below was taken from the tree
or from a command that was RUN, with its exit code captured; where a number is mine rather than the
owner's it says so at the number.

Four items, in the owner's own order of urgency:

| | item | state | who acts next |
|---|---|---|---|
| **1** | **THE DIREWOLF** — art has never existed | **⭐ RUNBOOK BELOW, HE ACTS TONIGHT** | **owner, then me** |
| 2 | **THE SCARAB (B4)** — white edge + width inflation | diagnosed, two different remedies | me |
| 3 | VOLTKIN (B9) | deferred by him; scope captured only | nobody yet |
| 4 | THE REST OF THE BOSS ART DEBT | list established + verified | me |

---
---

# ⭐ ITEM 1 — THE DIREWOLF RUNBOOK

> Owner, S173: *"Maybe the direwolf is those little goblins, the melee goblins from like twenty
> sessions ago. We didn't even — did we even have direwolf art? Oh, maybe that's what it was. Here,
> let me generate direwolf/wolf art, and you tell me how to loop over it. How did it turn into a loop
> that you can use into cutouts with all its states? I think it's a good time to add those in as
> well, when we're working the bosses."*

## 1.0 First, the answer to his question — and he guessed right

**No direwolf art has ever existed.** Verified two ways, not assumed:

- `find assets-source public -iname "*wolf*"` → **zero files** (exit 0, empty).
- `git log --all --diff-filter=A --name-only -- "*wolf*"` → **no commit has ever ADDED one** (exit 0,
  empty).

S168 added `direwolf` to `GOBLIN_KINDS` with no `ATLASES` entry, deliberately — *"the owner is
generating the sprite himself"*. `ATLASES` is `Partial<>`, so a missing key is **silent**: the wolf
fell through to `drawGoblin`'s procedural puppet, which is the **green pre-veo goblin** the whole
roster was built to replace. So *"those little goblins, the melee goblins from like twenty sessions
ago"* is exactly what it was, and his read of his own playtest is correct.

⚠ **WHAT HE WILL SEE IF HE PLAYS TONIGHT BEFORE HIS ART LANDS:** not the green goblin any more. S173
already pointed `ATLASES.direwolf` at the **zombie goblin-hound sheet** as a stand-in, so the pack
currently reads as a pack of hounds — right kind of animal, wrong animal. That is a holding action
and this runbook is what replaces it.

---

## 1.1 WHAT HE SUPPLIES — one image, and it does more work than the four clips do

**ONE seed design PNG of the direwolf.** Everything downstream is seeded image-to-video off it, and
that is not a style preference — it is the mechanism behind his own standing requirement, recorded
verbatim in `assets-source/race-tier3-units/clip-spec.json`:

> *"make sure the videos are consistent throughout and it doesnt show a different character for every
> frame - important to base them on the same creature image!"*

Text-to-video four times gives **four different wolves**. The actual pixels of one PNG give **that
wolf** in all four clips. There is nothing to re-roll for consistency if the seed is used; there is
no prompt that buys it back if it is not.

### The seed image spec — every line is a pipeline requirement, not taste

Distilled from `assets-source/race-tier3-units/design-spec.json` `sharedStyle`, which is the block
the six shipped tier-3 units were drawn to.

| | |
|---|---|
| **subject** | ONE direwolf, full body, nothing else in the shot |
| **pose** | three-quarter view **action pose, facing and moving to the RIGHT** |
| **framing** | fills **most** of the frame height — but with **visible empty margin on all four sides** |
| **background** | **plain pure WHITE, edge to edge.** No floor, no horizon, no scenery, no panels, no border, no die-cut sticker edge |
| **⛔ shadow** | **NO ground shadow of any kind.** No oval on the floor, no contact shadow, no base platform. The lowest ink in the image must be part of the wolf itself |
| **style** | bold black ink outline, flat cel shading, a few crisp highlight streaks; muted earthy palette with one saturated accent |
| **originality** | an ORIGINAL creature — not resembling any existing franchise's wolf |
| **format** | PNG |

### ⛔ AND THE ONE THAT IS SPECIFIC TO A WOLF: **IT MUST NOT BE WHITE OR GREY**

This is the trap this particular creature walks into and no other unit in the roster has faced.

The matte in `build-sprite-atlas.mjs` does **not** key "white → transparent". It finds **near-white
connected to the frame border** and removes that, then a second pass punches out **enclosed**
near-white pockets above a size limit. A white wolf on a white background is therefore not a hard
case — it is the case the tool cannot distinguish at all, and a grey one loses its fur to the same
rule that removes veo's background.

The shipped fix is already written into the house style and it is a **positive** instruction, not a
negative one:

> *"EVERY LIGHT TONE ON THE CREATURE MUST CARRY A VISIBLE COLOUR CAST … every pale area (fur, chitin,
> bone, teeth, fangs, claws, eyes, metal glints, highlights) must be a colour a painter would NAME —
> bone-yellow, dull ochre, sea-green, warm tan, steel-blue, cold lavender-grey — and must be clearly
> more saturated than a neutral grey. NOTHING on the creature may be white, off-white, cream,
> bleached, or a desaturated near-white grey. The plain background is the ONLY white in the image."*

⇒ **Concretely, for the wolf:** charcoal / slate-blue / iron-grey-with-a-blue-cast fur, **bone-yellow**
fangs and claws, **burning amber** eyes, a **dull ochre** or **rust** underbelly. Not white fur, not
cream fangs, not silver highlights. ⚠ *The palette above is MINE — a suggestion sized to the matte,
not a ruling. Any colour works as long as nothing on the animal is a near-white.*

---

## 1.2 HOW MANY CLIPS, AND OF WHAT

**FOUR clips. `idle` · `walk` · `attack` · `die`.** That is what a UNIT needs
(`ART_PIPELINE.md` — a BUILDING needs damage states instead, and confusing the two wastes a whole
round).

| | |
|---|---|
| duration | **4 seconds** each (what `clip-spec.json` ships: `"durationSeconds": 4`) |
| resolution | **720p** (`"resolution": "720p"`) |
| frames kept | **12 per state.** Everything else in the mp4 is discarded — the packer takes a stride of 12 and throws the rest away |
| loop | idle / walk / attack are **seamless loops**. ⛔ **`die` is NOT a loop** |

⭐ Why 4 s when only 12 frames survive: veo holds an image-to-video seed faithfully for about the
first second and then drifts, so the extra length is head-room for a `sampleWindow` that samples only
the front of the clip. That knob is mine to set at pack time, from the contact sheet. He does not
need to think about it.

---

## 1.3 ⭐ THE EXACT PROMPTS — four, copy-paste

### Step A — write the wolf's description ONCE

Fill this in from his own seed image and then paste it **identically** into all four prompts. Every
prompt re-describes the creature on purpose: **veo drifts across a 4-second clip, and the clips that
drift least are the ones whose prompt keeps restating what the creature IS** (that sentence is the
in-tree note at `clip-spec.json`).

```
THE WOLF LINE  (his words, used verbatim four times):

    The huge shaggy charcoal-and-slate direwolf with its bone-yellow fangs,
    burning amber eyes, rust-brown underbelly and heavy black claws

  ⚠ MINE, as a default. Replace it with whatever his own art actually shows — but then use
    HIS line, unchanged, in all four prompts below.
```

### Step B — the four prompts

Each is `[THE WOLF LINE] + [action clause]`, then **the shared block in Step C appended to all
four**.

**1 · IDLE**
```
The huge shaggy charcoal-and-slate direwolf with its bone-yellow fangs, burning amber eyes,
rust-brown underbelly and heavy black claws stands braced in place on all four legs, breathing
heavily with its ribs rising and falling, head low and swinging slowly from side to side as it
scans, ears flicking, hackles shifting, tail swaying, lips twitching back off its bone-yellow
fangs. Its four paws stay planted on the ground and it settles back to the same neutral stance.
```

**2 · WALK**
```
The huge shaggy charcoal-and-slate direwolf with its bone-yellow fangs, burning amber eyes,
rust-brown underbelly and heavy black claws runs to the right in a hard low gallop, seen from
the side, all four legs cycling in a clean repeating run cycle, head down and level with its
shoulders, thick tail streaming straight out behind it, shaggy fur rippling. It runs in place
and never leaves the frame.
```

**3 · ATTACK**
```
The huge shaggy charcoal-and-slate direwolf with its bone-yellow fangs, burning amber eyes,
rust-brown underbelly and heavy black claws lunges forward and BITES, jaws snapping wide open
to bare its bone-yellow fangs as it drives its head forward, then recoiling low onto all four
paws into its braced stance ready to lunge again. Its jaws are the whole attack. It carries
nothing, picks nothing up, and no weapon or object ever appears.
```

⛔ **THE VERB IS "BITES" AND THAT IS DELIBERATE, NOT FLAVOUR.** From `clip-spec.json`, paid for
three times over: *"the castle vampire's attack clip drifted a blade in on THREE separate
generations under a bare negative, a stronger negative, and an explicit positive; what finally
worked was changing the VERB to a bite so the jaws were the weapon and the arms had nothing to
do."* A wolf that "strikes" or "attacks" can acquire a prop. A wolf that BITES cannot.

**4 · DIE** ⛔ *not a loop*
```
The huge shaggy charcoal-and-slate direwolf with its bone-yellow fangs, burning amber eyes,
rust-brown underbelly and heavy black claws is struck. It yelps, its legs give way beneath it,
and it COLLAPSES ONTO THE GROUND. It is already fully down by the middle of the clip. For the
entire second half it lies SPRAWLED FLAT AND MOTIONLESS on its side on the ground, legs limp,
head resting on the ground, tail still, completely inside the frame. It does not get up and is
NOT standing at any point in the second half.
```

⛔ **WHY THE DIE PROMPT IS THAT EXPLICIT.** `clip-spec.json`, again from money already spent:
*"'collapses' alone gave veo four seconds of staggering and no landing, and three of six death rows
had to be re-rolled."* The clip must state **WHEN** the body is down (halfway) and **WHAT IT LOOKS
LIKE AT REST**. Both sentences are load-bearing.

### Step C — THE SHARED BLOCK, appended to all four prompts

This is the exact text `scripts/gen-character-clips.mjs` appends to every clip in the shipped
pipeline. Paste it after each of the four action prompts above, unchanged.

```
Traditional 2D cartoon animation of this exact character, in the same bold black ink outline and
flat cel-shaded style as the source image, with the same colours. The camera is COMPLETELY STATIC
— no pan, no zoom, no parallax, no camera shake. The character stays centered in frame at a
constant size and never walks out of shot. CRITICAL FRAMING: draw the character at EXACTLY the
same size as it appears in the reference image, filling the same proportion of the frame. Do not
zoom in, do not crop closer, do not push the camera nearer and do not enlarge or shrink the
subject relative to the reference. The framing and the subject scale must match the reference
image exactly. Plain solid pure white background, empty, no floor, no scenery, no shadow cast on
anything, no text, no watermark, no letterboxing artwork, no vignette. FILL THE ENTIRE FRAME. The
white background must run edge to edge and corner to corner of the output video. Do NOT letterbox,
pillarbox, matte, inset or frame the shot: there must be no black bars at the top, bottom, left or
right, no border, and no rendering of the scene inside a smaller rectangle. Every pixel to the
very edge of the frame is the same plain white background. ABSOLUTELY NOTHING may appear behind or
beside the character: no walls, no pillars, no columns, no arches, no stonework, no doorways, no
windows, no floor line, no horizon, no grey panels, no grey bars, no grey blocks, no corner
brackets, no frame markings and no border decoration of any kind. Every single pixel that is not
part of the character itself is FLAT PURE WHITE, right out to all four edges of the frame. The
whole animal — head, every leg, tail and ears — stays fully inside the frame at all times with
clear empty margin on all four sides; nothing may touch or cross the frame edge. Smooth loopable
motion.
```

⚠ The last sentence before "Smooth loopable motion" is **added by me** to the shipped block. It is
the `ART_PIPELINE.md` margin rule, and it exists because of two faults that have each cost a
regeneration:

- **EDGE AMPUTATION — NOT RECOVERABLE.** A limb that runs off the side of the source frame was never
  generated. Widening the cell just puts empty space around a leg that ends in a flat stump. This is
  what happened to the Kraken's tentacles; it is the single most expensive mistake in this pipeline.
- **A FRAME-FILLING SUBJECT BREAKS THE SIZE NORMALISER.** `check-atlas-scenery.mjs` says it in its
  own failure text: *"if the offending clip is FRAME-FILLING re-roll it demanding visible empty
  margin — a clamped measurement makes the normaliser under-estimate and over-shrink the row."* This
  is the **exact defect the scarab has today** (Item 2). Margin is what prevents it.

⛔ The **pillarbox** paragraph in the shared block is likewise not padding. veo renders the scene
inset inside a narrower frame and pads the sides with black bars; on the Kraken that was 27% opaque
near-black, the owner saw it live (*"he moves with a black box frame/background around him"*), and
the matte's bar rule missed it by a hair.

---

## 1.4 ⚠ THE SHORTCUT — he may not have to generate the clips at all

**`scripts/gen-character-clips.mjs` already exists and does all four in one batch.** It fires the
four requests concurrently, writes each operation name to disk the moment it exists (so a failure
cannot orphan a paid generation) and polls them together — wall-clock of roughly ONE clip instead of
four. It reads `GEMINI_API_KEY`, falling back to
`~/.claude/mcp-servers/gcp-vertex/.env`; default model `veo-3.1-generate-preview` (strongest tier),
overridable with `VEO_MODEL`.

⇒ **If he wants the least work: send ONE seed PNG and nothing else. I write the clip-spec with the
four prompts above and run the batch.** If he prefers his own generator, §1.3 is the copy-paste and
he sends back four mp4s. Either path lands in the same place and §1.5 is identical.

---

## 1.5 THE EXACT COMMANDS, IN ORDER, WITH REAL PATHS

⭐ **The local toolchain is already installed on this machine — verified, not assumed:** ffmpeg 8.1
(exit 0), ffprobe 8.1 (exit 0), numpy 2.4.4 / scipy 1.17.1 / Pillow 12.2.0 (exit 0). Nothing needs
installing to run any of this today.

### Step 0 — where the files go

⚠ **The folder is NEW and the naming is MINE.** `race-tier9-summons` rather than a `godly-direwolf`
folder, for two reasons: the direwolf is a **tier-9 boss summon**, and it will not be the last one —
the Pharaoh's locust cloud is the same shape of problem. And putting the sheet under `public/art/`
rather than `public/godly/` is what makes it **reachable by the atlas guard**: `check:atlas` scans
`public/art/race-units`, `public/art/race-tier3-units`, `public/art/race-tier9-bosses` and the three
tower/castle dirs — **no `public/godly` directory is scanned by anything** (that is a real gap, noted
in Item 4).

```
assets-source/race-tier9-summons/direwolf.png                 <- HIS SEED IMAGE
assets-source/race-tier9-summons/clips/direwolf/idle.mp4      <- the four clips
assets-source/race-tier9-summons/clips/direwolf/walk.mp4
assets-source/race-tier9-summons/clips/direwolf/attack.mp4
assets-source/race-tier9-summons/clips/direwolf/die.mp4
assets-source/race-tier9-summons/clip-spec.json               <- written in step 2
assets-source/race-tier9-summons/atlas-specs.json             <- written in step 2
                        ↓ built ↓
public/art/race-tier9-summons/direwolf-atlas.png
public/art/race-tier9-summons/direwolf-anim.json
```

### Step 1 — ⛔ THE CHECKER, BEFORE THE PACKER. ALWAYS.

```bash
node scripts/check-clip.mjs assets-source/race-tier9-summons/clips/direwolf/ > /tmp/clip.txt 2>&1
echo "CLIP_EXIT=$?"
cat /tmp/clip.txt
```

Read `CLIP_EXIT` from that captured `$?`, never from a trailing wrapper line.

| exit | meaning | what to do |
|---|---|---|
| **0** | no side bars, subject clear of every edge | pack it |
| **1** | a fault — the report says WHICH and whether it is recoverable | see the two rows below |
| **3** | ffmpeg or python missing | **toolchain, not a verdict on the art.** Not applicable here — both verified present |

- **PILLARBOXED → RECOVERABLE.** Bars throughout: nothing to do, the packer crops them. Bars that
  **change mid-clip**: the checker prints the exact `"sampleStart": N` to paste into the atlas spec.
  That is the case the packer is documented as *not* handling on its own.
- **SUBJECT TOUCHES THE FRAME EDGE → ⛔ NOT RECOVERABLE. REGENERATE THAT ONE CLIP, FRAMED SMALLER.**
  Only the offending state, not all four.

### Step 2 — the two spec files, LITERAL, ready to paste

**`assets-source/race-tier9-summons/clip-spec.json`** (record of what was asked for; also the input
to `gen-character-clips.mjs` if I generate the clips):

```json
{
  "_comment": [
    "SPARK — the Orc Warlord's DIREWOLF (owner R149). Art generated by the OWNER, S173/S174.",
    "Every clip is seeded IMAGE-TO-VIDEO off direwolf.png — owner: 'make sure the videos are",
    "consistent throughout and it doesnt show a different character for every frame - important to",
    "base them on the same creature image!'",
    "The prompts re-describe the wolf in full every time because veo drifts across a 4s clip.",
    "The attack verb is BITE so the animal cannot acquire a prop (the castle vampire drifted a blade",
    "in on three separate generations until the verb changed).",
    "The die clip states WHEN the body is down (halfway) and WHAT IT LOOKS LIKE AT REST."
  ],
  "durationSeconds": 4,
  "resolution": "720p",
  "characters": [
    {
      "name": "direwolf",
      "seed": "assets-source/race-tier9-summons/direwolf.png",
      "outDir": "assets-source/race-tier9-summons/clips/direwolf",
      "states": {
        "idle": { "prompt": "<<PASTE PROMPT 1 FROM §1.3 STEP B>>" },
        "walk": { "prompt": "<<PASTE PROMPT 2>>" },
        "attack": { "prompt": "<<PASTE PROMPT 3>>" },
        "die": { "prompt": "<<PASTE PROMPT 4>>" }
      }
    }
  ]
}
```

**`assets-source/race-tier9-summons/atlas-specs.json`** — this one is consumed by the builder, so
every value matters:

```json
{
  "_comment": [
    "SPARK — atlas spec for the Orc Warlord's direwolf.",
    "ticksPerFrame idle 7 / walk 4 / attack 5 / die 5 MATCHES the shipped roster, so the wolf",
    "animates at the same cadence as every other creature rather than reading as a separate game.",
    "cellH 200 matches the tier-3 units and the six goblins; cellW is a FLOOR, not a cap — the",
    "builder widens the cell to fit a long body and a streaming tail.",
    "enclosedWhiteLimitPct 0.0002 is the MEASURED goblin-roster value, not the tier-3 4e-05: that",
    "tighter limit is only safe under the colour-cast clause, and a wolf's fangs and eye whites are",
    "exactly the features it would punch out. VERIFY on the built sheet and tighten only if the",
    "guard reports an enclosed pocket."
  ],
  "specs": [
    {
      "name": "direwolf",
      "outDir": "public/art/race-tier9-summons",
      "cellW": 200,
      "cellH": 200,
      "framesPerState": 12,
      "states": {
        "idle":   { "clip": "assets-source/race-tier9-summons/clips/direwolf/idle.mp4",   "ticksPerFrame": 7 },
        "walk":   { "clip": "assets-source/race-tier9-summons/clips/direwolf/walk.mp4",   "ticksPerFrame": 4 },
        "attack": { "clip": "assets-source/race-tier9-summons/clips/direwolf/attack.mp4", "ticksPerFrame": 5 },
        "die":    { "clip": "assets-source/race-tier9-summons/clips/direwolf/die.mp4",    "ticksPerFrame": 5 }
      },
      "enclosedWhiteLimitPct": 0.0002,
      "normaliseStateScale": true
    }
  ]
}
```

⚠ Two knobs are **added at pack time, from the contact sheet, not guessed up front**:
`"sampleStart": N` on any state the checker flagged as changing its bars mid-clip, and
`"sampleWindow": N` on any state that drifts late (the attack row is worst in every character,
because the renderer HOLDS an attack's final frame through the recovery half of the cadence — so a
degraded last frame is the pose on screen the longest).

### Step 3 — BUILD

```bash
node scripts/build-atlas-set.mjs assets-source/race-tier9-summons/atlas-specs.json direwolf > /tmp/build.txt 2>&1
echo "BUILD_EXIT=$?"
tail -40 /tmp/build.txt
```

`BUILD_EXIT` must be **0**. The script does not swallow a failure: one bad entry stops the run
non-zero and names the spec, because a missing atlas is **silent** at runtime (`loadAtlas` catches,
and the creature falls back to the green puppet).

### Step 4 — THE PIXEL GUARD

```bash
node scripts/check-atlas-scenery.mjs public/art/race-tier9-summons > /tmp/atlas.txt 2>&1
echo "ATLAS_EXIT=$?"
cat /tmp/atlas.txt
```

- **exit 0** — clean. **exit 1** — a defect, named: welded grey scenery / cross-row size mismatch /
  enclosed near-white / **matte fringe on the cut-out edge** / a surviving letterbox.
- **exit 3** — *"the pixel toolchain is missing"*, needing `pip install numpy scipy Pillow`. **NOT a
  verdict on the art.** Already satisfied on this machine (verified above), but that is the line to
  recognise if it appears.
- ⛔ **This guard must never block a live deploy** — S165 wired it into `npm run build`, the Pages
  runner has no numpy, and the site sat STALE while the owner waited for new art. It runs as its own
  `atlas-guard` CI job so a dirty atlas turns CI red **and ships while it does**.
- ⚠ To have it cover the new folder permanently, `public/art/race-tier9-summons` must be appended to
  the first `check:atlas` invocation in `package.json`. **One word.** Without it the sheet is built
  but never inspected.

### Step 5 — THE CODE SIDE: **ONE LINE**

`src/render/goblinRenderer.ts`, in the `ATLASES` table (currently line 180):

```ts
  direwolf: '/godly/goblin-hound/anim/goblin-hound',      // ← the S173 stand-in
  direwolf: '/art/race-tier9-summons/direwolf',           // ← what it becomes
```

**That is the whole code change**, and the reason it is only one line is worth stating so nobody goes
looking for more:

- `direwolf` is already in `GOBLIN_KINDS`, so it is already drawn by this renderer, already gets HP
  pips, the seat-coloured ground ring, the facing dead-zone and the tick-derived frame index.
- It is already **reachable by a load path**: `goblinRendererLazyAtlas.test.ts` requires every
  `ATLASES` key to be `EAGER_ATLAS_TYPES || preloadRaceKit || GOBLIN_KINDS`, and the wolf satisfies
  the third arm via `ensureTypeAtlas` in the draw loop. **Do NOT add it to `EAGER_ATLAS_TYPES`** —
  a sibling test asserts that set is *exactly* the six goblins, and widening it restores megabytes to
  first sync.
- Protocol version: **no bump.** `direwolf` has been a serialized `CreatureType` since the 44→45 bump
  in S168. Art is not on the wire.
- ⚠ The stand-in comment block above that line (the long S173 B5 note explaining the goblin-hound
  alias) should be rewritten when the line changes, not left describing a decision that no longer
  holds. That is the S158 lesson — a stale comment is the defect, not the cosmetics.

### Step 6 — THE GATES, each read from a captured `$?`

```bash
npm run typecheck > /tmp/tc.txt 2>&1;    echo "TYPECHECK_EXIT=$?"
npx vitest run > /tmp/unit.txt 2>&1;     echo "UNIT_EXIT=$?"
npm run build > /tmp/build2.txt 2>&1;    echo "BUILD_EXIT=$?"
```

⛔ **A trailing `[exited with code 0]` from the wrapper is NOT the gate's exit code.** Only the
captured `$?` is a verdict. ⚠ And the new PNG lands in `public/`, so it is a **static asset, not
bundle**: it does not count against the 900 KiB bundle charter (784.8 KiB used). The build prints the
static payload (62 MiB) but never gates on it.

---

## 1.6 THE ONE-PAGE VERSION, for him

1. Generate **ONE** direwolf PNG: full body, three-quarter, **facing right**, **pure white
   background**, **no ground shadow**, visible margin all round, **nothing on the animal near-white**
   (no white fur, no cream fangs — bone-yellow, amber, ochre instead).
2. Either **send me that PNG and stop** (I generate all four clips in one batch), or generate four
   4-second 720p clips yourself — **idle · walk · attack · die** — each **seeded on that same PNG**,
   using the four prompts in §1.3 with the shared block appended.
3. **The attack is a BITE.** The die clip is **down by halfway** and **still, on the ground, in
   frame** at the end, and is **not** a loop.
4. Drop the clips in `assets-source/race-tier9-summons/clips/direwolf/` as
   `idle.mp4 walk.mp4 attack.mp4 die.mp4`.
5. I run the checker, pack the atlas, run the guard and change one line.

---
---

# ITEM 2 — THE SCARAB (B4)

> Owner: *"the scarab video loop looks retarded. You still have the white edges. Just cut it out
> shorter. Like, you don't have to cut the whole square of how it looks. There's the scarab, there's
> black around it, and then the edges, there's still those white corners that we still didn't get rid
> of. Just get rid of it once and for all. Come on. And also it still gets like inflated and weird
> when it attacks. So it moves fine, but when it moves it has the white edges. And when it attacks,
> it like gets two times bigger. We'll probably have to regenerate it if you can't make it right."*

**PENDING — filled in below in this same session.**

---

# ITEM 3 — VOLTKIN (B9), DEFERRED BY HIM

**PENDING.**

---

# ITEM 4 — THE REST OF THE BOSS ART DEBT

**PENDING.**
