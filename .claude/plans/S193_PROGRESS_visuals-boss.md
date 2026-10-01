# S193 · `s193/visuals-boss` (visuals-2) · progress

## FINAL REPORT
- **Tip:** the commit that adds this file, on top of merge `74a6aaa2`. Branch base was master `a638565b`. `git merge master` (`a28479a0`) went in **clean, with no conflicts** and no package or lockfile changes.
- **Gates, all run on the merged tree, each exit code captured to a file:**
  - typecheck **0**
  - vitest `--maxWorkers=3` **0**: 475 files passed (4 skipped); 7304 tests passed (11 skipped)
  - build **0**: entry **1047.0 KiB**, headroom 53.0 KiB
  - e2e:gating **0**: **70/70**, on this worktree's own port 27442 with a vite that Playwright started itself (nothing was listening on the port beforehand)
- **KiB delta: +11.1 KiB** (1045.8 against 1034.7, both measured on the pre-merge tree with only this branch's 6 source files reverted). Most of it is pixi's `DisplacementFilter` (GLSL+WGSL) plus the four layouts.
- **Protocol bump: NO.** Everything is render-only. Every sprite is a pure function of synced state (`world.tick`, entity id, `raRitualUntilTick`/`raStrikes`, the sim's `raColumnImpactTick`, `(tick+id) % KRAKEN_SONAR_INTERVAL_TICKS`, `nearestEnemyFor`, `stunnedUntilTick`). The branch adds no wire field, no hash field and no sim write, and touches nothing under `src/net` or `src/state`. Two builds that shake hands cannot disagree about anything either one computes.
- **What was built:**
  - **V09** `fx/raFx.ts`. The owner's strike art is unchanged. Code adds:
    - a telegraph glow pool and ring on the hitbox growth curve, with about 18 sand motes spiralling in;
    - an additive glow column and ground flare on the beam frames (from 48 ticks before impact to 30 after), bloomed on HIGH;
    - a white flash on the damage tick;
    - a 12-puff dust burst on SHADE (normal blend) plus 16 sand sparks;
    - the Pharaoh halo as a soft disc and ring with 6 orbiting sun motes. The far half of the orbit draws on GROUND, under his sprite; the near half draws on TOP.
    - The Graphics shade and outline (the exact hitbox) and the Ra aim circles are untouched.
  - **V10** `fx/sonarFx.ts`:
    - three body bands of water on GROUND;
    - 24 foam sprites (plus 12 cores) on the exact front, inside the sim's cone;
    - forward spray on TOP;
    - on HIGH, a **DisplacementFilter** ripple arc at the front.
  - **V15** `stunStars.ts`: additive twinkling glints (halo, two crossed spinning cores, a white centre) on the same orbit formula, which is now shared as `stunStarPos`.
  - **V17** `locustCloud.ts`: the same 22 motes as soft streaks along their motion, plus two turning haze puffs. They draw on SHADE because the swarm should look like dirt, not light. The orbit formula is shared as `locustMote`.
  - `?fx=legacy` and the unit suite still draw exactly the old Graphics.
- **Tests:** `src/render/fx/bossFx.test.ts` has 23 tests:
  - layout arithmetic against the sim's own numbers;
  - determinism;
  - REACH tests through the real `drawBossAuras` (a real ritual board and a real sonar board using `nearestEnemyFor`), `drawStunStars` and `drawLocustClouds`, with hooks installed the way `installFx` installs them;
  - a legacy-mode NEGATIVE for each.
  - Mutation-checked: 7 mutations each turned it red (sonar foam radius, telegraph curve, the Ra wiring position, the sonar wiring, the stun branch, the locust branch, and one earlier weak assertion that I then strengthened).
  - The existing `fxGuards.test.ts` (pure layouts, no Math.random, no normal blend on TOP) now covers raFx and sonarFx automatically.
- **Perf** (`.tmp-gates/fx/bench.spec.ts`, `__SPARK__.frameMs`, last 300 frames, GPU):
  - Worst-case board: 136 creatures, 3 Pharaoh rituals staggered, 8 Krakens firing 24 ticks apart, 20 stunned units, 3 locust clouds, and every S192 effect live.
  - Paired against legacy over 6 runs: HIGH **+0.25 / +0.41 / +0.73 / +0.87 / +1.88 / +1.96 ms**, **median +0.80**; LOW median +0.68. About 450 fx sprites are live.
  - The noise is large (8 worktrees share the machine; legacy alone ranged 3.7 to 5.1 ms). HIGH and LOW are within noise of each other, so the cost is CPU sprite count, not the filters.
  - By median the board is inside the +1.0 ms contract; two of six runs went over it.
- **Screenshots:** `C:\Users\onesh\OneDrive\Desktop\SPARK_Visuals_Pilot\visuals-2\`
  - 11 captioned BEFORE | AFTER-HIGH (| AFTER-LOW for the Ra and sonar shots) pairs plus `index.html`; the raw frames are in `raw\`.
  - Captured with headless Playwright on port 27442 using `page.clock` (paused clock, stepped to exact ticks), at deviceScaleFactor 2.
  - The harness is in `.tmp-gates/fx/`, which is gitignored: `fx.config.ts`, `boss.spec.ts`, `bench.spec.ts`. Scenes are set up through dynamic `import('/src/...')` of the live modules, so `fxLab.ts` needed no edit.

## MINE (owner questions, each with a recommendation)
1. Every Ra, sonar, star and locust look number is mine (sizes, counts, alphas). **Recommendation:** owner LOOK at `index.html`.
2. **Stun stars, legacy finding.** The legacy stars draw in the renderer's Graphics UNDER the sprites, so with today's atlases they are hidden inside the goblin art (see `v15-stun.png`, BEFORE).
   - The rebuilt stars draw on TOP and are lifted by `STUN_STARS_FX_HEAD_CLEAR = 22` × scaleMul, so a goblin's stars clear its head.
   - On the zombie BOSS they still sit at chest height, because the boss art is taller per scaleMul than a goblin's.
   - **Recommendation:** have the caller pass the sprite's real height. That is a `goblinRenderer.ts` change, outside this batch's file boundary.
3. The sonar foam and spray now draw over units (TOP) while the body stays on the ground. **Recommendation:** keep it; this is what makes the wave look like it carries them.

## Merge seams the merge owner must know
- **Additive substrate edits outside the brief's file list.** The plan's rule is "add a new export instead of changing one", and these follow it:
  - `emitter.ts`: `FxDisplaceSink` and `NULL_DISPLACE`.
  - `fxState.ts`: `setFxDisplaceHook` and `fxDisplace()`. This is a separate hook, so `FxHooks` is unchanged.
  - `fxRuntime.ts`: `FX_MAX_DISPLACE`, `FX_DISPLACE_CREST`, `fxDisplaceCount()`, a runtime-generated displacement map, and the pooled `DisplacementFilter`s.
  - One internal behaviour change: `applyShocks` now composes the shockwaves and the displacements into `groundArt.filters`. Its change key is `groundFilterKey`; `shockApplied` keeps its meaning for `fxStats`.
  - **visuals-3** (the SCORCHED GROUND heat shimmer) should REUSE `fxDisplace()` rather than reinvent it. Its map is currently baked to the sonar's ±60° wedge, so a different shape needs a new map.
- **The displacement map sprite** is a child of the GROUND fx layer's container, inside `spawnerZoneRenderer.root`, not of `fogHiddenLayer` or `groundLayer`. The `fog.spec.ts` roll call is unchanged, and e2e:gating is green.
- **Benign CRLF churn:** `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` gets rewritten to LF on every vitest run, with no content change. This is the same issue S192 recorded, and I reverted it before every commit.
- **Shared bundle headroom:** this branch adds +11.1 KiB, leaving 53.0 KiB on the merged tree.

## NOT DONE
- Promoting the `.tmp-gates/fx` harness to `scripts/fx/`. It is outside my file boundary; the merge owner can decide.
- In the no-art fallback (when the Ra sheet fails to load), the dust burst is cut short at +14 ticks, because `drawRaColumns` stops visiting a column there. This is cosmetic and only affects the fallback.

## Log
- step 0: worktree created from master a638565b, npm install exit 0.
- step 1: V09/V10/V15/V17 plus the additive displacement substrate; tc 0.
- step 2: bossFx.test.ts, 23 tests; mutation-checked.
- step 3: screenshots plus 3 bench rounds.
- step 4: merged master a28479a0 (clean); all gates green, as above.
