# S196 PROGRESS — tower-fx (branch s196/tower-fx)

## NEXT STEP (exact)
- DONE: drawers, wiring, unit+e2e-reach tests, captures (Desktop/SPARK_S196_TowerFx + README), bench x2, merged master 9ddf5027. NOW: gates (typecheck, vitest full detached -> .tmp-gates/vitest.*, build, e2e:gating, e2e:render), then final report.
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

## DESIGN — the signature per tower (`src/render/fx/towerSignatureFx.ts`, every look MINE)
| tower | idle (always alive) | flare (derived from synced state) |
|---|---|---|
| goblin tower | forge mouth glows + flickers, sparks spit up and arc down, embers + smoke off the top | a goblin born (`spawnedAtTick`+`sourceSpawnerId`) → spark burst + flash |
| laser turret | charging energy core at the gun head: glow + hum speeding up with the charge (`nextFireTick`), charge ring tightening, 3 orbiting motes, energy drawn in past 35 % | FIRE (`state`/`ticksInState`) → white flash + shock ring |
| pentagram | a five-point star on the ground, turning, rune flames on its points, embers rising | chewer born → pillar of fire |
| Helga's hall | lanterns + door hearth flicker, golden motes, beer-foam bubbles, chimney smoke | Helga FIRE (slap) → golden horn-call ring + sparkle burst |
| stink tower | green fumes curling off the vat + toxic sheen, bubbles swelling/popping at the rim | WINDUP thickens the fumes; FIRE → a burp of gas |
| lightning hub | `hubArcFx` (S194) — unchanged, now dispatched through the same table | — |
| Voltkin TV | live screen: glow, snow, rolling scanline, a stray arc every 90 ticks (steady rows only) | (emergence/death crackle already existed) |
| t3 race towers | motif at the crown (per-race/tier crown height): vampires glowing bats + blood mist · nagas fountain + spout + ripples · mummies sand helix + scarab glints · zombies boiling bubbles + drips · orcs brazier flames + embers + smoke · demons hellfire up the walls + soul wisps | unit born → race-coloured burst |
| t9 boss towers | the same motif ×1.35 over a BOSS SEAL: two ground rings, 8 turning glyphs, a beating pillar, a heartbeat ripple | boss released → burst + seal flare |

## Log
- boot: branch from master c8239570; progress file created; npm install exit 0.
- inventory written.
