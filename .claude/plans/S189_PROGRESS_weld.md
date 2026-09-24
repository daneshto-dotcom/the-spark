# S189 PROGRESS — `s189/weld` (C2: welding onto a tower must not dissolve it)

Branch `s189/weld`, base 15035b9 (live deploy #2, PROTOCOL_VERSION 50). Brief = PDR §5.3.
Merge owner resumes from this file if the agent is cut off.

## DONE
- step 0 — progress skeleton committed.
- step 1 — REPRODUCED, 4/4 RED BY DESIGN (`src/state/weldOntoTowerS189.test.ts`), through the real
  `PLACE_FROM_FREE` path (controls.ts pickers mirrored) + the real `runHostTick` revalidation poll:
  · laser turret + 2 triangles dropped on the art → both bond to the HUB (nearest shape + K=3
    redundancy) → hub degree 8 → `isStarAt`'s exact-degree clause fails → REMOVE_DEFENDER ≤ 0.5 s.
  · pentagram + 1 triangle (and + 1 circle) → `isPentagramComponent` demands component == 5 → gone.
  · Helga + a square on ONE LEAF → `isHelgaComponent` demands component == 7 → gone (the S158 B2b
    defect, never fixed for Helga).

## DIAGNOSIS (step 2)
Every tower recognition predicate is used for TWO jobs: IGNITION (is a NEW tower here?) and
SURVIVAL (does the LIVE tower still stand?). Both used EQUALS-the-blueprint semantics:
  · stars (`isStarAt`: laser turret, lightning hub, goblin tower, stink tower) — hub degree EXACT, so
    any weld onto the HUB kills. S158 B2b freed only the leaves, deliberately (collision-freedom).
  · pentagram, Helga — the whole CONNECTED COMPONENT must equal the blueprint, so ANY weld kills.
  · t3/t9 race rings (`isRingAt`, R136) — same-type degree exact 2, so a weld of the ring's OWN type
    kills (owner-approved residual fragility, R136). NOT in my file boundary — reported, not changed.
Why ignition must stay strict: a relaxed ignition ("≥ N leaf-type arms") would sprout goblin towers
at every Circle in a dense Circle lattice. So the fix is HYSTERESIS: strict to BUILD, contains to
SURVIVE.

- step 3a — SURVIVAL FIX landed (4/4 repro GREEN; typecheck 0; 28 related files / 567 tests 0):
  · `starShape.ts` `starArmsAt` — the star's OWN arms (per arm type, lowest bond ids), welds ignored.
  · `ringShape.ts` `ringCycleAt` (lexicographically-least simple n-cycle through the anchor) +
    `ringRemainsAt` (crumble-only remains of a broken ring).
  · NEW leaf `src/state/towerMembers.ts` — `towerShapeFor` (EXHAUSTIVE over GodlyId, derived from
    `blueprints.ts`), `towerMembersAt`, `towerStandsAt`, `liveTowerRecipeAt`.
  · survival wired: laserTurret / stinkTower / helga `stillValid`; spawnerLifecycle pentagram /
    lightningHub / goblinTower arms; goblinKinds `seatFeedTowerAt` + `seatGoblinTowerAt`.
  · IGNITION UNTOUCHED (every `is…Component` still exact).

- step 3b — THE SAME WALK FOR THE SCREEN AND THE FUSE (landed; the coordinator reported a
  spend-limit stop with these 4 files uncommitted — INSPECTED, they are exactly this coherent step,
  FINISHED not reverted: typecheck 0, full vitest 0 = 6001 tests / 368 files):
  · `structureRamp.rampMembersAt` walks `towerMembersAt` (own arms / own 5-cycle) for BOTH shapes —
    a weld is never covered (R185-A), never moves the sprite, never prices the art.
  · `stinkTowerCover.stinkTowerMembers` — same walk (was `hub.bonds`, which would hide a hub weld).
  · `structureStarHealth` — `ownStarBonds`: a LIVE tower's own arms via `liveTowerRecipeAt` +
    `towerMembersAt`; a non-tower primitive keeps the raw-bond reading (only exact ignition makes a
    star, so that is the pre-S189 reading).
  · `structureRamp.test.ts` RE-PINNED (not silenced): fixtures gained shape TYPES + the two World
    maps; the "star walk on a pentagram finds TWO arms" demo inverted (walk follows the recipe → 5);
    NEW: every RAMP_SPECS `shape` === `towerShapeFor(recipe).kind`.

## IN-FLIGHT
- step 4 — the owed tests.

## NEXT
- step 4 — tests owed: 2 triangles on laser turret; pentagram + extra triangle; two towers welded
  both survive (Council M3); own connector cut still levels; welded shape alpha 1 (R185-A); FIX
  refused on welded structure (R185-B); host-vs-worker hash differential over a cycle.
- step 5 — gates (typecheck / vitest / build), report.

## DECISIONS

## NUMBERS THAT ARE MINE

## HOTSPOT HUNKS (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
- none yet

## NON-ZERO EXITS AND THEIR VERDICTS
