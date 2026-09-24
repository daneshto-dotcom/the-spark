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
## Step 4 — AFTER numbers (same instrument, same machine, same hour)  ✅
### wave-5 FIGHT bucket, host tick only, ms
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A ≤17 creatures — BEFORE | 1 / 2 | 1.942 / 1.781 | 2.820 / 2.454 | 4.99 / 4.20 | 8.09 / 7.19 | 13.03 / 10.35 |
| A ≤17 creatures — AFTER | 1 / 2 | **1.565 / 1.521** | **1.993 / 1.941** | 3.53 / 4.80 | **5.62 / 5.52** | 9.47 / 11.68 |
| C 120 held — BEFORE | 1 / 2 | 6.613 / 7.058 | 9.160 / 9.942 | 14.40 / 14.45 | 26.44 / 29.01 | 40.12 / 42.07 |
| C 120 held — AFTER | 1 / 2 | **2.483 / 2.544** | **3.010 / 3.260** | 5.55 / 10.52 | **8.80 / 9.56** | 13.73 / 19.74 |
| C 120 — PROFILED, before → after | | 8.768 → 2.764 | 11.946 → 3.529 | 19.88 → 6.77 | 34.78 → 10.32 | 50.17 → 18.29 |

- 120 creatures: mean **÷2.7**, p95 **÷3.0**; a three-tick catch-up frame at p95 is now ~9 ms of the
  16.7 ms frame (was 26-29 ms). ≤17 creatures: ~15-20 % off the mean, ~25 % off the p95.
- ⚠ Run 2's maxima are machine noise, not the sim: the same run shows a 12.67 ms max in **wave-5
  BUILD**, where the creature loop does not run at all. The 3-tick MAX still reaches 13.7-19.7 ms
  on the noisy run, so a rare frame can still exceed budget once rendering is added; the p95 cannot.

### AFTER profile, pass C wave-5 FIGHT (first 2400 ticks), inclusive
structureTargets **23.5 %** (was 67.0) · findNearestBondTarget **15.8 %** (was 63.2) ·
spreadEnemyTarget **3.1 %** (was 41.0 self) · buildColourBucket 4.5 % · nearestBondIn 3.0 %.
⭐ **THE NEXT HOTSPOT — named, not chased:** `stepPhysics` **40.4 %** inclusive, led by
`computeTerritorialInfluence` (territory.ts:121) **18.0 % incl / 13.7 % self** — now the single largest
self-time in the tick — then `solveBonds` 8.8 %. After that `pickNavUnit` 9.3 % (its
`findNearestEnemyCreatureFrom` is O(creatures²) at 120 creatures) and `tickScoring` 7.7 %
(`computeAllComplexities` 6.2 %).

### Full-scale oracle (SPARK_C5_PERF=1: fork at WAVE 5, all 3600 FIGHT ticks) on the changed code — EXIT=0
prefix: 50 731 host scans / 154 227 comparisons / 0 mismatches.
window: **456 388 host scans / 2 178 123 comparisons / 0 mismatches / hashWorldStateFull identical
all 3600 ticks** / 4 281 whole-board sweeps / 554 injected severs, 564 welds (258 mixed), 246 razes /
79 780 scans after a mid-tick mutation in the same tick / 44 natural mid-tick bond-set changes /
9 246 scans picked a bond welded earlier in the same tick / 0 returned a severed bond; 123 creatures,
488 bonds at the fork, min 67, mean 269. 95.6 s.

## Step 3b — the targeting finding, measured (see S190_CANON_NOTES_perf.md)
The FFA spread's universe is the NON-strict enemy set, so it can hand an enemy-only creature a MIXED
bond (the S162 chain) and can count the owner among its own victims. REPORTED, NOT FIXED. Throwaway
probe (not committed), real four-seat bots match to the end of wave 5, sampled every 60 ticks:
**0 mixed bonds in 743 + 750 samples** (default and 120-held), and 0 of 2 041 + 7 953 enemy-only scans
returned a bond touching the scanner's own colour. ⇒ LATENT in a bots match; reachable only if some
path (human play?) creates a cross-colour bond, which I did not measure.
## Step 5 — gates — (pending)
