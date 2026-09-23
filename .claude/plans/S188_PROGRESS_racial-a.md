# S188 · `s188/racial-a` — PROGRESS (salvage file; updated with every commit)

Branch `s188/racial-a`, base 87f3dc4. Nothing pushed. `RACIAL_PERK_BUILT` flipped only when a
mechanic's tests pass.

| mechanic | perk | status | files |
|---|---|---|---|
| BLOOD DEBT (lifesteal 20 %) | vampires.l0 | NEXT | `state/racial/lifesteal.ts` (new), `state/damage.ts` (heal call in each arm + `damageConnector` attacker param), 4 `damageConnector` call sites |
| CRIMSON TIDE (lifesteal 50 %) | vampires.l5 | NEXT (same code as BLOOD DEBT) | same |
| BLOOD FRENZY | orcs.l0 | not started | `state/racial/bloodFrenzy.ts` (new), `racialTick.ts` slot |
| THE HORDE GROWS | orcs.l5 | not started | `state/racial/hordeGrows.ts` (new), `creatureLifecycle.ts underGoblinCaps`, `raceUnitEmit.ts` cadence |
| SCORCHED GROUND | demons.l0 | not started | `state/racial/scorchedGround.ts` (new), `racialTick.ts` slot, `damage.callSites.test.ts` (+1 null site), zone ember tint (render) |
| DEEP CURRENT | nagas.l0 | not started | `state/racial/deepCurrent.ts` (new), `gathererLifecycle.ts` HAULING, vortex (render) |

## Decisions recorded so far (MINE unless quoted)

- Research read: W1 `lifesteal`, W2 `reuse-mechanics` 1/1b/1c/3/4/4b.
- `npm install` done in the worktree (exit 0).

## Known broken

- nothing yet
