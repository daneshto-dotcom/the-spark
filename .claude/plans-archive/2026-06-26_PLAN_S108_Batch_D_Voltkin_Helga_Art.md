# PLAN — S108 Batch D · Voltkin + Helga Visual-Quality (point #2 + Helga art) — 2D, NO 3D
Status: SPIKE DONE (S109) — AWAITING OWNER PICK before wiring | PROTOCOL_VERSION: unchanged (offline asset swap) | Tier: Full | Risk: Medium (art quality + bundle)

> S109 SPIKE RESULT (2026-06-26): imagen-4-ultra key verified LIVE (no refresh needed). Generated 6 ORIGINAL on-model
> candidates — Voltkin on the LOCKED 'Static Gremlin' design (idle + zap-attack) + Helga (dirndl + stein + slap). Keepers:
> voltkin_idle_A, voltkin_zap_A, helga_B. Quality jump over the procedural cyan spindle CONFIRMED; pipeline viable. NO code
> wired (gated). Artifacts: C:/Users/onesh/OneDrive/Desktop/SPARK_Batch_D_art_spike_S109/ + READ_ME_first.txt. Watch-out
> confirmed live: 1 idle gen drifted to red-cheeks/Pikachu — the anti-Pikachu lock caught it (reject drifted gens, harden
> the prompt). NEXT: owner answers the 5 OQs below → Batch D PDR + Council → full per-pose set → matte → atlas swap.
Source: S108 scope-discovery workflow (investigator #2, Opus) + owner correction (S108). See memory [[voltkin-helga-no-3d-better-2d]].

> OWNER CORRECTION (decisive): NO 3D — meshy.ai / GLB / live-3D is OFF the table. Keep the SAME 2D characters, just
> BETTER QUALITY and fully moving, cleanly composited (no square matte box). The "square border" the owner remembers
> was the OLD sprite-frame Voltkin (a visible matte box, worst on the attack frame); the CURRENT Voltkin is the S106
> procedural Pixi.Graphics vector rig (no box, but "even lower quality"). Want BETTER than BOTH.

## OBJECTIVE
Replace the procedural vector Voltkin (and re-skin Helga) with high-quality, fully-animated, cleanly-matted 2D
characters that live IN the scene (transparent, no box), via the project's existing offline asset pipeline. Keep the
game 2D (Pixi.js 8). NO new runtime dependency.

## CURRENT STATE (verified)
- Voltkin TODAY = 100% procedural Pixi.Graphics vector rig (creatureRenderer.drawVoltkin:227-319 + voltkinPose.ts) —
  a cyan electric spindle. This is the S106 P5 rewrite the owner dislikes. (Note: it doesn't even match the LOCKED
  original "Static Gremlin" design — chunky yellow gremlin, #FFD60A — in assets-source/godly-voltkin/notes/character-locked.md.)
- The 2D asset-consumption paths the engine ALREADY has: (a) `Assets.load(url)→Texture→Sprite` for PNGs/atlases
  (codexOverlay.ts:240); (b) `Texture.from(videoEl)→Sprite` with per-tick source.update() for video (cutsceneOverlay.ts:369).
- Established OFFLINE pipeline precedent: scripts/matte-voltkin-intro.py (renders a video master → transparent runtime
  asset) + the retired scripts/build-voltkin-atlas.py (packed clips into a 2048×2048/256px-cell atlas + JSON manifest —
  recoverable via `git show 30d04e8^:scripts/build-voltkin-atlas.py`).
- RECOVERABLE original 2D masters: assets-source/godly-voltkin/sprites/off-model-v1/ (5 pose PNGs) + voltkin-zap.png;
  all deleted public PNGs + the 553KB atlas recoverable from git at 30d04e8^.
- The 2D playback code is still PRESENT + tested: voltkinFrames.currentAnimCell (326-382) + VoltkinAnimManifest are
  pure functions of synced (state, ticksInState, killCount, worldTick, isMoving) — reviving the atlas path is mostly
  reverting the RENDER half of S106 P5 (swap drawVoltkin Graphics → atlas-cell Sprite), determinism FREE.
- Helga: characterSprite is still the Voltkin placeholder PNG (princessHelga.ts:107). See memory [[helga-princess-spec]]
  (Bavarian beer-slapping princess, CtCD style, ORIGINAL, real state-driven animated character — not a gif).

## CONSTRAINTS / GOTCHAS (verified)
- gcp-vertex MCP key may need a Console refresh (memory [[gcp-vertex-gemini-key-console-only]]) — verify imagen/veo
  BEFORE relying on them.
- RECORDED RISK: imagen/veo reference-image conditioning was non-functional in this auth setup (SLICE_SPEC.md:60-64 —
  Imagen style-drifts). ⇒ run a small SPIKE and show the owner sample frames/clips before committing a pipeline.
- Original art only (memory [[art-no-franchise-copying]] — shipped a Totoro look-alike in S95, had to rework).
- Owner standing preference: real video over procedural twitch (memory [[feedback-real-video-over-procedural-animation]]).
- Bundle: a new ~550KB atlas may re-trip check-bundle-size.mjs — raise the charter (memory [[bundle-cap-raise-dont-debug]])
  or lazy-load the asset outside the main bundle. NEVER bundle the art.

## PROPOSED APPROACH (offline pipeline — recommended; live-3D rejected by owner)
1. SPIKE FIRST: generate Voltkin via imagen (original character still, on-model to the locked design or owner's pick) +
   veo image-to-video for motion. Matte to TRANSPARENT via cinematicLumaKey.ts / a matte-*.py (the box-border fix).
   Show the owner side-by-side samples → owner picks generator + look BEFORE any wiring.
2. Render the approved result to 2D: either (a) a per-state sprite ATLAS (revive build-voltkin-atlas.py shape) — crisper,
   smaller, the tested currentAnimCell path; or (b) short matted state-loop VIDEOS (cutsceneOverlay video-texture path).
3. Drop the built asset into public/godly/voltkin/anim/ and REVIVE the 2D playback path (swap drawVoltkin's Graphics for
   an atlas-cell Sprite; keep the lightning-cloud death FX). Determinism is free (currentAnimCell is pure synced-state).
4. Apply the same pipeline to Helga (princess) per [[helga-princess-spec]].

## WIRE / DETERMINISM
NONE — purely a visual asset swap. Gameplay config (VOLTKIN_CONFIG) + FSM timing untouched → host-sim, replay,
scoring, PROTOCOL_VERSION all unaffected. Rendering reads world without mutating; the atlas path keys on the SAME synced
fields. CAUTION: meshy/imagen/veo must NEVER be a runtime call — offline build step only (matte-voltkin-intro.py precedent).

## OPEN QUESTIONS (owner)
1. Render target: sprite ATLAS (crisper/smaller, tested path) or matted VIDEOS (richer motion)?
2. Target design: the LOCKED "Static Gremlin" (yellow boxy, character-locked.md) or a new look? (The current cyan
   spindle is a different character — confirm what "the Voltkin design" means.)
3. Which generator after the spike (imagen vs veo) — owner picks from samples.
4. Swap the in-world creature, re-render the intro cinematic, or BOTH? (Today they're separate assets.)
5. Bundle: approve raising the charter for the new atlas, or lazy-load it outside the main bundle?

NOTE: the "new Voltkin design at 50% smaller" that Batch C's lightning-drone reuses = the CURRENT procedural rig (kept
as the drone sprite) — independent of this batch's quality upgrade. Sequence so Batch C's drone reuse isn't broken by D.
