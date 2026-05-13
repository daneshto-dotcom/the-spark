# VOLTKIN — Design Brief

**Status:** LOCKED design constraints. Anything below marked "MUST" is non-negotiable.

---

## 1. Concept

**Voltkin** is a chunky, electric, cartoon mascot creature inspired by the 1990s Pokemon Origins anime aesthetic. In the SPARK godly combo system, Voltkin is the first godly — a reality-distorting cinematic super-attack where Voltkin emerges from an old CRT television and obliterates an enemy structure with a lightning zap.

The game's native aesthetic is **clean geometric vector emergence** (sparks, lines, triangles, circles bond into structures). Voltkin's job is to **rupture that aesthetic** — a colorful, hand-drawn-cartoon-style creature jumping out of a retro television set into a clean abstract geometric world is the entire hype-axis. The contrast IS the point.

---

## 2. Inspiration references (style only, NOT copy)

- **1990s Pokemon TV anime** — cel-shaded flat colors, thick black outlines, no anti-aliasing
- **Saturday morning cartoons** — exaggerated proportions, big expressive eyes, simple poses
- **Retro consumer electronics** — wood-grain CRT TV bezels, beige/brown plastic, antenna stubs
- **Limited animation style** — chunky simple in-betweens, hold-frames, snap-poses

---

## 3. IP-SAFE CHARACTER CONSTRAINTS (MUST follow)

Voltkin **MUST NOT** have any of these Pikachu-derived features:

| ❌ NEVER | ✅ INSTEAD |
|---|---|
| Pointy mouse-like ears | Stubby round ears OR antenna stubs OR no ears at all |
| Yellow body with brown stripes on back | Solid yellow OR yellow + blue accents OR yellow + black geometric pattern |
| Red circular cheek patches | NO cheek patches — or blue/orange star/diamond accents elsewhere |
| Zigzag lightning-bolt tail | Stubby round tail OR no tail OR a small geometric appendage (cube, sphere, antenna) |
| Slim mouse silhouette | CHUNKY blob silhouette — wider than tall, stubby limbs |
| Black ear-tips | No black ear-tips (because no pointy ears) |

Voltkin **SHOULD** have:

- **Body shape:** chunky, blobby, roughly potato-shaped or apple-shaped (NOT mouse-shaped)
- **Color palette:** primary YELLOW (#FFD60A or similar saturated electric yellow), accent BLUE (#0AC4FF) or ORANGE (#FF8C0A), NEVER red
- **Outlines:** thick black (4-6px equivalent at sprite resolution), inconsistent line weight allowed for cartoon feel
- **Eyes:** large, round, expressive — anime-style with white highlight
- **Distinctive feature (pick one):** a small antenna with a glowing sphere at the tip, OR a geometric crown of yellow spikes (like a stylized lightning crown), OR a horizontal stripe of glowing circles on the belly
- **Limbs:** stubby — short arms with three-finger paw, short legs with two-toe foot. NOT human-proportioned.

---

## 4. Style spec (MUST follow)

- **Rendering:** flat cel-shaded — 2-3 tones per color region max (base + shadow + highlight)
- **Outline weight:** thick black, consistent within a sprite but feel free to vary across body parts for cartoon energy
- **No anti-aliasing on outline edges** — crisp pixel-level transitions (this evokes 90s broadcast aesthetic)
- **Background:** transparent PNG (alpha channel) — sprites composite onto game canvas
- **Resolution:** Voltkin sprites should be ~256-512px tall (large enough for cinematic close-up, downsampled if needed at runtime)
- **Sprite consistency:** all poses use the SAME silhouette/palette/outline weight — they're frames of one character

---

## 5. Animation poses required

For each pose, generate a full-character sprite, transparent background:

| Pose | Description | Use case |
|---|---|---|
| **idle-1** | Standing, relaxed, eyes neutral, slight bounce-ready stance | Default frame |
| **idle-2** | Standing, mid-bounce, body slightly compressed | Idle anim frame 2 (alternates with idle-1 at 2fps) |
| **charge** | Crouched, arms forward, sparks gathering around body, eyes squinted with intensity | "Powering up" before zap |
| **zap-attack** | Mouth open in roar, body extended forward, electricity bursting outward from body | The attack moment |
| **victory** | Arms raised, eyes closed in smug satisfaction, sparkle effects around head | Post-zap celebration |
| **hurt** | Body recoiling, eyes wide in surprise, small bruise marks (if it gets countered) | Counter-reaction (later use) |

---

## 6. TV Bezel assets

Generate three frames of an old CRT television, transparent background:

| Frame | Description |
|---|---|
| **tv-off** | Wooden-bezeled CRT, dark glass screen, antenna stubs visible. Beige/brown chassis. NO logo (avoid "Sony" / "Panasonic" etc.). |
| **tv-static** | Same TV, screen filled with grayscale static/snow texture |
| **tv-glowing** | Same TV, screen filled with vibrant yellow glow + faint Voltkin silhouette inside |

---

## 7. Cinematic concept (Veo prompt direction)

**Story beats (2-3 seconds total):**
1. (0-0.5s) The clean geometric SPARK world fragments/shatters/fades to dark
2. (0.5-1.0s) An old CRT television flies in from screen edge, lands center
3. (1.0-1.5s) TV powers on with static, then screen brightens to electric yellow
4. (1.5-2.0s) Voltkin LEAPS out of the screen (3D-like motion, breaking the TV frame), screen shatters as it exits
5. (2.0-2.5s) Voltkin lands in foreground, full screen-clearing electric flash
6. (2.5-3.0s) Cut to: Voltkin facing camera, charging for the zap

**Veo prompt seed (refine before submitting):**
> Short 2.5-second 1990s anime cinematic. A clean minimalist world of geometric vector shapes (circles, triangles, lines) shatters into shards that fly off-screen. An old wood-paneled retro CRT television with antenna stubs flies in and lands center frame. The screen turns on with static, brightens to electric yellow glow. A chunky cartoon yellow electric creature with a stubby round body and big anime eyes leaps OUT OF the television, breaking the screen as it exits, glass shards flying. The creature lands in the foreground, electricity crackling around its body. Flash to white. Style: cel-shaded 90s anime, thick black outlines, no anti-aliasing, vibrant flat colors. NO copyrighted characters.

**If Veo output quality is poor or file exceeds 3MB, fall back to frame-sheet animation** (24-36 frames at 12fps generated as a sprite sheet — main session animates in PixiJS).

---

## 8. Audio

**Voice clip — "VOLT-KIIIN!":**
- TTS source: any high-energy youth/young-adult voice (NOT a deep adult voice)
- Pitch: high — shift up if needed
- Duration: 1.2-1.8s
- Effects: light reverb + slight distortion to feel "voice-coming-out-of-TV"
- Output: OGG Vorbis, mono, 32-48kbps

**SFX (each ≤50KB OGG):**
- `lightning-crackle.ogg` — 1-2s of electric crackle, layered/looped (use freesound-style libraries or Veo audio if it generates SFX)
- `tv-static.ogg` — 0.5s of TV static white noise
- `glass-shatter.ogg` — 0.3s of glass breaking (when Voltkin exits TV)

---

## 9. Naming / trademark check (DO BEFORE Phase 2)

Before generating any final assets, confirm the name "Voltkin" is free:
1. Web search for "Voltkin" + "trademark"
2. USPTO TESS search (https://tmsearch.uspto.gov/) for "VOLTKIN"
3. Steam / Google Play / App Store search for any game called "Voltkin"
4. Document findings in `notes/trademark-check.md`

If the name is taken: propose 3 alternative names that fit the same vibe (e.g., "Joltkin", "Sparkit", "Boltzy", "Zappup") and pick one. Document the substitution.

---

## 10. Versioning + iteration

- All generated outputs go to disk immediately, even drafts
- If you iterate on a sprite, save older versions to `notes/iterations/voltkin-idle-v1.png` etc. so we can see the design progression
- Don't delete failed generations — they document the design process
- Final shipping assets are the ones referenced in `ASSET_MANIFEST.md`

---

## 11. Anti-checklist (run before each commit)

For every sprite you generate, ask:
- [ ] Does this have ANY pointy mouse ears? (If yes → reject)
- [ ] Does this have red cheek patches? (If yes → reject)
- [ ] Does this have a zigzag lightning-bolt tail? (If yes → reject)
- [ ] Could this be mistaken at a glance for Pikachu by a casual observer? (If yes → reject)
- [ ] Does the silhouette read as "chunky blob" rather than "mouse"? (If no → reject)
- [ ] Does the palette include red? (If yes → reject)

If any check fails, regenerate with a more constrained prompt.
