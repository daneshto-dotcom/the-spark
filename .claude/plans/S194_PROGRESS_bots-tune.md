# S194 — PROGRESS: s194/bots-tune (T7)

Branch `s194/bots-tune`, worktree `.claude/worktrees/s194-bots-tune`, base master `0a37175e`.

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
