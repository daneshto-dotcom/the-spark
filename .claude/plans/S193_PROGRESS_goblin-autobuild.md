# S193 PROGRESS — goblin-autobuild (owner T4) — ✅ ROUND 2 DONE, ready for the merge owner

## FINAL REPORT (round 2)
- **Branch / tip**: `s193/goblin-autobuild` — tip = the commit carrying this file; last code commit `9265b189`.
- **Merges**: `ece33e5c` (master `ba1062be`, PROTOCOL 58) and `dcc14dff` (master `b72e7790`, endgame landed, PROTOCOL 59) — **0 conflicts** both; `npm install` 0 after each. Snapshot file restored with `git checkout --` before committing; `.tmp-audit/` untouched.
- **Gates** (exit codes to files in `.tmp-gates/`), on the tree merged with `b72e7790`:
  - `npm run typecheck` → **0**
  - `npx vitest run --maxWorkers=3` → **0** — 488 files passed / 4 skipped; **7496 passed** / 11 skipped
  - `npm run build` → **0** — entry **1066.4 KiB** (1 091 955 B) vs master `b72e7790` built the same way 1061.9 KiB (1 087 358 B) → **+4.5 KiB**; headroom 183.6 KiB of the 1250 cap.
  - e2e: not run (no e2e spec changed).
- **Ruled benign**: a full vitest run rewrites `pentagramBuildability.test.ts.snap` CRLF→LF, no content diff; restored each time.
- **BUMP VERDICT: BUMP REQUIRED (59 → 60 or later; the merge owner bumps).** New client intent `SET_AUTO_FEED` (a v59 host drops a v60 joiner's toggles — the `CHOOSE_DRAFT` precedent). Riding along: `SerializedSpawner.autoFeedMask/autoFeedCursor` (wire, additive-optional, hashed `:af`/`:ac`); host-only `World.goblinAutoFeedMemory` (disk/worker, NOT wire, hashed `gm:`); the host runner. Docblock line: *"S193 T4 (s193/goblin-autobuild): new client intent SET_AUTO_FEED; CreatureSpawner.autoFeedMask/autoFeedCursor on the wire; host-only World.goblinAutoFeedMemory; the host auto-build runner (dispatches FEED_TOWER)."*

### Round 2 items (coordinator audit) — all built
1. MED — toggles survive a bite: `World.goblinAutoFeedMemory` (anchor → {owner, mask, cursor}, ⚠ MINE). Written by `applyRemoveSpawner` (toggled goblin tower, anchor standing), consumed by `applyRegisterSpawner` (same seat + goblin tower only), pruned when its anchor is gone, cleared at all 5 `creatureSpawners.clear()` sites. Factory, disk+worker save/restore (sanitised), wire-stripped (`NetSnapshot` Omit + `netSnapshot` destructure), `FIELD_COVERAGE` 'hashed' + `gm:` projection + contribution row. REACH (sever one own connector → real host poll removes → FIX → toggles back, then builds) + negatives (anchor destroyed, untoggled, other seat, clears). Mutation: removing the restore → REACH red.
2. LOW — refused cue on a right-click over a non-toggle card control (race chip, FIX, SCRAP); plain plate stays silent. Mutation-tested.
3. LOW — `pendingAutoFeed` pruned (expired, or deadline beyond the window) and `controls.clearAutoFeedPending()` on the title return (main.ts). There is no START_GAME hook in Controls and START_GAME does not reset `world.tick`, so the title-return clear + window prune is the implementation (rematch without title is covered by the 1 s window). Mutation-tested.
4. LOW — the runner skips benched / eliminated seats; counters `actorBenched` / `actorEliminated` stay flat (tested; mutation removing the skip → red). ⚠ Consequence recorded: the bench REACH no longer catches a dispatch-bypass mutation; the source guard does, and the endgame-lock REACH below does (the lock is dispatch-only).
5. LOW — `isHandHolding()` + `putBackHand()` in `controls.ts`; used by the toggle and the castle-panel / draft-plate / held-tower put-backs (the held-tower one is byte-identical: both aims return earlier on RMB). Source test pins one chain + three call sites; the existing REACH put-back tests stay green.
6. Canon §3g (new subsection) with `AUTO_FEED_POLL_TICKS` = 6 pinned in `canon.test.ts` (mutation 6→7 in the md → red).
- Endgame was on master at the second merge → **added `SET_AUTO_FEED: 'allow'` to `ENDGAME_LOCK_INTENT_POLICY` myself**, with a REACH test at wave 27 (toggle applies, runner builds through dispatch, a denied intent is still counted) — mutation `'deny'` → red. Also classified my two new owner comparisons in `endgameS193.test.ts`'s enumeration (seat-only).

### What is MINE (owner questions, one line each, with a recommendation)
- Q1 poll every 6 ticks, one goblin per look — keep.
- Q2 round-robin by shape order from a saved cursor — keep.
- Q3 race towers not toggleable (chip plays the refused cue) — ask him; likely yes.
- Q4 toggles survive a bite at the same anchor; a destroyed / elsewhere-rebuilt tower starts OFF — keep.
- Q5 bots don't use it — later bot item.
- Q6 something in hand wins over the toggle — keep.
- Q7 SET + 1 s local pending overlay — keep.

### Merge seams
1. 7 right-click sites, new tag `R190-G: CONTROL` (other branches count against 7).
2. `CharacterSheetLike.autoFeedAt?` optional; sheet-action payload `on?`, kind `'AUTO_FEED'`.
3. `World` gained `goblinAutoFeedMemory` — any branch adding a `World` field or a `creatureSpawners.clear()` site must clear it too; `FIELD_COVERAGE` and the contribution test list both carry it.
4. `NetSnapshot` now also omits `goblinAutoFeedMemory`.
5. `endgameS193.test.ts` SITES gained `goblinAutoFeed.ts` and `spawners/spawnerLifecycle.ts`.

### NOT DONE
- e2e lane for the gesture (unit REACH through the real Controls + real CharacterSheet covers it).
- Bots using auto-build (MINE, out).
- Host-migration carry of `goblinAutoFeedMemory` (host-only by design: a promoted client starts with none — at worst a tower bitten just before the migration re-ignites OFF).
