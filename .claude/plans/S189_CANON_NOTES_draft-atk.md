# S189/S190 · CANON NOTES from `s188/draft-atk` — for the canon agent / merge owner

This branch may not edit `SPARK_CANON.md` or `src/canon.test.ts`. These are the canon changes the
merged tree needs. Every number below was measured by a test on this branch, and each names the test
that pins it.

## 1 · ⛔ `src/canon.test.ts:339-344` goes RED on this branch — ONE-LINE FIX, the property still holds

`it('keeps the castle on the ladder — no second damage scale may come back')` asserts that the 400
chars after `kind: 'castle'` in `creatureAttack.ts` contain the literal `attackFifths(`. The castle arm
now strikes for `hellspawnStrikeFifths(creature, creatureAttackFifths(creature))`, i.e. the SAME ladder
number, read off the creature (drafted-buffed) instead of re-derived from the type. `creatureAttackFifths(`
does not contain the lowercase substring, so the pin fails while the property it protects holds:
`creatures/draftStrikeArms.test.ts` "creature → CASTLE" lands the creature's own ladder strike through
castle DEF, and `GOBLIN_DAMAGE_VS_CASTLE` is still absent.

Suggested fix (line 342):

```ts
expect(castleArm.slice(0, 400)).toMatch(/[aA]ttackFifths\(/); // S190: creatureAttackFifths(creature)
```

Not done here: the brief forbids this file, and the branch did not game the pin with a comment.

## 2 · §3d THE UPGRADE DRAFT — the STRIKE half now exists (it was a blank card)

Add beside the "the buff" row:

| | |
|---|---|
| where the buff lives | **born into the creature**: pool → `Creature.maxEhp` (S187), strike → `Creature.atkFifths` (S190), each stored ONLY when a pick moved it. Read through `creatureMaxEhp` / `creatureAttackFifths`, never re-derived from the type |
| ATK vs PEN | the ladder has two derived numbers, so an ATK pick and a PEN pick move the SAME strike (as HP and DEF move the same pool) |
| "units on the board keep what they were born with" | true for the strike too: a unit born before the ATK pick keeps its 6 (`draftAtkReaches.test.ts`, through the real host tick) |

Worked strikes (one damage pick → two), all `applyDraftPercent(attackFifths(atk, pen), n, 10)`:

| unit | type | 1 pick | 2 picks | pinned by |
|---|---|---|---|---|
| race unit (1/1) | 6 | 7 | 8 | `draftAtkReaches.test.ts` FACTORY + REACH |
| melee goblin (2/1) | 12 | 13 | — | `draftStrikeArms.test.ts` |
| Voltkin (3/6) | 33 | 36 | — | `draftStrikeArms.test.ts` (chain link 1: 16 → 18) |
| suicide goblin (4/0) | 20 | 22 | — | `draftStrikeArms.test.ts` (units, shapes AND connectors) |
| lightning drone (5/1) | 30 | 33 | — | `draftStrikeArms.test.ts` |
| tier-9 boss (10/10) | 150 | 165 | — | `netWireSize.draftAtk.test.ts` |

⛔ The pre-S190 truth, worth one line in the canon's history: from S187 until S190 the wave-11
STRONGER and wave-16 PIERCING cards (*"Every unit you spawn from now on hits 10% harder"*) did
NOTHING — `draftedAttackFifths` had no production consumer.

## 3 · §3 THE CASTLE — row "Damage an attacker deals to it"

"**its own `attackFifths(atk, pen)`**" → "**its own strike — `creatureAttackFifths(creature)`, the
ladder number, drafted-buffed when its seat drafted ATK/PEN** — through the keep's DEF as before".

## 4 · HELLSPAWN (`demons.l5`)

A split chewer's strike is a share of its **PARENT's** baked strike, stamped on the child like its pool,
never the seat's current picks (triage DA-3). Unbuffed 7 → 3 → 1 (unchanged); born after one damage
pick 8 → 4 → 2. A parent born before the pick still splits into 3s after it. `draftAtkReaches.test.ts`.

## 5 · CORPSE EATER (`zombies.l5`) and lifesteal

- CORPSE EATER heals 100 % of the bite, and the bite is **his own** strike (drafted-buffed), not "the
  config strike" (triage DA-9; the code docblock is already corrected in `corpseEater.ts`).
- BLOOD DEBT / CRIMSON TIDE heal a share of the swing `damageEntity` was handed, so they follow the
  buffed strike with no change of their own: CRIMSON TIDE on a race unit with two damage picks heals
  4 (type: 3). `draftStrikeArms.test.ts`.

## 6 · The card and the kill number

The creature card's derived strings are the creature's: "N a swing" = the strike it lands (HELLSPAWN
share included), "N pool" = `creatureMaxEhp`. Owner's report fixed: a generation-1 HELLSPAWN card read
"7 a swing / 5 pool"; it now reads "3 a swing / 2 pool". `fatalBlowFifths` credits the same number.
⚠ The HP row had been wrong for every HP/DEF-drafted unit since S187 (bar 8, row "6 pool").

## 7 · Wire (§6) and protocol — for the merge owner's train-D docblock

- `Creature.atkFifths?` — additive-optional, SERIALIZED (save + wire, not stripped by
  `trimMirrorCreature`) and HASHED (`:ak` in the wide oracle). Validated on the way in: a positive
  integer or dropped.
- ⛔ OWES A BUMP (train D, one bump): a pre-fix peer that wins a host migration drops the field on
  restore and strikes UNBUFFED from then on; a pre-fix client prints the type's strike on the card and
  the kill floater — two builds that shake hands would disagree about a number both compute (the S186
  test). Same reason `maxEhp` paid part of 48 → 49.
- Wire cost (`netWireSize.draftAtk.test.ts`, pinned): +14 chars per drafted race unit, +16 per boss,
  beside `maxEhp`'s 11. 120 drafted creatures ≈ +1.6 KiB per snapshot ≈ 2 % of the S182 84.0 KiB table.

## 8 · Open owner questions (NOT built — creature strikes only, per the brief)

- Q1 — does an ATK/PEN pick buff a boss SKILL with its own stat line (the Pharaoh's Ra column,
  `bossSkillsPharaohRitual.ts`, `attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)` = 300)?
- Q2 — does it buff HELGA (a defender)? Neither half of the draft reaches defenders today.
