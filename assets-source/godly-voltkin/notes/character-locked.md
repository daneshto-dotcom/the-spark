# Voltkin — Character Lock (FINAL)

**Phase:** 1 — locked, do not revisit
**Date:** 2026-05-13
**Variant chosen:** #3 Static Gremlin (refined)
**Selection method:** Gemini-2.5-Pro brainstorm → Grok-4.20-reasoning adversarial scoring → highest combined hype + readability score with acceptable IP risk.

**Combined scores (IP-risk / hype / readability, lower-better / higher-better / higher-better):**

| Variant | IP risk | Hype | Readability | Combined verdict |
|---|---|---|---|---|
| 1. Gourd Gadget | 2 | 4 | 6 | "Retro lamp" — no hype |
| 2. Battery Blob | 1 | 2 | 9 | Safest but boring — 14yo glazes over |
| **3. Static Gremlin** | **4** | **9** | **8** | **WINNER — survives both tests** |
| 4. Capacitor Critter | 1 | 5 | 5 | Legally ironclad, but +/- labels invisible at sprite size |
| 5. Plasma Pet | 6 | 8 | 3 | Translucent body too close to Pikachu palette |

---

## The locked character (prompt-ready spec)

### Silhouette
- **Body:** Roughly **square / boxy chunky blob** — wider than tall, like a stout little fridge with limbs. NOT round, NOT pear-shaped, NOT mouse-shaped.
- **Proportions:** Body ≈ 60% of height. Head fused directly onto body (no neck). Limbs stubby (~15% of body height).
- **Pose stance:** Slight forward lean, mischievous gremlin energy.

### Head + face
- **Face:** Wide, taking up ~60% of head. Big anime eyes (round, white sclera, dark blue iris, white highlights).
- **Mouth:** Wide toothy grin — visible teeth (chunky cartoon teeth, NOT sharp fangs). Mouth corners pull up; this is a chaos-energy smile, not a cute Pikachu smile.
- **Ears:** Small **round nubs** on the sides of the head — basically just bumps, NOT triangular, NOT pointed.

### Distinctive feature — "Lightning Crown"
- Five short, thick, angular **yellow spikes** arranged across the top of the head like a small crown.
- Spike tips have small **blue spark arcs** crackling between them (idle state) — animated sparks at strength of charge.
- Spikes are clearly **geometric** (faceted, like crystal shards or origami), NOT soft fur tufts.
- This is the character's silhouette signature — readable from 64px.

### Limbs + extremities
- **Arms:** Stubby, ~10% of body height. Three-finger paws (no individual fingernails — just rounded paw mitts).
- **Legs:** Stubby, ~12% of body height. Two-toe feet (chunky bricks more than feet).
- **Tail:** Thick stubby **club tail** — short, rounded, club-shaped. Approx 20% of body height. NOT zigzag, NOT lightning-bolt-shaped.

### Color palette (LOCKED)
- **Primary body:** Electric saturated yellow `#FFD60A`
- **Belly + lower face:** Lighter yellow `#FFEB6B` (cel-shaded transition)
- **Outlines:** Pure black `#000000`, thick (4-6px equivalent at 512px sprite)
- **Spike crown:** Yellow `#FFD60A` with bright cyan-blue spark tips `#0AC4FF`
- **Eyes:** White sclera `#FFFFFF`, dark blue iris `#0A4FAA`, single white highlight
- **Accents (optional, for charge/zap poses):** Bright orange `#FF8C0A` for high-energy electric arcs
- **❌ NEVER USE:** any red (`#FF0000` family), brown stripes, pink

### Style (LOCKED)
- **Rendering:** 2-3 tone flat cel shading (base + one shadow + optional highlight). No gradients.
- **Outlines:** Thick black, slightly variable weight for hand-drawn-cartoon feel, ZERO anti-aliasing on outline edges. Crisp pixel boundaries.
- **Background:** Transparent PNG, alpha channel.
- **Reference aesthetic:** 1990s Saturday-morning anime — Pokémon Origins anime palette but with chunkier Digimon-style silhouette. Think early Bandai / Toei Animation rubber-hose cartoon energy.

---

## Anti-Pikachu checklist (re-verified)

| Anti-feature | Status |
|---|---|
| Pointy mouse ears | ❌ Round nubs only |
| Yellow body with brown back stripes | ❌ No stripes, no brown |
| Red cheek circles | ❌ No cheek patches at all |
| Zigzag lightning-bolt tail | ❌ Club tail |
| Slim mouse silhouette | ❌ Boxy chunky gremlin |
| Black ear tips | ❌ No pointy ears to tip |
| Red in palette | ❌ Yellow + blue + orange only |
| Couldn't-be-mistaken-for-Pikachu test | ✅ Square gremlin with spike crown reads as "Digimon-adjacent," not Pokémon |

---

## Pose-by-pose addenda

Each of the 6 sprite poses inherits this silhouette + palette. Only POSE varies:

- **idle-1:** Relaxed stance, eyes neutral wide-open, grin neutral, arms hang at sides, slight forward lean.
- **idle-2:** Body compressed slightly (mid-bounce), legs slightly bent, eyes same.
- **charge:** Crouched LOW, arms pulled FORWARD/up, body coiled, eyes squinted with intensity (still visible whites), sparks/arcs visible around hands and crown, mouth in a determined grimace (showing teeth but not full grin).
- **zap-attack:** Body fully extended forward (lunging), arms thrown wide, mouth WIDE OPEN in a roar (showing tongue + teeth), massive electric bolts radiating from body, crown sparks at maximum.
- **victory:** Stood tall, arms thrown up in V, eyes squinted-closed in cocky satisfaction, big closed-mouth smug grin, tiny sparkle particles around crown.
- **hurt:** Body recoiled backward, eyes WIDE in surprise (extra white showing), mouth open in shock O-shape, small swirl/dizzy lines beside head (cartoon "stunned" convention).

---

## Imagen prompt template (used in Phase 2)

```
A chunky boxy square-bodied cartoon creature called Voltkin, 1990s Saturday-morning
anime style. {POSE_DESCRIPTION}. Wider than tall, stubby limbs, three-finger paws,
two-toe feet, club-shaped stubby tail. Wide toothy grin {OR_POSE_MOUTH}, big round
expressive anime eyes with white highlights, small round nub ears, NOT pointy.
Crown of five short angular yellow spikes on head with small blue spark arcs.
Primary color saturated electric yellow #FFD60A, lighter yellow belly, bright blue
spark accents. NO red anywhere. Thick black outlines, flat cel-shaded coloring,
no anti-aliasing, no gradients. Transparent background. Sprite art, single character
centered. Style: chunky Digimon-adjacent gremlin, NOT a mouse, NOT Pikachu.
```

Each pose substitutes `{POSE_DESCRIPTION}` and `{OR_POSE_MOUTH}` from the pose-by-pose addenda above.

---

## Final commitment

This lock is **non-negotiable** for Phase 2-5. If a generated sprite drifts from this spec, regenerate — do not adjust the lock to fit a generation. The lock is the contract.
