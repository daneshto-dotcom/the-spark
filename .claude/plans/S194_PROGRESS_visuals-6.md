# S194 · `s194/visuals-6` (T4) · progress

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
