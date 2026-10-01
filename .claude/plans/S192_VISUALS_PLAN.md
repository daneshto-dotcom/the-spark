**STATUS: IN-PROGRESS: S192 `s192/visuals` built V01-V06 (the substrate, the 2-item pilot and the next 3), awaiting merge plus the owner's LOOK. Every other item is QUEUED in batches visuals-2 to visuals-5 (section 5).**

# S192 · SPARK VISUAL UPGRADE · the rework list

Owner, S192 (verbatim): *"I agree with option A, stay with the web stack and upgrade the visuals based on the
verdicts for Spark … I don't think we need to do skeletal animations though yet … predefine what else are we going
to rework to improve, not just Vlad Siphon … I want a list of everything that we're going to work and how it's going
to look."* Refinement, same session: *"we don't need to do all the visual upgrades. We can do a few. This session and
then cue all the other upgrades for the following sessions in their own work trees."*

Package approved live: `pixi-filters` **6.1.5** (MIT). It pulls one transitive package, `@types/gradient-parser`
0.1.5 (MIT, type declarations only, zero runtime bytes). No other package is added.

## 1 · How the list was built

The list comes from the source tree, not from memory:

- `find src/render -name '*.ts' ! -name '*.test.ts'` gives **123** render modules. `grep -l Graphics` gives **81**
  that draw code shapes.
- Each of the 81 was classified as one of three things: an **effect** (it goes on this list), a **readout/UI**
  (menus, panels, bars and telegraphs: it stays crisp code and gets at most a glow), or **archived** (canon section 1:
  `HAZARD_SPAWN_ENABLED` is permanently false, so seagulls, poop, potato, bombs and the rainbow flyover cannot happen.
  They are excluded).
- Before this branch, `src/` had **0** filters apart from `cinematicLumaKey`, **0** `blendMode: 'add'` (only
  `'erase'` in the fog), and **0** particle textures.
- `BOMB_EXPLODE` is one drawer with **six** producers: the lightning-hub blast (`potatoLifecycle.ts:570`), the zombie
  boss's 380 px death raze (`hostTick.ts:2444` → `STRUCTURE_SELFDESTRUCT`), the suicide goblin (`suicideBlast.ts:99`),
  the lightning drone (`droneLifecycle.ts:166`), the stink tower's death and its bag (`stinkTower.ts:144/241`), and
  `damage.ts:398`. That is why it ranks third.

## 2 · What stays art and what moves to code

| stays generated art (veo / atlas) | moves to code effects (particles + shaders, re-derived from synced state) |
|---|---|
| every character: goblins, bosses, Helga, Voltkin, gatherers, castle soldiers, bats, piranhas | every aura, siphon, beam, bolt, blast, cloud, glow and impact |
| every tower and castle atlas, and the damage-ramp sheets (hub, turret, Voltkin TV) | skill telegraphs and their juice (the telegraph geometry itself stays the sim's exact hitbox) |
| the Ra strike sheet (the owner preferred his art: *"it doesn't look good the way you did it with code"*). Code adds glow and bloom around it, never replaces it | racial perk visuals (Scorched Ground, BLOOD DEBT, rage, THE SWARM aura) |
| the corpse-eater feed rows | ground marks, the backdrop grade and fog-edge mist |

⛔ **No more veo clips for effects.** A veo effect cannot react to game state, costs about $20 a clip (owner measured)
and ships as megabytes of PNG. A code effect is a few KiB, tracks the sim exactly, and looks the same on every screen.

⛔ **No skeletal animation** (owner: *"not yet"*). Spine and DragonBones are out of scope.

## 3 · The substrate every item uses (V01, built on this branch)

| piece | file | what it is |
|---|---|---|
| deterministic emitter | `src/render/fx/emitter.ts` | `fxHash(seed, a, b)` integer hash → [0,1). A particle is a **pure function of (seed, birth tick, index, now tick)**. Nothing is stored between frames, so host, joiner and replay draw the same motes. No `Math.random`, no wall clock |
| soft textures | `src/render/fx/softTextures.ts` | radial-gradient canvas sprites generated at runtime (soft dot, hot core, ring, streak, smoke puff). **No downloaded assets**, so there is no licence question (section 7) |
| sprite pool + layer | `src/render/fx/fxLayer.ts` | one pooled-Sprite `Container` per host layer, additive blend. Sprites are reused every frame, never allocated per particle |
| quality setting | `src/render/fx/fxQuality.ts` + Settings row **"High-quality effects"** | HIGH = bloom + shockwave filters; LOW = additive particles only. Read like the other display prefs (localStorage, try/caught, never on the wire) |
| legacy switch | `?fx=legacy` (or `__SPARK__.fx.setLegacy(true)` in dev) | draws every rebuilt effect the old way, for side-by-side comparison |
| guard | `src/render/fx/fxGuards.test.ts` | a mechanical source guard: no `Math.random(` anywhere in `src/render/**` except two non-effect allow-listed files (arcade run id, sudoku menu sparkle) |

Filters used (from `pixi-filters`, subpath imports so only these ship): `AdvancedBloomFilter` (one, on the fx layer,
HIGH only) and `ShockwaveFilter` (on the ground layer, only while a blast is live, HIGH only).

## 4 · The ranked list: visual gain per hour

Effort: S = under 2 h, M = half a day, L = a day or more. "Perf" is the per-frame cost at a 120-creature wave-5
fight. Bloom is one full-layer pass on HIGH and nothing on LOW.

| rank | id | effect | today (file:line) | after | effort | perf | status |
|---|---|---|---|---|---|---|---|
| 0 | V01 | **FX substrate** | none | section 3 | M | pooled sprites; one bloom pass on HIGH | ✅ BUILT |
| 1 | V02 | **Vlad's life siphon** | `bossAuras.ts:583-613`: one growing circle and 18 solid 3.4 px dots sliding inward | ~110 crimson motes on 3 spiral arms that converge on his chest with stretched streak trails, additive; a pulsing hot core; a dark-red ground stain; at the heal moment a burst ring, 24 outward sparks and a ground **ShockwaveFilter** ripple (HIGH); bloom on | M | ~110 sprites while the 0.6 s flash lasts; 0 otherwise | ✅ PILOT |
| 2 | V03 | **Building aura** behind every spawner and tower | `spawnerZoneRenderer.ts:156-211`: a 6-11 % disc, three 2 px rings, bond strokes, midpoint beads and a core dot | owner-tinted **ground light pool** (soft additive disc that breathes) plus 14-28 slow **rising embers** around the footprint and a faint base rim. ⛔ No rings, bond strokes or core dot. ⛔ Audit V-1: every alpha is scaled by the cover alpha, so like the old aura it shows while a tower is being built or crumbling and fades out under a finished building (S183) | M | ~20 sprites a tower | ✅ PILOT |
| 3 | V04 | **Detonations** (hub blast, zombie death raze, suicide goblin, drone, stink tower) | `effects/bombExplode.ts:17-35`: one orange stroke ring and one flat disc | white-hot flash sprite (2 frames), fireball core, 28 ember sparks thrown outward with gravity, 8 dark smoke puffs rising, a soft shock ring at the true radius, and a ground **ShockwaveFilter** on HIGH. Size scales with `radius` (70 px goblin → 380 px zombie) | M | ~40 sprites per blast for 0.6 s | ✅ BUILT |
| 4 | V05 | **Zombie rot aura** | `bossAuras.ts:453-474`: 14 flat green circles over a dark disc | soft textured bubbles that swell and **pop into 3 droplets**, plus 10 rising green miasma wisps, additive, over the same dark scorch; still stops while he is stunned | S | ~40 sprites a boss | ✅ BUILT |
| 5 | V06 | **Castle gun shot** | `raceMotifs.ts:285`: a flat bolt | race-coloured bolt: hot white core, soft glow halo, 6-mote trail, and an impact spark burst on arrival | S | ~12 sprites a shot | ✅ BUILT |
| 6 | V07 | **Lightning**: Voltkin arc, laser turret, drone cloud, lightning hub | `effects/arcFlash.ts:135`, `turretRenderer.ts:170`, `creatureRenderer.ts:767` | each arc drawn twice (a wide soft additive glow stroke plus a thin white core), endpoint spark bursts, a flicker keyed to the tick, and bloom | M | strokes plus ~10 sprites | QUEUED visuals-4 |
| 7 | V08 | **Damage and heal numbers** | `damageNumbers.ts:400-500` (Text floaters) | pop-in scale (0.6→1.15→1), big hits shake 2 px, heals rise green with 3 sparkle motes; stays crisp text | S | none | QUEUED visuals-4 |
| 8 | V09 | **Ra columns, telegraph and Pharaoh halo** | `bossAuras.ts:306-379` (telegraph), `:180` (halo) | the art strike stays. Add: a telegraph ring with sand motes spiralling in as it grows, an additive glow plus bloom on the beam frames, an impact dust burst, and a halo built as a soft additive disc with 6 orbiting sun motes | M | ~30 sprites a column | QUEUED visuals-2 |
| 9 | V10 | **Kraken sonar wave** | `bossAuras.ts:490-542`: 4 stroked arcs | heavy water crescent: foam particles along the leading edge, spray droplets thrown forward, and a **DisplacementFilter** ripple on HIGH | M | ~50 sprites while the wave travels | QUEUED visuals-2 |
| 10 | V11 | **BLOOD DEBT / CRIMSON TIDE lifesteal** | no visual; only a green heal number (`damageNumbers.ts:439`) | 3-6 crimson motes fly from the victim to the attacker on each heal, derived from the rise in synced `healedFifths` (no new field) | S-M | ≤ 6 sprites a heal | QUEUED visuals-3 |
| 11 | V12 | **SCORCHED GROUND** | `zoneBackgroundRenderer.ts:79-88`: a flat multiply tint | the tint stays, plus drifting embers across the zone, a heat-shimmer **DisplacementFilter** (HIGH), and small burn flickers on the enemy creatures it is burning | M | ~40 sprites a zone | QUEUED visuals-3 |
| 12 | V13 | **Arrows and harpoons** | `creatureProjectile.ts:214-342` | a soft motion trail (4 fading streak sprites) and an impact puff | S | ~5 sprites a projectile | QUEUED visuals-4 |
| 13 | V14 | **Rage (Warlord, BLOOD FRENZY)** | `goblinRenderer.ts:279-300`: a red sprite tint | the tint stays, plus a red additive ember aura under the unit and rising heat sparks | S | ~6 sprites a raging unit | QUEUED visuals-3 |
| 14 | V15 | **Stun stars** | `stunStars.ts:63` | additive star sprites with a twinkle and a soft halo | S | ~4 sprites | QUEUED visuals-2 |
| 15 | V16 | **Stink cloud and lob** | `stinkCloudRenderer.ts:190`, `stinkTowerRenderer.ts:286` | rotating soft smoke puffs (procedural puff texture, sickly tint), and a puff trail behind the lob | S | ~12 sprites a cloud | QUEUED visuals-5 |
| 16 | V17 | **Locust cloud** | `locustCloud.ts:82` | motes become soft sprites stretched along their motion | S | same count | QUEUED visuals-2 |
| 17 | V18 | **Corpse Eater feed** | atlas rows (`goblinRenderer.ts:990-1008`) | the art stays, plus a green-crimson stream of motes into him while he feeds | S | ~20 sprites | QUEUED visuals-3 |
| 18 | V19 | **DEEP CURRENT teleport** | `gathererRenderer.ts:502`: three stroked arcs | a water vortex of spiralling droplets and a splash ring at both ends | S | ~20 sprites for 0.5 s | QUEUED visuals-3 |
| 19 | V20 | **Build juice**: bond commit, sever, structure grow and merge, score tier | `effects/bondCommit.ts:28`, `severErase.ts:10`, `structureGrow.ts:18`, `structureMerge.ts:16`, `scoreTier.ts:19` | soft additive rings and small spark pops in the owner's colour | S each | ≤ 12 sprites each | QUEUED visuals-5 |
| 20 | V21 | **THE SWARM / APEX PREDATOR elite aura** | atlas (`goblinRenderer.ts:114-134`) | a faint additive under-glow in the race colour so an elite reads as elite | S | 1 sprite a unit | QUEUED visuals-3 |
| 21 | V22 | **HELLSPAWN split** | `chewerRenderer.ts:268`: tint placeholder | a hellfire burst (12 sparks plus a flash) at each split | S | 13 sprites for 0.3 s | QUEUED visuals-3 |
| 22 | V23 | **Chew bite, Helga slap, raided cloud** | `effects/chewBite.ts:28`, `princessRenderer.ts:334`, `effects/raided.ts:43` | debris particles and a soft impact flash | S | ≤ 10 sprites | QUEUED visuals-4 (bite, slap) / visuals-5 (raided) |
| 23 | V24 | **Ground decals and race ground** | `groundDecalRenderer.ts:96`, `raceGround.ts:99` | procedural noise-textured soft stains in place of flat fills | M | static | QUEUED visuals-5 |
| 24 | V25 | **Free sparks** | `renderer.ts`, `sparkGlyph.ts:22` | a soft additive glow pulse behind each spark | S | 1 sprite a spark | QUEUED visuals-5 |
| 25 | V26 | **Backdrop grade** | `zoneBackgroundRenderer.ts:465` | a per-race colour grade (AdjustmentFilter) and a soft vignette | M | one filter pass | QUEUED visuals-3 |
| 26 | V27 | **Fog edge mist** | `fogRenderer.ts:535` (soft erase brush) | slow-drifting mist sprites along the vision edge | L | ~60 sprites | QUEUED visuals-5 |
| 27 | V28 | **Health bars** (readout) | `healthBar.ts:510` | a trailing "ghost" segment that drains after a hit; the bar itself stays crisp | S | none | QUEUED visuals-5 |

**Kept as code readouts, no rework:** menus, panels, codex, lobby, title, footer, character sheet, draft, castle
panel, drag preview (`dragPreviewRenderer.ts`), keystone telegraph, blueprint ghost and glyph, Ra aim circles (the
promise of the sim's exact hitbox), bond silhouettes (structure state), procedural puppet fallbacks (goblin, chewer,
avatar, Helga: shown only when an atlas fails to load).

**Archived, excluded (canon section 1):** `bombRenderer.ts`, `potatoRenderer.ts`, `seagullRenderer.ts`,
`poopRenderer.ts`, `rainbowRenderer.ts`, `rainbowFlyoverRenderer.ts`, `hunterRenderer.ts`, `hazardRing.ts`.

## 5 · Queued worktree batches: dispatch-ready, file sets disjoint

Each batch builds on the V01 substrate and adds only **new** `src/render/fx/*.ts` files. The substrate API
(`fxHash`, `fxParticle`, `FxLayer`, `softTexture`, `fxQuality`) is frozen once this branch merges, and a batch that
needs more adds a new export instead of changing an existing one. Every batch has the same rules as this one:
render-only, re-derived from synced state, no `Math.random`, `?fx=legacy` keeps the old look, screenshots before
and after, gates after every commit, no protocol bump.

| batch | branch | items | files it may touch (disjoint from the other batches) |
|---|---|---|---|
| **visuals-2: boss skills** | `s19x/visuals-boss` | V09 Ra telegraph and halo, V10 Kraken sonar, V15 stun stars, V17 locust cloud | `bossAuras.ts` (only `drawRaColumns`, `drawRaRitual` halo and `drawSonarWave`), `stunStars.ts`, `locustCloud.ts`, new `fx/raFx.ts`, `fx/sonarFx.ts` |
| **visuals-3: racial perks** | `s19x/visuals-racial` | V11 BLOOD DEBT, V12 SCORCHED GROUND, V14 rage, V18 corpse eater, V19 DEEP CURRENT, V21 elite aura, V22 HELLSPAWN, V26 backdrop grade | `zoneBackgroundRenderer.ts`, `goblinRenderer.ts`, `gathererRenderer.ts` (only `drawDeepCurrentVortices`), `chewerRenderer.ts`, new `fx/perkFx.ts` |
| **visuals-4: combat feedback** | `s19x/visuals-combat` | V07 lightning, V08 numbers, V13 projectiles, V23 bite and slap | `effects/arcFlash.ts`, `turretRenderer.ts`, `creatureRenderer.ts`, `voltkinTowerRenderer.ts`, `damageNumbers.ts`, `creatureProjectile.ts`, `effects/chewBite.ts`, `princessRenderer.ts`, new `fx/lightningFx.ts` |
| **visuals-5: board and build** | `s19x/visuals-board` | V16 stink, V20 build juice, V23 raided, V24 decals, V25 sparks, V27 fog mist, V28 health ghost | `stinkCloudRenderer.ts`, `stinkTowerRenderer.ts`, `effects/{bondCommit,severErase,structureGrow,structureMerge,scoreTier,raided}.ts`, `groundDecalRenderer.ts`, `raceGround.ts`, `renderer.ts`, `sparkGlyph.ts`, `fogRenderer.ts`, `healthBar.ts` |

⚠ Two hazards the merge owner must know about:
1. `gathererRenderer.ts` is in visuals-3 (vortex), but this branch has already touched it for V06 (the castle shot).
   Visuals-3 must branch from master **after** this one lands.
2. Any batch that adds a child to `fogHiddenLayer` or `groundLayer` must update `e2e/fog.spec.ts`'s roll call in the
   same commit. This branch adds `fxTopLayer` as the LAST child of `fogHiddenLayer` (index 20), so indices 6 and 11
   (`tower-art.spec.ts`) do not move.

## 6 · Performance contract (measured: see `S192_PROGRESS_visuals.md`. After V01-V06, +0.15 to +0.4 ms CPU a frame, frame rate unchanged)

Measured with the dev seam `__SPARK__.fx.bench(n)`: it spawns n creatures in FIGHT, then times
`app.renderer.render` plus the renderer syncs over 300 frames in headless Chromium. Numbers are in
`S192_PROGRESS_visuals.md`. Rule: no more than +1.0 ms average frame time on HIGH at 120 creatures with every new
effect live, and no measurable cost on LOW. If bloom breaks the budget, HIGH stays opt-in.

## 7 · Asset licences

No external image assets are used. Every particle texture is drawn at runtime from canvas radial gradients
(`softTextures.ts`), so there is nothing to license. I did not fetch the Kenney CC0 pack: procedural textures cover
every item on this list, and they keep the bundle flat. If a later batch wants Kenney textures, they are CC0 and
nothing needs recording beyond the source URL.
