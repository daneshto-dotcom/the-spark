# S196 PROGRESS — tower-fx (branch s196/tower-fx)

## NEXT STEP (exact)
- FIX ROUND: code+tests DONE (HIGH-1, MED-1, LOW-1; mutations M4/M5/M6 caught), README fixed, merged master dfbb5cb5. NOW: recapture (.tmp-gates/fx/final2.sh) -> deliver.py into Desktop, then gates (.tmp-gates/finalgates.sh), then fix-round report.

## FINAL REPORT
- Merges: master c8239570 → 9ddf5027 (plans only) → 7e9d241c (board-look: matchBoardLayout + its test). No conflicts.
- Gates on the merged tree (exit codes from files, `.tmp-gates/final-*.exit`): typecheck **0** · vitest **0**
  (617 files / 9285 passed, 14 skipped) · build **0** · e2e:gating **0** (67 passed) · e2e:render **0** (10 passed).
- Entry: **1249.6 KiB / 1350**. Boot was 1235.5 → **+14.1 KiB**, all mine (`towerSignatureFx.ts` measures 13.6 KiB
  minified on its own with esbuild).
- Bump verdict: **NONE.** Render-only. No sim, wire, hash or serialize change. Every input it reads is already
  synced (creature `spawnedAtTick`/`sourceSpawnerId`, defender `state`/`ticksInState`/`nextFireTick`, the cover foot).
  Two builds that shake hands compute the same sim.
- Per-tier frame cost, interleaved ON/OFF. Board: 10 towers covering every kind (orc seat), 140 creatures.
  The OFF state empties `TOWER_SIGNATURE` at runtime, which equals master for the record towers.

  | tier | run 1 Δmean | run 2 Δmean (6 rounds) | sprites ON / OFF |
  |---|---|---|---|
  | HIGH | +0.74 ms | +0.38 ms | ~575 / ~262 |
  | LOW | +1.16 ms (p95 noise) | +0.58 ms | ~277 / ~122 |
  | MINIMAL | −1.2 (noise) | +0.19 (noise) | 0 / 0 (draws nothing) |

  Inside the owner's 1.4 ms. The machine was shared with 7 trees, so run 2 is the steadier one.
- Screenshots: `C:/Users/onesh/OneDrive/Desktop/SPARK_S196_TowerFx/` holds a README, 12 boards at 1920×1080
  (6 races × idle/acting), and per tower (19) a 2× close-up, an ACTING close-up and a 16-frame moving GIF. It also
  has a BEFORE board (master: no signatures, but the new TV static still draws) and a MINIMAL/legacy board.
- Tests: `fx/towerSignature.test.ts` (57) covers:
  - census: every `ALL_BLUEPRINT_IDS` id has a signature; `Record<GodlyId,…>` also makes tsc refuse a new id without one;
  - per kind: deterministic, alive, LOW lighter, no normal blend on the bloomed layer, flare on act, charge;
  - REACH through the real `SpawnerZoneRenderer.sync` for all 18 record towers;
  - negatives: no foot, MINIMAL/legacy, enemy in fog (spawner + defender);
  - flare read off synced births and the FSM;
  - charge continuity.

  `towerSignatureReach.test.ts` (8) builds towers through the real reducer, matcher and host tick. The real
  publisher draws them, and the exact expected sprite set must reach the frame. Covered: laser, helga, stink,
  goblin, pentagram, hub, a tier-3, and the Voltkin TV (+ its legacy negative).
- Mutations run by hand, all caught: M1 the spawner flare ignores births · M2 the spawner fog gate is dropped ·
  M3 the defender fog gate is dropped. The file was restored each time and status was clean.
- Self-audit fix: the defender charge restarted at 0 at the WINDUP, so the stink fumes thinned abruptly at the
  throw. It is now continuous, and a test pins it.
- Merge seams:
  - `spawnerZoneRenderer.ts`: `syncHubArcs` is replaced by `syncTowerSignatures`, and the hub is one row of the table.
  - `voltkinTowerRenderer.ts`: one block in its fx branch.
  - No shared infrastructure touched (no matchBoard*, arcade, sim).
- ⚠ Local capture caveat: vite ignores `**/.claude/**`, so a worktree dev server serves STALE code after an edit
  until it restarts (`.tmp-gates/fx/restart-vite.sh`). It cost one capture round here.

### MINE (owner LOOK items, one line each, with a recommendation)
1. Every look, colour, size and timing in `towerSignatureFx.ts`. Recommend: approve as shipped and overrule per
   tower from the GIFs.
2. Laser core glow size (0.5–0.85 × art width): bold, and may wash the gun. Recommend: keep, trim if he says so.
3. Per-race/tier crown heights (`RACE_CROWN_FRAC`), measured by eye off the art. Recommend: keep.
4. Flare length 36 ticks (`TOWER_SIG_FLARE_TICKS`). Recommend: keep.
5. Helga's flare plays at her HALL when she slaps (she may be far away). Recommend: keep, since it reads as the
   hall cheering.
6. The pentagram fire is red even on a demon seat, where the building is tinted violet. Recommend: ask whether
   it should follow the tint.
7. The size unit `sigUnit` = max(1, artH/90). Recommend: keep.

### NOT DONE
- The castle keep has no signature: it is not a GodlyId/buildable tower, and its renderer is outside this file
  boundary. Recommend: a follow-up if he wants it.
- Bench coverage: one race's motif on the board (orcs, the heaviest). The other five races were not benched.
  Their counts are equal or lower by construction.
- The t9 boss towers release and crumble after 300 ticks in a real match. For the capture and the bench I held
  `nextSpawnTick` via a dev lever.

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
| goblin tower | forge mouth glows + flickers, sparks spit up and arc down, embers + smoke off the top | a goblin born (first frame it is SEEN with this `sourceSpawnerId` — HIGH-1) → spark burst + flash |
| laser turret | charging energy core at the gun head: glow + hum speeding up with the charge (`nextFireTick`), charge ring tightening, 3 orbiting motes, energy drawn in past 35 % | FIRE (`state`/`ticksInState`) → white flash + shock ring |
| pentagram | a five-point star on the ground, turning, rune flames on its points, embers rising | chewer born → pillar of fire |
| Helga's hall | lanterns + door hearth flicker, golden motes, beer-foam bubbles, chimney smoke | Helga FIRE (slap) → golden horn-call ring + sparkle burst |
| stink tower | green fumes curling off the vat + toxic sheen, bubbles swelling/popping at the rim | WINDUP thickens the fumes; FIRE → a burp of gas |
| lightning hub | `hubArcFx` (S194) — unchanged, now dispatched through the same table | — |
| Voltkin TV | live screen: glow, snow, rolling scanline, a stray arc every 90 ticks (steady rows only) | (emergence/death crackle already existed) |
| t3 race towers | motif at the crown (per-race/tier crown height): vampires glowing bats + blood mist · nagas fountain + spout + ripples · mummies sand helix + scarab glints · zombies boiling bubbles + drips · orcs brazier flames + embers + smoke · demons hellfire up the walls + soul wisps | unit born → race-coloured burst |
| t9 boss towers | the same motif ×1.35 over a BOSS SEAL: two ground rings, 8 turning glyphs, a beating pillar, a heartbeat ripple | NONE (audit MED-1: no synced release moment) |

## Log
- boot: branch from master c8239570; progress file created; npm install exit 0.
- inventory written.
