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

## IN-FLIGHT
- step 3 — the fix.

## NEXT
- step 3 — fix (or STOP with cost if > an afternoon).
- step 4 — tests owed: 2 triangles on laser turret; pentagram + extra triangle; two towers welded
  both survive (Council M3); own connector cut still levels; welded shape alpha 1 (R185-A); FIX
  refused on welded structure (R185-B); host-vs-worker hash differential over a cycle.
- step 5 — gates (typecheck / vitest / build), report.

## DECISIONS

## NUMBERS THAT ARE MINE

## HOTSPOT HUNKS (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
- none yet

## NON-ZERO EXITS AND THEIR VERDICTS
