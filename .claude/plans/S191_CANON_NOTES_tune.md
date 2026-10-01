# S191 CANON NOTES — `s191/tune` (for the MERGE OWNER to land in `SPARK_CANON.md` + `src/canon.test.ts`)

A worktree may not edit the canon. Each item below is the replacement text plus the assertion that
must change with it. `canon.test.ts` goes RED on this branch BY DESIGN until these land (listed per item).

## ITEM 1 — POWER OF RA / WRATH OF RA: 35 fifths a column, IN TOTAL, split

Owner (S191): *"each column that it does 30 damage it split right so if it hits a tower and an enemy at
the same time then it split amongst those two … it's not like 30 to each thing in the vicinity … we can do
it 35 per hit."*

### §3e row POWER OF RA (canon line ~432) — numbers cell becomes
`RA_COLUMN_COUNT` = **5**, one every `RA_COLUMN_TICKS` = **120** · `RA_PERK_STRIKE_FIFTHS` = **35** a column IN TOTAL, split, over `RA_COLUMN_RADIUS` = **70** px

and the notes cell: *spares the caster (and does not count its things); a STRUCTURE is ONE target (its
share lands on its connector nearest the column centre); a column due after the FIGHT never lands; columns
already called still land if the caster's keep falls*. The "what" cell: drop "shapes AND connectors" →
"enemy creatures, Helga, lone shapes, stink bags and structures — 35 split between them".

### §3e row WRATH OF RA (line ~434)
`WRATH_OF_RA_CHARGES` = **3** a FIGHT, each exactly POWER OF RA's strike (5 columns × **35** fifths, split, over **70** px)

### The paragraph "⛔ POWER OF RA IS THE PHARAOH'S OWN STRIKE, RE-CENTRED" (line ~533) — replace its first sentence with
⛔ **POWER OF RA FALLS LIKE THE PHARAOH'S STRIKE BUT IS NOT HIS NUMBER (S191).** Same pattern
(`raColumnPos`), timing (`raColumnImpactTick`) and radius (`RA_COLUMN_RADIUS` **70** px), five columns two
seconds apart — but a column deals `RA_PERK_STRIKE_FIFTHS` = `attackFifths(RA_PERK_COLUMN_ATK 5,
RA_PERK_COLUMN_PEN 2)` = **35** fifths IN TOTAL, split by `raSplitShares` over everything it catches
(`raColumnTargets`): each enemy creature with pool left, Helga, lone built shape and landed stink bag is one
target, and each enemy STRUCTURE is ONE target whose share lands on its connector nearest the centre.
Share = floor(35 / n); the remainder goes one fifth apiece to the first targets in the total order
(squared distance, then kind structure < creature < defender < shape < bag, then id). ⚠ MINE: n > 35 →
the first 35 get 1, the rest 0; the ATK/PEN pair 5/2 (35 = 7/0 = 5/2 = 1/30); a corpse and a channelling
Pharaoh take no share; a structure whose shapes but no connector midpoints are in the circle is not a
target (shapes inside a structure are not targetable). The Pharaoh BOSS keeps `attackFifths(RA_COLUMN_ATK,
RA_COLUMN_PEN)` = **300** on EVERY victim, unsplit — *"a retune of his ultimate retunes this one"* is no
longer true and must be deleted. Unchanged: spares the caster; once per FIGHT.

⚠ The old text's "cuts CONNECTORS as well" stands (through the structure's one share). The old area arm
that razed every shape inside a structure is GONE — that is what made one column level a tower.
⚠ Previously the column never reached stink bags (no bag arm in `applyRadialDamage`); it does now.

### Numbers (measured in `src/state/racial/powerOfRaSplit.test.ts`)
| case | result |
|---|---|
| one column on a fresh 5-connector hub (pool 50) | banks 35 on ONE connector, stands |
| columns to fell a 5-connector hub, no overkill carry (this branch) | **7** (50: 2 · 36: 2 · 24: 1 · 14: 1 · 6: 1) — measured |
| same, with s191/carry's overkill carry | ceil(130 / 35) = **4** by arithmetic — RE-MEASURE after carry merges |
| hub + creature in one column | 18 to the nearer, 17 to the other |
| a full POWER OF RA cast on one target | ≤ 5 × 35 = 175 (columns spread ≤ 150 px, so not all land on one point) |
| a full WRATH (15 columns) on one target | ≤ 525 |
| vs tier-9 boss pools 260–462, alone in the column | 8–14 columns |

### canon.test.ts assertions to re-pin (RED on this branch by design)
- `canon.test.ts` §3e mummies test (~:713–719): `RA_STRIKE_FIFTHS` → `RA_PERK_STRIKE_FIFTHS`, expect
  `attackFifths(RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN)`; the two `canonSays` strings follow the row/paragraph text above.
- `canon.test.ts` §3e WRATH test (~:814): the `canonSays` string follows the WRATH row above.
- `RA_STRIKE_FIFTHS` survives as a `@deprecated` alias of `RA_PERK_STRIKE_FIFTHS` only so canon.test
  still compiles; delete it once canon.test reads the new name.

## ITEM 2 — the castle no-build radius, halved (121 → 61), porch kept clear

Owner (S191): *"the no build zone near castle is like way too ridiculous. It needs to be halved. Okay,
like the radius where you can't build around the castle."*

SPARK_CANON.md has NO row for the castle keep-out today (grep: no `CASTLE_NO_BUILD_RADIUS`, no 121), and
canon.test.ts pins nothing about it — so nothing goes red. Suggested new §4b (placement) row, if the merge
owner wants it canonised:

| **CASTLE KEEP-OUT** | every castle, every seat | nobody builds within `CASTLE_NO_BUILD_RADIUS` = **61** px of a castle anchor (S182's 121, halved — his), NOR within `CASTLE_PORCH_KEEP_OUT_RADIUS` = **34** px (2 × `CASTLE_PORCH_SLOT_CLEAR_RADIUS`, ⚠ MINE) of any of its 4 porch slots | one rule, `zones.castleKeepOutHitsBox`: point placement (`canBuildAt`) and stamps (`stampRefusalAt` → `CASTLE`), host, client ghost and bots alike. The keep box and the unit-emit ring (46 px) stay inside it; the sprite's roof (67 px) and corners (82 px) do NOT any more |

Assertions to add with it: `CASTLE_NO_BUILD_RADIUS === 61`, `CASTLE_PORCH_KEEP_OUT_RADIUS === 2 * CASTLE_PORCH_SLOT_CLEAR_RADIUS`.

Consumers (all route through `castleKeepOutHitsBox`; none changed): `canBuildAt` → `canBuildNow` →
`placePrimitive`, `placeFromFree` (host); `dragPreview` + `controls.ts` release gate (client);
`botBrain.isLegalBuildPos` (bot loose shapes); `stampRefusalAt` → `blueprintBuild` (host),
`blueprintGhost` + `controls.canStampAt` (client), `botBrain.chooseTowerPlan` + `botController` (bots).
`structureRepair.canReclaimNow` deliberately does not read it. No renderer draws the zone.
⚠ Bots plant towers at `TOWER_SITE_OFFSET` 210 px from their anchor regardless, so the halving does not
move bot tower sites; VOLTKIN's horizontal angles stay refused (210 − 152 = 58 < 61). Bot LOOSE shapes do use
the freed ring (`isLegalBuildPos`, tested).

## ITEM 3 (S192) — APEX PREDATOR ×3 → ×9; THE SWARM decoupled, stays ×6

Owner (S192): *"the Piranha, when it's upgraded … the Nagas get the Piranha upgrade, it should be stronger …
I think it should be times nine."* R190-D unchanged: *"a bat 1/1/1/1 → 6/6/6/6"*.

### §3e row APEX PREDATOR (line ~440)
"what" cell: *every stat ×9 (S192; tripled S188–S191), drawn twice the size*. Numbers cell:
`APEX_PREDATOR_STAT_MUL` = **9** → **27 / 0 / 18 / 9** · `PIRANHA_ELITE_SPRITE_SCALE_MUL` = **2**
(the canon test also needs `pool **15 → 135**` and `**12 → 252**` somewhere in the text.)

### §3e row THE SWARM (line ~429) — numbers unchanged (`THE_SWARM_STAT_MUL` = **6** → 12 / 0 / 12 / 6 · pool 10 → 60 · bite 12 → 132).
Wording only: it is no longer "double the piranha's"; it is R190-D's ×6, a literal.

### Paragraph "⚠ APEX PREDATOR: "×3 EVERY STAT" IS ×3 HEALTH BUT ×4 BITE" (line ~571) — replace with
⚠ **APEX PREDATOR: "×9 EVERY STAT" IS ×9 HEALTH BUT ×21 BITE — HIS NUMBER (S192), THE LADDER'S ARITHMETIC
(R190-D).** The ladder multiplies ATK by (5 + PEN), and both are ×9: pool **15 → 135**, bite **12 → 252**
(18 × (5 + 9) against the piranha's 2 × (5 + 1)). One elite bite is more than a whole 5-connector tower,
every level of it (130). Its HP 27 and ATK 18 sit OFF the 1..12 point ladder by his ruling; `statsLadder.test`
gives the elite its own lane, pinned to exactly piranha × `APEX_PREDATOR_STAT_MUL`. "From now on" is still
decided at the EMIT (`towerUnitForSeat`). (S188–S191 it was ×3: 45 / 48.)

### THE SWARM paragraph (line ~576) — add one sentence
⛔ Since S192 `THE_SWARM_STAT_MUL` is a LITERAL 6, decoupled from `APEX_PREDATOR_STAT_MUL`: left as
`2 × APEX` the owner's ×9 piranha would have silently made the swarm ×18.

### canon.test.ts assertions to re-pin (RED on this branch by design)
- §3e nagas test (~:793): title "×9 health but ×21 bite"; the three `canonSays` strings follow the text above
  (they derive from the constants, so only the canon TEXT must change).
- §3e THE SWARM test (~:824): `expect(THE_SWARM_STAT_MUL).toBe(2 * APEX_PREDATOR_STAT_MUL)` → `toBe(6)` and
  `not.toBe(2 * APEX_PREDATOR_STAT_MUL)` (as `theSwarm.test.ts` now does).

### Player-facing copy changed
`racialPerks.ts` `nagas.l5.detail`: "three times the stats" → "nine times the stats". ⚠ The `l5-nagas` CARD ART
(`public/art/upgrade-cards/l5-nagas.webp`) was inspected: title and art only, no printed multiplier — nothing to regenerate.

## §6 — PROTOCOL BUMP DOCBLOCK (for the merge owner to paste above `PROTOCOL_VERSION` in `src/net/protocol.ts`)

The number (52 → N) is the merge owner's: if another S192 branch bumps in the same deploy, merge the
reason lists under ONE bump (S182 lesson 6). No wire field, no hashed field and no serialized
discriminant changed on this branch — every reason is a SHARED RULE (the S186 test: two builds that shake
hands would disagree about something either computes, on the host or on a successor after migration).

```ts
/**
 * ⭐⭐ S192 — **BUMPED 52 -> 53: `s191/tune` — three owner retunes, all shared rules, no wire change.**
 * Each item earns it alone (the S186 test — a v52 and a v53 build that shook hands would compute
 * different worlds from the same intents; `.claude/plans/S191_CANON_NOTES_tune.md`):
 *   1. POWER OF RA / WRATH OF RA (S191, owner: "we can do it 35 per hit") — a perk column deals
 *      `RA_PERK_STRIKE_FIFTHS` 35 IN TOTAL, split by `raSplitShares` over `raColumnTargets` (a structure is
 *      ONE target; stink bags are now reached; shapes inside a structure are no longer razed). A v52 host
 *      or successor lands 300 on every connector and razes the shapes — towers that stand on v53 fall.
 *      The Pharaoh BOSS ritual is unchanged (300, unsplit).
 *   2. THE CASTLE KEEP-OUT (S191, owner: "It needs to be halved") — `CASTLE_NO_BUILD_RADIUS` 121 -> 61 plus
 *      a `CASTLE_PORCH_KEEP_OUT_RADIUS` 34 disc per porch slot. Placement is a hashed REDUCER: a v52 host
 *      refuses a placement in the 61..121 ring that a v53 client's ghost shows as legal (and vice versa
 *      around the porch) — a divergence, not a cosmetic disagreement.
 *   3. APEX PREDATOR (S192, owner: "I think it should be times nine") — `APEX_PREDATOR_STAT_MUL` 3 -> 9
 *      (elite piranha 27 / 0 / 18 / 9: pool 135, bite 252). `THE_SWARM_STAT_MUL` DECOUPLED to a literal 6
 *      (R190-D), numerically unchanged. A v52 sim emits a 45-pool elite with a 48 bite.
 */
```
