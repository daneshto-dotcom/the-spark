# S191 PROGRESS — `s191/carry` (worktree `s191-carry`)

Brief: main checkout `.claude/plans/S191_BRIEFS/carry.md`. Rules: S191 PDR §4 + S189 PDR §4.
Branch base: `42cc2ee` (master plan commit on top of `5f22e1d`; src = deploy #4, PROTOCOL 51).

## Status

| step | status | commit | notes |
|---|---|---|---|
| 0 · `npm ci` | DONE | `60c304d` | `NPM_CI_EXIT=0` (captured `$?`, log `.tmp-gates/npm-ci.log`) |
| C-1 · worker startup `nextPulledSparkId` | DONE | (this commit) | see below |
| C-2 · WRATH-F5 pending cast vs tick moving backwards | next | | |
| C-3 · SWM-6 swarm draw through the bat-sheet fallback | todo | | |
| C-4 · `drawRaRitual` FIGHT gate | todo | | |
| C-5 · hub self-destruct = 120 fifths | todo | | |
| C-6 · `spreadEnemyTarget` strict predicate | GATED (merge owner "C-6 go") | | |
| C-7 · health bar on the star, bounded width | GATED (after weld on master) | | |

## C-1 — DONE

- Bug: `src/state/workerSim.ts` `makeWorkerSim` → `restore()` never writes `nextPulledSparkId` (not
  serialized; zero occurrences in `save.ts`), so a worker adopted mid-match minted its first pull at −1
  over a live pulled shape. Measured pre-fix: the live Triangle at −1 was replaced by the new Square.
- Fix: one line after `restore()` — `world.nextPulledSparkId = rebuildAuthorityAllocators(world).nextPulledSparkId`
  (calls the shared function, does NOT edit it — weld owns its body). Only that field is taken.
- Tests: `src/state/workerSim.pulledSparkId.test.ts` (5) — REACH through the real INIT seam
  (`snapshot()` → `makeWorkerSim`) and a real `applyTickBatch` pull intent; lowest-id-live case;
  newest-consumed case (pinned as collision-free but NOT bit-exact); bit-exact wide hash when the newest
  pull is live; negative (no pulled shape → −1, bit-exact, unchanged).
- Mutation: repair line replaced by `void rebuildAuthorityAllocators` → 4 of 5 RED (`expected 3 to be 2`
  = the eviction), restored → 5/5 green.
- Import-graph change: `workerSim.ts` value-imports `../net/migrationClaim.ts` — the worker graph's only
  `net/` value import. Worker chunk 222,208 → 224,465 B (+2,257 B). Entry chunk 978,794 B unchanged.
- Wire / hash / shared rule: none. `nextPulledSparkId` stays unserialized and off the wire → no bump.

## In flight

Nothing.

## Decisions / numbers that are MINE

- C-1: the scan repair (brief's first option) over serializing the counter. Serializing would be
  bit-exact but is 5 hunks in the `save.ts` hotspot (WorldSnapshot type, `snapshot()`, `restore()`, the
  NetSnapshot `Omit`, the `netSnapshot` destructure).

## Found, NOT fixed (outside the file boundary)

- **Wide-hash asymmetry on an EMPTIED castle bank** (pre-existing, test-oracle only): a seat whose pulls
  emptied its bank keeps an all-zero tally in `world.castleBanks`, `hashWorldStateFull` projects it
  (`cb0:0.0.0.0.0.0`), but `serializeCastleBanks` (`save.ts` ~:2096) skips zero tallies, so the restored
  world has no entry and the wide hash differs. The narrow production `hashWorldState` does not project
  banks, so host-vs-client is unaffected. Any differential test that INITs after a bank is emptied will
  red on it. Fix shape (hotspot, not mine): hash-skip zero tallies, or delete the map entry at zero.

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

None.

## Gate numbers

| after | typecheck | vitest (full) | build | entry KiB |
|---|---|---|---|---|
| baseline (before C-1) | — | — | 0 | 955.9 (978,794 B) |
| C-1 | 0 | running after commit | 0 | 955.9 (978,794 B) |
