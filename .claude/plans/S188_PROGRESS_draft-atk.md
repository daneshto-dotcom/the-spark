# S188 · `s188/draft-atk` — PROGRESS (running file, updated with every wip commit)

Brief: the merge owner's dispatch (draft ATK/PEN picks do nothing; HELLSPAWN card shows 7/5 while
the sim deals 3 and holds 2). Base: `2703365` (master with all six S188 racial branches merged).

## Plan

| step | what | status |
|---|---|---|
| 1 | `Creature.atkFifths?` baked at birth in `makeCreature` (only when it differs) + `creatureAttackFifths(c)` accessor | pending |
| 2 | four sites: serialize/deserialize (validated), `CreatureHashed` + `:ak` projection + contribution test, worker mirror | pending |
| 3 | every creature strike site reads the accessor (creatureAttack x6, voltkin chain, suicide blast, drone blast, CORPSE EATER fallback) | pending |
| 4 | HELLSPAWN child inherits the PARENT's baked strike (its pool already inherits the parent's) | pending |
| 5 | character card ATK/HP derived strings read the creature; `fatalBlowFifths` creature arm too | pending |
| 6 | tests: arithmetic, reach through host tick, born-before-pick, round-trip + worker, card, lifesteal, mechanical guard + mutation | pending |
| 7 | gates: typecheck / vitest / build | pending |

## Decisions (all MINE unless quoted)
- (filled in as they are made)

## Known broken / not yet done
- (none yet)
