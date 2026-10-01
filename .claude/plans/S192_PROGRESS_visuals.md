# S192 · `s192/visuals` · progress

Worktree `.claude/worktrees/s192-visuals`, branch `s192/visuals`, base `f242cb5` (PROTOCOL 54). Merge owner: the main session.
Dev port for this worktree (the playwright FNV hash): **27203**.

## Packages
- `pixi-filters@6.1.5 --save-exact` (MIT, owner-approved live). Transitive: `@types/gradient-parser@0.1.5` (MIT, types only, 0 runtime bytes).

## Asset licences
- No external assets. Particle textures are generated at runtime from canvas radial gradients (`src/render/fx/softTextures.ts`).
  Kenney CC0 was not fetched; nothing to license.

## Commits
| step | commit | what | gates |
|---|---|---|---|
| 1 | `57cbecd` | rework list: `S192_VISUALS_PLAN.md` + `.html` (+ desktop copy) + `pixi-filters@6.1.5` | docs only |
| 2 | `e222b73` (+ `ec266ff` docs) | V01 substrate + PILOT: Vlad siphon (`fx/sapFx.ts`) + building aura (`fx/auraFx.ts`) | tc 0 · vitest 0 (441 files passed, 2 skipped) · build 0, **1011.3 KiB** |
| 3a | `4301ad1` | V04 every detonation (`fx/blastFx.ts` via `effectsRenderer.ts` BOMB_EXPLODE) | tc 0 · vitest 0 (442 files) · build 0, 1012.7 KiB |
| 3b | `a4beadd` | V05 zombie rot boil (`fx/rotFx.ts` via `bossAuras.ts` `drawRotAura`) | tc 0 · vitest 0 (443 files) · build 0, 1013.8 KiB |
| 3c | `15cb2cd` | V06 castle gun bolt light (`fx/castleShotFx.ts` via `gathererRenderer.ts` `drawCastleShot`) | tc 0 · vitest 0 (444 files, 6969 tests passed, 7 skipped) · build 0, **1014.7 KiB** |
| end | (this) | screenshots for 3a-3c, progress, plan | e2e:gating **0 (69/69)** · e2e:races **0 (5/5)**, both on this worktree's own vite (port 27203, PID checked) |

## STEP 2: the pilot

### What was built
- `src/render/fx/emitter.ts`: the pure deterministic emitter. `fxHash` (a 32-bit imul avalanche), `fxSeed`,
  `forEachLive` (the stateless continuous emitter), the curves, `mixColor`, `FxSink` / `FxShockSink`, and
  `recordingSink` for tests.
- `src/render/fx/softTextures.ts`: five runtime canvas textures (soft, core, ring, smoke, bubble). No assets.
- `src/render/fx/fxLayer.ts`: the pooled-sprite layer (cap 2400 sprites a layer).
- `src/render/fx/fxState.ts`: the switchboard (`fxActive`, the sinks). It imports no Pixi, so tests stay light.
- `src/render/fx/fxRuntime.ts`: installs the GROUND layer (inside the spawner-aura root, fogHiddenLayer[5]) and the
  TOP layer (fogHiddenLayer[20], the LAST child). It puts an `AdvancedBloomFilter` on TOP (HIGH only, `blendMode 'add'`,
  `padding 48`) and pooled `ShockwaveFilter`s on `groundLayer` (HIGH only, at most 3, filterArea = screen), and it
  reads `?fx=legacy`.
- `src/render/fx/sapFx.ts` (PILOT 1) is wired into `bossAuras.ts` (the vampires branch; legacy `drawLifeSap` kept).
- `src/render/fx/auraFx.ts` (PILOT 2) is wired into `spawnerZoneRenderer.ts`. It replaces the disc, rings and core;
  the bond strokes are kept.
- A Settings row **"High-quality effects"** (`fx-hq-toggle`) writes `displayPrefs.isFxHighQuality` (default ON),
  which main.ts polls every frame.
- A DEV seam `__SPARK__.fx` (`src/dev/fxLab.ts`: vlad / zombie / sap / tower / blast / horde / setLegacy /
  setHighQuality / stats), and `__SPARK__.frameMs` (the last 600 frames, ticker start → render end).

### Shared files touched (merge-owner hazard list)
- `e2e/fog.spec.ts` roll call: index 5 changes from `_Graphics` to `_Container`, and a new index 20 `_Container`
  (fxTop) is added. The comment on 19 is updated.
- `src/render/raStrikeAboveBuildings.test.ts`: a new pin. There is exactly one `topParent: fogHiddenLayer`, and it
  comes after the strike.
- `src/state/creatures/navUnitIndex.guards.test.ts` test 1: `src/dev/fxLab.ts` is added (1 `nextCreatureId++`,
  1 `creatures.set(`), with the reason.
- `src/main.ts`: installFx after the Ra strike layer, the fxBeginFrame/fxEndFrame bracket, fxClear on title, and the
  DEV seam.

### Determinism / wire
- Every particle is a pure function of synced integers (entity id, `world.tick`, `sapFlashUntilTick`, spawner id).
- No sim write, no hash change, no wire field. **PROTOCOL_VERSION stays 54 (no bump).**
- Guard `src/render/fx/fxGuards.test.ts`: no `Math.random(` anywhere in `src/render/**` except `arcadeScores.ts`
  (a run id) and `sudokuOverlay.ts` (local menu decoration), and the fx layouts import no Pixi, DOM or clock.
  It is mutation-tested: adding `Math.random()` to `auraFx.ts` turned 2 assertions red.

### Screenshots (`.claude/plans/visuals/` and `C:\Users\onesh\OneDrive\Desktop\SPARK_Visuals_Pilot\`)
- `pilot1-vlad-siphon-t8-of-36.png`, `-t20-of-36.png`, `-t31-of-36.png`: BEFORE | AFTER at three moments of the
  36-tick flash.
- `pilot1-vlad-siphon-t20-LOW-vs-HIGH.png`: what the bloom adds.
- `pilot2-building-aura-0.png`, `-30.png`: a vampire tower. BEFORE (the aura faded under the building, S183) | AFTER.
- They were captured by a throwaway Playwright script (`.tmp-gates/fx/`, gitignored) on this worktree's own vite
  (port 27203), with the ticker STOPPED and one dt≈0 frame per shot, so each frame is exact. ⚠ Not the Browser
  pane: it does not run rAF (memory `spark-browser-verification-limits`), and a frozen-ticker Playwright frame can
  be reproduced.
- A bug the screenshots found, now fixed: the bloom drew a hard-edged RECTANGLE around every bright effect (the glow
  was clipped at the filter frame). Fixed with `padding 48` and an additive composite.

### Frame time: 120 creatures + 4 towers + 2 siphoning Vlads + a zombie boss + a 240 px blast every 0.65 s
Measured with `__SPARK__.frameMs` (ticker start → end of the Pixi render, CPU): the last 300 frames of 6 s,
headless Chromium, ANGLE D3D11 on an RTX 4070 Ti SUPER (`FX_GPU=1`). Two runs each:

| mode | avg ms | p50 | p95 | frames in 6 s |
|---|---|---|---|---|
| legacy (`?fx=legacy`) | 3.92 / 4.32 | 3.70 / 4.30 | 5.80 / 5.80 | 330 / 324 |
| new, HIGH | 4.63 / 4.70 | 4.60 / 4.60 | 6.50 / 7.20 | 329 / 326 |
| new, LOW | 4.46 / 4.85 | 4.40 / 4.70 | 5.90 / 7.20 | 329 / 327 |

That is about +0.4 to +0.7 ms of CPU a frame with ~300 fx sprites live, and the frame rate did not change. HIGH and
LOW are within noise on CPU: bloom costs GPU time, which this probe does not see, and the frame rate did not move. A
software-GL run (SwiftShader, no `FX_GPU`) measured legacy 6.0-6.2 ms against new 7.6-7.8 ms. That is the worst
case, +1.6 ms.

### Bundle
- 1011.3 KiB, against a **983.0 KiB** baseline measured on this branch's base with the fx code stashed: **+28.3 KiB**
  (⚠ over the +15 KiB flag). Of that, `AdvancedBloomFilter` (with the Kawase blur and extract-brightness, GLSL+WGSL)
  is **12.1 KiB**, measured by stubbing it out (999.1 KiB). ShockwaveFilter, the fx code and the settings row make up
  the rest. Headroom is 88.7 KiB of 1100. If the shared headroom gets tight, dropping bloom (the LOW look for
  everyone) saves 12.1 KiB.

### Owner LOOK items (MINE, not ruled)
- ~~The aura stays visible around a finished building~~. REVERSED by audit V-1: that contradicted S183 (*the aura
  fades with the building on every tower*). It now fades with the cover alpha like the legacy aura did.
- The siphon numbers (96 motes, 3 arms, 118 px, chest −64 px, landing at 78 %) are mine.

## STEP 3: the next three (owner refinement: *"we can do a few … cue all the other upgrades for the following sessions"*)

- **V04, every detonation** (`fx/blastFx.ts`). One drawer serves six producers (hub blast, zombie raze, suicide
  goblin, drone, stink tower and its bags, `damage.ts`). It draws a flash, a fireball, 28 embers under gravity,
  8 smoke puffs, a scorch, a shock ring that stops at 1.15 × radius (the S71 ring ran to 3.2 ×, far past the hitbox),
  and a ground ripple on HIGH.
- **V05, the zombie rot aura** (`fx/rotFx.ts`). 18 glowing bubbles that pop (a splash ring and 3 droplets), plus
  rising miasma. The damage-radius disc stays as the readout, and the aura still stops while he is stunned.
- **V06, the castle gun** (`fx/castleShotFx.ts`). A halo, a white core, a 6-mote trail and an impact burst around
  the S161 race ammunition, which is unchanged. Seeded by the seat and the fire tick. The dev lab gained `fx.enemy()`.
- Screenshots: `v04-*.png`, `v05-*.png`, `v06-*.png` in `.claude/plans/visuals/` and on the Desktop folder, with an
  `index.html` there that captions every pair.

### Frame time after all five effects (same 120-creature board, GPU, two runs)
| mode | avg ms | p50 | p95 | fx sprites live |
|---|---|---|---|---|
| legacy | 2.85 / 2.73 | 2.80 / 2.60 | 3.80 / 3.50 | 0 |
| new, HIGH | 3.00 / 3.14 | 2.80 / 3.00 | 3.90 / 4.10 | ~410 (top 360-368, ground 41) |
| new, LOW | 3.01 / 3.15 | 2.90 / 3.00 | 4.10 / 4.40 | ~410 |
That is +0.15 to +0.4 ms of CPU a frame, and the frame rate did not change (321-327 frames in 6 s in every mode).
The absolute numbers are lower than in STEP 2 because the machine was less loaded (11 worktrees share it); only the
paired legacy/new comparison in one run is meaningful.

### Bundle, final
**1014.7 KiB**, against the 983.0 KiB base: **+31.7 KiB** (⚠ over the +15 flag; bloom is 12.1 of it). Headroom is
85.3 KiB of 1100.

### Protocol
No wire, hash or sim change in any commit. **PROTOCOL_VERSION 54, no bump.**

### Not done / carried
- Every other item is QUEUED in `S192_VISUALS_PLAN.md` section 5 as dispatch-ready batches visuals-2 to visuals-5.
- `.tmp-gates/fx/` (the screenshot and perf Playwright scripts, gitignored) is the reusable harness for those batches:
  `npx playwright test --config .tmp-gates/fx/fx.config.ts`, with `FX_GPU=1` for a real GPU, `FX_OUT` / `FX_PERF_OUT`
  for the output and `FX_HQ=0` for LOW. ⚠ It is gitignored, so a new worktree will not have it. The merge owner may
  want to promote it to `scripts/fx/` (it needs the dev server on the worktree's port).
- The vitest run rewrites `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` with LF line endings
  (no content change) on every run. That is pre-existing, and it was reverted before each commit. Ruled benign: it
  is CRLF churn, not a snapshot change.

## FIX ROUND (independent audit, FIX FIRST)
- **V-1 (MED)** `d5584f3`: `auraFx` takes `cover` (`coverAlphaForPrim(anchor.id)`). Pool and ember alpha are scaled
  by it, and nothing is drawn below 0.02. `towerCover.test.ts` now counts the single `auraFx(` call (its last arg must
  be the cover alpha) and the 3 emits in `auraFx.ts` (each alpha must end in `* cover`). Both were mutation-checked
  red. Pure tests: cover 0 draws nothing, cover 0.5 gives exactly half alpha.
- **V-2 (LOW-MED)** `39e2808`: `fxTop` (still one roll-call entry at 20) is now a Container holding
  [`fxTopShade` (normal blend, no filter), `fxTopLight` (additive, bloomed)]. Blast smoke moved to shade. A guard says
  no normal-blend emit may appear on `top` in any layout (mutation-checked red). The "everything is light" comment
  is corrected.
- Screenshots re-taken: `pilot2-aura-fades-as-the-tower-finishes.png` (+0 / +30 / +60 / +125 ticks after a build,
  plus a finished tower) replaces `pilot2-building-aura-*`, and the `v04-*` blasts were re-shot on HIGH. The Desktop
  `index.html` is updated.
- Fix round gates after `git merge master` (merge `8ba5753`, clean, no conflicts; master brought only a script
  change to package.json, no dependency change): typecheck **0** · vitest **0** (466 files, 7195 passed,
  11 skipped) · build **0, 1032.3 KiB** (headroom 67.7 KiB; this branch's own share is still ≈ +31.7 KiB) ·
  e2e:gating **0 (70/70)** on this worktree's port 27203, with a server Playwright started itself after the
  pre-merge vite was stopped. PROTOCOL_VERSION is 56 (master's); this branch changes nothing under `src/net`,
  so **no bump**.
