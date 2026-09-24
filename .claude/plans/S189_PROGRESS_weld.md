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

- step 4a — THE OWED TESTS (`src/state/weldOntoTowerS189.test.ts`, 28/28 green, typecheck 0):
  · 2 triangles on a laser turret → stays; FIRES (reaches FIRE, beam kills a chewer); keeps its
    sprite (ramp members = hub + 6 own spirals, centroid = own centroid, frac 1, frame 1).
  · the BROTHER's exact path: a JOINER's drop, host re-picks the target → welds the hub → stands.
  · pentagram + triangle, pentagram + circle, Helga + square-on-a-leaf → all stand; the welded
    pentagram is drawn on its own five.
  · Council M3: turret + goblin tower welded by one square → BOTH stand; two pentagrams welded by a
    triangle → BOTH stand (weld minted directly — see FINDING F1: placement's S107 P4 lock refuses a
    merge into a second live spawner).
  · own arm cut → levels (turret, pentagram); weld cut → stands.
  · R185-A: own shapes fade < epsilon, welded triangles + their connectors alpha 1.
  · R185-B: FIX offered un-welded, refused (plan null + reducer no-op) once welded; turret stands.
  · ARITHMETIC: survival shapes = recipe constants; IGNITION ⊆ SURVIVAL for all 6 stamped recipes;
    starArmsAt lowest-id + surplus-spare + foreign-never-stands-in; total order under reversed Set;
    hub-welded lightning hub pool 50 / weld damage not counted; ringCycleAt returns the original ring
    under a chord weld and the weld's cycle once the original is cut.
  · NEGATIVE: a star welded BEFORE completion never ignites (hysteresis); Circle hub + 5 Circles is
    no goblin tower.

- step 4b — MUTATION-TESTED + DIFFERENTIAL:
  · mutant 1: laserTurret `stillValid` back to `isLaserTurretComponent` → 8 RED (repro, joiner path,
    sprite, fires, own-cut, weld-cut, R185-A, R185-B). Restored, diff empty.
  · mutant 2: `rampMembersAt` back to the raw `anchor.bonds` walk → 3 RED (sprite, pentagram members,
    R185-A alpha). mutant 3: `starArmsAt` sort removed → the total-order test RED. Both restored.
  · host-vs-worker: welded turret + welded pentagram, forked through the real worker INIT (JSON
    save) and run lockstep 300 frames across BUILD→FIGHT→BUILD — WIDE hash equal every frame, both
    towers alive on both sides. ⚠ INIT adoption first differed ONLY on `Bond.stiffnessMultiplier`
    (sm1 vs sm_ on the hand-built bonds): a per-tick transient `territory.ts:268` rewrites every tick
    and the save deliberately omits — BENIGN, cleared before the fork, documented in the test.

- step 5 — stale docblocks fixed in my own recognition files (laserTurret "dies at seven", stink
  tower "self-heals", every exact predicate marked IGNITION-ONLY, goblinKinds immortality note);
  canon notes written (`S189_CANON_NOTES_weld.md`); GATES, each a captured `$?`:
  · `npm run typecheck` → TC_EXIT=0
  · `npx vitest run` → VITEST_EXIT=0 — 6026 tests / 368 files
  · `npm run build` → BUILD_EXIT=0 — 948.4 KiB (base 944.2) = **+4.2 KiB** of the shared headroom.
  · e2e NOT run (brief).

## IN-FLIGHT
- none — report delivered to the merge owner.

## NEXT

## DECISIONS
- HYSTERESIS: ignition exact (unchanged), survival contains. Consequence, deliberate: a star welded
  BEFORE it is complete never ignites (unchanged behaviour), and HELGA's re-summon after she is
  killed goes through ignition, so a WELDED hall stands but cannot re-summon her (reported).
- "OWN" ARM = lowest bond id per arm type (provable: welds post-date ignition). A surplus same-type
  weld stands in for a LOST own arm ("the shape is there"). So a turret with a 7th spiral welded to
  its hub survives the loss of one spiral — the S140 "builds at six, dies at seven" trap is gone for
  a LIVE turret; ignition still requires exactly six.
- Race rings (t3/t9) keep R136 for survival — owner ruling + 5 renderer files outside my boundary.

## NUMBERS THAT ARE MINE
- none. No constant introduced; every count is derived from `blueprints.ts`.

## FINDINGS (reported, not fixed — outside the file boundary)
- F1 `placePrimitive.ts` S107 P4 `collectSpawnerLockedPrimitiveIds`: auto-bond EXCLUDES a live
  SPAWNER's whole component — (a) a JOINER cannot weld onto any spawner (host re-pick skips it), (b)
  NOBODY can merge a drop into a second live spawner. It was the old mitigation for exactly the
  defect fixed here, and it now blocks R185-B's own example (welding two bat towers — spawners).
  Still protective for the R136 race rings. Narrowing it to the race rings is a placement-rule change.
- F3 `stinkTower.ts` property 1 ("it self-heals") is retired by this change — an accidental stink
  tower you keep building onto now stays. Docblock updated; flag at playtest.
- F4 Voltkin TV (`voltkinTowerRenderer`, `findAllVoltkinChains`) is a cinematic chain, not a live
  tower with survival — a weld on its chain likely makes the TV art vanish (same class, unverified).
- F5 `spawnerZoneRenderer.ts:87` centres the aura disc on `componentOf(anchor)` — it drifts toward
  welds (cosmetic; per-bond cover alpha is correct, so weld connectors draw at alpha 1).
- F2 `hostTick.ts:856` the lightning hub's self-raze takes `componentOf(dying)` — a hub welded into a
  lattice (leaf welds, legal since S158; hub welds, legal now) RAZES THE WHOLE WELDED STRUCTURE,
  including a welded sibling tower. Should raze `towerMembersAt(...).prims`. Pre-existing class.

## HOTSPOT HUNKS (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
- NONE. No hotspot file touched. No wire field, no hash field, no worker field added.

## WIRE / HASH / PROTOCOL
- No serialized or hashed field changed. The SURVIVAL RULE is shared: it runs on the host AND the
  worker (proven lockstep by the differential), and on whichever peer becomes host after a migration;
  the render walk and `seatFeedTowerAt` run on every client. Two builds at the same
  PROTOCOL_VERSION would disagree about whether a welded tower stands (after a host migration to the
  old build it is torn down) and about its cover/centroid/FEED row. By the S140 precedent (a recipe
  retune bumped 18→19 as "shared constants both peers compute from") this OWES A BUMP — the merge
  owner writes it.

## NON-ZERO EXITS AND THEIR VERDICTS
- repro run EXIT=1 (4 red) — BY DESIGN, the failing reproduction (step 1).
- structureRamp.test EXIT=1 (11 red) after the walk change — RESOLVED: fixtures were type-less and
  lacked the two World maps; re-pinned with types (from the blueprint), not silenced.
- a test-name quoting transform error (twice, `'` inside a '-quoted name) — RESOLVED.
- M3 first run EXIT=1 (2 red) — RESOLVED as FINDING F1 (the S107 P4 spawner lock refuses the merge);
  the turret+goblin drop re-aimed at the spawner leaf, the pentagram pair weld minted directly.
- a bash heredoc append failed (unmatched quote) — RESOLVED: nothing was appended; used Edit.
- mutation runs EXIT=1 — BY DESIGN (the mutants must go red); sources restored, `git status` clean.
- differential first run EXIT=1 on INIT bit-exactness — BENIGN transient field (see step 4b).
- typecheck TC_EXIT=1 after the differential landed (TS2367: `matchPhase` narrowed to 'BUILD' by the
  setup assignment) — a REAL error in commit 59d124c (vitest does not typecheck). RESOLVED next commit.
