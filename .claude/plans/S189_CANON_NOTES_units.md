# S189 CANON NOTES — `s189/units`

Canon text + constants this branch introduces or changes, for the merge owner to fold into
`SPARK_CANON.md` / `src/canon.test.ts` (this branch never edits either).

## C3 — THE VOLTKIN'S TARGET ORDER (suggested for §5 "WHO SHOOTS WHAT" or §4)

> *"Vulcan attacks his own buildings … instead of going to the right to my zone … he just started
> attacking the buildings around him"* — owner, S189. He accepts own-building attacks only once every
> enemy building is gone.

| priority | what the Voltkin does | code |
|---|---|---|
| 1 | an ENEMY UNIT inside its 180 px `attackRange` — zapped first, never walked to | `findNearestEnemyCreature` (S103 #8) |
| 2 | the nearest ENEMY connector ANYWHERE on the board — walked to | `findNearestBondTarget(…, enemyOnly=false)` |
| 3 | only when NO enemy connector exists: its own nearest connector | the same call's `bestEnemyId ?? bestOwnId` |

⛔ **Priority 3 is a fallback, never a distance contest** — an enemy connector 1100 px away beats an
own one 30 px away. `voltkinEnemyFirst.test.ts` pins it through the real host tick and was
mutation-tested. ⚠ Priority 1 is what holds a Voltkin at home under a continuous raid (measured: 1199
of 1199 life ticks at home with goblins arriving every 2.5 s) — shipped behaviour, owner's call.

Suggested assertion: source-text pin of `return bestEnemyId ?? bestOwnId;` in `creatureAI.ts`, plus
a reference to `voltkinEnemyFirst.test.ts` for the behaviour.

## C8 — HELGA IS HELD TO THE SAME BOARD EDGE AS EVERY CREATURE (suggested for §4b or §9b)

> *"Helga moves behind the map … I built the Helga tower near the castle … I thought that you added
> invisible walls around the whole map"* — owner, S189

Her patrol point (up to `PRINCESS_SLAP_RANGE × PRINCESS_PATROL_RADIUS_FRAC` = 380 × 0.35 = 133 px
from her hub) and her integrator are both clamped to `[WORLD_EDGE_MARGIN, CANVAS_WIDTH −
WORLD_EDGE_MARGIN] × [WORLD_EDGE_MARGIN, CANVAS_HEIGHT − WORLD_EDGE_MARGIN]` = [40, 1880] × [40, 1040]
— `clampIntoPlayfield`, the creature bound. ⛔ The old claim that her hub leash keeps her off the
edges was false from S183 on. Pinned by `helgaOnTheBoard.test.ts` (mutation-tested).

Suggested assertion: source-text pin that `defenderMotion.ts` calls `clampIntoPlayfield(` and that
`defenderLifecycle.ts`'s patrol point goes through `clampPointIntoPlayfield(`.
