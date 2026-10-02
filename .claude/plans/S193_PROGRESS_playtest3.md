# S193 — PROGRESS, branch `s193/playtest3` (worktree `.claude/worktrees/s193-playtest3`)

Base: origin/master 2cd00502 (deploy #21, PROTOCOL 59). Brief: P3-1 castle keep-out asymmetry, P3-2 creature nearest-enemy targeting.

## NEXT STEP
P3-2 research (target pipeline measurement in a 4-player bot match).

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
