# S192 PROGRESS — `s192/units-ai` (T5 + T13 + T6)

## ⭐ S193 ROUND — merge master + re-verify (FINAL REPORT, see bottom section "S193 ROUND")

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

## T6 — DONE (resumed after the limit)
- Fixtures fixed: the archer row now tests at reach+1 (219 px, inside the 220 acquire radius); the REACH repro scripts ONLY
  the drone's flight (west at the measured 3.92 px/tick — an unscripted drone with no enemy connector idles at its hub)
  and removes the castle emitter's mid-run births; the drone is born NOW (back-dating it expired its fuse → it vanished on
  tick 0, which was the earlier "drone arm went further" artefact).
- MEASURED on that repro, 500 ticks, `cannotCatch` forced false (BEFORE) vs shipped (AFTER):
  goblinMelee 904 → 517 px = **−42.9 %**, 129 ticks locked → **0.0 %**, 0 ticks locked;
  t9BossOrcs 957 → 545 px = **−43.0 %**, 129 ticks locked → **0.0 %**, 0 ticks locked.
  (The research's own board measured −40 % / −59 %.)
- `navUnitReference.fixtures.ts`: `referenceCannotCatch` LONGHAND (standoff fraction copied as a literal and pinned equal
  in `chaseGiveUp.test.ts`), applied in its acquire (with the chaser) and hold. Perf differential (waves 1–3): 0 nav
  mismatches, no hash divergence; its stats are byte-identical to the T13 run — ⚠ the bots match never exercises T6
  (no drone/chewer chase occurs), so T6's oracle proof is the NEW isolated-quarry case in `navUnitIndex.differential`
  (6 chaser types × drone/chewer × 4 distance bands, epoch + live; anti-vacuity both kept and dropped), which goes RED
  under the `cannotCatch → false` mutant. `navUnitIndex.guards` #5 re-pinned (fallback carries the chaser; rule read live).
- `chaseGiveUp.test.ts` (8): config arithmetic (non-combatants = exactly chewer + lightningDrone; who drops whom), REACH ×2
  through the real host tick, negatives (drone inside reach still picked/held; chewer still chased by a melee goblin;
  R184-A — an archer is acquired and HELD by a vampire boss), the reference-fraction pin. Mutation `cannotCatch → false`:
  3 red here + 1 red in the differential.
- Helga's IDLE acquisition NOT changed (research marked it optional; not in the brief) — owner question.
- Gates: typecheck 0 · vitest 0 (423 files / 6763 tests passed, 7 skipped) · build 0, **975.9 KiB** (+0.7 over master 975.2).
- Bump: **NO** — host-only targeting; static config only, no field.

## REFINEMENT ROUND (owner answers, S192)
### R1 — fading clause REMOVED (*"Units are either destroyed or respawned."*)
- `isLiveCreatureTarget` = live pool · not pending death · targetable. The `DESPAWNING` line is gone from the predicate,
  the perf reference longhand, and every comment; a test now pins that a DESPAWNING unit IS still a target, and the sites
  guard pins the predicate body contains no `DESPAWNING`.
- Which creatures can age out with a fade (TTL, `!persistent && !selfExplode` → the 60-tick DESPAWNING window,
  `creatureLifecycle.ts:766`), read from `CREATURE_CONFIGS` on this tree: **voltkin** (1200 ticks on the 'fight' clock = 20 s
  of FIGHT), **direwolf** (1800 = 30 s), **chewer** (3000 = 50 s — ⚠ s191/owner makes it persistent, so after that merge it
  no longer ages out), **locustCloud** (900 = 15 s; untargetable anyway). The **lightningDrone** has a TTL too (480 = 8 s)
  but it is a flight FUSE: it detonates, it never fades. Every goblin / race unit / t3 / boss is persistent.

### R2 — T6 made SMART (*"I didn't say ignore drones or pencil chewers all the time. It just has to be smart"*)
- `cannotCatch` (`creatureAI.ts`): a FAST NON-COMBATANT (drone/chewer, > 1.25 × chaser `maxAccel`, ⚠ MINE) is ENGAGED
  when ANY of: (1) within reach + 20 px (⚠ MINE); (2) inside the chaser's OWN zone (`zoneOf(q.pos) === zoneOwner(seat)`);
  (3) an INTERCEPT is feasible — `interceptFeasible`: P = point of the quarry's straight path `pos → targetPos` nearest the
  chaser; engage iff `max(0, |C−P| − reach) · v_q ≤ |A−P| · v_c` (speeds = `maxAccel`, cross-multiplied, no division;
  ⚠ approximation: straight path at cruise speed, no braking; a pathless quarry has nothing to cut off). Otherwise it is
  neither acquired NOR held — the same predicate at both, so a dropped drone cannot be re-taken until it re-enters (1)–(3):
  no ping-pong, no memory, no new field. Reference longhand updated (`referenceCannotCatch(world, …)`).
- HIS SCENARIO through the real host tick (`chaseGiveUp.test.ts`): seat 1's REAL lightning hub + three stink towers, a
  4-orc-boss army razing the towers, seat 0's stink tower at home for the drones to fly at. BEFORE (`cannotCatch` forced
  false) vs AFTER: ticks locked on a drone **1550 → 231**; far re-acquires **1 → 0**; westmost point while locked
  **x 1158 → 1329** (asserted > 1250); towers razed at tick 414 either way; 3–4 drones emitted. Then the army walks onto
  the hub, whose S187 self-destruct kills it — game reality, not this rule.
- ADVANCE TABLE (scripted fly-by, enemy ground, 400 ticks), BEFORE → AFTER:
  goblinMelee 663→285 px (−57.0 %, 129 ticks locked) → 663→413 px (**−37.6 %**, 92); t9BossOrcs 702→296 (−57.8 %, 130) →
  702→434 (**−38.2 %**, 93). The remaining loss is the INTERCEPT he asked for (the drone flies past them toward their base,
  they step out to cut it off and let it go once it is by). Asserted < 45 %.
- Mutations: `cannotCatch → false` → 5 red in `chaseGiveUp` + the oracle case; zone arm removed → home case red + oracle;
  intercept arm removed → intercept case red + oracle. The `navUnitIndex.differential` T6 case now spans 6 chaser types ×
  drone/chewer × 4 distances × home/abroad × pathless/past/away, epoch and live.
- HELGA (*"she should go at … passing by drones"*): untouched — the rule is `pickNavUnit`'s only; pinned: a Helga with a
  drone 300 px from her hall, flying past, takes it (`WALK`).

### R3 — fallen tower's leftover shapes: NO CHANGE, pinned (*"stay … a target … until they're completely destroyed. Just as it is today."*)
- There was no pin. `deadTargets.test.ts` now stamps a real seat-1 stink tower, removes its defender record (what a recipe
  break does), and asserts its connectors remain on the board and `structureTargets` still hands a nearby enemy unit a
  target.

### Refinement gates
- typecheck 0 · vitest 0 (423 files / 6768 tests passed, 7 skipped) · build 0, **976.3 KiB** (+1.1 over master 975.2).
  Perf differential + nav differentials + guards green inside the run.
- Bump: still **NO** for every item (host-only targeting; `zoneOf`/`targetPos`/`pos` are synced state, so a successor or
  worker mirror computes the same answer).

## S193 ROUND — `git merge master` + re-verify (no new feature code)
- Pre-merge tip **a710689**. `git merge master` (master = **71abc27**, 210 commits; brief said 8693fdd — master had
  moved by one bookkeeping commit) → merge commit **3bce29c**. **ZERO textual conflicts** — git auto-merged
  `constants.ts`, `audioManager.ts`, `creature.ts`, `creatureAI.ts`, `navUnitIndex.guards.test.ts`.
- Semantic seams checked by hand (master's hunks in my files): `creatureAI.ts` = C-6 strict spread (bond buckets,
  disjoint from pickNavUnit/chokepoint/march); `creature.ts` = Warlord rage helpers + `rageStartTick` (disjoint);
  `voltkinChain.ts` = `severWithCarry` in the sever loop (disjoint from my hop gate); `audioManager.ts` = T15 loop /
  voice cap (disjoint from `isHelgaEngagedRaw`); `navUnitIndex.guards` = fxLab allocator row (disjoint).
  New creature scans master added (`raColumn`, `scorchedGround`, `bloodFrenzy`, `bossSkillsWarlord`, `potatoLifecycle`,
  `voltkinTv`) are AREA / count / aura scans, not victim picks — none needs `isLiveCreatureTarget` (`liveTargetSites`
  + `untargetableCallSites` guards green on the merged tree). `isNonCombatantType` still = chewer + lightningDrone
  (pinned). Master's stock rule (drones persist, fly HOME when their target is used) makes drones cross armies more
  often; T6's predicate is path-generic (`targetPos`), REACH green.
- REACH re-run through the merged host tick: `chaseGiveUp` 12 · `deadTargets` 12 · `helgaBuildPatrol` 5 ·
  `liveTargetSites.guards` 3 · `navUnitIndex.differential` 8 · `navUnitIndex.guards` 6 · `untargetableCallSites` 5 ·
  `s191Perf.differential` 1 → exit 0, 52/52.
- Perf oracle: master did NOT move `navUnitReference.fixtures.ts` / `s191PerfOracle.fixtures.ts` /
  `s191Perf.differential.test.ts` (0 commits). Merged run: nav mismatches **0**, `pendingDeathReturned` **0**, every
  tick hash-identical; `corpseAvoided` **1160** (was 746 — master's gameplay changed the board), floor 100 unchanged;
  only the `CORPSE_MEASURED` note string updated. Byte-identity is still claimed ONLY reference-vs-changed inside the
  oracle (the reference carries T6/T13 longhand) — never vs pre-T13 master, whose outputs T13/T6 deliberately move.
- Gates (exit codes from files): typecheck **0** · vitest `--maxWorkers=3` **0** (474 files passed / 4 skipped;
  7274 tests passed / 11 skipped) · build **1** — ⚠ RULED AN ENVIRONMENT ARTEFACT, NOT THE BRANCH: entry 1157.9 KiB.
  Cause: master added `pixi-filters` 6.1.5; this worktree's `node_modules` predates it, so Node/Vite resolve it from
  the MAIN checkout's `node_modules`, and its `import 'pixi.js'` then binds the main checkout's pixi — a SECOND pixi
  copy in the bundle. Proven: the same tree built with `resolve.dedupe: ['pixi.js']` (scratch config
  `.tmp-gates/vite.dedupe.config.ts`, exit 0) = **1 060 694 B = 1035.8 KiB** vs master's live deploy-run build
  **1 059 708 B = 1034.9 KiB** → this branch costs **+1.0 KiB**. Fix = `npm install` in this worktree (the lockfile
  pin is already on master); NOT run here (no-new-package rule — left to the merge owner). CI clean checkout is unaffected.
- BUMP VERDICT, re-checked honestly — **REVISED: YES, earns one (or rides the train's).** My earlier "NO … a
  successor/worker mirror runs the same code" was wrong for a MIXED-BUILD successor. S186 test: a client computes none
  of T5/T6/T13 except one cosmetic — `gathererRenderer.drawCastleShot` calls `findNearestEnemyCreatureFrom` (T13's
  chokepoint); it differs only on an `ehp ≤ 0` creature, which no snapshot carries (the deferred-death sweep runs
  before the tick returns; `pendingCreatureDeaths` is null on a client), so the client outputs agree. The worker
  mirror is same-bundle. But a **host-migration successor runs `runHostTick`**: a pre-T13 build promoted from a
  post-T13 host (both advertising 56) computes different targets from the same state (chases drones across the map
  again, marches on a fallen keep, takes corpses, Helga stops patrolling in BUILD). That is exactly the class S192's
  54 counted for C-6 (*"a CHANGED SHARED RULE both peers (host, successor, worker mirror) compute"*). ⚠ S190's 51
  docblock recorded s189/units' host-side rules as "owed nothing alone"; the two precedents disagree, and the later
  (54, C-6) governs. No field, no wire change, no new discriminant.
