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

---

## S190 — resumed by the `s188-draft-atk` agent (PDR §5.6, train D, merges AFTER `s189/units`)

Phase 1 (read-only) confirmed the bug on master's code and wrote the failing reach test
`src/state/draftAtkReaches.test.ts` (3 red / 2 green on master: a drafted race unit lands 6 not 7;
the card prints the TYPE's pool/strike; the HELLSPAWN gen-1 card prints 7 / 5 against a sim 3 / 2).
The independent triage agreed: FINISH THE SALVAGE (it compiles, breaks nothing, merges clean).

### S190 plan

| step | what | status |
|---|---|---|
| P2.0 | `git merge master` (d05b358) — clean, no conflicts; typecheck 0; reach test still 3 red | ✅ done (`c935cf8`) |
| P2.1 | salvage fix-ups: the "no bump" docblock (DA-2), docblocks citing non-existent tests (DA-4), `git rm .tmp-probe/` (DA-8) | pending |
| P2.2 | step 2 tests: hash contribution, save + wire round-trip, bogus values dropped, undrafted byte-identical, host-vs-worker | pending |
| P2.3 | step 3: every creature strike reads `creatureAttackFifths` — creatureAttack ×6, voltkin chain, suicide ×2 (DA-5), drone, CORPSE EATER fallback + docblock (DA-9); reach tests + mechanical guard + mutation | pending |
| P2.4 | step 4: HELLSPAWN child stamped from the PARENT's strike, never the seat's current picks (DA-3) | pending |
| P2.5 | step 5: card pool/strike rows + `fatalBlowFifths` creature arm (DA-6/DA-7) | pending |
| P2.6 | remaining tests: lifesteal off the buffed swing, CORPSE EATER heal, wire bytes/creature with and without `atkFifths` (DA-10) | pending |
| P2.7 | gates (typecheck / vitest / build + bundle delta), canon notes, final report | pending |

### Open owner questions (NOT built — creature strikes only, per the brief)
- Q1 — does a drafted ATK/PEN pick buff a boss SKILL that has its own stat line (the Pharaoh's Ra
  column, `bossSkillsPharaohRitual.ts:149-150`, `attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)`)?
- Q2 — does it buff HELGA (a defender, `defenderLifecycle.ts:479`)? The S187 POOL half does not reach
  defenders either, so today neither half does.

### Hotspot hunks (Council G1/M4 — self-contained blocks only)
- `src/state/save.ts` — salvage: `SerializedCreature.atkFifths?` field; `serializeCreature` one spread
  line; `deserializeCreature` validated spread block.
- `src/state/stateHashFull.ts` — salvage: `CreatureHashed` member `'atkFifths'`; `:ak${o(c.atkFifths)}`
  projection token.
- `worldTypes.ts`, `main.ts` — untouched.

### `makeCreature` hunk (for the `s189/units` merge — train D order)
- salvage: `baseAtk` / `atk` computed just before the returned object literal, and ONE spread line
  `...(atk !== baseAtk ? { atkFifths: atk } : {})` after the `maxEhp` spread. Nothing else in the factory.

### Wire / hash / protocol
- `Creature.atkFifths?` is additive-optional on the save AND the wire, emitted only when a drafted
  ATK/PEN pick moved it; HASHED in the wide oracle. ⛔ It OWES a protocol bump (a pre-fix peer that
  becomes host drops it; its card and floaters disagree) — the merge owner takes ONE bump for train D.
  This branch does not touch `PROTOCOL_VERSION`.

### Decisions / numbers that are MINE
- (filled in as they are made)
