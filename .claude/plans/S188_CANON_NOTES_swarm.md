# S188 — canon text owed by `s188/swarm` (THE SWARM, vampires level 10)

For the merge owner to land in `SPARK_CANON.md` §3d (THE SWARM leaves "WHAT IS SPECIFIED BUT NOT BUILT";
§3d's "levels 10–20 have 16 racial slots still undesigned, only vampires L10 exists" becomes "…vampires L10
is BUILT"), each number with its `canon.test.ts` assertion in the same commit.

## THE SWARM — vampires level 10 (`src/state/racial/theSwarm.ts`, rule in `racial/apexPredator.ts`)

> *"it upgrades the regular tier three bat tower at level 10, if we choose it, to become bat swarm, to
> generate and create bat swarms … this will be the level 10 vampire racial upgrade."* and *"whatever
> we did for the piranha … this has to be double that … Whatever we did for the piranha, we double
> that."* — owner, S187

| | value | constant | whose |
|---|---|---|---|
| offered | the **wave-11** draft (draft index 2 = level 10), **vampires only**; every other race is COMING SOON at level 10 | `RACIAL_PERKS_BY_RACE.vampires[2] === 'vampires.l10'` | his |
| stat multiplier | **×6** on HP, DEF, ATK, PEN = 2 × the piranha's ×3 | `THE_SWARM_STAT_MUL = 2 * APEX_PREDATOR_STAT_MUL` | his ("double that") |
| swarm stat line | **12 / 0 / 12 / 6** (bat 2 / 0 / 2 / 1), speed unchanged (1.2) | `T3_BAT_SWARM_STATS` (derived) | his ×6; speed MINE |
| on the ladder | pool **60** (bat 10, ×6) · bite **132** (bat 12, **×11** — PEN is ×6 too) | `unitPoolFifths` / `attackFifths` | arithmetic |
| draw size | **2×** the bat | `BAT_SWARM_SPRITE_SCALE_MUL = 2` | ⚠ MINE (unruled) |

⚠ **Say this to him**: "every stat ×6" is ×6 on the pool (DEF 0) but **×11 on the bite**, because the ladder
multiplies ATK by (5 + PEN) and both are ×6. One swarm bite (132) is more than a whole 5-connector tower
level (130). His literal words, shipped as such (*"don't argue if it's too OP"*).

"From now on": decided at the EMIT (both tower emit sites ask `towerUnitForSeat`), so bats already alive
stay bats. A vampire seat that takes the GENERAL at wave 11 keeps its bats.

Suggested assertions: `THE_SWARM_STAT_MUL === 6`, `getCreatureConfig('t3BatSwarm').hp === 6 *
getCreatureConfig('t3Bat').hp` (and def/atk/pen), `unitPoolFifths(12, 0) === 60`, `attackFifths(12, 6) ===
132`, `BAT_SWARM_SPRITE_SCALE_MUL === 2`, `racialPerkFor('vampires', 2) === 'vampires.l10'`,
`racialPerkFor(<every other race>, 2) === null`.

## Registry change (substrate file, `racialPerks.ts`)

- `RacialPerkId` + `RACIAL_PERK_IDS` gain `'vampires.l10'` (13 perks); the vampire row is `[l0, l5, l10]`.
- `perkDraftIndex` is now DERIVED from the level in the id (`level / LEVELS_PER_DRAFT`, 5 = `DRAFT_WAVE_INTERVAL`).
  ⛔ The old body (`endsWith('.l0') ? 0 : 1`) would have made THE SWARM a second level-5 perk — held by
  every vampire seat that took CRIMSON TIDE. Mutation-tested.
- `RACIAL_PERK_BUILT` gains its own `// ── s188/swarm ──` block: `'vampires.l10': true`.
- `RACIAL_PERK_COPY['vampires.l10']` = THE SWARM / BAT SWARMS / card `l10-vampires`.

## For the PROTOCOL 50 docblock (the merge owner writes it)

- New `CreatureType` **`'t3BatSwarm'`** — serialized (`deserializeCreature` writes `type` with no whitelist),
  so a stale peer would accept it and find no config: covered by the substrate's 49 → 50 (the
  `t3PiranhaElite` shape exactly).
- No new field, no new intent, no new `GameEffect`, no new discriminant on an existing action. The
  `'racial'` pick at draft index 2 is the existing literal at a new index — no wire change.

## Art (for §7 / the art notes)

- `public/art/race-tier3-units/t3-vampires-bat-swarm-*` — packed from `sheet-fly` (idle/walk), `sheet-attack`
  (×0.8, it was generated at a larger zoom), `sheet-die-v2` (grid inpainted). `sheet-die-v1` rejected (0 %
  alpha); `sheet-fly-matted` rejected (white pockets: largest 137 px, 6,417 px on the edge).
  Spec: `assets-source/race-tier3-units/bat-swarm/atlas-spec.json`.
- `public/art/upgrade-cards/l10-vampires.webp` — the THE SWARM card.
