# S193 — PROGRESS, branch `s193/playtest3` (worktree `.claude/worktrees/s193-playtest3`)

Base: origin/master 2cd00502 (deploy #21, PROTOCOL 59). Brief: P3-1 castle keep-out asymmetry, P3-2 creature nearest-enemy targeting.

## NEXT STEP
Implement P3-2 fix (structureTargets → nearest strict bond, no spread; move reference fixture first), then P3-1.

Merged local `master` af4ab269 (s192/magic + PROTOCOL 60) at a30dee5d — no conflicts, lockfile unchanged.

## P3-1 RESEARCH — VERDICT: THE PORCH DISCS. They sit SOUTH, so the keep-out is a 61 disc + a 108-deep south lobe.

Probe: `src/state/zz_probeP31.test.ts` (scratch, deleted before merge) — real 4P `START_GAME`, BUILD phase, a stamp walked out
along 8 rays from each castle anchor through the real `stampRefusalAt` (= host reducer `blueprintBuild.ts:264`, client ghost
`blueprintGhost.ts:90`, click gate `controls.ts:1390`, bots `botBrain.ts:338` — ONE function), refusal printed per step.

| stamp | seat 0/1 (top castles) E/W gap | S gap | single shape (`canBuildAt`) E / S / SE |
|---|---:|---:|---:|
| laser turret (box ±50.1 × ±56) | **73.9** | **108.0** | 61 / **105** / 112 |
| goblin tower (±56 × ±56) | 74.0 | 108.0 | |
| stink tower (±50.1 × −56/+34) | 61.9 | 108.0 | |
| bottom castles (seat 2/3) N gap | 61.0 | (S is off-screen) | |

"gap" = distance from the castle anchor to the nearest point of the stamp's footprint box at the first legal centre.
- The disc of `CASTLE_NO_BUILD_RADIUS` 61 is symmetric. The 4 porch slots sit at anchor + (±15|±45, **+74**), each with a
  `CASTLE_PORCH_KEEP_OUT_RADIUS` 34 disc → the south keep-out reaches 74 + 34 = **108**. That is the whole asymmetry.
- Even the EAST gap of a TALL tower (73.9 not 61) is the porch: the outer slot (x+45, y+74) is 18 px below a 112-tall box's
  foot, so the box must clear it horizontally by 28.8 → 73.9. The stink tower (short foot, +34) gets the real 61.9.
- Ruled out: keep box (symmetric, inside 61); edge rule (only N/W of the top castles — off screen, not his report); footer
  plates (y ≥ 996, bottom castles only); zone boundary (seat-0 zone ends at y 540, x 960 — far); unit-emit ring (46, inside 61);
  footprint asymmetry (laser turret/goblin tower are vertically symmetric; stink tower's makes S EASIER, not harder).
- The porch also hosts the gatherer deposit/spawn (`GATHERER_DEPOSIT_OFFSET_Y` 74) — same south spot.

## P3-2 RESEARCH — VERDICT: THE FFA SPREAD. A hash + a score-leader slot picks the VICTIM; geometry only picks within it.

The structure-attacker ladder (`hostTick.ts` ~1765–1876, every `targetsStructures` type — all 21 units, 6 bosses):
1. retreat window → home; 2. `pickNavUnit` — nearest enemy UNIT within 220 (hold 300), (distSq,id) — GEOMETRY;
3. landed bag in aggro; 4. `structureTargets` — nearer of {nearest lone enemy shape, `findNearestBondTarget(…, true)`};
5. `enemyCastleMarchPos` — nearest LIVE enemy keep from the CREATURE's position, lowest seat on a tie — GEOMETRY.

⛔ Step 4's bond is NOT the nearest: `findNearestBondTarget(enemyOnly)` ends in `spreadEnemyTarget` (creatureAI.ts:361), which
with ≥2 enemy seats owning a strict bond picks a victim seat by `mix32(creature.id, sourceSpawnerId) % (n+1)` — slot 0 = the
SCORE LEADER (ties → lowest seat), slots 1..n uniform over victims sorted by seat — then the nearest bond OF THAT VICTIM.

Measured through the real host tick (`zz_probeP32.test.ts`, scratch): 4P, FIGHT, seat 3 (BL = the orcs) army of 25 at
(260–360, 760–820); one 2-shape building each for seat 0 (him, TL) at (300,420) ≈ 380 px away, seat 1 (TR, the nagas,
diagonal) at (1600,420) ≈ 1370 px, seat 2 (BR) at (1600,700). 150 ticks, every orc SEEKING with a bond:

| scores | → seat 0 (nearest, him) | → seat 1 (diagonal) | → seat 2 |
|---|---:|---:|---:|
| all 0 (leader = lowest seat = 0) | 16 | 6 | 3 |
| seat 1 leads | **6** | **16** | 3 |
| seat 0 leads | 16 | 6 | 3 |

**His question answered: it is POINTS (the leader gets 2 of n+1 slots) plus a per-creature HASH, and SEAT ORDER on a score tie
— NOT geometry and NOT strength.** Even with nobody ahead, ~36 % of an army walks past the nearest enemy to a far one. The unit
(220 px) and castle steps were already geometry. Nothing in the ladder reads strength.
