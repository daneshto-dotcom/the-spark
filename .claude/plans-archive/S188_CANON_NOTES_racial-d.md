# S188 — canon text owed by `s188/racial-d` (CORPSE EATER, APEX PREDATOR)

For the merge owner to land in `SPARK_CANON.md` §3d (replacing the two entries in "WHAT IS SPECIFIED
BUT NOT BUILT"), each with its `canon.test.ts` assertion in the same commit. Every number below names
its constant; the suggested assertion is the line to pin.

## CORPSE EATER — zombies level 5 (`src/state/racial/corpseEater.ts`)

> *"once he reaches 20% HP, he starts eating everyone around him … the same damage as he would by
> attacking, but he has 100% life steal … for like eight seconds … he moves only in a tiny radius …
> enemy units first, obviously. But then if there's no enemy units, he eats his own units and heals."*

| | value | constant | whose |
|---|---|---|---|
| trigger | ≤ **20 %** of his OWN max pool | `CORPSE_EATER_TRIGGER_PCT = 20` | his |
| window | **480 ticks** (8 s) | `CORPSE_EATER_TICKS = 8 * PHYSICS_HZ` | his |
| life steal | **100 %** of the fifths the bite actually removed, capped at his max | `CORPSE_EATER_HEAL_PCT = 100` | his |
| leash | **60 px** around where he sat down | `CORPSE_EATER_LEASH_RADIUS = 60` | ⚠ MINE |
| bite | his ordinary strike: `attackFifths(atk, pen)` through `CREATURE_ATTACK`, his normal cadence | — | his ("same damage as he would by attacking") |

Rules, all MINE unless quoted: once per boss LIFE (the stamp is never cleared); "around him" = within
leash + his attack range of the anchor; "his own units" = every creature his seat owns except a
tier-9 boss; enemy always outranks own; a stun blocks the trigger, the bite, the steering and the
leash (R152) but the window keeps running; the perk is read at the trigger, so a boss already on the
board when the pick is taken gains the skill (a SKILL, not a birth stat).

Suggested assertions: `CORPSE_EATER_TRIGGER_PCT === 20`, `CORPSE_EATER_TICKS === 480`,
`CORPSE_EATER_HEAL_PCT === 100`, `CORPSE_EATER_LEASH_RADIUS === 60`.

## APEX PREDATOR — nagas level 5 (`src/state/racial/apexPredator.ts`)

> *"upgrade the tier three piranha into a big one ... all the stats you take and you just triple them"*
> and *"two times bigger than the current piranha"*.

| | value | constant | whose |
|---|---|---|---|
| stat multiplier | **×3** on HP, DEF, ATK, PEN | `APEX_PREDATOR_STAT_MUL = 3` | his |
| elite stat line | **9 / 0 / 6 / 3** (piranha 3 / 0 / 2 / 1), speed unchanged (1.05) | `T3_PIRANHA_ELITE_STATS` (derived) | his ×3; speed MINE |
| on the ladder | pool **45** (piranha 15, ×3) · bite **48** (piranha 12, ×4 — PEN is tripled too) | `unitPoolFifths` / `attackFifths` | arithmetic |
| draw size | **2×** the piranha | `PIRANHA_ELITE_SPRITE_SCALE_MUL = 2` | his |

⚠ **Say this to him**: "all stats ×3" is ×3 on the pool (DEF is 0) but **×4 on the bite**, because the
ladder multiplies ATK by (5 + PEN) and both are tripled. It is his literal words, shipped as such.

"From now on": decided at the EMIT, so piranhas already alive are untouched. Both of the tower's emit
sites (the free 15 s trickle and FEED_TOWER) ask `towerUnitForSeat`.

Suggested assertions: `APEX_PREDATOR_STAT_MUL === 3`, `getCreatureConfig('t3PiranhaElite').hp ===
3 * getCreatureConfig('t3Piranha').hp` (and def/atk/pen), `PIRANHA_ELITE_SPRITE_SCALE_MUL === 2`.

## For the PROTOCOL 50 docblock (the merge owner writes it)

- New `CreatureType` **`'t3PiranhaElite'`** — serialized (`deserializeCreature` writes `type` with no
  whitelist), so a stale peer would find no config: covered by the substrate's 49 → 50.
- New additive-optional `Creature` fields **`corpseEaterUntilTick?: number`** and
  **`corpseEaterAnchor?: Vec2`** — emitted only once stamped, on the save AND the wire (not stripped by
  `trimMirrorCreature`), HASHED in `stateHashFull` (`:ce<until>@<x>,<y>`).
- No new intent, no new `GameEffect`, no new discriminant on an existing action.

## Art (for §7 / the art notes)

- `public/art/race-tier3-units/t3-nagas-piranha-elite-*` — packed from the owner's three sheets.
- `public/art/race-tier9-bosses/t9boss-zombies-feed-*` — a SEPARATE sheet (feedIn / feedLoop /
  feedOut), not extra rows in `t9boss-zombies` as PROMPTS.md proposed: the shipped sheet stays
  byte-identical and the size match is FITTED (standing frames → the shipped idle body, 261/320; the
  ground on his shipped feet row, 312). The eat loop is the TILE_AND_REROLL §3 ping-pong.
- New intake `scripts/build-scattered-sheet-atlas.mjs` (+ `atlas-spec.json` beside each source).
