# SPARK — THE VEO PROTOCOL: one image → four clips → an atlas

Written S173 at the owner's instruction, after a session burned ~$2 on a solved problem:

> *"From now on it's a protocol. When you're generating a video, look at what worked the best. Write
> a JSON file and an MD file to know how to do it correctly from a generated image. Once I present
> you an image, or you generate an image — how to make it into all the stances, into generated video
> loops. **STOP WASTING MY MONEY.** Be coherent about this, be methodical, be technical. We're gonna
> make it into a slash command — `/veo-generate`. All we need is a few seconds, up to four. And then
> we can do the cutouts. You need the whole procedure."*

**Read `ART_PIPELINE.md` first.** That document owns the *what* — who does which stage, whether a
subject is a UNIT or a BUILDING, why the pipeline needs 12 frames and not a video, and what the
packer's traps are. **This document owns the *how* of stage 3 only: turning ONE approved still into
four clean clips without paying twice.** Where the two touch, `ART_PIPELINE.md` is the parent and
this file must not contradict it; if it ever does, that is a defect in this file.

Machine-readable companion: **`.claude/veo-recipes.json`** — the same geometry, prompts and pass
criteria in a form a future session can read in one call. Operator front end:
**`/veo-generate`** (`.claude/skills/veo-generate/SKILL.md`).

---

## ⛔ THE INCIDENT THIS DOCUMENT IS THE ANSWER TO (S173, and it is the whole point)

I generated **8 clips at $0.50 each — $4.00 — without first opening the spec that produced the art
the owner already likes.** `assets-source/race-tier9-bosses/clip-spec.json` had been sitting in the
tree the entire time, with six working characters in it.

Hand-run verdict, `node scripts/check-clip.mjs` over all eight, exit code captured as `1`:

| clip | bars (of 1280) | subject touches edge | verdict |
|---|---|---|---|
| direwolf/attack | none | no | ✅ **PASS — packable as-is** |
| direwolf/idle | L322 R322, throughout | no | recoverable (packer crops it) |
| direwolf/die | L322 R323, **change at f68** | no | recoverable — `sampleStart: 68` |
| direwolf/walk | L321 R322, change at f36 | **yes (left)** | ⛔ **NOT RECOVERABLE** |
| voltkin/idle | L318 R317, throughout | no | recoverable |
| voltkin/walk | L318 R317, change at f36 | **yes (left)** | ⛔ **NOT RECOVERABLE** |
| voltkin/attack | L318 R317, throughout | **yes (all four sides, 14/24 frames)** | ⛔ **NOT RECOVERABLE** |
| voltkin/die | L318 R317, throughout | **yes (all four sides)** | ⛔ **NOT RECOVERABLE** |

**Four of eight are unrecoverable. One of eight is clean.** ~$2.00 bought nothing.

⭐ **And the mechanism is arithmetic, not luck.** Both seeds were portrait-ish cut-outs —
`direwolf-healthy.png` is 516×622 (aspect 0.83), `voltkin-healthy.png` 603×709 (0.85) — handed to a
request that is **hardcoded `aspectRatio: '16:9'`** in `scripts/gen-character-clips.mjs`. veo
honoured the seed's shape and **pillarboxed** it: measured bars of ~320 px a side leave
**1280 − 322 − 323 = 635 px of usable width, 49.6% of the frame.** The subject was then drawn to
fill *that* column, so any limb that extended during the motion left the picture. The `attack` and
`die` states — the two that extend limbs hardest — are exactly the two that came back destroyed.

⇒ **A portrait seed into a 16:9 request is not a style risk. It halves the canvas, and the half it
keeps is the half the character was already filling.**

---

## ⛔ STEP ZERO — READ THE LAST KNOWN-GOOD SPEC AND COPY ITS PROMPT SHAPE

**This is the step whose absence cost the money. It is not optional and it takes ninety seconds.**

```bash
cat assets-source/race-tier9-bosses/clip-spec.json          # the reference. Owner-approved art.
cat .claude/veo-recipes.json                                # the same thing, machine-readable
```

The owner names this one himself: *"look at the ones that were generated well, like the freaking
zombie boss. Everything about him looks great."* Six bosses, four states each, twenty-four clips,
and the art shipped.

⭐ **What you are copying is the SHAPE, and the shape is SHORT.** The zombie's idle prompt, in full:

> *"the enormous bloated grey-green undead brute stands in place . He shifts his weight slightly and
> his head turns as he surveys the field. His swollen flesh quivers and sloshes with every movement;
> he is wet, heavy and wrong. He stays in the SAME SPOT for the whole clip and does not walk
> anywhere."*

A creature clause, a motion clause, a character-of-movement clause, a stay-put clause. **No camera
instruction. No framing paragraph. No style block.**

⚠ **AND THE REASON THAT WORKS IS NOT THAT VEO DOESN'T NEED THEM — IT IS THAT
`scripts/gen-character-clips.mjs` APPENDS THEM.** The script's `SHARED` constant carries the static
camera, the pure-white background, the anti-letterbox paragraph, the anti-scenery paragraph and the
match-the-reference-scale paragraph, and each of those clauses is a bug that was paid for once
already (read the comments — they name the clip that earned each one). The per-state prompt is short
**because the script is doing the other 80%.**

⛔ **So: generate through the script.** If you call the `veo_generate` MCP tool or the REST endpoint
by hand, you get the short prompt and none of the protections, and you will re-buy the grey stone
pillars behind the bat, the black box around the Kraken, and the melting stink tower. The tree's own
comment on why the script exists at all is timing, not safety — but its safety is now the larger
half.

---

## 1 · PREPARE THE SEED

### The two recipes, and which one to use

| | **A — 16:9 PADDED (recommended)** | **B — SQUARE FULL-FRAME (historical)** |
|---|---|---|
| canvas | **1920×1080**, flat white, RGB | 1024×1024, flat white, RGB |
| subject | **52% of canvas height**, centred | 88–94% of canvas height |
| evidence | `direwolf/attack.mp4`, S173 — the ONE clip of eight that measured `PASS  no side bars, subject clear of every edge — packable as-is` | the six tier-9 bosses, S167 — owner-approved art, shipped |
| sample size | **n = 1 clip** | n = 24 clips across 6 characters |
| pillarboxing | none observed | **present in most**; Kraken attack needed `sampleStart: 60` |
| amputation | none observed | **Kraken tentacles cut off, twice** |

### ⭐ RECOMMENDATION: **A, the 1920×1080 padded seed at 52% subject height.**

Three reasons, in order of how much weight they carry:

1. **It removes the failure at the mechanism, not by aiming better.** `gen-character-clips.mjs` sends
   `aspectRatio: '16:9'` unconditionally. A 16:9 seed is already the requested shape, so there is
   nothing for veo to pillarbox. Recipe B's 1:1 seed *must* be fitted into 16:9, and the tier-9
   clips show it being fitted with bars. Every `sampleStart` in the shipped specs is a scar from
   this.
2. **The 48% of empty canvas IS the margin the attack state needs.** The one boss whose seed filled
   the most width — the Kraken at **96%W** — is the one whose tentacles were amputated, twice, and
   the owner's words for it are in `check-clip.mjs`'s own header: *"it cuts out his tentacles, which
   looks stupid."* The zombie he praises sits at **89%W × 88%H** with 53/55/80/44 px of margin, the
   most generous of the six. The correlation runs the right way and the mechanism is obvious: a limb
   that extends needs somewhere to extend *into*.
3. It is the only recipe that has produced a first-try clean `check-clip` since the failure mode was
   understood.

⚠ **AND THE HONEST CAVEAT, because n = 1 is n = 1.** Recipe B has twenty-four clips of
owner-approved *art* behind it; A has one clean *frame check*. Those measure different things — B is
proven on style and character identity, A is proven on framing. Nothing in A changes the style
mechanism (the seed is still the same drawing, still image-to-video), so the risk A carries is
"subject drawn smaller than ideal in the output", which is free to fix — `cellW`/`cellH` and
`normaliseStateScale` in the atlas spec both absorb it. The risk B carries is a re-roll at $0.50.
**If the first A-recipe character comes back with the subject too small or the style drifting, say
so here, at this table, with the measurement.** Until then A is the recipe.

⚠ **52% is MY number, not the owner's.** It is the ratio measured off the single clean S173 clip's
seed, rounded. It has not been swept — 45% and 60% may both work as well. Do not quote it to him as
a finding.

### The snippet — tested, both branches, exit 0

Works on a transparent cut-out (alpha bbox) *and* on a white-background PNG (luminance bbox).
Verified S173 against `direwolf-healthy.png`, `voltkin-healthy.png`,
`boss-zombies-whopper.png` (→ 1920×1080, 52%H, centred, margins even to ±1 px) and a synthetic
3.33-aspect subject to exercise the width-fit branch.

```python
"""Prepare a veo seed: subject -> flat-white 1920x1080 16:9 canvas at 52% of canvas height."""
import sys
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
CANVAS_W, CANVAS_H = 1920, 1080
SUBJECT_H = 0.52                      # fraction of canvas height the subject occupies

im = Image.open(SRC).convert('RGBA')
# Trim to the actual subject: alpha for a cut-out, else anything not near-white.
if im.getchannel('A').getextrema()[0] < 255:
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
else:
    grey = im.convert('L').point(lambda v: 255 if v < 235 else 0)
    box = grey.getbbox()
if box is None:
    raise SystemExit(f'{SRC}: no subject found (blank image?)')
im = im.crop(box)

target_h = int(CANVAS_H * SUBJECT_H)
scale = target_h / im.height
new = (max(1, round(im.width * scale)), target_h)
if new[0] > int(CANVAS_W * 0.52):                  # a wide subject fits on WIDTH instead
    scale = (CANVAS_W * 0.52) / im.width
    new = (int(CANVAS_W * 0.52), max(1, round(im.height * scale)))
im = im.resize(new, Image.LANCZOS)

canvas = Image.new('RGB', (CANVAS_W, CANVAS_H), (255, 255, 255))
canvas.paste(im, ((CANVAS_W - im.width) // 2, (CANVAS_H - im.height) // 2), im)
canvas.save(DST)
print(f'{DST}  {CANVAS_W}x{CANVAS_H}  subject {im.width}x{im.height} '
      f'= {100*im.width/CANVAS_W:.0f}%W x {100*im.height/CANVAS_H:.0f}%H')
```

⛔ **FLATTEN TO RGB ON WHITE. NEVER SEND AN RGBA CUT-OUT.** The snippet does this by pasting through
the alpha channel onto a white canvas. A transparent PNG sent as a seed has its alpha composited by
whatever is upstream, and black is a common default — which hands the matte a black background it
cannot key (`build-sprite-atlas.mjs` keys **near-white connected to the frame border**, plus a narrow
bar-shaped near-black rule). This is also why the SHARED prompt block spends a whole paragraph on
"every pixel is FLAT PURE WHITE".

⚠ **ONE SEED PER CHARACTER, FOR ALL FOUR STATES.** Not one seed per state. The seed is the only
yardstick the four independent generations share; that is what keeps idle/walk/attack/die the *same*
creature and the *same size*. The owner's standing requirement, quoted in the generator:
*"make sure the goblin when he is idle or walking is same as attacking… need to stay consistent
throughout."*

⚠ The healthy/standing pose is the seed. A `hurt` or `dead` still is **not** a second seed — at most
it is a visual reference for where the `die` clip should come to rest.

---

## 2 · THE PROMPT FORMULA

```
<CREATURE CLAUSE> <MOTION CLAUSE> <CHARACTER-OF-MOVEMENT CLAUSE> <CONTAINMENT CLAUSE>
```

…and nothing else. The script appends `SHARED` (style, static camera, white background,
anti-letterbox, anti-scenery, match-the-reference-scale) and, if `staticSubject: true` is set on the
character, the hold-the-geometry block for structures.

### The rules that earned their place

⛔ **RE-DESCRIBE THE CREATURE IN EVERY SINGLE CLIP.** All four zombie prompts open with *"the enormous
bloated grey-green undead brute"*. Each state is a separate generation with no memory of the others;
drop the clause and veo drifts to a different creature. The seed pins the drawing, the clause pins
the *words* — you need both.

⚠ **BUT KEEP IT TO ONE CLAUSE.** From the tier-9 spec's own header: *"Long re-descriptions are what
made veo REDRAW the subject each frame instead of animating a fixed one — the shipped stink tower
melted for exactly that reason."* Identity in one clause, motion in the rest.

⛔ **PICK AN ATTACK VERB THAT CANNOT ACQUIRE A PROP.** *"A WOLF BITES."* Verbs that imply hands make
the generator hand the creature a weapon it does not own — **that cost three re-rolls on the castle
vampire.** Bites, gores, headbutts, discharges lightning, slams with its own body: safe. Swings,
strikes, wields, chops: it will find something to swing.

⛔ **THE `die` CLIP MUST BE DOWN BY THE HALFWAY POINT AND END STILL, ON THE GROUND, IN FRAME.** The
packer takes an even stride across the clip; a death that is still falling at the last frame gives a
row whose final pose is mid-air, and the renderer holds that. The tier-9 wording is the template and
the capitals are load-bearing:
> *"…is struck a mortal blow. He staggers, collapses and **FALLS ONTO THE GROUND**. He is already
> fully down by the middle of the clip. For the entire second half he lies motionless on the ground,
> completely still, not moving at all."*

⭐ **GIVE EACH CHARACTER ONE MOVEMENT AXIS AND REPEAT IT VERBATIM IN ALL FOUR STATES.** The bosses
carry owner-fixed fear axes — Vlad IMPERIAL, Kraken MONSTROUS, Pharaoh ANCIENT & CURSED, Whopper
DISGUSTING, Warlord BRUTAL, Archdemon VICIOUS & TERRIFYING — rendered as one sentence pasted
unchanged into every state (*"He never hurries and never crouches; every motion is unhurried, upright
and contemptuous."*). It is what stops six monsters moving identically, and R99 already forbids two
races converging.

⚠ **DO NOT ADD FRAMING OR CAMERA LANGUAGE TO A PER-STATE PROMPT.** It is already in `SHARED`, in
wording that was tuned against specific failures. A second, differently-worded copy competes with it.

### The per-state templates — a UNIT

`{CREATURE}` = the one-clause identity. `{AXIS}` = the movement-character sentence.

| state | prompt |
|---|---|
| **idle** | `{CREATURE}` stands in place . He shifts his weight slightly and his head turns as he surveys the field. `{AXIS}` He stays in the SAME SPOT for the whole clip and does not walk anywhere. |
| **walk** | `{CREATURE}` advances steadily forward toward the viewer , a full walk cycle. `{AXIS}` He stays roughly centred in frame the whole time. |
| **attack** | `{CREATURE}` delivers one single `{ATTACK_VERB}` - a full wind-up, the strike, and the recovery back to a ready stance, all within the clip. `{AXIS}` He stays in the SAME SPOT and does not travel. |
| **die** | `{CREATURE}` is struck a mortal blow. He staggers, collapses and FALLS ONTO THE GROUND. He is already fully down by the middle of the clip. For the entire second half he lies motionless on the ground, completely still, not moving at all. `{AXIS}` |

(The doubled spaces before `.` and `,` are verbatim from the shipped spec. They are harmless and are
kept so a diff against the reference is clean.)

### The per-state shape — a BUILDING

⚠ **THE UNIT-vs-BUILDING TRAP, and `ART_PIPELINE.md` says it costs a whole round:**

> **A UNIT** (creature) needs MOTION: `idle`, `walk`, `attack`, `die` — 12 frames each, 4 clips.
> **A BUILDING** (tower) needs DAMAGE STATES: `intact`, `damaged`, `destroyed` — plus, ideally, a
> `spawning` build-up.
> ⚠ *"These are not interchangeable, and confusing them wastes a whole round. A three-panel
> healthy / hurt / dead sheet is a BUILDING sheet."*

This trap fired again in S173: the owner generated healthy/hurt/dead sheets for **the direwolf and
for Voltkin, both of which are UNITS.** The right answer was one seed and four motion clips; the
hurt/dead stills were not states either creature can use.

⛔ **AND MOST BUILDING STATES SHOULD NOT BE veo CLIPS AT ALL.** A building has no gait, no swing and
no idle bob, so a clip spends the whole budget re-drawing a static subject and buys back two known
failures — seed drift over the length of a clip (S152: the bat rider went spindly), and the melting
stink tower. Use the packer's **`still`** knob: a state may name one PNG instead of a clip, it flows
through the same matte and the same union bbox, and it costs $0.00. The six race castles ship this
way.

**Generate a building clip only for a genuine CINEMATIC** — the spawn burst, the crumble. For those,
set **`staticSubject: true`** on the character so the hold-the-geometry block is appended, and accept
that it is *"a PROMPT, not a guarantee"* — look at the frames.

---

## 3 · ⛔ THE VERIFY GATE — BEFORE ANOTHER CENT

```bash
node scripts/check-clip.mjs assets-source/<family>/clips/<character>/ > /tmp/clipcheck.txt 2>&1
CLIPCHECK_EXIT=$?
echo "CLIPCHECK_EXIT=$CLIPCHECK_EXIT"
cat /tmp/clipcheck.txt
```

⛔ **READ `$?`, CAPTURED, ON ITS OWN LINE. Never through a pipe, and never trust a trailing
`[exited with code 0]` from the harness — that line is the wrapper's, not the gate's.** S159 shipped
past a `hard_fail=2` through a pipe; S165 read `1 failed / 61 passed` as a pass off exactly such a
trailing line. The project CLAUDE.md carries both.

**The verdicts, and what each one costs:**

| output | meaning | action | cost |
|---|---|---|---|
| `PASS  no side bars, subject clear of every edge — packable as-is` | clean | pack it | $0 |
| `PILLARBOXED … bars are present throughout` | **RECOVERABLE** | nothing — `content_column` crops one stable column | $0 |
| `BARS CHANGE MID-CLIP … RECOVERABLE — set "sampleStart": N` | **RECOVERABLE** | put `"sampleStart": N` on that state in the atlas spec | $0 |
| `⛔ SUBJECT TOUCHES THE FRAME EDGE … NOT RECOVERABLE` | the pixels were never generated | **re-roll that ONE state, framed smaller** | $0.50 |
| exit **3** | `ffmpeg` or `numpy`/`Pillow` missing | `pip install numpy scipy Pillow` — **a TOOLCHAIN gap, NOT a verdict on the art** | $0 |

⛔ **DO NOT REGENERATE UNTIL `check-clip` SAYS NOT RECOVERABLE.** A pillarboxed clip is not a bad
clip — it is a clip that needs one JSON field. Re-rolling it burns $0.50 to fix something the packer
already handles, and the replacement is just as likely to come back barred. **Bars are free.
Amputation is $0.50. Only the second one is a reason to pay.**

⚠ And a re-roll is **one state**, never the set: `node scripts/gen-character-clips.mjs <spec> --only
<character> --state attack`. Add `--skip-existing` to any re-run of a whole character so the clips
already on disk are never re-paid for.

⚠ **`check-clip.mjs` is a REPORT, never a deploy gate.** It reads `assets-source/`, which the shipped
build does not. An asset-quality opinion must never block a live deploy — S165 wired one into
`npm run build` and the site sat stale while the owner waited.

---

## 4 · THE CUT-OUT / PACK PATH

```bash
node scripts/build-atlas-set.mjs assets-source/<family>/atlas-specs.json [nameFilter…]
npm run check:atlas > /tmp/atlas.txt 2>&1; ATLAS_EXIT=$?; echo "ATLAS_EXIT=$ATLAS_EXIT"
```

`build-atlas-set.mjs` takes a `{ "specs": [ … ] }` file *or* a single-spec file, and shells each entry
to `build-sprite-atlas.mjs` sequentially. It does **not** swallow a failure — a non-zero exit names
the spec, and a partial art set that reported success is how a missing atlas reaches a deploy (where
it is **silent**: `loadAtlas` catches and the creature falls back to a green procedural puppet).

`npm run check:atlas` is the sprite-sheet pixel guard. It is deliberately **not** part of `npm run
build`; it runs as its own `atlas-guard` CI job. **Exit 3 = `pip install numpy scipy Pillow`, which
is a toolchain gap and not a verdict.** Exit 1 = a real defect (welded scenery, cross-row size drift,
opaque near-white pockets).

### The atlas-spec knobs — read out of `scripts/build-sprite-atlas.mjs`, S173

**Top level**

| key | default | what it does |
|---|---|---|
| `name` | required | sheet name; also the default out-dir leaf |
| `outDir` | `public/godly/<name>/anim` | where `<name>-atlas.png` + `<name>-anim.json` land |
| `cellW`, `cellH` | required | the cell the union bbox is fitted into. ⭐ **The only lever that makes a boss look like a boss** — the base sprite scale is one global. Bosses use 320, tier-3 units 200 |
| `framesPerState` | required | 12 in every shipped spec |
| `states` | required | one entry per row |
| `sampleStart` | `0` | skip N leading source frames (per-state override wins) |
| `sampleWindow` | rest of clip | sample only N frames from `sampleStart` |
| `enclosedWhiteLimitPct` | `0.003` | max area of an enclosed white pocket kept opaque. ⚠ **Set it explicitly; the default is 75× looser than the tuned `4e-05`, and taking it by omission is exactly the S165 defect the owner saw** (*"some of them have that white background because not cut out too well"*) |
| `normaliseStateScale` | `false` | equalise seed-frame subject SIZE across states. ⭐ **ON for characters** (veo zooms differently per clip); OFF for buildings, whose size legitimately changes |
| `normaliseStateWidth` | `false` | S173, opt-in. Non-uniform width match across `idle`/`walk`/`attack`. ⚠ **Distorts by construction** — an art trade, not a fix; on the scarab it made the spread *worse* (1.42× → 1.71×), which is how we learned that row is a POSE difference, not a zoom |
| `maxWidthStretch` | `1.35` | clamp on the above; a row that hits the cap is telling you to re-roll, not to re-scale |
| `fit` | `'height'` | height-fit keeps bodies comparable and widens the cell for a prop. Anything else box-fits, which shrinks a character by its bow |

**Per state**

| key | what it does |
|---|---|
| `clip` | path to the mp4 |
| `still` | a PNG instead of a clip — ⛔ mutually exclusive with `clip`, throws if both. The free path for buildings |
| `ticksPerFrame` | playback cadence. Shipped: idle 7, walk 4, attack 5, die 5 |
| `sampleStart`, `sampleWindow` | per-state overrides; this is where `check-clip`'s suggested number goes |

⚠ **12 FRAMES IS AN OPEN DIAL, NOT A DECISION.** The packer takes 12 per state, and the owner has
said that is not enough for good motion — `ART_PIPELINE.md` records the measurement behind it: *"the
arch demon looks ridiculous… too fast"* is frame sparsity, 12 frames × 5 ticks = exactly 60 ticks
against an attack cadence of exactly 60. **Bosses want more frames, not a slower cadence.** Raising
`framesPerState` costs sheet width and nothing in generation — the clip already holds ~90 frames and
we keep 12. **Not decided. Do not quietly change it; raise it with him.**

---

## 5 · COST

Measured rate, corroborated in-tree since S83 and again by S152's *"$3.50 of generation made
unrecoverable"* for seven clips: **veo-3.1, 4 s, 720p = $0.50 per clip.**

| job | clips | cost |
|---|---|---|
| one UNIT, all four states | 4 | **$2.00** |
| one BUILDING, stills only | 0 | **$0.00** |
| one BUILDING + spawn + crumble cinematics | 2 | $1.00 |
| one re-roll of a single amputated state | 1 | $0.50 |
| a six-race boss set (the S167 reference) | 24 | $12.00 |
| **S173's lesson** | 8 | **$4.00, of which ~$2.00 bought nothing** |

⚠ **Duration is the owner's cap: *"All we need is a few seconds, up to four."*** `durationSeconds: 4`
and `resolution: "720p"` are the shipped values and there is no reason to exceed them — the pipeline
discards everything past 12 frames anyway.

⚠ **Model.** Default `veo-3.1-generate-preview` (ALWAYS-STRONGEST). The three variants have separate
quota pools — measured S165, the full model answered 429 while `-fast` and `-lite` accepted the same
request on the same key in the same second. When the strongest tier is exhausted the choice is not
quality-vs-cost but *a lesser tier or no clip at all*, **and that is the owner's call with a
side-by-side in front of him, not a silent downgrade.** Override with `VEO_MODEL=…`; whatever ran is
printed at startup.

⭐ **An accepted operation is BILLED whether or not the process survives to download it.** The
generator writes each op name to `<out>.op.json` the instant veo returns it, and a later run resumes
from it. **If a run dies, do not re-submit — re-run the same command and let it collect.** The first
version of that script threw on a queue error and orphaned seven paid generations.

---

## 6 · THE WHOLE PROCEDURE, END TO END

```bash
# 0. ⛔ READ THE REFERENCE FIRST. Ninety seconds. This is the step that cost $2.
cat assets-source/race-tier9-bosses/clip-spec.json
cat .claude/veo-recipes.json

# 1. Prepare ONE seed for the character (recipe A). Snippet in §1.
python prep-seed.py <approved-still>.png assets-source/<family>/<name>-seed.png

# 2. Write assets-source/<family>/clip-spec.json — copy the tier-9 shape, swap {CREATURE}/{AXIS}.

# 3. Generate. $0.50 per state.
node scripts/gen-character-clips.mjs assets-source/<family>/clip-spec.json --skip-existing

# 4. ⛔ VERIFY BEFORE SPENDING ANOTHER CENT.
node scripts/check-clip.mjs assets-source/<family>/clips/<name>/ > /tmp/cc.txt 2>&1
CC=$?; echo "CHECKCLIP_EXIT=$CC"; cat /tmp/cc.txt
#    NOT RECOVERABLE -> re-roll that ONE state only:
#      node scripts/gen-character-clips.mjs <spec> --only <name> --state attack
#    sampleStart suggested -> write it into the atlas spec. Do NOT pay.

# 5. Pack.
node scripts/build-atlas-set.mjs assets-source/<family>/atlas-specs.json <name>
npm run check:atlas > /tmp/at.txt 2>&1; AT=$?; echo "ATLAS_EXIT=$AT"; cat /tmp/at.txt

# 6. Wire the renderer. ⚠ A Partial<> art table means a MISSING ENTRY IS SILENT — the unit falls
#    through to the green procedural puppet. And a race-keyed atlas must be reachable from
#    EAGER_ATLAS_TYPES or preloadRaceKit or it is never fetched. See ART_PIPELINE.md.
```

⛔ **NO FAILED COMMAND IS PASSED OVER.** A non-zero exit is a FINDING until it is either investigated
and resolved, or explicitly ruled benign **with the reason written down**. The recurring benign ones
here: `check-clip` exit 3 and `check:atlas` exit 3 are both toolchain gaps (`pip install numpy scipy
Pillow`), not verdicts on the art; a veo `429` is backpressure the generator retries, not a failure.
Each of those is a one-line verdict — and writing the line is what proves the check happened.
