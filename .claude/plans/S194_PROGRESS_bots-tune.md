# S194 — PROGRESS: s194/bots-tune (T7)

Branch `s194/bots-tune`, worktree `.claude/worktrees/s194-bots-tune`, base master `0a37175e`.

## ⏸ PAUSED (owner session limit) — RESUME HERE
- **EXACT NEXT STEP: step 3 — bots FIX.** Nothing of it is written yet (no half-done code). Plan: new BotGoal `FIX`
  (castle command, no travel) in `botBrain.chooseGoal` (BUILD only, own gatherer ≥ 1, `seatJobCount < REPAIR_JOBS_MAX_PER_SEAT`),
  driven by `fixAllTargets(world, seat)` (`src/state/repairJobs.ts:190`): ≥ 2 targets → send `FIX_ALL`; exactly 1 →
  `REPAIR_STRUCTURE { primitiveId: targetId }`. Both are existing allowlisted intents (protocol.ts:1853/1856) and allowed
  under the endgame lock. New tier knob `repairsTowers` (MID/HARD/IMBA, ⚠ MINE) + thresholds ⚠ MINE. Then REACH test through
  the real host tick (jobs queued + a tower restored), negative (FIGHT / no gatherer), mutation; then step 4 report numbers
  (already measured, in the log), full gates, final report.
- Done + committed: step 1 (Fortress), step 2 (PLACE/PULL spam), step 4's Warmonger/Tycoon separation.
- Last gates: `npx vitest run src/bots --maxWorkers=3` → exit 0 (21 files / 220 tests, incl. untracked scratch probes).
  Full typecheck/vitest/build NOT yet run on this branch. Untracked scratch `src/bots/zz_probeT7*.test.ts` (never commit;
  they fail typecheck with TS2367 — scratch only, delete before the gates).

## FINAL REPORT
(pending)

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
