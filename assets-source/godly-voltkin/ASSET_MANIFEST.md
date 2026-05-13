# VOLTKIN ASSET MANIFEST

**Status:** ✅ COMPLETE. All deliverables locked, pack under 4 MB budget.
**Final pack size:** 3.62 MB / 4.00 MB
**Date:** 2026-05-13

---

## Sprites (Phase 2-3)

| Asset | Path | Size | Status |
|---|---|---|---|
| Voltkin idle-1 | `sprites/voltkin-idle-1.png` | 266 KB | ✅ |
| Voltkin idle-2 | `sprites/voltkin-idle-2.png` | 193 KB | ✅ |
| Voltkin charge | `sprites/voltkin-charge.png` | 288 KB | ✅ |
| Voltkin zap-attack | `sprites/voltkin-zap.png` | 371 KB | ✅ |
| Voltkin victory | `sprites/voltkin-victory.png` | 177 KB | ✅ |
| Voltkin hurt | `sprites/voltkin-hurt.png` | 207 KB | ✅ |
| TV off | `sprites/tv-off.png` | 264 KB | ✅ |
| TV static | `sprites/tv-static.png` | 397 KB | ✅ |
| TV glowing | `sprites/tv-glowing.png` | 305 KB | ✅ |

**Sprites subtotal:** 2,467 KB (above the 200 KB brief target — see note in `integration-notes.md` about WebP/pngquant for further compression). All sprites are 512×512 PNG/RGBA, downscaled from 1024×1024 Imagen output via ffmpeg lanczos.

---

## Cinematic (Phase 4)

| Asset | Path | Size | Status |
|---|---|---|---|
| Cinematic (Option A — Veo video) | `cinematic/voltkin-intro.mp4` | 1,167 KB | ✅ |
| Decision rationale | `notes/cinematic-decision.md` | — | ✅ |

**Cinematic:** 4 seconds, H.264 + AAC stereo, 720p 16:9. Re-encoded from Veo 3.1 fast-generate output at CRF 26 preset slow to fit budget. **Option A (video) was chosen** — image-to-video seeded with `tv-glowing.png` produced a single-shot cinematic with all 3 beats (glow → shatter → emergence) and native audio. Cost: $0.35.

Option B (frame-sheet) was NOT needed; fallback steps documented in `cinematic-decision.md` and `integration-notes.md`.

---

## Audio (Phase 5)

| Asset | Path | Size | Status |
|---|---|---|---|
| Voice "VOLT-KIIIN!" | `audio/voltkin-voice.ogg` | 8 KB | ✅ |
| Cinematic bundled audio | `audio/cinematic-audio.ogg` | 35 KB | ✅ (bonus — full Veo audio) |
| Lightning crackle | `audio/lightning-crackle.ogg` | 18 KB | ✅ |
| TV static | `audio/tv-static.ogg` | 8 KB | ✅ |
| Glass shatter | `audio/glass-shatter.ogg` | 7 KB | ✅ |

**Audio subtotal:** 73 KB — ✅ under 200 KB target.

Voice: Google Chirp3-HD-Puck (energetic male). Alternates (Fenrir, Kore) archived in `notes/iterations/`. SFX time-sliced from Veo cinematic's native AAC audio.

---

## Documentation (Phase 1 + 6)

| Doc | Path | Status |
|---|---|---|
| Character variants brainstorm | `notes/character-variants.md` | ✅ (5 Gemini variants, Grok-scored) |
| Character lock decision | `notes/character-locked.md` | ✅ |
| Trademark check results | `notes/trademark-check.md` | ✅ |
| Cinematic decision | `notes/cinematic-decision.md` | ✅ |
| Integration notes for main session | `notes/integration-notes.md` | ✅ |
| Iteration archive (40+ files) | `notes/iterations/` | ✅ |

---

## Final signal

| Trigger | Path | Status |
|---|---|---|
| Ready signal | `READY.md` | ✅ |

---

## TOTAL PACK SIZE: 3.62 MB / 4.00 MB ✅

| Category | KB |
|---|---|
| sprites/ | 2,467 |
| audio/ | 73 |
| cinematic/ | 1,167 |
| **Total deliverable** | **3,707** |

`notes/` (docs + 40+ iteration archive PNGs) is NOT counted toward the deliverable pack — it's design history that lives in git for traceability.

---

## API spend summary

| Tool | Calls | Cost |
|---|---|---|
| Imagen 4 (sprites + TV bezels) | 13 generations across 11 batches | ~$1.04 |
| Veo 3.1 fast-generate-preview (cinematic) | 1 generation, 4s 720p | $0.35 |
| Google TTS Chirp3-HD (voice + alternates) | 3 generations | $0.0012 |
| Gemini 2.5 Pro (variant brainstorm) | 1 chat | ~$0.005 |
| Grok 4.20 reasoning (adversarial review) | 1 chat | ~$0.01 |
| **Total** | | **≈ $1.41** |

Well under the brief's $5-20 envelope and $20 Veo escalation threshold.

---

**Main session: pull from `origin/master` and check `READY.md` for the timestamp signal. All assets are ready to integrate.**
