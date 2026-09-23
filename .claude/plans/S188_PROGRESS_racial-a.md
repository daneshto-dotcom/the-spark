# S188 · `s188/racial-a` — PROGRESS (salvage file; updated with every commit)

Branch `s188/racial-a`, base 87f3dc4. Nothing pushed. `RACIAL_PERK_BUILT` flipped only when a
mechanic's tests pass.

| mechanic | perk | status | files |
|---|---|---|---|
| BLOOD DEBT (lifesteal 20 %) | vampires.l0 | ✅ DONE (BUILT flipped) — 20 tests incl. host-tick REACH on connector + castle arms | `state/racial/lifesteal.ts` (new), `state/damage.ts` (heal call in each arm + `damageConnector` attacker param), 4 `damageConnector` call sites |
| CRIMSON TIDE (lifesteal 50 %) | vampires.l5 | ✅ DONE (BUILT flipped) — replaces 20, pinned | same |
| BLOOD FRENZY | orcs.l0 | ✅ DONE (BUILT flipped) — 16 tests; found + fixed the S168 enraged-never-fires defect (`ragedFireTick`) | `state/racial/bloodFrenzy.ts` (new), `racialTick.ts` slot |
| THE HORDE GROWS | orcs.l5 | ✅ DONE (BUILT flipped) — 12 tests, REACH via FEED_TOWER dispatch + runHostTick castle, both wirings mutation-tested | `state/racial/hordeGrows.ts` (new), `creatureLifecycle.ts underGoblinCaps`, `raceUnitEmit.ts` cadence |
| SCORCHED GROUND | demons.l0 | ✅ DONE (BUILT flipped) — 13 tests; zone + ownership guards mutation-tested; ember tint on the zone backdrop sprite | `state/racial/scorchedGround.ts` (new), `racialTick.ts` slot, `damage.callSites.test.ts` (+1 null site), zone ember tint (render) |
| DEEP CURRENT | nagas.l0 | ✅ DONE (BUILT flipped) — 8 tests, REACH via runHostTick, snap wiring mutation-tested; vortex derived from the jump | `state/racial/deepCurrent.ts` (new), `gathererLifecycle.ts` HAULING, vortex (render) |

## Decisions recorded so far (MINE unless quoted)

- Research read: W1 `lifesteal`, W2 `reuse-mechanics` 1/1b/1c/3/4/4b.
- `npm install` done in the worktree (exit 0).
- Lifesteal heals on the SWUNG amount (overkill included; castle: before castle DEF), floor-at-one,
  capped at `creatureMaxEhp`; creatures only (Helga/turret/castle gun/raid/area blasts heal nobody).
- `damageConnector` gained a REQUIRED `attacker` (4 sites: creatureAttack + voltkinChain named;
  suicideBlast + world.ts raid null). New census `src/state/damageConnector.callSites.test.ts`.
- ⚠ SHARED TEST TOUCHED: `src/state/draftLifecycle.test.ts` — the deadline cases pinned the GENERAL
  literal (true only while every racial was COMING SOON). Re-pinned to derive the auto-pick from
  `draftOptionsFor`, so it holds as every branch flips its perks. Other branches may hit the same.

- ⛔ PRE-EXISTING S168 DEFECT FOUND + FIXED (in scope: BLOOD FRENZY is useless without it): rage halved
  the cadence 60→30 but left `attackFireTick` 30, so the FSM left ATTACKING one tick before the fire
  check — an enraged Warlord NEVER landed a blow. Fix: `ragedFireTick` beside `rageMultiplier`
  (`creature.ts`), read at `hostTick.ts` fire check + `creatureLifecycle.ts` targetGoneEarly.
  Mutation-tested (restoring the old fire check turns bloodFrenzy.test.ts red). Sim-rule change →
  rides the S188 49→50 bump; merge owner should add it to the protocol docblock.

- `damage.callSites.test.ts` re-pinned 14/8/6 → 15/8/7 (+1 null site: `racial/scorchedGround.ts`).

## Gates (HEAD 9de4aa4, all captured `$?`)

- typecheck 0 · vitest 0 (5699 tests / 349 files) · build 0 (923.2 KiB; base 87f3dc4 = 919.8 KiB → +3.4 KiB)
- first full vitest run was RED (1): `untargetableCallSites.test.ts` flagged `scorchedGround.ts` → recorded as an AREA verdict (9de4aa4), re-run green.
- Canon text + constants: `.claude/plans/S188_CANON_NOTES_racial-a.md`.

## Next

- final report only.

## Known broken

- nothing known

## FIX ROUND (after merge into master; branch fast-forwarded to master f61d6f5)

| item | status |
|---|---|
| F1 lifesteal order-independence (`pendingLifestealFifths`) | ✅ DONE — lifestealOrder.test.ts (real host tick, mirrored pairs), mutation-tested |
| F3 rage transition mid-swing | ✅ DONE — `Creature.attackCycleRaged` latch (four sites), rageCycle.test.ts, mutation-tested |
| F4 eliminated demon seat keeps burning | ✅ DONE — castleHp > 0 guard in scorchedZones + ember tint, mutation-tested |
| F7 missing lifesteal arm tests (Helga, stink bag, Voltkin link) | NEXT |

- F1 fixture lesson: a MUTUAL duel is arbitrated by the S156 P4 initiative roll (`winsInitiative`,
  ids + tick), so two mirrored duels differ for a reason unrelated to loop order. The fixture uses
  one-sided strikes (vampire → stunned chewer, enemy → vampire).
