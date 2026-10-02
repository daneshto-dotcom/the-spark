# S194 PROGRESS — T11 rules (branch `s194/rules`) — R194-16 porch, R194-17 pants window

## NOW (resumed) — EXACT NEXT STEP
- R194-16 code + most re-pins committed (porch row 42, `CASTLE_PORCH_BUILD_CLEAR_RADIUS` 17 arm in `castleKeepOutHitsBox`, deposit = porch row, canon §4b).
- NEXT: re-pin 3 measured bot-signature asserts in `src/bots/botPersonality.test.ts` (HARD fort>bal def; IMBA SABOTEUR pentagram; lock anti-vacuity feeds>towers) — chaotic shift from the porch move (master geometry: 55/55 green; offset-only also red). Then a bot no-porch-spam REACH test, then R194-17.
- Measured R194-16: single shape S 61 / E 61 / SE lobe 78.5; stamps E laser 61.9→62.9, goblin 61.0→63.0, S unchanged 61.0.

## ⏸ PAUSED (owner session limit) — EXACT NEXT STEP
- **State:** discovery only. `git merge master` done (fast-forward to ad812166, no conflicts). `npm install` done (exit 0). NO source edits yet. No gates run yet. No background processes left running.
- **Next step:** measure castle art opaque bounds (`public/art/castles/*-atlas.png`, 256 cells drawn at `CASTLE_SPRITE_PX` 96, foot at anchor.y + `KEEP_H`/2 = 29) to pick the new `CASTLE_PORCH_OFFSET_Y` (constants.ts:791); then add a porch-clearance arm to `zones.castleKeepOutHitsBox` (zones.ts:293 — the ONE predicate read by canBuildAt / stampRefusalAt / ghost / bots).
- **Findings so far:**
  - Only `castleBank.porchSlot` reads `CASTLE_PORCH_OFFSET_Y`; consumers of porchSlot: `firstFreePorchSlot`, `isOwnPorchSpark`, gathererLifecycle:208-212 (pull landing), botBrain:961-968 (porch-clear), pullFeedback.
  - `structureRepair` deliberately does NOT read the keep-out (FIX/SCRAP) — adding the porch arm to `castleKeepOutHitsBox` keeps that true.
  - R194-17 not started (next: grep `MONSTER_EMERGE_TICKS`, `MONSTER_HOLD_LEAD_TICKS`).
