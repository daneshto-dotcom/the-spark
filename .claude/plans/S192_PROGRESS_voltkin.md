# S192 PROGRESS — `s192/voltkin` (T16: Voltkins don't come back)

Branch `s192/voltkin`, from master 663c4c9. Worktree agent; the main session merges. Never pushed.

## Step 1 — Defect A + Defect B + the re-summon rule + tests (one commit; A and B must ship together)

Files:
- `src/state/godlyMatcherCore.ts` — Defect A: the early `return null` while a cinematic is active is
  gone; a match made during an emerge dispatches into the reducer's existing queue.
- `src/state/godlyOrchestration.ts` — Defect B: `onComplete` resets `state.lastCinematicOwner = null`
  before dispatching the queued trigger (the worker path already did). Plus: a chained emerge mints a
  still-pending `pendingCreatureSpawn` at once instead of overwriting it (wall-clock timer vs tick
  poll), gated on the new required `GodlyOrchestrationCtx.simRunsHere` (false on the worker mirror).
- `src/main.ts` — one ctx field: `simRunsHere: !workerSimActive()`.
- `src/state/godlyRecipes/voltkinChainWalk.ts` (NEW, side-effect-free leaf) — `EXPECTED_CHAIN`,
  `otherEndpoint`, `walkChain` MOVED VERBATIM from `voltkin.ts`, plus a `canonical` flag (default
  off) and `findAllVoltkinChainsCanonical`.
- `src/state/godlyRecipes/voltkin.ts` — imports those three from the leaf (no behaviour change).
- `src/state/voltkinTv.ts` (NEW) — `resummonVoltkins`, the census, the owner rule, the binding,
  `dispatchVoltkinSpawn`, `VOLTKINS_PER_TV` (⚠ MINE).
- `src/state/hostTick.ts` — TWO small hunks: the import, and ONE call `resummonVoltkins(world)` at the
  end of the FIGHT→BUILD arm, after `recallArmies` (which would teleport the new Voltkin to the castle).
- `src/state/voltkinResummon.test.ts` (NEW) — 17 cases.

### Repro (before the fix) — MEASURED
The research repro (TV A, B 31 ticks later, C 400 ticks later) through the real host tick, in both
sims, with the fixes mutated back out (M1+M2+M3+M6 together): **3 TVs → 2 Voltkins** (direct AND
worker), and the next BUILD **3 healthy TVs → 0 Voltkins** (both). Matches the research.

### Fixture findings (not defects, recorded because they cost a run each)
- Three Voltkins level a 24-connector enemy town in ~300 ticks; after that §5b's accepted fallback
  sends them onto their own TVs. The fixture's enemy town is 180 connectors.
- Seat 1's castle race units walk over late in the FIGHT and break a TV (~tick 3400). The reach test
  removes seat 1's creatures each frame; the fallen-TV case is a separate test.
- Worker mode still emerges in 4.8 s (direct 900 ms): the third TV's Voltkin arrives at ~tick 865,
  after a 700-tick BUILD. Late, not dropped. The test measures when the emerge queue drains. NOT
  changed — reported.

### Mutation results (each mutant alone, `voltkinResummon.test.ts`) — ALL RED
- M1 re-add the matcher early return → 4 red (both sims' first-BUILD count, both Defect-B cases)
- M2 drop the `lastCinematicOwner = null` reset → 5 red (direct: count, next wave, slot-locked, B cases)
- M3 drop the hostTick edge call → 6 red (both sims' next wave + four edge-rule cases)
- M4 census walks insertion order → 1 red (the determinism case)
- M5 ignore existing Voltkins/claims → 2 red (no-double, in-flight)
- M6 drop the early mint → 1 red (the slow-frame case)
- M7 bind a Voltkin to ANY seat's TV → 1 red (another seat's Voltkin)

### Gates (step 1 tree, exit codes captured from `$?` into a file)
- TYPECHECK=0
- VITEST=0 — 420 files passed, 2 skipped (422)
- BUILD=0 — main entry 977.7 KiB, cap 1100, headroom 122.3 KiB (master delta: see step 2)

## STATUS
- DONE: step 1 — commit f0cfe1a (all three items + tests + canon notes; gates green).
- PAUSED (owner order, usage limit). Nothing in flight; tree clean.
- EXACT NEXT STEP: measure the KiB delta — `git checkout 663c4c9 -- src && npm run build` (record
  KiB), then `git checkout HEAD -- src` (and confirm `git status` clean); then send the final report
  (SubagentHandback). Bump verdict to report: BUMP OWED (changed shared rule, host-migration successor).
