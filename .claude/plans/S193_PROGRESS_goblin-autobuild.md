# S193 PROGRESS — goblin-autobuild (owner T4) — ✅ DONE, ready for the merge owner

## FINAL REPORT
- **Branch / tip**: `s193/goblin-autobuild` — tip = the commit carrying this file (`git log -1`); last code commit `f61bf2f4`.
- **Merge**: branched straight from master `a638565b` (newer than the rules file's `8693fdd`) → no `git merge master` needed, **0 conflicts**.
- **Gates** (exit codes captured to files in `.tmp-gates/`):
  - `npm run typecheck` → **0**
  - `npx vitest run --maxWorkers=3` → **0** — 472 files passed / 4 skipped; **7280 tests passed** / 11 skipped
  - `npm run build` → **0** — entry **1037.7 KiB** (1 062 616 B); base `a638565b` built the same way = 1034.7 KiB → **+3.0 KiB**; headroom 62.3 KiB of the 1100 cap.
  - e2e: not run (no e2e spec changed; the card's `getUiPoints().actions[].autoFeed` is exposed for one).
- **Ruled benign**: the full vitest run rewrites `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` CRLF→LF with NO content diff (`git diff` empty); restored. Not caused by this branch.
- **BUMP VERDICT: BUMP REQUIRED (56 → 57; the merge owner bumps).** A NEW CLIENT INTENT `SET_AUTO_FEED` — a v56 host has no allowlist row for it, so it would silently DROP a v57 joiner's toggles while the host seat's own work (the S187 `CHOOSE_DRAFT` precedent). Riding along, additive-optional: `SerializedSpawner.autoFeedMask` + `.autoFeedCursor` (on the wire, emitted only when ≠ 0, wide-hashed `:af` / `:ac`) and the host rule `runGoblinAutoFeed`. Docblock line for the const: *"S193 T4 (s193/goblin-autobuild): new client intent SET_AUTO_FEED; CreatureSpawner.autoFeedMask/autoFeedCursor on the wire; the host auto-build runner (dispatches FEED_TOWER)."*

### What is MINE (owner questions, one line each, with my recommendation)
- **Q1 poll cadence** — a toggled tower looks for a free slot every 6 ticks (0.1 s), one goblin per look (10 refill in 1 s, 20 in 2 s under HORDE). `AUTO_FEED_POLL_TICKS`. Rec: keep.
- **Q2 several toggles** — round-robin in shape order (Dot→Spiral) from a persisted cursor, so Square+Spiral alternate shield/bat; if one runs out the other fills. Rec: keep.
- **Q3 race towers** — tier-3 race towers are NOT toggleable (he said "the goblin tower"). One line in `applySetAutoFeed` to widen. Rec: ask him; likely yes for the race tower too.
- **Q4 rebuilt tower** — a tower that dies takes its toggles; a rebuilt one starts all OFF. Rec: keep.
- **Q5 bots** — bots do not use it (no bot feeds a goblin tower today; `s193/bots` is a parallel branch). Rec: a later bot-brain item.
- **Q6 HAND wins** — with a Ra/scorch aim or a held tower, a right-click on a chip puts it back and toggles nothing (R190-G). Rec: keep.
- **Q7 SET not flip + 1 s local pending overlay** (`AUTO_FEED_PENDING_TICKS` = 60 in `controls.ts`) so a fast double-click under lag lands where the last click said. Rec: keep.
- Lit cue = green ring outside the chip + filled pip top-right (`AUTO_FEED_TINT` 0x8fe36a). Cosmetic, mine.

### Merge seams the merge owner must know
1. ⛔ **`s192/endgame`**: `ENDGAME_LOCK_INTENT_POLICY` is exhaustive over `CLIENT_INTENT_TYPES` (its test asserts set-equality) → add **`SET_AUTO_FEED: 'allow'`** when the two meet, or that test goes red. The auto-feeds themselves are FEED_TOWER (already 'allow').
2. `controls.rightClickSurfaces.test.ts` now counts **7** right-click sites with a new tag class **`R190-G: CONTROL`** — any other branch adding a right-click site must re-count against 7, not 6.
3. `CharacterSheetLike` gained an OPTIONAL `autoFeedAt?`; the sheet-action payload widened with `on?: boolean` (kind `'AUTO_FEED'`). Optional, so other branches' stubs stay assignable.
4. Shared files touched: `controls.ts` (one onDown line + one handler), `main.ts` (one branch in `setSheetActionHandler`), `protocol.ts` (two allowlist rows, no version edit), `world.ts`, `hostTick.ts` (one call after the spawner poll), `save.ts`, `stateHashFull.ts`, `benchGate.ts` (allow), `elimination.ts` (deny), `structurePanel.ts`, `characterSheet.ts`, `characterSheetModel.ts`, `spawners/spawner.ts`.
5. Canon: not edited (avoids a shared-file conflict). If the merge owner wants it in canon §3e, pin `AUTO_FEED_POLL_TICKS` = 6 in `canon.test.ts` in the same commit.

### NOT DONE
- e2e lane for the gesture (unit REACH covers it through the real Controls + real CharacterSheet).
- Bots using auto-build (MINE: deliberately out).

## Log
- [x] worktree + npm install (exit 0)
- [x] read: rules, canon (§3e HORDE, §6 wire), FEED_TOWER, card feed strip, controls R190-G, endgame lock (s192/endgame, read-only)
- [x] SPEC `.claude/plans/S193_GOBLIN_AUTOBUILD_SPEC.md` + Council ledger (Grok 3 + Gemini 4 challenges; 3 adopted, 3 rejected with reasons, 1 rejected-diagnosis/adopted-fix)
- [x] BUILD: `src/state/goblinAutoFeed.ts` (intent reducer + host runner dispatching FEED_TOWER), spawner fields (factory/serialize/wire/hash/worker), card cue + `autoFeedAt`, controls CONTROL site + pending overlay, main.ts dispatch
- [x] tests: `src/state/goblinAutoFeed.test.ts` (28: REACH via runHostTick, negatives incl. bench/elimination/other seat/race tower/malformed, round-robin, two-tower contention by id, four sites, host-vs-worker bit-exact, guard) · `src/input/goblinAutoFeed.controls.test.ts` (11: real Controls + real CharacterSheet) · R190-G count test 6→7
- [x] mutation-tested: runner `dispatch`→`applyFeedTower` turned the bench REACH + source guard RED (2 failed); removing the onDown CONTROL line turned 6 controls REACH tests RED. Both restored, green.
- [x] gates (above)

## NEXT STEP
None on this branch — hand to the merge owner (seams above).

## ROUND 2 (coordinator audit follow-ups) — IN PROGRESS
- merged master (PROTOCOL 58) clean, npm install 0.
- [x] item 1 sim: World.goblinAutoFeedMemory (worldTypes/factory/clears x5/save+strip/restore/hash)
- NEXT: item 4 runner skip benched/eliminated; items 2/3/5 controls; item 6 canon; tests; gates.
