# S194 T15 — AUDIT ROUND (F1, 2a, card, entropy) — DONE

- master (PROTOCOL 65, teams + entropy) merged: 9d4c95d0, no conflicts; npm install 0.
- F1: hold no longer clears on `world.tick < lastTick` (joiners step back on every snapshot); clears on a
  different World object or `gameState !== 'PLAYING'`. Tests: 1-tick step-back keeps the hold; leaving
  PLAYING / a new world forgets it. Mutation (tick clear restored) → RED.
- 2a: a finished repair job covering the tower (synced `world.repairJobs`) or a new own bond id (re-weld) is
  authoritative even when a weld connector fell in the same frame. Tests for both. Mutation (drop `!repaired`) → RED.
- Card path test via `characterSheetModel` (held 0/50; raw 50 with hold off). Entropy test: a lattice-only
  entropy wave snaps connectors — tower stays dented, same spawner, art aims at the collapse frame.
- Gates: typecheck 0 · vitest 0 (559 files / 4 skipped; 8496 tests / 11 skipped) · build 0, entry 1158.3 KiB,
  headroom 91.8. Snapshot CRLF→LF rewrite by vitest: benign, reverted.

# S194 T15 — weld-rebuild (R194-30) — FINAL REPORT

- tip: see `git log -1` (after this commit) · merge of master d69475f6: fast-forward, no conflicts.
- Gates (exit codes captured to files): typecheck 0 · vitest --maxWorkers=3 0 (545 files passed / 4 skipped;
  8359 tests passed / 11 skipped) · build 0 — entry 1150.3 KiB vs 1149.0 on this master (+1.3 KiB), headroom 99.7.
  e2e not run (render-only, no e2e surface named in the brief).
- Root cause: `damageConnector`'s drain (damage.ts ~:681-692) spends a welded structure's pool from the struck
  bond then survivors by ASCENDING id; a tower's own connectors are the oldest bonds, so a fall ANYWHERE in the
  weld zeroes the damage on the tower's own connectors. Bar/card/ramp art read the OWN pool (S191 C-7) → full
  again, and `advanceRampCursor` snaps the art from the last collapse frame to frame 1 = "it rebuilds".
  H1 (re-match) KILLED: same spawner id, towersBuilt/Fell unchanged, ignition never fires (FIGHT has no
  BOND_FORMED). H2 cover/sparkle reset KILLED on master: own prims never re-key, cover stays hidden.
  H3 bot FIX KILLED as the cause: repair jobs move/finish only in BUILD (repairJobs.ts tickRepairJobs).
- Fix: render-only `src/render/towerHealthHold.ts` — per live tower, held own damage that ignores a drain that
  coincides with its structure losing a connector; heals only on a FIX (drop with no connector lost) or a new
  tower. Bar (structureBarHealth.heldOwnPoolAt), both cards (characterSheetModel.shownOwnHealth) and ramp art
  (structureRampRenderer) all read it; main.ts advances it each frame after beginTowerCoverFrame.
- Bump: NONE (no sim, hash or wire change).
- T4 (s194/visuals-6) trial merge: clean (`git merge-tree --write-tree` exit 0).

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
