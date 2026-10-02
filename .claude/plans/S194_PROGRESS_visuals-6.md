# S194 · `s194/visuals-6` (T4) · progress

## PAUSED (owner session limit) — EXACT NEXT STEP
- DONE + committed: (a2) shared build/destroy sparkle for every cover group (laser turret etc.), tests + mutations killed; (a) per-race background `fx/towerBackdropFx.ts` wired in the groundDecalRenderer fx path, tests `fx/towerBackdrop.test.ts` (30 pass) + V24 source test re-pointed.
- HALF-DONE: none mid-edit. Backdrop numbers tuned once from screenshots only.
- NEXT: (1) mutation-check the backdrop reach (drop the foot lookup -> foot test red); (2) (c) lightning-hub arc fx: new `fx/hubArcFx.ts` (glow stroke + white core + endpoint sparks via lightningFx boltGlowFx/lightningPath/lightningSparksFx), drawn from the spawnerZoneRenderer fx path for spawners with recipeId 'lightningHub', anchored on towerFootForPrim(anchor); (3) (b) V28 health-bar ghost in healthBar.ts (keyed ghost memory, hold then drain on world.tick, fx-active only); (4) after-screenshots all races HIGH + LOW + legacy into .tmp-gates/fx, copy after-shots to C:/Users/onesh/OneDrive/Desktop/SPARK_S194_TowerBackgrounds/; (5) bench HIGH/LOW vs master (harness .tmp-gates/fx, port 33494); (6) full gates + e2e:gating on own port; final report.
- Last gates: typecheck 0 (after backdrop wiring); vitest subsets: src/render/fx + towerCover + spawnerZone 0 (177 tests); towerBackdrop + groundStainFx 0. Full vitest / build / e2e NOT yet run.
- Harness: .tmp-gates/fx/towers.spec.ts + fx.config.ts (port 33494) + zoom.py; master HIGH shots in .tmp-gates/fx/before, first after shots in .tmp-gates/fx/a1.
- No background process running (playwright webServer exits with its run; port 33494 not listening).

## FINAL REPORT
(pending)

## Scope
(a) per-race tower BACKGROUND wrapping the footprint (replaces V03 aura pool/embers + S185 race-ground motifs on the fx path);
(a2) owner scope addition: ONE shared build/destroy sparkle for EVERY tower kind whose connectors fade (keyed off towerCover);
(b) V28 health-bar ghost; (c) lightning-hub arc fx (no hub arc drawer exists today — new).
Boundary: spawnerZoneRenderer.ts, raceGround.ts, groundDecalRenderer.ts, healthBar.ts, hub renderer, NEW src/render/fx/*.

## Log
- step 0: worktree from master 0a37175e; `git merge master` = already up to date; npm install exit 0.
  Findings: race colours zombies 0x44ff5e, demons 0xd73bff (VIOLET fire — owner S185), vampires 0xff3b6b, mummies 0xffe23b, orcs 0xff8c1a, nagas 0x3bd7ff.
  Build sparkle today = auraFx embers (×cover) + legacy bond strokes/beads (×bondCover) in spawnerZoneRenderer — SPAWNERS ONLY; defenders that mark cover (laser turret, Helga via structureRampRenderer; stink tower) get none. Confirms the merge-owner hypothesis.
  No lightning-hub arc drawer exists anywhere (S193 visuals-combat note) — (c) is a new effect.
  `__SPARK__.fx.bench(n)` does not exist; bench = S193 harness (horde(120) + frameMs over 300 frames).

## NEXT STEP
- before screenshots harness in .tmp-gates/fx (port hashed from cwd), all six race towers + laser turret + hub + stink.
- step 1+2 (a2 sparkle): towerCover.ts group registry (markTowerCover 4th arg `foot`, forEachTowerCoverGroup, towerFootForPrim; groups pruned after REVEAL+90 ticks or when tick goes backwards); the 4 publishers pass the sprite foot (one-line edits in towerRenderer / structureRampRenderer / voltkinTowerRenderer / stinkTowerRenderer — MERGE SEAM: outside my listed boundary, coordinator-requested). New fx/towerSparkleFx.ts; spawnerZoneRenderer fx path = sparkle for EVERY cover group (legacy path unchanged). towerCover.test S192 aura pin re-pointed at the sparkle. fx/towerSparkle.test.ts: group unit tests, census of every markTowerCover caller (must pass a foot), REACH via SpawnerZoneRenderer.sync for a defender group with NO spawner in the world (the laser-turret bug) + finished-tower/never-published/legacy negatives + destroy sparkle. Mutations (spawner-only early return; stink foot dropped) → 4 red.
- step 3 WIP: fx/towerBackdropFx.ts (six races) wired in groundDecalRenderer fx path (stain/flat body re-centred on the published foot; S185 motifs → legacy only); raceGround drawRaceBase/baseOnly for LOW. First screenshots look right (pool at the base, wraps). NEXT: backdrop tests, then hub arcs, then V28.
- step 4 (c): fx/hubArcFx.ts (crown crackle + a discharge every 50 ticks: crown→ground bolts, V07 glow/sheath/core + landing sparks), drawn from spawnerZoneRenderer fx path for lightningHub spawners with a published foot. hubArc.test.ts 9 pass; mutation (drop the call) red. Backdrop foot mutation red. NEXT: V28 health ghost.
