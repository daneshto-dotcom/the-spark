# S195 PROGRESS — s195/carry-forwards (cloud, 2026-10-05)

NEXT STEP: DONE — awaiting the merge owner. (The final report is below; the read-pass verdict log is kept under it.)

## FINAL REPORT — s195/carry-forwards

**Tip:** the commit that carries this file (code tip before it: `402b4ed6`). Merged `ccr-26eaab43-fa9mg3` at `ba48192f` (clean, no conflicts; lockfile unchanged → no `npm install` owed).

**Gates (merged tree, every exit code captured to `.tmp-gates/*.exit`):**
- `npm run typecheck` → **0**
- `npx vitest run --maxWorkers=2 src/canon.test.ts src/render/uiSkinCensus.reach.test.ts src/render/uiSkinCensus.test.ts src/render/uiSkinReach src/state/endgame src/state/matchStats src/render/matchBoard src/render/weldedSheet` → **0** — 34 files / 408 tests. (⚠ the brief's glob `src/state/endgameMonsters*.test.ts` matches NO file; `src/state/endgame*.test.ts` — 6 files / 92 tests — is what covers `endgameMonsters.ts`, and it ran.)
- `npm run build` → **0** — entry `index-mJyE5LA8.js` **1195.6 KiB / 1250, headroom 54.4 KiB**. **This tree adds 0 bytes**: the entry hash is identical before and after my last commit, and no production source changed (`matchStats.wire.fixtures.ts` is imported by tests only). The 1195.6 is the integration tip's own size (ci-budgets / info-ui / fight-wipe landed).
- No e2e spec touched (docs + tests only) → none run.

**Per item:**
1. **Nits — 1a ALREADY TRUE**: `voltkin-config.ts:1244` already reads *"was BOTH until S194 (R194-9 made it STRUCTURES_ONLY)"*; verified against `stats.ts:419` (`lightningDrone: STRUCTURES_ONLY`) and `droneLifecycle.ts:6-9` (homes on bonds). No edit. **1b DONE** (`b879efdb`): `monstersDueBy`'s own docblock (`endgame.ts`) is current (window W, divisor T−1, lanes). The stale one was `endgameMonsters.ts:68-75` — orphaned above `monsterMaxLivePerSeat` by the S194 insert and still calling the retired emerge cadence the pace; re-seated on `tickEndgameSpawner`, now describes the R194-17 window (`pantsWindowTicks`, `monsterFightTicks`). Doc only.
2. **Canon §9e DONE** (`37ca050a`, `402b4ed6`): no stat-board section existed (grep). Wrote `## 9e · ⭐ THE END-OF-MATCH STAT BOARD` before §10: the counter table with wire keys (incl. `le`), the inert/additive-optional no-bump contract, the history `v` array and per-wave-by-difference rule, the wire cost (**2,503 B totals / 11,101 B in-window / 19,741 B at 60 waves**, re-measured live through the wire test, bounds 3/12/22 KiB), `HISTORY_WINDOW_TICKS` = 2 × PHYSICS_HZ = 120, and B-20..23 (badge list + leader-only rule, self-detonation exclusion, the four chart forms + the adding-up grid, ← → Tab / Shift+Tab / R never consumed). **Pins (same commit, `canon.test.ts` "S195 — §9e", 8 tests):** `heavyMatch` moved to a SHARED fixture `src/state/matchStats.wire.fixtures.ts` (wire test re-pointed, bounds unchanged) so the canon pins the three byte figures exactly; `assignBadges` behaviour (leader-only, tie → none, runner-up never promoted); the SUICIDE_BLAST / DRONE_EXPLODE non-death through real dispatch; `matchBoardModel` chart titles/forms + row/column sums; `handleKey` source + the REACH test's title. ⚠ **Between-branches catch:** my first pin said the `le` board row was NOT YET DRAWN and was built to go red when it landed — it went red on the merge (s195/info-ui `6156223f` drew it, local seat only). Canon sentence rewritten to the live rule (*Drawn OWNER-ONLY*, `row.isLocal`, `ENTROPY_BLOCK_W` 180 ⚠ MINE), pin re-aimed at the model row for every seat + the `isLocal` gate in `matchBoard.ts`, REACH = `matchBoardPolish.test.ts`.
3. **T1 welded REACH DONE** (`68c51c61`): new `src/render/uiSkinReach.welded.test.ts` (7 tests) — real `CharacterSheet.sync` on the R191-A two-tower weld; STRUCTURE card: one skinned row per tower exactly on the rect `ownedRowAt` answers for, inside/outside, hover lands on exactly that rect; TOWER card: the OTHER tower's 22 px icon, same contract, action buttons are not weld hits. Black-box (rects derived from the recorded `skinButtonFx` calls + public `ownedRowAt`, never `weldHits`). Marker `// CENSUS-REACH src/render/characterSheet.ts :: *`; census pairing green. **Mutation:** row skin shifted `ry + 2` in `drawWelded` → 1 failed; `characterSheet.ts` restored via `git checkout` (not touched by this tree).
4. **`.gitattributes` ALREADY TRUE**: `*.snap text eol=lf` present with the S195 T21 rationale. No edit.
5. **Stale-prose sweep — NOTHING STALE FOUND**: canon §5b labels `isIsolatedVoltkinChain` DELETED (B-31); §5c says *"lowered it from 1.25"* and *"measured at 1.25 and are history"* (N11); src non-test mentions (`protocol.ts:972,1099`, `constants.ts:4186-4188`, `voltkinChainWalk.ts:120`, `voltkin.ts:181`, `voltkinTv.ts:75`) all label the old behaviour as history. The other `1.25`/`isolated` hits are unrelated (bond strain ratios, fx widths, sprite scale, Little's Law). No edit.

**Bump verdict: NO.** Docs, tests and one test-only fixture file. Nothing on the wire, nothing hashed, no reducer touched; two builds that shake hands compute identical state.

**MINE / for the merge owner:** (a) `canon.test.ts` now pins the wire bytes EXACTLY (2,503 / 11,101 / 19,741) off the shared fixture — any tree adding a serialized stat key will turn §9e red and must re-measure + update the canon in the same commit (by design, CLAUDE.md canon rule). (b) The build prints the 54.4 KiB headroom WARNING (S101 policy says raise the charter) — not mine, the integration tip's size; flagging. (c) Brief glob `endgameMonsters*.test.ts` names no file — the endgame coverage is `endgame*.test.ts`.

**NOT DONE:** nothing from the §C list in my brief. Not attempted (not code work): owner-OS items, Pitch Masters, T8 quarantine cap, T10 live portraits.

---

## Read-pass verdict log (kept)
## Verdicts so far (read, not yet committed as changes)
- Item 1a `voltkin-config.ts:1244` — ALREADY TRUE: the line reads "was BOTH until S194 (R194-9 made it STRUCTURES_ONLY)"; `stats.ts:419` `lightningDrone: STRUCTURES_ONLY`; drone homes on bonds (`droneLifecycle.ts:6-9`). History is labelled as history. No edit.
- Item 1b `monstersDueBy` docblock lives in `src/state/endgame.ts` (current: window W, divisor T−1, lanes). The STALE one is `endgameMonsters.ts:68-75`: it sits above `monsterMaxLivePerSeat` (orphaned by the S194 insert) and says the pace is "one at a time out of the circle" with no mention of the R194-17 window. → fix (doc only).
- Item 2 canon: no stat-board section exists (grep "stat board|matchStats|UNITS LOST" → only §5d's TEAM N WINS line and §6's "T10 matchboard ride"). Wire test re-run live: totals 2503 B · in-window 11101 B · full 11101 B (4 seats, 8 types, 30 waves); 60 waves in-window 19741 B. → write §9e + pins.
- Item 3: `uiSkinReach.sheet.test.ts` covers the goblin card's actions/plate only; the welded icons (`characterSheet.ts:878`) and rows (`:893`) have no REACH. → new `uiSkinReach.welded.test.ts`.
- Item 4 `.gitattributes` — ALREADY TRUE: `*.snap text eol=lf` present (S195 T21 comment).
- Item 5 sweep — canon §5b B-31 labels `isIsolatedVoltkinChain` DELETED; §5c N11 labels 1.25 as "lowered … from 1.25" / "measured at 1.25 and are history"; src non-test mentions (`protocol.ts:972,1099`, `constants.ts:4186-4188`, `voltkinChainWalk.ts:120`, `voltkin.ts:181`, `voltkinTv.ts:75`) all label history. Nothing stale found.
