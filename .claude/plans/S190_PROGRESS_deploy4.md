# S190 — deploy #4 integrator progress (branch `s190/deploy4`, worktree `.claude/worktrees/s190-deploy4`)

Written after every step so a limit kill loses nothing. The merge owner keeps triage, e2e, push, live check.

## Setup
- base: master 4a68db3 (deploy #3 src + plan commits)
- `npm ci` → NPMCI_EXIT=0
- baseline gates on 4a68db3: TC_EXIT=0, VT_EXIT=0 (6227 tests / 370 files, 49 s)
- ⚠ BENIGN (ruled): `src/state/spawners/__snapshots__/pentagramBuildability.test.ts.snap` shows ` M` after every vitest run — vitest rewrites it with LF, index is LF, autocrlf=true makes git call it stat-dirty; `git diff` is EMPTY. Never staged.

## Merge log (order: wrath → swarm → render → units → perf → draft-atk; weld + net only on the merge owner's message)

| # | branch | merge sha | TC_EXIT | VT_EXIT | carried reds (canon.test.ts, by design) | notes |
|---|---|---|---|---|---|---|
| 1 | s188/wrath (beb7517) | 7928dc1 | 0 | 1 | §3d/§3e registry test (:415, WRATH OF RA has no §3e row) | clean automatic merge; 1 failed / 6271 passed (373 files) |
| 2 | s188/swarm (74119db) | 865d6ec | 0 | 1 | + §3d offer test (:476, vampires wave 11 now offered) | clean automatic merge; 2 failed / 6309 passed (375 files) |
| 3 | s189/render (a5d6262) | d16442b | 0 | 1 | same two | CONFLICTS bossAuras.ts drawPowerOfRa (wrath per-charge loop + render strikeLayer) + goblinRenderer.ts atlasFallbackType (union); re-pinned s190RaStrikeAboveUnits (:89/:175 + NEW second-charge case, mutation-checked), s189EliteFallback + theSwarm exclusivity (union); stale portrait sentence fixed; 2 failed / 6375 passed (383) |
| 3b | render chores | b6078cf | 0 | 1 | same two | L1-5 coveredBy (codex / CONNECTION LOST) + test (mutation-checked); ten zIndex-900 comments corrected; 2 failed / 6376 passed |
| 4 | s189/units (81bf67b) | 8576ad4 | 0 | 1 | same two | clean automatic merge; C3 pin NOT added (U4); 2 failed / 6411 passed (389) |
| 5 | s190/perf (c11d20d) | ca0b520 | 0 | 1 | same two | hostTick auto-merged; SEAM fixed: differential test's two-nearest-enemy-shapes weld fixture → nearest UNBONDED pair (board moved on the merged tree; 2 reds → 6/6); 2 failed / 6421 passed / 2 skipped (392) |
| 6 | s188/draft-atk (9026a47) | fdcfa56 | 0 | 1 | + §3d PENDING TRAIN D (:496) + castle-arm pin (:862) = 4 | CONFLICTS corpseEater.ts imports (keep attackCycleMultiplier + creatureAttackFifths + noteCreatureHeal) + stateHashFull.ts (keep healedFifths :hf AND atkFifths :ak); 4 failed / 6454 passed / 2 skipped (397) |
| 6b | draft-atk + wrath text chores | fb668f9 | 0 | 1 | same four | R190-E cited in creatureStrike.guard SANCTIONED; stale attackFifths(atk, pen) arm comments; nplayer.spec raStrike note; S188_CANON_NOTES_wrath 50→51 correction |
| P51 | PROTOCOL 50 → 51 | 72757dc | 0 | 1 | + 3 protocol pins (:260, :803, :833) = 7 | six sites done; 50 docblock kept + attackCycleRaged backfilled; weld/net reasons still to add |
| C | canon + docs | 26fd01c | 0 | **0** | none — all re-pinned | 6464 passed / 2 skipped (397); SPARK_CANON §3/§3d/§3e/§5b/§6/§7b/§7c, BOSS_STATS_TABLE:57, castleRegen docblocks, draftEvent docblocks, CLAUDE.md protocol line |

## Pending
- weld: waiting for merge-owner message
- net: waiting for merge-owner message
- protocol 51 commit — DONE (extend with weld/net reasons when they land)
- canon commit(s) — DONE (extend with weld/net when they land)
- final gates on the tree WITHOUT weld/net (26fd01c): TC_EXIT=0 · VT_EXIT=0 (6464 passed / 2 skipped, 397 files) · BUILD_EXIT=0 (entry 955.9 KiB / cap 1100, headroom 144.1; static 122.8 MiB / 215 files). To re-run after weld/net.

## Cross-branch seams found and fixed by the integrator
- perf × merged tree: `bondTargetIndex.differential.test.ts` smallExactSequence welded "the two nearest enemy shapes" of a REAL bots-match board; the merged sim moved the board so they were already bonded (`weld` → null, 2 reds). Fixture now takes the nearest UNBONDED enemy pair (test-only; ca0b520).
- wrath × render (Ra strike loop) and swarm × render (atlasFallbackType) — per the notes (d16442b), plus a NEW second-charge test (mutation-checked).
- draft-atk × render/units (corpseEater imports, stateHashFull union + projection) — per the notes (fdcfa56).

## Chores done beyond the merges (all from the notes)
- render L1-5 coveredBy fix + test; ten zIndex-900 comments (b6078cf)
- draft-atk R190-E SANCTIONED strings + stale arm comments; wrath raStrike notes; S188_CANON_NOTES_wrath 50→51 (fb668f9)
- protocol 51, six sites, 50 docblock kept + attackCycleRaged backfilled (72757dc)
- canon + docs (26fd01c)

## Carry-forwards recorded (not this deploy)
- notes: workerSim.ts:213 nextPulledSparkId repair (latent); WRATH-F5; SWM-6; DA-A2 owner question (in canon §3d); render owner questions (R190-I on the castle, rune ring above units, RECONNECTING over the draft panel, Ra strike above buildings); perf FFA-spread latent finding (in canon §5b).
- CLAUDE.md bundle line still says 948.1 KiB (train A); deploy-#4 tree measures 955.9 before weld/net.
