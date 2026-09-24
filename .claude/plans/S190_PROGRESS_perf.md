# S190 — s190/perf progress (C5, part of approved P0)

Owner, verbatim: *"it was lagging at about wave five. I thought we fixed the lags"*.
Branch `s190/perf`, from master 554dbd7. Worktree agent; the main session is the merge owner.
Commits are LOCAL only.

## Step 0 — setup
- `npm ci` in this worktree: **EXIT=0** (own install, no junction).

## Step 1 — the instrument, and the BEFORE numbers  ✅
- `src/state/c5HostTickMeasure.test.ts` — opt-in (`SPARK_C5_PERF=1`, profiler with `SPARK_C5_PROFILE=1`).
  A copy of the s189/net idea (b72a4c4 `src/net/c5WaveFiveMeasure.test.ts`) under a different path;
  CPU only, profiler opt-in so the timing is not inflated by the sampler.
- `src/state/c5WaveFiveBoard.fixtures.ts` — the shared match + the 120-creature top-up lever, so the
  board the fix is MEASURED on and the board it is PROVEN on are the same board.
- ⚠ FINDING, RESOLVED: the first run exited **1** with both tests passed — vitest's
  `[vitest-worker]: Timeout calling "onTaskUpdate"`, because a 40 s synchronous test starved the
  worker's RPC. The loop now yields (`setImmediate`) every 500 ticks, outside the timed window; the
  re-run exited 0.

### BEFORE (master 554dbd7 code), wave-5 FIGHT bucket, host tick only (bots excluded), ms
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max | creatures | prims | bonds |
|---|---|---|---|---|---|---|---|---|---|
| A default (≤17 creatures) | 1 | 1.942 | 2.820 | 4.99 | 8.09 | 13.03 | 17 | 259 | 574 |
| A default | 2 | 1.781 | 2.454 | 4.20 | 7.19 | 10.35 | 17 | 259 | 574 |
| C 120 held | 1 | 6.613 | 9.160 | 14.40 | 26.44 | 40.12 | 123 | 236 | 517 |
| C 120 held | 2 | 7.058 | 9.942 | 14.45 | 29.01 | 42.07 | 123 | 236 | 517 |
| C 120 held, PROFILED | 3 | 8.768 | 11.946 | 19.88 | 34.78 | 50.17 | 123 | 236 | 517 |

(The s189/net figure was 8.22 / 12.5 / 96 with its profiler running; this machine's profiled run is
8.77 / 11.9 / 19.9 — same shape. A 3-tick frame at p95 is 26-29 ms: the sim alone blows the 16.7 ms
frame budget.)

### BEFORE profile, pass C wave-5 FIGHT (first 2400 ticks), inclusive
structureTargets 67.0 % → findNearestBondTarget 63.2 % → spreadEnemyTarget **41.0 % self**;
findNearestBondTarget 22.2 % self; stepPhysics 15.8 % (computeTerritorialInfluence 7.0 %, solveBonds
3.3 %); pickNavUnit 3.9 %; tickScoring 3.0 %.

## Step 2 — the identity oracle, green against the UNCHANGED code  ✅
- `src/state/creatures/bondTargetReference.fixtures.ts` — the pre-change scan, VERBATIM (checked
  mechanically: comment-stripped bodies of structureTargets / findNearestBondTarget /
  spreadEnemyTarget / isEnemyBondWithColor / creatureOwnerColor diff to zero lines, bar the
  `reference` prefix, an `export`, and the primitive scan passed in as a parameter — importing
  `creatureAI.ts` from it would be circular under `vi.mock`).
- `src/state/creatures/bondTargetIndex.differential.test.ts`:
  1. `vi.mock('./creatureAI.ts')` routes every host-tick call of `structureTargets` /
     `findNearestBondTarget` through a wrapper that compares, IN PLACE (interleaved with the strikes
     and severs of the same tick), the real function against the reference — all three variants
     (structureTargets, enemyOnly, Voltkin) — and sweeps EVERY live creature once per tick and again
     after every injected mutation.
  2. A real four-seat bots match to wave N's FIGHT, every scan checked; then 120 creatures (a mix
     covering structure-attackers, Voltkin, chewer, drone, suicide goblin); then a `structuredClone`
     fork (bond.a === world.primitives.get(aId) asserted on both twins, hashes equal to the parent);
     twin A runs on the REFERENCE, twin B on the real code, `hashWorldStateFull` compared every tick.
  3. Mid-tick injections between two creatures' scans, identical in both twins: sever the bond the
     scanning creature just chose (razePrimitives, the sever call shape), weld a NEW bond (strict and
     mixed-colour) from the scanning creature's nearest shapes via `makeBond`, raze a whole primitive.
  4. A small exact case: sever / weld strict / weld mixed / raze / a DEGENERATE bond (endpoint missing)
     / a rainbow recolour / an exact tie re-inserted high-id-first.
- ⚠ Two red runs while tuning, both MY anti-vacuity bars, not the code: the first dense injection plan
  took the board to 0 bonds (`minBonds=0`), the second left 134 bonds at the fork. The window plan is
  now sever/13 · weld/7 · raze/29 ticks and the prefix sever/293 · weld/101 · raze/401; the bars are
  ">150 bonds at the fork" and "never below 20". Resolved, not relaxed to green: each is still a real
  board.
- Default run (fork at wave 3, 600-tick window), UNCHANGED code — EXIT=0:
  prefix 26 481 host scans / 80 277 comparisons / 0 mismatches;
  window 97 672 host scans / 386 391 comparisons / **0 mismatches** / 683 whole-board sweeps /
  88 injected severs, 38 welds (22 mixed), 40 razes / 12 928 scans AFTER a mid-tick mutation in the
  same tick / 8 natural mid-tick bond-set changes / 160 scans that picked a bond welded earlier in
  the same tick / 0 scans returned a severed bond / hashes identical all 600 ticks; board 220 bonds at
  the fork, min 137, 123 creatures.
- ⚠ Cost: 18.6 s for the long case on the unchanged code (the checked twin runs the naive scan ~7× per
  creature per tick). Re-measured after step 3.
## Step 3 — the change  ✅
- ⚠ RESUMED once: the org spend limit killed this agent mid-step; on resume `git status` matched this
  file exactly (steps 1-2 committed, step 3 uncommitted in the tree), so nothing was lost or redone.
- `src/state/creatures/creatureAI.ts` — the bond-target index. Per tick, per OWNER COLOUR, `world.bonds`
  is classified ONCE into `enemy` (isEnemyBondWithColor — Voltkin set + spread universe), `strict`
  (the S162 AND-tightening — enemy-only nearest set), `own` (everything else, degenerate included),
  `victims` (sorted) and `byVictim`. Each creature's scan is then one flat pass (`nearestBondIn`) over
  a pre-classified array, reading positions LIVE, with the same `(distSq, bondId)` total order and the
  arithmetic of `distSq(pos, bondMidpoint(bond))` written out op-for-op. `spreadEnemyTarget`'s two
  full passes now read the bucket (victim list; the chosen victim's bonds only).
- ⛔ The mid-tick hazard, answered from the code: the three scan sites (hostTick drone arm ~1552,
  structure-attacker arm `structureTargets` ~1628, Voltkin/chewer arm ~1810) all run INSIDE the
  creature loop, interleaved with CREATURE_ATTACK (a connector gives way → razePrimitives),
  DRONE_EXPLODE and SUICIDE_BLAST. So the cache is (1) only reusable inside an EPOCH that
  `runHostTick` opens immediately before that loop and closes after it (keyed to world + tick; outside
  it every call builds a throwaway from the live world), and (2) re-validated before EVERY scan by an
  exact O(1) fingerprint — bonds.size, nextBondId, primitives.size, nextPrimitiveId, and both Maps'
  identity — rebuilt on any change. Exact because every bond is born through `makeBond`
  (nextBondId++), every shape through nextPrimitiveId++, and both die only through `razePrimitives`.
- NOT seen by the fingerprint, by design: `placerColor` (only the rainbow writes it, from a player/bot
  intent, never inside the loop) and `placedBy` (never written). Owner colour is safe: buckets are
  keyed by colour VALUE and re-resolved per call.
- `src/state/hostTick.ts` — **outside the brief's file boundary, kept minimal**: 12 lines — two
  imports, `openBondTargetEpoch(world)` immediately before `for (const id of creatureIds)`, and
  `closeBondTargetEpoch()` immediately after the loop. Needed because only the host tick knows where
  the loop begins and ends; an epoch any wider would span code that can rewrite `placerColor`.
- `src/state/buildingTargeting.test.ts:258` — the S181 source-text guard RE-DERIVED, not deleted or
  loosened: it sliced 4000 chars after `export function findNearestBondTarget` and looked for
  `isEnemyBondWithColor`. The filter now lives in `buildColourBucket`, so the guard slices each of the
  four scan functions exactly (to the closing brace), asserts the entry reads `colourBucketFor(`, that
  the builder holds the ownership filter, and that NONE of the four mentions a recipe / defender /
  tower smell. (A window over the entry alone would have stayed green over a recipe filter in the
  builder — the S182 "exists vs reached" hole.)
- NEW `src/state/creatures/bondTargetIndex.guards.test.ts` — the fingerprint's preconditions pinned
  mechanically over comment-stripped production source: bond-id allocator = placePrimitive.ts only;
  bonds.set / primitives.set / nextPrimitiveId++ site lists; bonds.delete + primitives.delete =
  razePrimitives.ts only; placerColor writers = rainbowLifecycle.ts only, TRIGGER_RAINBOW dispatched
  only from botController.ts + controls.ts, placedBy never written; the epoch opened exactly once, with
  nothing between it and the loop, and closed after the last CREATURE_ATTACK dispatch and before
  castleGunsTick. First run red on two of MY regexes (a docblock naming `nextBondId++`, and the
  action's `readonly type:` declaration) — resolved by stripping comments and matching `{ type:`.
- Oracle additions: an anti-vacuity test proving the epoch cache is really REUSED (a placerColor
  rewrite inside an epoch is not seen; outside, the live answer changes and matches the reference).
  First run red: my fixture `topUpCreatures(w, 8, …)` added nothing on a board already above 8 —
  fixed to top up relative to the current count.
- Result on the changed code: oracle window 97 672 host scans / 386 391 comparisons / **0 mismatches**
  / hashes identical all 600 ticks — the SAME counters as on the unchanged code, which is itself a
  sign the tick went down the same path. Targeting suites: 10 files / 151 tests green
  (bondTargetIndex ×2, buildingTargeting, creatureAI, towerDefense, hostTick.differential,
  hostTick.replay, save.replay, creatureProjectile, s181Regressions). tsc EXIT=0.
- ⭐ No PROTOCOL_VERSION bump is owed: nothing serialized, nothing on the wire, no new discriminant,
  and the differential test proves the sim's outputs are byte-identical.
## Step 4 — AFTER numbers — (pending)
## Step 5 — gates — (pending)
