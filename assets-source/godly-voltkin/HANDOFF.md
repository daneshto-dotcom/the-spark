# VOLTKIN ASSET GENERATION — Side Session Handoff

**Parent project:** SPARK (1v1 networked PixiJS game, live at https://spark-online.space)
**Parallel session:** YES — main session is working in `src/` simultaneously
**Your scope:** ONLY `assets-source/godly-voltkin/` — do not touch `src/`, `package.json`, or any game code
**Owner:** Oleg / Daniel
**Created:** 2026-05-13

---

## YOUR MISSION

Generate a complete, IP-safe asset pack for **Voltkin**, the first godly combo in SPARK. Voltkin is the visual-tonal centerpiece of a "godly combo" system — a reality-distorting cinematic super-attack that breaks the game's clean geometric aesthetic with a colorful 1990s-cartoon character emerging from an old CRT television to obliterate an enemy structure.

**Why this matters:** This is the user's first hype-bomb. The first 1v1 with his brother/friends pivots on Voltkin landing perfectly. The brother already gave the feedback that triggered this entire feature — "exploring combos isn't sexy enough." Voltkin's job is to scream "the rules of reality can be broken" in the first 3 seconds it's ever seen.

---

## READ FIRST

1. `DESIGN_BRIEF.md` — character design constraints, style guide, IP-safety rules (NON-NEGOTIABLE)
2. `ASSET_MANIFEST.md` — exact list of deliverables + done-criteria
3. This file (HANDOFF.md) — workflow + tool guidance + integration handoff back to main session

---

## TOOLS AVAILABLE

| Tool | Use for | MCP function |
|---|---|---|
| **Imagen 3 / 4** | Voltkin sprite sheet, TV bezel frames, dust/spark particles | `mcp__gcp-vertex__imagen_generate` |
| **Imagen edit** | Refining a generated sprite, fixing details, transparent BG | `mcp__gcp-vertex__imagen_edit` |
| **Veo** | The 2-3 second cinematic clip (TV flying in, Voltkin emerging, zap) | `mcp__gcp-vertex__veo_generate` |
| **TTS** | "VOLT-KIIIN!" character voice line | `mcp__gcp-vertex__text_to_speech` |
| **Gemini chat** | Brainstorming prompts, validating asset descriptions before generation | `mcp__gcp-vertex__gemini_chat` |
| **Grok chat** | Sanity-check + alternative prompts | `mcp__xai-grok__grok_chat` |
| **Drive upload** | Backup/share large video assets | `mcp__gcp-vertex__drive_upload` |

---

## WORKFLOW

### Phase 1 — Character design lock (BEFORE generating anything)
1. Read `DESIGN_BRIEF.md` end-to-end
2. Run a USPTO TESS quick check on "Voltkin" name (web search) — confirm no existing trademark
3. Optionally: use `gemini_chat` to brainstorm 3-5 character silhouette variants that satisfy the IP-safe constraints. Write them to `notes/character-variants.md`. Pick one and DOCUMENT WHY (file: `notes/character-locked.md`).
4. **Output:** `notes/character-locked.md` — one-page description of final Voltkin (silhouette, palette, distinctive features, anti-features-that-are-Pikachu)

### Phase 2 — Sprite generation
1. Generate idle pose first (single frame, transparent background). Iterate until it matches the brief.
2. Generate additional poses: charge-up, zap-attack, victory, hurt
3. Generate as a sprite sheet OR individual frames (sprite sheet preferred for runtime, individual frames easier to iterate)
4. Compress to PNG; target ≤200KB total for all sprites combined
5. **Output:** `sprites/voltkin-{pose}.png` (or `sprites/voltkin-sheet.png` if combined)

### Phase 3 — TV bezel + frames
1. Old CRT TV with rounded screen edges, retro brown/wooden chassis
2. Three frames: TV-off, TV-static-snow, TV-glowing-with-Voltkin-silhouette
3. **Output:** `sprites/tv-bezel-{frame}.png`

### Phase 4 — Cinematic
1. **Option A — Veo video clip (preferred for max hype):** 2-3 second MP4, geometric world fragments away, CRT flies in, Voltkin emerges, screen flashes. File ≤3MB.
2. **Option B — Frame-by-frame sprite animation (fallback if Veo over-budget):** 24-36 frames at 12fps as a sprite sheet — main session animates via PixiJS.
3. Decide Option A or B based on Veo quality + file size. Document choice in `notes/cinematic-decision.md`.
4. **Output:** `cinematic/voltkin-intro.mp4` OR `cinematic/voltkin-intro-frames.png`

### Phase 5 — Audio
1. "VOLT-KIIIN!" voice clip via TTS — high-pitched, energetic, ~1-2 seconds. Apply reverb/distortion if your tools support it.
2. Lightning crackle SFX (search libraries or generate via Veo audio if available)
3. TV static SFX (~0.5s loop)
4. Glass-shatter SFX (when geometric world breaks)
5. **Output:** `audio/voltkin-voice.ogg`, `audio/lightning-crackle.ogg`, `audio/tv-static.ogg`, `audio/glass-shatter.ogg`
6. Target: ALL audio combined ≤200KB (OGG Vorbis at 32-48kbps mono is plenty)

### Phase 6 — Final delivery
1. Write `ASSET_MANIFEST.md` checklist with file paths + sizes + brief description of each asset
2. Write `notes/integration-notes.md` for the main session: how to use each asset, recommended timing, any caveats
3. Commit everything to git: `git add assets-source/godly-voltkin/ && git commit -m "Voltkin asset pack v1"`
4. Push to origin
5. **Signal main session:** edit `assets-source/godly-voltkin/READY.md` with a one-line "READY YYYY-MM-DD" timestamp — main session polls this file

---

## INTEGRATION HANDOFF BACK TO MAIN SESSION

When `READY.md` exists, the main session will:
1. Pull from origin
2. Move/compress assets from `assets-source/godly-voltkin/` into `src/assets/godly/voltkin/` (or similar — main session decides)
3. Wire them into `cutsceneOverlay.ts` per the S22-S23 PDR
4. Run the full pipeline locally to verify Voltkin triggers correctly

You do NOT need to touch `src/`. Your output stays in `assets-source/`.

---

## GIT COORDINATION

- This is a parallel-session workflow (deviation from CLAUDE.md "solo workflow" rule, explicitly authorized for asset gen)
- You commit + push to master like normal
- Before every push: `git pull --rebase origin master` to absorb main session's commits
- Conflicts are unlikely (different paths) but if they occur, defer to main session for src/ files; main session defers to you for `assets-source/`
- **Identity:** `daneshto@gmail.com` per global rule (never `daniel@chateaudechazeuil.com`)

---

## BUDGET + QUALITY BAR

| Constraint | Target |
|---|---|
| Total asset pack size | ≤4 MB (1-3 MB for video, ~200 KB sprites, ~200 KB audio) |
| Sprite style consistency | All sprites match the same cel-shaded palette + outline weight |
| IP risk | ZERO — adversarial review every sprite against the anti-Pikachu checklist before commit |
| Hype factor | Imagine a person seeing this for the first time. If they don't go "WTF" out loud, iterate. |
| Token cost | Generously — quality is the priority. Estimate $5-20 in Imagen/Veo/TTS API. |

---

## DONE-CRITERIA

You are DONE when:
- [ ] `notes/character-locked.md` describes the final Voltkin (silhouette, palette, distinctive features)
- [ ] `notes/cinematic-decision.md` justifies video vs frame-sheet choice
- [ ] All assets in `ASSET_MANIFEST.md` exist on disk
- [ ] Total pack size ≤4 MB
- [ ] No Pikachu features per anti-checklist (DESIGN_BRIEF.md §3)
- [ ] `READY.md` written with timestamp
- [ ] Everything committed + pushed to master

---

## QUESTIONS TO ESCALATE TO USER (NOT MAIN SESSION)

- If Veo costs exceed $20 or output quality is inadequate, STOP and ask user before proceeding with video
- If you cannot generate an IP-safe character that still feels "Pokemon-cartoon-cool," STOP and present 3 alternatives to user
- If the TTS voice options all sound like crap, STOP and ask user whether to use a different voice tool

The main session won't see your questions — escalate directly to the user.
