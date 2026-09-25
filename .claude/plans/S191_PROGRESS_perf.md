# S191 — s191/perf progress (P12: the wave-5 host tick, next hotspots — outputs byte-identical)

Owner, verbatim (C5): *"it was lagging at about wave five. I thought we fixed the lags"*.
Branch `s191/perf`, from master 42cc2ee (src = deploy #4). Worktree agent; the main session is the merge
owner. Commits are LOCAL only. Brief: `.claude/plans/S191_BRIEFS/perf.md` (main checkout).

⚠ **Seven worktrees share this 32-core machine.** Every timing below is NOISY: each is repeated, reported
as mean and spread, and compared only against a before taken on the same machine in the same hour.

## Step 0 — setup  ✅
- `npm ci` in this worktree: **NPMCI_EXIT=0** (own install, no junction).

## Step 1 — measure (the S190 instrument, the same wave-5 board)  ✅
- Instrument REUSED, not re-invented: `src/state/c5HostTickMeasure.test.ts` + `c5WaveFiveBoard.fixtures.ts`
  (s190/perf) — a real four-seat bots match through `runHostTick`, pass A default draft, pass C all-HP +
  120 creatures held through wave 5's FIGHT. Commands (logs in `.tmp-gates/`, gitignored):
  `SPARK_C5_PERF=1 npx vitest run src/state/c5HostTickMeasure.test.ts` (×2) and
  `SPARK_C5_PERF=1 SPARK_C5_PROFILE=1 npx vitest run src/state/c5HostTickMeasure.test.ts` (×1). All EXIT=0.
- ⚠ The board is today's master, not S190's: pass A's wave-5 board is 171 prims / 356 bonds (S190: 259 /
  574) — deploy #4's other branches changed what the bots build. Pass C is 236 / 517 / 123 creatures.

### BEFORE (master 42cc2ee code), wave-5 FIGHT bucket, host tick only, ms — machine SHARED with 6 worktrees
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A default | 1 | 0.707 | 1.153 | 4.08 | 3.38 | 9.07 |
| A default | 2 | 0.534 | 0.776 | 1.88 | 2.19 | 3.76 |
| A default, PROFILED | 3 | 0.629 | 0.979 | 2.25 | 2.73 | 4.39 |
| C 120 held | 1 | 3.134 | 4.840 | 11.17 | 13.76 | 28.29 |
| C 120 held | 2 | 2.569 | 3.211 | 7.02 | 9.35 | 18.48 |
| C 120 held, PROFILED | 3 | 2.721 | 3.482 | 6.98 | 10.19 | 17.81 |
Unprofiled mean of 2: A 0.62 ms (spread ±0.09), C 2.85 ms (±0.28). Run 1 was the noisiest (its wave-2..5
BUILD maxima of 4.7-29 ms are in buckets where the creature loop is idle — machine noise).

### BEFORE profile (V8 sampler, 200 µs), wave-5 FIGHT first 2400 ticks
| function | C incl | C self | A incl | A self |
|---|---|---|---|---|
| stepPhysics | 39.8 % | 4.2 % | 56.5 % | 5.5 % |
| **computeTerritorialInfluence** (territory.ts) | **17.7 %** | **13.6 %** | **24.2 %** | **15.0 %** |
| · computeAllPlayerRadii → Complexities → ComponentRoots | 4.1 % | 2.4 + 1.5 % | 9.2 % | 5.3 + 3.4 % |
| structureTargets (S190's index; NOT in this brief) | 23.6 % | 7.6 % | 9.7 % | 1.7 % |
| · findNearestEnemyPrimitiveFrom (lone-shape scan; NOT in brief) | 7.5 % | 7.5 % | — | — |
| **pickNavUnit** (+ findNearestEnemyCreatureFrom 3.4 %) | **9.0 %** | 5.7 % | — | — |
| **solveBonds** | **8.2 %** | 8.0 % | **15.8 %** | 15.5 % |
| **tickScoring** (computeAllComplexities 5.9 / 10.4 %) | **7.3 %** | 1.4 % | **12.7 %** | 2.3 % |
| lookupCombo | 3.6 % | 3.5 % | 6.5 % | 6.5 % |
Rank for this brief: territory first (both passes), then pickNavUnit (pass C), then solveBonds / tickScoring.
## Step 2 — one hotspot per commit

### 2a · `computeTerritorialInfluence` — the anchor grid  ✅
- `src/state/territory.ts` (CRLF kept, 493/493): each player's anchors bucketed once per call into a
  dense grid, cells of side R + 1; an endpoint tested against its own cell + the 8 around it. Colour
  lookups for the Council C8 filter hoisted to ONE pass per call. Result identical BY CONSTRUCTION
  (boolean per bond; same arithmetic op for op; |dx| < R exactly whenever the test passes, so cell
  indices differ by ≤ 1 with a 1/(R+1) margin vs < 5e-10/(R+1) rounding inside ±1e6); outside ±1e6,
  NaN/±Inf, or > 65 536 cells → the old exhaustive test. NOTHING persists between calls (no cache →
  step 3's staleness guard does not apply to this change). No exported signature changed.
- ⭐ Council S191 item 1 (coordinator): the two docblocks claiming "no cross-colour bonds exist" are
  CORRECTED (influence pass + `computeComponentRoots`, comments only); the per-bond skip is unchanged
  (skip when EITHER endpoint is P's colour ⇒ a mixed X/Y bond is engulfable only by a third seat).
  `componentOf` follows every bond whatever its colour, so the S118 equality still holds — premise fixed.
- ⚠ FINDING (measured): **on a plain four-seat bots match the engulf NEVER fires** — the first oracle run
  (waves 1-3, 27 000 ticks) counted **0** engulfed bonds. Seats build in their own zones; no enemy bond is
  ever within R (~60-140 px) of another seat's shapes. The pass costs 13.6-15 % of the tick to compute
  "false" for every bond. REPORTED, not acted on (the owner may want to know the mechanic is dormant).
- Tests (NEW):
  · `territoryReference.fixtures.ts` — the pre-change pass + its radius chain VERBATIM (checked
    mechanically: `git show 42cc2ee:src/state/territory.ts` vs the fixture with the prefix stripped →
    **0 diff lines**).
  · `s191PerfOracle.fixtures.ts` — the in-place comparator (reference → restore → real, every bond
    `Object.is`, counts mixed visits) + board injections (cross-seat WELD every 97 ticks; INTRUDER
    every 131 ticks = two bonded shapes of another seat planted inside seat X's territory, alternately
    pure and MIXED; each razed through `razePrimitives` 600 ticks later).
    ⚠ Two measured reasons for the injections: without intruders the engulf count is 0 (vacuous);
    with PERMANENT injections the extra complexity income ended the match at wave 3 (full run, tick
    25 592 — hashes identical to that point, 0 mismatches).
  · `s191Perf.differential.test.ts` — THE MULTI-WAVE TWIN ORACLE (one file for every s191/perf arm):
    twin A all references, twin B real + in-place checks, lockstep from tick 0, `hashWorldStateFull`
    every tick (it projects `:sm`, the multiplier itself). Default waves 1-3 / full waves 1-5.
  · `territoryGrid.differential.test.ts` — fast exact cases: 600 random 4-seat boards (±3000,
    mixed + degenerate bonds, shrink), endpoints exactly at R / 1 ulp inside / ±1e-9 / every cell line
    near the anchor (±shrink), envelope cases (±2e6, NaN, ±Inf, a loose anchor just outside the
    envelope, a cell-cap spread), own/mixed/degenerate/overlap/no-shapes.
- Oracle results — ALL EXIT=0 on the changed code:
  | run | ticks | in-place mismatches | hash diverged | bonds compared | engulfed | mixed visited / engulfed | welds / intruders | max bonds / creatures | wall |
  |---|---|---|---|---|---|---|---|---|---|
  | default (waves 1-3) | 27 000 | **0** | **never** | 2 320 940 | 679 216 | 123 788 / 87 260 | 264 / 98 | 206 / 43 | 23.5 s (9.4 s hashing) |
  | full `SPARK_C5_PERF=1` (waves 1-5, 120 creatures) | 45 000 | **0** | **never** | 8 648 789 | 2 501 844 | 212 400 / 161 075 | 449 / 166 | 476 / 123 | 84.5 s |
- MUTATION CHECKS (production file mutated, test run, restored — sha256 byte-identical every time):
  M1 own-cell-only neighbourhood → exact RED (4/4 failed) and the long oracle RED (in-place mismatch) ·
  M2 `<=` for `<` → RED (the at-R case) · M3 skip the loose anchors → first GREEN (no case put an
  in-envelope endpoint near an anchor just outside the envelope — case ADDED) → RED · M4 cell = R/2 → RED
  (3 failed) · M5 own-skip `||`→`&&` (the mixed-bond rule) → RED.
- Suites: territory.differential (S118, 400 worlds) / territory / anchorStabilize / buildLegalityGates —
  4 files, 128 tests, EXIT=0. `npm run typecheck` EXIT=0.

#### AFTER 2a (same instrument, same hour, machine shared), wave-5 FIGHT, ms
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A | 1 / 2 / prof | 0.489 / 0.486 / 0.553 | 0.693 / 0.688 / 0.821 | 1.82 / 1.82 / 2.21 | 1.97 / 2.03 / 2.34 | 3.75 / 3.44 / 3.98 |
| C | 1 / 2 / prof | 2.173 / 2.230 / 2.352 | 2.595 / 2.761 / 3.043 | 4.61 / 6.61 / 6.31 | 7.72 / 8.08 / 8.96 | 11.64 / 14.94 / 16.40 |
Unprofiled mean of 2: A 0.62 → **0.49 ms** (−21 %), C 2.85 → **2.20 ms** (−23 %); p95 C 4.03 → 2.68.
Profile: territory incl C 17.7 → **8.3 %** (self 13.6 → **2.6 %**), A 24.2 → 18.2 % (self 15.0 → 6.6 %).
What is left of it is `computeAllPlayerRadii` (C 5.0 % / A 9.4 %: union-find over Maps + complexities).
New rank (C incl): structureTargets 26.6 % (S190 index + `findNearestEnemyPrimitiveFrom` 8.6 % self — NOT
in this brief) · **pickNavUnit 9.6 %** · solveBonds 9.4 % · tickScoring 8.6 % · territory 8.3 %.
(A incl): territory 18.2 % · solveBonds 17.9 % · tickScoring 14.6 %.

### 2b · `pickNavUnit` — the per-seat enemy index  ✅
- `src/state/creatures/creatureAI.ts` (CRLF kept): `pickNavUnit`'s re-acquire goes through
  `findNearestEnemyCreatureIndexed` — inside the S190 epoch it walks a flat per-seat list of the live
  creature OBJECTS that seat can target by owner (+ their Map keys + the static `isUntargetableType`
  flag); outside the epoch it IS `findNearestEnemyCreatureFrom`. `openBondTargetEpoch` /
  `closeBondTargetEpoch` also reset this index (so hostTick.ts is NOT touched). Fingerprint before every
  call: `world.creatures` identity, size, `nextCreatureId` → rebuild on change. Read LIVE: position,
  `isChannellingRa` (the Ra ritual is stamped mid-loop by a lethal blow), range gate, `(distSq, id)`.
  Result = lexicographic min of (distSq, id) → list order decides nothing. No exported signature
  changed; `findNearestEnemyCreatureFrom` (castle guns, defenders, renderer, Voltkin) untouched.
- ⭐ Council S191 item 2 (coordinator) — addressed, with ONE CLAUSE DELIBERATELY NOT APPLIED:
  · "cache creature IDS only": the cache holds the Map keys and the live objects the Map holds
    (never a copied position or ehp); no object is ever replaced under an existing key (guard 1).
  · "build where positions are final": positions are not cached at all, so the question never arises.
  · "re-check ehp > 0 and not-pending-death when reading from the cache": ⛔ **NOT APPLIED — it would
    change outputs.** Measured: the LIVE scan (verbatim reference) returns a unit killed earlier in the
    same loop (deferral: still in the Map, `ehp <= 0`, in `pendingCreatureDeaths`) **604 times** in the
    default oracle run and **2 616 times** in the full run. The index keeps it, exactly as the live scan
    does; mutant N4 (the Council's filter) turns BOTH the exact cases and the real-match oracle RED.
    Whether a dying unit SHOULD stay targetable is a behaviour question for the owner — REPORTED.
  · "differential must include kills mid-tick and a retaliation hold": injected between two calls of
    one tick — a lethal DEFERRED blow to the unit just picked (every 7th tick), an outright removal
    (13th), a birth beside the caller (19th); a whole-population sweep per tick + after each injection;
    holds the creature did not set itself (retaliation turns) counted.
- Tests (NEW): `creatures/navUnitReference.fixtures.ts` (pickNavUnit + findNearestEnemyCreatureFrom +
  distSq VERBATIM — each block checked to be an exact substring of `git show 42cc2ee:…/creatureAI.ts`);
  the nav comparator + `birthCreature` in `s191PerfOracle.fixtures.ts`; the NAV arm in
  `s191Perf.differential.test.ts`; `creatures/navUnitIndex.differential.test.ts` (exact: tie inserted
  high-id-first, range exactly at 220 px and 1e-9 beyond, locust cloud, ritual stamped / ended AFTER
  the build, deferred kill still returned, removal, birth, removal+birth of equal size, moved units,
  NaN, every kind of held lock, epoch left open across a tick / opened on another world, 200 random
  boards with churn); `creatures/navUnitIndex.guards.test.ts` (step 3 — below).
- Oracle (twin A reference / twin B index, hash every tick) — EXIT=0 both:
  | run | host calls | comparisons | mismatches | found | pending-death returned | holds (kept) | retaliation holds (kept) | kills / removals / births injected | calls after a mid-loop change |
  |---|---|---|---|---|---|---|---|---|---|
  | default waves 1-3 | 228 350 | 336 464 | **0** | 47 598 | 604 | 44 806 (42 948) | 104 (104) | 384 / 230 / 736 | 16 468 |
  | full waves 1-5, 120 cr. | 579 376 | 901 061 | **0** | 135 866 | 2 616 | 129 824 (124 578) | 220 (220) | 624 / 380 / 1 146 | 51 392 |
  Territory arm unchanged: 0 mismatches; hashes identical all 27 000 / 45 000 ticks.
  ⚠ The sim ITSELF never changed the creature set between two nav calls (0, both runs — deaths are
  deferred, nothing spawns between two picks); the rebuild path is exercised by the injections.
- MUTATION CHECKS (all RED on the exact cases; restored sha256-identical): N1 drop the `nextCreatureId`
  conjunct · N2 drop the size conjunct · N3 drop the ritual half · N4 the Council's ehp/pending filter
  (also RED on the real-match oracle) · N5 `>=` range gate (first try: needle matched twice → NO
  verdict, re-run with a unique needle → RED) · N6 drop the id tie-break · N7 drop the type half.
- Suites: navUnitIndex ×2, s191Perf, bondTargetIndex ×2, buildingTargeting, creatureAI — EXIT=0.

#### AFTER 2b (cumulative with 2a), wave-5 FIGHT, ms — machine shared
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A | 1 / 2 / prof | 0.529 / 0.507 / 0.626 | 0.779 / 0.774 / 0.976 | 1.75 / 2.40 / 2.28 | 2.27 / 2.27 / 2.82 | 3.31 / 3.76 / 4.70 |
| C | 1 / 2 / prof | 2.252 / 2.270 / 2.645 | 3.262 / 3.104 / 4.102 | 5.46 / 8.68 / 7.58 | 9.38 / 8.96 / 11.93 | 14.77 / 21.48 / 19.71 |
- Profile C: pickNavUnit incl 9.6 → **6.2 %** (a first version with `isUntargetable` called per enemy
  gave only 8.5 %: the string-keyed config lookup per enemy was the cost, not the Map walk — hence the
  precomputed type flag). The host-tick MEAN did not move beyond this machine's noise (C 2.20 → 2.26,
  ±0.1 run to run): ~3 % of a 2.2 ms tick is ~70 µs. ⚠ What is left is the O(creatures²) DISTANCE loop
  itself; cutting it needs a spatial grid, which needs "no creature moves inside the creature loop" —
  TRUE today (every writer — physics, recallArmies, sonar [prevPos only], Archdemon teleport,
  corpse-eater leash — runs outside it) but a new invariant; NOT built (beyond the brief's shape),
  REPORTED as the next lever.
- New rank (C incl): structureTargets 28.6 % (not in brief) · solveBonds 9.9 % · tickScoring 9.1 % ·
  territory 8.9 % (radii 5.1 %) · pickNavUnit 6.2 %.

### 2c · `solveBonds` — tier tables read once per call  ✅
- `src/physics/bonds.ts` (CRLF kept, 150/150): the six tier-table entries read ONCE per call and chosen
  by comparing the tier (an unknown tier still reads the table — NaN flows exactly as before); each
  endpoint's `pos` object read once per bond. Same expressions, same doubles, same order, same
  Gauss-Seidel bond order. Signature unchanged; physicsLoop.ts untouched; no state.
- ⭐ Measured first, before editing, with a throwaway microbenchmark (a real wave-5 board, 517 bonds ×
  8 substeps, 8 repeats after warm-up; not committed): **244.5 → 100.0 µs per tick** (spread 232-263 →
  95-120), bit-identical on that board. The string-keyed table loads were most of each iteration.
- Tests (NEW): `physics/solveBondsReference.fixtures.ts` (verbatim, 0 diff lines vs 42cc2ee bar the two
  names); `physics/solveBonds.differential.test.ts` — every tier × {undefined, 1.0, 0.3, 0.7, 0.06, 1.5}
  multiplier × {ordinary, < EPSILON, broken, 1.2× pull, hard compression → clamp, near HIGH's break},
  unknown tier, self-bond (aliased `pos`), chains / rings / the same pair twice (16 substeps), the tables
  RETUNED between calls, 400 random networks; every body `Object.is` after every substep + broken lists.
  The SOLVER arm of `s191Perf.differential.test.ts`: default run **204 472 calls, 19 471 513 bonds solved,
  0 mismatches**, 7 285 382 sagged, 4 broken, LOW 2.07 M / MID 14.48 M / HIGH 2.92 M; hashes identical.
- MUTATION CHECKS (restored sha256-identical): S1 LOW break ratio for MID → RED · S2 MID stiffness for LOW →
  RED · S3 drop `?? 1.0` → RED · S4 `(e/d)*(s*0.5)` → GREEN, and CORRECTLY: ×0.5 is exact in binary, so
  that re-association cannot change a bit (an equivalent mutant) · S4b `((e*s)/d)*0.5`, a real
  re-association → RED · S5 unknown tier defaulted to HIGH → RED · S6 tables frozen at module load → RED
  (the retune case).
- ⚠ Process note: the 2c commit (224fc8e) first went in WITHOUT this file (an Edit on a heading that
  matched twice failed silently next to the `git add`); caught at once and amended into the same commit.

#### AFTER 2c (cumulative 2a+2b+2c), wave-5 FIGHT, ms — machine shared
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A | 1 / 2 / prof | 0.463 / 0.464 / 0.521 | 0.721 / 0.758 / 0.841 | 2.71 / 1.84 / 2.98 | 2.09 / 2.21 / 2.42 | 4.54 / 4.70 / 4.78 |
| C | 1 / 2 / prof | 2.207 / 2.409 / 2.420 | 3.354 / 3.947 / 3.778 | 6.07 / 11.85 / 6.53 | 9.66 / 11.39 / 10.97 | 15.16 / 21.69 / 16.58 |
- Profile: solveBonds A 17.9 → **8.9 %**, C 9.9 → **5.1 %**. Pass A mean 0.62 (base) → **0.46 ms**.
  Pass C run 2 is a noisy run (max 11.85 ms); C's mean sits at ~2.2-2.4 vs base 2.57-3.13.
- New rank (A incl): territory 22.7 % (of it `computeAllPlayerRadii` 12.9 %) · tickScoring 16.0 %
  (`computeAllComplexities` 13.3 %, `lookupCombo` 8.6 %) · structureTargets 11.2 % · solveBonds 8.9 %.
  (C incl): structureTargets 32.4 % (not in brief) · territory 9.4 % (radii 5.1 %) · tickScoring 8.7 % ·
  pickNavUnit 5.9 % · solveBonds 5.1 %.

### 2d · `tickScoring` → `computeAllComplexities` — the combo answers memoised per call  ✅
- `src/state/scoring.ts` (CRLF kept, 409/409): "is this pair magic?" (`lookupCombo(a,b).isMagical`) and
  "is it a Filament?" (`isFilamentCombo(a,b)`) answered by the SAME functions the first time a type pair
  appears in a call, then from a 6×6 `Int8Array` for the rest of that call. No combo logic duplicated;
  a type that is not an integer 0..5 bypasses the memo (so an invalid type still throws, from the same
  bond); every loop, skip, count and `Map` insertion order unchanged; the memo dies with the call.
- Microbenchmark first (throwaway, not committed; real wave-5 boards, 8 repeats after warm-up):
  A board (171 prims / 356 bonds) **129.9 → 51.6 µs** per call; C board (236 / 517) **174.1 → 67.6 µs**;
  both bit-identical INCLUDING the result Map's insertion order.
- Tests (NEW): `state/scoringReference.fixtures.ts` (computeAllComplexities + tickScoring + the two weights
  VERBATIM; each segment an exact substring of `git show 42cc2ee:src/state/scoring.ts` — ⚠ my first
  extraction walked tickScoring's docblock back into `applyLeaderDecay` (tsc caught the duplicate), redone
  from the signature line); `state/scoringMemo.differential.test.ts` (all 36 ordered pairs × owners ×
  mixed-owner bonds, Filaments both orders with 0-5 magic neighbours (keystone cap), fouling on a Filament
  end / a neighbour end / an unrelated id, degenerate bond, spawners, empty board, an INVALID type after a
  valid pair sharing its would-be slot, 300 random boards; entries compared in insertion order); the
  SCORING arm of `s191Perf.differential.test.ts` (in place every tickScoring call; twin A scores with the
  verbatim `tickScoring`).
- Oracle — ALL arms, EXIT=0: default (waves 1-3) scoring 10 800 calls / **0 mismatches** (magic + Filament
  on every board); full (waves 1-5) 18 000 / **0**; nav 579 376 / 0; solver 348 472 calls, 71.8 M bonds / 0;
  territory 45 000 / 0; `hashWorldStateFull` identical all 45 000 ticks; 99.8 s. ⚠ `withFouled` is 0 in a
  bots match (the seagull hazard that fouls shapes is off) — the fouled branch is proven by the exact cases.
- MUTATION CHECKS (restored sha256-identical): C1 slot ignores b → RED · C2 one memo for both questions →
  RED · C3 keystone neighbours asked "Filament?" → RED (so the keystone branch IS exercised) · C4 invalid
  type folded onto a valid slot (`% 6`) → first GREEN: the only invalid bond was the first user of its
  slot, so the memo still called `lookupCombo` and threw. Case strengthened (a valid Square→Square bond
  first) → RED.

#### AFTER 2d (cumulative 2a-2d), wave-5 FIGHT, ms — machine shared
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A | 1 / 2 / prof | 0.375 / 0.371 / 0.425 | 0.587 / 0.594 / 0.672 | 1.59 / 1.86 / 1.83 | 1.68 / 1.69 / 1.91 | 2.81 / 3.31 / 3.29 |
| C | 1 / 2 / prof | 1.836 / 1.775 / 1.946 | 2.406 / 2.184 / 2.450 | 7.32 / 4.53 / 5.09 | 7.02 / 6.38 / 7.01 | 15.85 / 12.47 / 15.06 |
- Profile: tickScoring A 16.0 → **10.5 %**, C 8.7 → **5.9 %**. `lookupCombo` is still 4.6 % (A) — from
  `applyKeystoneAnchor` / `anchorStabilize` / `isAnchorCombo`, outside this brief (REPORTED: a numeric 6×6
  table inside `combos.ts` would serve every caller).
- New rank (A incl): territory 22.6 % (`computeAllPlayerRadii` **12.4 %**) · structureTargets 11.7 % ·
  solveBonds 10.6 % · tickScoring 10.5 % · applyKeystoneAnchor 8.0 % (not in brief).
  (C incl): structureTargets 31.9 % (not in brief) · territory 10.6 % (radii 5.9 %) · pickNavUnit 6.8 % ·
  tickScoring 5.9 % · solveBonds 5.5 %.

### 2e · territory, the rest of it — `computeAllPlayerComplexities` over a dense union-find  ✅
- Why: after 2a-2d the territory pass was still the top in-brief item on the ordinary board (A incl
  22.6 %), and more than half of it was `computeAllPlayerRadii` (12.4 %) — the S118 union-find over two
  id-keyed Maps, rebuilt every tick. Same file as 2a, same hotspot (the brief's first bullet).
- `src/state/territory.ts` (CRLF kept, 545/545): `computeAllPlayerComplexities` numbers the prims once
  (one Map id → dense index), keeps parents in an `Int32Array`, unions AND counts same-colour bonds in one
  bond pass, then counts prims + distinct roots per colour. Only the COUNT of components per colour is
  read, and a partition is independent of union order / root identity — identical counts, identical final
  expression, result keyed in `world.players` order. `computeComponentRoots` (exported, min-id-root
  contract, S118 partition test) is UNCHANGED, now off the per-tick path (docblock says so).
- Microbenchmark first (throwaway): A board **46.0 → 21.6 µs**, C board **68.2 → 28.3 µs** per call,
  bit-identical on both.
- Tests: `state/territoryComplexity.differential.test.ts` (NEW — mixed bonds joining two seats into one
  component, dangling / self / duplicate bonds, ids out of order with gaps, a colour no seat holds, a
  400-shape chain, the shrink debuff, 400 random 4-seat boards with ~30 % cross-colour bonds;
  complexities + radii + the two single-player wrappers, `Object.is`, insertion order); the TERRITORY arm
  of the oracle now also compares the radius map in place every call (27 000 / 0 mismatches default).
- MUTATION CHECKS (restored sha256-identical): R1 no union → RED · R2 count mixed bonds as same-colour →
  RED · R3 union only same-colour bonds → RED on the new test (first attempt: needle matched twice — the
  same three lines exist in `computeComponentRoots` — NO verdict, re-run with a unique needle) ·
  ⚠ FINDING: R3 stays **GREEN on the S118 `territory.differential.test.ts`** — its random worlds hold only
  same-colour bonds (the Sym-D premise the Council item corrected), so it cannot see a union that ignores
  welds. The new test can. (Reported; S118's test left as is — not mine.)

#### AFTER 2e (cumulative 2a-2e), wave-5 FIGHT, ms — machine shared
| pass | run | mean | p95 | max | 3-tick p95 | 3-tick max |
|---|---|---|---|---|---|---|
| A | 1 / 2 / prof | 0.357 / 0.325 / 0.426 | 0.574 / 0.490 / 0.705 | 1.68 / 1.74 / 1.85 | 1.71 / 1.41 / 2.01 | 3.13 / 2.87 / 3.50 |
| C | 1 / 2 / prof | 1.717 / 1.664 / 2.138 | 2.155 / 2.026 / 2.965 | 3.75 / 4.45 / 5.40 | 6.33 / 5.90 / 8.57 | 9.09 / 10.98 / 13.72 |
- Profile: computeAllPlayerRadii A 12.4 → **6.1 %**, C 5.9 → **2.4 %**; territory incl A 22.6 → 17.5 %.
- Rank now (A incl): territory 17.5 % · structureTargets 13.7 % (not in brief) · solveBonds 12.0 % ·
  tickScoring 10.7 % · applyKeystoneAnchor 8.4 % (not in brief). (C incl): structureTargets **33.7 %**
  (not in brief) · pickNavUnit 6.8 % · territory 6.8 % · tickScoring 5.6 % · solveBonds 5.4 %.
  Every in-brief item has had its pass; what is left is either out of the brief or needs a new
  invariant (see "what I would do next" in the report) → STOP optimising, go to the gates.

## Step 3 — cache-invariant guards
- 2a (territory grid): NO cache — the grid is built and dropped inside each call. Nothing to stale.
- 2b (nav index): `creatures/navUnitIndex.guards.test.ts`, comment-stripped production code, per-file
  COUNTS: `nextCreatureId++` creatureLifecycle 3 · `creatures.set(` creatureLifecycle 3 + save 1 ·
  `creatures.delete(` creatureLifecycle 2 + suicideBlast 1 + droneLifecycle 1 · `creatures.clear(`
  gameMode / godlyActions / save 1 each · `world.creatures =` none · `nextCreatureId =` gameMode 1 +
  save 3 · `ownerPlayerId` writes (incl. ??= ||= &&=, Object.assign) none · `pickNavUnit(` callers:
  hostTick 1 · `findNearestEnemyCreatureIndexed(` creatureAI 2 (def + call) · both epoch functions
  reset `epochEnemyIndex` · the three fingerprint conjuncts present · the live fallback + the split
  untargetable check present · ⭐ `isUntargetable`'s body is EXACTLY `isUntargetableType(c.type) ||
  isChannellingRa(c, tick)` (a third condition would silently bypass the index) · `untargetable`
  never assigned · `CREATURE_CONFIGS` never written · `.type =` only in render (audio nodes 17+1,
  DOM inputs 1+3 — my first count said 10: a hand grep truncated by `head`; corrected from the test's
  own output, each site read).
  ⚠ FOR THE MERGE OWNER: s191/owner (chewer persistence) may add a spawn or removal site — re-count
  after that merge and read the new site against the guard file's header question.
## Step 4 — final gates, numbers, report  — pending
