# S193 — PROGRESS, branch `s193/playtest3` (worktree `.claude/worktrees/s193-playtest3`)

## ⭐ FINAL REPORT (top of file per the rules)
- **Tip**: see `git log -1 s193/playtest3` (report commit on top of 520dcf36). Base origin/master 2cd00502.
- **Merges**: master af4ab269 → a30dee5d (no conflicts); master 0a64ff80 → 4b1462f0 (no conflicts). Lockfile unchanged both times.
- **Gates (merged tree, 4b1462f0 + re-pin 520dcf36)**: typecheck 0 · vitest --maxWorkers=3 **0 — 7771 passed / 11 skipped, 514 files** ·
  build 0 — entry **1101.2 KiB**, headroom 148.8 KiB; this branch's own delta **+0.2 KiB (+202 B)**, measured vs af4ab269 (1066.7 → 1066.8) ·
  e2e:gating (own hashed port) **0 — 71 passed**.
- **BUMP: YES** (merge owner bumps; PROTOCOL_VERSION untouched, 60 on master). Both are shared rules both builds compute:
  P3-1 placement is a hashed REDUCER (host, worker, replay, successor, client ghost) — a stale peer refuses a stamp/shape south of
  the castle that a new peer accepts, and a pull lands on a different slot; P3-2 targeting is computed by the host, the worker sim
  and a migrated successor — two builds pick different connectors from the same world.
- **NOT DONE**: nothing in scope. Chewer/drone spread deliberately untouched (question 2).

### What is MINE — owner questions (one line each, with a recommendation)
1. **Building over your own porch**: legal now; those slots stop receiving pulls until the tower goes (all 4 covered = pull is the
   full-porch no-op, nothing lost). Rec: accept — it is self-inflicted and visible.
2. **Chewer + lightning drone keep the FFA spread** (hash + score-leader slot). His "simple creatures … nearest" may include them.
   Rec: ask; if yes it is one line each (`hostTick.ts` drone arm and chewer arm → `nearestStrictEnemyBond`).
3. **Bot personalities at IMBA blur**: with nearest-first, adjacent seats raze each other's opening goblin towers; IMBA FORTRESS
   rebuilds instead of reaching its laser and is no longer the most defensive (0.25 vs BALANCED 0.28). HARD Warmonger stamped one
   stink tower via S154 take-what-you-can. Re-pinned honestly (see `botPersonality.test.ts` notes). Rec: bots owner retunes Fortress.
4. A single shape may be dropped on a shape resting on a porch slot (no refusal; no spark repulsion exists since S146, so it is a
   visual overlap only). Rec: leave.
5. `CASTLE_PORCH_KEEP_OUT_RADIUS` 34 keeps its number (MINE, S191) with a new job: built-shape clearance for a pull.

### Merge seams the merge owner must know
- `zones.ts` no longer imports the porch constants; `castleBank.ts` now imports `CASTLE_PORCH_KEEP_OUT_RADIUS` from `zones.ts`;
  `firstFreePorchSlot` gained an optional 4th arg `built` (default `[]`, old callers unchanged).
- `blueprintLegality.stampRefusalAt` arm 5 now also reads `world.freeSparks` (escrow `'banked'` only) → `BLOCKED`.
- New export `nearestStrictEnemyBond` (creatureAI.ts); `structureTargets` uses it. `bondTargetReference.fixtures.ts` moved FIRST
  (`referenceNearestStrictEnemyBond`); the S190/S191 differentials stay green.
- `src/bots/botPersonality.test.ts` (s193/bots' file) re-pinned: 2 measured-signature assertions moved by P3-2 — bisected:
  reverting P3-2 alone turns them green, reverting P3-1 alone does not.
- Canon: §4b item 3 (S193 paragraph; S191 porch-disc sentence struck through), §5b (spread now chewer/drone only), §5c (new bullet).
  `canon.test.ts` pins both, incl. a REAL check of each rule.
- Benign, recorded: vitest rewrites `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` with LF on this machine
  (`git diff -w` empty) — restored every time, never committed. The castle-panel e2e red on the pre-merge tree was the known
  s192/magic `castleMres` literal, fixed on master 42031624 — green after the second merge.

### Tests added / re-pinned (each fix: arithmetic, REACH, negative, mutation-tested guard)
- `src/state/creatures/nearestEnemyFirst.test.ts` — REACH through the real host tick: the orcs (seat 3) → him (seat 0) 25/25 under
  every score leader; all four quarters symmetric, EVERY creature EVERY tick = brute-force nearest; castle march next (T13 skip);
  total order on an exact tie; production = reference; negative: chewer keeps the spread. Mutation (revert to the spread): 6 of 9
  red + 5 differential tests red.
- `src/state/castleKeepOutS191.test.ts` — re-pinned porch block; REACH: 4P board, 4 castles × {laser turret, goblin tower, stink tower}
  × every on-board axis opens at 61–62.5 (mutation: re-adding the lobe reproduces exactly **73.9** east); REACH: tower OVER the porch
  → pulls skip covered slots, bank intact, physics keeps the rest on their slots (mutation: drop `built` → red); stamp onto a
  resting porch shape → BLOCKED in ghost + reducer (mutation: drop the arm → red).
- `zones.test.ts` — 32 directions × every seat × both boards, ±1 px of 61, slots outside. `buildLegalityGates.test.ts` re-pin.

## Measured numbers
| | before (S191 rule) | after |
|---|---:|---:|
| laser turret gap E / S (top castles) | 73.9 / **108.0** | 61.9 / 61.0 |
| stink tower gap E / S | 61.9 / **108.0** | 61.9 / 61.0 |
| single shape E / S / SE | 61 / **105** / 112 | 61 / 61 / 62 |
| orcs → nearest (him) / diagonal, nobody ahead | 16 / 6 (+3 seat 2) | 25 / 0 |
| … diagonal seat leading on points | **6 / 16** | 25 / 0 |


Base: origin/master 2cd00502 (deploy #21, PROTOCOL 59). Brief: P3-1 castle keep-out asymmetry, P3-2 creature nearest-enemy targeting.

## NEXT STEP
DONE — all gates green on the merged tree; handed back to the merge owner.

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
