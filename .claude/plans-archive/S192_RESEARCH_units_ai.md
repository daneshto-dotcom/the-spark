# S192 RESEARCH — units-ai lane (T5, T6, T13, T15, T16)

READ-ONLY research. Nothing in `src/` was edited. Every repro below ran through the real reducer / real
`runHostTick` from throwaway vitest files in the session scratchpad (`…/scratchpad/r-units/`, run with a
scratch config pointing at the main checkout). None of them is committed. Source = `master` @ 7236934; the
`s191/perf` (9c23ba4) and `s191/owner` (52a4fed) worktrees were read for every function they rewrite.

Canon read first: §3e, §4, §5, §5b (C3/C8), §6 (the S186 test), §7b, §9b (R183-A..D, R184-A), R190-J (in
`defender.ts:88`). Nothing below reverses any of them. Where a fix touches one, it says so.

| item | verdict | repro | protocol bump |
|---|---|---|---|
| T5 Helga idle in BUILD | **BUG, root cause found** | ✅ 0.00 px of movement in 900 BUILD ticks, 110.8 px in 900 FIGHT ticks | none (host-only motion) |
| T6 chasing drones | **BUG, root cause found**; 3 fix options | ✅ one passing drone costs a melee goblin **40 %** of its 10 s advance, the orc boss **59 %** | none |
| T13 attacking the dead | **3 BUGS + 1 owner question** | ✅ the march walks to a FALLEN keep (26 px from it after 20 s, live keep untouched); `pickNavUnit` returns the corpse | none |
| T15 wave-8 audio | **research**; top hypothesis MEASURED | ✅ ffmpeg: every music loop ends in 1.5–3.7 s of silence; one seam lands in wave 8 | none (client-only) |
| T16 Voltkins don't come back | **2 BUGS + 1 missing rule**; "TV" = the Voltkin tower | ✅ 3 TVs → 2 Voltkins; next wave, 3 healthy TVs → **0** | none |

---

## T5 — "Helga is not patrolling during the build stage"

### Evidence
- The patrol exists, and it lives INSIDE the FSM. `defenderLifecycle.ts:351-376`, the `case 'IDLE'` arm of
  `applyDefenderTick`, derives a patrol point from `mix32(d.id, floor(tick / PRINCESS_PATROL_LEG_TICKS))`
  (S183, the owner's *"Helga needs to patrol around her tower"*).
- **`applyDefenderTick` is never dispatched outside FIGHT.** `hostTick.ts:1434`:
  `if (world.matchPhase !== 'FIGHT') continue;` comes before `DEFENDER_TICK`. That line is S149 P2 / R4
  (*"your towers can fight during build stage"*), and it is right for the WEAPON. It also turns off her legs.
- She also stands EXACTLY on her hub for every BUILD after a revive: `reviveDormantHelgas`
  (`defenderLifecycle.ts:585`) puts her `pos` on the anchor, and R183-G draws unit sprites BEHIND the
  building. So "stands behind her tower" is literal: she is at the anchor, under the hall's art.
- At the FIGHT→BUILD edge `standDownDefenders` (`:655`) sets IDLE and clears the target, but leaves her
  wherever she was. Then nothing moves her for 90 s.

### Repro (`t5_helga_build.test.ts`)
Real stamp + real matcher + real host tick. 900 BUILD ticks: `state IDLE`, **max displacement 0.00 px**,
`walkTargetPos null`. Flip to FIGHT, 900 ticks: **110.81 px** — she patrols.

### DORMANT, the leash and C8
- DORMANT (R190-J) must keep returning early. Both edges revive her (`hostTick.ts:482`, `:565`) and she
  wakes IDLE on the hub, so patrol starts on the next BUILD tick. Nothing in the fix touches dormancy.
- The patrol disc is `attackRange × PRINCESS_PATROL_RADIUS_FRAC` = 380 × 0.35 = **133 px** around the hub,
  and the point is already clamped to the board (`clampPointIntoPlayfield`, C8). Reusing the same code keeps
  C8 for free. The FIGHT acquisition leash (380 from home) does not come into it, because BUILD acquires nothing.
- ⚠ **The Helga theme.** `updateHelgaTheme` (`audioManager.ts:846`) counts her as engaged when
  `state !== 'IDLE' || targetCreatureId !== null`. Patrol stays in IDLE with a null target, so BUILD patrol
  does **not** start her music. **The fix must keep it that way.** Moving the patrol into `WALK` would play
  her theme through every BUILD.

### Fix shape
Move lines 351-376 into an exported `stepPrincessPatrol(world, d, homePos)`. Call it from the IDLE arm,
which changes nothing for FIGHT, and from the `hostTick` defender loop in the non-FIGHT branch:
`if (matchPhase !== 'FIGHT') { if (d.kind === 'princess' && d.state !== 'DORMANT') stepPrincessPatrol(...); continue; }`.
In BUILD this runs motion only: no acquisition, no `nextFireTick`, no stink aura, no retaliation. That is
R4 as ruled: the weapon stays cold and only the legs move. `homePos` = the anchor's position, read the same
way `applyDefenderTick` reads it.

- **Files:** `src/state/defenders/defenderLifecycle.ts`, `src/state/hostTick.ts` (defender loop near :1434).
- **Determinism:** a pure function of (id, tick, the anchor position). No new field and no RNG.
  `pos`/`prevPos`/`walkTargetPos` are already serialized and hashed.
- **Tests owed:** (1) through the host tick, Helga moves > 10 px in BUILD and stays within 133 px of her hub
  and inside `[40,1880]×[40,1040]`; (2) in BUILD she never acquires (`targetCreatureId === null` and
  `nextFireTick` untouched while an enemy creature stands 50 px away); (3) a DORMANT Helga does not move in
  BUILD; (4) `updateHelgaTheme`'s predicate stays false through a BUILD patrol, as a pure-predicate test on
  the world view; (5) a mutant that removes the BUILD call goes RED. ⚠ Replay and differential baselines
  that hold a Helga across a BUILD will move, because `pos` is hashed. Re-pin them, never relax them.
- **Protocol:** **NO BUMP.** A client runs no defender FSM and renders the synced `pos`. Under the S186
  question nothing the client computes changes. A host-migration successor's own build decides future
  motion, and that is the same class as `s189/units`' Helga clamp, which canon §6 records as riding 51
  *"without needing it"*.

---

## T6 — "they turn around to chase [the drone] … going back and forth, not doing anything"

### How a unit acquires and holds a creature
1. **Structure-attackers** (every goblin, the race unit, the t3s, the bosses, the direwolf): `hostTick.ts:1715`
   calls `pickNavUnit(world, c, c.targetCreatureId, 220², 300²)` every SEEKING tick.
   - **Hold** (`creatureAI.ts:827-845`): keep `held` while it is alive in the map, hostile, targetable and
     within **300 px of the chaser's own position**.
   - **Acquire:** the nearest enemy creature within **220 px**, lower id winning a tie. On `s191/perf` this
     goes through `findNearestEnemyCreatureIndexed` (perf `creatureAI.ts:~970`).
   - Steering then puts the quarry above everything except going home (`hostTick.ts:1766`).
2. **Voltkin:** `findNearestEnemyCreature` = within its own 180 px only, and it never paths to it
   (`hostTick.ts:1922`). It does not chase.
3. **Helga:** in IDLE she acquires from HOME within 380 px, then WALKs to the target and re-checks the leash
   from HOME (`defenderLifecycle.ts:284-330`, `:378+`). A drone crossing her zone makes her walk out and back.
4. **Turret, stink tower, castle guns:** stationary. They shoot and never chase. Unaffected.

### Retaliation is NOT involved, verified
The drone never enters ATTACKING (`LIGHTNING_DRONE_CONFIG` *"it never ATTACKS"*), so
`isStrikingCreature` can never name it. Its blast goes through `applyRadialDamage` → `damageEntity(...,
attacker = null)` (`damage.ts:~733`), so `recordCreatureRetaliation` is never reached. `retaliation.ts`
already excludes the drone by capability (canon §9b). **The ping-pong is pure `pickNavUnit`.**

### Why they can never catch it (measured cruise speeds, px/tick, real host tick)
drone **3.92** · hound 2.18 · goblinMelee 1.61 · t3Warband 1.61 · archer 1.32 · shield 0.85.
In config, `maxAccel` is the speed (terminal speed ∝ maxAccel): drone **240**; the fastest chaser, t3Bat, is
168; Voltkin 200; locust 189; chewer 120; goblinMelee 119; t9 bosses 91–140; shield 63.
Every chaser loses ≥ 2.3 px/tick to the drone. The 300 px hold only breaks after the drone has gained
80 px on it, and by then the unit has turned, braked and re-accelerated.

### Repro (`t6_chase.test.ts`)
A unit marches east toward an enemy stink tower. One enemy drone spawns 260 px ahead and 120 px off-axis,
heading for the unit's own base. Distance advanced in 600 ticks, without vs with the drone:

| unit | no drone | one drone | lost | ticks locked on the drone |
|---|---:|---:|---:|---:|
| goblinMelee | 823 | 498 | **−40 %** | 102 |
| t3Warband | 823 | 498 | −40 % | 102 |
| goblinShield | 616 | 486 | −21 % | 99 |
| t9BossOrcs | 814 | 334 | **−59 %** | — |
| goblinArcher | 722 | 714 | −1 % (standoff ring) | 50 |
| goblinHound | 737 | died at t=540 in the drone run | — | 103 |

That is ONE drone. A hub emits one every `DRONE_EMIT_INTERVAL_TICKS` = 5 s, and `s191/owner` makes drones
persistent STOCK that idle at their hub and fly home when their target is gone. Both make drones crossing
an army more frequent. **This is his "back and forth, not doing anything", measured.**

### Fix options (every number marked MINE is mine)
All three are expressed against the PERF version: `pickNavUnit` (hold branch unchanged on perf) and
`findNearestEnemyCreatureIndexed`. The new test is read LIVE inside the index loop, never cached into the
per-seat list. The list is shared by every chaser of a seat, so a chaser-relative rule cannot be baked
into it. A per-TYPE flag CAN be precomputed beside `untargetableType`, exactly as perf already does.

**Option 1 (recommended): "don't chase a non-fighter you can't catch".** In BOTH the hold and the acquire,
skip quarry `q` for chaser `c` when all three hold:
(a) `q` cannot strike a unit. `isNonCombatant(type)` = the drone discriminator
`selfExplode && !targetsStructures`, plus `chewer` (STRUCTURES_ONLY). This is a named, per-type statement,
the same pattern as `NEVER_RETALIATES`. Note `CREATURE_TARGETS.lightningDrone` is BOTH, so
`creatureCanTarget` alone cannot express this.
(b) `cfg(q).maxAccel > cfg(c).maxAccel × CHASE_GIVEUP_SPEED_RATIO`, with the ratio **1.25 (MINE)**.
(c) `q` is farther than `engageRange(cfg(c)) + CHASE_GIVEUP_SLACK_PX`, with slack **20 px (MINE)**.
A drone that flies through your reach is still hit. You just do not turn and run after it.
- Affects: the drone, against every structure-attacker (240 > 168 × 1.25). The chewer only against the
  shield goblin (120 > 79) and the naga boss (120 > 114). Every other unit keeps chasing chewers, since
  120 ≤ 119 × 1.25. Voltkin, archers, bats and bosses are combatants and are never skipped.
- Helga: apply the same skip in her IDLE acquisition (`defenderLifecycle.ts:289`), with `meleeRange` 40 as
  her reach and her `moveAccel` 150 as her speed. She stops walking out after drones crossing her zone.
  Turret, stink tower and castle guns are untouched. Shooting drones down is their job.
- Static config only: no new field, no history, and the `(distSq, id)` total order is untouched.

**Option 2: "give up when the gap opens".** In the hold branch only, drop `held` when it is a non-combatant
(same (a)), beyond reach (same (c)), and opening faster than **0.5 px/substep (MINE)**. The opening rate
is computed from the existing hashed `pos`/`prevPos` of both bodies:
`|q.pos − c.pos| − |q.prevPos − c.prevPos|`. This catches "flies away" directly, but a drone passing
head-on is still acquired and chased until it passes, so the unit always loses some ground. It is also
more numerically delicate: `prevPos` is one substep old, and a float compare decides a branch, so it needs
the total-order discipline.

**Option 3 (narrowest): name the drone.** Never acquire or hold a `selfExplode && !targetsStructures`
creature beyond your own reach. It fixes exactly the reported case and nothing else, but it ignores his
general *"if it's quicker than them"*.

### R184-A — no conflict, stated plainly
R184-A is a melee unit chasing an ARCHER it can never catch, through retaliation. All three options gate
on (a), "cannot strike a unit". An archer can, so it is never skipped. The 980 → 230 measurement pinned in
`retaliation.test.ts` does not move. Retaliation never targets a drone or a chewer (`NEVER_RETALIATES` and
the drone capability exclusion), so no retaliation lock is ever dropped by this rule.
⚠ **What would conflict:** reading his *"if it's quicker than them, they just turn around"* as covering
archers too. That reverses R184-A. If he means that, **he has to re-rule R184-A**. Do not infer it.

- **Files:** `src/state/creatures/creatureAI.ts` (`pickNavUnit` and `findNearestEnemyCreatureIndexed` on
  perf), `src/state/creatures/voltkin-config.ts` or `stats.ts` (the `isNonCombatant` per-type set),
  `src/constants.ts` (two MINE constants), `src/state/defenders/defenderLifecycle.ts` (Helga, optional).
- **Tests owed:** the table above becomes the test. Through the host tick, a melee goblin with one drone
  passing loses < 10 % of its advance (it loses ~40 % today). Mutant: drop the rule → RED. A drone that
  enters the chaser's reach is still struck. An archer retaliation chase is unchanged (re-run R184-A's
  three-arm table). A chewer next to a melee goblin is still chased. The perf
  `navUnitReference.fixtures.ts` and `s191PerfOracle.fixtures.ts` are VERBATIM copies of the old function:
  update them in the same commit, and the differential stays the proof.
- **Protocol:** **NO BUMP.** Targeting is host-only, and the client renders the synced positions.

---

## T13 — "attacking a dead enemy … went back to the castle that's already destroyed"

### Every target writer, enumerated mechanically
Found with `grep "\.target(Creature|Primitive|Bond)Id = "` over `src/state` plus every
`world.creatures` scan. A ✗ marks a writer with no liveness gate.

| picker | file:line | dead-target gate? |
|---|---|---|
| `findNearestEnemyCreatureFrom` (THE chokepoint: Voltkin opportunism, castle guns, every defender, master's `pickNavUnit` acquire) | `creatureAI.ts:736` | ✗ no `ehp`/pending check (only `isUntargetable`) |
| perf `findNearestEnemyCreatureIndexed` | perf `creatureAI.ts` | ✗ deliberately not filtered, *"a behaviour question, reported, not built"* |
| `pickNavUnit` hold | `creatureAI.ts:827-845` | ✗ |
| ATTACKING re-validation of `targetCreatureId` | `creatureLifecycle.ts:1059-1071` | ✗ (alive-in-map only) |
| `voltkinChain` hop | `voltkinChain.ts:108-127` | ✗ a bolt link can land on a corpse |
| castle guns | `castleGuns.ts:127` → the chokepoint, run at `hostTick.ts:2094`, INSIDE the deferral window (opened :1486, swept :2195) | ✗ a shot can go into a corpse |
| defender `targetValid` / WALK re-check | `defenderLifecycle.ts:143`, `:378+` | ✗ (no corpses in practice: the defender poll runs before the window opens) |
| `enemyCastleMarchPos` | `creatureAI.ts:1261` | ✗ **no `castleHp` check at all** |
| `enemyCastleInReach` | `creatureAI.ts:1000-1003` | ✓ `castleHp <= 0` skipped |
| retaliation | `retaliation.ts:172-191` | ✓ `ehp <= 0` + `pendingCreatureDeaths` |
| CORPSE EATER | `corpseEater.ts:115` | ✓ |
| Archdemon / Kraken scans | `bossSkillsArchdemon.ts:68,126`, `bossSkillsKraken.ts:150,238` | ✓ `ehp <= 0` |
| Helga as a target (DORMANT) | `creatureAI.ts:1036` | ✓ `ehp === null` skips her. **DORMANT Helga is NOT a dead-target bug** |

### Three defects, reproduced (`t13_dead.test.ts`)
1. **THE FALLEN KEEP (his castle report). HIGH.** `enemyCastleMarchPos` iterates `world.players.keys()`
   with no `castleHp` filter. 3 seats, seat 1's keep at 0 HP, a seat-0 goblin beside it: the function
   returns seat 1's anchor (1790,130). After 1200 real ticks the goblin is **26 px from the fallen keep**,
   SEEKING, with the live keep (799 px away) **untouched at 2500**. `enemyCastleInReach` refuses to strike
   a fallen keep, so the unit walks there and mills forever. That is exactly what he saw.
2. **THE CORPSE-IN-WAITING. MEDIUM, and he now calls it a bug.** Under the S155 N1 deferral a creature
   killed earlier in the tick stays in the map with `ehp <= 0`. With one at 40 px and a live enemy at
   100 px, the acquire, the hold and the raw scan all return the corpse (`acquire → 11, hold → 11`). Perf
   measured this **604 / 2616 times** on its oracle runs (waves 1–3 / 1–5). The unit then enters ATTACKING
   on a body, freezes for the wind-up and loses a cadence. The castle guns and the Voltkin chain inherit
   the same hole through the chokepoint.
3. **AGED-OUT (DESPAWNING) CREATURES ARE STILL TARGETABLE. LOW, and the fix here is MINE.** No scan checks
   `state === 'DESPAWNING'`, so a Voltkin fading out at the end of its 20 s is still chased and struck for
   its 60 fade ticks. On screen that reads as "attacking a dead enemy". Including it in the predicate is
   optional, and the call is mine.

### ⚠ Owner question: "even dead tower"
When a tower's recipe breaks, its spawner/defender record goes. Its remaining shapes and connectors stay on
the board as ordinary enemy structure (only the lightning hub and the tier-9 ring raze themselves), and
R183-E fades them back in. Units keep attacking them. That is CONSISTENT with *"a building is killed
through its connectors"*, so it is **not** folded into the fix. **Ask him:** when a tower falls, should its
leftover shapes crumble away, stay as a target (today), or stay but be ignored? The same question applies
to an **eliminated seat's** standing base: today it is still a full target set.

### Fix shape: one liveness predicate, applied at acquisition AND hold
`isLiveCreatureTarget(world, c) = c.ehp > 0 && world.pendingCreatureDeaths?.has(c.id) !== true &&
!isUntargetable(c, world.tick)`, plus `&& c.state !== 'DESPAWNING'` if he wants defect 3 closed.
Apply it at: `findNearestEnemyCreatureFrom` (which covers castle guns, defenders, Voltkin and the master
acquire); perf's indexed loop (read LIVE: `ehp` changes mid-loop, and the per-seat list stays membership-only
so the perf fingerprint argument is untouched); the `pickNavUnit` hold; the `creatureLifecycle` ATTACKING
`stillValid`; the `voltkinChain` hop; and `defenderLifecycle.targetValid` for consistency.
Separately: `enemyCastleMarchPos` skips `isEliminated(player)` seats (`castleHp <= 0`) and returns null when
none are left.

- **Files:** `creatureAI.ts`, `creatureLifecycle.ts`, `voltkinChain.ts`, `defenderLifecycle.ts`,
  optionally `creature.ts` (home of the predicate). Perf fixtures: `navUnitReference.fixtures.ts`,
  `s191PerfOracle.fixtures.ts`, `navUnitIndex.*` docblocks.
- **R183-A holds:** "re-acquire normally" is unchanged. The re-acquire simply no longer picks a body.
- **Determinism:** `pendingCreatureDeaths` is host-tick scratch, identical in host and worker sims, so the
  predicate is pure.
- **Tests owed:** fallen-keep march (3 seats, real host tick, the unit ends nearer the LIVE keep and damages
  it); `pickNavUnit` acquire/hold skip a pending corpse; a castle gun skips a corpse; a Voltkin chain skips a
  corpse; mutants for each → RED; the perf differential re-pinned against the updated reference.
  ⚠ Every arm CHANGES TARGETING OUTPUTS. Canon §5's own rule applies: *"the reference fixture moves first"*.
- **Sequencing:** this MUST branch from post-perf `master`. Perf's own docblock argues *against* this exact
  filter in order to stay byte-identical, so landing it before perf would force perf to re-prove everything.
- **Protocol:** **NO BUMP.** Targeting is host-only and the client never runs these scans. (`tickGameState`,
  which the client does run, is not touched.)

---

## T15 — "At wave eight, the music and sound stopped for a few seconds" (research only)

### Ranked hypotheses
**H1 (top, MEASURED): every music track ends or starts in silence, and the loop plays straight through it.**
`playMusic` loops the whole decoded buffer (`source.loop = true`, `audioManager.ts:529`) with no
loopStart/loopEnd. ffmpeg `silencedetect` on the shipped files:

| track | length | silence at the loop seam (−35 dB) |
|---|---:|---|
| `blue-steppe-orbit.ogg` (default) | 384.97 s | **2.62 s** at the end (382.34 →) |
| demons | 261.69 s | **3.74 s** at the end |
| vampires | 279.81 s | 1.74 s end + 1.33 s start = **3.1 s** |
| orcs | 159.96 s | 2.03 s at the end |
| zombies | 208.77 s | 1.54 s at the end |
| nagas | 314.84 s | 1.50 s at the start |
| mummies | 307.37 s | **2.96 s in the middle** (39.4–42.4 s), plus short dips |

A wave is 150 s (BUILD 90 + FIGHT 60), so wave 8 runs 1050–1200 s. If the music starts at the PLAYING edge
and never restarts, the third default-track seam is at **1152–1155 s, 12 s into wave 8's FIGHT**. Demons
(1047 s) and zombies (1044 s) seam at the wave 7→8 edge; vampires (1119 s) and orcs (1120 s) seam in wave
8's BUILD. In BUILD almost no SFX play, so a music seam there is heard as total silence.
⚠ Caveats: the earlier seams (waves 3 and 6 for the default track) would also have played, and every Helga
engage/disengage restarts the base track from 0:00 (`startHelgaTheme`/`stopHelgaTheme`), which shifts the
seams. The wave-8 alignment is suggestive, not proof. The silence itself is proof.
Fix shape (audio, client-only): set `source.loopStart`/`loopEnd` to the trimmed non-silent region (measure
once, keep the numbers in `raceMusic.ts` beside the URLs), or trim the files. The mummies mid-track gap is
in the composition and needs his ear.

**H2: audio-thread overload, the one hypothesis that silences music AND SFX together.** There is no global
voice cap. Every BOND_FORMED plays a clave (one blueprint stamp forms many bonds in one tick), every Voltkin
chain link plays a crackle plus a 700 ms duck, every boom, charge, splat and zap builds its own graph. The
only cap is `MAX_GNAW_VOICES = 3` (`chewerRenderer.ts:91`). Panners are `equalpower`, which is cheap, so
this needs a big spike. A wave-8 fight with ~100+ creatures and racial deaths is the plausible place for one.

**H3: the AudioContext was suspended or interrupted** (output-device change, OS audio glitch, Bluetooth).
Nothing listens for `statechange`. The context only resumes inside the next `play*` call, so the silence
lasts "a few seconds" until the next SFX.

**H4: the NONET realm.** `enterNonetRealm` stops the duel track and lazy-loads a 1.2 MB theme, and during
the trial the board is frozen, so there are no SFX either. Total silence until the decode finishes. This
needs a 12-shape single-type component, and he would also have seen the trial.

**H5: Helga theme swaps.** Each engage stops the base track, then starts her 63 KB theme. The gap is
negligible after the first decode, but it restarts the base track from 0:00. This is H1's modifier, not a
cause.

Ruled out:
- A main-thread GC pause or decode: WebAudio renders off-thread, so already-playing music would continue.
- Ducking: depth 0.25, never 0.
- `MUSIC_BUFFER_CAP` eviction: only a track swap re-decodes, and nothing swaps at wave 8.
- A wave-8 trigger in the code: there is none. Win-score bands change at waves 6/11/16/21, drafts at 5/10.

### Reproduce in the browser (the pane cannot advance `world.tick`, so use these seams)
1. **H1, no sim needed:** a dev hook `__SPARK__.audio.seekMusic(sec)` that restarts `musicSource` with
   `start(0, sec)`, then `seekMusic(380)`. Add an `AnalyserNode` on `masterGain` that logs RMS every 100 ms
   into a ring buffer (`__SPARK__.audio.rmsLog()`). A below −50 dB window at 382–385 s proves the seam
   without anyone listening.
2. **H2:** `__SPARK__.audio.stress(n)` fires n procedural SFX per frame. Expose a live-node counter
   (increment on create, decrement on `onended`) in `inspectAudioChain()`. Find the n where the RMS log
   drops out. Chrome's `AudioContext.renderCapacity` gives the load directly where it exists.
3. **H3:** log `audioContext.onstatechange` with timestamps into the same ring buffer. One suspended →
   running pair at the dropout settles it.
4. In a real playtest, `?debug=1` already shows `inspectAudioChain()` (`debugOverlay.ts:109`). Adding the
   three fields above makes the owner's next "it went silent" self-diagnosing.

- **Files:** `src/render/audioManager.ts`, `src/render/raceMusic.ts`, optionally the `.ogg` assets.
- **Protocol:** **NO BUMP.** Client-only presentation.

---

## T16 — "I had five TVs, full health, but no new Voltkins each new wave"

"TV" is the **Voltkin tower**: the 4-Square + 4-Triangle chain the Voltkin climbs out of
(`voltkinTowerRenderer.ts`, `findAllVoltkinChains`, S175 P4 *"the TV becomes a built structure"*). It is a
CINEMATIC recipe (`VOLTKIN_RECIPE`, `godlyRecipes/voltkin.ts:376`), **not** a spawner. It has no live
count, no per-tower cap, no stock and no 20 s clock of its own. The 20 s is the Voltkin's own
`lifetimeTicks: 1200` on the `'fight'` clock (`voltkin-config.ts:392`).

### How a Voltkin is born today: ONE per ignition, and only on a topology change
`runGodlyMatcherCore` fires only on a `BOND_FORMED` (or a player sever) whose position touches the chain
(`voltkinPredicate`, AUTO_BOND_RADIUS proximity, plus strict isolation). It schedules the single-slot
`pendingCreatureSpawn` 900 ms out, and `SPAWN_CREATURE` mints the Voltkin (the voltkin type is exempt from
the one-per-owner latch, `creatureLifecycle.ts:235`). He lives 20 s of the next FIGHT and fades.
**Nothing re-summons him.** The only "regeneration" he could ever have seen is a FIX/REPAIR of a damaged
TV, because `structureRepair.ts:521` emits `BOND_FORMED` at the stamp centre and the predicate re-fires.
That explains *"I had to rebuild the Voltkin tower"* and *"full health, but no new Voltkins"*: a healthy
TV has nothing to repair, so nothing forms and nothing fires.

### Defect A: ignitions during another Voltkin's emerge window are DROPPED (his "not more than two")
`godlyMatcherCore.ts:78`: `if (world.activeCinematicPlayerId !== null) return null;`. While any Voltkin is
"emerging" (900 ms in direct mode via `cutsceneOverlay`'s silent timer, `godlyOrchestration.ts:205`;
**4.8 s** in worker mode, `godlyMatcherCore.ts:509`), the matcher looks at nothing. `world.effects` is wiped
every frame (`effectsRenderer.ts:98`), so a TV closed in that window loses its `BOND_FORMED` for good and
never summons. Five TVs stamped in quick succession produce one or two Voltkins.

### Defect B, adjacent and found while reading: the direct-mode queue latch
`startCinematicIfNeeded` (`godlyOrchestration.ts:125`) bails when `owner === state.lastCinematicOwner`.
`onComplete` (`:207`) dispatches COMPLETE and then the queued TRIGGER in the SAME callback, so a queued
event from the SAME seat is never observed as a transition. It never plays and never completes, and
`activeCinematicPlayerId` stays set **for the rest of the match**. The worker path fixed exactly this
(`godlyMatcherCore.ts:534`, `cs.lastOwner = null`). Direct mode never did.
Reproduced (`t16_latch.test.ts`): two same-seat triggers → 1 play; after completion,
`activeCinematicPlayerId` stays **0** forever.
Reachability today: the host never queues (Defect A drops instead). A **joiner** queues whenever two host
`GODLY_TRIGGER` messages land inside its own 900 ms timer, and network jitter makes that plausible. The
joiner's mirror then latches, and `castlePanel` reads that as **"LOCKED" on its build cards for the rest of
the match**. ⚠ **Any fix for A that queues instead of dropping makes this reachable on the HOST, where it
would stop every later Voltkin for everyone. Fix B in the same commit.**
⚠ Also: worker mode still schedules the spawn 4.8 s out (`godlyMatcherCore.ts:509-516`), while S175 P4b
cut direct mode to 900 ms. Worker mode is opt-in (`WORKER_DEFAULT_ON = false`), so this is latent, but the
two modes disagree.

### Repro (`t16_voltkin.test.ts`): real stamps, real matcher, tick-domain cinematic, real host tick, effects wiped per frame
TV A, TV B 31 ticks later, TV C 400 ticks later → **3 TVs standing, 2 Voltkins** (B lost to Defect A).
Through the FIGHT (both expire at 20 s) and into the next BUILD: 1200 ticks in, **3 TVs standing, 0
Voltkins**, and 2 s into the next FIGHT, still 0.

### Fix shape
1. **The missing rule: one Voltkin per standing TV, every wave.** This is the R190-J analogue
   (*"Every fight she should come back as long as the tower is still up"*). At the FIGHT→BUILD edge, beside
   `reviveDormantHelgas` (`hostTick.ts:482`), add `resummonVoltkins(world)`: enumerate standing TVs, decide
   each one's owner exactly as the predicate does (majority `placerColor` → seat, lowest seat on a tie),
   and for each owner spawn `TVs − live Voltkins` through `SPAWN_CREATURE` at the TV centroids, in a
   deterministic order. A Voltkin born in BUILD anchors his 20 s to the next FIGHT's start (the S155
   one-step clock), which matches *"each new wave"*.
   ⚠ MINE: the edge (FIGHT→BUILD, like Helga, so he is visible all BUILD) and "one per TV".
   ⚠ Determinism hazard: `findAllVoltkinChains` walks `Map`/`Set` order (the S189 weld note: an exotic
   lattice with two valid 8-paths). Sort the candidate start ids and de-duplicate by member set, or the
   host and a restored worker mirror can count differently.
   ⚠ A welded TV still counts (`findAllVoltkinChains` has no isolation test), which is the R190-J parity.
   Ignition keeps the strict S48 P4 isolation.
2. **Defect A:** stop dropping matches. Either let the matcher dispatch while a cinematic is active (the
   reducer already queues into `pendingCinematics`), with B fixed alongside, or pull the Voltkin summon out
   of the single cinematic slot. The first is the smaller change.
3. **Defect B:** in `onComplete`, set `state.lastCinematicOwner = null` before the queued dispatch, which
   mirrors the worker path.

- **Files:** `src/state/hostTick.ts` (the edge), `src/state/godlyRecipes/voltkin.ts` (or a new
  `voltkinTv.ts`), `src/state/godlyMatcherCore.ts`, `src/state/godlyOrchestration.ts`.
- **Tests owed:**
  - the repro above inverted: 3 TVs → 3 Voltkins, and each next BUILD 3 again, through the host tick;
  - a TV that fell gives no Voltkin;
  - a live Voltkin is not doubled;
  - two TVs closed 31 ticks apart both summon;
  - the direct-mode latch test above (queued same-owner event plays and completes);
  - a determinism test with a shuffled insertion order and the same count;
  - mutants for each → RED.
- **s191/owner:** **does not touch this.** Its stock change is to `CHEWER_CONFIG` and
  `LIGHTNING_DRONE_CONFIG` (persistent, match-length) plus the drone fly-home in `hostTick`'s drone arm.
  Its own note says *"the Voltkin remains the only type on the 'fight' clock"*. No `spawnerLifecycle` change
  there reaches the Voltkin, which has no spawner. The overlap is file-level only (`hostTick.ts`,
  `voltkin-config.ts`).
- **Protocol:** **NO BUMP.** The matcher and the edge are host-only (`runGodlyMatcherCore` returns early for
  a client), the minted creature is an existing type, and `activeCinematicPlayerId` is not on the wire.

---

## FILE-OVERLAP TABLE (decides the worktree split)

In-flight branch src files (non-test), from `git diff --name-only master...<branch>`. ✱ = touches the file.

| fix | files it touches | perf | owner | weld | carry | endstats |
|---|---|:-:|:-:|:-:|:-:|:-:|
| **T5** Helga BUILD patrol | `defenders/defenderLifecycle.ts` | | | ✱ (`applyRegisterDefender`, `reviveDormantHelgas` :593) | | ✱ (`applyRegisterDefender` :90) |
| | `hostTick.ts` (defender loop ~:1434) | | ✱ | | ✱ | ✱ |
| **T6** chase give-up | `creatures/creatureAI.ts` (`pickNavUnit` + indexed scan) | ✱ **(rewrites this exact function)** | | | ✱ (`findNearestBondTarget` :351, bond buckets :593) | |
| | `creatures/voltkin-config.ts` or `stats.ts` (non-combatant set) | | ✱ (`voltkin-config.ts`: chewer/drone configs) | | | |
| | `constants.ts` (2 MINE consts) | | ✱ | | ✱ | |
| | `defenders/defenderLifecycle.ts` (Helga acquire, optional) | | | ✱ | | ✱ |
| | perf fixtures `navUnitReference.fixtures.ts`, `s191PerfOracle.fixtures.ts` | ✱ (they exist only on perf) | | | | |
| **T13** liveness + fallen keep | `creatures/creatureAI.ts` (chokepoint, hold, `enemyCastleMarchPos`) | ✱ | | | ✱ | |
| | `creatures/creatureLifecycle.ts` (ATTACKING stillValid :1071) | | | | | ✱ (spawn-path hunks :276/:300/:366, disjoint) |
| | `creatures/voltkinChain.ts` (hop :108) | | | | ✱ (sever loop :258, disjoint) | |
| | `defenders/defenderLifecycle.ts` (`targetValid`) | | | ✱ | | ✱ |
| | perf fixtures (re-pin) | ✱ | | | | |
| **T15** audio loop seams (+ debug seams) | `render/audioManager.ts`, `render/raceMusic.ts`, `.ogg` assets | | | | | |
| **T16** per-wave Voltkin + matcher drop + latch | `hostTick.ts` (FIGHT→BUILD edge ~:482) | | ✱ (same edge block, `clearScorchedEarthAtBuild` :551) | | ✱ | ✱ (:450 edge) |
| | `godlyRecipes/voltkin.ts` / new `voltkinTv.ts` | | | | | |
| | `godlyMatcherCore.ts`, `godlyOrchestration.ts` | | | | | |

### What the table says
- **T6 and T13 share `creatureAI.ts`, sit on top of perf's rewrite, and both re-pin perf's reference
  fixtures. Put them in ONE worktree, branched from `master` AFTER perf merges.** Two branches re-pinning
  the same verbatim fixture is guaranteed conflict. Carry's `creatureAI.ts` hunks (bond targeting) are
  textually disjoint but in the same file, so merge carry first or rebase.
- **T5** touches `defenderLifecycle.ts`, which weld AND endstats both edit. The hunks are disjoint
  (register / revive vs the IDLE arm), but the file is three-way. Land it after weld and endstats, or keep
  it in the T6/T13 worktree, which already owns the Helga acquire in `defenderLifecycle.ts`. ⭐ That is the
  recommended split: **one "units-ai" worktree = T5 + T6 + T13**, post-perf.
- **T16** is nearly disjoint: the godly matcher files are touched by nobody. Its only shared site is the
  FIGHT→BUILD edge block in `hostTick.ts`, which owner, carry and endstats also edit (different lines).
  **Own worktree**, merged after owner, with the merge owner re-running the edge-ordering tests.
- **T15** touches no sim file and no in-flight branch. **Own worktree, any time**, with the audio seams
  first so the owner's next playtest is self-diagnosing.
- No item earns a protocol bump on its own. Each would ride whatever bump the merged train already takes.

## OPEN QUESTIONS FOR THE OWNER (do not guess)
1. T13: a tower that has FALLEN. Should its leftover shapes crumble away, stay a target (today), or stay
   but be ignored? The same question for an eliminated seat's still-standing base.
2. T6: does *"if it's quicker than them"* include an archer that kites? If yes, that reverses R184-A and
   he must re-rule it. The options above assume no.
3. T16: does the TV's Voltkin come back at the start of BUILD (visible all BUILD, the Helga timing, MINE)
   or as the FIGHT opens? Is it one per TV?
4. T13 defect 3: should a creature fading out of old age be untargetable for its last second? (MINE)
