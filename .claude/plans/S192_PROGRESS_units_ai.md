# S192 PROGRESS — `s192/units-ai` (T5 + T13 + T6)

Branch `s192/units-ai`, from master 663c4c9 (fast-forwarded to 2ab7910, docs only). Merge owner = main session.
Every exit code below was captured from `$?` into a file, never through a pipe.

## T5 — Helga patrols in BUILD — DONE
- `stepPrincessPatrol(world, d, homePos)` factored out of the FSM's IDLE arm (`defenderLifecycle.ts`), byte-identical
  for FIGHT; `defenderHomePos` reads the anchor the way `applyDefenderTick` does.
- `hostTick.ts` defender poll: in the non-FIGHT branch a living (`IDLE`) Helga takes one patrol step and `continue`s.
  No acquire, no fire clock, no aura, no state change; DORMANT untouched.
- `audioManager.ts`: the theme's raw engaged predicate extracted as the pure `isHelgaEngagedRaw` (no behaviour change)
  so the sim test can pin "her music does not start".
- Tests: `src/state/defenders/helgaBuildPatrol.test.ts` (5): REACH through `runHostTick` (moves > 10 px, ≤ 133+5 px from
  hub, on board), arithmetic (destination = the S183 formula, anti-vacuity floor), NEGATIVE motion-only (enemy at 50 px
  never acquired, `nextFireTick` unchanged, IDLE, `isHelgaEngagedRaw` false every tick), NEGATIVE DORMANT does not move,
  the predicate itself.
- Mutations: (1) BUILD call removed → 3 red (REACH, arithmetic, negative's live-walk floor); (2) patrol puts her in WALK →
  3 red (incl. the music assertion).
- Gates: typecheck 0 · vitest 0 (420 files passed / 2 skipped, 6739 tests passed / 7 skipped) · build 0, **975.5 KiB**.
  No replay / differential baseline moved.
- Bump: **NO** — host-only motion of the synced `pos`; a client runs no defender FSM.

## T13 — never target the dead — DONE
- ONE predicate `isLiveCreatureTarget` (`creature.ts`): `ehp > 0` · not in `pendingCreatureDeaths` · not `DESPAWNING`
  (⚠ MINE) · not `isUntargetable`. Applied at EVERY pick and hold, enumerated from the `isUntargetable(` census:
  chokepoint `findNearestEnemyCreatureFrom` (castle guns, defenders, Voltkin opportunism, gatherer preview),
  `pickNavUnit` hold, the S191 indexed acquire (read LIVE, list stays membership-only), `creatureLifecycle` ×3
  (engage `unitInReach`, ATTACKING re-validation, wind-up abort), `voltkinChain` hop, defender `targetValid` + the WALK
  hold (which had NO liveness test), retaliation `canBeRetaliatedAgainst`, CORPSE EATER `isFeedable`, Archdemon teleport
  pick, Kraken aim. Area sweeps untouched. Not changed (verdicts pinned): RAID_TARGET reducer, raid cursor, projectile
  render, retaliation victim gate.
- `enemyCastleMarchPos` skips `castleHp <= 0` seats (same test as `enemyCastleInReach`/`isEliminated`); `null` when no
  enemy keep stands (caller keeps its destination).
- Perf fixtures RE-PINNED IN THE SAME COMMIT: `navUnitReference.fixtures.ts` gets the rule LONGHAND (`referenceIsLiveTarget`,
  not imported, so the oracle stays independent); `s191PerfOracle.fixtures.ts` gains `corpseAvoided` and counts a real-side
  corpse return; `s191Perf.differential.test.ts`: `pendingDeathReturned` is now an asserted INVARIANT (= 0), with a NEW
  anti-vacuity floor `corpseAvoided ≥ 100` (measured **746** on the default waves 1–3 run; full run not re-measured).
  `navUnitIndex.differential.test.ts`: the "corpse is STILL returned" case inverted (never returned, hold dropped, both
  modes), a DESPAWNING case added, DESPAWNING added to the random churn. `navUnitIndex.guards.test.ts` #5 re-pinned to the
  live predicate (+ its body). `untargetableCallSites.test.ts` accepts `isLiveCreatureTarget` as the gate.
  No floor was lowered; nav mismatches 0, hash divergence none.
- New tests: `deadTargets.test.ts` (11: predicate arithmetic, fallen-keep REACH through the real host tick with 3 seats —
  an orc boss at the ruin marches on and damages the live keep; march arithmetic; negative null; corpse skipped by the
  chokepoint / pickNavUnit acquire+hold / castle gun / Voltkin chain / ATTACKING commit; DESPAWNING; negative no
  over-filter). `liveTargetSites.guards.test.ts` (3: per-file predicate counts, every bare `isUntargetable(` a verdict).
- Mutations: castleHp skip removed → 3 red; predicate's ehp+pending lines removed → 9 red incl. the perf differential;
  `ehp`-only removal → 1 red (pending is defence in depth: a deferred kill already sets ehp ≤ 0, stated);
  `pickNavUnit` hold reverted to the bare gate → 6 red incl. in-place mismatches + the sites guard.
- Gates: typecheck 0 · vitest 0 (422 files / 6754 tests passed, 7 skipped) · build 0, **975.5 KiB**.
- Bump: **NO** — targeting is host-only; clients render synced state; `tickGameState` untouched. A successor/worker mirror
  runs the same code (pure predicate on host-tick scratch), so it agrees.

## T6 — don't chase what you can't catch — IN FLIGHT (WIP commit)
- DONE (code, compiles): `CHASE_GIVEUP_SPEED_RATIO` 1.25 / `CHASE_GIVEUP_SLACK_PX` 20 (⚠ MINE, `constants.ts`);
  `isNonCombatantType` (`voltkin-config.ts`: chewer + `selfExplode && !targetsStructures`); `cannotCatch` +
  `chaseLimitsOf` in `creatureAI.ts`, applied in the `pickNavUnit` hold, the indexed acquire, and the chokepoint ONLY when
  a `chaser` is passed (only `pickNavUnit` passes one — castle guns/defenders unchanged). Test `chaseGiveUp.test.ts` written.
- NOT YET: run `chaseGiveUp.test.ts`; update `navUnitReference.fixtures.ts` with the rule LONGHAND (else the perf
  differential mismatches); measure before/after (stash the creatureAI hunk to get BEFORE); mutation `cannotCatch → false`;
  full gates; canon notes; final commit.
- EXACT NEXT STEP: `npx vitest run src/state/creatures/chaseGiveUp.test.ts src/state/s191Perf.differential.test.ts
  src/state/creatures/navUnitIndex.differential.test.ts` and fix the reference fixture.
- PAUSED (owner order, usage limit). First run of `chaseGiveUp.test.ts` (T6 code applied) = 2 red, both FIXTURE defects:
  (1) arithmetic case: 200 px is INSIDE goblinArcher's reach (218 = engageRange + 20) → use 300 px or drop the archer row;
  (2) REACH case: the no-drone goblinMelee dies before 600 ticks (dx NaN — the enemy keep's gun one-shots it at the end of
  the march); the orc boss arm measured no drone 676 px vs one drone 936 px (the drone arm going FURTHER means the
  fixture is not the research repro — the drone likely draws/clears something). Rebuild the repro: shorter run (~400
  ticks) or start further from the keep, and confirm the drone actually crosses the unit's path.
- EXACT NEXT STEP on resume: fix those two fixtures, then measure BEFORE (mutant: `if (limits !== null) return false;`
  as first line of `cannotCatch`) vs AFTER; then update `navUnitReference.fixtures.ts` with the rule longhand and run
  `src/state/s191Perf.differential.test.ts` + `navUnitIndex.differential.test.ts`; then full gates.
