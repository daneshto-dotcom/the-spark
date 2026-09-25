# S191 BRIEF — `s191/perf` (the wave-5 host tick, next hotspots — outputs byte-identical)

**Worktree:** `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark\.claude\worktrees\s191-perf` · **branch** `s191/perf` from master `5f22e1d` (src = deploy #4).
**Rules:** `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §4 (read it first). Progress file `.claude/plans/S191_PROGRESS_perf.md`; notes `.claude/plans/S191_CANON_NOTES_perf.md`.
**Step 0:** `npm ci` (captured `$?`); progress skeleton committed.

## Context
The owner's C5 was *"it was lagging at about wave five. I thought we fixed the lags"*. S190's `s190/perf` (deploy #4) indexed the creature→bond target scan: 120 creatures went 6.6–7.1 → **2.5 ms** mean host tick, byte-identical oracle (`bondTargetIndex.differential.test.ts`, `openBondTargetEpoch` / `closeBondTargetEpoch` in `hostTick.ts`). Read `S190_CANON_NOTES_perf.md` (main checkout `.claude/plans/`) and canon §5b's last paragraph first. S190's measurement of what is left at wave 5: **physics 40 % of the tick — `computeTerritorialInfluence` 18 %, `solveBonds` 8.8 %; `pickNavUnit` 9.3 % (an O(n²) enemy search); `tickScoring` 7.7 %.**

## Steps (commit after each)
1. **Measure first**, through the REAL host tick on the same wave-5 board s190/perf used (find its instrument / fixture; reuse it, do not invent a lighter board — S190 found a real wave-5 board carries ~2.2 bonds per shape where the S182 fixture carried ~1.0). V8 CPU profile, top self-time, host tick mean / p95 / max. Record in the progress file with the command.
2. **One hotspot per commit**, in the order the profile ranks them. Each: pure performance, **identical outputs** — the same iteration order where order matters (total orders: squared distance, then explicit id; never `Map` order), no float reassociation that can change a result, no new state. Each lands with (a) a differential test against the pre-change implementation kept as a reference in the test (like `bondTargetIndex.differential.test.ts`) over a multi-wave run, asserting `hashWorldStateFull` identical every tick; (b) the before/after numbers.
   - `computeTerritorialInfluence` (`src/state/territory.ts`): players × enemy bonds × own prims per tick — a per-tick per-colour candidate list / spatial grid.
   - `pickNavUnit`: O(n²) enemy search — a per-tick per-seat candidate list with the SAME (distSq, id) tie-break.
   - `solveBonds`, `tickScoring`: only if the profile still ranks them after the first two.
3. **Guard the cache invariants mechanically** (S182 lesson 2): if you add a per-tick index, add an occurrence-count guard like `bondTargetIndex.guards.test.ts` for the writers that could stale it.
4. **Final gates** (captured `$?`), final numbers table, **STOP and report**.

## Hazards
- `territory.ts` feeds zone ownership and the SCORCHED GROUND zone test (`zoneOf(pos) === zoneOwner(seat)`), which s191/owner is changing — keep your change strictly internal to the computation; do not change any exported signature.
- Creature AI files are also read by s191/owner (chewer persistence) — internal changes only, no behaviour change.
- No protocol bump is expected (outputs identical); if anything you touch is a rule a client computes, stop and report.

## File boundary
`src/state/territory.ts`, the `pickNavUnit` module, physics `solveBonds`, `tickScoring`, their tests + a measure instrument. Nothing else.
