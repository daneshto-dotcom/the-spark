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
| P2.4 | step 4: `hellspawn.ts` captures `victim.atkFifths` at death and stamps each child (set, or DELETED when the parent had none) after the spawn reducer baked the seat's current picks (DA-3). Tests in `draftAtkReaches.test.ts`: born BEFORE the ATK pick → children carry no field, bank ⌊7/2⌋ = 3 on a connector (was 4 — observed RED before the fix, 8 ≠ undefined); born AFTER → 8 → children 4, grandchildren 2; a buffed parent whose seat drafted AGAIN still passes on its own 8 (was 9 — RED before); a unit born before the pick still strikes 6 through the real host tick. `hellspawn.test.ts` + `racialB.differential.test.ts` green | ✅ done |
| P2.5 | step 5: `statRowsFor` gains an optional `own: { poolFifths, strikeFifths }` (omitted = derive from points, so defender/other callers are unchanged and both guards' counts hold — pool guard still 4, strike guard still 2 in `characterSheetModel.ts`); the CREATURE card passes `creatureMaxEhp(c)` and `hellspawnStrikeFifths(c, creatureAttackFifths(c))` (DA-6). `fatalBlowFifths` creature arm → the same expression (DA-7); strike guard `damageNumbers.ts` 2 → 1. Card tests now GREEN (drafted 7 / 8; HELLSPAWN gen-1 3 / 2 — the owner's report); NEW kill-number test: drafted goblin 13, undrafted 12, HELLSPAWN child 3 (was 7). 11 card/render/guard suites, 123 green | ✅ done |
| P2.6 | `draftStrikeArms.test.ts`: lifesteal (CRIMSON TIDE 50 %) heals off the BUFFED swing — drafted 8 → 4, type 6 → 3; CORPSE EATER bite = his own drafted strike, heal = bite (drafted > plain). NEW sibling `netWireSize.draftAtk.test.ts` (DA-10; a sibling so the `s189/net` branch's `netWireSize.test.ts` stays untouched) PINS the wire cost per creature: race unit `,"atkFifths":8` = **+14 chars** (beside S187's `maxEhp` 11), a boss's 3-digit value **+16**; an undrafted / pool-only board carries none. For C5: 120 drafted creatures ≈ +1680 chars ≈ +1.6 KiB per snapshot ≈ 2 % of the S182 84.0 KiB baseline | ✅ done |
| P2.7 | gates at `aaf0a98`: typecheck **0**; `npx vitest run --maxWorkers=6` **1** — 6030 / 6031, the ONE red is `src/canon.test.ts:342` (a source-text pin on the literal `attackFifths(` in the castle arm — see Known broken); build **0** (944.7 KiB entry, cap 1100, headroom 155.3); bundle delta vs master's prod files **+499 B (+0.5 KiB)**. Canon notes: `.claude/plans/S189_CANON_NOTES_draft-atk.md` | ✅ done (gates run; one red handed to the merge owner) |

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

### Known broken / handed to the merge owner
- ⛔ `src/canon.test.ts:339-344` "keeps the castle on the ladder" is RED: it pins the literal
  `attackFifths(` within 400 chars of `kind: 'castle'` in `creatureAttack.ts`; the arm now reads
  `creatureAttackFifths(creature)` (same ladder number, off the creature). The PROPERTY holds
  (`draftStrikeArms.test.ts` "creature → CASTLE"; no `GOBLIN_DAMAGE_VS_CASTLE`). This branch may not
  edit that file and did not game the pin with a comment. One-line fix in the canon notes §1:
  `toMatch(/[aA]ttackFifths\(/)`.

### Failed commands, each with its verdict
- phase 1 `grep` on `.gitignore` aborted (signal) — benign: the same file read fine with `cat` at once.
- P2.3 `ls .tmp-probe` exit 2 — benign: the directory had just been `git rm`'d, as intended.
- P2.7 vitest rewrote `pentagramBuildability.test.ts.snap` — benign: EOL-only (LF), the normalised
  diff was EMPTY; restored with `git checkout`.
- P2.7 baseline `npm run build` on master's prod files exit 1 — benign: `tsc -b` typechecks THIS
  branch's new tests against master's files (missing exports); the size baseline used `vite build` +
  `check-bundle-size.mjs` alone (exit 0). The tree was restored and verified equal to HEAD.
- Every red test during P2.2–P2.6 was a fixture error of mine, found and fixed (a lone shape is
  clamped to `LONE_PRIMITIVE_POOL_FIFTHS`; a null-spawner race unit hits the one-live latch; a boss
  on a spawner hits the goblin cap; a drafted 8 one-shots a 6-pool victim so it VANISHES; the seat's
  `draftPicks` list rides the wire too) — never a production defect.

### Decisions / numbers that are MINE
- No new game constant. Every strike number is `applyDraftPercent(attackFifths(atk, pen), n, 10)` —
  the owner's 10 % and his floor-at-one.
- ⚠ MINE: a HELLSPAWN child's gen-0 strike is its PARENT's baked strike (the pool already was), not
  the seat's picks at the child's birth — the triage's DA-3 reading of "half the stats of the main one".
- ⚠ MINE: `statRowsFor`'s new argument is optional and positional (after `kinetics`), so the defender
  sheet and every other caller are byte-identical.
- ⚠ MINE: the DA-10 measurement lives in a SIBLING test file so `s189/net` keeps `netWireSize.test.ts`.

### Files this branch changed vs master (for the merge)
- prod: `creature.ts` (salvage + 2 docblocks), `save.ts` + `stateHashFull.ts` (salvage hotspot hunks
  above), `creatureAttack.ts`, `voltkinChain.ts`, `suicideBlast.ts`, `droneLifecycle.ts`,
  `racial/corpseEater.ts`, `racial/hellspawn.ts`, `render/characterSheetModel.ts`,
  `render/damageNumbers.ts`.
- tests (new): `draftAtkReaches.test.ts`, `draftAtk.differential.test.ts`,
  `creatures/draftStrikeArms.test.ts`, `creatureStrike.guard.test.ts`, `netWireSize.draftAtk.test.ts`.
- removed: `.tmp-probe/cfg.ts`.
