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
