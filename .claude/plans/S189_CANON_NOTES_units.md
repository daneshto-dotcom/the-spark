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

## C10 — THE KRAKEN'S SONAR PUSHES 70 PX AND STUNS 2 S (suggested for the boss-skills section)

> *"the Kraken sonar sends units flying … outside the map … knock them back a little bit … and stun
> them"* — owner, S189

| | value | constant | whose |
|---|---|---|---|
| knockback | **70 px of slide** (2 × the 35 px melee arm) | `KRAKEN_SONAR_KNOCKBACK_PX` (`state/bossSkillsKraken.ts`) | ⚠ MINE |
| impulse | ≈ 0.1644 px/substep, derived so the stunned coast covers exactly 70 px | `KRAKEN_SONAR_SHOVE_PER_SUBSTEP` | derived |
| stun | 2 s | `KRAKEN_SONAR_STUN_TICKS` | ⚠ MINE (S169) |
| board | held by the creature clamp, [40,1880] × [40,1040] | `clampIntoPlayfield` | — |

⛔ `KRAKEN_SONAR_KNOCKBACK = 26` is DELETED: it was a per-substep velocity (~11,000 px of travel),
not the "body-length and a half" its docblock claimed. ⚠ `BOSS_STATS_TABLE.md:57` still says 26 px.

Suggested assertions: `KRAKEN_SONAR_KNOCKBACK_PX === 2 * GOBLIN_ATTACK_RANGE` and `=== 70`;
`KRAKEN_SONAR_STUN_TICKS === 120`.

## LOW (b) — CASTLE REGEN IS A PERCENT OF THE SEAT'S UPGRADED MAX — ⭐ OWNER RULING R190-C

> *"your regen is based on the current health … upgraded total."* — owner, S189/S190 (relayed by the
> merge owner as ruling **R190-C**)

⭐ **HIS RULING, NOT MINE.** Castle regen is a percent of the UPGRADED total — `CASTLE_MAX_HP + hpBonus`
(`castleMaxHpFor`) — for the RATE as well as the ceiling (`castleRegenPerSecond(level, maxHp)`).
R128 gave the percentages (1.0 … 1.8 % of max per level); R190-C settles that "max" is the
upgraded pool. So buying castle HP also buys regen, by his ruling: one wave-1 HP point (2,750) at
level 1 is **28 HP/s** (was 25); at level 5, **50** (was 45). The un-upgraded ladder is unchanged:
**25/30/35/40/45**. Integer arithmetic (tenths of a percent, one half-up division).

⚠ Stale text for the merge owner to update (not edited here — "no other change" to this branch):
the docblock above `castleRegenPerSecond` in `src/state/castleRegen.ts` still calls this *"a balance
consequence nobody asked for out loud"*; it should cite R190-C.

Suggested assertions: `castleRegenPerSecond(1, 2750) === 28`, `castleRegenPerSecond(5, 2750) === 50`,
and the existing 25/30/35/40/45 line unchanged.

## LOW (d) — THE RACIAL SPAWN QUEUE IS EMPTY WHEREVER A SAVE CAN LAND (suggested for the racials section)

S188's queue (Council A5) is born after the strike batch's sweep, as ruled. ⛔ It was NOT empty at
every save: a RAID applied between ticks (or a bot acting after the post-sweep drain) left HELLSPAWN's
split queued, and a save in the gap lost it. Since S189 a top-level `dispatch` outside `runHostTick`
drains the queue on exit, and `runHostTick` ends with a final drain — in-batch ordering unchanged.
Pinned by `spawnQueueBoundary.test.ts` (mutation-tested). No constant; no wire change.
