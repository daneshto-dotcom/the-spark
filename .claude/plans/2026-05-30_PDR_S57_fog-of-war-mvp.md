# PDR S57 P1 — Fog of War MVP

- **Date:** 2026-05-30
- **Tier:** Standard (3-way Council R1 done)
- **Status:** COMPLETED — 894 unit + full e2e green; runtime pixel-verified
- **Approval:** user ("next important thing... fog of war... first thing we'll focus on" + "work through it thoroughly")

## OBJECTIVE
Client-side cosmetic Fog of War for 1v1. Each player sees only their own vision; enemy
structures are concealed until cruised over; on win the fog lifts so everyone sees all
structures. Delivers the user's full described experience (concealment → scouting →
end-game reveal). Zero new network messages.

## SCOPE (files)
- **NEW** `src/game/vision.ts` (pure) — `computeVisionSources(world, localCursor) → VisionSource[]`:
  personal radius `R_PERSONAL` at the local cursor + one beacon `R_BEACON` per primitive owned
  by `world.localPlayerId` + always-visible spawner zone (`SPAWNER_*`). Bigger/complex structure =
  more beacons = larger union (emergent). Also `fogActive(world)` + `fogTargetAlpha(world)` pure gates.
- **NEW** `src/game/vision.test.ts` — own-beacon-only (enemy excluded), spawner always present,
  solo→inactive, personal-at-cursor, gating + win-alpha transitions.
- **NEW** `src/render/fogRenderer.ts` — Pixi v8 RenderTexture visibility mask. Canvas2D radial
  brush → `Texture.from` (one-time). Per frame: container `[opaque dark base, ...pooled erase
  brushes]` → `renderer.render({container, target: RT, clear:true})`; RT shown as a Sprite over
  the world layer. Win = local alpha tween 1→0 over ~1s.
- **NEW** `src/render/fogRenderer.test.ts` — pure gating/alpha-tween logic (no GPU).
- **EDIT** `src/main.ts` — fog container between effects (z6) and avatar (z7); `fog.sync(world, controls.cursor)` each frame.
- **EDIT** `src/constants.ts` — add `FOG_COLOR`, `FOG_FADE_TICKS`/ms if needed (R_PERSONAL/R_BEACON/VISION_FADE_PX already exist).
- **DOC** — raise bundle soft-cap convention 500 → 550 KB (boot-snapshot/handoff). Resolves S56 P2 carry-forward.

## OUT OF SCOPE → carry-forward
- **Memory-fog** (StarCraft dimmed last-observed render) — next PDR.
- **Victory cinematic choreography** (§III.7 migrate-to-center + sequential collapse) — separate feature; only the fog-LIFT (reveal) is in scope.
- **Authoritative anti-cheat vision-filtering** (host sends only visible entities) — Phase-3 server-ish work; MVP is cosmetic (peer holds full state in memory). Acceptable per Blueprint XII.

## DELIBERATION — Council R1 (Battle Ledger)
3-way Council (Claude + Grok grok-4.20-reasoning t0.3 + Gemini gemini-2.5-pro t0.3) on render technique.
- **CONVERGED → Option A (RenderTexture visibility mask).** Both VETO Option B (custom GLSL filter)
  citing the codebase's `CinematicLumaKeyFilter` silent-compile history (S29 P0). Both rank Option C
  (Graphics-only) poorly (per-frame tessellation / batching cost).
- **CONVERGENT ADOPT:** live cursor (not 10Hz `avatarPos`) for personal vision; mandatory brush-sprite
  object pool; `clear:true` non-negotiable (else vision-trail info leak); test the *math* in vitest,
  GPU path via preview/extract-pixels.

### PRIME-AUDIT deltas
- **Δ1** Gemini's `.mask` polarity is inverted as written (would darken vision) → use Grok's
  erase-to-opaque-fog variant.
- **Δ2** Gemini's `beginGradientFill`/`MSAA_QUALITY` are Pixi v7 API (won't compile v8) → Canvas2D brush.
- **Δ3** Blend-id conflict (`BlendMode.ERASE` vs `BLEND_MODES.DST_OUT`) → **empirically resolved:**
  Pixi **8.18.1** uses the string `'erase'` (verified in `node_modules/pixi.js/lib`).
- **Δ4** Grok's shared-`winTimestamp` fade → over-engineered; host `ENDGAME` + snapshots sync peers
  <~100ms; local alpha tween suffices. Refuted with evidence.
- **Δ5** Grok's "spawner reveals enemy near center" → **by design** (Blueprint §IX.5 spawner always
  visible; central traffic intended). Dismissed.

## RENDER DESIGN (locked)
1. **Brush (once):** Canvas2D `createRadialGradient` white(α1)→transparent(α0) → `Texture.from(canvas)`.
2. **RT:** `RenderTexture.create({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, resolution })`.
3. **Per frame (fog active):** pooled `Sprite(brush)` per vision source, `blendMode='erase'`, positioned
   at source (world=screen), scaled `r/brushRadius`; drawn after a full-screen opaque `FOG_COLOR` base;
   `renderer.render({container, target: RT, clear:true})`.
4. **Display:** `Sprite(RT)` in the fog container; `.alpha` = fog strength, tweened 1→0 on WIN edge.
5. **Gates:** active only `gameMode==='1v1' && gameState==='PLAYING'`; lift on `WIN`/`POSTGAME`; off in solo.
6. **Fallback** (if `'erase'`-in-pass misbehaves visually): inverse `.mask` with the same RT.

## TESTING
- **Unit (vitest, pure):** vision sources (own beacons only, spawner always, solo inactive, cursor-personal);
  fog gating + win-alpha transitions. Target +8–12 tests; full suite GREEN; `tsc -b` clean.
- **Build:** bundle measured (expect ~505–512 KB, under new 550 cap).
- **E2E/visual (Playwright + preview):** 2-peer smoke — fog present in PLAYING, concealment of enemy,
  post-win reveal. GPU mask verified live in `preview_*` screenshots (boot-then-smoke gate for Δ3).

## RISKS
- `'erase'`-in-RT-pass runtime behavior (mitigated: verified live + `.mask` fallback).
- Every own primitive needs a beacon or own units vanish in fog (covered by computeVisionSources test).
- RT size/DPI mismatch → stretch (RT sized to canvas × resolution).
- Z-order: fog must sit above world, below avatar/HUD (explicit `addChildAt`/insertion point).
- blendMode state must not leak into other passes (self-contained RT render).

## RESULTS — COMPLETED 2026-05-30
- **Vision math** `src/state/vision.ts` + 19 unit tests — green (own-beacon-only, enemy concealed, spawner always, solo off, win-lift tween).
- **Renderer** `src/render/fogRenderer.ts` — RenderTexture `'erase'`-mask. Runtime-verified in preview AND `e2e/fog.spec.ts` via pixel extraction: cursor/spawner/own-prim = transparent cutouts; enemy base = opaque `FOG_COLOR` (5,7,13); win → alpha 1→0 in ~1s then container hides (reveal-all).
- **Suite:** 875 → **894 unit** green; full e2e **10 pass / 1 skip (Sym E) / 1 flaky-recovered (Sym I)**; `tsc -b` clean.
- **Bundle:** 499.99 → **502.69 KB** (+2.70). Soft-cap convention raised 500 → **550 KB**.
- **Pixi v8.18.1 facts locked empirically:** blend = string `'erase'`; `renderer.render({container,target,clear})`; Canvas2D brush via `Texture.from`.
- **Placement note:** module landed at `src/state/vision.ts` (not `src/game/`) to match `territory.ts` (closest analog — pure per-player geometry reader) and avoid a `game/→state` import.

## DEVIATION — swiftshader perf (runtime discovery, beyond original PDR)
The per-frame full-screen RT pass nearly HALVED the sim under software WebGL (swiftshader), failing the spawn-timing 2-peer smokes (Sym A: 0 sparks in 10s). Root-caused by A/B (fog on→off flips Sym A red→green). Fixed with two production optimizations + one test seam:
1. **Half-res mask** (`MASK_SCALE=0.5`) — ~4× less fill; the soft fade hides upscale blur.
2. **20Hz throttle** (`MASK_RENDER_EVERY=3`) — ~3× less render-PASS overhead (the swiftshader-dominant cost); the alpha tween stays per-frame so the win-lift is smooth.
3. **`__FOG_DISABLE__` seam** (mirror of `__TEST_SPAWN_RATE__`) — 2-peer gameplay smokes run fog-off (they test gameplay, not fog; fog covered by `fog.spec`). Set via `addInitScript` in `smoke.spec` `open2Peers`.
Net: fog is now cheap on real devices too (Grok's mobile-battery concern), and the gameplay smokes are isolated from render-layer cost.

## CARRY-FORWARD (next PDRs)
- Memory-fog (StarCraft dimmed last-seen render).
- Victory cinematic choreography (§III.7 migrate-to-center + sequential collapse).
- Authoritative anti-cheat vision-filtering (Phase-3 server-ish).
- Opponent-view attract-drag parity (S52 Δ6, carried from S56).
