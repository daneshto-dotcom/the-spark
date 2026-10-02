# S194 — PROGRESS: s194/bots-tune (T7)

Branch `s194/bots-tune`, worktree `.claude/worktrees/s194-bots-tune`, base master `0a37175e`.

## FINAL REPORT (T7 `s194/bots-tune`)
- **Tip**: the commit carrying this report (on top of the gates run). **Merge**: master ed54f64a → 0a02ed5e, no conflicts (plans/
  canon/canon.test/session-state only); `npm install` 0 at boot (lockfile unchanged by the merge).
- **Gates (merged tree)**: typecheck **0** · vitest `--maxWorkers=3` **0 — 522 files / 4 skipped, 7875 passed / 11 skipped** · build **0**,
  entry **1122.0 KiB (1 148 880 B)**, headroom 128.0; vs the recorded master 1121.9 → **≈ +0.1 KiB** (bots are a lazy chunk; master not
  rebuilt here). e2e not run (no UI/render change; bots are host-side sim). Benign: `pentagramBuildability.test.ts.snap` LF rewrite —
  `git diff -w` empty, restored, never committed. Scratch probes `zz_probeT7*` deleted before the gates.
- **BUMP: NO.** S186 test: two builds that shake hands disagree about nothing either computes — bots run on the host only (and the worker
  sim, which is the host's), and emit only existing allowlisted intents (FIX_ALL, REPAIR_STRUCTURE, PLACE, PULL…) via local dispatch.
  No reducer, hash, serialized field or wire type changed; a client never runs bot code.
- **Done**: (1) IMBA FORTRESS identity restored; (2) refused-PLACE spam → 0 (+ no-op PULL spam → 0); (3) bots FIX (FIX_ALL / per-tower);
  (4) Q-E Warmonger vs Tycoon separated. Numbers in the Log below.
- **MINE / owner questions** (one line each, with a recommendation):
  1. Personality names (Balanced / Warmonger / Fortress / Tycoon / Saboteur) — rec: keep; R194-12 says keep the five, and they now measure distinct.
  2. S154 "IMBA goblin tower first" for EVERY style — rec: keep (Q4 floor held in all five; Fortress/Warmonger still distinct above it).
  3. "Leftovers feed race towers" (Q-F) — rec: keep; a race tower eats one type, so leftovers of that type become units instead of idling.
  4. FIX outranks FEED and TOWER in the bot brain (R191-B "top priority") — under the lock a seeded shape may repair rather than buy a unit — rec: keep.
  5. `repairsTowers` MID = lost-shape only, HARD/IMBA = any damage — rec: keep.
  6. `substitute: 'listed'` for WARMONGER (all tiers) and IMBA FORTRESS; Fortress IMBA laser-2nd + hold 3300; Warmonger IMBA hold 3000 — rec: keep.
  7. `PLACE_RETRY_BACKOFF_TICKS` 30 — rec: keep.
- **Merge seams**: new `BotConfig.repairsTowers` (required field — any other branch adding a `BOT_CONFIGS` literal or a test fixture
  BotConfig must add it); new `PersonalityKnobs.substitute` (in `IDENTITY_KNOBS`); new BotGoal kind `FIX`; `botPersonality.fixtures.ts`
  `LockResult.fixJobsQueued`; re-pinned in `botPersonality.test.ts`: HARD Warmonger `toBe(0)` restored, IMBA Fortress pins restored
  (≥ 2 seats), lock anti-vacuity WARMONGER→SABOTEUR, lock cells feed-OR-fix. Any branch that moves the sim moves bot signatures; the
  pins are relational (who out-defends whom), not absolute.
- **NOT DONE**: nothing in scope. Visual check of bots in the browser not done (no UI change).

## Log
- [step 0] `git merge master` = no-op (already at 0a37175e). `npm install` exit 0. Read S194_AGENT_RULES, canon §3d/§8,
  CLAUDE.md, S193_PROGRESS_bots, S193_PROGRESS_playtest3, BOT_INTELLIGENCE_DESIGN §10.
- NEXT: probe (scratch `src/bots/zz_probeT7.test.ts`, never committed) — IMBA/HARD signatures per personality; refused PLACE
  counters per second (territoryBlockRejects + spawner-zone); repair-state of bot towers.
- [step 1 — FORTRESS] Measured (signature harness, 300 s, 0xb07/0xbeef) IMBA mean defence: BALANCED 0.28 · WARMONGER 0.22 ·
  FORTRESS 0.25 (no laser) · TYCOON 0.17 · SABOTEUR 0.00. New knob `substitute: 'any'|'listed'` (escapes only substitute
  listed roles; identity 'any'). IMBA FORTRESS row → order goblin>laser>stink>helga, substitute listed, hold 3300 (⚠ MINE).
  After: FORTRESS 0.50, lasers on 2 seats, 14 fed, 12 loose; others byte-identical. Test restores both S193 pins (highest def,
  only laser) + unit test for 'listed' with negative. Mutation (row back to S193) → 3 red. Variants measured in the row comment.
- NEXT: step 2 — PLACE spam. Probe: ~99.8 % of refused PLACEs are in FIGHT (`canBuildNow` false board-wide); MID 44/s, HARD
  66/s, IMBA 66/s across 3 bots over 300 s (13 226 / 19 741 / 19 954 FIGHT refusals; 0 / 2 / 10 in BUILD).
- [step 2 — PLACE spam] Root cause, three parts (all bot-side): (1) fetches/hauls started or finished in FIGHT, where
  `canBuildNow` is false board-wide (and `bankCarriedSparksAtPhaseEdge` banks the carry at the next whistle anyway); (2) the
  HAUL arm sent first, re-routed to an illegal fallback and re-sent on arrival every tick; (3) same class on the bank: a saving
  bot re-sent a no-op PULL into a full porch every think (426 HARD / 428 IMBA per 300 s). Fixes: brain `looseOk` (no pickup/
  PULL outside BUILD; ORDER still runs), controller TO_SPARK ends at the whistle, `placeRefusedAt` pre-check (reducer's two
  gates) + `PLACE_RETRY_BACKOFF_TICKS` 30 (⚠ MINE), brain `porchHasFreeSlot` (reducer's slot rule). After: 0/0/0 refused PLACE
  (was 13 226 / 19 741 / 19 954), 0 no-op pulls, landed 26/34/42 (= before). `src/bots/botPlaceSpam.test.ts`. Mutations: loose
  gates off → 4 red; + pre-check off → 621–675 refused (the back-off alone caps it), red; porch guard off → 426/428 no-op, red.
- [step 4 — Q-E, early] The rng stream moved (fewer chooseBuildPos draws), HARD WARMONGER re-measured def 0.17 (stink via
  escape after a razed goblin) — WARMONGER base gets `substitute: 'listed'` → def 0.00 every seat, `toBe(0)` pin restored.
  IMBA WARMONGER hold 3000 (⚠ MINE): def 0.00 · fed 17 · loose 18 · pentagram vs TYCOON def 0.17 · fed 3 · loose 51. New
  test "S194 Q-E". Lock anti-vacuity re-pinned WARMONGER→SABOTEUR (Warmonger's lock seat owns a race tower: 1 type → 1 feed,
  verified by spawner dump). IMBA FORTRESS on the new stream: 0.39 (2 lasers) vs BALANCED 0.28 — pins hold.
- NEXT: step 3 — bots FIX (REPAIR_STRUCTURE / FIX_ALL).
- [step 3 — bots FIX] (resumed) Tier knob `repairsTowers` NOOB never / MID broken / HARD+IMBA any (⚠ MINE). `chooseFix` (pure, rng-free,
  above TOWER): BUILD only, gatherer ≥ 1, queue < 32, targets = `fixAllTargets`; ≥ 2 → FIX_ALL, 1 → REPAIR_STRUCTURE. Measured 600 s:
  MID 0/1 FIX_ALL/FIX → 1 job, 1 restored; HARD 1/3 → 6 jobs, 6 restored; IMBA 1/1 → 3, 3; 0 refused FIX, 0 outside BUILD.
  `src/bots/botFix.test.ts`. Mutations: chooseFix disabled → 4 red; gatherer guard removed → 1800 refused FIX, red.
- NEXT: delete nothing (scratch probes already deleted), run full gates.
- [gates] merged master ed54f64a (0a02ed5e). First full run: typecheck 1 (TS2367 in botFix.test — fixed with a reader fn); vitest 1 —
  two lock cells (HARD SABOTEUR, IMBA BALANCED) 0 feeds / 1 tower: verified cause = the new FIX spends the one seeded shape on a repair
  (chooseFix disabled → green). Re-pinned to feed-OR-fix with `fixJobsQueued`. Re-run: tc 0 · vitest 0 (7875) · build 0 (1122.0 KiB).
- Final IMBA (with FIX): mean def BAL 0.28 · WAR 0.00 · FORT 0.39 (only laser) · TYC 0.17 · SAB 0.00; fed BAL 6 · WAR 17 · FORT 18 · TYC 3 · SAB 17.
  HARD: def BAL 0.28 · WAR 0.00 · FORT 0.39 · TYC 0.28 · SAB 0.11; fed WAR 20, SAB 3, others 0; loose TYC 52 vs BAL 34.
