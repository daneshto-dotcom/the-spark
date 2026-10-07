# S196 PROGRESS — tower-fx (branch s196/tower-fx)

## NEXT STEP (exact)
- DONE drawers + wiring (spawnerZoneRenderer.syncTowerSignatures, TV in voltkinTowerRenderer); tsc 0. NOW: write src/render/fx/towerSignature.test.ts (pure + REACH + negatives + census), run hubArc/fxGuards tests.
  then wire `SpawnerZoneRenderer.syncTowerSignatures` (fx path; replaces syncHubArcs) + the TV idle static in
  `voltkinTowerRenderer` fx block; then tests `towerSignature.test.ts`.

## INVENTORY (verified against the tree, S196)
All 19 `GodlyId`s. "Drawn by" = the renderer that commits the building sprite + publishes the cover foot.
Existing fx for EVERY one: the build/destroy sparkle (`towerSparkleFx`, transient, 0 on a standing tower).

| tower | GodlyId | record | building drawn by | fx before S196 | what it DOES (synced signal the flare reads) |
|---|---|---|---|---|---|
| goblin tower | goblinTower | spawner | StructureRampRenderer (ramp) | sparkle only | makes goblins when fed (creature `sourceSpawnerId`+`spawnedAtTick`, both on the wire) |
| laser turret | laserTurret | defender `turret` | StructureRampRenderer | sparkle; beam bolt on FIRE (turretRenderer) | shoots creatures, 420 range (`state` FIRE/RECOVER/WINDUP, `ticksInState`, `nextFireTick` — all on the wire) |
| pentagram | pentagram | spawner | StructureRampRenderer (demon tint) | sparkle only | spawns pencil chewers (creature birth) |
| Helga's hall | helga | defender `princess` | StructureRampRenderer (hall) + princessRenderer (Helga unit) | sparkle; slap impact on FIRE | Helga slaps units (`state` FIRE) |
| stink tower | stinkTower | defender `stinkTower` | StinkTowerRenderer (no ramp sheet yet) | sparkle; lob contrail + cloud smoke | lobs stink bags, 260 range (`state` WINDUP 20t / FIRE) |
| lightning hub | lightningHub | spawner | StructureRampRenderer | sparkle; **hubArcFx (S194) — the reference** | emits suicide drones every 300t (creature birth) |
| Voltkin TV | voltkin | none (cinematic chain, `findAllVoltkinChains`) | VoltkinTowerRenderer | sparkle; tvCrackle ONLY while emerging/dying | summons Voltkin (emergence row) |
| 6× tier-3 race towers (bat/piranha/scarab/hound/warband/souleater) | t3Tower* | spawner | TowerRenderer | sparkle; per-race BACKDROP (`towerBackdropFx`, ground motif, via groundDecalRenderer) | emit the race's t3 unit every 900t when fed (creature birth) |
| 6× tier-9 boss towers | t9Tower* | spawner | TowerRenderer | sparkle; race backdrop | release ONE boss after 300t, then crumble (creature birth) |
| castle keep | — (not a GodlyId) | player | castle renderer (outside file boundary) | castleShotFx | gun every 4 s — NOT in scope (not a tower, not in my file set) |

## Log
- boot: branch from master c8239570; progress file created; npm install exit 0.
- inventory written.
