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

## IN-FLIGHT
- gates + report.

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
