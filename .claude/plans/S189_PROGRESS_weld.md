# S189 PROGRESS — `s189/weld` (C2: welding onto a tower must not dissolve it)

## ⭐⭐⭐⭐ S193 PRE-LAND MERGE ROUND (re-audit CLEAN) — read this first
- **merge** cd2a1e1 ← master 0a64ff8 (PROTOCOL 60: magic, bots, goblin-autobuild, visuals-4/5, carry-fwd,
  endstats). **7 conflicts**, each kept both intents: spawner.ts / save.ts / stateHashFull.ts (weld's
  `ownPrimitiveIds` REPLACES `ownBondIdLimit`; goblin-autobuild's `autoFeedMask` / `autoFeedCursor` kept in
  field, factory, both serializers, trim, hash union + projection) · defenderLifecycle.ts, world.ts (both
  imports) · structurePanel.test.ts (weld `hire()` + magic `'physical'`) · e2e/castle-panel.spec.ts (NINE
  rows: fixAll … castleMres, both docblocks). Magic's required `DamageClass` added at weld's 11 test sites.
- **seams fixed** (828ee9c, 7ae17e1, 68f03db): canon §3d + `castlePanel.ts` comment say FIVE stat rows
  (MRES); FIX ALL blocker docblock lists QUEUE FULL; phase test gains a second job (id 7) — the re-auditor's
  surviving mutant "phase by tick only" is now RED; carry-fwd `repairHealNumberJoiner.test.ts` (3 RED on the
  merge: it dispatched REPAIR_STRUCTURE for an instant restore) re-pinned to `applyRepairStructure` + a NEW
  joiner REACH: a JOB finished through the host tick → the joiner derives one green 12 off the wire;
  goblin-autobuild `goblinAutoFeedMemory.test.ts` (1 RED, same cause) re-pinned. Every remaining test
  `dispatch(…REPAIR_STRUCTURE…)` is a deliberate job test.
- **gates** (tree 68f03db, `.tmp-gates/{TC8,VT8,BUILD8,E2E8}.exit`): typecheck **0** · vitest **0** =
  **7836 passed + 11 skipped / 517 + 4 skipped** · build **0** — **1121.4 KiB** / 1250 (128.6 headroom) ·
  e2e:gating (own port) **0** = **71 passed**.
- **bump:** folded into the merge owner's single 60 → 61 (notes §H reasons 1-9). Never edited PROTOCOL_VERSION.

## ⭐⭐⭐ S193 AUDIT FIX ROUND — FINAL REPORT (read this first)
- **tip**: see `git log` (code tip 91a1181; docs commits on top). **Merges** (all 0 conflicts):
  110c17a (master 58 — zombies + lobby-ci), the endgame merge (59), and the latest master b72e779
  (visuals-2) — master is fully merged at report time. `npm install` after each.
- **gates** on the final merged tree, each `$?` in `.tmp-gates/{TC7,VT7,BUILD7,E2E7}.exit`:
  typecheck **0** · `vitest --maxWorkers=3` **0** = **7515 passed + 11 skipped / 489 files + 4 skipped** ·
  build **0** — entry **1082.3 KiB** / 1250 (167.7 headroom; master alone was not built here — the
  auditor measured weld at ≈ +20 KiB over master) · `npm run e2e:gating` on this worktree's own port
  **0** = **71 passed** (7.6 min).
- **bump verdict: BUMP** (59 → 60 or later; the merge owner's number) — notes §H reasons 1-9: the
  `ownPrimitiveIds` field replacement and the R191-A rules (round 5), and round 6's `REPAIR_STRUCTURE`
  meaning change, the new `FIX_ALL` intent, and the new serialized + wide-hashed `World.repairJobs` /
  `nextRepairJobId` / `Gatherer.repairTask`. The fix round adds no wire change.
- **fixed this round:** (1) e2e castle-panel row literal → EIGHT rows, `fixAll` first; (2) zombies T11
  seam — `repairHealNumber` instant cases re-pinned + a JOB REACH test that prints the one green number;
  (3) endgame seam — `FIX_ALL: 'allow'` under the wave-27 lock, docblock corrected, the lock's FIX test
  re-pinned to the job (bank-sourced); plus a seam the audit could not see before the endgame merge:
  `endgameS193.test.ts`'s owner-predicate enumeration gains weld's seat-only sites with verdicts;
  (4) an eliminated seat's jobs cancel and refund; (5) `QUEUE FULL` on the card FIX and the FIX ALL row;
  (6) `fixAllTargets` claims shapes only for towers it queues (defensive — no reachable board shows the
  difference; recorded below); (7) the job re-plan is phase-spread by id (`REPAIR_JOB_REPLAN_TICKS` 15,
  MINE), measured 0.61–1.13 → 0.05–0.07 ms/tick at 32 waiting jobs; (8) canon §8 / §3d / §7b / §9d / §6
  rewritten on this branch with canon.test pins (32, 15, fixAll first, the new phrases), the two stale
  docblocks, canon notes §H reasons 7-9.
- **mutants:** F1 eliminated-not-cancelled · F2 card ignores the bound · F3 row ignores the bound ·
  F4 re-plan every tick · F5 job restore no-op — all RED, restored (plus round 6's M1-M9).
- **MINE / owner questions (unchanged from round 6, plus one):** `REPAIR_JOB_REPLAN_TICKS` 15 (a waiting
  job notices "nothing left to fix" within a quarter second) — rec: keep. Round 6's list stands: mid-haul
  finishes first · no gatherer → no FIX · porch not a source · castle wins a tie · 32 jobs a seat · FIX ALL
  top row · DEEP CURRENT not on repair trips · no carried-shape art.
- **merge seams:** the canon is rewritten ON THIS BRANCH (§3d, §6, §7b, §8, §9d) — merge it as-is, do not
  re-apply the digest's suggestions on top. `endgameS193.test.ts` SITES gained three weld entries.
  Any branch counting owner predicates in `structureRepair.ts` sees 2 now (round 5's `reclaimScopeAt`).
- **NOT DONE:** item 6 has no REACH case that distinguishes it (stamps never bond to existing shapes;
  hand-built shared-leaf towers carry no provenance and are never FIX candidates) — kept as a defensive
  fix with a whole-tower negative test, not mutation-tested. Carried-shape art; DEEP CURRENT on trips.

## ⭐⭐ S193 ROUND 6 FINAL REPORT (R191-B FIX-by-gatherer + R192-W1 castle FIX ALL) — read this first
- **tip**: see `git log` (code tip 054896f; this report is the docs commit on top) · **merge** 4aaf81a
  (master 62b83e0, plan-file commits only) — **0 conflicts**.
- **gates** (tree 054896f, captured `$?` in `.tmp-gates/{TC6,VT6,BUILD6}.exit`): typecheck **0** ·
  `vitest --maxWorkers=3` **0** = **7307 passed + 11 skipped / 474 files + 4 skipped** · build **0** —
  entry **1054.9 KiB** / 1100 (45.1 headroom) — round 6 = **+7.0 KiB** (1047.9 → 1054.9).
- **bump verdict: BUMP** (the branch already earns one; round 6 adds reasons): (1) new client intent
  `FIX_ALL` (both allowlists, bench + elimination deny); (2) `REPAIR_STRUCTURE` CHANGED MEANING — a v56
  host restores on the spot, this one queues a job: two builds that shake hands disagree about what the
  same intent does; (3) new required serialized + wide-hashed state: `World.repairJobs`,
  `World.nextRepairJobId`, `Gatherer.repairTask` (disk save + net snapshot; `structuralSignature`).
- **what landed** (`src/state/repairJobs.ts`, `src/state/repairJobTypes.ts`): FIX queues a job (the
  plan's bill — R13 lost shapes / R182-E one flat; R19 BUILD only; R191-A per tower in a weld; one job
  per tower). FIX ALL queues every own tower that needs one, in (squared distance from the castle,
  lowest shape id) order. Each shape = one task. A free gatherer (SEEKING, empty-handed, by id) takes
  the first open shape of the first job a source can supply, from the NEARER of the castle bank (net of
  reservations; a tie goes to the castle) and the nearest quarry spark (d², id). Bank debited ON
  ARRIVAL; a quarry spark is lifted on pickup; the shape is carried to the tower. When the whole bill is
  delivered the tower is RE-PLANNED: covered → restored (`restoreFromDelivered` = the instant FIX's
  restore half, nothing consumed twice), surplus → bank; short → the shortfall becomes new open shapes.
  Tower gone / scrapped / no FIX left → cancel, refund EVERYTHING (delivered + in hand). No source → the
  shape waits and the gatherer keeps gathering. The shelter keeps a shape IN HAND through the FIGHT (it
  lands next BUILD) and reopens one not yet picked up. Task holders are off the haul cycle.
  UI: the card's FIX reads QUEUED / NOTHING TO FIX / NO GATHERERS / COSTS n (the bank no longer gates
  it); the castle's FIX ALL row (top row) `FIX ALL  n` with NOT YOURS / LOCKED / CASTLE LOST /
  BUILD ONLY / NO GATHERERS / NOTHING TO FIX; main.ts `setFixAllHandler` → `FIX_ALL` (not predicted).
- **tests**: `src/state/repairJobsR191B.test.ts` (20) + `src/render/fixAllCastleR192W1.test.ts` (5) —
  REACH through the real host tick (matcher in PRODUCTION order: host tick → matcher → wipe), the real
  `CastlePanel` row pressed through its hit-tested Graphics child, the card's FIX through the real
  `Controls.onDown`. Negatives: R19 FIGHT refusal, no gatherer, one job per tower, a disabled row
  dispatches nothing, a second FIX ALL queues nothing. Four sites: disk save + wire snapshot round-trip
  and an heir that finishes the job; two identical runs hash equal every frame for 600 ticks.
  **Mutants M1-M9 all RED, restored** (source ignores distance · shelter drops a shape in hand · haul
  cycle runs over a task · restore without coverage · FIX restores on the spot · cancel keeps a shape in
  hand · bank debited at assignment · FIX ALL unordered · no one-job-per-tower).
  RE-PINNED (not relaxed): 17 weld tests that dispatched `REPAIR_STRUCTURE` for an instant restore now
  call `applyRepairStructure` (the restore they test); `structurePanel.test` affordability cases → the
  job semantics; `stateHashFull.test` families += `repairJobs` (+ the `nextRepairJobId` scalar);
  `castleStatButtons` fill enumeration text (count unchanged: the row loop draws FIX ALL).
- **MINE / owner questions (one line each, with a recommendation):**
  · a gatherer mid-HAUL finishes his delivery before taking a FIX shape — rec: keep (no shape dropped).
  · a seat with NO gatherer cannot queue a FIX (button: NO GATHERERS) — rec: keep; or an instant FIX
    from the bank as the fallback if he prefers.
  · porch shapes are not a FIX source (castle bank + quarry only — his two) — rec: keep.
  · surplus delivered shapes go to the bank when the bill shrank; a bill that grew on the way adds new
    open shapes — rec: keep.
  · FIX ALL is the castle's TOP row (canon §3d pins the four stat rows directly under REGEN) — rec: keep.
  · the per-seat job bound `REPAIR_JOBS_MAX_PER_SEAT` = 32 — rec: keep.
  · the castle wins a distance tie with the quarry — rec: keep (a bank shape cannot be taken from you).
  · DEEP CURRENT (nagas) snap is not applied to repair trips — rec: ask; one line to add.
  · the carried repair shape has NO art on the gatherer (the cargo is a type, not an entity) — rec: a
    small glyph on the carrier, for a visuals branch.
- **merge seams:** SPARK_CANON.md FIX text (≈ :1344-1352, "FIX now reads `NEED 1 MORE`" on an empty
  bank) is now false — FIX queues a gatherer job; the canon needs the R191-B paragraph and the FIX ALL
  row (canon §3d's castle buttons gain a row above BUY GATHERER). `bots/` never FIX. `hostTick.ts`
  gained one call (`tickRepairJobs`) before the gatherer fan-out; `gathererLifecycle.ts` exports
  `isHarvestable` / `stepToward`; `castlePanel.ts` `CASTLE_ROW_KEYS` gained `fixAll` FIRST (any branch
  indexing castle rows by number shifts by one). Perf watch: each BUILD tick re-plans every queued job
  (≤ 32 per seat), and the open castle panel plans every own tower per sync.
- **NOT DONE:** e2e not run; no carried-shape art; DEEP CURRENT on repair trips.

## ⭐ S193 FINAL REPORT (merge master + SEAM-C7) — read this first
- **tip** `8430a334` (code tip f1cff75) · **merge** 6e9b57e (master 71abc27) — **textually clean, 0 conflicts**
  (auto-merged: controls.ts, characterSheetModel.ts, save.ts, stateHashFull.ts). Merged tree before any
  edit: TC 0 · vitest 0 (7277 + 11 skipped / 472 + 4 skipped files).
- **gates** (tree f1cff75, after `npm install`, captured `$?` in `.tmp-gates/{TC,VT,BUILD}.exit`):
  typecheck **0** · `vitest --maxWorkers=3` **0** = **7282 passed + 11 skipped / 472 files + 4 skipped** ·
  build **0** — entry **1047.9 KiB** / 1100 (52.1 headroom; the charter script WARNS under 60).
  Delta vs master NOT measured here (no master build in this worktree); the rules file's "~65 KiB shared
  headroom" puts master at ≈1035 → weld ≈ +13 KiB; this round's seam fix itself is a few hundred bytes.
- **bump verdict: BUMP** (unchanged, earned by the branch, not by this round): `ownPrimitiveIds` replaces
  `ownBondIdLimit` on SerializedSpawner/SerializedDefender (rides the wire, kept by `trimMirrorSpawner`,
  wide-hashed) and the shared sim rules in notes §H. This round's SEAM-C7 changes are render-only reads
  of already-synced state (bond `damageFifths`, own ids) — no new wire/hash field, no extra reason.
- **SEAM-C7 resolution** (35ae4e3): ONE pricing `towerUnit.towerOwnPoolAt` over the ONE walk
  `towerMembersAt` (ownPrimitiveIds): max = recipe pool, cur = max − banked while whole, **0 once an own
  connector is gone** (crumble rule). `structureBarHealth.towerOwnHealth` (board bar) delegates to it;
  `structureHealthAt` (lone-tower card) resolves the tower via `towerUnitAt` (the reducers' resolution);
  `towerUnit.towerOwnHealth` (welded card + rows) and the welded card's CONNECTORS row read it; the ramp
  art (`rampHealthFrac` over `rampMembersAt` = `towerMembersAt`) is the same arithmetic, asserted equal.
  Two defects closed: (a) carry's bar priced `pool(own connectors LEFT)` → inside the poll window after a
  cut own arm it drew a FULL pool(5) bar over a crumbling sprite while the card read 0; (b) `liveBarTowers`
  is keyed by anchor, so on the W2-4 board (Scarab ring anchored AT a turret hub) the turret drew NO bar —
  `healthBar` now loops `liveBarTowersByAnchor` (every tower at an anchor).
- **CARRY-1 × welded per-tower FIX: correct, no code change.** `severWithCarry` filters candidates by
  OWNER (both ends placed by the struck bond's owner), not by tower. REACH test: an overkill hit on a
  welded turret arm fells ≥ 2 connectors, the turret falls, its own FIX (tower scope) re-registers it
  whole (bar = card = art = 1), and the goblin tower's own connectors are untouched by the FIX.
- **tests** (f1cff75, `weldOntoTowerS189.test.ts` "S193 SEAM-C7", 5): dent → bar = card = art = 49/66 +
  the other card's row + `structureHealthAt`; weld damage moves none; cut-arm window → art 0, card 0/66,
  bar 1/66 floor; W2-4 → two bars; FIX after carry. **Mutants (all RED, restored):** bar priced on
  connectors left · one bar per anchor · pool ignores `whole`. Not mutation-distinguishable (by
  construction): `structureHealthAt`'s tower resolution — a shape two towers share is always WELDED,
  so the lone-tower path only ever holds one tower.
- **MINE / owner questions:**
  · ⚠ SEAM-C7 (a): in the ≤ 0.5 s window after an own arm is cut, the bar shows its 1-fifth floor on the
    RECIPE width (was: a full bar on the shrunk width). Rec: keep — it follows the art (his S187 rule).
  · ⚠ CARRY × WELD: an overkill on a welded tower carries across a SAME-OWNER weld into the next tower
    (CARRY-1 is owner-scoped, not tower-scoped). Rec: keep (his "destroys however many connectors the
    hit does"; the structure is one pool, R6) — ask only if he wants towers to stop a carry.
  · carried over: STAMP_SLOT_TOLERANCE_FRAC 0.5 (X2), the majority-of-stamp fallen-tower rule, SHEETS-6
    (own HP 0/66 while the weld keeps it standing).
- **merge seams the merge owner must know:** canon §9d item 3 / RULE 1 docblock in
  `structureBarHealth.ts` said "priced `structurePoolFifths(own connectors)`" — now the RECIPE pool with
  the crumble zero (file docblock + both functions updated here); the CANON §9d text (`SPARK_CANON.md:1621`) still says `structurePoolFifths(own connectors)` and
  should say "the recipe's pool, 0 once an own connector is gone". SEAMGATES-1 (endstats ×
  DORMANT) / SEAMGATES-2 (hub blast prose) / SEAMGATES-4 (canon §7b R185-B amended + canon.test re-pin)
  remain merge-owner chores per the digest. teams branch's CARRY-1 ally filter will touch the same
  `severWithCarry` candidate filter.
- **NOT DONE:** e2e (not run this round); master-side bundle measurement; round 6 (waits for go).

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

## FOLLOW-UP ROUND (merge owner, after report 1) — items 1-4, one commit each

### step F0 — ESTIMATE (file by file), measured before any edit. VERDICT: ~3-3.5 h ⇒ about an
afternoon ⇒ PROCEED (the stop rule is not triggered).
- item 1 (S107 P4 spawner lock): `placePrimitive.ts` — the lock is read at 3 sites (host target
  re-pick :205, host merge candidates :215, the merge sweep :390) through ONE builder
  `collectSpawnerLockedPrimitiveIds` :677. No test pins the lock (grep). The client pickers in
  `controls.ts` / `dragPreview.ts` never applied it, so removing it makes host and preview AGREE.
  ~10 lines + a new test. ~45 min.
- item 2 (race rings onto contains): `towerMembers.ts` (classify the 12 ids as rings, derived from
  the blueprint), `spawnerLifecycle.ts` (2 arms), `goblinKinds.ts` (1), `raceTower.ts` +
  `t9BossTower.ts` member fns (1 line each), `hostTick.ts` t9 raze (1), and THREE renderer files —
  `render/towerRenderer.ts:211` (mine), `render/towerFrames.ts:392`, `render/groundDecalRenderer.ts:173`
  (`healthBar.ts` delegates to `towerFrames.towerRingCentroid`, no edit). ⚠ My report-1 said "five
  renderer files"; the measured count is three. Each hunk is `ringMembersAt(` → `ringCycleAt(` (same
  signature, same walk-order return, same null contract) + its import. ~1.5-2 h with tests.
- item 3 (hub raze): `hostTick.ts:856` one call + test. ~30 min.
- item 4 (Voltkin TV verify): read + a probe. ~20 min.
- SIBLING-BRANCH OVERLAP (`git diff --name-only $(git merge-base master B) B`):
  · `s189/render`: main.ts, bossAuras.ts, draftOverlay.ts, gathererRenderer.ts, goblinRenderer.ts,
    raceMotifs.ts + tests — NO overlap with my files.
  · `s188/swarm`: characterSheetModel.ts, goblinRenderer.ts, **towerFrames.ts**, creature.ts,
    voltkin-config.ts, potatoLifecycle.ts, apexPredator.ts, theSwarm.ts, racialPerks.ts, stats.ts —
    ⚠ OVERLAP: `render/towerFrames.ts`. Swarm's hunk is at ~:190-217 (BAT_SWARM_SPRITE_SCALE_MUL +
    one `creatureSpriteScaleMul` line); mine will be the import (:66) and `towerRingCentroid` (:392)
    only — disjoint hunks, expected to merge cleanly. I do not touch goblinRenderer.ts.

### step F1 — item 1 LANDED: the S107 P4 lock is NARROWED to towers a weld would kill
- `placePrimitive.ts` `collectSpawnerLockedPrimitiveIds`: a spawner whose recipe has a CONTAINS
  survival shape (`towerShapeFor !== null`) is skipped. All three lock sites (host re-pick, host
  merge candidates, merge sweep) read this one builder, so all three open together.
- ⚠ ORDER, deliberate: the lock is NARROWED, not deleted, in this commit, so the race rings — still
  on R136 until item 2 — stay protected between commits. Item 2 moves them onto contains, at which
  point the lock is empty for every shipped recipe without another edit.
- tests: a JOINER's drop now bonds onto a live goblin tower (host re-pick) and it stands; the M3 pair
  tests now weld through REAL placement (turret→goblin via the merge sweep; one triangle merges two
  live pentagrams) — the hand-minted weld is gone. Mutant (skip removed) → those 3 RED; restored.
- runs: weld file 30/30; `src/state` + `src/bots` + `src/input` 202 files / 3280 tests EXIT=0.

### step F2 — item 2 LANDED: the twelve race rings are on "exact to build, contains to survive"
- `towerMembers.ts`: the 12 race ids are rings (derived from `blueprints.ts`); only the Voltkin
  (a cinematic) is outside the module now.
- survival: `spawnerLifecycle.ts` t3 + t9 arms → `towerStandsAt`; `goblinKinds.seatFeedTowerAt`
  ring arm → `towerMembersAt(...).whole`.
- ⚠ NEW, found while wiring it: `seatFeedTowerAt` returned the FIRST feedable spawner in `Map` order
  in the clicked component. Harmless while two feedable towers could never share a component; after
  items 1+2 two welded bat towers ARE one component, so the FEED row could name the wrong tower (and
  a peer's rebuilt map could order differently). Now a TOTAL ORDER: the tower whose own members hold
  the clicked shape, then the lowest spawner id. The panel only picks the spawner id for the intent,
  so this was UX, not a sim divergence — fixed because the change made it reachable.
- t9 release (`hostTick.ts` t9 arm): `ringMembersAt` → `ringCycleAt`, so a same-type-welded nine
  still releases its boss and razes ONLY its own nine (the weld survives).
- renderers (hunk = import + one call each): `towerRenderer.ts` `ringOf`, `towerFrames.ts`
  `towerRingCentroid` (⚠ also touched by `s188/swarm`, disjoint hunks ~:190-217 vs mine :66/:392),
  `groundDecalRenderer.ts`. `healthBar.ts` delegates to `towerRingCentroid` — untouched.
- IGNITION untouched: `findRingAnchors` / `isRingAt`, and the ignition de-dup helpers
  `findRaceTowerMembers` / `findT9TowerMembers` (they only ever see an exact ring) stay exact.
- S107 P4 lock: now empty for every shipped spawner recipe (rule kept for a future opt-out).
- tests (42/42 in the weld file): race tower + same-type weld stands, no second ignition; own ring
  connector cut → falls; still DRAWN on its own ring centroid; joiner welds onto own race tower,
  lock empty; ⭐ THE OWNER'S CASE — two stamped bat towers welded by three same-type drops: both
  stand, both EMIT their unit in FIGHT, FIX refused (plan null + reducer no-op), welded pool >
  2× one tower's; t9 + same-type weld stands, releases the boss, razes the nine, weld survives;
  IGNITION ⊆ SURVIVAL for all 12 stamped race rings; the host-vs-worker differential now also
  carries a same-type-welded race tower (alive on both sides, wide hash equal every frame).
- mutant: ring survival back to the exact walk → 8 RED; restored.
- gates: typecheck 0 · vitest 0 (6039 / 368).

### step F3 — item 3 LANDED: the lightning hub's self-raze takes its OWN star
- `hostTick.ts` (spawner-destruction branch): `componentOf(dying)` → `towerMembersAt(world,
  'lightningHub', anchor).prims` (fallback `[dying.id]`). The blast (`STRUCTURE_SELFDESTRUCT` →
  `applyStructureSelfDestruct` → `applyRadialClear`, the S157 owner exemption, R182-C's
  ruled-not-built 120 fifths) is UNTOUCHED — only which members are deleted.
- test: a hub welded (real placement, merge sweep) to a laser turret, doomed on its own star (34/50),
  self-destructs in FIGHT → the blast fires; the hub + its 5 own leaves are razed (no orphans); the
  welding square, the turret hub and all 6 spirals stand, and the turret is still a tower.
- mutant (raze back to `componentOf`) → RED; restored. `src/state` 187 files / 3113 tests EXIT=0.

### RESUME NOTE — a spend-limit stop hit after item 3. On resume `git status` showed exactly two
uncommitted files (`princessHelga.ts`, `weldOntoTowerS189.test.ts`) = the R190-J change + its tests +
the two spare-rule reach tests. INSPECTED, coherent, already verified before the stop (typecheck 0,
vitest 0 = 6044 / 368, mutant red) — FINISHED and committed, not reverted. Items 1-3 were already
committed (e2df268, 71f9173, 69ee235); the resume message listing items 2-3 as open was stale.

### step F4 — OWNER RULING R190-J LANDED: a welded Helga hall re-summons her every fight
> *"Every fight she should come back as long as the tower is still up."*
- `princessHelga.ts` `findBuildableHelgaAnchor`: `isHelgaComponent` (exact whole-component) →
  `towerStandsAt(world, 'helga', id)`. There is no record of "this was her hall" once she dies, so
  her first build and her re-summon are ONE predicate — Helga's ignition is now contains too.
  Consequence stated at the function: a Triangle that carries her six arms plus anything else (a
  pentagram / Triangle-race ring node) is also a Helga hub — six specific shapes, a deliberate build.
- `isHelgaComponent` is no longer called in production (kept as the definition of a clean hall; the
  tests stamp against it). Its docblock and `stillValid`'s say so.
- tests: weld a square onto her HUB (the exact test now refuses the hall), cross BUILD→FIGHT through
  the real host tick, kill her (`damageEntity` for her full pool), no re-summon inside that fight
  (S157 B6), cross to BUILD, build something elsewhere (a bonded pair — ignition needs a topology
  change), she is back on the same hub and fights the next FIGHT. Negative: cut one of the hall's OWN
  arms in the fight she died in → the hall is down → she does not return.
- mutant (predicate back to `isHelgaComponent`) → the re-summon test RED; restored.
- ⚠ PRE-EXISTING GAP vs "EVERY fight", reported not changed: defender ignition only scans on a
  BUILD-phase TOPOLOGY CHANGE (`runDefenderIgnition`: a `BOND_FORMED` or a player sever). A player who
  builds nothing at all in a BUILD does not get her back — true of an UN-welded hall too. Closing it
  = an edge-triggered scan (e.g. a host-local "phase changed" flag on the matcher cursor, or a scan at
  the FIGHT→BUILD edge in `hostTick`), ~1 h + a determinism check on the worker path.

### step F4b — THE SPARE RULE, pinned through the host tick (two new tests)
- STAR: a 7th Spiral welded onto a live turret's HUB takes over when an own Spiral arm is cut → stands.
- RING: a Triangle bridging pentagram nodes 0 and 2 takes over when edge 0–1 is cut → stands.
- (the "cut levels it" side is pinned by: turret own-arm cut with only foreign welds → falls;
  pentagram cut with a Circle weld → falls; race-ring cut with a same-type spur → falls.)

### step F5 — item 4 VERIFIED (no code change): the Voltkin TV art does NOT vanish on a weld
- Evidence (code): `voltkinTowerRenderer.sync` draws one TV per `findAllVoltkinChains(world)`, whose
  `walkChain` is a type-ordered PATH search with NO degree or isolation check — the isolation /
  degree test lives only in `voltkinPredicate` (ignition, `voltkin.ts` "S48 P4 strict chain
  isolation"). Its cover set is `world.bonds` with both ends in the chain (`voltkinTowerRenderer`
  ~:568-576), so a weld stays at alpha 1 (R185-A holds there too).
- Evidence (probe, a throwaway test file, deleted, not committed): 4 Squares + 4 Triangles chain →
  1 chain; + a Circle hand-welded on chain[3] → 1 chain, same 8 members; + a Triangle welded on
  chain[6] → 1 chain, same 8 members; + a REAL Circle drop (3 bonds formed) → 1 chain.
- Caveat, not a bug found: the path search iterates `Map`/`Set` order, so on an exotic lattice with
  two valid 8-paths it could pick a different path — render-only, no sim effect.

### step F6 — canon notes rewritten (spare rule stated exactly, final rule list, protocol) + GATES on
the committed tree, each a captured $?:
- `npm run typecheck` → TC_EXIT=0
- `npx vitest run --maxWorkers=6` → VITEST_EXIT=0 — 6044 tests / 368 files
- `npm run build` → BUILD_EXIT=0 — 948.1 KiB (base 944.2) = +3.9 KiB of the shared headroom
- e2e NOT run (brief).

## ⛔ AUDIT FIX ROUND (2 lenses; journal wf_f67b55a1-d32) — owner's standing order: no unapproved
spec changes. REVERT the spare rules (W1/W2-4/W6) and Helga's contains FIRST build (W2); fix W3,
W2-1/W5, W2-2, W8. NOT this round: W9/W2-6 (P4 lock → bot frontier welds; owner question), the
protocol bump (W11/W2-3) and canon/stale comments (W10/W2-5) — merge owner's.
ORDER TAKEN: the small independent items first (3, 4, 5), then item 1 (strict identity), item 2
(Helga dormant revive), item 6 (differential) — item 2 is the large one (~36 files read defenders).

### fix-round item 3 (audit W3) LANDED — bot raids aim at the tower's OWN connectors
- `botBrain.ts` `nearestEnemySpawnerBond`: iterates `towerMembersAt(...).bonds` instead of the
  whole `componentOf`; no rng draw here (the call site's single draw is untouched); same nearest /
  first-seen tie-break, own-member order a pure function of bond ids. Docblock rewritten.
- test: welded pentagram, the bot stands past the weld (a weld connector is nearer than any own one)
  → the pick is one of the pentagram's own five. Against the OLD botBrain (stashed) → RED, picks
  weld bond 5. `src/bots` suite EXIT=0.

### fix-round item 4 (audit W2-1 / W5) LANDED — aura strokes and ground zone ride the tower's OWN members
- NEW `towerMembers.ts` `towerFootprintAt`: own members, or the component only for a recipe with no
  survival shape (none of the spawners). `spawnerZoneRenderer` (disc centre/radius + the charged
  strokes and beads) and `groundDecalRenderer` (every recipe, not only race rings) take it.
- tests: two welded bat towers — each footprint is its own 3-ring, no weld connector in it; a welded
  laser turret's footprint is its own star; MECHANICAL — neither renderer calls `componentOf(` and
  both call `towerFootprintAt(`. `src/render` suite EXIT=0.

### fix-round item 5 (audit W2-2) LANDED — no bond-less orphan after a hub self-raze or a t9 release
- `hostTick.ts`: both raze calls pass `razeOrphans = true` (`razePrimitives(world, ids, undefined,
  true)`): a shape that LOST ITS LAST BOND in the raze goes with it — S157 B2 (owner: *"the last shape
  stays and attracts enemy fire … WEIRD"*). A weld still bonded onward keeps that bond and stands.
  WHAT THE ORPHANS BECOME: removed (a removal, not a kill — no damage number, `razedNotKilled`). WHY
  THAT MATCHES CANON §2: §2's lone "built but not connected" shape (pool 5) is a shape the PLAYER
  PLACED alone; an orphan of a destroyed structure is S157 B2's case, which the owner ruled dies with
  the structure. `componentOf` used to cover it by accident; the own-star raze did not.
- ⚠ applied to the t9 release too (the audit's "decide the same"): same rule, same reason.
- tests: a Triangle dropped on a hub (bonded only to the star) is razed with it, blast still fires;
  the t9 test RE-PINNED — a ring-only weld now goes with the nine, a weld also bonded to an outside
  Dot stands (and the Dot). Mutant (flag removed on both) → both RED; restored. `src/state` 187 /
  3122 EXIT=0.

### fix-round item 1 (audit W1 / W2-4b / W6 / W7) LANDED — a tower's own members are the ones it was BUILT with
- NEW FIELD `ownBondIdLimit` on `CreatureSpawner` AND `Defender` = `world.nextBondId` at
  registration; its own connectors are the recipe's shape among the bonds with a LOWER id. A weld
  (any type, anywhere, minted later) is never one of them → it neither kills the tower nor stands in
  for a cut own connector.
- ⚠ DEVIATION FROM THE FIX-ROUND SHAPE, deliberate: the coordinator proposed `bond.createdTick <=
  sp.ignitedAtTick` for spawners. `ignitedAtTick` is STRIPPED from the wire (`trimMirrorSpawner`) and
  re-seeded to each client's own tick, so on every client every weld would read as "own" and be
  HIDDEN under the sprite (R185-A broken on clients); and a weld dropped in the frame after ignition
  shares its tick. A bond-id watermark is exact and one mechanism serves spawners and defenders alike.
- FOUR SITES (both entities): type + factory (`spawner.ts` `makeSpawner`, `defender.ts`
  `makeDefender`; set at `applyRegisterSpawner` / `applyRegisterDefender`); SAVE + WIRE (`save.ts`
  serialize/deserialize for both, and `trimMirrorSpawner` KEEPS it — identity, not a clock;
  additive-optional, absent ⇒ `null`); HASH (`stateHashFull.ts` Spawner/DefenderHashed + both
  projections `:ob…` — the coverage contract fired `ERROR_UNCOVERED_FIELD` first); WORKER (via the save).
- walks: `starArmsAt(…, bondIdLimit)` counts only hub bonds below the limit; `ringMembersAt(…,
  bondIdLimit)` is the exact O(n) walk over those bonds. `towerMembersAt` reads the live tower's limit
  via NEW `liveTowerLimit(recipe, anchor)` (keyed on the recipe too — W2-4c). No limit (not a live
  tower / pre-S189 save) ⇒ the exact pre-S189 reading.
- ⛔ `ringCycleAt` DELETED (W7 / W2-7): the uncapped per-frame DFS is gone; the three callers
  (`towerRenderer.ringOf`, `towerFrames.towerRingCentroid`, the t9 release raze in `hostTick`) read
  `towerMembersAt(...).whole`. `ringRemainsAt` (crumble only) is a BFS bounded at n−1 hops.
- test harness: `tick()` now clears `world.effects` per frame like the real loop — a fixture's one
  BOND_FORMED had stayed forever, so ignition ran every tick (it re-ignited a levelled turret from its
  surviving shapes in the same BUILD and hid what a cut does).
- tests RE-PINNED: the spare-arm and spare-ring reach tests now assert the tower FALLS; the
  lowest-id arithmetic test → "counts only the arms it was BUILT with"; the ringCycleAt test → "a
  chord-weld bypass never stands in". NEW: a same-type-welded bat tower falls to one own cut; the
  four sites (registration, disk restore + client snapshot keep it, the hash sees both towers', a
  client copy covers only the built arms). Mutants (limit filter removed; wire trim drops it) → RED.
- ⚠ RED BY DESIGN in this commit: the R190-J re-summon test — Helga's contains-ignition on a DEAD
  hall now reads the exact shape (no live tower ⇒ no limit). Item 2 replaces that path with the
  dormant-record revive. Full suite otherwise 6049 / 6050.

### fix-round item 2 (audit W2 / W4, owner ruling R190-J) LANDED — Helga's first build is EXACT again; her hall keeps a DORMANT record and she revives at the phase edge
- `princessHelga.ts` `findBuildableHelgaAnchor` → `isHelgaComponent` (an isolated component of her
  seven). Docblocks rewritten (first build exact; re-summon is the dormant revive).
- NEW `DefenderState` value `'DORMANT'` (`defender.ts`, serialized — rides the bump; no receive
  whitelist exists, grepped). On her kill (`damage.ts` defender arm) the record is KEPT: state
  DORMANT, `ehp = null`, targets/strike/walk cleared. `ehp = null` takes her out of every
  unit-facing path at once (creature targeting `killableDefenderInReach`, raid pick + raid reducer,
  `damageEntity`, her health bar, her sheet + owned-unit row) — all already gate on a pool.
- consumers that read STATE, each handled: `applyDefenderTick` returns early; `hostTick` does not fan
  `DEFENDER_TICK` to her; `standDownDefenders` skips her; `princessRenderer` does not draw her;
  `audioManager` does not hold the Helga theme on for her; `damageNumbers`' "who could have struck"
  scan skips her; `helgaFrame` / `helgaPose` (exhaustive switches — tsc forced them) get an explicit arm.
- NEW `defenderLifecycle.reviveDormantHelgas(world)`, called in `hostTick` at the FIGHT→BUILD edge
  right AFTER that edge's princess sweep (which removes the record of a hall that fell) and BEFORE
  `standDownDefenders`: every DORMANT Helga whose hall's own members stand is rebuilt from the FACTORY
  (full pool, home on her hub, IDLE, opening charge from now) — ascending id, no Map order.
  WHY FIGHT→BUILD: it is the timing she already had (defender ignition runs DURING BUILD, S157 B6
  "only next turn"), so a living hall used to bring her back early in BUILD whenever anyone built;
  the same edge keeps that timing, shows the player she is back for the whole BUILD, and needs no bond.
- side effect, visible and intended: while she is dormant her HALL keeps its ramp art (the record
  still anchors it) — before, her death removed the record, the hall played its destruction ghost and
  its shapes reappeared although it stood. ⚠ And `healthBar`'s structure pass treats a pool-less
  defender as a tower, so a dormant Helga's HALL shows a structure bar until she revives.
- tests (R190-J block): welded hall (the exact test refuses it), she dies in FIGHT → DORMANT with no
  pool for the rest of that fight → cross to BUILD with NO bond formed (asserted on `nextBondId`) →
  she is IDLE with her full factory pool on the same hub → the next FIGHT she fights. Own arm cut
  after her death → the edge sweep removes the record → she never returns, even with building going
  on and another full cycle. Two lattice negatives: a hub with an extra bond, and (the discriminating
  one) an exact hub whose LEAF is bonded into a lattice → no Helga. HOST vs WORKER over a death →
  dormant → revive cycle: wide hash equal every frame, revived on both sides.
- existing tests RE-PINNED (they asserted deletion): `helgaKillable` "this arm REMOVES her",
  `raidHitsAnything` "the last one finishes her", `damageTruthS182` "HELGA killed by a swing" — each
  now asserts DORMANT + no pool. `creatureMaxPool.guard` flagged a direct pool derivation in the
  first revive draft → the revive now takes the pool from `makeDefender` (the sanctioned site).
- mutants: revive call removed → the revive test + the host/worker test RED; first build back on
  `towerStandsAt` → the leaf-in-lattice negative RED. Restored. Full suite 6056 / 368 EXIT=0 before
  the last negative was added.

### fix-round item 6 (audit W8) LANDED — a differential that can see Set order and does cut
- NEW shared `hostWorkerRig(w)` in the weld test file (real worker INIT, lockstep batches, WIDE hash
  compared every frame; clears the per-tick `stiffnessMultiplier` transient before the fork).
- NEW test: welded turret (hub weld) + welded pentagram + same-type-welded race tower forked to the
  worker; EVERY `Primitive.bonds` Set on the WORKER copy is REVERSED after INIT (the JSON save
  rebuilds them in the same order, so the old differential could not see an order dependence; the
  wide hash projects bonds sorted, so any divergence is a real one); inside the window, in FIGHT, an
  OWN turret arm and a pentagram WELD are severed on both sims. Wide hash equal every frame; on both
  sides the turret is gone and the pentagram + race tower stand.
- the death → dormant → revive differential landed with item 2.
- ⚠ honest limit: with identity fixed at registration no survival walk has an order-dependent
  VERDICT any more (member order only affects render lists), so this probe guards the sim as a whole
  rather than a specific walk; the reversed-Set unit test still pins `starArmsAt`'s sort.

### fix-round close — canon notes rewritten (no spare; the built-with rule; Helga's exact build + dormant
revive; owner questions W9/W2-6 carried; the protocol reasons incl. the NEW wire/hash state) + GATES on
the committed tree, each a captured `$?`:
- `npm run typecheck` → TC_EXIT=0
- `npx vitest run --maxWorkers=6` → VITEST_EXIT=0 — 6058 tests / 368 files
- `npm run build` → BUILD_EXIT=0 — 950.4 KiB (base 944.2) = +6.2 KiB of the shared headroom
- e2e NOT run (brief).
- HOTSPOT HUNKS this round: `save.ts` (SerializedSpawner/Defender field, serialize/trim/deserialize
  ×2), `stateHashFull.ts` (two union members + two projection suffixes). No refactor.

## ROUND 4 (audit wf_cd96cb8a-575) — W-FR1..3 fix, W-FR4 document only

### W-FR1 (MED) LANDED — a takeover / worker repair never rewinds nextBondId below a tower's limit
- `migrationClaim.ts` `rebuildAuthorityAllocators`: `nextBondId = max(max(live bond)+1, every live
  spawner's and defender's ownBondIdLimit)`. Both call sites in `main.ts` (takeover ~:3442, worker
  repair ~:3073) already assign `allocs.nextBondId` — no hotspot edit needed.
- test (`migrationClaim.test.ts`): pentagram registered at L with bond L-1 minted elsewhere and then
  razed → rebuilt nextBondId >= L; a same-type weld on node 0 after the takeover gets id >= L and the
  ring stands. Mutant (back to max+1) → RED; restored.

### W-FR2 (MED) LANDED — a Helga finished during BUILD is back for the very next FIGHT
- `hostTick.ts` flipped block: a `matchPhase === 'FIGHT'` arm (the BUILD→FIGHT crossing) also calls
  `reviveDormantHelgas`. Any record still DORMANT there died during BUILD (a FIGHT death was revived
  at FIGHT→BUILD), so S157 B6 still holds for FIGHT deaths. Docblock on the function updated.
- tests: raid-killed in BUILD → still DORMANT for the rest of BUILD → cross into FIGHT → IDLE with her
  full pool; a FIGHT death still waits for FIGHT→BUILD. Mutant (new arm removed) → the BUILD-death
  test RED; restored.

### W-FR3 (LOW) LANDED + W-FR4 DOCUMENTED
- `characterSheetModel.ts` `towerStatsIn`: skips a DORMANT defender (state, not `ehp` — towers have
  no pool either). Test: the hall's sheet lists ATK while she lives, not while she is DORMANT; mutant
  (skip removed) → RED; restored.
- W-FR4 (NOT fixed, per the brief): documented at `ownBondIdLimit` on both `CreatureSpawner` and
  `Defender` — a connector re-made by FIX inside the ≤ 0.5 s before the poll removes a broken tower
  counts as a weld; the tower falls and the repaired shape re-ignites later.

### round-4 gates (committed tree, captured `$?`): typecheck TC_EXIT=0 · `npx vitest run --maxWorkers=6`
VITEST_EXIT=0 (6062 / 368) · build BUILD_EXIT=0 (950.7 KiB, +6.5 KiB of the shared headroom). No
hotspot file touched this round; no protocol edit (the weld bump reasons are unchanged).

## S192 — ROUND 5 FIX ROUND (merge owner brief: fix the digest's "s189/weld ROUND 5" rows, reproduce-first)

### STEP 1 — `git merge master` (master e4d52dc) → merge commit c8d50fe
- CONFLICTS: **none** (textual merge clean; master already held this branch's c7436a2).
- gates on the merged tree, each a captured `$?`: typecheck TC_EXIT=0 · `npx vitest run --maxWorkers=3`
  VT_EXIT=0 — 6723 passed + 7 skipped / 414 files + 2 skipped · build BUILD_EXIT=0 — **982.3 KiB** (master
  972.7 → round 5 = **+9.6 KiB** on the merged base).

### STEP 2 — the round-5 audit rows, reproduce-first (each test RED on the round-5 code, then GREEN)
- **IDENTITY-1 — FIXED ccfa159.** `fallenTowerRegistrationRefused` (per collection, as the register
  reducers de-dup; same-recipe dup among own; race R137; defender BUILD) is the ONE gate for
  `settleTowerIdentity` AND `planStructureRepair` (via `fallenTowerFixCanRegister`) — a FIX that could
  not re-register is never offered, so the reducer never consumes for it. Tests: real-drop W2-4 board
  (FIX → registered → stands, ring untouched); cannot-half-spend contract. Mutants: any-collection gate
  → RED; plan prediction off → RED.
- **IDENTITY-5 — FIXED 6af3832.** `weldedAt` = membership; the card calls `weldedAt` (no second copy).
  Test: pentagram + one real-drop weld on its anchor, both anchor neighbours razed, no tick. Mutants:
  size compare → RED; card inline copy → RED.
- **SHEETS-2 — FIXED 86be927.** `weldHits = []` in `reset()`. Tests: select(null)+sync, SCRAP+sync,
  clear(), REACH through the real Controls (a goblin on the stale row opens the goblin).
- **IDENTITY-4 — FIXED 2fc8005.** `sameUnit` = record identity (live) / equal member arrays (stamps).
  Test: chained goblin towers sharing their lowest shape — each card lists the other.
- **IDENTITY-2 + SHEETS-4 — FIXED 2b6771c.** `towerHitAtPoint` / `rampHitAtPoint` carry the art's
  recipe; `towerClickShapeAt` / `unitClickShape` select the tower's lowest UNSHARED own shape (art arm
  and `weldedRowFor`). Only a shape in the hit tower's component that is not a live tower's own beats
  the art box. Tests: W2-4 rows (state), REACH turret art → LASER TURRET + scoped SCRAP, loose rubble on
  an un-welded art → the tower, weld on the art → structure. Mutants ×3 → RED.
  `characterSheet.wired.test.ts` source tripwire re-pinned (`towerHit` → `named`).
- **SHEETS-1 — FIXED 9af1701.** Stamp groups span the whole component (same blueprint/seat, not a live
  SAME-recipe tower's own, distinct node indices; else the old walk). ⚠ MINE: a group of <= half its
  blueprint is RUBBLE (free-form, SCRAP only) — closes P4b and the IDENTITY-3 case. Mutants ×2 → RED.
- **SHEETS-5 — FIXED b608c71.** Strip icons fall down texture → painter → codex emblem → two letters.
- **IDENTITY-6 / SEAMGATES-3 / SEAMGATES-7 — DONE c39cf83** (doc rows inside this branch's files).
- **WIRE — ecd0eb5.** `ownBondIdLimit` SHIPPED at 52 (deploy #5); a v52 payload's field is deliberately
  not read → `ownPrimitiveIds: null` (exact reading) + migration test; "never shipped" docs corrected.
- **SEAMGATES-1 — NOT REPRODUCIBLE on the current endstats tip**: s191/endstats (d407dbf) already holds
  the DORMANT body + re-pinned reach test. Trial merge weld(c39cf83) × endstats on a throwaway branch:
  ONE conflict, `defenderLifecycle.ts` imports (keep BOTH: `ownSetAtRegistration` + `recordTowerBuilt`);
  typecheck 0, full vitest 0 (6782 passed / 419 files). Branch deleted, nothing kept. Note: a FIX that
  re-registers a fallen welded tower goes through `applyRegisterDefender`/`Spawner`, so it counts
  `towersBuilt` again on endstats' board (same as an un-welded FIX re-ignition today).
- **SEAMGATES-2** (carry prose) — merge owner at the carry merge (false only on the merged tree).
- **SEAMGATES-4/5/6** — merge-owner chores (SPARK_CANON / canon.test.ts / bundle ledger), not touched.

### STEP 3 — FINAL GATES (tree ecd0eb5): TC_EXIT=0 · VT_EXIT=0 (6740 passed + 7 skipped / 414 files)
· BUILD_EXIT=0 — **984.3 KiB** (master 972.7 → branch +11.6 KiB; this fix round +2.0 over the merged base).

## IN-FLIGHT (superseded — see the S191 section's own IN-FLIGHT at the end)
- none — round-4 report delivered.

## NEXT

## DECISIONS
- HYSTERESIS: ignition exact (unchanged), survival contains. Consequence, deliberate: a star welded
  BEFORE it is complete never ignites (unchanged behaviour). ~~and HELGA's re-summon after she is
  killed goes through ignition, so a WELDED hall stands but cannot re-summon her (reported).~~
  ⛔ STRUCK S191 (W-FR5) — superseded by R190-J: her record goes DORMANT and revives at both phase
  edges while the hall's OWN members stand (fix-round item 2, W-FR2).
- ~~"OWN" ARM = lowest bond id per arm type (provable: welds post-date ignition). A surplus same-type
  weld stands in for a LOST own arm ("the shape is there"). So a turret with a 7th spiral welded to
  its hub survives the loss of one spiral — the S140 "builds at six, dies at seven" trap is gone for
  a LIVE turret; ignition still requires exactly six.~~
  ⛔ STRUCK S191 (W-FR5) — THERE IS NO SPARE (audit W1): own = the recipe's shape among the bonds with
  an id below the tower's `ownBondIdLimit`; any own cut levels it, a weld never stands in.
- ~~Race rings (t3/t9) keep R136 for survival — owner ruling + 5 renderer files outside my boundary.~~
  ⛔ STRUCK S191 (W-FR5) — superseded by follow-up item 2: the twelve race rings are on the same
  built-with survival rule (three renderer files, not five).

## NUMBERS THAT ARE MINE
- none. No constant introduced; every count is derived from `blueprints.ts`.

## FINDINGS (reported, not fixed — outside the file boundary)
- F1 (FIXED in follow-up item 1+2) `placePrimitive.ts` S107 P4 `collectSpawnerLockedPrimitiveIds`: auto-bond EXCLUDES a live
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
- F2 `hostTick.ts:856` hub self-raze took the whole welded structure — FIXED in follow-up item 3.

## HOTSPOT HUNKS (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)
- rounds 1-2: none.
- FIX ROUND (audit W1): `save.ts` — `ownBondIdLimit` on SerializedSpawner + SerializedDefender,
  emitted additive-optional by serializeSpawner/serializeDefender, KEPT by trimMirrorSpawner, read
  `?? null` by deserializeSpawner/deserializeDefender. `stateHashFull.ts` — `'ownBondIdLimit'` in
  SpawnerHashed + DefenderHashed, `:ob…` suffix on both projections. (W2: the new 'DORMANT'
  DefenderState needs no hotspot hunk — state is serialized/hashed as a string already.)

## WIRE / HASH / PROTOCOL
- ~~No serialized or hashed field changed.~~ ⛔ STRUCK S191 (W-FR5) — FALSE since fix-round item 1/2:
  `ownBondIdLimit` (SerializedSpawner + SerializedDefender, kept by `trimMirrorSpawner`, wide-hashed)
  and the serialized `'DORMANT'` discriminant; the final list is `S189_CANON_NOTES_weld.md` §H.
  The SURVIVAL RULE is shared: it runs on the host AND the
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

## S191 (brief `.claude/plans/S191_BRIEFS/weld.md`, deploy #5 part 1)

### step 1 — master (deploy #4 7404a49 + bookkeeping, tip 42cc2ee) MERGED into weld
- `git merge --no-ff master` — 163 master commits in, 196 files; auto-merged the four files both sides
  touched (`defenderLifecycle.ts`, `hostTick.ts`, `save.ts`, `stateHashFull.ts`); ZERO conflicts, so no
  resolutions to list. `package.json` changed one npm script only; `package-lock.json` untouched ⇒ the
  worktree's existing `node_modules` is valid (no reinstall).
- (a `grep -c package-lock` exit 1 = zero matches — BENIGN, it is the "no lockfile change" verdict.)

### step 2 — gates on the MERGED tree (cdb5c75), each a captured `$?`
- `npm run typecheck` → TC_EXIT=0
- `npx vitest run --maxWorkers=4` → VITEST_EXIT=0 — **6530 passed + 2 skipped / 397 files + 1 skipped**
  (398). No seam red at all, so nothing to re-pin:
  · `bondTargetIndex.guards.test.ts` (s190/perf) GREEN — no pinned per-file count moved
    (`placePrimitive.ts` still 3 `bonds.set(` / 1 `nextBondId++` / 1 `nextPrimitiveId++`; the
    `.clear()` trio unchanged). The cache invariant it guards still holds on this branch: every weld
    bond is born through `makeBond`, and every removal this branch added (the own-star hub raze, the
    t9 own-ring raze, the orphan sweep) goes through `razePrimitives` — sizes drop, the fingerprint sees it.
  · `canon.test.ts` GREEN (62) — no pinned assertion contradicts a weld rule. The canon TEXT that the
    weld rules change (§7b R185-B wording, §8 limit 2) is carried in `S189_CANON_NOTES_weld.md`.
- `npm run build` → BUILD_EXIT=0 — **962.4 KiB** / 1100 cap (137.6 headroom); master 955.9 ⇒ weld = **+6.5 KiB**.

### step 3 — THE DORMANT SEAM CENSUS (master's code since 15035b9 × `'DORMANT'` / `ownBondIdLimit` / `towerMembersAt`)
METHOD (mechanical): `git diff --name-only 15035b9 master -- src | grep -v test` = 54 files; in each,
the brief's pattern over the WHOLE file (21 files hit), then over master's ADDED code lines only, then a
wider pattern over the added lines (`defender|helga|spawner|.ehp|componentOf|towerMembers|.bonds|
anchorPrimitiveId|ringMembers|isStarAt` and `damageEntity|radial|killable|damageConnector|severBond|
razePrimitives|creatureSpawners|world.defenders`); every hit read in the merged tree, plus every
production `world.defenders` reader (42 sites) re-checked for a hunk master touched. Most of master's
new code never reads a defender or a tower's membership; the rows that do, and the brief's named ones:

| # | file:line (merged tree) | reads what | DORMANT-safe? (why) | weld-safe? (why) |
|---|---|---|---|---|
| 1 | `defenderLifecycle.ts:362` patrol `clampPointIntoPlayfield` + `defenderMotion.ts:65` verlet clamp (s189/units C8) | Helga's IDLE patrol point, her integrator | YES — reached only from `applyDefenderTick`, which returns at `:180` for DORMANT (and `hostTick` does not fan `DEFENDER_TICK` to her); the revive sets her on her hub exactly as a first build does (`makeDefender` copies `pos`) | YES — `homePos` is her anchor; no membership |
| 2 | `damageNumbers.ts:264` `fatalBlowFifths` defender scan (s189/render + draft-atk) | who could have struck a dying creature | YES — `:264` skips DORMANT (round 2) | n/a |
| 3 | `damageNumbers.ts:535` creature hit/heal watch (R190-I) | `Creature.ehp` + `healedFifths` | n/a — creatures only | n/a |
| 4 | `damageNumbers.ts:759` structure watch `d:<id>` (S182 track × R190-J same-id revive) | `Defender.ehp` | ⛔ **NO → FIXED.** A kill + revive with no sync between them (one host render frame; one 10 Hz snapshot gap on a client — a kill within ~100 ms of a phase edge) never shows the DORMANT frame: the watch saw "dented" then "full", printed a GREEN heal of the difference and dropped the kill. Now a pool RISE on a `d:` key is swept as the vanish it was (recorded swing, else the remainder — the vanish sweep's own peer fallback) and re-seeded. Nothing else raises `Defender.ehp` (grepped: the only writer is `reviveDormantHelgas`) | n/a |
| 5 | `creatureAttack.ts:310` defender arm, `creatureAttackFifths` (draft-atk) ← `creatureAI.ts:1036` `killableDefenderInReach` | `Defender.ehp` | YES — `ehp === null` skipped at `creatureAI.ts:1036`; `damage.ts:325` returns before `applyLifesteal` | n/a |
| 6 | `defenderLifecycle.ts:485` Helga's own strike `attackFifths(config.atk, config.pen)` | — | unreachable while DORMANT (row 1); unbuffed = SANCTIONED R190-E | n/a |
| 7 | `powerOfRa.ts:204` Ra column unit arm `applyRadialDamage` → `damage.ts:700/748` (s188/wrath) | defender pos + `ehp` | YES — **PROVEN** (`weldDormantSeamsS191.test.ts`): a real column through `runHostTick`→`racialTick`→`runPowerOfRa` lands on a DORMANT Helga with a CONTROL unit in the same column (it loses exactly `RA_STRIKE_FIFTHS`); her record stays DORMANT/`ehp` null, no second `structureKillHits` entry, and she still revives at the edge. Mutant (`damage.ts:325` gate removed) → RED | YES — the connector arm hits every enemy bond in the radius, own or weld, each priced by `damageConnector` against its component (R185-B: *"destroys the connectors that he's attacking"*); survival is then the poll's own-member verdict |
| 8 | `suicideBlast.ts:106`, `droneLifecycle.ts:201` radial (draft-atk `creatureAttackFifths`) | same defender arm as row 7 | YES — the same `damage.ts:325` gate row 7 proves | n/a |
| 9 | `apexPredator.ts:47` `towerUnitForSeat` (s188/swarm) ← `hostTick.ts:1184`, `goblinTowerFeed.ts:184`, `characterSheetModel.ts:1363` | the owner seat's perks + the base type | n/a | YES — reads the spawner's OWNER only; WHICH spawner emits is the survival poll's (`towerStandsAt`), WHICH is fed is `seatFeedTowerAt` (total order, round F2); emit position = the anchor |
| 10 | `creatureAI.ts:559` bond-target index `buildColourBucket` (s190/perf) | every bond, bucketed by `placerColor` | n/a | YES — colour buckets, no tower membership: an own connector and a weld are both targets (R185-B). Fingerprint exact: this branch's new removals go through `razePrimitives`; guards test green (step 2) |
| 11 | `botRa.ts:76` bot Ra aim (s188/wrath) | non-own bonds + enemy creatures | YES — a DORMANT Helga is in neither list | YES — no membership read |
| 12 | `characterSheetModel.ts:623` `statRowsFor(…, own)` (draft-atk) | creature sheet only | n/a | n/a |
| 13 | `hellspawn.ts:118` child `sourceSpawnerId` (s188) | an id, not a spawner lookup | n/a | YES |
- FIX (row 4): `damageNumbers.ts` defender arm of `syncStructures`. TEST
  `src/render/damageNumbersHelgaReviveS191.test.ts` — real hall, real kill, real FIGHT→BUILD edge, no
  sync between: prints the kill (`300`), no green; control: a sync that sees DORMANT prints the kill
  once, nothing on the revive. MUTANT (rise branch disabled) → RED with the predicted green `12`; restored.
- ⚠ OUT OF CENSUS, NOTED FOR ROUND 5 (not master's code, pre-existing): `characterSheetModel.ts`
  `structureSheet` walks `componentOf(prim)` and `towerStatsIn` / `auraOwnerIn` / `ownedUnitRow` take
  the FIRST defender in `Map` order in that component — with two welded towers the sheet shows one
  tower's ATK / aura for the other. Round 5 (R191-A tower vs structure sheets) replaces this path.
- runs: typecheck TC_EXIT=0; `src/render` + both weld test files — 115 files / 1956 tests EXIT=0.

### step 4 — W-FR5 doc chores (my files only)
- this file: the three stale DECISIONS lines (Helga re-summon through ignition, the spare arm, race
  rings on R136) and the "No serialized or hashed field changed" WIRE line STRUCK through with the
  ruling/round that superseded each (kept visible, not deleted, so the audit trail reads).
- `S189_CANON_NOTES_weld.md` §B + §G: `ringCycleAt` → `towerMembersAt(...).whole` (+ `towerFootprintAt`
  for the ground zone / aura); §E: the `blueprintGroupOf` reason is WRONG now, not just dated — the
  suggested replacement text, and the note that round 5 (R191-A) rewrites that docblock with its change.
- two stale CODE comments in my own files named the deleted `ringCycleAt`: `structureRamp.ts:114`,
  `hostTick.ts:1228` → `towerMembersAt(...).whole`. Comment-only; the 19 test files that read either
  file's source text: 488 tests EXIT=0.

### step 5 — the protocol reasons for 52, final list → `S189_CANON_NOTES_weld.md` §H
- (A) `ownBondIdLimit` on SerializedSpawner + SerializedDefender (wire-kept, wide-hashed); (B) the
  serialized `'DORMANT'` discriminant — VERIFIED against master's `helgaFrame.ts`: its switch has no
  default, so a v51 client's `syncSprite` hits `undefined.state` (TypeError) every frame; (C) 8 shared
  rules incl. the step-3 damage-number rule. Each with its file:line in the merged tree.

### step 6 — FINAL GATES on the committed tree (4ff87c6, `git status` clean), each a captured `$?`
- `npm run typecheck` → TC_EXIT=0
- `npx vitest run --maxWorkers=4` → VITEST_EXIT=0 — **6533 passed + 2 skipped / 399 files + 1 skipped** (400)
- `npm run build` → BUILD_EXIT=0 — **962.6 KiB** / 1100 (137.4 headroom); master 955.9 ⇒ weld **+6.7 KiB**
- e2e NOT run (brief). Steps 1-6 DONE. Per the merge owner's message, round 5 (R191-A) follows
  instead of stopping; round 6 (R191-B) is QUEUED until "round 6 go".

## ROUND 5 — R191-A, the owner's welded-structure rules (R185-B amended)

### R5-0 — THE DESIGN (written before any code)
- ⛔ IDENTITY — **a tower's own members are its own PRIMITIVES, and its own connectors are the bonds
  between them.** Every spawner/defender records `ownPrimitiveIds` (ascending, anchor included) at
  registration — the exact shape at the anchor (ignition is exact: a star = hub + every hub neighbour,
  a ring = the exact walk) — REPLACING `ownBondIdLimit`. Star: stands iff the hub + every own leaf
  stand, types match the recipe, and each own leaf still has a bond to the hub (ANY id). Ring: stands
  iff the n own nodes stand and the bonds among them close one n-cycle. WHY PRIMITIVES, NOT BONDS: a
  bond id changes on every re-weld (FIX mints a new one — W-FR4), a primitive id changes only when a
  NODE is re-minted, which FIX does itself and records in the same reducer; and no bond can ever join
  two EXISTING shapes except a recipe edge (placement bonds only the NEW shape; FIX re-welds only
  blueprint edges), so "a bond between two own shapes" is own by construction, whatever its id. A weld
  can never be an own primitive. Four sites (factory, save + `trimMirrorSpawner` keeps it, wide hash,
  worker via the save); absent ⇒ the exact pre-S189 reading. The W-FR1 floor moves from `nextBondId`
  to `nextPrimitiveId` (a razed own shape's id must not be re-issued while its record lives).
- THE TOWER UNIT (one read model, `towerUnitAt(world, prim)`, used by the reducers AND the sheet):
  the live tower whose own members hold `prim` (lowest spawner id, then lowest defender id), else —
  for a stamped shape (`origin`) — its STAMP GROUP (the shapes of the same blueprint reachable through
  bonds between stamped shapes: a fallen stamped tower), else `null` (a free-form shape).
  WELDED ⇔ the component holds shapes outside that unit (or, for a free-form click, holds any tower).
- REDUCERS — no new action, no new field: `REPAIR_STRUCTURE` / `SCRAP_STRUCTURE` infer the scope from
  the clicked shape, the same way the sheet does. UN-WELDED: byte-identical to today. WELDED + tower
  shape: FIX = that unit only (bill = what IT lost, R13 / R182-E; heal its own shapes + own connectors;
  a live record's own set gains the re-minted ids; a FALLEN welded stamp is re-registered directly —
  exact ignition can never see a welded tower — with anchor = hub / lowest ring id, the matcher's own
  rule, so the matcher's de-dup still holds later). SCRAP = that unit's own shapes only (a shape
  another live tower also owns stays — ⚠ MINE). WELDED + free-form shape: SCRAP = the whole component
  (towers included); FIX refused (plan null + reducer no-op).
- SHEETS (render model): tower-in-weld → that tower's card (own CONNECTORS/SHAPES/pool, own
  ATK/aura/Helga/FEED) + a WELDED strip "part of a welded structure cur / max" + small icons of the
  OTHER towers (clickable); free-form in a weld → WELDED STRUCTURE card: its pool, shape counts by type,
  connector count, every tower (icon, name, own pool/max; live by spawner id then defender id, then
  fallen stamps by lowest id), each row clickable (re-uses `ownedRowAt`'s path, no controls change). A
  visible (non-own) shape under the cursor now beats the tower art box, so a weld on the art is
  clickable. ONE function per number (`towerOwnHealth`, `structureHealth`), no second derivation.
- COST, file by file (estimate): spawner.ts/defender.ts + both lifecycles (~40) · towerMembers.ts +
  starShape.ts + ringShape.ts (~110) · save.ts + stateHashFull.ts hotspot hunks (~20) ·
  migrationClaim.ts (~10) · NEW state/towerUnit.ts (~150) · structureRepair.ts (~120) ·
  characterSheetModel.ts (~160) · characterSheet.ts (~110) · structurePanel.ts FEED gate (~5) ·
  controls.ts click order (~15) · tests (~700). ~1 working day; bundle est. +3–5 KiB (⚠ on top of
  weld's +6.7 — reported, not hidden).
- ⚠ Round 6 (repair job, queued) plugs in at ONE seam: `applyRepairStructure`'s restore half becomes
  the job's on-arrival step; the plan (unit, bill) is unchanged, so this design does not corner it.

### R5-1 — IDENTITY: `ownBondIdLimit` → `ownPrimitiveIds` (W-FR4's root closed)
- four sites: `spawner.ts` / `defender.ts` field + factory (sorted copy); registration
  (`applyRegisterSpawner` / `applyRegisterDefender`) records `action.ownPrimitiveIds ??
  ownSetAtRegistration(...)` (NEW, `towerMembers.ts`: the EXACT shape at the anchor, else null);
  `reviveDormantHelgas` carries it; SAVE + WIRE (`save.ts`: both Serialized types, both serializers,
  `trimMirrorSpawner` KEEPS it, both deserializers `?? null`); HASH (`stateHashFull.ts`: both unions +
  `:op<ids.join('.')>` in both projections); WORKER via the save.
- walks: `starArmsAt(…, own)` — an arm = a hub bond to an OWN leaf, any id; `ringMembersAt` /
  `ringRemainsAt` / `sameTypeNeighbours(…, own)` — only own neighbours; `liveTowerLimit` →
  `liveTowerOwnSet`; `cycleBonds` / `bondsWhollyInside` lose the id filter (both ends are own).
- `migrationClaim.ts` W-FR1 floor: `nextPrimitiveId` ≥ every live record's own id + 1; `nextBondId`
  back to `max(live)+1` (bond ids carry no identity now).
- tests RE-PINNED (not relaxed): the arm test now also re-welds the cut arm with a NEW bond id and
  asserts it is own again (the W-FR4 case, unit level); four-sites block → `ownPrimitiveIds`
  (factory, disk + client snapshot keep it, hash flips on either); ring test asserts the recorded set;
  `migrationClaim.test.ts` W-FR1 → the primitive floor (highest own node razed in the window, takeover,
  a Triangle bridging the gap gets a NEW id and does not close the ring).
- mutants: own filter removed from `starArmsAt` → 2 RED (spare arm stands in); prim floor removed → the
  migration test RED. Restored.
- runs: typecheck 0; `src/state src/net src/render src/bots` 359 files / 5800 tests EXIT=0 (netWireSize
  budgets included — the id array fits).
- HOTSPOT HUNKS: `save.ts` (the two Serialized fields, 2 serializers, trim, 2 deserializers — field
  rename, self-contained); `stateHashFull.ts` (2 union members, 2 projection suffixes).

### R5-2 — the tower unit + scope-inferred FIX / SCRAP (R4, R5) + R6 verified
- NEW `src/state/towerUnit.ts` (side-effect-free): `towerUnitAt` (live tower by own shapes — spawners by
  id then defenders by id — else the STAMP GROUP of a stamped shape, else null), `stampGroupAt`,
  `structureTowersAt`, `weldedAt`, `recipeConnectorCount`, `towerOwnHealth`, `structureHealth`,
  `structureComposition`, `sharedWithOtherTowers`.
- `structureRepair.ts`: NEW `reclaimScopeAt` (WHEN/WHERE + ownership over the WHOLE component in both
  scopes — S152's foreign-shape rule is not bypassable by tower scope); `planStructureRepair` /
  `planStructureScrap` take their members from it and carry `scope` (+ `unit`); a welded free-form
  click → FIX null (R5); tower SCRAP drops shapes another live tower is built of (⚠ MINE);
  `applyRepairStructure` → NEW `settleTowerIdentity`: a LIVE record adopts the restored stamp's shapes
  (a re-minted node joins), a FALLEN welded stamp is registered directly (`applyRegisterDefender` /
  `applyRegisterSpawner` with explicit `ownPrimitiveIds`; anchor = hub / lowest ring id — the matcher's
  own pick; gates: stands as its recipe on its own shapes, no live tower of it anchored there, race
  tower only for its race, defender only in BUILD). The stale `blueprintGroupOf` reason rewritten (§E).
- UN-WELDED structures: byte-identical path (the component IS the tower). Every pre-existing
  repair / panel test green except the ones that pinned R185-B's old "one weld = unfixable" — RE-PINNED:
  `weldOntoTowerS189` (dented welded turret: weld-click refused, tower-click heals only its own arm, the
  weld's damage untouched, SAME defender stands; two bat towers: weld-click refused, tower A's FIX heals
  A only), `structurePanel.test` (the free-form member of a stamp → SCRAP only; a stamped member of that
  welded structure → the tower's FIX — new case).
- NEW tests (weld file, 12): W-FR4 window (cut arm → tower FIX re-welds, NEW bond id, SAME turret after
  two polls) + control (no FIX → falls); FALLEN welded turret → FIX from its remains re-registers it
  (own set = 6 survivors + the re-minted leaf, never the weld or the cut-off loose leaf) → stands;
  tower SCRAP (weld + goblin tower stay, refund = its own 6 spirals); structure SCRAP from the weld
  (everything); structure FIX from the weld (plan null, wide hash unchanged); R6; host-vs-worker over
  cut → tower FIX → stand (wide hash equal every frame); leaf RAZED in the window → FIX re-mints, the
  record adopts it, SAME turret stands; shared-leaf SCRAP (lightning hub + stink tower sharing a Circle:
  the Circle stays, the hub stands).
- ⭐ R6 VERIFIED, NO CODE CHANGE: `damageConnector` banks on the attacked bond against the COMPONENT's
  pool and returns "sever" for THAT bond (targeted bond drained first). REACH test through the real host
  tick: a P1 chewer at the welded turret's far edge (structure pool 204) severs a TURRET connector; the
  turret falls, the goblin tower stands.
- mutants (all RED, restored — `mutants.py` in the scratchpad): M1 scope always 'structure' → 8 RED ·
  M2 fallen stamp not re-registered → 1 · M3 live record keeps the dead id → 1 · M4 shared shape
  scrapped → 1 · M5 structure SCRAP = the clicked shape only → 1. R5's FIX refusal is enforced twice
  (explicit welded check + `blueprintGroupOf`'s origin-null refusal — a free-form shape has no origin by
  definition), so its explicit line is redundant by construction; not mutation-distinguishable.
- ⚠ FOUND, NOT MINE (reported): a castle unit spawned before a save round trip comes back with a
  different `Creature.spawnedAtTick` (host `sa1`, worker `sa0`) — the worker INIT wide hash differs.
  The differential clears setup creatures; units born inside the window compare equal.
- gates: typecheck 0 · FULL vitest 0 = 6544 + 2 skipped / 399 + 1 skipped files.

### R5-3 — the two cards (R2, R3 + the addendum) and the click
- MODEL (`characterSheetModel.ts`): `CharacterSheetView.welded?: SheetWelded | null` (absent on every
  other card). `structureSheet` branches through the SAME read model as the reducers: tower-in-weld →
  NEW `weldedTowerSheet` (its own CONNECTORS / SHAPES, `health` = `towerOwnHealth`, its own aura /
  spawn / ATK via the shared `towerRowsFor`, its own Helga row, its own FIX / SCRAP / FEED, subtitle
  `… · WELDED`, `welded = {role:'tower', structure: structureHealth(comp), towers: the OTHER towers}`);
  free-form weld → NEW `weldedStructureSheet` (title WELDED STRUCTURE, `health` = the structure pool,
  CONNECTORS / SHAPES + one row per shape type, SCRAP only, `welded = {role:'structure', towers: ALL}`).
  Rows: `weldedRowFor` (codex name, portrait, own pool, `down` for a fallen stamp) — ordered spawners
  by id, then defenders by id, then fallen stamps. `weldedBlockHeight` feeds `heightFor`.
  ⚠ MINE: `WELD_STRIP_H` 50, `WELD_ICON_PX` 22, `WELD_ROW_H` 26, `WELD_MAX_ROWS` 6 (then "+N MORE").
- `towerRowsFor` (NEW) — the aura / spawn / emplacement rows, ONE copy for the plain card and the
  welded-tower card. (The first cut duplicated the emplacement `attackFifths` — `creatureStrike.guard`
  went RED on the count, correctly; de-duplicated rather than re-pinned. `auraStats.test`'s literal
  tripwire RE-PINNED to the helper's call AND the plain card's call into it.)
- RENDERER (`characterSheet.ts`): `drawWelded` after the owned row — tower role: "PART OF A WELDED
  STRUCTURE", `cur / max`, a bar, a row of the other towers' portrait icons (a small Sprite pool,
  texture from the card's own `portraitSource`, two letters if the atlas has not loaded); structure
  role: "TOWERS IN IT · n" + one row per tower (icon, name, own `cur / max` or DOWN). Every icon / row
  is recorded as drawn and `ownedRowAt` returns its target — the existing re-aim path, so NO controls
  change was needed for the rows. `getUiPoints().welded` added for the e2e seam.
- FEED (`goblinKinds.seatFeedTowerAt`): only the tower whose OWN shapes hold the clicked shape — the
  "else lowest spawner id" fallback put a welded goblin tower's FEED on the turret's and the weld's
  cards (mutant S3 shows exactly that: 8 buttons on the turret card). Un-welded: unchanged.
- CLICK (`controls.ts`): a shape under the cursor that is NOT a live tower's own (a weld, loose
  rubble) now wins over the tower art box — a weld sits ON the art at full opacity (R185-A) and the box
  swallowed its click.
- TESTS: `src/render/weldedSheetsR191A.test.ts` (4): each tower card = own pool + total + the other
  tower, a dent on one moves its own pool and the total, never the other's; the weld card = pool,
  composition, both towers in order with own pools, SCRAP only, a row opens that tower; a standalone
  tower has no welded block; REACH through the real `Controls.onDown`: the Triangle ON the turret art
  opens the structure card, the art opens the tower card. `src/render/weldedSheetRows.test.ts` (1): the
  real `CharacterSheet.sync` draws 2 rows inside the card rect and `ownedRowAt` on a row → that tower.
- mutants (RED, restored): S1 weld-first click off → the weld click opens the tower · S2 welded branch
  off → 2 RED · S3 FEED fallback back → 2 RED · S4 row hit-test off → RED.
- gates: typecheck 0 · FULL vitest 0 = 6549 + 2 skipped / 401 + 1 skipped · build 0 — **972.0 KiB**.
  ⛔ BUNDLE: round 5 = **+9.4 KiB** (962.6 → 972.0); the weld branch is now **+16.1 KiB** over master
  (955.9) against the ≤ 10 KiB per-branch guidance. REPORTED, not hidden, not contorted to fit
  (128.0 KiB of charter headroom remains).

### RESUME NOTE — an org spend limit stopped the session mid-R5-4 (canon notes). On resume
`git status` showed exactly one uncommitted file, `S189_CANON_NOTES_weld.md`, = the intended R191-A
notes edit, fully applied. INSPECTED, coherent; one wording slip fixed ("bonds below its
ownPrimitiveIds" → "the bonds among") and committed (ac9b209). Nothing reverted.

### R5-4 — canon notes + a self-audit defect found and fixed
- `S189_CANON_NOTES_weld.md`: identity text → `ownPrimitiveIds` (§A, §G, §H-A); R185-B marked AMENDED;
  NEW §I (the owner's words, R185-B as amended, the click → card / FIX / SCRAP / FEED table, the
  fallen-stamp rule ⚠ MINE, the unchanged "FIX needs provenance" rule, suggested canon assertions,
  §8 limit 2 superseded); §H reasons 9-11 (scope-inferred FIX/SCRAP semantics, FIX re-registers /
  amends identity, the render-side FEED / click / cards).
- ⛔ DEFECT FOUND BY SELF-AUDIT (before any auditor): R5-2 only settled identity in TOWER scope. An
  UN-welded stamped tower that loses a NODE inside the poll window and is FIXed gets a re-minted shape
  the record never adopted → the poll levels it. Master's survival test was exact, so on master this
  path worked: a REGRESSION this branch would have shipped. Fix: `settleTowerIdentity` updates a LIVE
  record in BOTH scopes (recipe + anchor-in-group checked); re-registering a FALLEN stamp stays
  tower-scope only (un-welded stamps are left to the matcher as before). Test: "a stamped turret
  loses a LEAF inside the poll window, FIX re-mints it: the SAME turret stands" (un-welded); mutant
  (tower-scope-only settle) → RED ("the record adopts it"). Restored.
- `makeBond` call sites re-enumerated to back the "own by construction" claim: `placePrimitive.ts`
  ×3 (all bond the NEW shape), `blueprintBuild.ts` (fresh stamp nodes only), `structureRepair.ts`
  (blueprint edges of the group). No path bonds two pre-existing shapes of different towers.

### ROUND 5 FINAL GATES (committed tree 39083cc, `git status` clean), each a captured `$?`
- `npm run typecheck` → TC_EXIT=0
- `npx vitest run --maxWorkers=4` → VITEST_EXIT=0 — **6550 passed + 2 skipped / 401 files + 1 skipped**
- `npm run build` → BUILD_EXIT=0 — **972.1 KiB** / 1100 (127.9 headroom) — weld branch **+16.2 KiB** over
  master 955.9 (round 5 = +9.5) ⚠ over the ≤ 10 KiB guidance, reported.
- e2e NOT run. Round 6 (R191-B) QUEUED — not started; the owner's S191 refinement (no shape available
  → gatherers keep gathering, a job waits for availability; a repair in flight at FIGHT waits in the
  castle with the shape and lands after the next BUILD starts) is recorded for when it is released.

## IN-FLIGHT
- none — round 5 report delivered. Round 6 waits for "round 6 go".

## S192 RE-AUDIT ROUND (coordinator: X1, X2, L1, notes §H; NOT carry's structureBarHealth.ts)
- DONE: none yet. X1 test added (RED, reproduces: row → SCARAB TOWER). X2 test written (RED, reproduces:
  unit members [0,1,2,3,4,6,12]) and parked at `.claude/plans/S192_reaudit_X2_test_block.ts.txt`.
- IN FLIGHT: X1 fix in `towerUnit.ts` `unitClickShape` (stamp → lowest member no live tower owns).
- RESUME: 1) X1 fix + mutant + commit; 2) append the parked X2 block to weldOntoTowerS189.test.ts, fix
  `stampGroupAt` whole-component mode (each candidate fits its node slot under `fitBlueprintFrame`
  within tolerance, else bond walk), mutant, commit; 3) L1 save.ts validate+sort ownPrimitiveIds +
  test; 4) notes §H rewritten for the NEW bump (after 53); 5) gates typecheck / vitest --maxWorkers=3 /
  build, exit codes to files.
- ⏸ PAUSED (owner order, usage limit). DONE: X1 FIXED 5a54ed4 (unitClickShape for a stamp = lowest
  member no live tower owns; test red→green). NEXT STEP EXACTLY: append
  `.claude/plans/S192_reaudit_X2_test_block.ts.txt` to `src/state/weldOntoTowerS189.test.ts` (run it:
  RED, unit members [0,1,2,3,4,6,12]); then in `towerUnit.ts stampGroupAt` whole-component mode accept
  the candidates only if every one fits its node slot under a Procrustes fit (`fitBlueprintFrame` /
  `frameToWorld` live privately in structureRepair.ts — towerUnit must not import structureRepair
  (cycle) → export a pure fit from a small shared module or duplicate it in towerUnit with a pinned
  tolerance ⚠ MINE), else fall back to the bond walk; mutant; commit. Then L1, notes §H, gates.
  Nothing running in the background.
- ▶ RESUMED. X2 FIXED 22cfa03 (whole-component grouping needs every candidate in its node slot of ONE
  Procrustes-fitted stamp, ⚠ MINE tolerance 0.5 × min node spacing, else the bond walk; mutant RED).
  L1 FIXED adc71ff (`save.restoredOwnIds`: non-negative integers else null, sorted; mutant RED).
  NOTES 98a44d7 (§H = the NEW bump after 53, six reasons + paste-ready docblock; 52-era text removed).
  carry's `structureBarHealth.ts` NOT touched (SEAM-C7 waits for the carry merge).
- GATES (tree 98a44d7): TC_EXIT=0 · VT_EXIT=0 (6743 passed + 7 skipped / 414 files) · BUILD_EXIT=0 —
  985.4 KiB. IN-FLIGHT: none.

## S193 — merge master + SEAM-C7 (coordinator brief)
- step 1 — `git merge master` (71abc27, 233 commits) → 6e9b57e, **0 conflicts** (auto: controls.ts,
  characterSheetModel.ts, save.ts, stateHashFull.ts). TC 0 · vitest 0 (7277+11 / 472+4) on the merged tree.
- step 2 — SEAM-C7 census: master's `structureBarHealth.ts` already walks `towerMembersAt`, so it read
  weld's `ownPrimitiveIds` automatically — but it PRICED the walk a second time (`pool(own.bonds.length)`)
  and picked the tower a second way (lowest anchor), beside weld's `towerUnit.towerOwnHealth`. Conflicts
  in meaning (not text) and their resolution:
  | site | master (carry) | weld | resolution |
  |---|---|---|---|
  | bar `structureBarHealth.towerOwnHealth` | pool(own connectors left) − banked | — | → `towerOwnPoolAt` |
  | lone card `structureHealthAt` | lowest-anchor live tower whose walk holds the shape | — | → `towerUnitAt` + `towerOwnPoolAt` |
  | welded card / rows `towerUnit.towerOwnHealth` | — | recipe pool, 0 if !whole | → `towerOwnPoolAt` |
  | welded CONNECTORS row | — | own `towerMembersAt` walk | → `towerOwnPoolAt().connectors` |
  | bar loop `healthBar.ts` | one tower per anchor (`liveBarTowers`) | W2-4 shared anchors exist | → `liveBarTowersByAnchor` |
  | ramp art `rampHealthFrac(rampMembersAt)` | towerMembersAt walk, 0 if a connector is missing | — | unchanged; asserted equal |
  | `severWithCarry` CARRY-1 | owner-scoped candidates | per-tower FIX/SCRAP | unchanged; REACH-tested |
  Committed 35ae4e3. Tests f1cff75 (5 + 3 mutants RED).
- step 3 — gates (above). Failed commands this round and their verdicts: (1) a `cat >` with no stdin hung
  a shell for 120 s, then stopped by hand — benign, my own typo, nothing ran; (2) the first seam-test run
  RED ×3 — test-side: `row.health` carries `frozen`, the race ring's bar takes the art-width floor, and
  the first overkill (pool + 30) could not fell a second connector (the re-formed pool(n−1) > 30) — all
  three fixed in the TEST, not the code; (3) a quote lost in a heredoc broke the transform once — fixed.

## ROUND 6 — PLAN SKETCH ONLY (not started; waits for the coordinator's "round 6 go")
Owner: R191-B (FIX = gatherer jobs: N shapes = N tasks across gatherers; source per task = the NEARER of
quarry / castle bank that HOLDS the type; queued; no shape → keep gathering, fetch when one appears; a
repair in flight at FIGHT waits in the castle and lands next BUILD) + R192-W1 (castle FIX ALL button:
"first go and fix all the existing towers before continuing to gather").
- SEAM (designed in R5-0): `applyRepairStructure` splits into PLAN (unchanged: unit, bill — the tower
  scope / structure scope reads `reclaimScopeAt`) and RESTORE (becomes the on-arrival step). A new
  `REPAIR_STRUCTURE` semantics = enqueue a repair JOB {seat, target unit key (live ref | stamp lowest id),
  bill remaining[], delivered[]}; one job per tower (re-click = no-op), FIX ALL = enqueue every own
  damaged/fallen tower in a total order (lowest anchor id).
- gatherers: `orderForGatherer` / `pickGathererTarget` get a repair-task tier ABOVE orders (owner: "top
  priority"); task assignment = lowest gatherer id free → nearest source holding the type (squared
  distance, then id); bank debited at PICKUP (escrow pattern already exists: `gathererEscrow.test.ts`);
  delivery at the tower's anchor → `delivered += type`; when bill complete → RESTORE (heal + settle
  identity). Tower death mid-job → cancel + refund carried/delivered to the bank.
- FIGHT edge: a gatherer carrying a repair shape at FIGHT shelters with it (existing SHELTERED state) and
  resumes at BUILD; a job never restores during FIGHT (FIX is BUILD-only today).
- four sites: the job list on World (factory + save/net + wide hash + worker) → another BUMP reason
  (new required serialized state + action semantics). Castle panel: FIX ALL button (+ hit-test pairing,
  the S182 fill-count rule). Estimate ~1.5–2 days; bundle +4–6 KiB against 52 KiB headroom — flag.
- open (MINE defaults to report): carry capacity (as today, multi-trip); one job per tower; FIX ALL order.

## S193 ROUND 6 — R191-B + R192-W1 (coordinator "round 6 go")
- step 0 — `git merge master` (62b83e0, five plan files) → 4aaf81a, 0 conflicts.
- step 1 — types + four sites (e49b10d): `repairJobTypes.ts`; `World.repairJobs` / `nextRepairJobId`,
  `Gatherer.repairTask`; factory, save (disk + wire; validated restore), wide hash (+ unions), worker
  `structuralSignature`, every teardown site.
- step 2 — `repairJobs.ts` + plumbing (d560402): queue / FIX ALL / per-tick check-move-finish-assign;
  the `FIX_ALL` intent (world union + dispatch, both protocol allowlists, bench + elimination deny);
  `applyRepairStructure` split into consume + `restorePlannedRepair`; `restoreFromDelivered`; the shelter
  keeps a shape in hand; the haul cycle skips task holders; `tickRepairJobs` before the fan-out.
- step 3 — UI (6425bd5, 6e508b2): the FIX button reads the queue; the castle FIX ALL row first; main.ts.
- step 4 — tests (cba6759, 1f8e376, 006eafe, f10f21c, 054896f) + mutants M1-M9 RED.
- failed commands and their verdicts: (1) the first suite run RED ×5 — `canon.test` §3d (FIX ALL
  appended under the stat rows → moved to the TOP row, canon untouched), the hash family list
  (re-pinned: a forcing function), 3 panel affordability cases (re-pinned to the job semantics);
  (2) the first REACH draft RED ×7 — the test helper ran the matcher BEFORE the host tick, so a restore
  inside the tick never armed ignition (production runs host tick → matcher → wipe; the helper now does
  too), and a full-world hash diff after a disk `restore` (bond ids re-keyed by `restore` — pre-existing,
  not this branch) → replaced by field-level + job/gatherer-part equality, an heir that finishes the job
  and a two-run determinism differential; (3) the goblin tower's fee unfunded → the job correctly WAITED
  (no source) — the test now funds `repairFeeShapeFor`; (4) mutants M3 / M6 survived the first draft →
  the off-the-haul-cycle guard and the exact cancel refund were added; (5) gates chained after a red test
  → typecheck and build RED on an unused binding (TS6133) — fixed; all three re-run separately → 0/0/0;
  (6) a bash heredoc with nested quotes failed to parse (exit 2) — nothing ran; rewritten as files.

## S193 AUDIT FIX ROUND (verdict FIX FIRST; auditor notes in `.tmp-audit/`, untouched)
- step 0 — merges: 110c17a (master 58: zombies + lobby-ci), 059e…/`merge 59` (endgame), then b72e779
  (visuals-2) — all textually clean; `npm install` after each.
- 1 MED e2e literal (0f70ac6): `e2e/castle-panel.spec.ts` — EIGHT rows, `fixAll` first.
- 2 MED zombies T11 seam (f320c4f): `repairHealNumber.test.ts` instant cases → `applyRepairStructure`;
  NEW REACH: a JOB finished through the host tick prints ONE green 12, nothing at the click.
- 3 endgame seam (059e21c): `ENDGAME_LOCK_INTENT_POLICY.FIX_ALL = 'allow'`; docblock corrected (FIX is
  a gatherer job; bank-only once the quarry stops at wave 27); the lock's FIX test re-pinned to the job
  through the real host tick (the shape came from the BANK).
- 4-7 LOWs (b7ab615 + tests c20a5ef): eliminated seat → jobs cancel (refund); `QUEUE FULL` on the card
  and the FIX ALL row; `fixAllTargets` claims shapes only for towers it queues (⚠ not
  mutation-distinguishable: no reachable board has two STAMPED towers sharing a shape — stamps never bond
  to existing shapes, and hand-built shared-leaf towers have no provenance, so they are never FIX
  candidates; kept as a defensive fix, plus a "a whole tower is neither queued nor blocks" test);
  re-plan phase-spread by job id, `REPAIR_JOB_REPLAN_TICKS` 15 (MINE) — MEASURED with a temporary
  probe (32 waiting jobs, `tickRepairJobs` alone, 600 ticks × 3): 0.61–1.13 → 0.05–0.07 ms/tick.
  Mutants F1-F5 RED, restored.
- 8 canon/doc (cd66ad0, 33a2964, 9d7f36a): SPARK_CANON §8 R191-B paragraph (replaces NEED 1 MORE),
  §3d FIX ALL row, §7b R185-B amended by R191-A (pinned needles kept), §9d one pricing, §6 what rides the
  weld merge; canon.test pins 32 / 15 / fixAll-first / the new phrases; stale docblocks in
  `structurePanel.ts` and `characterSheetModel.ts`; canon notes §H reasons 7-9.
- merge seam found after the endgame merge (91a1181): `endgameS193.test.ts`'s owner-predicate
  enumeration — weld's seat-only sites added with verdicts (repairJobs 3, structureRepair 2, towerUnit 2).
- failed commands and verdicts: the endgame FIX re-pin first read only MY gatherer — the seat starts with
  its own two and the lowest free id took the task (test fixed to read any of the seat's gatherers);
  a python heredoc escape mismatch twice (no edit landed; redone with the Edit tool); the eliminated
  test through the host tick was confounded by the 1v1 match END clearing the queue (that test now calls
  the pass directly — documented at the test); the phase assertion was off by one (the host tick
  advances `tick` before the pass) — corrected.
