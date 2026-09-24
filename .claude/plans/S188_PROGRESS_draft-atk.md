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
| P2.0 | `git merge master` (d05b358) — clean, no conflicts; typecheck 0; reach test still 3 red | ✅ done (`5391d0e`; the progress file was amended into the merge — `c935cf8` was its pre-amend SHA) |
| P2.1 | salvage fix-ups: the "no bump" docblock → "owes a bump, merge owner takes it" (DA-2); the contribution test is named as `draftAtkReaches.test.ts`, and `creatureStrike.guard.test.ts` is KEPT because P2.3 writes that exact file (DA-4); the HELLSPAWN field docblock no longer says damage is rebuilt from the type; `git rm .tmp-probe/cfg.ts` (DA-8); the phase-1 reach test is committed (RED BY DESIGN until P2.3/P2.5 — 3 red / 2 green) | ✅ done |
| P2.2 | step 2 tests: `draftAtkReaches.test.ts` "FOUR SITES" block (factory bake incl. pool-only = no field and PEN == ATK; hash contribution — present / other value / absent all differ; save and wire round-trips; bogus 0 / −7 / 2.5 / "7" / null / NaN dropped on BOTH paths; undrafted + pool-only board has no `atkFifths` anywhere in save or wire) + NEW `draftAtk.differential.test.ts` (host vs `?worker=1`, byte-identical every frame on json + narrow + wide hash; anti-vacuity: baked creatures crossed the INIT, a real castle emission was baked on both sims after it, the undrafted seat took hits) — all 7 green | ✅ done |
| P2.3 | step 3: every creature strike reads `creatureAttackFifths` — `creatureAttack.ts` ×6 (`hellspawnStrikeFifths(creature, creatureAttackFifths(creature))`), `voltkinChain.ts` baseHit, `suicideBlast.ts` BOTH derivations → one per-bomber read (DA-5; module const + `GOBLIN_SUICIDE_ATK/PEN` imports retired), `droneLifecycle.ts` (module const + `DRONE_ATK/PEN` imports retired; its connector arm severs by COUNT, untouched), `corpseEater.ts` fallback + docblock (DA-9). NEW `creatures/draftStrikeArms.test.ts` — the ledger: creature / Helga / shape / landed bag / castle (after castle DEF) / connector / Voltkin chain link / suicide (units, shapes, connectors) / drone, drafted AND undrafted, exact numbers (10 green). NEW `creatureStrike.guard.test.ts` — mechanical count of every code `attackFifths(` in the whole src tree, 14 sanctioned files with reasons; the six arms counted exactly; the retired blast constants may not return. ⭐ MUTATION: the shape arm reverted to the TYPE's strike (`creatureAttackFifths({ type })` — type-correct, so tsc cannot see it) → guard + SHAPE ledger RED; restored → GREEN. 35 neighbouring suites: 399 pass, only the 2 by-design card reds (P2.5) | ✅ done |
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
