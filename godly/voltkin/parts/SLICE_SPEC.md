# Voltkin Body-Part Slice Specification

**Source:** the canonical Voltkin PNG (the locked design — yellow furry monster with crystal mohawk, arms outstretched, electricity arcs).

**Goal:** Slice the canonical into 8 transparent-background PNGs so the rig system can position each part independently for walk cycle, breathing, mouth animation, head tracking, and attack articulation (MapleStory-mob pattern).

**Tool:** GIMP (free) or Photoshop. Process: duplicate layer per part → erase / mask everything except that part → export PNG with alpha.

## Part List

Save all parts to this directory (`public/godly/voltkin/parts/`) with **exact** filenames below. Pivot is the point that should align to the parent bone's attachment (the spot the part rotates around).

| # | Filename | What to include | Pivot point | Notes |
|---|---|---|---|---|
| 1 | `head.png` | Head + face + eyes + ears (NO mohawk, NO mouth) | base-of-neck (bottom-center of head) | Mouth handled as separate part for talk animation |
| 2 | `mouth-closed.png` | The mouth region in CLOSED pose (small fang line) | center of mouth opening | Used during SEEKING |
| 3 | `mouth-open.png` | The mouth region in OPEN roaring pose (tongue + fangs visible) | center of mouth opening | Used during ATTACKING wind-up + fire-tick |
| 4 | `mohawk.png` | Crystal mohawk only (the upright crystal shards) | base of crystals (bottom-center) | Will sway via damped sine on head rotation rate |
| 5 | `torso.png` | Torso + belly + (optionally) crystal-arms-base — basically the body minus head + minus 4 limbs | hip-midpoint (bottom-center of torso) | Root of the rig hierarchy. Breathing scales this 1.0 ↔ 1.03 at 2 Hz. |
| 6 | `arm-l.png` | Left arm (the character's left, viewer's right) — shoulder to fingertip, including hand | shoulder-attachment (the spot where it connects to torso) | Will rotate at shoulder for walk swing + attack wind-up |
| 7 | `arm-r.png` | Right arm (the character's right, viewer's left) | shoulder-attachment | Mirror of arm-l |
| 8 | `leg-l.png` | Left leg — hip to foot | hip-attachment | Walk cycle keyframe rotation |
| 9 | `leg-r.png` | Right leg | hip-attachment | Mirror, 180° offset from leg-l |

Optionally:

| 10 | `electricity-overlay.png` | The electricity-arc decoration around the body, isolated | center of body | Optional. If included, rendered ON TOP of all body parts with additive blend. |

## Image Specs

- **Format:** PNG with alpha channel (transparent background)
- **Color depth:** 32-bit RGBA
- **Dimensions:** **keep the original pixel dimensions of the canonical** for each part — DON'T resize. The rig will scale via Pixi at render time. If the canonical is 1024×1024, each part PNG is also 1024×1024 (with only that part visible, rest transparent). This makes pivot-alignment trivial because all parts share the same coordinate space.
- **Edge quality:** anti-aliased edges with 2-3 px feathered alpha at part boundaries (avoids visible seams when parts overlap at joints)
- **Naming:** **exact** filenames as above (case-sensitive on Linux/CI)

## Pivot points — important

For each part, mentally mark the pivot point (the spot it rotates around when articulated). When the slice is done, write the pivot coordinates as `pivot-spec.json` (I'll provide a template, OR you can eyeball it and I'll fine-tune from the canonical reference). Example:

```json
{
  "head":      { "pivot": { "x": 512, "y": 700 } },
  "mouth-closed": { "pivot": { "x": 512, "y": 580 } },
  "torso":     { "pivot": { "x": 512, "y": 850 } },
  "arm-l":     { "pivot": { "x": 380, "y": 600 } },
  "arm-r":     { "pivot": { "x": 644, "y": 600 } },
  "leg-l":     { "pivot": { "x": 460, "y": 850 } },
  "leg-r":     { "pivot": { "x": 564, "y": 850 } },
  "mohawk":    { "pivot": { "x": 512, "y": 380 } }
}
```

(coordinates assume 1024×1024 canonical — adjust to actual dims)

## When done

Drop the PNGs in this directory and message: "**parts ready**". I'll wire them into the rig system (godlyAnimator.ts + voltkin pose data + integrate with creatureRenderer), tune the walk cycle + attack animation against the MapleStory-mob target, then run the Alive Gate side-by-side test.

## Why this approach (vs Imagen-generated parts)

Tried Imagen text-only generation as the A.0 probe (cost ~$0.02). Result: produced a recognizably *similar* but visibly *different* voltkin (different fur texture, face proportions, crystal arrangement) — same style-drift problem as your 6 prior iterations. Imagen reference-image conditioning (which would solve this) is non-functional in our auth setup per the gcp-vertex MCP's own tool description. Manual slice from the canonical YOU locked is the only reliable path to preserving the design.

Estimated wall-clock for slice work: 45-60 min for a solo dev who knows GIMP/PS basics.
