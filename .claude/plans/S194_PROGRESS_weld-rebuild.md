# S194 T15 — weld-rebuild (R194-30) — PROGRESS

Branch `s194/weld-rebuild`, merged master d69475f6 (fast-forward, no conflicts). `npm install` exit 0.

## Next step
Reproduce through `runHostTick`: demons pentagram welded into a ~40-connector lattice, orc t3Warband
units striking; log per tick severed bond / own? / spawner id / towersBuilt/Fell / repair jobs / own bar.

## Leading hypothesis (H4, found while reading — not yet measured)
Own-pool (bar + ramp art) reads the tower's OWN 5 connectors (50 fifths) while the sever is priced on
the whole welded component (n(5+n)). So the art reaches 0 (crumbled frame 24) long before anything
falls; when ANY connector of the component finally falls, `damageConnector`'s drain spends the pool
from the struck bond then survivors in ASCENDING id — the tower's own (oldest, lowest-id) bonds are
drained first — own damage → 0, and `advanceRampCursor` SNAPS a decrease back to frame 1 (pristine).
That reads as "it rebuilds automatically". `advanceRampCursor`'s docblock asserts "the only way health
goes UP is FIX" — false for a welded tower.
- WIP commit: hold module + 4 consumers wired; typecheck 0. NEXT: tests (REACH + negative + mutation), then gates.
- Tests landed: `src/state/weldRebuildR194.test.ts` (9): REACH via runHostTick + renderer model (3 lattice falls,
  real t3Warband 18s), hold-OFF reproduction, goblin-tower star case, FIX heals, new tower builds, new hits show,
  3 mechanical guards. Mutations: M1 (drain treated as FIX) RED, M2 (bar bypasses hold) RED, M3 (main.ts call
  removed) RED — all restored. NEXT: full gates.
