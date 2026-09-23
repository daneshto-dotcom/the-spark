# S188 · `s188/racial-b` — PROGRESS (running file, updated with every wip commit)

Brief: `.claude/plans/2026-09-23_S188_BATCH_PDR.md` → BRIEF P5 (+ A2, A3, A5).

| mechanic | perk | status | files |
|---|---|---|---|
| THE RISEN | `zombies.l0` | **DONE** (BUILT=true; 16 tests; 2 mutations red) | `state/racial/theRisen.ts` (new), `creatures/creatureLifecycle.ts` death arm, `damage.ts` (one line: attacker threaded into `damageCreature`), `raceUnitEmit.ts` (additive: `spawnRaceUnitAtCastle`) |
| ENDLESS DYNASTY | `mummies.l5` | **DONE** (BUILT=true; 21 tests; overkill-clamp mutation red) | `state/racial/endlessDynasty.ts` (new), `game/player.ts`, `gameMode.ts`, `save.ts`, `stateHashFull.ts`, `damage.ts` castle arm |
| HELLSPAWN | `demons.l5` | **DONE** (BUILT=true; 22 sim + 5 render tests; A2 mutation reds 3) | `state/racial/hellspawn.ts` (new), `creatures/creature.ts`, `save.ts`, `stateHashFull.ts`, `creatureAttack.ts`, `render/chewerRenderer.ts`, `render/structureRampRenderer.ts` |
| differential (A5) | all three | **DONE** — 514 frames / 1027 ticks, BUILD→FIGHT→BUILD, risen 25 / splits 24 / pharaohs 1; dropping dynastyHpLost from the save reds it | `state/racial/racialB.differential.test.ts` (new) |

## Decisions so far (all MINE unless quoted)
- Kill signal = the FIRST time a creature's lethality is decided in `damageCreature` (the deferral set
  is the dedupe, so two same-tick lethal blows mint ONE zombie / ONE split).
- Every event-born creature goes through `queueAfterStrike` (A5) and is born after the sweep.

## Known broken / not yet done
- THE RISEN committed; full suite after it: 344 files / 5644 tests, exit 0.
- ENDLESS DYNASTY committed (typecheck 0, 25 related files / 407 tests green). Session was cut off at 18:20 by the spend limit; resumed, salvage verified.

## Remaining
- canon notes file, full gates (typecheck / vitest / build), final report.
