---
name: veo-generate
description: "SPARK — turn ONE approved still into four clean veo clips and an atlas, without paying for a clip twice. Walks the operator through: read the known-good spec, prepare a 16:9 seed, write the clip-spec, generate, run check-clip.mjs, report the cost, and only then pack. Use when: '/veo-generate', 'generate clips for <character>', 'animate this character', 'make the stances', 'turn this image into idle/walk/attack/die', 'veo clips', 'new hero art', 'new tower art', or any request that would spend money on video generation in this repo. Takes a character name and a seed image path."
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, TodoWrite]
---

# `/veo-generate` — the SPARK video-generation protocol

**Usage:** `/veo-generate <character-name> <path/to/approved-still.png> [--kind unit|building]`

Full runbook: **`ART_VEO_PROTOCOL.md`** (repo root). Machine-readable recipe:
**`.claude/veo-recipes.json`**. Parent doc for the whole art pipeline: **`ART_PIPELINE.md`**.

> The owner, S173, after a session generated 8 clips at $0.50 each without reading the spec that
> produced the art he already likes — 4 of the 8 came back unusable:
> *"From now on it's a protocol… **STOP WASTING MY MONEY.** Be coherent about this, be methodical,
> be technical."*

⛔ **EVERY STEP BELOW COSTS $0.00 EXCEPT STEP 4. Do not reach step 4 with a step skipped.**

---

## STEP 0 — ⛔ READ THE KNOWN-GOOD SPEC. NINETY SECONDS. NON-NEGOTIABLE.

```bash
cat .claude/veo-recipes.json
cat assets-source/race-tier9-bosses/clip-spec.json
```

**This is the step whose absence cost the money.** You are copying the prompt SHAPE: a creature
clause, a motion clause, a movement-character clause, a stay-put clause — and nothing else. No
camera, no framing, no style block: `scripts/gen-character-clips.mjs` appends all of that from its
`SHARED` constant, and each clause in it was paid for by a specific failed clip.

Report to the operator, in one line, which reference you read and which recipe you are using.

## STEP 1 — DECIDE UNIT OR BUILDING, AND SAY IT OUT LOUD

| kind | needs | clips | cost |
|---|---|---|---|
| **UNIT** (creature) | MOTION — `idle`, `walk`, `attack`, `die` | 4 | **$2.00** |
| **BUILDING** (tower) | DAMAGE STATES — `intact`, `damaged`, `destroyed` (+`spawning`) | **0** — use the packer's `still` knob | **$0.00** |

⚠ **A three-panel healthy / hurt / dead sheet is a BUILDING sheet.** If the operator hands one in for
a creature, say so before generating: what a unit needs is ONE seed (the healthy pose) and four
motion clips. The dead pose is a reference for where `die` comes to rest, not a state.

⛔ **A BUILDING'S NORMAL STATES ARE NOT CLIPS.** A building has no gait; a clip spends the budget
re-drawing a static subject and buys back seed drift and the melting stink tower. Generate a clip
only for a genuine cinematic (spawn burst, crumble), and set `staticSubject: true` for it.

## STEP 2 — PREPARE ONE SEED (recipe A, 1920×1080, subject 52% of height)

One seed for the character, **not one per state** — it is the only yardstick the four independent
generations share. Use the tested snippet in `ART_VEO_PROTOCOL.md` §1; write it to the scratchpad,
run it, and **print the measured output line**.

```
<seed>.png  1920x1080  subject NNNxNNN = NN%W x 52%H
```

⛔ Flatten to RGB on white. Never hand veo an RGBA cut-out.
⚠ Why 16:9: `gen-character-clips.mjs` sends `aspectRatio: '16:9'` unconditionally. A portrait seed
gets pillarboxed to ~635 of 1280 usable pixels, and that is what amputated four clips in S173.

## STEP 3 — WRITE THE CLIP-SPEC

`assets-source/<family>/clip-spec.json`, copying the tier-9 structure:

```json
{ "durationSeconds": 4, "resolution": "720p",
  "characters": [ { "name": "<character>", "seed": "<seed path>",
      "outDir": "assets-source/<family>/clips/<character>",
      "states": { "idle": {"prompt": "..."}, "walk": {...}, "attack": {...}, "die": {...} } } ] }
```

Fill the four templates from `.claude/veo-recipes.json → promptFormula.unitStates`, substituting
`{CREATURE}` (one clause, repeated in every state), `{AXIS}` (one movement-character sentence,
verbatim in all four) and `{ATTACK_VERB}`.

⛔ **THE ATTACK VERB CANNOT BE ABLE TO ACQUIRE A PROP. A wolf BITES.** Hand verbs make the generator
hand the creature a weapon it does not own — three re-rolls on the castle vampire.
⛔ **`die` must be DOWN by the halfway point and END STILL, ON THE GROUND, IN FRAME.**

**Show the four prompts to the operator and get a go before step 4.** This is the last free moment.

## STEP 4 — 💸 GENERATE — the only step that costs money

```bash
node scripts/gen-character-clips.mjs assets-source/<family>/clip-spec.json --only <character> --skip-existing
GEN_EXIT=$?; echo "GEN_EXIT=$GEN_EXIT"
```

State the spend before firing: **4 states × $0.50 = $2.00.**

⭐ `--skip-existing` so a clip already on disk is never re-paid for. If the run dies, **re-run the
same command** — the op name is on disk in `<out>.op.json` and the run resumes. Never re-submit: an
accepted operation is billed whether or not the process survived to download it.
⚠ A `429` is backpressure the script retries, not a failure.

## STEP 5 — ⛔ VERIFY BEFORE ANOTHER CENT

```bash
node scripts/check-clip.mjs assets-source/<family>/clips/<character>/ > /tmp/cc.txt 2>&1
CHECKCLIP_EXIT=$?; echo "CHECKCLIP_EXIT=$CHECKCLIP_EXIT"; cat /tmp/cc.txt
```

⛔ **Read the CAPTURED `$?`. Never through a pipe; a trailing `[exited with code 0]` is the
harness's line, not the gate's.**

| verdict | action | cost |
|---|---|---|
| `PASS … packable as-is` | pack | $0 |
| `PILLARBOXED … present throughout` | nothing — the packer crops it | $0 |
| `BARS CHANGE MID-CLIP … set "sampleStart": N` | write `N` into the atlas spec | $0 |
| `⛔ SUBJECT TOUCHES THE FRAME EDGE … NOT RECOVERABLE` | re-roll **that one state**, framed smaller | $0.50 |
| exit `3` | `pip install numpy scipy Pillow` — toolchain gap, **not a verdict** | $0 |

⛔ **DO NOT REGENERATE UNTIL check-clip SAYS NOT RECOVERABLE.** Bars are free. Amputation is $0.50.
A re-roll is `--only <character> --state <state>`, never the whole set.

## STEP 6 — REPORT THE COST, IN THIS SHAPE

```
[veo-generate] <character>: N clips generated, $X.XX.
  check-clip: P pass / R recoverable / A NOT RECOVERABLE  (CHECKCLIP_EXIT=E)
  re-rolls needed: <state list or none>  -> $Y.YY
  running total this session: $Z.ZZ
```

## STEP 7 — PACK (only once step 5 is clean or explicitly accepted)

⛔ **A `still` STATE IS NOT A CUT-OUT — IT IS RGB ON 254-WHITE.** The matte keys out near-WHITE. A
transparent PNG stores its see-through pixels as RGB `0,0,0`, which reads as SUBJECT, so the art
packs inside a solid black box. Flatten first (`ART_VEO_PROTOCOL.md` §4.1a). Mixing clips and stills
in one spec is fine — the packer pads them to one canvas — but a still `die` needs
`stillHeightRatio`, measured off the source art, or the corpse is inflated to standing height.

```bash
node scripts/build-atlas-set.mjs assets-source/<family>/atlas-specs.json <character>
npm run check:atlas > /tmp/at.txt 2>&1; ATLAS_EXIT=$?; echo "ATLAS_EXIT=$ATLAS_EXIT"; cat /tmp/at.txt
```

Atlas-spec starting point for a character: `cellW`/`cellH` (200 units, 320 bosses),
`framesPerState: 12`, `ticksPerFrame` idle 7 / walk 4 / attack 5 / die 5,
**`enclosedWhiteLimitPct: 4e-05` set explicitly** (the default is 75× looser and taking it by
omission is the S165 white-fringe defect), **`normaliseStateScale: true`** for a character.
Full knob list: `.claude/veo-recipes.json → packPath.atlasSpecKnobs`.

## STEP 7b — ⭐⭐ AUDITION THE SHEET ON THE **DARK** BOARD COLOUR. DO NOT SKIP THIS.

```python
out = Image.new('RGBA', (w, h), (11, 13, 20, 255))   # the board, NOT white
out.alpha_composite(atlas.crop(cell))
```

**A white preview cannot show a white halo.** S175 shipped three separate packer defects into a
contact sheet — mixed canvas sizes, an un-normalised still, and a corpse cut from a dark sheet the
matte could not lift — and **every one passed `tsc`, the full 4,400-test suite AND `check:atlas`**.
All three were caught by opening the PNG. Highest-yield step in the pipeline; costs thirty seconds.

If the sheet shows a pale rim, that is the **FRINGE**: set `edgeFringeStripPx`, sweeping the
smallest depth that clears `EDGE_WHITE_MAX = 60`. ⛔ Do **not** reach for more `binary_erosion` — it
removes boundary pixels regardless of colour and eats spears, antennae and horn tips. The fringe
strip removes only PALE boundary pixels, so a spike stays a spike.

⚠ Wiring the renderer is a separate job and a **`Partial<>` art table means a missing entry is
SILENT** — the unit falls through to the green procedural puppet. A race-keyed atlas must also be
reachable from `EAGER_ATLAS_TYPES` or `preloadRaceKit` or it is never fetched. See `ART_PIPELINE.md`.

---

## ⛔ THE STANDING RULES OF THIS SKILL

- **No failed command is passed over.** A non-zero exit is a FINDING until investigated and resolved,
  or ruled benign **with the reason stated**. The recurring benign ones: `check-clip`/`check:atlas`
  exit 3 is a missing `numpy scipy Pillow`; a veo `429` is retried backpressure.
- **Never let an asset-quality opinion block a live deploy.** `check-clip` reads `assets-source/`,
  which the shipped build does not. S165 wired one into `npm run build` and the site sat stale.
- **12 frames per state is an OPEN DIAL, not a decision** — the owner has said 12 is not enough for
  good motion, and raising it costs sheet width and no generation money. Raise it with him; do not
  change it quietly.
- **When a measurement in `.claude/veo-recipes.json` turns out wrong, amend the file in the same
  session.** A recipe file that drifts from the tree is how this protocol stops earning its keep.
- ⛔ **A RECORDED VERDICT IS EVIDENCE ABOUT A FILE AT A MOMENT, NOT A PROPERTY OF THE FILE.** Before
  acting on a verdict written in any document, re-run `check-clip` and compare `stat -c %Y` on the
  clip against the table's date. S173's own table condemned `direwolf/walk`; it had been re-rolled
  hours later and measures a clean PASS — trusting the doc would have paid ~$3.10 to replace a
  working file. `voltkin/walk` was also condemned and is recoverable at $0. **Two of the four
  condemnations were wrong.**
- ⚠ **A clean WINDOW that excludes the ACTION is not a recovery.** `voltkin/attack` and
  `voltkin/die` both hold technically-clean runs containing no strike and no collapse. Those are
  genuine re-rolls — say so, rather than packing a row with no motion in it.
- ⛔ **THE RATE IS ~$3.10 PER CLIP, OWNER-MEASURED** — not the $0.50 this protocol claimed for six
  sessions. *"You said it was only four and a half dollars, but it was, like, twenty."* Quote the
  real number in STEP 6, and re-confirm it whenever he mentions a figure.
- ⚠ **WRITE THROUGH A TEMP FILE.** S175 truncated this very file to 0 bytes by opening it for
  write and then throwing mid-encode. Build the whole string first, write a `.tmp`, `os.replace`.
