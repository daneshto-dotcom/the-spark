# S195 PROGRESS — s195/carry-forwards (cloud, 2026-10-05)

NEXT STEP: final gates re-run on the merged tree, then the final report at the top of this file and the hand-back.

## Verdicts so far (read, not yet committed as changes)
- Item 1a `voltkin-config.ts:1244` — ALREADY TRUE: the line reads "was BOTH until S194 (R194-9 made it STRUCTURES_ONLY)"; `stats.ts:419` `lightningDrone: STRUCTURES_ONLY`; drone homes on bonds (`droneLifecycle.ts:6-9`). History is labelled as history. No edit.
- Item 1b `monstersDueBy` docblock lives in `src/state/endgame.ts` (current: window W, divisor T−1, lanes). The STALE one is `endgameMonsters.ts:68-75`: it sits above `monsterMaxLivePerSeat` (orphaned by the S194 insert) and says the pace is "one at a time out of the circle" with no mention of the R194-17 window. → fix (doc only).
- Item 2 canon: no stat-board section exists (grep "stat board|matchStats|UNITS LOST" → only §5d's TEAM N WINS line and §6's "T10 matchboard ride"). Wire test re-run live: totals 2503 B · in-window 11101 B · full 11101 B (4 seats, 8 types, 30 waves); 60 waves in-window 19741 B. → write §9e + pins.
- Item 3: `uiSkinReach.sheet.test.ts` covers the goblin card's actions/plate only; the welded icons (`characterSheet.ts:878`) and rows (`:893`) have no REACH. → new `uiSkinReach.welded.test.ts`.
- Item 4 `.gitattributes` — ALREADY TRUE: `*.snap text eol=lf` present (S195 T21 comment).
- Item 5 sweep — canon §5b B-31 labels `isIsolatedVoltkinChain` DELETED; §5c N11 labels 1.25 as "lowered … from 1.25" / "measured at 1.25 and are history"; src non-test mentions (`protocol.ts:972,1099`, `constants.ts:4186-4188`, `voltkinChainWalk.ts:120`, `voltkin.ts:181`, `voltkinTv.ts:75`) all label history. Nothing stale found.
