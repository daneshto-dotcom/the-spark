# Voltkin Asset Pack — Integration Notes for Main Session

**From:** Asset-gen side session
**To:** Main session (`src/` integration)
**Date:** 2026-05-13
**Status:** READY — all 9 sprites + 1 cinematic + 5 audio files locked.

---

## Asset map

| Asset | Path | Size | Format |
|---|---|---|---|
| Voltkin idle-1 | `sprites/voltkin-idle-1.png` | 266 KB | PNG/RGBA 512×512 |
| Voltkin idle-2 | `sprites/voltkin-idle-2.png` | 193 KB | PNG/RGBA 512×512 |
| Voltkin charge | `sprites/voltkin-charge.png` | 288 KB | PNG/RGBA 512×512 |
| Voltkin zap-attack | `sprites/voltkin-zap.png` | 371 KB | PNG/RGBA 512×512 |
| Voltkin victory | `sprites/voltkin-victory.png` | 177 KB | PNG/RGBA 512×512 |
| Voltkin hurt | `sprites/voltkin-hurt.png` | 207 KB | PNG/RGBA 512×512 |
| TV off | `sprites/tv-off.png` | 264 KB | PNG/RGBA 512×512 |
| TV static | `sprites/tv-static.png` | 397 KB | PNG/RGBA 512×512 |
| TV glowing | `sprites/tv-glowing.png` | 305 KB | PNG/RGBA 512×512 |
| Cinematic | `cinematic/voltkin-intro.mp4` | 1167 KB | H.264 + AAC, 4s, 16:9 720p |
| Voice clip | `audio/voltkin-voice.ogg` | 8 KB | OGG Opus, mono, ~1s |
| Cinematic bundled audio | `audio/cinematic-audio.ogg` | 35 KB | OGG Vorbis, mono, 4s |
| TV static SFX | `audio/tv-static.ogg` | 8 KB | OGG Vorbis, ~0.5s |
| Glass shatter SFX | `audio/glass-shatter.ogg` | 7 KB | OGG Vorbis, ~0.4s |
| Lightning crackle SFX | `audio/lightning-crackle.ogg` | 18 KB | OGG Vorbis, ~1.8s |

**Total pack: 3.62 MB / 4.00 MB budget.**

---

## Recommended cinematic integration flow

The cinematic is the centerpiece. Recommended sequencing for the godly-combo trigger:

```
[t=0]   Game state freezes. Geometric world fades to dark behind black overlay.
[t=0.5] Play voltkin-intro.mp4 (4s with native audio) full-bleed center.
[t=4.5] Video ends. Hold final frame for 0.5s (Voltkin pose).
[t=5.0] Crossfade to voltkin-zap.png on top of enemy structure.
[t=5.2] Play voltkin-voice.ogg ("VOLT! KIIIN!") over the zap.
[t=5.5] Trigger enemy-structure destruction VFX. Resume game state.
```

Alternative: play `voltkin-intro.mp4` with `muted=true` and overlay your own SFX timing using the time-sliced clips (`tv-static.ogg` at 0-0.5s, `lightning-crackle.ogg` at 1.0-2.8s, `glass-shatter.ogg` at 1.5-1.9s, `voltkin-voice.ogg` at 3.5s).

---

## PixiJS-specific notes

- All sprites have **transparent alpha channel** — drop directly into `PIXI.Sprite.from()`.
- Sprite consistency: all 6 Voltkin poses share the same silhouette + palette + outline weight, so they animate cleanly as a 6-frame sequence.
- idle-1 ↔ idle-2 are the alternating idle frames — animate at **2 fps** for a chill bounce.
- Charge → zap-attack is the godly-combo attack sequence — recommend **8-12 fps** with motion blur.
- Cinematic MP4: PixiJS can render via `PIXI.Texture.from(video element)` or you can use a raw `<video>` overlay positioned absolute over the canvas.

---

## Audio integration notes

- `voltkin-voice.ogg` was generated via Google Chirp3-HD-**Puck** voice — energetic male, picked over Fenrir (deeper) and Kore (female bright) for best "mascot shout" character. Alternates archived in `notes/iterations/voltkin-voice-{fenrir,kore}-alt.ogg` — swap if Puck feels wrong in playtest.
- The brief specified light reverb + distortion ("voice-coming-out-of-TV"). TTS does NOT apply effects. Recommend the Web Audio API `ConvolverNode` + slight `WaveShaperNode` distortion at runtime, OR pre-process via Audacity. Reverb impulse: any small-room IR will do — 0.2-0.3s decay.
- The 3 SFX files (`tv-static`, `glass-shatter`, `lightning-crackle`) were extracted from Veo's native audio track at approximate beat-times — they are **time-sliced from the same source** as `cinematic-audio.ogg`. If you play the full `voltkin-intro.mp4` with audio, you'll hear them in context already and don't need to layer the separate SFX clips.
- If you mute the MP4 and orchestrate SFX manually, the time slices give you precise control.

---

## Character integrity

The **locked Voltkin design** is documented in detail at `notes/character-locked.md`. If any future asset generation extends Voltkin (new poses, alternate skins, evolution forms), it MUST conform to that spec:

- Chunky boxy body — wider than tall, no neck, square head
- Solid uniform saturated electric yellow (#FFD60A) with lighter belly only — NO stripes, NO markings
- Crown of 5 faceted yellow crystal spikes with cyan-blue spark arcs
- Small round bump ears (NOT pointy)
- Wide toothy grin, big anime eyes with white highlights
- Three-finger paws, two-toe feet, club tail
- NO red, NO cheek patches, NO pointy mouse ears

---

## Trademark caveat

Per `notes/trademark-check.md`: name "Voltkin" is clear for indie scope. **If the game ships commercially**, recommend a manual USPTO TESS lookup before launch — the side session could not query TESS directly (JS-rendered). Pre-cleared fallback names (Joltkin, Sparkit, Boltzy, Zappup, Voltbug) are listed there; the character design is name-agnostic so a swap is one find/replace.

---

## What's missing / TODOs for main session

- [ ] Pre-cinematic transition (geometric world fragmenting into shards) — main session can generate via PixiJS particle system on game canvas, no asset needed
- [ ] Post-cinematic enemy-structure destruction VFX — game-side effect, no asset
- [ ] Reverb/distortion on `voltkin-voice.ogg` — apply at runtime or pre-process
- [ ] (Optional) Further compress sprites with pngquant or convert to WebP if shipping to mobile and you need extra savings — current PNGs are unoptimized PNG-32

---

## Frame extraction reference (if frame-sheet fallback ever needed)

```bash
# Extract 24 frames at 6fps from the cinematic
ffmpeg -i cinematic/voltkin-intro.mp4 -vf fps=6 frame_%02d.png

# Or 36 frames at 9fps for smoother motion
ffmpeg -i cinematic/voltkin-intro.mp4 -vf fps=9 frame_%02d.png

# Build sprite sheet (4 wide x 6 tall for 24 frames):
ffmpeg -i frame_%02d.png -filter_complex "tile=4x6" sheet.png
```

---

## Anti-Pikachu re-verification (final)

All 9 sprites + cinematic frames pass the `DESIGN_BRIEF.md` §3 anti-checklist:
- [✓] No pointy mouse ears (round nubs only)
- [✓] No yellow body with brown stripes (solid yellow + lighter belly)
- [✓] No red cheek patches
- [✓] No zigzag lightning-bolt tail (club tail)
- [✓] No slim mouse silhouette (chunky boxy)
- [✓] No red in palette anywhere

Ship it.
