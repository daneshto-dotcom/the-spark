# Boot Snapshot (auto-generated at S36 close)
Generated: 2026-05-17 | Session closed: S36 (6 priorities shipped, 4 commits) | Last commit: af76b76

## Live URL
**https://spark-online.space/** (HTTPS, GH Pages auto-deploy on push to master)
**https://spark-online.space/?debug=1** (debug overlay + `[net]` + `[cinematic] video.*` + `[creature] state` logs now including frameKey + killCount)

## Status
S36 shipped 6 of 20 priorities (Voltkin Multi-Frame Animation + Transformation Arc plan, S36+S37+S38). All in-game animation infrastructure for Voltkin is now live: 6-frame state-driven texture swap, lion↔chibi transformation arc, transformation flash on form-swap moments, sprite horizontal flip on velocity.x, killCount-driven victory/hurt DESPAWNING frame. **Awaiting user playtest** to validate visual feel + tune from feedback.

**Tests:** 680/680 (+53 from baseline 627: 43 voltkinFrames + 4 killCount + 6 computeFacing)
**Bundle:** 469.66 KB (+1.51 KB from 468.15 KB; 30.34 KB headroom on 500 KB cap)
**Public assets:** +1.18 MB (5 new voltkin frames — idle-1, idle-2, charge, hurt, victory)
**Branch:** master, clean, in sync with origin (d73c036..af76b76, 4 new commits)
**Context at close:** see session-state.json (~290K / 1M, ~29% GREEN)

## What landed in S36

| Priority | Description | Commit |
|---|---|---|
| P1 | Asset compression pipeline (Pillow Lanczos 512² + zlib-9; 5 WINNER frames → public/) | 0c8700a |
| P2 | Pure frame selector `src/render/voltkinFrames.ts` (state→frame key, isLionForm, flashIntensity) | 0c8700a |
| P3 | `Creature.killCount` field + applyCreatureAttack increment + save serializer (additive-optional) | 1799863 |
| P4 | Renderer texture preload Map + per-tick swap (replaces single-texture pipeline) | 1a08162 |
| P5 | Transformation flash on form-swap (2-tick scale+cyan-tint punch; SPAWNING t=30, ATTACKING t=15+45) | 1a08162 |
| P6 | Sprite horizontal flip on velocity.x with debounce threshold (1.5 px/tick) | af76b76 |

## Next Steps (S37 priorities + 2-peer smoke gate)

**USER GATE 1: solo browser playtest** — Open `https://spark-online.space/?debug=1`, build SQ4-TR4 chain, trigger Voltkin. Expected visual:
- Cinematic plays as before (mp4 + voice + bg fade)
- Creature spawns in zap (lion form) during SPAWNING ticks 0-29
- Cyan flash + scale punch at SPAWNING t=30 morph to idle-1 (chibi)
- SEEKING: idle-1 ↔ idle-2 alternation every 1s, sprite flips horizontally based on motion direction
- ATTACKING wind-up: cyan flash + scale punch at t=15 morph to charge (lion). Yellow tint warm-up ticks 15-29. Flash + scale punch at t=30 fire-moment (combined with ARC_FLASH lightning + screen shake)
- ATTACKING recovery: charge held ticks 31-44, then cyan flash + chibi morph at t=45
- DESPAWNING: victory (chibi triumphant) if creature landed any attacks, else hurt (chibi dazed)
- Hard-refresh first (Ctrl+Shift+R) — GH Pages cache lesson from S32

**USER GATE 2: 2-peer 1v1 smoke** (still gated from S35 P0) — open `https://spark-online.space/` on two devices, host creates room, joiner enters code, host clicks Begin Match. Verify both peers transition LOBBY→PLAYING (S35 P0 fix), then trigger Voltkin on both sides and verify the animation is the same on host and joiner (P3 killCount syncs over wire; renderer derives frame the same way on both sides).

**S37 priorities** (next session, ~5):
1. Web Audio rising-tone "charge" SFX during ATTACKING wind-up (ticks 0-29)
2. Web Audio "FWOOSH" SFX on transformation morph (form-swap boundaries)
3. Crystal-crown layered Pixi child sprite with alpha/scale pulse during ATTACKING wind-up
4. 1v1 NetSnapshot v2 verify — joiner derives same frame (killCount already in wire from P3)
5. 2-peer manual smoke + production playtest (covers S35 P0 1v1 fix AND new S36 animation pass)

**S38 stretch** (optional carry):
- Particle spark trail during SEEKING locomotion (Pixi Graphics line pool)
- Sprite anchor eye-tracking toward target during ATTACKING wind-up
- Death-particle burst on DESPAWNING entry
- Extra camera shake on transformation morph
- Final timing tune from user feedback

## Blockers
- **GH Pages deploy 25991074840 stuck pending for 12+ min as of this snapshot** — sprites at 404 on production. May resolve on its own; if not, user can rerun the workflow manually.
- **Single-session full visual validation impossible** — voltkin trigger requires interactive chain-build; preview server timed out on direct gameState mutation. User playtest is the canonical visual smoke.

## Pending Backlog (excerpt)
- [ ] S37 P7-P11: audio synth + crown-pulse + 1v1 NetSnapshot verify + 2-peer smoke
- [ ] S38 P16-P20: particle trail + eye anchor + death burst + extra shake + timing tune
- [ ] CF-1 (S35): main.ts:201 dispatchFn gate tighten to require gameState==='PLAYING'
- [ ] CF-2 (S35): transport.ts:144 wire deserialize via parseNetMessage validator
- [ ] Bond UX RMB-drag multi-target (S23 P2 carry)
- [ ] P3 NET enhancements (client prediction + delta NetSnapshot + host migration + live cursor)
- [ ] P5 Phase-2 next mechanic (D Inject Spiral / E Steal / A Fog / G Mega-combos)
- [ ] P7 Bond-hover cost preview
- [ ] P9 OGG compression (10MB → ~2MB)
- [ ] PannerNode + auto-duck audio polish
- [ ] Host save-load with live creatures edge case (Gemini G3 documentational; low priority)
- [ ] CutsceneOverlay.abort integration test (S34 P2-24 stretch deferred)
- [ ] Existing voltkin-zap.png style-drift check vs new 5 frames — re-compress if user notices

## Recent Reflexion (S36 highlights)

- **#council-cancelled-mid-launch-via-parallel-tool-coupling**: Skill invocations should run in their OWN tool batch, never alongside Bash probes that could fail. PowerShell `&&` chain failure cascaded into Council cancellation; 20K+ tokens of intended deliberation lost. Fallback was strong-defaults PRE/PRIME-AUDIT under user explicit-go — documented exception, not new norm.

- **#transformation-arc-from-style-mismatch-as-strongest-creative-interpretation**: When user-generated assets carry visible style contrast (chibi vs lion-form WINNERs), the strongest reading is that the contrast IS the design (Pokemon-style transformation). Map the contrast to a meaningful axis (rest vs combat) rather than normalize.

- **#pure-frame-selector-as-side-of-render-coin**: Separating SELECTION (pure function) from RENDERING (Pixi-coupled class) gives 43 unit tests with zero Pixi mocks. Pattern carries to Anvil + future creatures — each gets its own `*Frames.ts` module.

- **#empirical-sync-test-between-two-deterministic-functions**: When two pure functions (currentFrameKey + flashIntensity) must agree on a derived predicate, write a walk-the-domain test that asserts the cross-function consistency. ~20 LOC, catches drift forever, becomes the spec.

- **#killCount-as-render-derived-state-not-display-flag**: Add the underlying measurable (count) not the display flag (boolean). Future-proof for kill-streak achievements, scoring derivatives, balance tuning — all become 1-line derivations.

## Manual Smoke (CHECK live — if running it again)
Solo or 1v1 device on `https://spark-online.space/?debug=1`. **Hard refresh first.** Build SQ4-TR4 chain. Expected per "Next Steps" above — all 5 visual checkpoints (cinematic → SPAWNING morph → SEEKING walk-cycle → ATTACKING transformation arc → DESPAWNING victory/hurt). Open F12 console; `[creature] state` logs every 60 ticks include frameKey + killCount + state — actionable signal for any regression report.
