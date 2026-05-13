# Voltkin Cinematic — Decision Rationale

**Phase:** 4
**Date:** 2026-05-13
**Decision:** **Option A — Veo MP4 video** (single 4-second clip with native audio)
**Cost:** $0.35 (Veo 3.1 fast-generate-preview, 720p 4s)

---

## Why Option A (video) over Option B (frame-sheet)

| Factor | Option A (Veo MP4) | Option B (frame-sheet) |
|---|---|---|
| Hype delivery | ✅ Real motion blur, light, particles, native audio | ⚠️ Limited to 12fps choppy stylized |
| Character consistency | ✅ Preserved (image-to-video seed of `tv-glowing.png`) | ⚠️ Manual frame-by-frame Imagen rolls — drift risk |
| Cost | $0.35 (well under $20 escalation threshold) | ~$1.20 for 30 frames |
| File size | 1.17 MB after CRF 26 re-encode | ~500 KB sprite sheet |
| Audio | ✅ Native AAC stereo bundled (electric crackle, glass shatter, etc.) | ❌ Audio must be sourced separately |
| Integration | Single `<video>` or PixiJS video texture | PixiJS animated sprite sheet at 12fps |
| Risk | ⚠️ One-shot generation — quality is what Veo gave us | Lower risk, more control |

**Decisive factor:** Veo's first attempt delivered all three beats (TV glowing → screen shattering with electric burst → Voltkin character emerging) in a SINGLE 4-second clip that visually matches the locked sprite design (chunky boxy body, yellow palette, crystal spike crown, anti-Pikachu compliant). The image-to-video seeding worked — `tv-glowing.png` anchored frame 0 and Veo extrapolated the climactic sequence on-spec.

---

## What the cinematic shows (verified via frame extraction)

Frame extracts archived at:
- `notes/iterations/veo-cinematic-frame-start.png` (0.1s) — CRT glowing, Voltkin silhouette inside, cyan lightning arcs
- `notes/iterations/veo-cinematic-frame-mid.png` (2.0s) — TV screen EXPLODING outward, glass shards flying, yellow energy burst
- `notes/iterations/veo-cinematic-frame-end.png` (3.5s) — Voltkin emerged, chunky boxy yellow body with crystal crown intact, arms wide, broken TV frame behind

---

## Encoding pipeline

1. **Raw Veo output:** 720p, h264, 4s, 4.8 Mbps, 2.41 MB (over budget when bundled with sprites)
2. **Re-encoded:** libx264 CRF 26 preset slow, AAC 96 kbps audio → 1.17 MB (51% reduction, visual quality preserved)
3. **Audio extracted separately:** see `audio/cinematic-audio.ogg` (35 KB, full 4s) and time-sliced SFX (`tv-static.ogg`, `glass-shatter.ogg`, `lightning-crackle.ogg`)

---

## Anti-Pikachu compliance check on cinematic

Voltkin as rendered by Veo:
- [✓] Chunky boxy body (NOT mouse silhouette)
- [✓] Crystal spike crown on head (NOT pointy mouse ears)
- [✓] Solid yellow body (NOT yellow with brown back stripes)
- [✓] No red anywhere
- [✓] No red cheek patches
- [✓] No zigzag tail visible in any frame

Cinematic ships. No regeneration needed.

---

## Fallback note

If main session integrates and decides video doesn't fit (e.g., autoplay restrictions, mobile codec quirks), Option B fallback is straightforward: extract 24 frames at 6fps from `voltkin-intro.mp4` via `ffmpeg -i voltkin-intro.mp4 -vf fps=6 frame_%02d.png` and build a sprite sheet manually. The frame-extract command is documented in `integration-notes.md`.
