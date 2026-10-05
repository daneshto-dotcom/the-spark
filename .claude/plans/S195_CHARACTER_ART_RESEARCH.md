# S195 — CHARACTER ART RESEARCH (owner item N20)

Research only. No game code changed, nothing installed, nothing spent. Branch `s195/char-research`.

**The owner's question:** *"will Blender or any other … thing … help us create like a really good looking
graphical characters or heroes for our game? … Voltkin … if we do them in Blender, would that work? …
Move better, look … better graphics, better 3D motion … because it's in 2D, but some of them move kind
of in 3D. But not really."* Widened mid-task: *"also maybe stuff like Three.js, PixiJS, Blender assets,
WebGL shaders, Rive/Lottie or even better ones … up to the most advanced things we can do."*

---

## 0. THE ANSWER IN ONE PARAGRAPH

**Yes — Blender helps, but as a sprite factory, not as a runtime.** The highest payoff per euro and per
millisecond for SPARK is: model + rig a character once in 3D, render every animation from the game's own
camera into frames, and feed those frames to the atlas packer we already have. The game stays 2D, the
player's PC does no extra work, and the "kind of 3D but not really" motion becomes *real* 3D motion,
because it IS a 3D body moving — just photographed. This is exactly how Motion Twin made Dead Cells with
one artist ([Game Anim, 2018](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/)).
On top of that, cheap Pixi-side shader polish (outline, hit-flash, seat-colour swap, optional normal-map
lighting on HIGH tier) adds the "premium" look. Running real 3D in the browser (three.js) is possible
and officially supported alongside Pixi 8, but it costs bundle, frame time and weak-PC risk for little
visible gain at the size our units are drawn (~100–130 px tall).

⚠ **Where this conflicts with earlier rulings, stated plainly:**
- **S108 — "meshy/3D off the table for Voltkin/Helga, better 2D instead."** Option 1 below *is* better 2D
  at runtime — the player never sees a 3D model — but it uses 3D as a *production* tool. That is a
  different thing from what was ruled out (3D in the game / meshy as the art), and it needs his yes.
- **S96 — "no PowerPoint spin" (procedural sprite transforms rejected; wants real motion).** Options 1, 2
  and 5 all give real motion. Pure 2D skeletal (Spine) *without* mesh deformation can drift back towards
  "paper cut-out puppet" — the same failure in a nicer coat. Flagged where it applies.
- **Originality.** Every route that uses an AI 3D generator or stock rig still has to produce an ORIGINAL
  character. The owner's own still (Grok, his preferred generator) stays the seed in every route.

---

## 1. WHAT THE GAME DOES TODAY (measured in this tree, not from a handoff)

| Fact | Where |
|---|---|
| Characters are sprite atlases: 12 frames per state row, packed by `scripts/build-sprite-atlas.mjs` from veo clips | `ART_PIPELINE.md` |
| Units face **left/right only** — the sprite is mirrored with `scale.x = ±1` off the estimated velocity | `src/render/creatureRenderer.ts:442, :522` |
| Walk is "side-on, moving in place" — the prompt asks for it | `ART_PIPELINE.md` § action clauses |
| Race units atlas: 2400×800 (200 px cells × 12, 4 states) ≈ 1.3–1.7 MB PNG each | `public/art/race-units/` |
| Voltkin atlas: 3072×1536 (256 px cells, 6 rows) 352 KB | `public/art/voltkin-tv/` |
| Voltkin on screen ≈ 256 × `VOLTKIN_ATLAS_BASE_SCALE` 0.479 ≈ **123 px** tall | `creatureRenderer.ts:161` |
| `public/art` total 86 MB; art never enters the bundle | `du -sh public/art` |
| Bundle charter **1350 KiB** entry | `scripts/check-bundle-size.mjs:19` |
| `pixi.js ^8.19.0`, `pixi-filters 6.1.5` already shipped | `package.json:37-38` |
| Graphics tiers HIGH / LOW / MINIMAL (S195 lag work), render-only | `src/render/displayPrefs.ts:91` |
| Atlas guard catches veo painting grey scenery behind the character | `scripts/check-atlas-scenery.mjs` |
| veo clips ≈ $20 each (owner-measured); 4 clips per unit ≈ $80 | memory `spark-veo-clip-real-cost` |
| **Blender is NOT installed on this machine** — `where blender` finds nothing; no `C:\Program Files\Blender Foundation`; not in Steam `common` | checked S195 |

**Why "some of them move kind of in 3D, but not really":** veo is asked to animate a flat drawing. It
invents the depth each clip, a little differently each time, and the packer keeps 12 of ~90 frames. The
result reads as 3D-ish but wobbles: proportions shift between states, limbs smear, the body "breathes" in
ways no skeleton would. Twelve frames is also sparse for big characters (the arch-demon "too fast" note
in `ART_PIPELINE.md`). Any route that starts from a *real skeleton* fixes all three.

---

## 2. THE OPTIONS

Each option: what it is · what it looks like in SPARK · the owner's actual workflow · tools + cost ·
time per character · file size / runtime perf · risk · fit with the atlas pipeline + guard.

### OPTION 1 — Blender → pre-rendered 2D sprites (THE RECOMMENDATION)

**What it is.** Build (or import) a 3D model, rig it once, animate idle/walk/attack/die (+ any boss
skill), render each animation from a fixed camera that matches SPARK's view, and write PNG frames with a
transparent background. Those frames go straight into the existing packer. Dead Cells did exactly this,
exporting each frame *plus a normal map* to drive a toon shader in-game
([Game Anim](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/);
[80.lv interview](https://80.lv/articles/interview-with-the-developers-of-dead-cells)).

**What it looks like in SPARK.** Same 123 px Voltkin on the board, same mirroring, same atlas — but every
frame is the *same* body seen from the *same* angle, limbs move on real joints, and an attack can have
24 or 36 frames instead of 12 at zero extra cost. With a cel shader + outline it matches the current
"bold cel-shaded, thick dark outline" look the veo prompt demands:
- Toon look: Diffuse → **Shader to RGB** → constant ColorRamp is Blender's documented NPR route
  ([Shader To RGB](https://docs.blender.org/manual/en/latest/render/shader_nodes/color/shader_to_rgb.html));
  or the **Toon BSDF** ([manual](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/toon.html)).
- Ink outlines: Grease Pencil **Line Art** modifier generates lines from the camera's view
  ([manual](https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/line_art.html)) —
  or the cheaper inverted-hull outline.
- Transparent background is a render setting, so **the matte step, the pillarbox problem
  (`check-clip.mjs`) and the grey-scenery problem (atlas guard) all disappear** for these characters.
  The guard still runs and should score zero — a useful sanity check, not a burden.

**Directions.** Today the game needs ONE view (side or ¾-side), mirrored. That is the pilot. A later
upgrade is 3 views (¾-front, side, ¾-back) mirrored = 5 effective directions, picked from velocity
angle — that is the step that makes them stop "moon-walking" when they go up/down the screen. It costs
render time only (the rig and animations are shared), plus a renderer change and atlas rows.

**Owner workflow.**
1. Generates the character still in Grok, as today (front + side turnaround if possible).
2. Gets a 3D body: either an AI image-to-3D pass (Option 4) and a clean-up, or a hired modeller, or a
   free rigged base from **Mixamo** (free with an Adobe ID; characters + animations royalty-free inside a
   game, may not be redistributed as raw assets — [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)).
3. Auto-rig + stock animations (Mixamo, or Tripo's rig/retarget — Option 4).
4. **Agent's part:** a Python `bpy` script, run headless — `blender -b voltkin.blend -P render_sprites.py`
   ([command-line args](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html))
   — sets camera/lights/toon material, renders every action at N frames, writes PNG strips into
   `assets-source/<character>/frames/`, then the existing packer runs. Re-render on any tweak is free.

**Tools + cost.** Blender is free, GPL, and *your renders are yours* to use commercially
([blender.org/about/license](https://www.blender.org/about/license/)). Mixamo free. AI 3D: Meshy Pro
$20/mo or Tripo Pro ~$20/mo (Option 4). Optional: a freelance modeller/rigger for a hero character.
**Per character marginal cost ≈ $0–20** vs ≈ $80 for four veo clips — and *every further animation is
free*, where veo charges ~$20 per new clip.

**Time.** First character (pipeline build: camera match, toon shader, render script, packer hook-up):
1–2 sessions of agent work + the owner's modelling/clean-up time, which is the unknown (§5). After that:
a few hours per character, most of it the 3D body. Rendering ~200 frames at 256–512 px in Eevee is
minutes on a desktop GPU (not measured here — Blender is not installed).

**Runtime perf.** **Identical to today.** It is still one sprite per unit. No bundle bytes. Atlas size
grows only if we add frames/directions (e.g. 24 frames × 4 states × 256 px ≈ 6144×1024 — over the 4096
safe texture size, so split rows across two sheets or drop to 200 px cells).

**Risk.** (a) The look: a cheap 3D model rendered toon can look "plasticky 3D-ish", not hand-drawn —
mitigated by Line Art + flat ramps + matching the owner's still; *only a spike shows it*.
(b) The body: AI-generated meshes need clean-up before they rig well. (c) Blender must be installed — an
owner action (per the install gate, an agent may not install it).

**Fit with pipeline.** Perfect: it is a new **Stage 3** that replaces the veo call. Stages 1, 2, 5, the
packer, the lazy-atlas rules and the guard are unchanged.

### OPTION 2 — 2D skeletal animation (Spine, DragonBones, Live2D)

**What it is.** The character is cut into parts (arm, forearm, head…), bones drive them, and with
**mesh deformation** the parts bend like flesh instead of rotating like cardboard. It animates at runtime,
so it is silky at any frame rate, and blending (walk→attack) is free.

- **Spine** — the industry standard. Official **`@esotericsoftware/spine-pixi-v8`** (4.3.x), built
  jointly with the PixiJS team; needs Pixi ≥ 8.16 (we have 8.19); renders via WebGL, WebGPU or Canvas
  ([spine-pixi docs](https://en.esotericsoftware.com/spine-pixi);
  [release blog](https://esotericsoftware.com/blog/spine-pixi-v8-runtime-released)). Spine 4.2 added
  **physics constraints** (hair, capes, tails, cables that swing on their own)
  ([blog](https://esotericsoftware.com/blog/Spine-4.2-The-physics-revolution)) and weighted meshes
  ([meshes](http://en.esotericsoftware.com/spine-meshes), [weights](http://esotericsoftware.com/spine-weights)).
  **Cost:** Essential $69 — **no meshes**, which is the feature that matters; Professional **$379**;
  Enterprise required above $500k revenue ([purchase](https://esotericsoftware.com/spine-purchase)).
- **DragonBones** — free editor, but the official project is effectively unmaintained; Pixi 8 support
  only via community runtimes (`pixi-dragonbones-runtime` 8.0.x for Pixi 7–8,
  [GitHub](https://github.com/h1ve2/pixi-dragonbones-runtime)). Not recommended for a long-lived game.
- **Live2D** — gorgeous for *front-facing* portraits (VTubers, visual novels), free SDK for small
  businesses under ¥10M revenue ([license](https://www.live2d.com/en/sdk/license/)). Wrong tool for a
  side-walking 120 px unit; could be right for a **hero portrait / victory screen**.

**In SPARK.** Best at the "alive" quality: breathing, cloth sway, physics tails — Voltkin's cables would
swing. **But someone must paint the parts and animate in Spine.** That is an animator's skill and
hours per action; an agent cannot drive the Spine editor. Without mesh work it looks like a puppet —
the S96 failure in better clothes.

**Perf / bundle.** Runtime is JS added to the bundle (order ~100–200 KB min; **not measured** — needs a
build spike), plus per-frame skinning on the CPU for every unit on screen. Fine for 1–2 heroes; risky for
40 goblins on a weak PC — it adds exactly the kind of per-unit work S195's MINIMAL tier removes. Can be
*baked*: Spine exports PNG sequences, which go into our packer like Option 1 — keeps runtime cost zero.

**Fit.** Either runtime (new renderer path, new loader, bundle cost) or baked (fits packer as-is).

### OPTION 3 — Runtime 3D characters inside the 2D Pixi game

- **three.js + Pixi 8 sharing one WebGL context is officially documented**: create three's renderer
  first, hand its context to Pixi with `clearBeforeRender: false`, and call `resetState()` between them
  ([PixiJS guide](https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi)).
- **pixi3d** — no official Pixi 8 release; an unofficial *alpha* fork (`smithy-org/pixi3d-v8`, Pixi ≥ 8.20)
  says itself it is not production-used ([GitHub](https://github.com/smithy-org/pixi3d-v8)). Not shippable.
- **Bundle:** three.module.js ≈ 155 KB gzip / ~658 KB parsed before tree-shaking
  (three.js forum measurements, e.g. [bloated js file](https://discourse.threejs.org/t/bloated-js-file/16176), [tree-shaking state](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168));
  + GLTFLoader. Against our 1350 KiB charter that is a large slice — lazy-loadable, but still a
  download every player pays on first match.
- **Frame cost:** skinned meshes, one draw call+ per unit, depth sorting against Pixi layers, two
  renderers' state resets per frame. With 30–60 units on screen this is the opposite direction from the
  S195 lag work, and WebGL on weak/integrated GPUs is where it hurts. The visual win at 123 px is small:
  the eye cannot tell a live skinned mesh from a well-rendered 24-frame sprite at that size.
- **Where it WOULD pay:** a camera that rotates/zooms in close, a hero showcase screen, or a lobby
  character viewer. Not the board.

**Verdict:** possible, supported, not worth it for units on the board today.

### OPTION 4 — AI image-to-3D generators (Meshy, Tripo, Hunyuan3D) → Blender → Option 1

- **Meshy**: Free 100 credits/mo (output CC BY 4.0); Pro $20/mo 1,000 credits; a full Meshy-6
  generation ≈ 30 credits; paid plans give commercial ownership ([pricing](https://www.meshy.ai/pricing)).
- **Tripo**: Pro ≈ $20/mo; **auto-rig 25 credits, animation retarget 10 credits each**, biped and
  quadruped, Mixamo-compatible; free-tier output is CC BY / no commercial use
  ([developer pricing](https://developers.tripo3d.ai/en/pricing);
  [rig docs](https://developers.tripo3d.ai/en/models/rig)).
- **Hunyuan3D** — ⛔ its licence **excludes the EU, UK and South Korea** from the licensed territory
  ([LICENSE](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE)). If the owner or
  the business is in the EU/UK, it is unlicensed there. Do not use.

**Reality check.** These turn ONE good still into a textured mesh in minutes. Typical output is a
dense, triangulated mesh with baked lighting in the texture and imperfect hands/thin parts; it rigs
well enough for a 123 px toon render (where topology flaws are invisible) but would not survive close-up
3D. **Originality:** the mesh inherits the still, so the still must be original — the rule that already
applies. This is the cheapest way to get a body for Option 1; it is not an alternative to it.

### OPTION 5 — Improve the current veo → atlas route (the cheap baseline)

- Generate a proper **turnaround sheet** first (Grok: front / ¾ / side / back of the same character),
  and seed every clip from the *same* side view — cuts the state-to-state drift.
- Ask for **more usable frames**: the packer keeps 12 by default; big characters/bosses should keep 24
  (already flagged in `ART_PIPELINE.md`). Costs no extra clips — the frames are already in the mp4.
- Keep the two bolded prompt sentences (no bars, stay in frame) — they are what saves re-rolls.

**Cost:** same ≈ $20/clip. **Limit:** it can never give a consistent multi-direction set or exact
joint motion; the model reinvents the body every clip. Good for one-offs and VFX; the ceiling is where
the owner's complaint lives.

### OPTION 6 — PixiJS-native polish and shaders (stacks on ANY option above)

All of these are runtime effects on the existing sprite; no new art route required.

| Effect | How, in Pixi 8 | Cost |
|---|---|---|
| **Outline / glow / hit-flash / seat-colour swap** | `pixi-filters` 6.x (already in the repo, Pixi 8-compatible): `OutlineFilter`, `GlowFilter`, `MultiColorReplaceFilter`, `ColorMatrixFilter` ([pixijs/filters](https://github.com/pixijs/filters)) | 0 bundle (installed). ⚠ A filter per sprite = an extra render pass per sprite; on 40 units that is real cost → HIGH tier only, or bake the outline into the art |
| **Squash, bend, cloth, cables** | `MeshPlane` (vertex grid), `MeshRope` (texture along a path), `PerspectiveMesh` (fake 3D tilt) — all core Pixi 8 ([Mesh guide](https://pixijs.com/8.x/guides/components/scene-objects/mesh); [MeshRope](https://pixijs.download/dev/docs/scene.MeshRope.html); [PerspectiveMesh](https://pixijs.download/v8.10.1/docs/scene.PerspectiveMesh.html)) | 0 bundle. ⚠ procedural motion = the S96 "PowerPoint" risk; use for secondary motion (a swinging cable), never as the walk |
| **Dissolve / death burn** | a small custom `Filter` with a noise texture | tiny |
| **Normal-mapped sprites + dynamic light** (lightning flashes actually light the units) | Blender renders a normal-map frame for every colour frame for free (Dead Cells did); Pixi side needs a light pass. `pixi-lights`/`@pixi/lights` is **Pixi 6 only** ([pixijs-userland/lights](https://github.com/pixijs-userland/lights)); a Pixi 8 community lib exists (`pixijs-light2d`, single maintainer, [GitHub](https://github.com/haiyoucuv/pixijs-light2d)) — or write our own ~100-line shader | doubles atlas memory; one extra pass → HIGH tier only |
| **Sprite stacking (Nium-style pseudo-3D)** | many horizontal slices drawn offset so objects rotate in "3D" ([explainer](https://observablehq.com/@sethpipho/sprite-stacking-3d)) | great for rotating *buildings/vehicles*, wrong for organic characters (voxel look) |

### OPTION 7 — Vector state-machine animation (Rive, Lottie)

- **Rive**: excellent for UI and interactive vector characters. Web runtime `@rive-app/webgl2` ships
  ≈ 925 KB gzip WASM + ≈ 450 KB JS; `canvas-lite` is smaller but drops features
  ([choose a renderer](https://help.rive.app/runtimes/renderer); [web runtime](https://rive.app/docs/runtimes/web/web-js)).
  It renders into its **own** canvas — no first-class Pixi 8 integration; you would copy to a texture.
  Editor free; **exporting** needs a paid plan (Cadet, from ~$9/mo annual) — runtimes MIT, no runtime fee
  ([pricing](https://rive.app/docs/account-admin/pricing)).
- **Lottie**: `lottie-web` ≈ 60–75 KB gzip (SVG/canvas, CPU-heavy); `dotlottie-web` fetches a ~500 KB
  WASM ([dotlottie-web](https://github.com/lottiefiles/dotlottie-web)); `lottie-pixi` targets Pixi 5
  ([npm](https://www.npmjs.com/package/lottie-pixi)).

**Verdict:** both are flat vector looks — the opposite of "more 3D". Right for menus, buttons, the
victory banner, card flips; wrong for units. Not recommended for characters.

### OPTION 8 — Gaussian splats, glTF engines (Babylon.js, PlayCanvas)

- **Gaussian splats** (Spark by World Labs, MIT, three.js, WebGL2 — [sparkjs.dev](https://sparkjs.dev/))
  are for *captured* photoreal scenes/objects; animating a splat character is research-grade. Not for us.
- **Babylon.js / PlayCanvas** are full 3D engines. Using one means Option 9 (a 3D game), not a
  character upgrade. Larger than three.js; no reason to pick them inside a Pixi game.

### OPTION 9 — A full 3D version of the game (short, honest)

It would mean a new renderer for **everything** (board, connectors, structures, effects, UI layering,
fog), a new camera, every asset re-made in 3D, and a perf floor that excludes the weak PCs the S195 tiers
were built for. The **sim would not change** (host-authoritative, deterministic, renderer-agnostic) —
that is the one thing that makes it thinkable. Realistically months, and it competes with every gameplay
priority. ⭐ The cheap hedge is Option 1: if the characters live as rigged 3D models in Blender, the
same models are 80% of what a future 3D version needs. Nothing is wasted either way.

---

## 3. RANKING — visual payoff ÷ (cost + weak-PC perf risk)

| # | Route | Payoff | $ / time | Weak-PC risk | Score |
|---|---|---|---|---|---|
| 1 | **Blender pre-rendered sprites (+ AI-3D or Mixamo body)** | High: consistent, real 3D motion, any frame count, clean alpha, multi-direction later | ~$0–20 per char + owner modelling time; 1–2 sessions to build the pipeline | **None** (still one sprite) | ⭐⭐⭐⭐⭐ |
| 2 | Pixi shader polish (outline, hit-flash, seat swap, dissolve) | Medium: "premium" feel on all units | $0, in-repo libs | Low if HIGH-tier gated | ⭐⭐⭐⭐ |
| 3 | Better veo (turnaround seed, 24 frames for bosses) | Low–medium | same ~$20/clip | None | ⭐⭐⭐ |
| 4 | Normal maps from Blender + Pixi lighting | Medium–high (lightning lights units) | needs #1 first + a shader | Medium → HIGH tier only | ⭐⭐⭐ |
| 5 | Spine Pro with meshes + physics (baked to atlas, or runtime for 1–2 heroes) | High on heroes | $379 + an animator's hours; agent can't drive the editor | Baked: none; runtime: medium | ⭐⭐ |
| 6 | Runtime three.js heroes on the 2D board | Small at 123 px | bundle ~155 KB gz + engineering | **High** | ⭐ |
| 7 | Rive / Lottie for units | Wrong look | export plan + ~0.5–1.4 MB runtime | Medium | ⭐ (UI only) |
| 8 | Splats / Babylon / PlayCanvas / full 3D game | — | months | High | ✗ for now |

### What a top studio would do for a 2D top-down browser game in 2026

3D-modelled, rigged characters → rendered offline to sprite sheets in several directions → **colour +
normal map** per frame → in-engine 2D lighting and a cel/outline pass on the high tier, plain sprites on
the low tier. That is Dead Cells' pipeline generalised, and it keeps the runtime a 2D sprite game.

**Staged path from today to there:**
1. **Stage A (pilot):** Voltkin via Blender, one side view, mirrored, 24 frames/state, toon + Line Art,
   into the existing packer. Ship behind nothing — it is just a new atlas.
2. **Stage B:** same script for 2–3 more heroes/bosses; add the ¾-front/¾-back views + a direction pick
   in the renderer (render-only, no protocol bump).
3. **Stage C:** emit normal-map atlases from the same render; HIGH-tier lighting pass (lightning hub /
   explosions light nearby units). LOW/MINIMAL ignore the normal atlas.
4. **Stage D (optional):** reuse the same models for a 3D hero viewer/lobby (three.js lazy-loaded on that
   screen only) — the first and cheapest real-time 3D, with zero board risk.

---

## 4. RECOMMENDED PILOT — Voltkin, one character, Blender → atlas

**Why Voltkin:** it is the owner's own example, it is a hero (most screen time), it already has a
6-row atlas and renderer contract (`voltkinFrames.ts`, `VOLTKIN_ATLAS_BASE_SCALE`) to slot into, and its
cables/TV body are exactly the parts veo smears and a rig handles well.

| Step | Who | What | Cost |
|---|---|---|---|
| 0 | **Owner** | Say yes to using 3D as a *production* tool (the S108 nuance). Install Blender (free, blender.org — an agent may not install it) | $0 |
| 1 | Owner | Generate a clean Voltkin turnaround in Grok (front / side / back, plain background), ORIGINAL | ~$0 |
| 2 | Owner (or agent with his account) | Image-to-3D in **Tripo** (Pro ~$20, 1 month): mesh + auto-rig + retarget idle/walk/attack/die. Fallback: Meshy Pro $20 + Mixamo rig (free) | ~$20 |
| 3 | Agent | `bpy` scene script: orthographic camera matching SPARK's angle, toon material (Shader-to-RGB ramp), Line Art outline, transparent film, 256 px | 1 session |
| 4 | Agent | Headless render `blender -b voltkin.blend -P render_sprites.py` → 24 frames × each of the 6 existing Voltkin rows → `assets-source/godly-voltkin/frames/` | minutes |
| 5 | Agent | Run packer + `check-atlas-scenery`, side-by-side comparison PNG vs the current atlas on the black board, **show the owner before wiring** (memory: spike art + show owner first) | — |
| 6 | Owner | Thumbs up/down on the look. Down = we stop having spent ~$20 instead of ~$80+ of veo | — |
| 7 | Agent | Wire the atlas (frame count change in `voltkinFrames`), tests, gates | ½ session |

**Total spend: ≈ $20** (one Tripo or Meshy month) + Blender (free). Versus ≈ $80–120 for a veo re-do of
the same character that would still have the drift.

---

## 5. WHAT IS NOT KNOWN WITHOUT A HANDS-ON SPIKE

1. **The look** — whether a toon-rendered AI mesh reads as "great 2D art" or "cheap 3D" at 123 px. This is
   THE question, and only a rendered frame answers it.
2. **AI mesh quality for Voltkin specifically** (thin cables, TV-screen face) and how much clean-up the
   rig needs. Tripo/Meshy output quality varies per input.
3. **Render time / VRAM** on this machine — Blender is not installed, nothing was measured.
4. **The exact camera angle** that matches the existing art (needs trial renders against a screenshot).
5. **Spine / three.js bundle bytes** for this build — figures above are generic; a `npm run build` spike
   on a throwaway branch would give the real KiB against the 1350 charter.
6. **Normal-map lighting cost** on a weak PC under the S195 throttle benchmark (53 ms wave-5 baseline).
7. **How many hours the owner wants to spend in Blender himself** vs paying a freelancer for hero models.

---

## SOURCES

- Dead Cells 3D→2D pipeline: https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/ · https://80.lv/articles/interview-with-the-developers-of-dead-cells
- Blender licence: https://www.blender.org/about/license/
- Blender CLI: https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html
- Blender NPR: https://docs.blender.org/manual/en/latest/render/shader_nodes/color/shader_to_rgb.html · https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/toon.html · https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/line_art.html
- Mixamo: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Spine: https://en.esotericsoftware.com/spine-pixi · https://esotericsoftware.com/blog/spine-pixi-v8-runtime-released · https://esotericsoftware.com/spine-purchase · https://esotericsoftware.com/blog/Spine-4.2-The-physics-revolution · http://en.esotericsoftware.com/spine-meshes
- DragonBones Pixi runtime: https://github.com/h1ve2/pixi-dragonbones-runtime
- Live2D licence: https://www.live2d.com/en/sdk/license/
- three.js + Pixi 8: https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi
- three.js size: https://discourse.threejs.org/t/bloated-js-file/16176 · https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168
- pixi3d v8 fork: https://github.com/smithy-org/pixi3d-v8
- Pixi meshes: https://pixijs.com/8.x/guides/components/scene-objects/mesh · https://pixijs.download/dev/docs/scene.MeshRope.html · https://pixijs.download/v8.10.1/docs/scene.PerspectiveMesh.html
- pixi-filters: https://github.com/pixijs/filters
- Pixi lights: https://github.com/pixijs-userland/lights · https://github.com/haiyoucuv/pixijs-light2d
- Meshy: https://www.meshy.ai/pricing
- Tripo: https://developers.tripo3d.ai/en/pricing · https://developers.tripo3d.ai/en/models/rig
- Hunyuan3D licence: https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE
- Rive: https://help.rive.app/runtimes/renderer · https://rive.app/docs/runtimes/web/web-js · https://rive.app/docs/account-admin/pricing
- Lottie: https://github.com/lottiefiles/dotlottie-web · https://www.npmjs.com/package/lottie-pixi
- Spark splats: https://sparkjs.dev/
- Sprite stacking: https://observablehq.com/@sethpipho/sprite-stacking-3d
