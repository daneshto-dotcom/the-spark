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
## Step 3 — cache-invariant guards  — pending
## Step 4 — final gates, numbers, report  — pending
