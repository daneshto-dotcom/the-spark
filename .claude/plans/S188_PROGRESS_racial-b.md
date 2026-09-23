# S188 · `s188/racial-b` — PROGRESS (running file, updated with every wip commit)

Brief: `.claude/plans/2026-09-23_S188_BATCH_PDR.md` → BRIEF P5 (+ A2, A3, A5).

| mechanic | perk | status | files |
|---|---|---|---|
| THE RISEN | `zombies.l0` | **DONE** (BUILT=true; 16 tests; 2 mutations red) | `state/racial/theRisen.ts` (new), `creatures/creatureLifecycle.ts` death arm, `damage.ts` (one line: attacker threaded into `damageCreature`), `raceUnitEmit.ts` (additive: `spawnRaceUnitAtCastle`) |
| ENDLESS DYNASTY | `mummies.l5` | next | `state/racial/endlessDynasty.ts` (new), `game/player.ts`, `gameMode.ts`, `save.ts`, `stateHashFull.ts`, `damage.ts` castle arm |
| HELLSPAWN | `demons.l5` | next | `state/racial/hellspawn.ts` (new), `creatures/creature.ts`, `save.ts`, `stateHashFull.ts`, `creatureAttack.ts`, `render/chewerRenderer.ts`, `render/structureRampRenderer.ts` |
| differential (A5) | all three | next | `state/racial/racialB.differential.test.ts` (new) |

## Decisions so far (all MINE unless quoted)
- Kill signal = the FIRST time a creature's lethality is decided in `damageCreature` (the deferral set
  is the dedupe, so two same-tick lethal blows mint ONE zombie / ONE split).
- Every event-born creature goes through `queueAfterStrike` (A5) and is born after the sweep.

## Known broken / not yet done
- THE RISEN committed. Full `npx vitest run` not yet run on it (running next, in background).
